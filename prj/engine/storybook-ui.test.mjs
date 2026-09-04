import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ui = require(fileURLToPath(new URL("./storybook-ui.js", import.meta.url)));

test("containedRect centers a portrait image inside a landscape box", () => {
  assert.deepEqual(
    ui.containedRect({boxWidth: 1000, boxHeight: 600, naturalWidth: 500, naturalHeight: 1000}),
    {left: 350, top: 0, width: 300, height: 600}
  );
});

test("formatUnitProgress includes page and sentence", () => {
  assert.equal(ui.formatUnitProgress({page: 2, pages: 15, sentence: 1, sentences: 3}), "第 2/15 页 · 第 1/3 句");
});

test("series capabilities never fabricate minecraft bubble data", () => {
  assert.equal(ui.seriesCapabilities("minecraft", {}).hasBubbleLocator, false);
});

test("preferences tolerate malformed storage and preserve other series", () => {
  const storage = new Map([["bookplay_storybook_preferences", "{"]]);
  const fakeStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };
  assert.deepEqual(ui.readPreferences(fakeStorage, "minecraft"), {});
  ui.writePreferences(fakeStorage, "minecraft", {mode: "study"});
  ui.writePreferences(fakeStorage, "mikey-jj", {mode: "story"});
  assert.deepEqual(ui.readPreferences(fakeStorage, "minecraft"), {mode: "study"});
  assert.deepEqual(ui.readPreferences(fakeStorage, "mikey-jj"), {mode: "story"});
});

test("resolveReaderMode accepts only story or study", () => {
  assert.equal(ui.resolveReaderMode("minecraft", "story"), "story");
  assert.equal(ui.resolveReaderMode("minecraft", "broken"), "story");
  assert.equal(ui.resolveReaderMode("mikey-jj", null), "story");
});

test("next-after-ended is enabled only in unlocked story mode", () => {
  assert.equal(ui.shouldAutoAdvance({mode: "story", unlocked: true, hasAudio: true}), true);
  assert.equal(ui.shouldAutoAdvance({mode: "study", unlocked: true, hasAudio: true}), false);
  assert.equal(ui.shouldAutoAdvance({mode: "story", unlocked: false, hasAudio: true}), false);
  assert.equal(ui.shouldAutoAdvance({mode: "story", unlocked: true, hasAudio: false}), false);
});

test("keywords are hidden when empty or in story mode", () => {
  assert.equal(ui.shouldShowKeywords([], "study"), false);
  assert.equal(ui.shouldShowKeywords([{term: "wolf"}], "story"), false);
  assert.equal(ui.shouldShowKeywords([{term: "wolf"}], "study"), true);
});

test("translation is shown only when real text exists and preference is on", () => {
  assert.equal(ui.shouldShowTranslation({zh: "狼", preference: true}), true);
  assert.equal(ui.shouldShowTranslation({zh: "", preference: true}), false);
  assert.equal(ui.shouldShowTranslation({zh: "狼", preference: false}), false);
});

test("word highlight prefers authored boundaries and falls back only when incomplete", () => {
  const timings = [
    {start_ms: 0, end_ms: 320},
    {start_ms: 420, end_ms: 760},
    {start_ms: 900, end_ms: 1240},
  ];
  assert.equal(ui.wordHighlightIndex({currentMs: 500, durationMs: 1240, timings, wordCount: 3}), 1);
  assert.equal(ui.wordHighlightIndex({currentMs: 1300, durationMs: 1240, timings, wordCount: 3}), 3);
  assert.equal(ui.wordHighlightIndex({currentMs: 500, durationMs: 1000, timings: timings.slice(0, 2), wordCount: 3}), 1);
});

test("containedRect handles horizontal letterboxing", () => {
  assert.deepEqual(
    ui.containedRect({boxWidth: 1000, boxHeight: 500, naturalWidth: 1000, naturalHeight: 1000}),
    {left: 250, top: 0, width: 500, height: 500}
  );
});

test("containedRect handles vertical letterboxing", () => {
  assert.deepEqual(
    ui.containedRect({boxWidth: 500, boxHeight: 1000, naturalWidth: 1000, naturalHeight: 500}),
    {left: 0, top: 375, width: 500, height: 250}
  );
});

test("projectRelativeBox stays inside contained image", () => {
  const box = ui.projectRelativeBox(
    {left: 100, top: 50, width: 800, height: 600},
    {x: 0.2, y: 0.1, w: 0.25, h: 0.1}
  );
  assert.deepEqual(box, {left: 260, top: 110, width: 200, height: 60});
});

test("projectRelativeBox rejects incomplete or degenerate annotations", () => {
  assert.equal(ui.projectRelativeBox(null, {x: 0, y: 0, w: 1, h: 1}), null);
  assert.equal(ui.projectRelativeBox({left: 0, top: 0, width: 100, height: 100}, {x: 0, y: 0, w: 0, h: 1}), null);
  const clamped = ui.projectRelativeBox({left: 0, top: 0, width: 100, height: 100}, {x: -1, y: 0, w: 3, h: 1});
  assert.deepEqual(clamped, {left: 0, top: 0, width: 100, height: 100});
});
