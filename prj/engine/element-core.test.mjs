import test from "node:test";
import assert from "node:assert/strict";
import core from "./element-core.js";

test("buildRing：环形克制映射，5 属性环", () => {
  const ring = core.buildRing({ ring: ["water", "fire", "forest", "earth", "light"] });
  assert.equal(ring.strongOf.water, "fire");
  assert.equal(ring.strongOf.fire, "forest");
  assert.equal(ring.strongOf.light, "water", "环形闭合");
});

test("multiplier：克制 1.3 / 被克 0.75 / 同元素与无关系 1", () => {
  const ring = core.buildRing({ ring: ["water", "fire", "forest", "earth", "light"] });
  assert.equal(core.multiplier(ring, "water", "fire"), 1.3);
  assert.equal(core.multiplier(ring, "fire", "water"), 0.75, "反向被克");
  assert.equal(core.multiplier(ring, "water", "water"), 1, "同元素");
  assert.equal(core.multiplier(ring, "water", "light"), 0.75, "光克水→水攻光为弱效（环形闭环）");
  assert.equal(core.multiplier(ring, null, "fire"), 1, "空攻击元素安全");
});

test("damage：最小伤害钳制 1，连击加成上限 0.5", () => {
  assert.equal(core.damage(10, 1.3, 0), 13);
  assert.equal(core.damage(10, 0.75, 0), 8, "0.75 四舍五入为 8");
  assert.equal(core.damage(5, 0.1, 0), 1, "最小伤害钳制 1");
  assert.equal(core.damage(10, 1, 0.4), 14, "连击加成生效");
  assert.equal(core.damage(10, 1, 0.9), 15, "连击加成封顶 0.5");
});

test("simulateTurns：A 全对先手胜；B 反击路径", () => {
  const r1 = core.simulateTurns({ hpA: 30, hpB: 30, elemA: "water", elemB: "fire", baseDmg: 10, answersA: [true, true, true], answersB: [true, true, true] });
  assert.equal(r1.winner, "A", "A 先手且同胜率→A 胜");
  assert.equal(r1.log.every((e) => e.dmg >= 1), true, "每击至少 1 伤");
  const r2 = core.simulateTurns({ hpA: 30, hpB: 30, elemA: "water", elemB: "fire", baseDmg: 10, answersA: [false, false, false, false, false, false, false, false, false, false], answersB: [true, true, true, true, true, true, true, true, true, true] });
  assert.equal(r2.winner, "B", "B 全对而 A 全错→B 胜");
});
