import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import Combat from "./combat-core.js";

const ELEMENTS = JSON.parse(fs.readFileSync(new URL("../../content/game/elements.json", import.meta.url), "utf8"));
const MOVES = JSON.parse(fs.readFileSync(new URL("../../content/game/moves.json", import.meta.url), "utf8"));
// 题型名只引用字符串（lesson-core / episode-vocab-quiz 注册的题型），combat-core 不 import。
const V2_QUIZ_KINDS = new Set(["listen-choice", "meaning-choice", "context-fill", "shadow"]);

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + 0x7e268b2f + (t << 4)) | 0;
    t = (t ^ (t >>> 15)) >>> 0;
    t = Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rngSeq(values) {
  const queue = values.slice();
  return () => (queue.length ? queue.shift() : 0.5);
}

function fighter(id, element, hp, maxHp) {
  return { id, nameZh: id, element, hp, maxHp: maxHp || hp };
}

function newBattle(overrides = {}) {
  return Combat.createBattle({
    id: overrides.id || "t",
    player: overrides.player || fighter("player", "water", 100),
    enemy: overrides.enemy || fighter("imp", "fire", 100),
    elements: ELEMENTS,
    moves: MOVES,
    rng: overrides.rng,
    seed: overrides.seed,
    energyStart: overrides.energyStart,
    energyMax: overrides.energyMax,
    energyRegen: overrides.energyRegen,
  });
}

function assertEventShape(ev) {
  for (const key of ["actor", "side", "move", "hit", "mult", "dmg", "hp", "faint", "catch"]) {
    assert.ok(key in ev, `事件缺字段 ${key}`);
  }
  assert.ok(["player", "enemy"].includes(ev.side));
  assert.equal(typeof ev.hit, "boolean");
  assert.equal(typeof ev.faint, "boolean");
  assert.equal(typeof ev.mult, "number");
  assert.ok(ev.mult >= 0);
  assert.ok(Number.isInteger(ev.dmg) && ev.dmg >= 0);
  assert.ok(Number.isInteger(ev.hp) && ev.hp >= 0);
  assert.ok(ev.move === null || typeof ev.move === "string");
  assert.ok(ev.catch === null || typeof ev.catch === "boolean");
}

test("elements.json：五属性环形克制自洽（strong/weak 互指回），系数 1.3/0.75", () => {
  assert.equal(ELEMENTS.schemaVersion, 1);
  assert.equal(ELEMENTS.strongMult, 1.3);
  assert.equal(ELEMENTS.weakMult, 0.75);
  const table = ELEMENTS.elements;
  const names = Object.keys(table);
  assert.equal(names.length, 5);
  for (const name of names) {
    const row = table[name];
    assert.equal(table[row.strong].weak, name, `${name} 的 strong 反向应指回自身`);
    assert.equal(table[row.weak].strong, name, `${name} 的 weak 反向应指回自身`);
    assert.notEqual(row.strong, row.weak);
    assert.ok(names.includes(row.strong) && names.includes(row.weak));
  }
});

test("moves.json：四招式契约（题型只引用字符串，音波功零冷却零消耗保底）", () => {
  assert.equal(MOVES.schemaVersion, 1);
  const byId = MOVES.moves;
  assert.equal(Object.keys(byId).length, 4);
  for (const move of Object.values(byId)) {
    assert.ok(move.id && move.label);
    assert.ok(V2_QUIZ_KINDS.has(move.quizKind), `未知题型 ${move.quizKind}`);
    assert.ok(move.power > 0);
    assert.ok(Number.isInteger(move.cooldown) && move.cooldown >= 0);
    assert.ok(Number.isInteger(move.energyCost) && move.energyCost >= 0);
  }
  assert.equal(byId["sonic-wave"].quizKind, "listen-choice");
  assert.equal(byId["sonic-wave"].cooldown, 0);
  assert.equal(byId["sonic-wave"].energyCost, 0, "保底招式必须零冷却零消耗，防死局");
  assert.equal(byId["fire-eyes"].quizKind, "meaning-choice");
  assert.equal(byId["fire-eyes"].power, 1.2);
  assert.equal(byId["demon-mirror"].quizKind, "context-fill");
  assert.equal(byId["demon-mirror"].power, 1.5);
  assert.equal(byId["somersault-cloud"].quizKind, "shadow");
  assert.equal(byId["somersault-cloud"].power, 1.3);
  assert.equal(byId["somersault-cloud"].heal, 0.5);
});

test("elementMultiplier：strong 1.3 / weak 0.75 / 其余 1（含未知属性）", () => {
  const b = newBattle();
  assert.equal(Combat.elementMultiplier(b.elements, "water", "fire"), 1.3);
  assert.equal(Combat.elementMultiplier(b.elements, "fire", "water"), 0.75);
  assert.equal(Combat.elementMultiplier(b.elements, "water", "water"), 1);
  assert.equal(Combat.elementMultiplier(b.elements, "water", "earth"), 1);
  assert.equal(Combat.elementMultiplier(b.elements, "nonsense", "fire"), 1);
  assert.equal(Combat.elementMultiplier(b.elements, null, null), 1);
});

test("createBattle：初始状态与归一化（maxHp 回填、缺 element 中立、seed 可复现）", () => {
  const b = newBattle({ id: "b1" });
  assert.equal(b.id, "b1");
  assert.equal(b.turn, 1);
  assert.deepEqual(b.log, []);
  assert.equal(b.player.hp, 100);
  assert.equal(b.player.maxHp, 100);
  assert.equal(b.enemy.hp, 100);
  assert.equal(b.over, false);
  assert.equal(b.winner, null);
  assert.equal(Combat.result(b), null);
  assert.equal(typeof b.rng, "function");
  const n = Combat.createBattle({ player: { id: "p", element: "fire", hp: 80 }, enemy: { id: "e", hp: 90 }, elements: ELEMENTS, moves: MOVES });
  assert.equal(n.player.maxHp, 80);
  assert.equal(n.enemy.element, null);
  assert.equal(n.enemy.nameZh, "e");
  const s1 = newBattle({ seed: 5 });
  const s2 = newBattle({ seed: 5 });
  assert.equal(s1.rng(), s2.rng());
  assert.equal(s1.rng(), s2.rng());
});

test("availableMoves：初始四招全可用，返回拷贝不回写", () => {
  const b = newBattle();
  const moves = Combat.availableMoves(b, "player");
  assert.deepEqual(moves.map((m) => m.id), ["sonic-wave", "fire-eyes", "demon-mirror", "somersault-cloud"]);
  moves[0].power = 99;
  assert.equal(Combat.availableMoves(b, "player")[0].power, 1);
  assert.deepEqual(Combat.availableMoves(b, "nonsense"), []);
});

test("resolveTurn：答对=命中，dmg=round(10×威力×克制×连击)，返回新增事件并入 log", () => {
  const b = newBattle();
  const evs = Combat.resolveTurn(b, "sonic-wave", true);
  assert.equal(evs.length, 1);
  const ev = evs[0];
  assertEventShape(ev);
  assert.equal(ev.actor, "player");
  assert.equal(ev.side, "player");
  assert.equal(ev.move, "sonic-wave");
  assert.equal(ev.hit, true);
  assert.equal(ev.mult, 1.3, "威力 1.0 × 克制 1.3(water→fire) × 连击 1.0");
  assert.equal(ev.dmg, 13);
  assert.equal(ev.hp, 87);
  assert.equal(ev.faint, false);
  assert.equal(ev.catch, null);
  assert.equal(b.enemy.hp, 87);
  assert.equal(b.log.length, 1);
  const evs2 = Combat.resolveTurn(b, "sonic-wave", true);
  assert.equal(evs2.length, 1, "返回的是本次新增事件（增量）");
  assert.equal(b.log.length, 2);
  assert.equal(b.log[1], evs2[0]);
});

test("resolveTurn：答错=miss（零伤害），连击清零", () => {
  const b = newBattle();
  const ev = Combat.resolveTurn(b, "sonic-wave", false)[0];
  assert.equal(ev.hit, false);
  assert.equal(ev.mult, 0);
  assert.equal(ev.dmg, 0);
  assert.equal(ev.hp, 100);
  assert.equal(ev.faint, false);
  assert.equal(b.enemy.hp, 100);
  Combat.resolveTurn(b, "sonic-wave", true);
  Combat.resolveTurn(b, "sonic-wave", false);
  const ev3 = Combat.resolveTurn(b, "sonic-wave", true)[0];
  assert.equal(ev3.mult, 1.3, "miss 后连击归零，无加成");
});

test("连击加成：每连击 +0.1，上限 1.5", () => {
  const b = newBattle({ player: fighter("player", "water", 100), enemy: fighter("imp", "earth", 200) });
  const dmg = [];
  for (let i = 0; i < 7; i += 1) dmg.push(Combat.resolveTurn(b, "sonic-wave", true)[0].dmg);
  assert.deepEqual(dmg, [10, 11, 12, 13, 14, 15, 15], "中性克制下 10→15 封顶");
});

test("克制系数进入伤害：strong 13 / weak round(7.5)=8（ring：earth→forest，water↛forest）", () => {
  const b1 = newBattle({ player: fighter("player", "earth", 100), enemy: fighter("imp", "forest", 100) });
  const e1 = Combat.resolveTurn(b1, "sonic-wave", true)[0];
  assert.equal(e1.mult, 1.3);
  assert.equal(e1.dmg, 13);
  const b2 = newBattle({ player: fighter("player", "water", 100), enemy: fighter("imp", "forest", 100) });
  const e2 = Combat.resolveTurn(b2, "sonic-wave", true)[0];
  assert.equal(e2.mult, 0.75);
  assert.equal(e2.dmg, 8);
});

test("冷却：cd1 招式隔一己方回合、cd2 隔两回合、cd0 恒可用", () => {
  const b = newBattle();
  Combat.resolveTurn(b, "fire-eyes", true);
  assert.deepEqual(Combat.availableMoves(b, "player").map((m) => m.id), ["sonic-wave", "demon-mirror", "somersault-cloud"]);
  Combat.resolveTurn(b, "sonic-wave", true);
  assert.ok(Combat.availableMoves(b, "player").some((m) => m.id === "fire-eyes"), "cd1 第三个己方回合恢复");
  const b2 = newBattle({ enemy: fighter("imp", "fire", 500) });
  Combat.resolveTurn(b2, "demon-mirror", true);
  assert.ok(!Combat.availableMoves(b2, "player").some((m) => m.id === "demon-mirror"), "cd2 第二己方回合不可用");
  Combat.resolveTurn(b2, "sonic-wave", true);
  assert.ok(!Combat.availableMoves(b2, "player").some((m) => m.id === "demon-mirror"), "cd2 第三己方回合仍不可用");
  Combat.resolveTurn(b2, "sonic-wave", true);
  assert.ok(Combat.availableMoves(b2, "player").some((m) => m.id === "demon-mirror"), "cd2 第四己方回合恢复");
  for (let i = 0; i < 5; i += 1) {
    assert.ok(Combat.availableMoves(b2, "player").some((m) => m.id === "sonic-wave"), "音波功 cd0 恒可用");
    Combat.resolveTurn(b2, "sonic-wave", true);
  }
});

test("体力：energyCost 不足的招式被过滤，每回合结束再生，regen=0 时持续过滤", () => {
  const b = newBattle({ energyStart: 1, energyRegen: 0 });
  assert.deepEqual(Combat.availableMoves(b, "player").map((m) => m.id).sort(), ["fire-eyes", "sonic-wave"]);
  Combat.resolveTurn(b, "sonic-wave", true);
  assert.equal(b.energy.player, 1, "regen 0 → 不回复");
  assert.ok(!Combat.availableMoves(b, "player").some((m) => m.id === "demon-mirror"));
  const b2 = newBattle({ energyStart: 1 });
  Combat.resolveTurn(b2, "sonic-wave", true);
  assert.equal(b2.energy.player, 2, "用后 1 + 再生 1");
  assert.ok(Combat.availableMoves(b2, "player").some((m) => m.id === "demon-mirror"), "再生后 cost2 招式解锁");
});

test("resolveTurn 无效招式：invalid 事件带原因、状态不变；终局后返回空数组", () => {
  const b = newBattle();
  const evs = Combat.resolveTurn(b, "no-such-move", true);
  assert.equal(evs.length, 1);
  assert.equal(evs[0].invalid, true);
  assert.equal(evs[0].reason, "unknown");
  assert.equal(b.enemy.hp, 100);
  assert.equal(b.log.length, 1);
  Combat.resolveTurn(b, "fire-eyes", true);
  const evs2 = Combat.resolveTurn(b, "fire-eyes", true);
  assert.equal(evs2[0].invalid, true);
  assert.equal(evs2[0].reason, "cooldown");
  assert.equal(b.enemy.hp, 84, "fire-eyes 1.2×1.3=1.56 → dmg 16，invalid 尝试不再扣血");
  const b3 = newBattle({ energyStart: 1, energyRegen: 0 });
  const evs3 = Combat.resolveTurn(b3, "demon-mirror", true);
  assert.equal(evs3[0].reason, "energy");
  const b2 = newBattle({ enemy: fighter("imp", "fire", 10) });
  Combat.resolveTurn(b2, "sonic-wave", true);
  assert.equal(b2.over, true);
  assert.deepEqual(Combat.resolveTurn(b2, "sonic-wave", true), []);
});

test("heal：命中后按造成伤害比例回自身，maxHp 封顶，miss 不回", () => {
  const b = newBattle({ player: fighter("player", "water", 100), enemy: fighter("imp", "earth", 100) });
  b.player.hp = 50;
  const ev = Combat.resolveTurn(b, "somersault-cloud", true)[0];
  assert.equal(ev.dmg, 13);
  assert.equal(ev.heal, 7, "round(13 × 0.5)");
  assert.equal(b.player.hp, 57);
  assert.equal(b.enemy.hp, 87);
  const b2 = newBattle({ player: fighter("player", "water", 100), enemy: fighter("imp", "earth", 100) });
  b2.player.hp = 50;
  const ev2 = Combat.resolveTurn(b2, "somersault-cloud", false)[0];
  assert.equal(ev2.hit, false);
  assert.equal(ev2.heal, undefined);
  assert.equal(b2.player.hp, 50);
  const b3 = newBattle({ player: fighter("player", "water", 100), enemy: fighter("imp", "earth", 100) });
  b3.player.hp = 97;
  const ev3 = Combat.resolveTurn(b3, "somersault-cloud", true)[0];
  assert.equal(ev3.heal, 3, "只补到 maxHp");
  assert.equal(b3.player.hp, 100);
});

test("enemyTurn 效用 AI：击杀奖励使残血目标被优先终结，击杀即终局", () => {
  const b = newBattle({ player: fighter("player", "fire", 10), enemy: fighter("imp", "water", 100) });
  const ev = Combat.enemyTurn(b)[0];
  assert.equal(ev.move, "demon-mirror", "mirror 期望伤害最高且 ≥ 目标 HP → 击杀奖励");
  assert.equal(ev.faint, true);
  assert.equal(b.player.hp, 0);
  assert.equal(b.over, true);
  assert.equal(b.winner, "enemy");
  const r = Combat.result(b);
  assert.equal(r.win, false);
  assert.deepEqual(Combat.enemyTurn(b), []);
});

test("enemyTurn 效用 AI：冷却与体力约束下的确定性招式序列", () => {
  const b = newBattle({ rng: mulberry32(1) });
  const picks = [];
  for (let i = 0; i < 5; i += 1) {
    picks.push(Combat.enemyTurn(b)[0].move);
  }
  assert.deepEqual(picks, ["demon-mirror", "somersault-cloud", "fire-eyes", "sonic-wave", "demon-mirror"]);
});

test("enemyTurn 效用 AI：自身残血时治疗招式获得加权", () => {
  const b = newBattle({ rng: mulberry32(1), enemy: fighter("imp", "fire", 20, 100) });
  const ev = Combat.enemyTurn(b)[0];
  assert.equal(ev.move, "somersault-cloud", "heal 加分 × (1 − hp/maxHp) 压过高威力招");
  assert.equal(ev.heal, 5);
  assert.equal(b.enemy.hp, 25);
});

test("enemyTurn 效用 AI：评分平分时用注入 rng 打破（确定性可测）", () => {
  const tieMoves = {
    schemaVersion: 1,
    moves: {
      x: { id: "x", label: "甲", quizKind: "listen-choice", power: 1, cooldown: 0, energyCost: 0 },
      y: { id: "y", label: "乙", quizKind: "listen-choice", power: 1, cooldown: 0, energyCost: 0 },
    },
  };
  const mk = (rng) => Combat.createBattle({
    player: fighter("player", "water", 100),
    enemy: fighter("imp", "fire", 100),
    elements: ELEMENTS,
    moves: tieMoves,
    rng,
  });
  assert.equal(Combat.enemyTurn(mk(rngSeq([0.9])))[0].move, "y");
  assert.equal(Combat.enemyTurn(mk(rngSeq([0.1])))[0].move, "x");
});

test("enemyTurn：事件字段（side/actor/hit 恒真/克制 mult）与回合推进", () => {
  const b = newBattle();
  const ev = Combat.enemyTurn(b)[0];
  assertEventShape(ev);
  assert.equal(ev.side, "enemy");
  assert.equal(ev.actor, "imp");
  assert.equal(ev.hit, true, "敌方行动恒命中，学习判定只在玩家侧");
  assert.equal(ev.mult, 1.125, "1.5 × 0.75(fire→water)");
  assert.equal(ev.dmg, 11);
  assert.equal(ev.hp, 89);
  assert.equal(b.player.hp, 89);
  assert.equal(b.turn, 2, "enemyTurn 结束进入下一回合");
});

test("catchChance：HP 反比 + 掌握度加成，clamp [0.05, 0.95]，越界输入归一", () => {
  assert.equal(Combat.catchChance(0, 1), 0.95);
  assert.equal(Combat.catchChance(1, 0), 0.05);
  assert.equal(Combat.catchChance(0.5, 0.5), 0.5);
  assert.equal(Combat.catchChance(2, 0.5), Combat.catchChance(1, 0.5));
  assert.equal(Combat.catchChance(-1, -1), Combat.catchChance(0, 0));
  assert.ok(Combat.catchChance(0.2, 0.8) > Combat.catchChance(0.2, 0.2), "掌握度单调");
  assert.ok(Combat.catchChance(0.1, 0.5) > Combat.catchChance(0.9, 0.5), "HP 越低概率越高");
});

test("result：进行中 null；win/expGain=hits×10+25/catchable 判定", () => {
  const b = newBattle({ enemy: fighter("imp", "fire", 30) });
  Combat.resolveTurn(b, "sonic-wave", true);
  Combat.resolveTurn(b, "sonic-wave", true);
  Combat.resolveTurn(b, "sonic-wave", true);
  const r = Combat.result(b);
  assert.equal(r.win, true);
  assert.equal(r.expGain, 55, "3 次命中 ×10 + 胜利 25");
  assert.equal(r.catchable, false, "胜利方不进入可捕捉");
  assert.equal(r.events.length, 3);
  assert.notEqual(r.events, b.log, "events 是快照拷贝");
  const b2 = newBattle({ player: fighter("player", "water", 10), enemy: fighter("imp", "fire", 100) });
  Combat.enemyTurn(b2);
  const r2 = Combat.result(b2);
  assert.equal(r2.win, false);
  assert.equal(r2.expGain, 0);
  assert.equal(r2.catchable, false, "敌方满血不可捕");
  const b3 = newBattle({ player: fighter("player", "water", 1), enemy: fighter("imp", "fire", 20, 100) });
  Combat.enemyTurn(b3);
  const r3 = Combat.result(b3);
  assert.equal(r3.win, false);
  assert.equal(r3.catchable, true, "败局但敌方 HP<30% → 可捕捉（P1-4 投球接线用）");
});

test("rng 注入：同种子两场完整模拟事件谱完全一致，异种子不同", () => {
  function playOut(seed) {
    const b = newBattle({
      id: `det-${seed}`,
      rng: mulberry32(seed),
      player: fighter("player", "water", 100),
      enemy: fighter("imp", "earth", 120),
    });
    let guard = 0;
    while (!b.over && guard < 300) {
      guard += 1;
      const mine = Combat.availableMoves(b, "player");
      const pick = mine[Math.floor(b.rng() * mine.length)];
      Combat.resolveTurn(b, pick.id, b.rng() < 0.7);
      if (b.over) break;
      Combat.enemyTurn(b);
    }
    return { winner: b.winner, turns: b.turn, log: b.log };
  }
  const a = playOut(42);
  const c = playOut(42);
  const d = playOut(43);
  assert.deepEqual(a, c);
  assert.notDeepEqual(a, d);
  assert.ok(a.over !== undefined || a.winner !== null);
});

test("100 场随机模拟：无死局、必终局、HP 归零必出 faint、事件 schema 合法", () => {
  const ELS = Object.keys(ELEMENTS.elements);
  let totalTurns = 0;
  let playerWins = 0;
  let maxTurns = 0;
  let faints = 0;
  let totalEvents = 0;
  for (let i = 0; i < 100; i += 1) {
    const battle = newBattle({
      id: `sim-${i}`,
      rng: mulberry32(1000 + i),
      player: fighter("player", ELS[i % ELS.length], 90 + (i % 3) * 10),
      enemy: fighter(`foe-${i}`, ELS[(i + 2) % ELS.length], 80 + (i % 4) * 10),
    });
    let guard = 0;
    while (!battle.over) {
      guard += 1;
      assert.ok(guard <= 400, `第 ${i} 场未终局（疑似死局）`);
      const mine = Combat.availableMoves(battle, "player");
      assert.ok(mine.length >= 1, "玩家侧无可选招式（死局）");
      const pick = mine[Math.floor(battle.rng() * mine.length)];
      const beforeEnemy = battle.enemy.hp;
      const evs = Combat.resolveTurn(battle, pick.id, battle.rng() < 0.7);
      assert.ok(evs.length >= 1);
      evs.forEach(assertEventShape);
      totalEvents += evs.length;
      if (evs[0].hit) assert.equal(battle.enemy.hp, Math.max(0, beforeEnemy - evs[0].dmg), "过量伤害被钳到 0");
      if (evs[0].dmg > 0 && evs[0].hp === 0) assert.equal(evs[0].faint, true);
      if (battle.over) break;
      const theirs = Combat.availableMoves(battle, "enemy");
      assert.ok(theirs.length >= 1, "敌方无可选招式（死局）");
      const beforePlayer = battle.player.hp;
      const eevs = Combat.enemyTurn(battle);
      assert.ok(eevs.length >= 1);
      eevs.forEach(assertEventShape);
      totalEvents += eevs.length;
      if (eevs[0].hit) assert.equal(battle.player.hp, Math.max(0, beforePlayer - eevs[0].dmg), "过量伤害被钳到 0");
      if (eevs[0].dmg > 0 && eevs[0].hp === 0) assert.equal(eevs[0].faint, true);
    }
    assert.ok(battle.over, "每场都终局");
    assert.ok(battle.player.hp === 0 || battle.enemy.hp === 0, "终局必有 HP 归零方");
    assert.equal(battle.player.hp === 0, battle.winner === "enemy");
    const r = Combat.result(battle);
    assert.ok(r);
    assert.equal(r.win, battle.winner === "player");
    assert.equal(r.events.length, battle.log.length);
    faints += battle.log.filter((e) => e.faint).length;
    totalTurns += battle.turn;
    maxTurns = Math.max(maxTurns, battle.turn);
    if (r.win) playerWins += 1;
  }
  assert.equal(faints, 100, "每场恰好一次 faint");
  const avgTurns = totalTurns / 100;
  const winRate = playerWins / 100;
  console.log(`[combat-core 模拟] 100 场：平均回合 ${avgTurns.toFixed(2)}，最长 ${maxTurns}，先手（玩家）胜率 ${(winRate * 100).toFixed(0)}%，事件总数 ${totalEvents}`);
  assert.ok(avgTurns > 0 && avgTurns < 100);
  assert.ok(playerWins >= 0 && playerWins <= 100);
});

test("data/game 副本与 content/game 保持一致", () => {
  for (const name of ["elements.json", "moves.json"]) {
    const content = JSON.parse(fs.readFileSync(new URL(`../../content/game/${name}`, import.meta.url), "utf8"));
    const data = JSON.parse(fs.readFileSync(new URL(`../../data/game/${name}`, import.meta.url), "utf8"));
    assert.deepEqual(data, content, `${name} 副本未同步`);
  }
});
