import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Rules from "./fight-rules.js";

const here = dirname(fileURLToPath(import.meta.url));
const level = JSON.parse(readFileSync(join(here, "ep1.json"), "utf8"));

function fight(overrides) {
  return Object.assign({
    running: true,
    phase: "wave",
    wave: 0,
    got: 0,
    need: 5,
    lives: 5,
    move: 0,
    calm: 0,
    foes: [],
    shots: [],
    hero: { x: 500, z: 620, facing: 0, cool: 0, swing: 0, hop: 0, inv: 0 }
  }, overrides);
}

function foe(overrides) {
  return Object.assign({
    x: 560,
    z: 620,
    hp: 2,
    boss: false,
    word: { zh: "西方", en: "west" },
    vx: 0,
    vz: 0
  }, overrides);
}

test("挥空也进入冷却，够不着的猴子不掉血", () => {
  const state = fight({ foes: [foe({ x: 800, hp: 2 })] });
  const ev = Rules.swing(state, level);
  assert.deepEqual(ev, { hit: false });
  assert.equal(state.hero.cool, 280);
  assert.equal(state.foes[0].hp, 2);
});

test("词对不上仍然击退，并且只扣 1 血", () => {
  const monkey = foe({ hp: 2, word: { zh: "西方", en: "west" } });
  const state = fight({ move: 0, foes: [monkey] });
  const ev = Rules.swing(state, level);
  assert.equal(ev.hit, true);
  assert.equal(ev.text, "击退");
  assert.equal(ev.killed, false);
  assert.equal(monkey.hp, 1);
  assert.ok(monkey.vx > 0);
});

test("词对上时非头目一下打倒，飘的是中文", () => {
  const monkey = foe({ hp: 2, word: { zh: "旅行", en: "journey" } });
  const state = fight({ move: 0, foes: [monkey] });
  const ev = Rules.swing(state, level);
  assert.equal(ev.text, "旅行");
  assert.equal(ev.killed, true);
  assert.equal(monkey.hp, 0);
});

test("词对上的击退比词对不上更远", () => {
  const matched = foe({ word: { zh: "旅行", en: "journey" } });
  const missed = foe({ word: { zh: "西方", en: "west" } });
  Rules.swing(fight({ foes: [matched] }), level);
  Rules.swing(fight({ foes: [missed] }), level);
  assert.ok(matched.vx > missed.vx);
});

test("头目无论词对不对都只掉 1 下", () => {
  const boss = foe({ hp: 6, boss: true, word: { zh: "旅行", en: "journey" } });
  const ev = Rules.swing(fight({ foes: [boss] }), level);
  assert.equal(ev.text, "旅行");
  assert.equal(boss.hp, 5);
  assert.equal(ev.killed, false);
});

test("冷却中这一棒不生效", () => {
  const monkey = foe();
  const state = fight({ foes: [monkey], hero: { x: 500, z: 620, cool: 10, swing: 0, hop: 0, inv: 0 } });
  assert.equal(Rules.swing(state, level), null);
  assert.equal(monkey.hp, 2);
});

test("打光一只计入击退；打满定额进入下一波", () => {
  const state = fight({ got: 4, need: 5, wave: 0, foes: [foe({ hp: 1 })] });
  const ev = Rules.swing(state, level);
  const step = Rules.defeat(state, ev.foe, level);
  assert.equal(step.type, "wave");
  assert.equal(state.wave, 1);
  assert.equal(state.got, 0);
  assert.equal(state.need, 5);
  assert.equal(state.phase, "wave");
  assert.equal(step.banner, "第二波，猴子更耐打");
});

test("第二波打满后进入头目倒计时，不弹出提问", () => {
  const state = fight({ got: 4, need: 5, wave: 1, foes: [foe({ hp: 1 })] });
  const ev = Rules.swing(state, level);
  const step = Rules.defeat(state, ev.foe, level);
  assert.equal(step.type, "countdown");
  assert.equal(state.phase, "countdown");
  assert.equal(state.count, 8);
  assert.match(step.banner, /猴群小头目 8 秒后上岸/);
});

test("头目血打光就赢", () => {
  const boss = foe({ hp: 1, boss: true });
  const state = fight({ phase: "boss", foes: [boss] });
  const ev = Rules.swing(state, level);
  const step = Rules.defeat(state, ev.foe, level);
  assert.equal(step.type, "win");
  assert.equal(state.phase, "win");
  assert.equal(state.running, false);
});

test("场上还有同一棒的词时不换词", () => {
  const state = fight({
    move: 0,
    foes: [
      foe({ hp: 1, word: { zh: "旅行", en: "journey" } }),
      foe({ x: 600, word: { zh: "旅行", en: "journey" } })
    ]
  });
  const ev = Rules.swing(state, level);
  Rules.defeat(state, ev.foe, level);
  assert.equal(Rules.advanceMove(state, level), false);
});

test("跳、开场和无敌时桃子不扣命；平时扣 1，第 5 下失败", () => {
  const jumping = fight({ hero: { x: 0, z: 0, hop: 100, inv: 0, cool: 0 } });
  assert.equal(Rules.hurt(jumping).hurt, false);
  assert.equal(jumping.lives, 5);
  const calm = fight({ calm: 100 });
  assert.equal(Rules.hurt(calm).hurt, false);
  const state = fight();
  assert.equal(Rules.hurt(state).lives, 4);
  state.hero.inv = 0;
  state.lives = 1;
  const last = Rules.hurt(state);
  assert.equal(last.lost, true);
  assert.equal(state.phase, "lose");
});

test("页面脚本不写词不对，并且先载入规则", () => {
  const js = readFileSync(join(here, "game.js"), "utf8");
  const html = readFileSync(join(here, "index.html"), "utf8");
  assert.equal(js.includes("词不对"), false);
  assert.match(html, /fight-rules\.js/);
  const rulesAt = html.indexOf("fight-rules.js");
  const gameAt = html.indexOf("game.js");
  assert.ok(rulesAt >= 0 && rulesAt < gameAt);
});
