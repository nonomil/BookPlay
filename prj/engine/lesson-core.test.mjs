import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import core from "./lesson-core.js";

function word(id, term, zh = `${term} 的意思`) {
  return {
    card_id: id,
    type: "word_review",
    stage: "episode_complete",
    review_status: "machine_verified",
    grade_bands: ["g1_2", "g3_4", "g5_6"],
    difficulty: 1,
    prompt: { en: term, zh },
    payload: { term, gloss: zh, def: zh },
  };
}

test("episode maps to the JTTW collection drill href, never ?ep=", () => {
  assert.equal(core.collectionIdForEpisode(1), "c01");
  assert.equal(core.collectionIdForEpisode(7), "c01");
  assert.equal(core.collectionIdForEpisode(8), "c02");
  assert.equal(core.collectionIdForEpisode(54), "c07");
  assert.equal(core.collectionIdForEpisode(108), "c13");
  assert.equal(core.isCollectionLastEpisode(7), true);
  assert.equal(core.isCollectionLastEpisode(6), false);
  assert.equal(core.drillHrefForEpisode(3), "drill.html?c=c01");
  assert.doesNotMatch(core.drillHrefForEpisode(3), /[?&]ep=/);
});

test("lesson result page never links drill.html?ep=", () => {
  const js = readFileSync(new URL("./lesson.js", import.meta.url), "utf8");
  assert.doesNotMatch(js, /drill\.html\?ep=/);
  assert.match(js, /drillHrefForEpisode/);
  assert.match(js, /去本辑巩固/);
});

test("study session chooses one stable word set for study and quiz", () => {
  const cards = [word("w1", "river"), word("w2", "stone"), word("w3", "climb")];
  const session = core.createStudySession({
    episode: 2,
    cards,
    settings: { gradeBand: "g3_4", intensity: "standard" },
    now: "2026-09-03T00:00:00.000Z",
  });
  assert.equal(session.version, 2);
  assert.equal(session.episode, 2);
  assert.deepEqual(session.words.map((item) => item.term).sort(), ["climb", "river", "stone"]);
  assert.deepEqual(core.getSessionWordTerms(session).sort(), ["climb", "river", "stone"]);
  assert.equal(session.studyDone, false);
});

test("normalize session rejects another episode and preserves progress fields", () => {
  const normalized = core.normalizeStudySession({
    version: 2,
    episode: 3,
    words: [{ cardId: "w1", term: "river", zh: "河流" }],
    studyDone: true,
    quiz: { current: 2, correct: 1, answers: [{ ok: true }] },
  });
  assert.equal(normalized.version, 2);
  assert.equal(normalized.studyDone, true);
  assert.equal(normalized.quiz.current, 2);
  assert.equal(normalized.quiz.correct, 1);
  assert.deepEqual(core.getSessionWordTerms(normalized), ["river"]);
  assert.equal(core.isStudyComplete(normalized, 2), false);
  assert.equal(core.isStudyComplete(normalized, 3), true);
});

test("normalize session keeps an older schema version visible for rebuild", () => {
  const normalized = core.normalizeStudySession({
    version: 1,
    episode: 2,
    words: [{ cardId: "w1", term: "river", zh: "河流" }],
    studyDone: true,
  });
  assert.equal(normalized.version, 1);
  assert.notEqual(normalized.version, core.STUDY_SESSION_VERSION);
});

test("lesson pass requires at least one correct answer and 70 percent", () => {
  assert.deepEqual(core.evaluateLessonResult(0, 0), { passed: false, ratio: 0, correct: 0, total: 0 });
  assert.equal(core.evaluateLessonResult(1, 2).passed, false);
  assert.equal(core.evaluateLessonResult(2, 3).passed, false);
  assert.equal(core.evaluateLessonResult(3, 4).passed, true);
  assert.equal(core.evaluateLessonResult(7, 7).passed, true);
});

test("choice presentation does not leak English answer in English-to-Chinese mode", () => {
  const result = core.choicePresentation(
    { en: "begin", zh: "开始" },
    { type: "word_choice", direction: "en_to_zh" },
  );
  assert.deepEqual(result, { primary: "开始", secondary: "", primaryLang: "zh-CN", secondaryLang: "zh-CN" });
});

test("puzzle picker prefers a bilingual usable puzzle and has an English fallback", () => {
  const puzzles = [
    { sentence: "A short sentence", words: ["sentence", "short", "A"] },
    { sentence: "The monkey jumps.", text_zh: "猴子跳起来。", words: ["jumps.", "The", "monkey"] },
  ];
  const selected = core.pickPuzzle(puzzles, 4);
  assert.equal(selected.text_zh, "猴子跳起来。");
  assert.deepEqual(core.pickPuzzle([{ sentence: "The monkey jumps.", words: ["jumps.", "The", "monkey"] }], 4).words, ["jumps.", "The", "monkey"]);
});
