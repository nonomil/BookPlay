import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const listenApi = require(fileURLToPath(new URL("./listen-mode.js", import.meta.url)));

test("循环次数只允许 1/2/3，字幕模式有安全默认值", () => {
  assert.deepEqual(listenApi.normalizeListenOptions({ loops: 9, subtitle: "bad" }), {
    loops: 2,
    subtitle: "en",
    autoStop: true,
  });
  assert.deepEqual(listenApi.normalizeListenOptions({ loops: 3, subtitle: "enzh", autoStop: false }), {
    loops: 3,
    subtitle: "enzh",
    autoStop: false,
  });
});

test("每遍从第一句开始，最后一句后进入下一遍", () => {
  const run = listenApi.createListenSession({ loops: 2, beforeIndex: 7 });
  const indexes = [2, 4, 9];
  assert.deepEqual(run.advance(2, indexes), { action: "play", index: 4, loop: 1 });
  assert.deepEqual(run.advance(9, indexes), { action: "play", index: 2, loop: 2 });
  assert.deepEqual(run.advance(9, indexes), { action: "done", index: null, loop: 2 });
  assert.equal(run.snapshot().beforeIndex, 7);
});

test("退出保留进入前位置，暂停恢复不改变循环进度", () => {
  const run = listenApi.createListenSession({ loops: 3, beforeIndex: 11 });
  run.advance(2, [2, 5]);
  run.pause();
  assert.equal(run.snapshot().status, "paused");
  run.resume();
  assert.equal(run.snapshot().status, "playing");
  const exited = run.exit();
  assert.deepEqual(exited, { action: "exit", index: 11, loop: 1 });
});
