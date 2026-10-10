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
const words = require("./word-quiz-core.js");

test("洞中认词：五种题里三种都有，补字母、看图、听图都能判", () => {
  const session = words.buildSession(words.STARTER_WORDS, { seed: 3, episode: 1 });
  assert.equal(session.length, 5);
  const kinds = new Set(session.map((item) => item.kind));
  assert.deepEqual([...kinds].sort(), [...words.KINDS].sort());
  const fill = session.find((item) => item.kind === "fill-letter");
  assert.match(fill.display, /_/);
  assert.equal(fill.choices[fill.answer], fill.term[fill.display.split(" ").indexOf("_")]);
  const picture = session.find((item) => item.kind === "picture-word");
  assert.equal(picture.choices[picture.answer], picture.term);
  assert.equal(picture.choices.length, 3);
  const listen = session.find((item) => item.kind === "listen-picture");
  assert.equal(listen.choices[listen.answer], listen.term);
  assert.equal(listen.choiceMeta.length, 3);
  assert.equal(listen.prompt_zh, words.COPY.listenPrompt);
});

test("通过线和知识巩固一样：不到 70% 不算过", () => {
  const session = words.buildSession(words.STARTER_WORDS, { seed: 9, episode: 2 });
  const all = {};
  const few = {};
  session.forEach((item, index) => {
    all[item.id] = item.answer;
    if (index < 3) few[item.id] = item.answer;
    else few[item.id] = (item.answer + 1) % item.choices.length;
  });
  globalThis.BookPlayEpisodeVocabQuiz = quiz;
  const passed = words.score(session, all);
  const failed = words.score(session, few);
  assert.equal(passed.passed, true);
  assert.equal(passed.correct, session.length);
  assert.equal(failed.passed, false);
  assert.equal(failed.passed, quiz.scoreEpisodeQuiz(session, few, { passRate: quiz.DEFAULT_PASS_RATE }).passed);
  assert.equal(passed.passed, quiz.scoreEpisodeQuiz(session, all).passed);
  assert.equal(words.encouragement(false, "fill-letter"), words.COPY.wrong);
  assert.match(words.encouragement(true, "fill-letter"), /悟空/);
});

test("进度单独存放，失败不写成通过，也不写西游主进度键", () => {
  const store = new Map();
  const storage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, value),
  };
  const failed = words.remember(storage, 4, {
    total: 5, correct: 2, passed: false, mastered_terms: ["sun"],
  }, "2026-10-10T00:00:00.000Z");
  assert.equal(failed.episodes["4"].quizPassed, false);
  assert.equal(failed.episodes["4"].plays, 1);
  const again = words.remember(storage, 4, {
    total: 5, correct: 5, passed: true, mastered_terms: ["moon"],
  }, "2026-10-10T01:00:00.000Z");
  assert.equal(again.episodes["4"].quizPassed, true);
  assert.equal(again.episodes["4"].plays, 2);
  assert.deepEqual(again.episodes["4"].mastered.sort(), ["moon", "sun"]);
  assert.equal([...store.keys()].join(","), words.PROGRESS_KEY);
  assert.equal(words.PROGRESS_KEY.includes("bookplay_adv_progress"), false);
  assert.equal(words.PROGRESS_KEY.includes("bookplay_battle_progress"), false);
});

test("本集词从关卡词表来，页面不改扔球循环", () => {
  const pool = words.wordsFromLevel({
    previewWords: [
      { term: "stone", zh: "石头", illustration: "assets/adv_frames/ep1/f1.jpg" },
      { term: "river", zh: "河" },
      { term: "cloud", zh: "云" },
    ],
  });
  assert.deepEqual(pool.map((item) => item.term), ["stone", "river", "cloud"]);
  assert.equal(pool[0].image, "assets/adv_frames/ep1/f1.jpg");
  const mixed = words.buildSession([
    { term: "sun", zh: "太阳" },
    { term: "moon", zh: "月亮" },
    { term: "rock", zh: "岩石" },
    { term: "jadeemperor", zh: "玉皇大帝" },
  ], { seed: 1, episode: 1 });
  assert.equal(mixed.some((item) => item.term === "jadeemperor"), false);
  const game = read("game.js");
  const html = read("game.html");
  assert.match(game, /function throwOrb\(monster\)/);
  assert.equal(game.includes(words.PROGRESS_KEY), false);
  assert.equal(game.includes("BookPlayWordQuiz"), false);
  assert.match(html, /id="game-word-quiz"/);
  assert.match(html, /洞中认词/);
  const page = read("word-quiz.js");
  assert.match(page, /listenFallback/);
  assert.match(page, /function wordArt\(path\)/, "剧情帧不当成词图，只有 words 目录里的图才显示");
  assert.match(page, /result\.passed \? core\.COPY\.pass : core\.COPY\.fail/);
  assert.doesNotMatch(page, /scout-orbit|星际|宇航员/);
  assert.doesNotMatch(read("word-quiz-core.js"), /scout-orbit|sunny-farm|bookplay_adv_progress/);
});
