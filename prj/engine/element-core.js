"use strict";

/* 降妖记·元素克制纯逻辑（combat-core v2 的最小先行版）。
 * 数据 = content/game/elements.json（环形克制 1.3/0.75）。
 * 本模块只做"克制倍率 + 伤害试算 + 回合模拟"三件事，供快速原型与战斗页共用。
 * 无 DOM / 无存储 / 无网络。 */
(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BookPlayElementCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function elementCoreFactory() {
  const STRONG = 1.3;
  const WEAK = 0.75;

  function buildRing(elementsJson) {
    // elementsJson: { ring: ["water","fire","forest","earth","light"], strongOf: {...}? }
    // 约定：ring 顺序即克制方向——每个元素克制它的下一个（环形）。
    const ring = (elementsJson && Array.isArray(elementsJson.ring)) ? elementsJson.ring.map(String) : [];
    const strongOf = {};
    ring.forEach((el, i) => { strongOf[el] = ring[(i + 1) % ring.length]; });
    return { ring, strongOf };
  }

  function multiplier(ringData, atkEl, defEl) {
    if (!atkEl || !defEl || atkEl === defEl) return 1;
    const strong = ringData.strongOf[atkEl];
    if (!strong) return 1;
    // 被克制：defEl 克制 atkEl → 弱效
    const defStrong = ringData.strongOf[defEl];
    if (defStrong === atkEl) return WEAK;
    return strong === defEl ? STRONG : 1;
  }

  function damage(base, mult, comboBonus) {
    const combo = Math.min(0.5, Math.max(0, Number(comboBonus) || 0));
    return Math.max(1, Math.round((Number(base) || 1) * mult * (1 + combo)));
  }

  function simulateTurns({ hpA, hpB, elemA, elemB, baseDmg, answersA, answersB }) {
    // 回合模拟：A 先手；answersA/answersB = 每回合答对与否数组（true=命中）。
    let a = hpA, b = hpB, turn = 0;
    const log = [];
    while (a > 0 && b > 0 && turn < 60) {
      turn += 1;
      const hitA = answersA[turn - 1] !== false;
      const hitB = answersB[turn - 1] !== false;
      const multA = multiplier(buildRing({ ring: ["water", "fire", "forest", "earth", "light"] }), elemA, elemB);
      const dmgA = hitA ? damage(baseDmg, multA, 0) : 0;
      b = Math.max(0, b - dmgA);
      log.push({ turn, by: "A", dmg: dmgA, bLeft: b });
      if (b <= 0) return { winner: "A", turns: turn, log };
      const dmgB = hitB ? damage(baseDmg, 1, 0) : 0;
      a = Math.max(0, a - dmgB);
      log.push({ turn, by: "B", dmg: dmgB, aLeft: a });
      if (a <= 0) return { winner: "B", turns: turn, log };
    }
    return { winner: a >= b ? "A" : "B", turns: turn, log };
  }

  return { buildRing, multiplier, damage, simulateTurns };
});
