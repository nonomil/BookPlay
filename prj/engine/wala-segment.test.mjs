import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const js = fs.readFileSync(new URL("./wala.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("./wala.css", import.meta.url), "utf8");
const lessonJs = fs.readFileSync(new URL("./lesson.js", import.meta.url), "utf8");
const reviewQueueJs = fs.readFileSync(new URL("./review-queue.js", import.meta.url), "utf8");

test("study playback uses a bounded checkpoint plan instead of testing every node", () => {
  assert.match(js, /buildCheckpointPlan/);
  assert.match(js, /checkpointPlan/);
  assert.match(js, /studyActsFor[\s\S]*checkpointPlan\.byIndex/);
});

test("inline checkpoint feedback exposes segment progress and a continue path", () => {
  assert.match(js, /本段小测/);
  assert.match(js, /跳过本题/);
  assert.match(js, /继续播放/);
  assert.match(css, /\.w-quiz-progress/);
});

test("finishing an inline checkpoint resumes the next story node", () => {
  assert.match(js, /inlineQueued/);
  assert.match(js, /inlineQueued[\s\S]*nextListenIndex\(idx\)/);
});

test("a missed vocabulary item can return as a next-episode warm-up", () => {
  assert.match(reviewQueueJs, /bookplay_carryover_review_v1/);
  assert.match(lessonJs, /reviewQueue\.enqueue\(/);
  assert.match(lessonJs, /targetEn/);
  assert.match(js, /readCarryoverReview/);
  assert.match(js, /上集回顾/);
});
