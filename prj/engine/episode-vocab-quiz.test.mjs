import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const quiz = require(fileURLToPath(new URL("./episode-vocab-quiz.js", import.meta.url)));

const questions = [
  { id: "q1", term: "adventure", q: "adventure 是什么？", choices: ["冒险", "学校", "帽子"], answer: 0 },
  { id: "q2", term: "helmet", q: "helmet 是什么？", choices: ["剑", "头盔", "河流"], answer: 1 },
  { id: "q3", term: "escape", q: "escape 是什么？", choices: ["逃跑", "光", "石头"], answer: 0 },
  { id: "q4", term: "river", q: "river 是什么？", choices: ["学校", "河流", "洞穴"], answer: 1 },
  { id: "q5", term: "light", q: "light 是什么？", choices: ["光", "鞋子", "老师"], answer: 0 },
];

test("gradeRules 给出年级题量和题型", () => {
  assert.deepEqual(quiz.gradeRules(1), { min: 3, max: 5, types: ["listen-choice", "meaning-choice"] });
  assert.deepEqual(quiz.gradeRules(4), { min: 5, max: 9, types: ["meaning-choice", "listen-choice", "context-fill"] });
  assert.deepEqual(quiz.gradeRules(6), { min: 7, max: 14, types: ["meaning-choice", "context-fill", "listen-choice", "shadow"] });
});

test("buildEpisodeQuiz 按固定种子稳定抽题并保留 term/句子/音频字段", () => {
  const options = { grade: 1, seed: "mc-book-1" };
  const first = quiz.buildEpisodeQuiz(questions, options);
  const second = quiz.buildEpisodeQuiz(questions, options);
  assert.deepEqual(first, second);
  assert.equal(first.length, 3);
  assert.ok(first.every((item) => item.term && Array.isArray(item.choices) && Number.isInteger(item.answer)));
});

test("scoreEpisodeQuiz 只按答题结果计算掌握度，70% 才通过", () => {
  const result = quiz.scoreEpisodeQuiz(questions, { q1: 0, q2: 1, q3: 2, q4: 1, q5: 2 });
  assert.equal(result.total, 5);
  assert.equal(result.correct, 3);
  assert.equal(result.percent, 60);
  assert.equal(result.passed, false);
  assert.deepEqual(result.wrong_terms, ["escape", "light"]);
  const passed = quiz.scoreEpisodeQuiz(questions, { q1: 0, q2: 1, q3: 0, q4: 1, q5: 2 });
  assert.equal(passed.passed, true);
  assert.deepEqual(passed.mastered_terms, ["adventure", "helmet", "escape", "river"]);
});

test("questionTerm 从现有西游记/Minecraft 的带引号题干提取重点词", () => {
  assert.equal(quiz.questionTerm({ q: "「split open」 是什么意思？" }), "split open");
  assert.equal(quiz.questionTerm({ prompt_en: "What does “detention” mean?" }), "detention");
  assert.equal(quiz.questionTerm({ q: "Where are they?" }), "");
});

test("normalizeQuestion keeps q_zh and choices_zh for a hidden hint", () => {
  const normalized = quiz.buildEpisodeQuiz([{
    q: "Where is the portal?",
    q_zh: "传送门在哪里？",
    choices: ["In the forest", "At school"],
    choices_zh: ["在森林里", "在学校"],
    answer: 0,
  }], { grade: 1, intensity: "light" });
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].prompt_en, "Where is the portal?");
  assert.equal(normalized[0].prompt_zh, "传送门在哪里？");
  assert.deepEqual(normalized[0].choices_zh, ["在森林里", "在学校"]);
});

test("normalizeQuestion preserves authored evidence and does not infer a term for comprehension", () => {
  const normalized = quiz.buildEpisodeQuiz([{
    id: "q-helicopter",
    type: "comprehension",
    concept_id: "escape-by-rooftop-helicopter",
    source_sentence_ids: ["b1-p02-s04"],
    prompt_en: "Where do Mikey and JJ need to go to escape the zombies?",
    choices_en: ["By helicopter", "By boat"],
    answer: 0,
  }], { grade: 1, intensity: "light", targetTerms: ["helicopter"] });
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].concept_id, "escape-by-rooftop-helicopter");
  assert.deepEqual(normalized[0].source_sentence_ids, ["b1-p02-s04"]);
  assert.equal(normalized[0].term, undefined);
});

test("quizDisplay converts legacy Chinese quiz choices to English while retaining them for the hint", () => {
  assert.deepEqual(quiz.quizDisplay({
    q: "「river」 是什么意思？",
    choices: ["光", "巨大的", "河"],
    answer: 2,
  }), {
    promptEn: 'What does "river" mean?',
    promptZh: "「river」 是什么意思？",
    choicesEn: ["light", "huge", "river"],
    choicesZh: ["光", "巨大的", "河"],
  });
  assert.equal(quiz.quizDisplay({
    prompt_en: "「river」 是什么意思？",
    choices: ["光", "河"],
  }).promptEn, 'What does "river" mean?');
  assert.equal(quiz.quizDisplay({
    q: "Where do Mikey and JJ need to go to escape the zombies?",
    choices: ["操场上的滑梯", "屋顶的直升机"],
  }).promptZh, "Mikey 和 JJ 需要去哪里躲避僵尸？");
});
