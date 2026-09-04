(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LessonCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SETTINGS_KEY = "bookplay_lesson_settings_v1";
  const DEFAULT_SETTINGS = Object.freeze({ gradeBand: "g3_4", intensity: "standard" });
  const QUESTION_QUOTAS = Object.freeze({
    g1_2: Object.freeze({ light: 3, standard: 4, challenge: 5 }),
    g3_4: Object.freeze({ light: 5, standard: 7, challenge: 9 }),
    g5_6: Object.freeze({ light: 7, standard: 10, challenge: 14 }),
  });
  const DIFFICULTY_CAPS = Object.freeze({ g1_2: 2, g3_4: 3, g5_6: 5 });
  const GRADE_BANDS = Object.keys(QUESTION_QUOTAS);
  const INTENSITIES = ["light", "standard", "challenge"];
  const STUDY_SESSION_VERSION = 2;
  const STUDY_WORD_LIMIT = 8;

  function normalizeSettings(value) {
    const input = value && typeof value === "object" ? value : {};
    return {
      gradeBand: GRADE_BANDS.includes(input.gradeBand) ? input.gradeBand : DEFAULT_SETTINGS.gradeBand,
      intensity: INTENSITIES.includes(input.intensity) ? input.intensity : DEFAULT_SETTINGS.intensity,
    };
  }

  function getQuestionQuota(value) {
    const settings = normalizeSettings(value);
    return QUESTION_QUOTAS[settings.gradeBand][settings.intensity];
  }

  function stableScore(value) {
    let hash = 2166136261;
    const text = String(value || "");
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function stableCards(cards, episode) {
    return cards.slice().sort((a, b) => {
      const ah = stableScore(`${episode}|${a.card_id || a.order || ""}`);
      const bh = stableScore(`${episode}|${b.card_id || b.order || ""}`);
      return ah - bh || Number(a.order || 0) - Number(b.order || 0);
    });
  }

  function normalizeWordSource(item) {
    const source = item && typeof item === "object" ? item : {};
    const payload = source.payload && typeof source.payload === "object" ? source.payload : source;
    const prompt = source.prompt && typeof source.prompt === "object" ? source.prompt : {};
    const term = normalizeText(payload.term || source.term || prompt.en || "");
    const zh = normalizeText(payload.gloss || payload.meaning || payload.zh || source.zh || prompt.zh || payload.def || "");
    const def = normalizeText(payload.def || source.def || prompt.zh || zh);
    if (!term || !zh || !isCleanGloss(zh)) return null;
    return {
      cardId: String(source.card_id || source.cardId || `story-word-${term}`),
      term,
      zh,
      def,
      ipa: normalizeText(payload.ipa || source.ipa),
      pos: normalizeText(payload.pos || source.pos),
      example: normalizeText(payload.example || source.example),
    };
  }

  function isCleanGloss(value) {
    const text = normalizeText(value);
    if (!text || text.length > 35) return false;
    if (/[“”\"]/.test(text)) return false;
    if (/(召集天兵|给我把孙悟空抓来|找一份工作)/.test(text)) return false;
    return true;
  }

  function createStudySession({ episode, cards, storyWords, settings, limit = STUDY_WORD_LIMIT, now } = {}) {
    const normalizedSettings = normalizeSettings(settings);
    const candidates = [];
    (Array.isArray(cards) ? cards : [])
      .filter((card) => card && card.type === "word_review" && isGradable(card, normalizedSettings))
      .forEach((card) => {
        const item = normalizeWordSource(card);
        if (item) candidates.push(item);
      });
    (Array.isArray(storyWords) ? storyWords : []).forEach((item) => {
      const normalized = normalizeWordSource(item);
      if (normalized) candidates.push(normalized);
    });
    const unique = [];
    const seen = new Set();
    stableCards(candidates.map((item, index) => ({ ...item, card_id: item.cardId, order: index })), episode)
      .forEach((item) => {
        const key = item.term.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        unique.push({
          cardId: item.cardId,
          term: item.term,
          zh: item.zh,
          def: item.def,
          ipa: item.ipa,
          pos: item.pos,
          example: item.example,
        });
      });
    const count = Math.max(1, Number.parseInt(limit, 10) || STUDY_WORD_LIMIT);
    const timestamp = now || new Date().toISOString();
    return normalizeStudySession({
      version: STUDY_SESSION_VERSION,
      episode: Number.parseInt(episode, 10) || 1,
      settings: normalizedSettings,
      words: unique.slice(0, count),
      studyDone: false,
      quiz: { current: 0, correct: 0, answers: [] },
      attempts: 0,
      passed: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  function normalizeStudySession(value) {
    const source = value && typeof value === "object" ? value : {};
    const words = Array.isArray(source.words)
      ? source.words.map(normalizeWordSource).filter(Boolean)
      : [];
    const quiz = source.quiz && typeof source.quiz === "object" ? source.quiz : {};
    const answers = Array.isArray(quiz.answers) ? quiz.answers.filter((item) => item && typeof item === "object") : [];
    return {
      // Keep the stored version visible to the caller.  The page startup code
      // can then deliberately rebuild sessions from an older schema instead
      // of silently upgrading an incompatible payload in place.
      version: Number.isFinite(Number(source.version)) ? Number(source.version) : 0,
      episode: Number.parseInt(source.episode, 10) || 0,
      settings: normalizeSettings(source.settings),
      words,
      wordTerms: words.map((item) => item.term),
      studyDone: source.studyDone === true,
      heardWords: Array.isArray(source.heardWords)
        ? source.heardWords.map((item) => normalizeText(item)).filter(Boolean)
        : [],
      studyCompletedAt: source.studyCompletedAt || null,
      quiz: {
        current: Math.max(0, Number.parseInt(quiz.current, 10) || 0),
        correct: Math.max(0, Number.parseInt(quiz.correct, 10) || 0),
        answers,
      },
      attempts: Math.max(0, Number.parseInt(source.attempts, 10) || 0),
      passed: source.passed === true,
      createdAt: source.createdAt || null,
      updatedAt: source.updatedAt || null,
    };
  }

  function getSessionWordTerms(session) {
    return normalizeStudySession(session).wordTerms.slice();
  }

  function isStudyComplete(session, episode) {
    const value = normalizeStudySession(session);
    return value.episode === (Number.parseInt(episode, 10) || 0) && value.studyDone && value.words.length > 0;
  }

  function evaluateLessonResult(correct, total) {
    const safeTotal = Math.max(0, Number.parseInt(total, 10) || 0);
    const safeCorrect = Math.max(0, Math.min(safeTotal, Number.parseInt(correct, 10) || 0));
    const ratio = safeTotal ? safeCorrect / safeTotal : 0;
    return { passed: safeTotal > 0 && safeCorrect > 0 && ratio >= 0.7, ratio, correct: safeCorrect, total: safeTotal };
  }

  function choicePresentation(choice, question) {
    const item = choice && typeof choice === "object" ? choice : {};
    const type = question && question.type;
    if (type === "word_choice") {
      if (question.direction === "en_to_zh") {
        return { primary: normalizeText(item.zh), secondary: "", primaryLang: "zh-CN", secondaryLang: "zh-CN" };
      }
      return { primary: normalizeText(item.en), secondary: "", primaryLang: "en", secondaryLang: "en" };
    }
    return {
      primary: normalizeText(item.en || item.id),
      secondary: normalizeText(item.zh),
      primaryLang: "en",
      secondaryLang: "zh-CN",
    };
  }

  function pickPuzzle(puzzles, episode) {
    const candidates = (Array.isArray(puzzles) ? puzzles : []).filter((item) => {
      const sentence = normalizeText(item && (item.sentence || item.text_en));
      const words = Array.isArray(item && item.words) ? item.words.filter(Boolean) : sentence.split(" ").filter(Boolean);
      return sentence && words.length >= 2;
    });
    return stableCards(candidates.map((item, index) => ({ ...item, card_id: item.card_id || `puzzle-${index}`, order: index })), `${episode}|puzzles`)
      .sort((a, b) => Number(Boolean(b.text_zh || b.sentence_zh || b.clue_zh)) - Number(Boolean(a.text_zh || a.sentence_zh || a.clue_zh)))[0] || null;
  }

  function isGradable(card, settings) {
    if (!card || card.stage !== "episode_complete" || card.review_status === "needs_review") return false;
    if (!Array.isArray(card.grade_bands) || !card.grade_bands.includes(settings.gradeBand)) return false;
    const difficulty = Number(card.difficulty || 1);
    if (!Number.isFinite(difficulty) || difficulty > DIFFICULTY_CAPS[settings.gradeBand]) return false;
    if (card.type === "sentence_choice") {
      const payload = card.payload || {};
      return Array.isArray(payload.choices) && payload.choices.length >= 2
        && payload.answer !== undefined && payload.answer !== null && payload.answer !== "";
    }
    if (card.type === "word_review") {
      const payload = card.payload || {};
      const promptZh = card.prompt && card.prompt.zh;
      const gloss = payload.gloss || payload.meaning || promptZh || payload.def;
      return Boolean(payload.term && payload.def && isCleanGloss(gloss));
    }
    return false;
  }

  function interleave(primary, secondary) {
    const output = [];
    const max = Math.max(primary.length, secondary.length);
    for (let i = 0; i < max; i += 1) {
      if (primary[i]) output.push(primary[i]);
      if (secondary[i]) output.push(secondary[i]);
    }
    return output;
  }

  function selectCards(cards, value, episode) {
    const settings = normalizeSettings(value);
    const quota = getQuestionQuota(settings);
    const eligible = (Array.isArray(cards) ? cards : []).filter((card) => isGradable(card, settings));
    const sentences = stableCards(eligible.filter((card) => card.type === "sentence_choice"), episode);
    const words = stableCards(eligible.filter((card) => card.type === "word_review"), episode);
    const sentenceTarget = sentences.length && words.length ? Math.max(1, Math.round(quota * 0.4)) : quota;
    const chosenSentences = sentences.slice(0, Math.min(sentenceTarget, sentences.length));
    const chosenWords = words.slice(0, Math.max(0, quota - chosenSentences.length));
    if (chosenSentences.length + chosenWords.length < quota) {
      chosenSentences.push(...sentences.slice(chosenSentences.length, quota - chosenWords.length));
    }
    return interleave(chosenSentences, chosenWords).slice(0, quota);
  }

  function wordDetails(card) {
    const payload = (card && card.payload) || {};
    const prompt = (card && card.prompt) || {};
    const definition = String(payload.def || prompt.zh || "").trim();
    return {
      en: String(payload.term || prompt.en || "").trim(),
      // Keep answer choices readable by preferring the concise glossary line;
      // retain the full dictionary definition for the review card.
      zh: String(payload.gloss || payload.meaning || prompt.zh || definition).trim(),
      def: definition,
      ipa: String(payload.ipa || "").trim(),
      pos: String(payload.pos || "").trim(),
      example: String(payload.example || card.example || prompt.example || "").trim(),
    };
  }

  function normalizeText(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  }

  function wordChoiceItems(target, pool, episode) {
    const seen = new Set([target.en.toLowerCase()]);
    const source = (Array.isArray(pool) ? pool : [])
      .filter((item) => item && (item.type === "word_review" || item.term || (item.payload && item.payload.term)))
      .map((item) => item.type === "word_review" ? wordDetails(item) : {
        en: normalizeText(item.term),
        zh: normalizeText(item.zh || item.def),
        ipa: normalizeText(item.ipa),
        pos: normalizeText(item.pos),
        example: normalizeText(item.example),
      });
    const distractors = stableCards(source.map((item, index) => ({ ...item, card_id: item.en, order: index })), `${episode}|${target.en}`)
      .filter((item) => {
        const key = item.en.toLowerCase();
        if (!key || seen.has(key) || !item.zh) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 3);
    return stableCards([target, ...distractors].map((item, index) => ({
      card_id: item.en,
      order: index,
      en: item.en,
      zh: item.zh,
    })), `${episode}|choices|${target.en}`).map(({ en, zh }) => ({ en, zh }));
  }

  function buildWordQuestion(card, pool, episode, direction = "zh_to_en") {
    const target = wordDetails(card);
    const mode = direction === "en_to_zh" ? "en_to_zh" : "zh_to_en";
    const choices = wordChoiceItems(target, pool, episode);
    return {
      type: "word_choice",
      kind: mode === "en_to_zh" ? "word_en_to_zh" : "word_zh_to_en",
      direction: mode,
      cardId: card && card.card_id,
      promptEn: mode === "en_to_zh"
        ? "Which Chinese meaning matches this word?"
        : "Which English word matches this meaning?",
      promptZh: mode === "en_to_zh" ? "选择这个单词的中文意思" : target.zh,
      target: { en: target.en, zh: target.zh },
      targetEn: target.en,
      targetZh: target.zh,
      answer: mode === "en_to_zh" ? target.zh : target.en,
      term: target.en,
      ipa: target.ipa,
      pos: target.pos,
      choices,
      answerEvidence: target.example || target.def,
      speech: { en: target.en, zh: target.zh },
    };
  }

  function buildWordReviewQuestion(card) {
    const target = wordDetails(card);
    return {
      type: "word_review",
      cardId: card && card.card_id,
      promptEn: "Word review",
      promptZh: "单词知识回顾",
      term: target.en,
      definition: target.def || target.zh,
      meaning: target.zh,
      ipa: target.ipa,
      pos: target.pos,
      example: target.example,
      speech: { en: target.en, zh: target.zh },
    };
  }

  function buildSentenceOrderQuestion(puzzle, episode) {
    const source = puzzle || {};
    const sentence = normalizeText(source.sentence || source.text_en || "");
    const answer = sentence ? sentence.split(" ").filter(Boolean) : [];
    const sentenceZh = normalizeText(
      source.sentence_zh || source.text_zh || source.clue_zh || source.clueZh || source.translation_zh || ""
    );
    // Story packs already carry a shuffled token list. Preserve that order so
    // every learner sees the same puzzle while keeping the answer derived from
    // the canonical sentence text.
    const shuffled = (Array.isArray(source.words) ? source.words : answer).map(normalizeText).filter(Boolean);
    return {
      type: "sentence_order",
      cardId: source.card_id || `sentence-order-${episode}-${sentence}`,
      promptEn: "Put the words in the correct order.",
      promptZh: normalizeText(source.text_zh || source.promptZh || "把单词排列成正确的句子"),
      sentence,
      words: shuffled,
      answer,
      speech: { en: sentence, zh: sentenceZh },
      clue: { en: sentence, zh: sentenceZh },
    };
  }

  function getSentenceOrderClue(question) {
    const source = question || {};
    const speech = source.speech && typeof source.speech === "object" ? source.speech : {};
    const zh = normalizeText(
      source.clueZh || source.clue_zh || speech.zh || source.sentence_zh || source.text_zh || ""
    );
    const en = normalizeText(
      source.clueEn || source.clue_en || speech.en || source.sentence || ""
    );
    if (zh) return { text: zh, lang: "zh-CN", source: "translation" };
    if (en) return { text: en, lang: "en", source: "sentence" };
    return { text: "", lang: "en", source: "" };
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function buildSentenceFillQuestion(source, pool, episode) {
    const item = source || {};
    const sentence = normalizeText(item.example || item.sentence || item.text_en || "");
    const requested = normalizeText(item.term || item.word || "");
    const match = requested && sentence.match(new RegExp(`\\b${escapeRegExp(requested)}\\b`, "i"));
    const blank = match ? match[0] : "";
    if (!sentence || !blank) return null;
    const target = {
      en: blank,
      zh: normalizeText(item.zh || item.def || ""),
      ipa: normalizeText(item.ipa),
      pos: normalizeText(item.pos),
    };
    const sourcePool = (Array.isArray(pool) ? pool : [])
      .map((entry) => entry && (entry.type === "word_review" ? wordDetails(entry) : {
        en: normalizeText(entry.term),
        zh: normalizeText(entry.zh || entry.def),
        ipa: normalizeText(entry.ipa),
        pos: normalizeText(entry.pos),
      }))
      .filter(Boolean)
      .filter((entry) => entry.en && entry.zh && entry.en.toLowerCase() !== target.en.toLowerCase());
    const distractors = stableCards(sourcePool.map((entry, index) => ({ ...entry, card_id: entry.en, order: index })), `${episode}|fill|${target.en}`)
      .slice(0, 3);
    const choices = stableCards([target, ...distractors].map((entry, index) => ({
      card_id: entry.en,
      order: index,
      en: entry.en,
      zh: entry.zh,
    })), `${episode}|fill-choices|${target.en}`).map(({ en, zh }) => ({ en, zh }));
    return {
      type: "sentence_fill",
      cardId: item.card_id || `sentence-fill-${episode}-${target.en}`,
      promptEn: "Complete the sentence with the missing word.",
      promptZh: normalizeText(item.text_zh || item.phrase_zh || "选择缺少的单词，补全句子"),
      sentence,
      sentenceWithBlank: sentence.replace(new RegExp(`\\b${escapeRegExp(requested)}\\b`, "i"), "_____"),
      blank: target.en,
      answer: target.en,
      answerEvidence: sentence,
      choices,
      speech: { en: sentence, zh: normalizeText(item.text_zh || item.phrase_zh || "") },
    };
  }

  function buildListenPictureQuestions(book, options = {}) {
    const source = book && typeof book === "object" ? book : {};
    const config = options && typeof options === "object" ? options : {};
    const nodes = Array.isArray(source.nodes) ? source.nodes : [];
    const countValue = Number.parseInt(config.count, 10);
    const count = Math.min(3, Math.max(1, Number.isFinite(countValue) ? countValue : 1));
    const choiceCount = Number.parseInt(config.choiceCount, 10) === 2 ? 2 : 4;
    const episode = Number.parseInt(source.episode, 10) || 1;
    const candidates = [];
    const seenNodeIds = new Set();
    const seenIllustrations = new Set();

    nodes.forEach((node, index) => {
      if (!node || !normalizeText(node.text_en) || !normalizeText(node.illustration)) return;
      const nodeId = normalizeText(node.node_id || node.nodeId || `listen-picture-${index + 1}`);
      const illustration = normalizeText(node.illustration);
      if (!nodeId || seenNodeIds.has(nodeId) || seenIllustrations.has(illustration)) return;
      seenNodeIds.add(nodeId);
      seenIllustrations.add(illustration);
      const from = Number(node.audio_start);
      const to = Number(node.audio_end);
      const hasSlice = Number.isFinite(from) && Number.isFinite(to) && to > from;
      candidates.push({
        node,
        nodeId,
        illustration,
        index,
        audio: hasSlice ? { from, to } : null,
        ttsFallback: !hasSlice,
      });
    });

    if (candidates.length < 2) return [];
    return candidates.slice(0, count).map((target) => {
      const distractors = candidates
        .filter((candidate) => candidate.nodeId !== target.nodeId)
        .slice()
        .sort((a, b) => {
          const distance = Math.abs(b.index - target.index) - Math.abs(a.index - target.index);
          return distance || stableScore(`${episode}|${target.nodeId}|${a.nodeId}`) - stableScore(`${episode}|${target.nodeId}|${b.nodeId}`);
        })
        .slice(0, choiceCount - 1);
      const optionNodes = stableCards(
        [target, ...distractors].map((candidate, index) => ({
          card_id: candidate.nodeId,
          order: index,
          nodeId: candidate.nodeId,
        })),
        `${episode}|listen-picture|${target.nodeId}`,
      ).map((candidate) => candidate.nodeId);
      return {
        type: "listen_picture",
        kind: "listen_picture",
        promptEn: "Which picture matches what you hear?",
        promptZh: "听一句原声，选出对应的画面",
        audio: target.audio,
        ttsFallback: target.ttsFallback,
        textEn: normalizeText(target.node.text_en),
        textZh: normalizeText(target.node.text_zh),
        correctNode: target.nodeId,
        options: optionNodes,
      };
    });
  }

  function getNextHref(episode) {
    const current = Math.max(1, Math.min(108, Number.parseInt(episode, 10) || 1));
    return current >= 108 ? "map.html" : `wala.html?ep=${current + 1}`;
  }

  return {
    SETTINGS_KEY,
    DEFAULT_SETTINGS,
    QUESTION_QUOTAS,
    DIFFICULTY_CAPS,
    STUDY_SESSION_VERSION,
    STUDY_WORD_LIMIT,
    normalizeSettings,
    getQuestionQuota,
    createStudySession,
    normalizeStudySession,
    getSessionWordTerms,
    isStudyComplete,
    evaluateLessonResult,
    choicePresentation,
    pickPuzzle,
    isCleanGloss,
    selectCards,
    buildWordQuestion,
    buildWordReviewQuestion,
    buildSentenceOrderQuestion,
    getSentenceOrderClue,
    buildSentenceFillQuestion,
    buildListenPictureQuestions,
    getNextHref,
  };
});
