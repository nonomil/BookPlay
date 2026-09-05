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
      quizUrl: String(raw.quizUrl || ""),
      map: raw.map && typeof raw.map === "object" ? raw.map : null,
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
    const wrongSet = new Set();
    Object.entries(wrongWords || {}).forEach(([term, count]) => {
      if (count > 0) wrongSet.add(String(term).toLowerCase());
    });
    const prioritized = [];
    const rest = [];
    hpWords.forEach((word) => {
      (wrongSet.has(String(word.term).toLowerCase()) ? prioritized : rest).push(word);
    });
    return prioritized.concat(rest);
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
    judgeHit,
    settleRun,
    loadSprites,
  };
});
