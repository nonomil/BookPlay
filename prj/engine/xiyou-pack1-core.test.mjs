import { test } from "node:test";
import assert from "node:assert/strict";
import core from "./xiyou-pack1-core.js";
import battle from "./battle-core.js";

function miniLevel() {
  return {
    title: { en: "The Monkey", zh: "西游记 第1集" },
    collection: "c01",
    cast: {
      hero: { id: "wukong", nameZh: "孙悟空" },
      boss: { id: "monkey-minor", nameZh: "猴群小头目", sprite: "monkey-minor" },
      minors: [{ id: "monkey-minor", nameZh: "小猴子", sprite: "monkey-minor" }],
    },
    previewWords: [
      { term: "monkey", zh: "猴子", illustration: "assets/adv_frames/ep1/f1.jpg" },
      { term: "rock", zh: "岩石" },
      { term: "west", zh: "西方" },
      { term: "journey", zh: "旅行" },
      { term: "split", zh: "劈开" },
    ],
    waves: [{ monsters: [{ term: "monkey", zh: "猴子", sprite: "monkey-minor" }] }],
    boss: { hpWords: [{ term: "nearby", zh: "在附近" }, { term: "southern", zh: "南方的" }, { term: "magical", zh: "魔术的" }] },
  };
}

test("包1默认走 ep1，legacy/扔球参数才回旧地图", () => {
  assert.equal(core.isDefaultPath(1), true);
  assert.equal(core.isDefaultPath(1, ""), true);
  assert.equal(core.isDefaultPath(1, "legacy=1"), false);
  assert.equal(core.isDefaultPath(1, "play=tag-shoot"), false);
  assert.equal(core.isDefaultPath(1, "mode=map"), false);
  assert.equal(core.isDefaultPath(2), false);
  assert.equal(core.isDefaultPath(2, "pack=1"), true);
});

test("任务卡是动词大按钮，不是看中文选英文", () => {
  const card = core.questCard(1);
  assert.equal(card.title, "救猴群 · Save the monkeys");
  assert.equal(card.button, "救猴群 · Save the monkeys");
  assert.equal(card.placeZh, "花果山");
  assert.doesNotMatch(card.title, /看中文选英文/);
  assert.doesNotMatch(card.button, /看中文选英文/);
});

test("先打一把实验开关默认关", () => {
  assert.equal(core.PLAY_FIRST_EXPERIMENT, false);
});

test("选对英文把妖打小，血空才收服；同屏一轮一只", () => {
  const run = core.enterArena(core.buildRun(miniLevel(), { minionCount: 2 }));
  assert.equal(run.minions.length, 2);
  assert.equal(run.phase, "arena");
  assert.equal(core.currentWord(run).term, run.minions[0].term);
  const first = core.applyChoice(run, run.minions[0].term);
  assert.equal(first.correct, true);
  assert.equal(first.captured, false);
  assert.equal(first.floatText, "击退！");
  assert.equal(run.minions[0].hitsLeft, 1);
  const second = core.applyChoice(run, run.minions[0].term);
  assert.equal(second.captured, true);
  assert.equal(second.floatText, "收！");
  assert.equal(run.minionIndex, 1);
  assert.equal(core.currentWord(run).term, run.minions[1].term);
});

test("点错友善重试，浮字禁止词不对，命尽失败不发星不推进", () => {
  const run = core.enterArena(core.buildRun(miniLevel(), { minionCount: 1 }));
  const want = run.minions[0].term;
  let last;
  for (let i = 0; i < 3; i += 1) {
    last = core.applyChoice(run, "zzzz");
    assert.equal(last.correct, false);
    assert.ok(core.MISS_FLOATS.includes(last.floatText));
    assert.notEqual(last.floatText, "词不对");
    assert.equal(core.currentWord(run) && core.currentWord(run).term, i < 2 ? want : null);
  }
  assert.equal(run.finished, true);
  assert.equal(run.passed, false);
  const settle = core.settlePack1(run, {}, battle.settleRun);
  assert.equal(settle.passed, false);
  assert.equal(settle.stars, 0);
  assert.equal(settle.awardFirstStar, false);
  const patch = core.progressPatch({}, settle);
  assert.ok(!patch.mapStage || patch.mapStage !== "complete");
  assert.ok(!patch.clears);
  assert.ok(!patch.stars);
  assert.ok(patch.wrongWords[want] >= 1);
});

test("不会跳过记弱词，不算整关羞辱失败", () => {
  const run = core.enterArena(core.buildRun(miniLevel(), { minionCount: 2 }));
  const first = run.minions[0].term;
  const skip = core.applySkip(run);
  assert.equal(skip.skipped, true);
  assert.equal(run.passed, false);
  assert.equal(run.finished, false);
  assert.ok(run.skipped.includes(first));
  assert.ok(run.wrongWords[first] >= 1);
  assert.equal(run.minionIndex, 1);
});

test("真正通过才发首次任务星；重打不伪通过多发首次星", () => {
  const run = core.enterArena(core.buildRun(miniLevel(), { minionCount: 1 }));
  run.bossWords = [];
  core.applyChoice(run, run.minions[0].term);
  core.applyChoice(run, run.minions[0].term);
  assert.equal(run.passed, true);
  const first = core.settlePack1(run, {}, battle.settleRun);
  assert.equal(first.awardFirstStar, true);
  assert.ok(first.stars >= 1);
  const again = core.settlePack1(run, { stars: first.stars, clears: 1, mapStage: "complete" }, battle.settleRun);
  assert.equal(again.awardFirstStar, false);
  const passPatch = core.progressPatch({ stars: 0 }, first, { captured: 1 });
  assert.equal(passPatch.mapStage, "complete");
  assert.equal(passPatch.clears, 1);
});

test("轻 Boss 最多 3 轮 choice，typing 默认关", () => {
  const run = core.buildRun(miniLevel());
  assert.ok(run.bossWords.length <= 3);
  assert.equal(run.typingEnabled, false);
  assert.ok(run.bossWords.every((word) => word.kind !== "typing"));
});

test("进度补丁不写 lesson 或 adv_progress", () => {
  const keys = JSON.stringify(core.progressPatch({}, { passed: true, stars: 2, wrongWords: {} }));
  assert.doesNotMatch(keys, /bookplay_adv_progress/);
  assert.doesNotMatch(keys, /lessonPassed/);
  assert.deepEqual(core.ALLOWED_PROGRESS_KEYS.includes("bookplay_battle_progress_v1"), true);
});

test("气泡带着英语关键词，血条按这一击往下掉", () => {
  const run = core.enterArena(core.buildRun(miniLevel(), { minionCount: 1 }));
  run.minions[0].kind = "en-choice";
  const line = core.demonLine(run);
  assert.match(line, new RegExp(run.minions[0].term));
  assert.match(line, /挡路/);
  assert.doesNotMatch(line, /点出对应的英文|看中文选英文/);
  const full = core.hpView(run);
  assert.equal(full.left, 2);
  assert.equal(full.ratio, 1);
  const hit = core.applyChoice(run, run.minions[0].term);
  assert.equal(hit.hpLeft, 1);
  assert.equal(hit.hpMax, 2);
  const half = core.hpView(run);
  assert.equal(half.ratio, 0.5);
  const miss = core.applyChoice(run, "zzzz");
  assert.equal(miss.correct, false);
  assert.equal(miss.hpLeft, 1);
  assert.equal(core.hpView(run).ratio, 0.5);
});

test("英文选项恰好含正解，提示用中文或听力", () => {
  const run = core.enterArena(core.buildRun(miniLevel(), { minionCount: 1 }));
  const prompt = core.currentPrompt(run, 7);
  assert.ok(prompt.choices.some((c) => c.correct && c.en === run.minions[0].term));
  assert.ok(prompt.choices.length >= 2);
  assert.ok(prompt.promptMain === run.minions[0].zh || prompt.listen);
});
