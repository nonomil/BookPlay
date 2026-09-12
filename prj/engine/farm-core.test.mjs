import test from "node:test";
import assert from "node:assert/strict";
import farm from "./farm-core.js";

const farmJson = { plots: 3, crop: { growDays: 2, witherDays: 3, harvest: { wordCard: 1, gold: 4 } } };

test("createPlots：按配置数量生成空地块", () => {
  const plots = farm.createPlots(farmJson);
  assert.equal(plots.length, 3);
  assert.ok(plots.every((p) => p.state === "empty"));
  assert.deepEqual(farm.createPlots(null).length, 6, "缺配置回退 6 块");
});

test("seed：只能种在空地，词必填", () => {
  let st = farm.normalize(null, farmJson);
  assert.equal(farm.seed(st, "p1", "mountain", "2026-09-12").ok, true);
  assert.equal(farm.seed(st, "p1", "rock", "2026-09-12").ok, false, "已占用");
  assert.equal(farm.seed(st, "p9", "rock", "2026-09-12").ok, false, "地块不存在");
  assert.equal(farm.seed(st, "p2", "  ", "2026-09-12").ok, false, "空词拒绝");
  assert.equal(st.plots[0].word, "mountain");
});

test("water：每日一次，浇满 growDays 成熟", () => {
  let st = farm.normalize(null, farmJson);
  farm.seed(st, "p1", "mountain", "2026-09-12");
  assert.equal(farm.water(st, "p1", "2026-09-12", farmJson).ok, true);
  assert.equal(farm.water(st, "p1", "2026-09-12", farmJson).ok, false, "当日已浇");
  assert.equal(st.plots[0].state, "planted", "浇 1 次未成熟");
  assert.equal(farm.water(st, "p1", "2026-09-13", farmJson).grown, true, "第 2 次浇水成熟");
  assert.equal(st.plots[0].state, "grown");
  assert.equal(farm.water(st, "p1", "2026-09-14", farmJson).ok, false, "成熟态不可再浇");
});

test("harvest：只收成熟地块，收获后归空", () => {
  let st = farm.normalize(null, farmJson);
  farm.seed(st, "p1", "mountain", "2026-09-12");
  assert.equal(farm.harvest(st, "p1", farmJson).ok, false, "未成熟不可收");
  farm.water(st, "p1", "2026-09-12", farmJson);
  farm.water(st, "p1", "2026-09-13", farmJson);
  const r = farm.harvest(st, "p1", farmJson);
  assert.equal(r.ok, true);
  assert.deepEqual(r.rewards, { word: "mountain", wordCard: 1, gold: 4 });
  assert.equal(st.plots[0].state, "empty");
});

test("witherCheck：超 witherDays 未照料枯萎归空并报告词", () => {
  let st = farm.normalize(null, farmJson);
  farm.seed(st, "p1", "mountain", "2026-09-01");
  const r = farm.witherCheck(st, "2026-09-05", farmJson);
  assert.deepEqual(r.withered, [{ plotId: "p1", word: "mountain" }]);
  assert.equal(st.plots[0].state, "empty");
  // 当日照料过的不枯
  farm.seed(st, "p2", "rock", "2026-09-05");
  assert.deepEqual(farm.witherCheck(st, "2026-09-07", farmJson).withered, [], "3 天内不枯");
});

test("normalize：形状不对时回退空地块", () => {
  const st = farm.normalize({ plots: [{ id: "x" }] }, farmJson);
  assert.equal(st.plots.length, 3);
});
