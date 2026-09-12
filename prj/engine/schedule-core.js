"use strict";

/* 降妖记日循环与体力（星露谷层）：一天=一个复习单元，体力=今日复习预算。
 * 纯逻辑无存储；玩家侧 state 由调用方持有（建议落 bookplay_farm_v1）。
 * 日期格式 "YYYY-MM-DD"（本地时区，调用方用 toLocalDateString 生成）。
 */
(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BookPlayScheduleCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function scheduleCoreFactory() {
  const ENERGY_MAX_CAP = 10;
  const ENERGY_QUEUE_BASE = 4;

  function toLocalDateString(date) {
    const d = date instanceof Date ? date : new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function normalize(state) {
    const src = state && typeof state === "object" ? state : {};
    return {
      day: Number(src.day) || 1,
      date: String(src.date || ""),
      energy: Math.max(0, Number(src.energy) || 0),
      energyMax: Math.max(1, Number(src.energyMax) || ENERGY_MAX_CAP),
      streak: Math.max(0, Number(src.streak) || 0),
      visitedDates: Array.isArray(src.visitedDates) ? src.visitedDates.slice(-60) : [],
    };
  }

  function energyMax(queueCount) {
    const q = Math.max(0, Number(queueCount) || 0);
    return Math.min(ENERGY_MAX_CAP, q + ENERGY_QUEUE_BASE);
  }

  /* 日切：跨天（或首次）返回 {newDay, state}；同日返回 {newDay:false, state}。 */
  function rollover(state, todayString, queueCount) {
    const s = normalize(state);
    const today = String(todayString || toLocalDateString());
    if (s.date === today) return { newDay: false, state: s };
    const consecutive = s.date && isYesterday(s.date, today);
    const next = normalize({
      day: s.day + 1,
      date: today,
      energy: energyMax(queueCount),
      energyMax: energyMax(queueCount),
      streak: consecutive ? s.streak + 1 : 1,
      visitedDates: s.visitedDates.concat(today),
    });
    return { newDay: true, state: next };
  }

  function isYesterday(prevString, todayString) {
    const prev = new Date(prevString + "T00:00:00");
    const today = new Date(todayString + "T00:00:00");
    if (isNaN(prev) || isNaN(today)) return false;
    return Math.round((today - prev) / 86400000) === 1;
  }

  function spend(state, cost) {
    const s = normalize(state);
    const c = Math.max(0, Number(cost) || 0);
    if (s.energy < c) return { ok: false, state: s, reason: "energy" };
    s.energy -= c;
    return { ok: true, state: s };
  }

  function restore(state, amount) {
    const s = normalize(state);
    s.energy = Math.min(s.energyMax, s.energy + Math.max(0, Number(amount) || 0));
    return s;
  }

  function settleDay(state, effects) {
    const s = normalize(state);
    const e = effects || {};
    s.streak = Math.max(0, Number(e.streak) != null ? Number(e.streak) : s.streak);
    if (e.energyDelta) s.energy = Math.min(s.energyMax, Math.max(0, s.energy + e.energyDelta));
    return s;
  }

  return {
    ENERGY_MAX_CAP,
    toLocalDateString,
    energyMax,
    rollover,
    spend,
    restore,
    settleDay,
    normalize,
  };
});
