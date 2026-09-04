"use strict";

(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WalaQuiz = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function quizFactory() {
  const QUESTION_STOP = new Set([
    "what", "how", "why", "where", "who", "when", "did", "does", "the", "and", "for",
    "was", "were", "wukong", "monkey", "you", "your", "his", "her", "him", "they",
    "them", "this", "that", "with", "from", "have", "has", "had", "been", "being",
    "about", "than", "not", "come", "came", "out", "make", "take", "get", "got",
    "which", "true", "asked", "will", "can", "could", "would", "should", "their",
    "then", "some", "more", "only", "just", "also", "into", "onto",
  ]);

  function quizTokens(value) {
    return new Set((String(value || "").toLowerCase().match(/[a-z0-9']+/g) || [])
      .filter((word) => word.length > 2));
  }

  function prefixCovers(nodes, endIndex, need, phrase, minRatio, isListenNode, normSent) {
    const raw = normSent(phrase).toLowerCase().replace(/[.\s]+$/, "");
    if (!need || !need.size) return true;
    const seen = new Set();
    for (let index = 0; index <= endIndex && index < nodes.length; index++) {
      const node = nodes[index];
      if (!isListenNode(node)) continue;
      const text = node.text_en || "";
      if (raw && text.toLowerCase().includes(raw)) return true;
      quizTokens(text).forEach((word) => seen.add(word));
    }
    let hits = 0;
    need.forEach((word) => { if (seen.has(word)) hits++; });
    return hits / need.size >= minRatio;
  }

  function firstCovered(nodes, qcore, answer, start, isListenNode, normSent) {
    const answerTokens = quizTokens(answer);
    for (let index = Math.max(0, start); index < nodes.length; index++) {
      if (!isListenNode(nodes[index])) continue;
      if (prefixCovers(nodes, index, answerTokens, answer, 0.8, isListenNode, normSent)
          && prefixCovers(nodes, index, qcore, "", 0.66, isListenNode, normSent)) return index;
    }
    return -1;
  }

  function rehomeOne(nodes, question, oldIndex, isListenNode, normSent) {
    const answer = (question.choices || [])[question.answer] || "";
    const qcore = new Set([...quizTokens(question.q)]
      .filter((word) => word.length > 3 && !QUESTION_STOP.has(word)));
    const answerOk = oldIndex >= 0 && prefixCovers(nodes, oldIndex, quizTokens(answer), answer, 0.8, isListenNode, normSent);
    const questionOk = oldIndex >= 0 && prefixCovers(nodes, oldIndex, qcore, "", 0.66, isListenNode, normSent);
    if (answerOk && questionOk) return oldIndex;
    const later = firstCovered(nodes, qcore, answer, oldIndex + 1, isListenNode, normSent);
    if (later >= 0) return later;
    return oldIndex >= 0 ? oldIndex : firstCovered(nodes, qcore, answer, 0, isListenNode, normSent);
  }

  function rehomePlotQuizzes(options) {
    const nodes = options.nodes || [];
    const placed = [];
    nodes.forEach((node, index) => {
      if (node.quiz_after) placed.push({ question: node.quiz_after, from: index });
    });
    const seen = new Set(placed.map((item) => item.question.q));
    (options.officialQuiz || []).forEach((question) => {
      if (question && question.q && !seen.has(question.q)) placed.push({ question, from: -1 });
    });
    const result = {};
    placed.forEach(({ question, from }) => {
      const preferred = rehomeOne(nodes, question, from, options.isListenNode, options.normSent);
      let index = preferred;
      while (index >= 0 && index < nodes.length) {
        if (options.isListenNode(nodes[index]) && !result[index]) {
          result[index] = question;
          return;
        }
        index++;
      }
      if (preferred >= 0) result[preferred] = question;
    });
    return result;
  }

  function shuffled(values, random) {
    const result = values.slice();
    for (let index = result.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1));
      [result[index], result[other]] = [result[other], result[index]];
    }
    return result;
  }

  function buildReviewQuestion(options) {
    const distractors = [...new Set(options.distractors || [])]
      .filter((value) => value && value !== options.zh).slice(0, 2);
    while (distractors.length < 2) distractors.push(distractors[0] || "……");
    const choices = shuffled([options.zh, ...distractors], options.random || Math.random);
    return {
      q: `「${options.term}」是什么意思？`,
      q_zh: `${options.term} 是什么意思？`,
      choices,
      choices_zh: choices,
      answer: choices.indexOf(options.zh),
      review_term: options.term,
    };
  }

  return { QUESTION_STOP, quizTokens, rehomePlotQuizzes, buildReviewQuestion };
});
