(function exposeStorybookPractice(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BookPlayStorybookPractice = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function storybookPracticeFactory() {
  "use strict";

  function normalizeTerm(value) {
    return String(value || "").trim().toLowerCase();
  }

  function buildReviewWords(book, { wrongIds = [], tappedTerms = [], max = 6 } = {}) {
    const wrong = new Set((wrongIds || []).map(String));
    const tapped = new Set((tappedTerms || []).map(normalizeTerm));
    const entries = new Map();
    let order = 0;
    const pages = book && Array.isArray(book.pages) ? book.pages : [];
    pages.forEach((page) => {
      const sentences = Array.isArray(page && page.sentences) ? page.sentences : [page];
      sentences.forEach((sentence) => {
        const sentenceId = sentence && sentence.id != null ? String(sentence.id) : "";
        (sentence && Array.isArray(sentence.glossary) ? sentence.glossary : []).forEach((glossary) => {
          const key = normalizeTerm(glossary && glossary.term);
          if (!key || entries.has(key)) {
            if (key && entries.has(key) && wrong.has(sentenceId)) entries.get(key).priority = Math.max(entries.get(key).priority, 1);
            return;
          }
          const isWrong = wrong.has(sentenceId);
          const isTapped = tapped.has(key);
          entries.set(key, {
            ...glossary,
            term: String(glossary.term || "").trim(),
            priority: isWrong ? 3 : (isTapped ? 2 : 0),
            firstOrder: order++,
          });
        });
      });
    });
    return [...entries.values()]
      .sort((a, b) => b.priority - a.priority || a.firstOrder - b.firstOrder)
      .slice(0, Math.max(0, Number(max) || 6));
  }

  function normalizeQuestion(question, index = 0) {
    if (!question || !Array.isArray(question.choices)) return null;
    const choices = [];
    const choicesZh = [];
    const rawChoicesZh = Array.isArray(question.choices_zh) ? question.choices_zh : [];
    const originalToNormalized = new Map();
    question.choices.forEach((choice, originalIndex) => {
      const text = String(choice == null ? "" : choice).trim();
      if (!text) return;
      const translation = String(rawChoicesZh[originalIndex] == null ? "" : rawChoicesZh[originalIndex]).trim();
      if (!choices.includes(text)) {
        originalToNormalized.set(originalIndex, choices.length);
        choices.push(text);
        choicesZh.push(translation);
      } else {
        const normalizedIndex = choices.indexOf(text);
        originalToNormalized.set(originalIndex, normalizedIndex);
        if (!choicesZh[normalizedIndex] && translation) choicesZh[normalizedIndex] = translation;
      }
    });
    const rawAnswer = Number(question.answer);
    if (!choices.length || !Number.isInteger(rawAnswer) || !originalToNormalized.has(rawAnswer)) return null;
    const answer = originalToNormalized.get(rawAnswer);
    const normalized = {
      id: String(question.id || `question-${Number(index) + 1}`),
      type: String(question.type || "multiple-choice"),
      source_sentence_id: String(question.source_sentence_id || ""),
      prompt_en: String(question.prompt_en || question.q || ""),
      prompt_zh: String(question.prompt_zh || question.q_zh || ""),
      choices,
      answer,
      explanation: String(question.explanation || ""),
    };
    if (choicesZh.some(Boolean)) normalized.choices_zh = choicesZh;
    if (question.term) normalized.term = String(question.term).trim();
    if (question.audio) normalized.audio = question.audio;
    if (question.source_text_en) normalized.source_text_en = String(question.source_text_en);
    if (Array.isArray(question.source_sentence_ids) && question.source_sentence_ids.length) {
      normalized.source_sentence_ids = question.source_sentence_ids.map((value) => String(value)).filter(Boolean);
    }
    if (question.scene_id) normalized.scene_id = String(question.scene_id);
    if (question.concept_id) normalized.concept_id = String(question.concept_id);
    return normalized;
  }

  function quizDisplay(question) {
    const source = question && typeof question === "object" ? question : {};
    const choicesEn = (Array.isArray(source.choices) ? source.choices : [])
      .map((choice) => String(choice == null ? "" : choice).trim())
      .filter(Boolean);
    const rawChoicesZh = Array.isArray(source.choices_zh) ? source.choices_zh : [];
    return {
      promptEn: String(source.prompt_en || source.q || "").trim(),
      promptZh: String(source.prompt_zh || source.q_zh || "").trim(),
      choicesEn,
      choicesZh: choicesEn.map((_, index) => String(rawChoicesZh[index] == null ? "" : rawChoicesZh[index]).trim()),
    };
  }

  function createPracticeState(questions) {
    const normalized = (Array.isArray(questions) ? questions : [])
      .map((question, index) => normalizeQuestion(question, index))
      .filter(Boolean);
    return {
      questions: normalized,
      index: 0,
      answers: {},
      correct: 0,
      started: normalized.length > 0,
      finished: normalized.length === 0,
    };
  }

  function answerQuestion(state, choiceIndex) {
    if (!state || !Array.isArray(state.questions)) return createPracticeState([]);
    const question = state.questions[state.index];
    if (!question) return { ...state, finished: true };
    const existing = state.answers && state.answers[question.id];
    if (existing) return state;
    const choice = Number(choiceIndex);
    const validChoice = Number.isInteger(choice) && choice >= 0 && choice < question.choices.length;
    if (!validChoice) return state;
    const isCorrect = choice === question.answer;
    const answers = {
      ...(state.answers || {}),
      [question.id]: { choice, correct: isCorrect },
    };
    return {
      ...state,
      answers,
      correct: Number(state.correct || 0) + (isCorrect ? 1 : 0),
      lastResult: { questionId: question.id, choice, correct: isCorrect },
    };
  }

  function practiceSummary(state) {
    const questions = state && Array.isArray(state.questions) ? state.questions : [];
    const answers = state && state.answers ? state.answers : {};
    const correct = questions.reduce((sum, question) => sum + (answers[question.id] && answers[question.id].correct ? 1 : 0), 0);
    const wrongIds = questions.filter((question) => !(answers[question.id] && answers[question.id].correct)).map((question) => question.id);
    const total = questions.length;
    return {
      total,
      correct,
      wrongIds,
      percent: total ? Math.round((correct / total) * 100) : 0,
    };
  }

  return {
    buildReviewWords,
    normalizeQuestion,
    quizDisplay,
    createPracticeState,
    answerQuestion,
    practiceSummary,
  };
}));
