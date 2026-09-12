import test from "node:test";
import assert from "node:assert/strict";
import schedule from "./schedule-core.js";
import economy from "./economy-core.js";

const economyJson = {
  schema_version: 1,
  items: {
    orb: { buy: 6, sell: 2 },
    peach: { buy: 8, sell: 3 },
    seed: { buy: 5, sell: 1 },
  },
};

test("schedule.energyMax：体力=复习预算，封顶 10", () => {
  assert.equal(schedule.energyMax(0), 4);
  assert.equal(schedule.energyMax(6), 10);
  assert.equal(schedule.energyMax(99), 10);
});

test("schedule.rollover：同日不切、跨天切且重置体力", () => {
  const s = { day: 1, date: "2026-09-12", energy: 2, energyMax: 6, streak: 3, visitedDates: ["2026-09-12"] };
  const same = schedule.rollover(s, "2026-09-12", 8);
  assert.equal(same.newDay, false);
  assert.equal(same.state.energy, 2, "同日不重置体力");
  const next = schedule.rollover(s, "2026-09-13", 8);
  assert.equal(next.newDay, true);
  assert.equal(next.state.day, 2);
  assert.equal(next.state.energy, 10, "队列 8 → energyMax 封顶 10");
  assert.equal(next.state.streak, 4, "连续到访 streak+1");
  const gap = schedule.rollover(s, "2026-09-20", 2);
  assert.equal(gap.state.streak, 1, "断签重置为 1");
});

test("schedule.spend：体力不足拒绝，足够则扣减", () => {
  const s = { energy: 3, energyMax: 10, day: 1, date: "x", streak: 1, visitedDates: [] };
  assert.equal(schedule.spend(s, 5).ok, false);
  const r = schedule.spend(s, 2);
  assert.equal(r.ok, true);
  assert.equal(r.state.energy, 1);
});

test("schedule.restore/settleDay：封顶回血与结算", () => {
  const s = { energy: 2, energyMax: 6, day: 1, date: "x", streak: 2, visitedDates: [] };
  assert.equal(schedule.restore(s, 9).energy, 6);
  assert.equal(schedule.settleDay(s, { streak: 5 }).streak, 5);
});

test("schedule.toLocalDateString：本地日期格式", () => {
  assert.match(schedule.toLocalDateString(new Date(2026, 8, 7)), /^2026-09-07$/);
});

test("economy.price：buy/sell 读取与缺失返回 null", () => {
  assert.equal(economy.price(economyJson, "orb", "buy"), 6);
  assert.equal(economy.price(economyJson, "orb", "sell"), 2);
  assert.equal(economy.price(economyJson, "nope", "buy"), null);
});

test("economy.pay/earn：余额不足拒绝", () => {
  assert.equal(economy.pay(5, 6).ok, false);
  assert.equal(economy.pay(7, 6).gold, 1);
  assert.equal(economy.earn(3, 4).gold, 7);
});

test("economy.validate：sell<buy、非空、非负", () => {
  assert.deepEqual(economy.validate(economyJson), []);
  assert.equal(economy.validate({ items: { x: { buy: 5, sell: 5 } } }).length, 1);
  assert.equal(economy.validate({ items: {} }).length, 1);
  assert.equal(economy.validate({ items: { x: { buy: 0, sell: 0 } } }).length, 2, "buy 非法 + 倒卖各计一项");
});
