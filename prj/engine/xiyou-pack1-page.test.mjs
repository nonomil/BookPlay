import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, name), "utf8");

test("game.html 挂上包1任务卡/降妖场层与脚本", () => {
  const html = read("game.html");
  assert.match(html, /xiyou-pack1\.css/);
  assert.match(html, /xiyou-pack1-core\.js/);
  assert.match(html, /xiyou-pack1\.js/);
  assert.match(html, /id="pack1-quest"/);
  assert.match(html, /id="pack1-arena"/);
  assert.match(html, /id="pack1-result"/);
});

test("game.js 默认把 ep1 交给包1，扔球主循环被闸住", () => {
  const js = read("game.js");
  assert.match(js, /BookPlayXiyouPack1/);
  assert.match(js, /isDefaultPath\(EP, params\)/);
  assert.match(js, /playVerb = "word-banish"/);
  assert.match(js, /state\.phase = "pack1"/);
  assert.match(js, /function spawnWave\([\s\S]*?word-banish[\s\S]*?return/);
  assert.match(js, /function pickUp\([\s\S]*?word-banish[\s\S]*?return/);
  assert.match(js, /function throwOrb\([\s\S]*?word-banish[\s\S]*?return/);
  assert.doesNotMatch(js, /bookplay_adv_progress/);
});

test("包1文案禁止词不对，失败键是再来一趟", () => {
  const ui = read("xiyou-pack1.js");
  const core = read("xiyou-pack1-core.js");
  const css = read("xiyou-pack1.css");
  assert.doesNotMatch(ui, /词不对/);
  assert.doesNotMatch(core, /词不对(?!")/);
  assert.match(core, /棒偏了/);
  assert.match(core, /咒偏了/);
  assert.match(core, /击退！/);
  assert.match(core, /收！/);
  assert.match(ui, /再来一趟/);
  assert.match(ui, /不会/);
  assert.match(core, /救猴群/);
  assert.match(css, /pack1-verb/);
  assert.doesNotMatch(ui, /看中文选英文/);
});

test("包1只碰 battle/weak 键，先打一把开关关着", () => {
  const ui = read("xiyou-pack1.js");
  const lesson = read("lesson.js");
  const keys = [...ui.matchAll(/bookplay_[a-z_0-9]+/g)].map((m) => m[0]);
  assert.deepEqual([...new Set(keys)].sort(), [
    "bookplay_battle_collection_v1",
    "bookplay_battle_progress_v1",
    "bookplay_weak_v1",
  ]);
  assert.match(lesson, /PLAY_FIRST_EXPERIMENT = false/);
  assert.match(ui, /PLAY_FIRST_EXPERIMENT/);
});
