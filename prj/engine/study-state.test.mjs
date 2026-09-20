import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { readStepDone, firstUndoneStep, STEPS_TOTAL } = require(
  fileURLToPath(new URL("./study-state.js", import.meta.url)),
);

function fakeStorage(initial = {}) {
  const map = { ...initial };
  return {
    getItem: (key) => (key in map ? map[key] : null),
    setItem: (key, value) => { map[key] = String(value); },
  };
}

const EMPTY = {};

test("精读五步信号：空存储全为未完成，当前步 = 01 看故事", () => {
  const store = fakeStorage(EMPTY);
  assert.deepEqual(readStepDone(1, store), [false, false, false, false, false]);
  assert.equal(firstUndoneStep(1, store), 0);
  assert.equal(STEPS_TOTAL, 5);
});

test("五步信号各自来自既有存储，互不串扰", () => {
  const store = fakeStorage({
    "bookplay_adv_progress": JSON.stringify({ 3: { node: 2 } }),
    "bookplay_story_progress": JSON.stringify({ 3: { page: 5 } }),
    "bookplay_lesson_word_study_v1": JSON.stringify({ ep003: { done: true } }),
    "bookplay_dub_v1": JSON.stringify({ ep003: { scene_a: { stars: 2 } } }),
  });
  assert.deepEqual(readStepDone(3, store), [true, true, true, false, true],
    "04 理解挑战只认 adv.done（lesson 70% 阈值）");
  assert.equal(firstUndoneStep(3, store), 3);
});

test("全部完成后返回 STEPS_TOTAL（课堂显示 ALL DONE）", () => {
  const store = fakeStorage({
    "bookplay_adv_progress": JSON.stringify({ 7: { done: true, node: 9 } }),
    "bookplay_lesson_word_study_v1": JSON.stringify({ ep007: { done: true } }),
    "bookplay_study_shell": JSON.stringify({ 7: { method: true, output: true } }),
    "bookplay_dub_v1": JSON.stringify({ ep007: { s1: {} } }),
  });
  assert.equal(firstUndoneStep(7, store), STEPS_TOTAL);
});

test("无存储环境（隐私模式）安全降级为全未完成", () => {
  assert.deepEqual(readStepDone(2, null), [false, false, false, false, false]);
  assert.equal(firstUndoneStep(2, null), 0);
});
