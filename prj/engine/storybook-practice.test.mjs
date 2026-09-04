import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const practice = require(fileURLToPath(new URL("./storybook-practice.js", import.meta.url)));

const book = {
  pages: [
    { sentences: [{ id: "s1", glossary: [{ term: "wolf", zh: "狼" }, { term: "ready", zh: "准备好的" }] }] },
    { sentences: [{ id: "s2", glossary: [{ term: "wolf", zh: "狼" }, { term: "jump", zh: "跳" }] }] },
  ],
};

test("review words dedupe first occurrence and prioritize wrong/tapped terms", () => {
  const words = practice.buildReviewWords(book, { wrongIds: ["s2"], tappedTerms: ["ready"], max: 6 });
  assert.deepEqual(words.map((w) => w.term), ["jump", "ready", "wolf"]);
});

test("normalizeQuestion maps legacy data and rejects invalid answers", () => {
  assert.deepEqual(practice.normalizeQuestion({ q: "What?", choices: ["A", "B"], answer: 1 }, 0), {
    id: "question-1",
    type: "multiple-choice",
    source_sentence_id: "",
    prompt_en: "What?",
    prompt_zh: "",
    choices: ["A", "B"],
    answer: 1,
    explanation: "",
  });
  assert.equal(practice.normalizeQuestion({ q: "bad", choices: ["A"], answer: 3 }, 0), null);
});

test("normalizeQuestion preserves Chinese hint translations without showing them by default", () => {
  assert.deepEqual(practice.normalizeQuestion({
    q: "Which way should we go?",
    q_zh: "我们应该走哪条路？",
    choices: ["Left", "Right"],
    choices_zh: ["左边", "右边"],
    answer: 1,
  }, 0), {
    id: "question-1",
    type: "multiple-choice",
    source_sentence_id: "",
    prompt_en: "Which way should we go?",
    prompt_zh: "我们应该走哪条路？",
    choices: ["Left", "Right"],
    choices_zh: ["左边", "右边"],
    answer: 1,
    explanation: "",
  });
});

test("quizDisplay separates English content from on-demand Chinese hint", () => {
  assert.deepEqual(practice.quizDisplay({
    q: "What did they find?",
    q_zh: "他们找到了什么？",
    choices: ["A key", "A map"],
    choices_zh: ["一把钥匙", "一张地图"],
  }), {
    promptEn: "What did they find?",
    promptZh: "他们找到了什么？",
    choicesEn: ["A key", "A map"],
    choicesZh: ["一把钥匙", "一张地图"],
  });
});

test("normalizeQuestion preserves all authored replay evidence", () => {
  const normalized = practice.normalizeQuestion({
    id: "q-evidence",
    type: "comprehension",
    concept_id: "escape-by-portal",
    scene_id: "scene-02",
    source_sentence_id: "s2",
    source_sentence_ids: ["s1", "s2"],
    prompt_en: "How do they escape?",
    prompt_zh: "他们如何逃脱？",
    choices: ["By portal", "By boat"],
    choices_zh: ["通过传送门", "乘船"],
    answer: 0,
  });
  assert.equal(normalized.concept_id, "escape-by-portal");
  assert.equal(normalized.scene_id, "scene-02");
  assert.equal(normalized.source_sentence_id, "s2");
  assert.deepEqual(normalized.source_sentence_ids, ["s1", "s2"]);
});

test("answerQuestion scores a question once even when submitted repeatedly", () => {
  const state = practice.createPracticeState([{ id: "q1", choices: ["A", "B"], answer: 1 }]);
  const answered = practice.answerQuestion(state, 1);
  const repeated = practice.answerQuestion(answered, 0);
  assert.equal(answered.correct, 1);
  assert.equal(repeated.correct, 1);
  assert.equal(repeated.answers.q1.choice, 1);
});

test("practiceSummary returns total, correct, wrong ids and percent", () => {
  const state = practice.createPracticeState([
    { id: "q1", choices: ["A", "B"], answer: 0 },
    { id: "q2", choices: ["A", "B"], answer: 1 },
  ]);
  const done = practice.answerQuestion(practice.answerQuestion(state, 0), 0);
  assert.deepEqual(practice.practiceSummary(done), { total: 2, correct: 1, wrongIds: ["q2"], percent: 50 });
});

test("empty or malformed practice data returns a safe empty state", () => {
  const state = practice.createPracticeState([null, { q: "bad", choices: [], answer: 0 }]);
  assert.equal(state.questions.length, 0);
  assert.deepEqual(practice.practiceSummary(state), { total: 0, correct: 0, wrongIds: [], percent: 0 });
});
