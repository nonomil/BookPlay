"use strict";

/* 西游包1纯逻辑：A 任务卡壳 + B 选词降妖核。
 * 无 DOM / 无存储 / 无网络。浏览器网关见 xiyou-pack1.js。
 * 进度只通过调用方写入 bookplay_battle_* / bookplay_weak_v1。
 */
(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BookPlayXiyouPack1Core = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function pack1CoreFactory() {
  const PLAY_FIRST_EXPERIMENT = false;
  const DEFAULT_LIVES = 3;
  const HITS_TO_CAPTURE = 2;
  const MINION_COUNT = 4;
  const BOSS_ROUNDS = 3;
  const MISS_FLOATS = Object.freeze(["棒偏了", "咒偏了"]);
  const HIT_FLOATS = Object.freeze(["击退！", "收！"]);
  const FORBIDDEN_MISS = "词不对";
  const ALLOWED_PROGRESS_KEYS = Object.freeze([
    "bookplay_battle_progress_v1",
    "bookplay_battle_collection_v1",
    "bookplay_weak_v1",
    "bookplay_dex_v1",
  ]);

  function asParams(search) {
    if (search && typeof search.get === "function") return search;
    try {
      return new URLSearchParams(String(search || ""));
    } catch (_) {
      return new URLSearchParams("");
    }
  }

  function isDefaultPath(ep, search) {
    const params = asParams(search);
    if (params.get("legacy") === "1") return false;
    if (params.get("play") === "tag-shoot") return false;
    if (params.get("mode") === "map") return false;
    return Number(ep) === 1 || params.get("pack") === "1";
  }

  function questCard(ep) {
    void ep;
    return {
      ep: 1,
      placeZh: "花果山",
      verbZh: "救猴群",
      verbEn: "Save the monkeys",
      title: "救猴群 · Save the monkeys",
      story: "悟空回到花果山，小猴挡住去路。念对名号，把拦路的妖打小收服！",
      button: "救猴群 · Save the monkeys",
    };
  }

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

  function seededShuffle(list, seed) {
    const out = (Array.isArray(list) ? list : []).slice();
    const rng = mulberry32(seed >>> 0);
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  function uniqueCards(cards) {
    const seen = new Set();
    const out = [];
    (Array.isArray(cards) ? cards : []).forEach((card) => {
      const term = String(card && (card.term || card.word) || "").trim();
      const zh = String(card && (card.zh || card.translation || card.meaning) || "").trim();
      if (!term || !zh) return;
      const key = term.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        term,
        zh,
        illustration: card && card.illustration || null,
        sprite: card && card.sprite || null,
      });
    });
    return out;
  }

  function catalogCards(level) {
    if (level && Array.isArray(level.sessionCards) && level.sessionCards.length) {
      return uniqueCards(level.sessionCards);
    }
    const cards = [];
    (level && level.previewWords || []).forEach((row) => cards.push(row));
    ((level && level.waves) || []).forEach((wave) => (wave.monsters || []).forEach((row) => cards.push(row)));
    (((level && level.boss) || {}).hpWords || []).forEach((row) => cards.push(row));
    return uniqueCards(cards);
  }

  function buildChoices(word, pool, seed) {
    const want = String(word && word.term || "").trim();
    if (!want) return [];
    const distractors = uniqueCards(pool).filter((item) => item.term.toLowerCase() !== want.toLowerCase());
    const picked = seededShuffle(distractors, seed).slice(0, 2);
    return seededShuffle([
      { en: want, correct: true },
      ...picked.map((item) => ({ en: item.term, correct: false })),
    ], (seed + 17) >>> 0);
  }

  function minionKind(index, word) {
    if (index % 3 === 1 && word && word.illustration) return "picture-choice";
    if (index % 3 === 2) return "listen-choice";
    return "en-choice";
  }

  function buildRun(level, opts) {
    const options = opts && typeof opts === "object" ? opts : {};
    const cards = catalogCards(level);
    const minionCount = Math.max(1, Math.min(MINION_COUNT, Number(options.minionCount) || MINION_COUNT, cards.length || 1));
    const minions = cards.slice(0, minionCount).map((card, index) => ({
      term: card.term,
      zh: card.zh,
      illustration: card.illustration,
      sprite: card.sprite || (level && level.cast && level.cast.minors && level.cast.minors[0] && level.cast.minors[0].sprite) || "monkey-minor",
      hitsLeft: HITS_TO_CAPTURE,
      kind: minionKind(index, card),
    }));
    const bossSource = (((level && level.boss) || {}).hpWords || []).concat(cards.slice(minionCount));
    const bossWords = uniqueCards(bossSource).slice(0, BOSS_ROUNDS).map((card, index) => ({
      term: card.term,
      zh: card.zh,
      illustration: card.illustration,
      kind: index === 1 ? "listen-choice" : "en-choice",
    }));
    return {
      phase: "quest",
      lives: DEFAULT_LIVES,
      livesMax: DEFAULT_LIVES,
      combo: 0,
      captured: 0,
      starsHud: 0,
      minionIndex: 0,
      bossIndex: 0,
      minions,
      bossWords,
      wrongWords: {},
      skipped: [],
      finished: false,
      passed: false,
      typingEnabled: false,
      title: (level && level.title) || { zh: "花果山", en: "The Monkey" },
      boss: (level && level.cast && level.cast.boss) || { id: "monkey-minor", nameZh: "猴群小头目", sprite: "monkey-minor" },
      hero: (level && level.cast && level.cast.hero) || { id: "wukong", nameZh: "孙悟空" },
    };
  }

  function currentWord(run) {
    if (!run || run.finished) return null;
    if (run.phase === "arena") return run.minions[run.minionIndex] || null;
    if (run.phase === "boss") return run.bossWords[run.bossIndex] || null;
    return null;
  }

  function currentPrompt(run, seed) {
    const word = currentWord(run);
    if (!word) return null;
    const kind = word.kind || "en-choice";
    const choices = buildChoices(word, (run.minions || []).concat(run.bossWords || []), seed >>> 0);
    const listen = kind === "listen-choice";
    const picture = kind === "picture-choice" && word.illustration;
    return {
      kind: picture ? "picture-choice" : (listen ? "listen-choice" : "en-choice"),
      term: word.term,
      zh: word.zh,
      illustration: picture ? word.illustration : null,
      listen,
      promptKicker: run.phase === "boss" ? (run.bossIndex === 0 ? "念咒" : "认名号") : (listen ? "听令" : "念咒"),
      promptMain: listen ? "听一听，点出英文名号" : word.zh,
      promptSub: run.phase === "boss" ? "点对名号，这一咒才算数" : "点出对应的英文，这一击才算数",
      choices,
      hitsLeft: word.hitsLeft == null ? 1 : word.hitsLeft,
      hitsMax: run.phase === "arena" ? HITS_TO_CAPTURE : 1,
    };
  }

  function pickMissFloat(n) {
    return MISS_FLOATS[Math.abs(Number(n) || 0) % MISS_FLOATS.length];
  }

  function pickHitFloat(captured) {
    return captured ? HIT_FLOATS[1] : HIT_FLOATS[0];
  }

  function markWrong(run, term) {
    const key = String(term || "").trim();
    if (!key) return;
    run.wrongWords[key] = (Number(run.wrongWords[key]) || 0) + 1;
  }

  function enterArena(run) {
    if (!run || run.finished) return run;
    run.phase = "arena";
    run.minionIndex = 0;
    return run;
  }

  function finishPass(run) {
    run.finished = true;
    run.passed = true;
    run.phase = "result";
    return run;
  }

  function finishFail(run) {
    run.finished = true;
    run.passed = false;
    run.phase = "result";
    run.combo = 0;
    return run;
  }

  function advanceAfterCapture(run, opts) {
    const count = !(opts && opts.count === false);
    if (run.phase === "arena") {
      if (count) run.captured += 1;
      run.minionIndex += 1;
      if (run.minionIndex >= run.minions.length) {
        if ((run.bossWords || []).length) {
          run.phase = "boss";
          run.bossIndex = 0;
          return { captured: true, next: "boss" };
        }
        finishPass(run);
        return { captured: true, next: "result" };
      }
      return { captured: true, next: "arena" };
    }
    run.bossIndex += 1;
    if (run.bossIndex >= run.bossWords.length) {
      finishPass(run);
      return { captured: true, next: "result" };
    }
    return { captured: true, next: "boss" };
  }

  function applyChoice(run, selectedEn) {
    const word = currentWord(run);
    if (!run || run.finished || !word) {
      return { ok: false, reason: "idle" };
    }
    const picked = String(selectedEn || "").trim();
    const correct = picked.toLowerCase() === String(word.term).toLowerCase();
    if (correct) {
      run.combo += 1;
      run.starsHud += 1;
      if (run.phase === "arena") {
        word.hitsLeft = Math.max(0, (Number(word.hitsLeft) || HITS_TO_CAPTURE) - 1);
        const captured = word.hitsLeft <= 0;
        const floatText = pickHitFloat(captured);
        if (captured) {
          const next = advanceAfterCapture(run);
          return { ok: true, correct: true, captured: true, floatText, next: next.next, lives: run.lives, passed: run.passed, finished: run.finished };
        }
        return { ok: true, correct: true, captured: false, floatText, next: "arena", lives: run.lives, passed: false, finished: false };
      }
      const next = advanceAfterCapture(run);
      return { ok: true, correct: true, captured: true, floatText: pickHitFloat(true), next: next.next, lives: run.lives, passed: run.passed, finished: run.finished };
    }
    run.combo = 0;
    markWrong(run, word.term);
    run.lives = Math.max(0, Number(run.lives) - 1);
    const floatText = pickMissFloat(run.lives);
    if (floatText === FORBIDDEN_MISS) {
      throw new Error("miss float must never be 词不对");
    }
    if (run.lives <= 0) {
      finishFail(run);
      return { ok: true, correct: false, captured: false, floatText, next: "result", lives: 0, passed: false, finished: true };
    }
    return { ok: true, correct: false, captured: false, floatText, next: run.phase, lives: run.lives, passed: false, finished: false };
  }

  function applySkip(run) {
    const word = currentWord(run);
    if (!run || run.finished || !word) return { ok: false, reason: "idle" };
    run.skipped.push(word.term);
    markWrong(run, word.term);
    if (run.phase === "arena") {
      word.hitsLeft = 0;
    }
    const next = advanceAfterCapture(run, { count: false });
    return {
      ok: true,
      skipped: true,
      correct: false,
      captured: false,
      floatText: "先记下，下场再念",
      next: next.next,
      lives: run.lives,
      passed: run.passed,
      finished: run.finished,
    };
  }

  function hadFirstClear(prev) {
    const rec = prev && typeof prev === "object" ? prev : {};
    return Number(rec.stars) > 0 || Number(rec.clears) > 0 || rec.mapStage === "complete";
  }

  function settlePack1(run, prev, settleRun) {
    const failed = !run || !run.passed;
    const shieldLeft = failed ? 0 : Math.max(0, Number(run.lives) || 0);
    const base = typeof settleRun === "function"
      ? settleRun({
        cleared: !failed,
        shieldLeft,
        quizPassed: !failed,
        wrongWords: (run && run.wrongWords) || {},
      })
      : {
        stars: failed ? 0 : (shieldLeft >= 2 ? 2 : 1),
        cleared: !failed,
        shieldLeft,
        quizPassed: !failed,
        wrongWords: (run && run.wrongWords) || {},
      };
    const stars = failed ? 0 : Math.max(1, Number(base.stars) || 1);
    const awardFirstStar = !failed && stars > 0 && !hadFirstClear(prev);
    return {
      stars,
      cleared: !failed,
      passed: !failed,
      awardFirstStar,
      shieldLeft: base.shieldLeft,
      quizPassed: !failed,
      wrongWords: base.wrongWords || {},
      skipped: (run && run.skipped) || [],
    };
  }

  function progressPatch(prev, settle, extra) {
    const rec = Object.assign({}, prev && typeof prev === "object" ? prev : {});
    const more = extra && typeof extra === "object" ? extra : {};
    rec.wrongWords = settle && settle.wrongWords ? settle.wrongWords : (rec.wrongWords || {});
    rec.updatedAt = more.updatedAt || new Date().toISOString();
    if (!settle || !settle.passed) {
      return rec;
    }
    rec.stars = Math.max(Number(rec.stars) || 0, Number(settle.stars) || 0);
    rec.clears = (Number(rec.clears) || 0) + 1;
    rec.mapStage = "complete";
    rec.mapStars = Math.max(Number(rec.mapStars) || 0, Number(settle.stars) || 0);
    rec.mapKilled = Math.max(Number(rec.mapKilled) || 0, Number(more.captured) || 0);
    return rec;
  }

  function collectionPatch(prev, bossId, collectionId, when) {
    const all = Object.assign({}, prev && typeof prev === "object" ? prev : {});
    const id = String(bossId || "").trim();
    if (!id || all[id]) return all;
    all[id] = {
      cardLevel: collectionId || "c01",
      firstClearAt: when || new Date().toISOString(),
    };
    return all;
  }

  return {
    PLAY_FIRST_EXPERIMENT,
    DEFAULT_LIVES,
    HITS_TO_CAPTURE,
    MINION_COUNT,
    BOSS_ROUNDS,
    MISS_FLOATS,
    HIT_FLOATS,
    FORBIDDEN_MISS,
    ALLOWED_PROGRESS_KEYS,
    isDefaultPath,
    questCard,
    catalogCards,
    buildChoices,
    buildRun,
    currentWord,
    currentPrompt,
    pickMissFloat,
    pickHitFloat,
    enterArena,
    applyChoice,
    applySkip,
    settlePack1,
    progressPatch,
    collectionPatch,
    hadFirstClear,
  };
});
