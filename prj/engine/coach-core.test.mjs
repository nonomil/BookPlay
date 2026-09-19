import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Coach from "./coach-core.js";
import LogCore from "./step-log-core.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, name), "utf8");

const NOW = Date.UTC(2026, 8, 19, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;
const t = (offsetMs) => NOW - offsetMs;

function summarize(log) {
  return LogCore.summarize(log, { now: NOW, days: 7 });
}
function evt(offsetMs, extra) {
  return Object.assign({ t: t(offsetMs), day: LogCore.dayKey(t(offsetMs)) }, extra);
}
function watched(ep, path, hourMs) {
  return [
    evt(hourMs, { ep, path, step: "watch", event: "enter" }),
    evt(hourMs - 60000, { ep, path, step: "watch", event: "finish" }),
  ];
}

test("画像一：听力强（听力听完、阅读连着看一半）→ 推荐听力入章", () => {
  const log = [
    ...watched(1, "listen", 4 * DAY),
    ...watched(2, "listen", 3 * DAY),
    ...watched(3, "listen", 2 * DAY),
    evt(DAY, { ep: 4, path: "read", step: "watch", event: "enter" }),
    evt(DAY - 60000, { ep: 4, path: "read", step: "watch", event: "quit" }),
    evt(3600000, { ep: 5, path: "read", step: "watch", event: "enter" }),
    evt(3500000, { ep: 5, path: "read", step: "watch", event: "quit" }),
  ];
  const v = Coach.verdict({ summary: summarize(log), log, vstat: {} });
  assert.equal(v.path, "listen");
  assert.equal(v.weakStep, "watch");
  assert.match(v.headline, /听力入章/);
  assert.match(v.nextAction.href, /mode=listen/);
  assert.equal(v.nextAction.href, "wala.html?ep=5&mode=listen&loops=2&visual=audio&subtitle=enzh", "回到最远那集接着听");
});

test("画像二：解码强（阅读稳定通关、听力只是试了试）→ 闭环优先：先补 ep3 巩固，再按阅读继续", () => {
  const log = [
    ...watched(1, "read", 4 * DAY),
    evt(4 * DAY - 120000, { ep: 1, step: "check", event: "enter" }),
    evt(4 * DAY - 180000, { ep: 1, step: "check", event: "finish", ok: true, score: "5/5" }),
    ...watched(2, "read", 3 * DAY),
    evt(3 * DAY - 120000, { ep: 2, step: "check", event: "enter" }),
    evt(3 * DAY - 180000, { ep: 2, step: "check", event: "finish", ok: true, score: "4/5" }),
    evt(2 * DAY, { ep: 3, path: "listen", step: "watch", event: "enter" }),
    evt(2 * DAY - 60000, { ep: 3, path: "listen", step: "watch", event: "quit" }),
    ...watched(3, "read", DAY),
  ];
  const v = Coach.verdict({ summary: summarize(log), log, vstat: {} });
  assert.equal(v.weakStep, "check", "ep3 看完了还没做巩固 → 闭环优先于前进");
  assert.match(v.nextAction.href, /lesson\.html\?ep=3$/);

  // 补上 ep3 巩固与一次复述后：阅读完成率更高 → 按阅读继续第 4 集
  const log2 = log.concat([
    evt(DAY - 120000, { ep: 3, step: "check", event: "enter" }),
    evt(DAY - 180000, { ep: 3, step: "check", event: "finish", ok: true, score: "5/5" }),
    evt(DAY - 240000, { ep: 3, step: "output", event: "enter", kind: "retell" }),
    evt(DAY - 300000, { ep: 3, step: "output", event: "finish", ok: true, kind: "retell" }),
  ]);
  const v2 = Coach.verdict({ summary: summarize(log2), log: log2, vstat: {} });
  assert.equal(v2.path, "read");
  assert.equal(v2.weakStep, null);
  assert.match(v2.nextAction.href, /wala\.html\?ep=4$/, "继续第 4 集");
});

test("画像三：双弱（两条路都没走完）→ 降为轻松听 1 遍", () => {
  const log = [
    evt(3 * DAY, { ep: 2, path: "listen", step: "watch", event: "enter" }),
    evt(3 * DAY - 60000, { ep: 2, path: "listen", step: "watch", event: "quit" }),
    evt(2 * DAY, { ep: 3, path: "listen", step: "watch", event: "enter" }),
    evt(2 * DAY - 60000, { ep: 3, path: "listen", step: "watch", event: "quit" }),
    evt(DAY, { ep: 3, path: "read", step: "watch", event: "enter" }),
    evt(DAY - 60000, { ep: 3, path: "read", step: "watch", event: "quit" }),
  ];
  const v = Coach.verdict({ summary: summarize(log), log, vstat: {} });
  assert.equal(v.weakStep, "watch");
  assert.match(v.headline, /1 遍/);
  assert.match(v.nextAction.href, /loops=1/);
});

test("规则优先级：巩固未过 > 一切（先补闭环）", () => {
  const log = [
    ...watched(4, "read", DAY),
    evt(DAY - 120000, { ep: 4, step: "check", event: "enter" }),
    evt(DAY - 180000, { ep: 4, step: "check", event: "finish", ok: false, score: "2/5" }),
    evt(3600000, { ep: 5, path: "read", step: "watch", event: "enter" }),
    evt(3500000, { ep: 5, path: "read", step: "watch", event: "quit" }),
  ];
  const v = Coach.verdict({ summary: summarize(log), vstat: { waterfall: { seen: 5, right: 1, wrong: 4 } } });
  assert.equal(v.weakStep, "check");
  assert.match(v.nextAction.href, /lesson\.html\?ep=4&retry=1/);
  assert.ok(v.weakTerms.some((item) => item.term === "waterfall"), "薄弱词随诊断给出");
});

test("规则补位：看完了但没做巩固 → 指向本集测验；从没开口 → 指向复述", () => {
  const watchedOnly = Coach.verdict({
    summary: summarize([...watched(6, "read", DAY)]),
    vstat: {},
  });
  assert.equal(watchedOnly.weakStep, "check");
  assert.match(watchedOnly.nextAction.href, /lesson\.html\?ep=6$/);

  const withCheck = Coach.verdict({
    summary: summarize([
      ...watched(6, "read", 2 * DAY),
      evt(2 * DAY - 120000, { ep: 6, step: "check", event: "enter" }),
      evt(2 * DAY - 180000, { ep: 6, step: "check", event: "finish", ok: true, score: "5/5" }),
    ]),
    vstat: {},
  });
  assert.equal(withCheck.weakStep, "output");
  assert.match(withCheck.nextAction.href, /retell\.html\?ep=6/);
});

test("无活动：从进度下一集的听力入章开始；健康态：表扬并给下一步", () => {
  const empty = Coach.verdict({ summary: summarize([]), progress: { 5: { done: true } }, vstat: {} });
  assert.equal(empty.nextAction.href, "wala.html?ep=6&mode=listen&loops=2&visual=audio&subtitle=enzh");

  const healthyLog = [
    ...watched(7, "listen", 2 * DAY),
    evt(2 * DAY - 120000, { ep: 7, step: "check", event: "enter" }),
    evt(2 * DAY - 180000, { ep: 7, step: "check", event: "finish", ok: true, score: "5/5" }),
    evt(DAY, { ep: 7, step: "output", event: "enter", kind: "retell" }),
    evt(DAY - 60000, { ep: 7, step: "output", event: "finish", ok: true, kind: "retell" }),
  ];
  const healthy = Coach.verdict({ summary: summarize(healthyLog), progress: { 7: { done: true } }, vstat: {} });
  assert.match(healthy.headline, /走得很稳/);
  assert.equal(healthy.nextAction.href, "wala.html?ep=8&mode=listen&loops=2&visual=audio&subtitle=enzh");
});

test("诊断透明：signals 记录证据，且全部建议都有可点动作", () => {
  const v = Coach.verdict({ summary: summarize([...watched(2, "listen", DAY)]), log: [...watched(2, "listen", DAY)], vstat: { rock: { seen: 9, right: 2, wrong: 7 } } });
  assert.ok(Array.isArray(v.signals) && v.signals.length >= 1);
  assert.ok(v.nextAction && typeof v.nextAction.href === "string" && v.nextAction.href.length > 0);
  assert.ok(v.weakTerms.some((item) => item.term === "rock"));
});

test("教练接线：家长报告与地图消费同一份 verdict，且入 APK 白名单", () => {
  const report = read("parent-report.js");
  assert.match(report, /window\.BookPlayCoach/, "家长报告加载教练模块");
  assert.match(report, /coach\.verdict\(/, "家长报告用教练结论");
  assert.match(report, /report-coach/, "报告页渲染教练卡");
  assert.doesNotMatch(report, /Core\.suggest\(/, "固定五条建议已被教练取代");

  const mapHtml = read("map.html");
  assert.match(mapHtml, /id="map-coach-float"/, "地图教练浮标");
  const mapScripts = [...mapHtml.matchAll(/<script[^>]*\ssrc="([^"?]+)(?:\?[^"]*)?"/g)].map((m) => m[1]);
  assert.ok(mapScripts.indexOf("coach-core.js") < mapScripts.indexOf("map.js"), "coach-core 先于 map.js 加载");

  const mapJs = read("map.js");
  assert.match(mapJs, /coachFloat/, "map.js 尾部渲染教练浮标");

  const apk = readFileSync(join(here, "..", "tools", "pack_android.py"), "utf8");
  assert.ok(apk.includes('"coach-core.js"'), "coach-core.js 必须在 pack_android.py ENGINE_FILES");
});
