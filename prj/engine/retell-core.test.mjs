import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Core from "./retell-core.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, name), "utf8");

function node(id, illust, textEn) {
  return { type: "narration", node_id: id, illustration: illust, text_en: textEn, text_zh: `中文${id}` };
}

function episode() {
  return [
    node("n001", "assets/adv_frames/ep1/f1.jpg", "short"),
    node("n002", "assets/adv_frames/ep1/f2.jpg", "middle size text"),
    node("n003", "assets/adv_frames/ep1/f3.jpg", "longest text of all scenes here"),
    node("d01", "dialogue"), // 非叙述节点忽略
    node("n004", "assets/adv_frames/ep1/f0.jpg", "tiny"),
    node("n005", "assets/adv_frames/ep1/f1.jpg", "repeat frame"),
    { type: "choice", node_id: "q1" }, // 题目节点忽略
  ];
}

test("buildRetellScenes：唯一插画按首次出现排序，提示句取最长", () => {
  const sentEnIndex = { "longest text of all scenes here": "assets/adv_audio/sent_en/abc.mp3" };
  const scenes = Core.buildRetellScenes(episode(), { sentEnIndex });
  assert.equal(scenes.length, 4);
  assert.deepEqual(scenes.map((s) => s.illustration), ["f1.jpg", "f2.jpg", "f3.jpg", "f0.jpg"].map((f) => `assets/adv_frames/ep1/${f}`));
  assert.equal(scenes[2].hintEn, "longest text of all scenes here");
  assert.equal(scenes[2].hintAudio, "assets/adv_audio/sent_en/abc.mp3", "提示音按句原文查静态索引");
  assert.deepEqual(scenes[0].nodeIds, ["n001", "n005"], "同一插画聚合多个节点");
});

test("buildRetellScenes：limit 截断；不可复述（<2 图）返回不可用", () => {
  const one = Core.buildRetellScenes([node("n001", "a.jpg", "x"), node("n002", "a.jpg", "y")]);
  assert.equal(one.length, 1);
  assert.equal(Core.retellable(one), false);
  const three = Core.buildRetellScenes(episode(), { limit: 3 });
  assert.equal(three.length, 3);
  assert.equal(Core.retellable(three), true);
});

test("shuffledOrder：固定 rng 完全确定；全排列无遗漏；不会开局即排好", () => {
  const fixed = Core.shuffledOrder(4, () => 0.999);
  assert.deepEqual(fixed.sort((a, b) => a - b), [0, 1, 2, 3]);
  const identity = Core.shuffledOrder(4, () => 0);
  assert.notDeepEqual(identity, [0, 1, 2, 3], "恒等序要被打破");
  assert.deepEqual(Core.shuffledOrder(2, () => 0), [1, 0], "rng=0 时两张交换（确定性）");
});

test("checkOrder：全对 -1，否则返回第一个放错的槽位", () => {
  assert.equal(Core.checkOrder([0, 1, 2, 3]), -1);
  assert.equal(Core.checkOrder([0, 2, 1, 3]), 1);
  assert.equal(Core.checkOrder([2, 0, 1, 3]), 0);
  assert.equal(Core.checkOrder([]), 0, "空放置视为未完成");
});

test("retellCoverage：按 takes 元数据判完成", () => {
  const scenes = [{}, {}, {}, {}];
  assert.deepEqual(Core.retellCoverage({ takes: { 0: { at: 1 } } }, scenes), { done: 1, total: 4, complete: false });
  const all = { takes: Object.fromEntries([0, 1, 2, 3].map((i) => [String(i), { at: 1 }])) };
  assert.equal(Core.retellCoverage(all, scenes).complete, true);
  assert.equal(Core.retellCoverage(null, scenes).complete, false);
});

test("step-log：output 事件带 kind 细分（dub/retell）", () => {
  const logCore = JSON.parse("null") || globalThis.BookPlayStepLogCore;
  void logCore;
  const src = read("step-log-core.js");
  assert.match(src, /if \(raw\.kind\) out\.kind = String\(raw\.kind\)\.slice\(0, 8\);/);
});

test("retell.html：脚本顺序与页面骨架齐备", () => {
  const html = read("retell.html");
  const scripts = [...html.matchAll(/<script[^>]*\ssrc="([^"?]+)(?:\?[^"]*)?"/g)]
    .map((m) => m[1].replace(/^\.\//, ""))
    .filter((src) => src !== "native-key.js" && src !== "handheld-controls.js");
  assert.deepEqual(scripts, ["tv-remote.js", "storage.js", "step-log-core.js", "step-log.js", "dub-store.js", "dub-recorder.js", "retell-core.js", "retell.js"]);
  for (const id of ["stage-order", "stage-tell", "stage-show", "order-pool", "order-slots", "tell-rec", "show-play"]) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
});

test("retell.js：只写本机键、输出步日志带 retell 细分、无危险 API", () => {
  const js = read("retell.js");
  const keys = [...js.matchAll(/bookplay_[a-z_0-9]+/g)].map((m) => m[0]);
  assert.deepEqual([...new Set(keys)], ["bookplay_retell_v1", "bookplay_retell_reward_v1"]);
  assert.match(js, /step: "output", kind: "retell"/);
  assert.doesNotMatch(js, /\beval\s*\(|new Function\s*\(|document\.write/);
  assert.match(js, /retell:\$\{ep\}:\$\{current\}/, "录音键按集+场景索引");
  assert.match(js, /Core\.shuffledOrder\(scenes\.length\)/, "图池必须用洗牌序渲染，否则排序任务失效");
});

test("map 详情卡与 APK 白名单：复述入口/页面/依赖已接线", () => {
  const map = read("map.js");
  assert.match(map, /retell\.html\?ep=\$\{n\}/, "详情卡复述入口");
  assert.match(map, /SERIES\.dualPath \? `<a class="episode-detail-option" href="retell\.html/, "仅 jttw 显示复述");
  const apk = readFileSync(join(here, "..", "tools", "pack_android.py"), "utf8");
  for (const name of ["retell.html", "retell.js", "retell-core.js", "dub-store.js", "dub-recorder.js"]) {
    assert.ok(apk.includes(`"${name}"`), `${name} 必须在 pack_android.py ENGINE_FILES`);
  }
});
