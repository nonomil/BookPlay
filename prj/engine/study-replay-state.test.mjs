import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const state = require(fileURLToPath(new URL("./study-replay-state.js", import.meta.url)));

const contract = {
  series: "minecraft",
  episode: "mc-book-1",
  sceneIds: ["s01", "s02"],
  targetTerms: ["adventure", "helmet"],
};

test("空存档归一化出两遍制字段并保留旧字段", () => {
  const result = state.normalizeEpisodeState({ done: false, page: 2 }, contract);
  assert.equal(result.done, false);
  assert.equal(result.page, 2);
  assert.deepEqual(result.study_replay.queue_scene_ids, []);
  assert.deepEqual(result.study_replay.completed_scene_ids, []);
  assert.deepEqual(result.vocab.target_terms, ["adventure", "helmet"]);
  assert.deepEqual(result.vocab.seen_terms, []);
  assert.deepEqual(result.vocab.mastered_terms, []);
  assert.deepEqual(result.quiz, { attempts: 0, best_score: 0, passed: false, last_wrong_terms: [] });
  assert.deepEqual(result.completion, {
    card_shown: false,
    confetti_shown: false,
    sp_granted: false,
    sticker_granted: false,
    room_item_granted: false,
    reward_item_id: null,
  });
});

test("scene 队列和词卡事件只接受合同中的 scene/term", () => {
  let result = state.normalizeEpisodeState({}, contract);
  result = state.setReplayQueue(result, ["s01", "bad", "s01", "s02"], contract);
  assert.deepEqual(result.study_replay.queue_scene_ids, ["s01", "s02"]);
  result = state.markSceneComplete(result, "s01", contract);
  result = state.markSceneComplete(result, "bad", contract);
  assert.deepEqual(result.study_replay.completed_scene_ids, ["s01"]);
  result = state.markTermSeen(result, "adventure", contract);
  result = state.markTermSeen(result, "ADVENTURE", contract);
  result = state.markTermSeen(result, "unknown", contract);
  assert.deepEqual(result.vocab.seen_terms, ["adventure"]);
});

test("seen 不会冒充 mastered，答题才更新 right/wrong 词状态", () => {
  let result = state.normalizeEpisodeState({}, contract);
  result = state.markTermSeen(result, "helmet", contract);
  result = state.recordQuizTerm(result, "helmet", false, contract);
  assert.deepEqual(result.vocab.seen_terms, ["helmet"]);
  assert.deepEqual(result.vocab.mastered_terms, []);
  assert.deepEqual(result.vocab.wrong_terms, ["helmet"]);
  result = state.recordQuizTerm(result, "helmet", true, contract);
  assert.deepEqual(result.vocab.mastered_terms, ["helmet"]);
  assert.deepEqual(result.vocab.wrong_terms, []);
});

test("重复事件幂等且不会重复累加测验尝试", () => {
  let result = state.normalizeEpisodeState({}, contract);
  result = state.recordQuiz(result, { score: 0.8, passed: true, wrongTerms: [] });
  result = state.recordQuiz(result, { score: 0.8, passed: true, wrongTerms: [] });
  assert.equal(result.quiz.attempts, 2);
  assert.equal(result.quiz.best_score, 0.8);
  assert.equal(result.quiz.passed, true);
  result = state.markReward(result, "sp_granted");
  const repeated = state.markReward(result, "sp_granted");
  assert.equal(repeated.completion.sp_granted, true);
  assert.deepEqual(repeated.completion, result.completion);
});

test("旧版 practice 存档可迁移到 quiz，不创建幽灵记录", () => {
  const old = { practice: { attempts: 2, best_correct: 3, total: 4, last_wrong_ids: ["q2"] } };
  const result = state.normalizeEpisodeState(old, { ...contract, sceneIds: [], targetTerms: [] });
  assert.equal(result.quiz.attempts, 2);
  assert.equal(result.quiz.best_score, 0.75);
  assert.deepEqual(result.quiz.last_wrong_terms, ["q2"]);
  assert.deepEqual(state.markSceneComplete(result, "ghost", contract).study_replay.completed_scene_ids, []);
});
