"use strict";

/* 降妖记经济（星露谷层）：纯账本。物价数据 = content/game/economy.json（可调平衡）。
 * 金币余额由调用方持有；本模块只做定价/校验/加减的纯计算。 */
(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BookPlayEconomyCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function economyCoreFactory() {
  function items(economyJson) {
    return (economyJson && typeof economyJson === "object" ? economyJson.items : null) || {};
  }

  function price(economyJson, itemId, kind) {
    const entry = items(economyJson)[itemId];
    if (!entry) return null;
    const value = kind === "sell" ? entry.sell : entry.buy;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  function canAfford(gold, amount) {
    return (Number(gold) || 0) >= (Number(amount) || 0) && (Number(amount) || 0) >= 0;
  }

  function pay(gold, amount) {
    const a = Math.max(0, Number(amount) || 0);
    const g = Number(gold) || 0;
    if (g < a) return { ok: false, gold: g, reason: "gold" };
    return { ok: true, gold: g - a };
  }

  function earn(gold, amount) {
    return { ok: true, gold: (Number(gold) || 0) + Math.max(0, Number(amount) || 0) };
  }

  /* 物价自检：sell < buy（防倒卖刷币）、非负、buy>0。返回问题清单。 */
  function validate(economyJson) {
    const problems = [];
    const table = items(economyJson);
    for (const [id, entry] of Object.entries(table)) {
      const buy = Number(entry.buy);
      const sell = Number(entry.sell);
      if (!Number.isFinite(buy) || buy <= 0) problems.push(`${id}: buy 必须 > 0`);
      if (!Number.isFinite(sell) || sell < 0) problems.push(`${id}: sell 必须 ≥ 0`);
      if (Number.isFinite(buy) && Number.isFinite(sell) && sell >= buy) {
        problems.push(`${id}: sell(${sell}) 必须 < buy(${buy})，防倒卖`);
      }
    }
    if (!Object.keys(table).length) problems.push("items 为空");
    return problems;
  }

  return { items, price, canAfford, pay, earn, validate };
});
