import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, "../..");
const corePath = path.join(dir, "companion-core.js");
const achievementPath = path.join(root, "content/achievements/jttw.json");
const companionPath = path.join(root, "content/companions/white-dragon.json");
const collectionPath = path.join(root, "content/dialogue_stories/collections.json");

assert.equal(fs.existsSync(corePath), true, "companion-core.js 尚未实现");
const core = require(corePath);
const achievements = JSON.parse(fs.readFileSync(achievementPath, "utf8"));
const companion = JSON.parse(fs.readFileSync(companionPath, "utf8"));
const collections = JSON.parse(fs.readFileSync(collectionPath, "utf8")).collections;

const doneEpisodes = (from, to) => Object.fromEntries(
  Array.from({ length: to - from + 1 }, (_, i) => [String(from + i), { done: true }]),
);
const doneDrills = (count = 13) => Object.fromEntries(
  Array.from({ length: count }, (_, i) => [`c${String(i + 1).padStart(2, "0")}`, { done: true }]),
);

test("catalog contains 19 unique badges and one chapter badge per collection", () => {
  assert.equal(achievements.achievements.length, 19);
  assert.equal(new Set(achievements.achievements.map((item) => item.id)).size, 19);
  const chapterIds = achievements.achievements
    .filter((item) => item.kind === "chapter")
    .map((item) => item.condition.collection_id)
    .sort();
  assert.deepEqual(chapterIds, collections.map((item) => item.id).sort());
  achievements.achievements.forEach((item) => {
    const localAsset = path.join(root, "content", item.art.replace(/^assets\//, "assets/"));
    assert.equal(fs.existsSync(localAsset), true, `missing badge art: ${item.art}`);
  });
});

test("finishing episodes without the collection drill does not award its chapter badge", () => {
  const result = core.evaluateAchievements({
    catalog: achievements,
    collections,
    progress: doneEpisodes(1, 7),
    drills: {},
    receipts: {},
    now: 1000,
  });
  assert.equal(result.earned.some((item) => item.id === "jttw.c01"), false);
  assert.equal(result.earned.some((item) => item.id === "jttw.first-step"), true);
});

test("the final crown requires all 108 episodes and all 13 drills", () => {
  const progress = doneEpisodes(1, 108);
  const almost = core.evaluateAchievements({
    catalog: achievements,
    collections,
    progress,
    drills: doneDrills(12),
    receipts: {},
    now: 1000,
  });
  assert.equal(almost.earned.some((item) => item.id === "jttw.complete"), false);

  const complete = core.evaluateAchievements({
    catalog: achievements,
    collections,
    progress,
    drills: doneDrills(13),
    receipts: {},
    now: 1000,
  });
  assert.equal(complete.earned.some((item) => item.id === "jttw.complete"), true);
  assert.equal(complete.earned.length, 19);
});

test("achievement evaluation is idempotent and preserves old receipts", () => {
  const first = core.evaluateAchievements({
    catalog: achievements,
    collections,
    progress: doneEpisodes(1, 10),
    drills: { c01: { done: true } },
    receipts: {},
    now: 1000,
  });
  const second = core.evaluateAchievements({
    catalog: achievements,
    collections,
    progress: {},
    drills: {},
    receipts: first.receipts,
    now: 2000,
  });
  assert.equal(first.newlyUnlocked.length, 3);
  assert.equal(second.newlyUnlocked.length, 0);
  assert.deepEqual(Object.keys(second.receipts).sort(), Object.keys(first.receipts).sort());
});

test("companion stages are derived from story progress at exact episode gates", () => {
  const stage = (progress, drills = {}) => core.deriveCompanionStage({
    catalog: companion,
    collections,
    progress,
    drills,
  }).id;
  assert.equal(stage({}, {}), "mysterious-egg");
  assert.equal(stage(doneEpisodes(1, 1)), "awakening-egg");
  assert.equal(stage(doneEpisodes(1, 7), { c01: { done: true } }), "west-sea-hatchling");
  assert.equal(stage(doneEpisodes(1, 17), { c01: { done: true } }), "white-dragon-revealed");
  assert.equal(stage(doneEpisodes(1, 18), { c01: { done: true } }), "white-dragon-horse");
});

test("care stamps at most once per day and missing a day never removes growth", () => {
  const initial = {
    schema_version: 1,
    care: { days: ["2026-08-30"], last_action: "feed" },
    learning_days: ["2026-08-30", "2026-09-01"],
  };
  const first = core.recordCare(initial, { day: "2026-09-01", action: "play" });
  const repeat = core.recordCare(first.state, { day: "2026-09-01", action: "groom" });
  assert.equal(first.stamped, true);
  assert.equal(repeat.stamped, false);
  assert.deepEqual(repeat.state.care.days, ["2026-08-30", "2026-09-01"]);
  assert.equal(repeat.state.care.last_action, "groom");
  assert.equal(repeat.state.care.days.length, 2, "断一天不能清零累计同行日");
});

test("learning activity uses calendar-day deduplication", () => {
  const once = core.markLearningDay({}, "2026-09-01");
  const twice = core.markLearningDay(once, "2026-09-01");
  assert.deepEqual(twice.learning_days, ["2026-09-01"]);
});

