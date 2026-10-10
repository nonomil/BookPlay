"use strict";

/* 降妖记·洞中认词。纯逻辑：补字母 / 看图选词 / 听音选图、70% 通过、独立进度。
 * 不写西游主进度，也不写战斗存档。无 DOM。 */
(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BookPlayWordQuiz = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function wordQuizFactory() {
  const PROGRESS_KEY = "bookplay_jttw_word_quiz_v1";
  const PASS_RATE = 0.7;
  const KINDS = Object.freeze(["fill-letter", "picture-word", "listen-picture"]);
  const COPY = Object.freeze({
    title: "洞中认词",
    kicker: "降妖记",
    fillPrompt: "这个英文缺了一笔，点上缺的字母。",
    picturePrompt: "看这幅画，选出对应的英文。",
    listenPrompt: "听一听，选出对应的画面。",
    listenFallback: "这会儿没有原声，看大字再选画面。",
    pass: "记住了。可以回地图，继续降妖。",
    fail: "还没记住，再考一次。这一关先不算过。",
    retry: "再考一次",
    correct: Object.freeze({
      "fill-letter": "字母补上了，悟空记住了！",
      "picture-word": "画和英文对上了，真棒！",
      "listen-picture": "听对了，这幅画就是它！",
    }),
    wrong: "再想一想，师父等你。",
  });
  // 没有本集关卡时也能认词。都是花果山开场能对上的短词，不是另一套世界观。
  const STARTER_WORDS = Object.freeze([
    { term: "sun", zh: "太阳", glyph: "日" },
    { term: "moon", zh: "月亮", glyph: "月" },
    { term: "rock", zh: "岩石", glyph: "石" },
    { term: "monkey", zh: "猴子", glyph: "猴" },
    { term: "water", zh: "水", glyph: "水" },
    { term: "mountain", zh: "山", glyph: "山" },
    { term: "cloud", zh: "云", glyph: "云" },
    { term: "cave", zh: "洞", glyph: "洞" },
  ]);

  function hashSeed(seed) {
    let hash = 2166136261;
    const text = String(seed || "word-quiz");
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function nextRandom(value) {
    return (Math.imul(value, 1664525) + 1013904223) >>> 0;
  }

  function shuffle(list, seed) {
    const items = list.slice();
    let state = seed >>> 0;
    for (let i = items.length - 1; i > 0; i -= 1) {
      state = nextRandom(state);
      const j = state % (i + 1);
      const swap = items[i];
      items[i] = items[j];
      items[j] = swap;
    }
    return { items, seed: state };
  }

  function shortZh(value) {
    const text = String(value || "").split(/[，,;；（(]/)[0].replace(/\s+/g, "").trim();
    return text.slice(0, 6) || "词";
  }

  function lettersOnly(term) {
    return String(term || "").toLowerCase().replace(/[^a-z]/g, "");
  }

  function normalizeWord(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const term = String(source.term || source.word || "").trim();
    const letters = lettersOnly(term);
    if (!/^[a-z]{3,12}$/.test(letters)) return null;
    const zh = String(source.zh || source.gloss || "").trim();
    if (!zh) return null;
    const image = String(source.image || source.illustration || "").trim();
    const glyph = String(source.glyph || shortZh(zh).slice(0, 1) || "词");
    return {
      term: letters,
      zh,
      shortZh: shortZh(zh),
      image,
      glyph,
    };
  }

  function wordsFromLevel(level) {
    const pool = [];
    const seen = new Set();
    const push = (raw) => {
      const word = normalizeWord(raw);
      if (!word || seen.has(word.term)) return;
      seen.add(word.term);
      pool.push(word);
    };
    const source = level && typeof level === "object" ? level : {};
    (Array.isArray(source.previewWords) ? source.previewWords : []).forEach(push);
    const bossWords = source.boss && Array.isArray(source.boss.hpWords) ? source.boss.hpWords : [];
    bossWords.forEach(push);
    (Array.isArray(source.waves) ? source.waves : []).forEach((wave) => {
      (wave && Array.isArray(wave.monsters) ? wave.monsters : []).forEach(push);
    });
    return pool;
  }

  function otherWords(pool, term, count, seed) {
    const rest = pool.filter((word) => word.term !== term);
    const mixed = shuffle(rest, seed);
    return { words: mixed.items.slice(0, count), seed: mixed.seed };
  }

  function choiceMeta(word) {
    return {
      term: word.term,
      zh: word.shortZh,
      image: word.image,
      glyph: word.glyph,
    };
  }

  function buildFillLetter(word, seed) {
    const letters = word.term;
    let state = nextRandom(hashSeed(`fill|${word.term}|${seed}`));
    const gap = state % letters.length;
    const answer = letters[gap];
    const display = letters.split("").map((char, index) => (index === gap ? "_" : char)).join(" ");
    const alphabet = "abcdefghijklmnopqrstuvwxyz".split("").filter((char) => char !== answer);
    const mixed = shuffle(alphabet, state);
    const choices = shuffle([answer].concat(mixed.items.slice(0, 2)), mixed.seed).items;
    return {
      id: `fill-letter:${word.term}:${gap}`,
      kind: "fill-letter",
      type: "fill-letter",
      term: word.term,
      prompt_en: "Fill the missing letter.",
      prompt_zh: COPY.fillPrompt,
      choices,
      answer: choices.indexOf(answer),
      display,
      zh: word.shortZh,
      choiceMeta: choices.map((letter) => ({ term: letter, zh: letter, image: "", glyph: letter.toUpperCase() })),
    };
  }

  function buildPictureWord(word, pool, seed) {
    const picked = otherWords(pool, word.term, 2, hashSeed(`picture|${word.term}|${seed}`));
    if (picked.words.length < 2) return null;
    const options = [word].concat(picked.words);
    const mixed = shuffle(options, picked.seed);
    const choices = mixed.items.map((item) => item.term);
    return {
      id: `picture-word:${word.term}`,
      kind: "picture-word",
      type: "picture-word",
      term: word.term,
      prompt_en: "Look at the picture and choose the English word.",
      prompt_zh: COPY.picturePrompt,
      choices,
      answer: choices.indexOf(word.term),
      display: word.term,
      zh: word.shortZh,
      image: word.image,
      glyph: word.glyph,
      choiceMeta: mixed.items.map(choiceMeta),
    };
  }

  function buildListenPicture(word, pool, seed) {
    const picked = otherWords(pool, word.term, 2, hashSeed(`listen|${word.term}|${seed}`));
    if (picked.words.length < 2) return null;
    const options = [word].concat(picked.words);
    const mixed = shuffle(options, picked.seed);
    const choices = mixed.items.map((item) => item.term);
    return {
      id: `listen-picture:${word.term}`,
      kind: "listen-picture",
      type: "listen-picture",
      term: word.term,
      prompt_en: "Listen and choose the picture.",
      prompt_zh: COPY.listenPrompt,
      choices,
      answer: choices.indexOf(word.term),
      display: "",
      zh: word.shortZh,
      speak: word.term,
      choiceMeta: mixed.items.map(choiceMeta),
    };
  }

  function buildSession(words, options) {
    const settings = options && typeof options === "object" ? options : {};
    const count = Math.max(3, Math.min(6, Number(settings.count) || 5));
    const pool = [];
    const seen = new Set();
    (Array.isArray(words) ? words : []).forEach((raw) => {
      const word = normalizeWord(raw);
      if (!word || seen.has(word.term)) return;
      seen.add(word.term);
      pool.push(word);
    });
    if (pool.length < 3) return [];
    const short = pool.filter((word) => word.term.length <= 7);
    const usable = short.length >= 3 ? short : pool;
    const pattern = ["fill-letter", "picture-word", "listen-picture", "fill-letter", "picture-word", "listen-picture"];
    let state = hashSeed(`${settings.episode || 1}|${settings.seed || 1}|word-quiz`);
    const order = shuffle(usable.map((_, index) => index), state);
    state = order.seed;
    const questions = [];
    for (let index = 0; index < count; index += 1) {
      const word = usable[order.items[index % order.items.length]];
      const kind = pattern[index % pattern.length];
      state = nextRandom(state + index);
      let built = null;
      if (kind === "fill-letter") built = buildFillLetter(word, state);
      else if (kind === "picture-word") built = buildPictureWord(word, usable, state);
      else built = buildListenPicture(word, usable, state);
      if (!built) continue;
      built.id = `${built.id}:${index}`;
      questions.push(built);
    }
    const have = new Set(questions.map((item) => item.kind));
    if (!KINDS.every((kind) => have.has(kind))) return [];
    return questions;
  }

  function answerIndex(value) {
    if (value && typeof value === "object") return Number(value.choice);
    return Number(value);
  }

  function scoreLocal(questions, answers) {
    const items = Array.isArray(questions) ? questions : [];
    const source = answers && typeof answers === "object" ? answers : {};
    const mastered = [];
    const wrong = [];
    let correct = 0;
    items.forEach((item) => {
      if (!item || !Array.isArray(item.choices)) return;
      const ok = answerIndex(source[item.id]) === Number(item.answer);
      if (ok) {
        correct += 1;
        if (item.term && mastered.indexOf(item.term) < 0) mastered.push(item.term);
      } else if (item.term && wrong.indexOf(item.term) < 0) {
        wrong.push(item.term);
      }
    });
    const total = items.filter((item) => item && Array.isArray(item.choices)).length;
    const percent = total ? Math.round((correct / total) * 100) : 0;
    return {
      total,
      correct,
      percent,
      passed: total > 0 && correct / total >= PASS_RATE,
      mastered_terms: mastered,
      wrong_terms: wrong,
    };
  }

  function score(questions, answers) {
    const quiz = typeof globalThis !== "undefined" ? globalThis.BookPlayEpisodeVocabQuiz : null;
    if (quiz && typeof quiz.scoreEpisodeQuiz === "function") {
      return quiz.scoreEpisodeQuiz(questions, answers, { passRate: PASS_RATE });
    }
    return scoreLocal(questions, answers);
  }

  function encouragement(correct, kind) {
    if (correct) return COPY.correct[kind] || COPY.correct["picture-word"];
    return COPY.wrong;
  }

  function emptyProgress() {
    return { version: 1, series: "jttw", episodes: {} };
  }

  function normalizeProgress(value) {
    const source = value && typeof value === "object" ? value : {};
    const episodes = {};
    const raw = source.episodes && typeof source.episodes === "object" ? source.episodes : {};
    Object.keys(raw).forEach((key) => {
      const item = raw[key];
      if (!item || typeof item !== "object") return;
      const mastered = Array.isArray(item.mastered) ? item.mastered.map((term) => String(term)).filter(Boolean) : [];
      episodes[String(key)] = {
        plays: Math.max(0, Number(item.plays) || 0),
        bestCorrect: Math.max(0, Number(item.bestCorrect) || 0),
        total: Math.max(0, Number(item.total) || 0),
        quizPassed: item.quizPassed === true,
        mastered,
        updatedAt: item.updatedAt || null,
      };
    });
    return { version: 1, series: "jttw", episodes };
  }

  function applyResult(progress, episode, result, now) {
    const next = normalizeProgress(progress);
    const key = String(Math.max(1, Number(episode) || 1));
    const prior = next.episodes[key] || {
      plays: 0, bestCorrect: 0, total: 0, quizPassed: false, mastered: [], updatedAt: null,
    };
    const scored = result && typeof result === "object" ? result : {};
    const mastered = prior.mastered.slice();
    (Array.isArray(scored.mastered_terms) ? scored.mastered_terms : []).forEach((term) => {
      if (term && mastered.indexOf(term) < 0) mastered.push(term);
    });
    const correct = Math.max(0, Number(scored.correct) || 0);
    next.episodes[key] = {
      plays: prior.plays + 1,
      bestCorrect: Math.max(prior.bestCorrect, correct),
      total: Math.max(0, Number(scored.total) || 0),
      quizPassed: prior.quizPassed === true || scored.passed === true,
      mastered,
      updatedAt: now || new Date().toISOString(),
    };
    return next;
  }

  function load(storage) {
    try {
      const raw = storage && storage.getItem ? storage.getItem(PROGRESS_KEY) : null;
      return normalizeProgress(raw ? JSON.parse(raw) : {});
    } catch (_) {
      return emptyProgress();
    }
  }

  function save(storage, progress) {
    try {
      if (storage && storage.setItem) storage.setItem(PROGRESS_KEY, JSON.stringify(normalizeProgress(progress)));
    } catch (_) { /* 存不下就只留在这一次 */ }
  }

  function remember(storage, episode, result, now) {
    const next = applyResult(load(storage), episode, result, now);
    save(storage, next);
    return next;
  }

  return {
    PROGRESS_KEY,
    PASS_RATE,
    KINDS,
    COPY,
    STARTER_WORDS,
    wordsFromLevel,
    buildSession,
    score,
    scoreLocal,
    encouragement,
    emptyProgress,
    applyResult,
    load,
    save,
    remember,
  };
});
