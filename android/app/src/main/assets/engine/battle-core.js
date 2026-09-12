"use strict";

/* 降妖记小游戏纯逻辑核心：关卡构建、波次出题、词球组卷、命中判定、结算与精灵解析。
 * 无 DOM / 无存储 / 无网络；浏览器网关见 battle.js，关卡数据由
 * prj/tools/build_game_levels.py 从 dialogue_stories 派生（content/game/levels）。
 */
(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BookPlayBattleCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function battleCoreFactory() {
  const WALKER_GIF_BASE = "assets/generated/jttw-player-walkers/";
  const COMBO_TRIGGER = 3;

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function next() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + 0x7e268b2f + (t << 4)) | 0;
      t = (t ^ (t >>> 15)) >>> 0;
      t = Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seededShuffle(list, rng) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  function normalizedWords(raw) {
    const words = [];
    const seen = new Set();
    const rows = Array.isArray(raw) ? raw : [];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const term = String(row.term || "").trim();
      const zh = String(row.zh || "").trim();
      if (!term || !zh) continue;
      const key = term.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      words.push({ term, zh, ipa: String(row.ipa || ""), illustration: row.illustration || null });
    }
    return words;
  }

  function normalizeNpcDialogue(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const out = {};
    ["intro", "quiz"].forEach((role) => {
      const section = raw[role];
      if (!section || typeof section !== "object" || Array.isArray(section)) return;
      const lines = [];
      (Array.isArray(section.lines) ? section.lines : []).forEach((line, index) => {
        if (!line || typeof line !== "object") return;
        const textEn = String(line.textEn ?? line.text_en ?? "").trim();
        const textZh = String(line.textZh ?? line.text_zh ?? "").trim();
        if (!textEn && !textZh) return;
        const item = {
          id: String(line.id || `${role}-${index + 1}`),
          sourceNodeId: String(line.sourceNodeId ?? line.source_node_id ?? ""),
          speaker: String(line.speaker || "narrator"),
          textEn,
          textZh,
          audioRef: String(line.audioRef ?? line.audio_ref ?? ""),
        };
        if (line.audioStart != null || line.audio_start != null) {
          const value = Number(line.audioStart ?? line.audio_start);
          if (Number.isFinite(value)) item.audioStart = value;
        }
        if (line.audioEnd != null || line.audio_end != null) {
          const value = Number(line.audioEnd ?? line.audio_end);
          if (Number.isFinite(value)) item.audioEnd = value;
        }
        lines.push(item);
      });
      const sectionOut = {
        id: String(section.id || `${role}-dialogue`),
        lines,
      };
      if (section.word && typeof section.word === "object") {
        const term = String(section.word.term || "").trim();
        const zh = String(section.word.zh || "").trim();
        if (term && zh) sectionOut.word = { term, zh, ipa: String(section.word.ipa || "") };
      }
      if (section.question && typeof section.question === "object") {
        sectionOut.question = {
          id: String(section.question.id || `${role}-question`),
          textEn: String(section.question.textEn ?? section.question.text_en ?? ""),
          textZh: String(section.question.textZh ?? section.question.text_zh ?? ""),
        };
      }
      if (Array.isArray(section.options)) {
        const options = [];
        section.options.forEach((opt, optIndex) => {
          if (!opt || typeof opt !== "object") return;
          const textEn = String(opt.textEn ?? opt.text_en ?? opt.en ?? "").trim();
          const textZh = String(opt.textZh ?? opt.text_zh ?? opt.zh ?? "").trim();
          if (!textEn && !textZh) return;
          options.push({
            id: String(opt.id || `opt-${optIndex + 1}`),
            textEn,
            textZh,
            correct: Boolean(opt.correct),
            feedback: String(opt.feedback || opt.feedbackZh || ""),
          });
        });
        if (options.length) sectionOut.options = options;
      }
      if (section.lessonCardId) sectionOut.lessonCardId = String(section.lessonCardId);
      if (lines.length || sectionOut.word || sectionOut.question || sectionOut.options) out[role] = sectionOut;
    });
    return Object.keys(out).length ? out : null;
  }

  function buildLevel(raw, options) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const wavesRaw = Array.isArray(raw.waves) ? raw.waves : [];
    const bossRaw = raw.boss && typeof raw.boss === "object" ? raw.boss : null;
    if (!wavesRaw.length || !bossRaw || !Array.isArray(bossRaw.hpWords) || !bossRaw.hpWords.length) {
      return null;
    }

    const castRaw = raw.cast && typeof raw.cast === "object" ? raw.cast : {};
    const spriteIds = [];
    const pushSprite = (id) => {
      if (id && !spriteIds.includes(id)) spriteIds.push(id);
    };
    pushSprite(castRaw.hero && castRaw.hero.id);
    pushSprite(castRaw.boss && castRaw.boss.sprite);
    (Array.isArray(castRaw.minors) ? castRaw.minors : []).forEach((m) => pushSprite(m && m.sprite));

    const waves = [];
    wavesRaw.forEach((wave, waveIndex) => {
      const monsters = [];
      (Array.isArray(wave && wave.monsters) ? wave.monsters : []).forEach((m, i) => {
        if (!m || !m.term || !m.zh) return;
        const sprite = m.sprite || null;
        pushSprite(sprite);
        monsters.push({ term: String(m.term), zh: String(m.zh), sprite, key: `w${waveIndex}-${i}` });
      });
      if (monsters.length) waves.push({ monsters });
    });

    const bossWords = normalizedWords(bossRaw.hpWords).map((w, i) => ({
      term: w.term,
      zh: w.zh,
      key: `boss-${i}`,
    }));
    if (!waves.length || !bossWords.length) return null;

    const wordIndex = {};
    normalizedWords(raw.previewWords).forEach((w) => {
      wordIndex[w.term.toLowerCase()] = w.zh;
    });
    waves.forEach((wave) => wave.monsters.forEach((m) => {
      wordIndex[m.term.toLowerCase()] = m.zh;
    }));
    bossWords.forEach((w) => {
      wordIndex[w.term.toLowerCase()] = w.zh;
    });

    const intro = [];
    (Array.isArray(raw.intro) ? raw.intro : []).forEach((item) => {
      if (!item || !item.textEn || intro.length >= 3) return;
      intro.push({
        speaker: String(item.speaker || "narrator"),
        textEn: String(item.textEn),
        textZh: String(item.textZh || ""),
        illustration: item.illustration || null,
      });
    });

    return {
      schemaVersion: Number(raw.schema_version) || 1,
      ep: Number(raw.ep) || 0,
      title: raw.title && typeof raw.title === "object" ? raw.title : { en: "", zh: "" },
      collection: String(raw.collection || ""),
      cast: {
        hero: castRaw.hero || { id: "wukong", nameZh: "孙悟空" },
        boss: {
          id: String(castRaw.boss && castRaw.boss.id || "imp"),
          nameZh: String(castRaw.boss && castRaw.boss.nameZh || "小妖"),
          mode: String(castRaw.boss && castRaw.boss.mode || "villain"),
          sprite: castRaw.boss && castRaw.boss.sprite || null,
        },
        minors: (Array.isArray(castRaw.minors) ? castRaw.minors : []).filter((m) => m && m.id),
      },
      background: raw.background && typeof raw.background === "object" ? raw.background : {},
      intro,
      previewWords: normalizedWords(raw.previewWords),
      waves,
      boss: {
        hpWords: bossWords,
        taunts: (Array.isArray(bossRaw.taunts) ? bossRaw.taunts : []).map(String),
      },
      npcDialogue: normalizeNpcDialogue(raw.npcDialogue),
      quizUrl: String(raw.quizUrl || ""),
      map: raw.map && typeof raw.map === "object" ? raw.map : null,
      pickup: raw.pickup && typeof raw.pickup === "object" ? raw.pickup : null,
      wordIndex,
      spriteIds,
      seedBase: ((Number(raw.ep) || 1) * 1000 + 7) | 0,
      options: options || {},
    };
  }

  function buildWaveQuestions(level, waveIndex, wrongWords) {
    const wave = level && Array.isArray(level.waves) ? level.waves[waveIndex] : null;
    if (!wave) return [];
    const wrongSet = new Set();
    Object.entries(wrongWords || {}).forEach(([term, count]) => {
      if (count > 0) wrongSet.add(String(term).toLowerCase());
    });
    const prioritized = [];
    const rest = [];
    wave.monsters.forEach((m) => {
      (wrongSet.has(m.term.toLowerCase()) ? prioritized : rest).push(m);
    });
    return prioritized.concat(rest);
  }

  function reorderBossWords(level, wrongWords) {
    const hpWords = level && level.boss && Array.isArray(level.boss.hpWords) ? level.boss.hpWords : [];
    const wrongEntries = Object.entries(wrongWords || {})
      .map(([term, count], order) => ({ term: String(term).toLowerCase(), count: Number(count) || 0, order }))
      .filter((entry) => entry.count > 0);
    const wrongSet = new Set(wrongEntries.map((entry) => entry.term));
    const prioritized = [];
    const rest = [];
    hpWords.forEach((word) => {
      (wrongSet.has(String(word.term).toLowerCase()) ? prioritized : rest).push(word);
    });

    // Map mistakes that are not in the authored Boss pool still need a Boss
    // review slot. Prefer the most recently encountered map wave before the
    // canonical Boss pool, then keep earlier-wave mistakes after it so the
    // authored four-word rhythm remains recognizable.
    const waveCandidates = new Map();
    const waves = level && Array.isArray(level.waves) ? level.waves : [];
    waves.forEach((wave, waveIndex) => {
      (Array.isArray(wave && wave.monsters) ? wave.monsters : []).forEach((monster, monsterIndex) => {
        const key = String(monster && monster.term || "").toLowerCase();
        if (!key || !wrongSet.has(key) || waveCandidates.has(key)) return;
        waveCandidates.set(key, { term: String(monster.term), zh: String(monster.zh), waveIndex, monsterIndex });
      });
    });
    const bossSet = new Set(hpWords.map((word) => String(word.term).toLowerCase()));
    const extras = wrongEntries
      .map((entry) => waveCandidates.get(entry.term))
      .filter((candidate) => candidate && !bossSet.has(candidate.term.toLowerCase()))
      .sort((a, b) => b.waveIndex - a.waveIndex || a.monsterIndex - b.monsterIndex || a.term.localeCompare(b.term));
    const lastWave = waves.length ? waves.length - 1 : 0;
    const lateExtras = extras.filter((candidate) => candidate.waveIndex === lastWave)
      .map((candidate, index) => ({ term: candidate.term, zh: candidate.zh, key: `map-${candidate.waveIndex}-${candidate.monsterIndex}-${index}` }));
    const earlyExtras = extras.filter((candidate) => candidate.waveIndex !== lastWave)
      .map((candidate, index) => ({ term: candidate.term, zh: candidate.zh, key: `map-${candidate.waveIndex}-${candidate.monsterIndex}-${index}` }));
    return prioritized.concat(lateExtras, rest, earlyExtras);
  }

  function buildOrbSet(question, allWords, seed) {
    const correctZh = String(question && question.zh || "").trim();
    if (!correctZh) return { correct: "", orbs: [] };
    const seen = new Set([correctZh.toLowerCase()]);
    const distractors = [];
    (Array.isArray(allWords) ? allWords : []).forEach((word) => {
      const zh = String(word && word.zh || "").trim();
      const key = zh.toLowerCase();
      if (!zh || seen.has(key)) return;
      seen.add(key);
      distractors.push({ zh, dist: Math.abs(zh.length - correctZh.length) });
    });
    distractors.sort((a, b) => a.dist - b.dist || (a.zh < b.zh ? -1 : 1));
    const orbs = [{ zh: correctZh, correct: true }];
    distractors.slice(0, 2).forEach((d) => orbs.push({ zh: d.zh, correct: false }));
    return { correct: correctZh, orbs: seededShuffle(orbs, mulberry32(seed >>> 0)) };
  }

  function lettersOnly(term) {
    return String(term || "").replace(/[^a-zA-Z]/g, "");
  }

  function officialQuiz(level) {
    const quiz = level && level.npcDialogue && level.npcDialogue.quiz;
    if (!quiz || typeof quiz !== "object") return null;
    const raw = Array.isArray(quiz.options) ? quiz.options : [];
    const options = [];
    raw.forEach((opt) => {
      if (!opt || typeof opt !== "object") return;
      const zh = String(opt.textZh || opt.text || "").trim();
      const en = String(opt.textEn || opt.text || "").trim();
      if (!zh && !en) return;
      options.push({
        zh: zh || en,
        en: en || zh,
        correct: opt.correct === true || opt.isCorrect === true,
      });
    });
    if (!options.length || !options.some((opt) => opt.correct)) return null;
    const question = quiz.question && typeof quiz.question === "object" ? quiz.question : {};
    return {
      promptEn: String(question.textEn || question.en || ""),
      promptZh: String(question.textZh || question.zh || ""),
      options,
    };
  }

  function pickBossRoundKind(index, flags) {
    const cycle = ["en-choice", "zh-choice", "listen-choice", "typing"];
    const i = Math.abs(Number(index) || 0);
    let kind = cycle[i % cycle.length];
    const prefer = flags && flags.preferQuestion;
    if (prefer && (flags.lastSlot || Number(flags.hpRatio) <= 0.34)) {
      if (prefer === "official") kind = flags.hasOfficial ? "official" : "zh-choice";
      else if (cycle.indexOf(prefer) >= 0) kind = prefer;
    } else if (flags && flags.hasOfficial && flags.lastSlot) {
      kind = "official";
    }
    if (kind === "typing" && !(flags && flags.canType)) kind = "en-choice";
    // 无 TTS 环境听音轮不可玩（本地预览/离线包），降级为看词选义
    if (kind === "listen-choice" && !(flags && flags.canListen)) kind = "en-choice";
    if (kind === "official" && !(flags && flags.hasOfficial)) kind = "zh-choice";
    if (kind === "listen-choice" && flags && flags.listen === false) kind = "zh-choice";
    return kind;
  }

  function wordPool(level) {
    const out = [];
    const seen = new Set();
    const push = (term, zh) => {
      const t = String(term || "").trim();
      const z = String(zh || "").trim();
      if (!t || !z) return;
      const key = t.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ term: t, zh: z });
    };
    (level && Array.isArray(level.previewWords) ? level.previewWords : []).forEach((w) => push(w.term, w.zh));
    const hp = level && level.boss && Array.isArray(level.boss.hpWords) ? level.boss.hpWords : [];
    hp.forEach((w) => push(w.term, w.zh));
    (level && Array.isArray(level.waves) ? level.waves : []).forEach((wave) => {
      (wave && Array.isArray(wave.monsters) ? wave.monsters : []).forEach((m) => push(m && m.term, m && m.zh));
    });
    return out;
  }

  function buildBossRound(level, hpWord, index, extras) {
    extras = extras && typeof extras === "object" ? extras : {};
    const word = hpWord && typeof hpWord === "object" ? hpWord : {};
    const official = officialQuiz(level);
    const canType = lettersOnly(word.term).length >= 2 && extras.canType !== false;
    const kind = pickBossRoundKind(index, {
      preferQuestion: extras.preferQuestion,
      lastSlot: extras.lastSlot,
      hpRatio: extras.hpRatio,
      hasOfficial: Boolean(official),
      canType,
      listen: extras.listen,
      canListen: extras.canListen !== false,
    });
    const seed = (Number(extras.seed) || ((Number(index) || 0) + 1) * 17) >>> 0;
    const pool = wordPool(level);
    if (kind === "en-choice") {
      const set = buildOrbSet({ zh: word.term }, pool.map((w) => ({ zh: w.term })), seed);
      return {
        kind, playTerm: word.term, answerZh: word.term, orbs: set.orbs,
        promptKicker: "ENGLISH CHOICE", promptMain: word.zh || word.term,
        promptSub: "点出对应的英文，答对就出招",
      };
    }
    if (kind === "zh-choice") {
      const set = buildOrbSet({ zh: word.zh }, pool.map((w) => ({ zh: w.zh })), seed);
      return {
        kind, playTerm: word.term, answerZh: word.zh, orbs: set.orbs,
        promptKicker: "CHINESE CHOICE", promptMain: word.term || word.zh,
        promptSub: "点出对应的中文，答对就出招",
      };
    }
    if (kind === "listen-choice") {
      const set = buildOrbSet({ zh: word.zh }, pool.map((w) => ({ zh: w.zh })), seed);
      return {
        kind, playTerm: word.term, answerZh: word.zh, orbs: set.orbs, listen: true,
        promptKicker: "LISTEN", promptMain: "听一听",
        promptSub: "点出你听到的中文意思",
      };
    }
    if (kind === "typing") {
      const goal = lettersOnly(word.term);
      return {
        kind, playTerm: word.term, answerZh: goal, orbs: [], typingTarget: goal, timeoutMs: 12000,
        promptKicker: "TYPE", promptMain: word.zh || word.term,
        promptSub: "跟打英文，限时 12 秒",
      };
    }
    const orbs = official.options.map((opt) => ({ zh: opt.zh || opt.en, correct: Boolean(opt.correct) }));
    const hit = orbs.find((opt) => opt.correct);
    return {
      kind: "official", playTerm: word.term, answerZh: hit ? hit.zh : word.zh,
      orbs: seededShuffle(orbs, mulberry32(seed)),
      promptKicker: "QUIZ",
      promptMain: official.promptEn || official.promptZh || word.zh,
      promptSub: official.promptEn && official.promptZh ? official.promptZh : "选对本集原题",
    };
  }

  function judgeHit(orb, monster, comboState) {
    const state = comboState && typeof comboState === "object" ? comboState : { streak: 0 };
    const correct = Boolean(orb && monster && orb.zh === monster.zh);
    if (correct) {
      state.streak = (state.streak || 0) + 1;
    } else {
      state.streak = 0;
    }
    return { correct, combo: state.streak, comboReady: correct && state.streak > 0 && state.streak % COMBO_TRIGGER === 0 };
  }

  function resolveBossKit(kits, bossId) {
    const pack = kits && typeof kits === "object" ? kits : {};
    const hero = pack.hero && typeof pack.hero === "object" ? pack.hero : {
      id: "wukong",
      nameZh: "孙悟空",
      hpSlots: 3,
      skills: {
        attack: { id: "staff", nameZh: "金箍棒" },
        special: { id: "staff-combo", nameZh: "棒影连击", needCombo: 3 },
        defend: { id: "aura", nameZh: "护体金光", usesPerBattle: 1 },
      },
    };
    const bosses = pack.bosses && typeof pack.bosses === "object" ? pack.bosses : {};
    const id = String(bossId || "");
    const boss = bosses[id] && typeof bosses[id] === "object" ? bosses[id] : {
      nameZh: "妖怪",
      attack: { id: "strike", nameZh: "扑打" },
      special: { id: "rage", nameZh: "狂攻" },
      defend: { id: "guard", nameZh: "抵挡" },
    };
    return { hero, boss, genericFx: pack.genericFx && typeof pack.genericFx === "object" ? pack.genericFx : {} };
  }

  function pickHeroSkill(kit, comboState) {
    const skills = kit && kit.hero && kit.hero.skills ? kit.hero.skills : {};
    const special = skills.special;
    const need = Math.max(1, Number(special && special.needCombo) || COMBO_TRIGGER);
    const streak = Number(comboState && comboState.streak) || 0;
    if (special && streak > 0 && streak % need === 0) return special;
    return skills.attack || { id: "staff", nameZh: "金箍棒" };
  }

  const GENERIC_FX = {
    hitPlayer: "assets/game-fx/generic/hit-player.png",
    hitBoss: "assets/game-fx/generic/hit-boss.png",
  };

  function resolveSkillFx(skill, side, genericFx) {
    const pack = genericFx && typeof genericFx === "object" ? genericFx : {};
    const primary = skill && skill.fx ? String(skill.fx) : "";
    const fallback = side === "hero"
      ? (pack.hitBoss || GENERIC_FX.hitBoss)
      : (pack.hitPlayer || GENERIC_FX.hitPlayer);
    const out = [];
    if (primary) out.push(primary);
    if (fallback && fallback !== primary) out.push(fallback);
    return out;
  }

  function pickBossSkill(kit, status) {
    const boss = kit && kit.boss ? kit.boss : {};
    const shieldLeft = Number(status && status.shieldLeft);
    const hpRatio = Number(status && status.hpRatio);
    if ((Number.isFinite(shieldLeft) && shieldLeft <= 1) || (Number.isFinite(hpRatio) && hpRatio <= 0.34)) {
      return boss.special || boss.attack || { id: "strike", nameZh: "扑打" };
    }
    return boss.attack || { id: "strike", nameZh: "扑打" };
  }

  function applyDefend(run) {
    const defendLeft = Math.max(0, Number(run && run.defendLeft) || 0);
    const defendArmed = Boolean(run && run.defendArmed);
    if (defendArmed || defendLeft <= 0) {
      return { ok: false, defendLeft, defendArmed };
    }
    return { ok: true, defendLeft: defendLeft - 1, defendArmed: true };
  }

  function applyIncomingHit(run) {
    const shield = Math.max(0, Math.min(3, Number(run && run.shield) || 0));
    if (run && run.defendArmed) {
      return { blocked: true, shield, defendArmed: false };
    }
    return { blocked: false, shield: Math.max(0, shield - 1), defendArmed: false };
  }

  function settleRun(runState) {
    const state = runState && typeof runState === "object" ? runState : {};
    const cleared = Boolean(state.cleared);
    const shieldLeft = Math.max(0, Math.min(3, Number(state.shieldLeft) || 0));
    const quizPassed = Boolean(state.quizPassed);
    const wrongWords = state.wrongWords && typeof state.wrongWords === "object" ? state.wrongWords : {};
    let stars = 0;
    if (cleared) {
      stars = 1;
      if (shieldLeft >= 2 || quizPassed) stars = 2;
      if (shieldLeft === 3 && quizPassed) stars = 3;
    }
    return { stars, cleared, shieldLeft, quizPassed, wrongWords };
  }

  function walkerGifPath(id) {
    return `${WALKER_GIF_BASE}${id}/${id}-walk.gif`;
  }

  function loadSprites(registry, spriteIds) {
    const table = registry && typeof registry === "object"
      ? (registry.sprites && typeof registry.sprites === "object" ? registry.sprites : registry)
      : null;
    const out = {};
    (Array.isArray(spriteIds) ? spriteIds : []).forEach((id) => {
      if (!id) return;
      const entry = table ? table[id] : undefined;
      if (entry && typeof entry === "object") {
        out[id] = entry;
      } else if (!table) {
        out[id] = { gif: walkerGifPath(id), source: "walker-fallback" };
      } else {
        out[id] = null;
      }
    });
    return out;
  }

  return {
    buildLevel,
    buildWaveQuestions,
    reorderBossWords,
    buildOrbSet,
    lettersOnly,
    officialQuiz,
    pickBossRoundKind,
    buildBossRound,
    judgeHit,
    resolveBossKit,
    pickHeroSkill,
    pickBossSkill,
    resolveSkillFx,
    applyDefend,
    applyIncomingHit,
    settleRun,
    loadSprites,
  };
});
