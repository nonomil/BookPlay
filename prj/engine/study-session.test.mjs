import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sessionApi = require(fileURLToPath(new URL("./study-session.js", import.meta.url)));
const storageApi = require(fileURLToPath(new URL("./storage.js", import.meta.url)));

test("主动学习计时只累计可见且有学习活动的时间", () => {
  const clock = sessionApi.createStudySession({ thresholdMs: 1000 });
  clock.start(0);
  clock.tick(700, true);
  clock.tick(900, false);
  clock.tick(1200, true);
  assert.equal(clock.snapshot().activeMs, 1000);
  assert.equal(clock.snapshot().due, true);
});

test("达到阈值的休息提示只消费一次", () => {
  const clock = sessionApi.createStudySession({ thresholdMs: 1000 });
  clock.start(0);
  clock.tick(1000, true);
  assert.equal(clock.consumeBreakPrompt(), true);
  assert.equal(clock.consumeBreakPrompt(), false);
  assert.equal(clock.snapshot().prompted, true);
});

test("暂停和恢复不会把暂停期间算入主动学习时长", () => {
  const clock = sessionApi.createStudySession({ thresholdMs: 5000 });
  clock.start(100);
  clock.tick(1100, true);
  clock.pause(2000);
  clock.resume(9000);
  clock.tick(9500, true);
  assert.equal(clock.snapshot().activeMs, 1500);
});

test("恢复坏存档时钳制数字并保留安全默认值", () => {
  const clock = sessionApi.createStudySession({ thresholdMs: 1500 });
  clock.restore({ activeMs: "not-a-number", prompted: "yes", thresholdMs: -1 }, 200);
  assert.deepEqual(clock.snapshot(), {
    activeMs: 0,
    thresholdMs: 1500,
    running: false,
    prompted: false,
    due: false,
  });
});

test("学习会话存档使用独立的版本化键", () => {
  const values = new Map();
  const fakeStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
  const storage = storageApi.create(fakeStorage);
  assert.deepEqual(storage.readStudySession(), {});
  storage.writeStudySession({ activeMs: 1234, prompted: false });
  assert.deepEqual(storage.readStudySession(), { activeMs: 1234, prompted: false });
  assert.equal(values.has("bookplay_study_session_v1"), true);
});
