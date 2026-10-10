"use strict";

/* 星际探查。舱内任务：用英语把一件舱务接上，对了就得任务星。
 * 进度只写 bookplay_scout_orbit_progress_v1。不写西游主进度，也不写扔球存档。 */
(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BookPlayScoutOrbit = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function scoutOrbitFactory() {
  const PROGRESS_KEY = "bookplay_scout_orbit_progress_v1";
  const PASS_RATE = 0.7;
  const KINDS = Object.freeze(["fill-letter", "picture-word", "listen-picture"]);
  const COPY = Object.freeze({
    title: "今日任务",
    kicker: "星际探查",
    launch: "起飞",
    again: "再飞一趟",
    locked: "先把上一站点亮。",
    fill: "控制板上的英文缺了一笔。补上，这件舱务才接得上。",
    picture: "看舱壁上的牌子，扳对的英文开关。",
    listen: "听机甲说的词，点亮对应的舱板。",
    listenFallback: "这会儿没有原声，看大字再点舱板。",
    correct: "接上了。",
    wrong: "还没接上。机甲记下了，下一件继续。",
    pass: "这一颗星点亮了。下一站可以起飞。",
    passLast: "这一颗星也点亮了。四站都可以再飞。",
    fail: "还差一点点。这一站先不往前开，再飞一趟就好。",
    next: "飞往下一站",
    back: "回任务板",
  });
  const BOOKS = Object.freeze([
    {
      id: "book-01",
      name: "阳光农星",
      en: "Sun Garden",
      motif: "farm",
      mission: "菜园的灯灭了，先把苗救活。",
      words: Object.freeze([
        { term: "sun", zh: "太阳", glyph: "日", situation: "顶灯不亮" },
        { term: "seed", zh: "种子", glyph: "种", situation: "育苗盘是空的" },
        { term: "water", zh: "水", glyph: "水", situation: "苗渴了" },
        { term: "leaf", zh: "叶子", glyph: "叶", situation: "叶子耷拉着" },
        { term: "soil", zh: "泥土", glyph: "土", situation: "苗床还没填土" },
        { term: "lamp", zh: "灯", glyph: "灯", situation: "工作灯灭了" },
      ]),
    },
    {
      id: "book-02",
      name: "月园站",
      en: "Moon Station",
      motif: "moon",
      mission: "月面营地还没亮，先把舱口收拾好。",
      words: Object.freeze([
        { term: "moon", zh: "月亮", glyph: "月", situation: "圆窗是黑的" },
        { term: "rock", zh: "岩石", glyph: "石", situation: "舱门口有石头" },
        { term: "star", zh: "星星", glyph: "星", situation: "航标灭了" },
        { term: "dust", zh: "尘土", glyph: "尘", situation: "地板上有尘" },
        { term: "night", zh: "夜晚", glyph: "夜", situation: "夜灯没开" },
        { term: "camp", zh: "营地", glyph: "营", situation: "营地旗倒了" },
      ]),
    },
    {
      id: "book-03",
      name: "蓝海星",
      en: "Blue Sea",
      motif: "sea",
      mission: "水舱告警了，把观察和排水接上。",
      words: Object.freeze([
        { term: "wave", zh: "波浪", glyph: "浪", situation: "水位在涨" },
        { term: "fish", zh: "鱼", glyph: "鱼", situation: "观察窗要认鱼" },
        { term: "blue", zh: "蓝色", glyph: "蓝", situation: "染色舱要调蓝" },
        { term: "boat", zh: "小船", glyph: "船", situation: "小艇还没放下" },
        { term: "rain", zh: "雨", glyph: "雨", situation: "集雨口关着" },
        { term: "swim", zh: "游泳", glyph: "游", situation: "练习舱还没开始" },
      ]),
    },
    {
      id: "book-04",
      name: "彩虹补给日",
      en: "Rainbow Supply",
      motif: "gift",
      mission: "补给箱还锁着，贴上颜色才能打开。",
      words: Object.freeze([
        { term: "red", zh: "红色", glyph: "红", situation: "红箱没贴标" },
        { term: "green", zh: "绿色", glyph: "绿", situation: "绿箱没贴标" },
        { term: "yellow", zh: "黄色", glyph: "黄", situation: "黄箱没贴标" },
        { term: "pink", zh: "粉色", glyph: "粉", situation: "粉箱没贴标" },
        { term: "gift", zh: "礼物", glyph: "礼", situation: "礼物舱要打开" },
        { term: "box", zh: "箱子", glyph: "箱", situation: "补给箱还锁着" },
      ]),
    },
  ]);

  function hashSeed(seed) {
    let hash = 2166136261;
    const text = String(seed || "scout-orbit");
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
    const term = lettersOnly(source.term || source.word || "");
    if (!/^[a-z]{3,12}$/.test(term)) return null;
    const zh = String(source.zh || source.gloss || "").trim();
    if (!zh) return null;
    return {
      term,
      zh,
      shortZh: shortZh(zh),
      glyph: String(source.glyph || shortZh(zh).slice(0, 1) || "词"),
      situation: String(source.situation || shortZh(zh)).trim() || shortZh(zh),
    };
  }

  function findBook(bookId) {
    return BOOKS.find((book) => book.id === String(bookId || "")) || null;
  }

  function taskLine(word, kind) {
    const situation = word.situation;
    if (kind === "fill-letter") return `${situation}。${COPY.fill}`;
    if (kind === "listen-picture") return `${situation}。${COPY.listen}`;
    return `${situation}。${COPY.picture}`;
  }

  function choiceMeta(word) {
    return { term: word.term, zh: word.shortZh, glyph: word.glyph };
  }

  function otherWords(pool, term, count, seed) {
    const rest = pool.filter((word) => word.term !== term);
    const mixed = shuffle(rest, seed);
    return { words: mixed.items.slice(0, count), seed: mixed.seed };
  }

  function buildFillLetter(word, book, seed) {
    const letters = word.term;
    let state = nextRandom(hashSeed(`fill|${book.id}|${word.term}|${seed}`));
    const gap = state % letters.length;
    const answer = letters[gap];
    const display = letters.split("").map((char, index) => (index === gap ? "_" : char)).join(" ");
    const alphabet = "abcdefghijklmnopqrstuvwxyz".split("").filter((char) => char !== answer);
    const mixed = shuffle(alphabet, state);
    const choices = shuffle([answer].concat(mixed.items.slice(0, 2)), mixed.seed).items;
    return {
      id: `fill-letter:${book.id}:${word.term}:${gap}`,
      kind: "fill-letter",
      type: "fill-letter",
      term: word.term,
      bookId: book.id,
      bookName: book.name,
      situation: word.situation,
      prompt_en: "Fill the missing letter on the cabin panel.",
      prompt_zh: taskLine(word, "fill-letter"),
      choices,
      answer: choices.indexOf(answer),
      display,
      zh: word.shortZh,
      glyph: word.glyph,
      choiceMeta: choices.map((letter) => ({ term: letter, zh: letter, glyph: letter.toUpperCase() })),
    };
  }

  function buildPictureWord(word, pool, book, seed) {
    const picked = otherWords(pool, word.term, 2, hashSeed(`picture|${book.id}|${word.term}|${seed}`));
    if (picked.words.length < 2) return null;
    const options = [word].concat(picked.words);
    const mixed = shuffle(options, picked.seed);
    const choices = mixed.items.map((item) => item.term);
    return {
      id: `picture-word:${book.id}:${word.term}`,
      kind: "picture-word",
      type: "picture-word",
      term: word.term,
      bookId: book.id,
      bookName: book.name,
      situation: word.situation,
      prompt_en: "Look at the cabin sign and choose the English word.",
      prompt_zh: taskLine(word, "picture-word"),
      choices,
      answer: choices.indexOf(word.term),
      display: word.term,
      zh: word.shortZh,
      glyph: word.glyph,
      choiceMeta: mixed.items.map(choiceMeta),
    };
  }

  function buildListenPicture(word, pool, book, seed) {
    const picked = otherWords(pool, word.term, 2, hashSeed(`listen|${book.id}|${word.term}|${seed}`));
    if (picked.words.length < 2) return null;
    const options = [word].concat(picked.words);
    const mixed = shuffle(options, picked.seed);
    const choices = mixed.items.map((item) => item.term);
    return {
      id: `listen-picture:${book.id}:${word.term}`,
      kind: "listen-picture",
      type: "listen-picture",
      term: word.term,
      bookId: book.id,
      bookName: book.name,
      situation: word.situation,
      prompt_en: "Listen and tap the cabin panel.",
      prompt_zh: taskLine(word, "listen-picture"),
      choices,
      answer: choices.indexOf(word.term),
      display: "",
      zh: word.shortZh,
      glyph: word.glyph,
      speak: word.term,
      choiceMeta: mixed.items.map(choiceMeta),
    };
  }

  function buildMission(bookId, options) {
    const book = findBook(bookId);
    const settings = options && typeof options === "object" ? options : {};
    if (!book) return [];
    const pool = [];
    const seen = new Set();
    book.words.forEach((raw) => {
      const word = normalizeWord(raw);
      if (!word || seen.has(word.term)) return;
      seen.add(word.term);
      pool.push(word);
    });
    if (pool.length < 3) return [];
    const short = pool.filter((word) => word.term.length <= 7);
    const usable = short.length >= 3 ? short : pool;
    const count = Math.max(3, Math.min(5, Number(settings.count) || 5, usable.length));
    const pattern = ["fill-letter", "picture-word", "listen-picture", "fill-letter", "picture-word"];
    let state = hashSeed(`${book.id}|${settings.seed || 1}|scout-orbit`);
    const order = shuffle(usable.map((_, index) => index), state);
    state = order.seed;
    const questions = [];
    for (let cursor = 0; cursor < order.items.length && questions.length < count; cursor += 1) {
      const word = usable[order.items[cursor]];
      const kind = pattern[questions.length];
      state = nextRandom(state + questions.length);
      let built = null;
      if (kind === "fill-letter") built = buildFillLetter(word, book, state);
      else if (kind === "picture-word") built = buildPictureWord(word, usable, book, state);
      else built = buildListenPicture(word, usable, book, state);
      if (!built) continue;
      built.id = `${built.id}:${questions.length}`;
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

  function encouragement(correct, term, situation) {
    if (correct) {
      const done = situation ? `${situation}，办好了。` : "";
      return `${COPY.correct}${done}`;
    }
    const word = term ? `这件要接 ${term}。` : "";
    return `还没接上。${word}下一件继续。`;
  }

  function emptyProgress() {
    return { version: 1, series: "scout-orbit", books: {} };
  }

  function blankBook() {
    return {
      plays: 0,
      bestCorrect: 0,
      bestStars: 0,
      total: 0,
      quizPassed: false,
      mastered: [],
      review: [],
      updatedAt: null,
    };
  }

  function normalizeProgress(value) {
    const source = value && typeof value === "object" ? value : {};
    const books = {};
    const raw = source.books && typeof source.books === "object" ? source.books : {};
    Object.keys(raw).forEach((key) => {
      if (!findBook(key)) return;
      const item = raw[key];
      if (!item || typeof item !== "object") return;
      const mastered = Array.isArray(item.mastered) ? item.mastered.map((term) => String(term)).filter(Boolean) : [];
      const review = Array.isArray(item.review) ? item.review.map((term) => String(term)).filter(Boolean) : [];
      const bestCorrect = Math.max(0, Number(item.bestCorrect) || 0);
      books[key] = {
        plays: Math.max(0, Number(item.plays) || 0),
        bestCorrect,
        bestStars: Math.max(bestCorrect, Number(item.bestStars) || 0),
        total: Math.max(0, Number(item.total) || 0),
        quizPassed: item.quizPassed === true,
        mastered,
        review,
        updatedAt: item.updatedAt || null,
      };
    });
    return { version: 1, series: "scout-orbit", books };
  }

  function mergeTerms(prior, extra) {
    const next = prior.slice();
    (Array.isArray(extra) ? extra : []).forEach((term) => {
      if (term && next.indexOf(term) < 0) next.push(term);
    });
    return next;
  }

  function applyResult(progress, bookId, result, now) {
    const next = normalizeProgress(progress);
    const key = String(bookId || "");
    if (!findBook(key)) return next;
    const prior = next.books[key] || blankBook();
    const scored = result && typeof result === "object" ? result : {};
    const correct = Math.max(0, Number(scored.correct) || 0);
    next.books[key] = {
      plays: prior.plays + 1,
      bestCorrect: Math.max(prior.bestCorrect, correct),
      bestStars: Math.max(prior.bestStars, correct),
      total: Math.max(0, Number(scored.total) || 0),
      quizPassed: prior.quizPassed === true || scored.passed === true,
      mastered: mergeTerms(prior.mastered, scored.mastered_terms),
      review: mergeTerms(prior.review, scored.wrong_terms),
      updatedAt: now || new Date().toISOString(),
    };
    return next;
  }

  function isOpen(progress, bookId) {
    const index = BOOKS.findIndex((book) => book.id === String(bookId || ""));
    if (index < 0) return false;
    if (index === 0) return true;
    const previous = normalizeProgress(progress).books[BOOKS[index - 1].id];
    return !!(previous && previous.quizPassed === true);
  }

  function nextBookId(bookId) {
    const index = BOOKS.findIndex((book) => book.id === String(bookId || ""));
    if (index < 0 || index >= BOOKS.length - 1) return null;
    return BOOKS[index + 1].id;
  }

  function starTotal(progress) {
    const books = normalizeProgress(progress).books;
    return BOOKS.reduce((sum, book) => sum + (books[book.id] ? books[book.id].bestStars : 0), 0);
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

  function remember(storage, bookId, result, now) {
    const next = applyResult(load(storage), bookId, result, now);
    save(storage, next);
    return next;
  }

  return {
    PROGRESS_KEY,
    PASS_RATE,
    KINDS,
    COPY,
    BOOKS,
    buildMission,
    score,
    scoreLocal,
    encouragement,
    emptyProgress,
    applyResult,
    isOpen,
    nextBookId,
    starTotal,
    load,
    save,
    remember,
  };
});
