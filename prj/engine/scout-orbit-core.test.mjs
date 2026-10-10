import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, name), "utf8");
const quiz = require("./episode-vocab-quiz.js");
const orbit = require("./scout-orbit-core.js");

function memory() {
  const data = {};
  return {
    getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem(key, value) { data[key] = String(value); },
    keys() { return Object.keys(data); },
  };
}

function answersFor(mission, correctCount) {
  const answers = {};
  mission.forEach((question, index) => {
    answers[question.id] = index < correctCount
      ? question.answer
      : (question.answer + 1) % question.choices.length;
  });
  return answers;
}

test("舱内任务五种里三种都有，词嵌在舱务里", () => {
  const mission = orbit.buildMission("book-01", { seed: 2 });
  assert.equal(mission.length, 5);
  const kinds = new Set(mission.map((item) => item.kind));
  assert.deepEqual([...kinds].sort(), [...orbit.KINDS].sort());
  mission.forEach((item) => {
    assert.match(item.prompt_zh, /。/);
    assert.equal(item.prompt_zh.includes(item.term), false, "题干不先把答案写出来");
    assert.equal(item.choices.length, 3);
    assert.ok(item.situation);
  });
  const fill = mission.find((item) => item.kind === "fill-letter");
  assert.match(fill.display, /_/);
  assert.equal(fill.choices[fill.answer], fill.term[fill.display.split(" ").indexOf("_")]);
  assert.equal(orbit.BOOKS.length, 4);
  assert.equal(orbit.BOOKS.some((book) => book.id === "sunny-farm"), false);
});

test("四件接上才点亮下一站，三件不点亮", () => {
  const mission = orbit.buildMission("book-01", { seed: 4 });
  globalThis.BookPlayEpisodeVocabQuiz = quiz;
  const passed = orbit.score(mission, answersFor(mission, 4));
  const failed = orbit.score(mission, answersFor(mission, 3));
  assert.equal(passed.passed, true);
  assert.equal(failed.passed, false);
  assert.deepEqual(passed, quiz.scoreEpisodeQuiz(mission, answersFor(mission, 4), { passRate: 0.7 }));
  const store = memory();
  orbit.remember(store, "book-01", failed, "2026-10-10T00:00:00.000Z");
  let saved = orbit.load(store);
  assert.equal(saved.books["book-01"].quizPassed, false);
  assert.equal(saved.books["book-01"].bestStars, 3);
  assert.equal(orbit.isOpen(saved, "book-02"), false);
  assert.equal(orbit.isOpen(saved, "book-01"), true);
  orbit.remember(store, "book-01", passed, "2026-10-10T00:01:00.000Z");
  saved = orbit.load(store);
  assert.equal(saved.books["book-01"].quizPassed, true);
  assert.equal(saved.books["book-01"].bestStars, 4);
  assert.equal(orbit.isOpen(saved, "book-02"), true);
  assert.equal(orbit.isOpen(saved, "book-03"), false);
  orbit.remember(store, "book-01", failed, "2026-10-10T00:02:00.000Z");
  saved = orbit.load(store);
  assert.equal(saved.books["book-01"].quizPassed, true, "再飞没过也不把已点亮的星关掉");
  assert.equal(saved.books["book-01"].bestStars, 4);
  assert.deepEqual(store.keys(), [orbit.PROGRESS_KEY]);
  assert.equal(orbit.PROGRESS_KEY.includes("bookplay_adv_progress"), false);
  assert.equal(orbit.PROGRESS_KEY.includes("bookplay_battle_progress"), false);
});

test("页面是舱内任务，扔球循环不改", () => {
  const game = read("game.js");
  const page = read("scout-orbit.js");
  const html = read("scout-orbit.html");
  assert.match(game, /function throwOrb\(monster\)/);
  assert.equal(game.includes(orbit.PROGRESS_KEY), false);
  assert.equal(game.includes("BookPlayScoutOrbit"), false);
  assert.match(page, /core\.COPY\.listenFallback/);
  assert.match(page, /core\.COPY\.fail/);
  assert.match(page, /core\.COPY\.pass/);
  assert.match(html, /handheld-controls\.js/);
  assert.match(html, /native-key\.js/);
  assert.doesNotMatch(page, /不及格|你错了|bookplay_adv_progress|bookplay_battle_progress/);
  assert.doesNotMatch(read("scout-orbit-core.js"), /sunny-farm|bookplay_adv_progress|bookplay_battle_progress/);
  const home = read("home.html");
  assert.match(home, /href="scout-orbit\.html"/);
  assert.match(home, /href="map\.html"/);
  assert.match(home, /series=minecraft/);
  assert.match(home, /series=mikey-jj/);
});
