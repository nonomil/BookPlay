"use strict";

/* 降妖记词田纯逻辑（星露谷层）：种词 → 浇水（=1 次复习）→ 成熟收获；疏于照料枯萎。
 * 数据 = content/game/farm.json；日期串 "YYYY-MM-DD" 由调用方生成。
 * 收获物/枯萎的教育侧联动（词卡入收藏、词进错词队列）由调用方执行。 */
(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BookPlayFarmCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function farmCoreFactory() {
  function daysBetween(fromString, toString) {
    const from = new Date(fromString + "T00:00:00");
    const to = new Date(toString + "T00:00:00");
    if (isNaN(from) || isNaN(to)) return 0;
    return Math.max(0, Math.round((to - from) / 86400000));
  }

  function config(farmJson) {
    const c = farmJson && typeof farmJson === "object" ? farmJson : {};
    return {
      plots: Math.max(1, Number(c.plots) || 6),
      growDays: Math.max(1, (c.crop && Number(c.crop.growDays)) || 2),
      witherDays: Math.max(1, (c.crop && Number(c.crop.witherDays)) || 3),
      harvest: (c.crop && c.crop.harvest) || { wordCard: 1, gold: 4 },
    };
  }

  function createPlots(farmJson) {
    const cfg = config(farmJson);
    return Array.from({ length: cfg.plots }, (_, i) => ({
      id: `p${i + 1}`, state: "empty", word: null, progress: 0,
      plantedDate: null, wateredDate: null,
    }));
  }

  function normalize(state, farmJson) {
    const cfg = config(farmJson);
    const src = state && typeof state === "object" ? state : {};
    const plots = Array.isArray(src.plots) && src.plots.length === cfg.plots
      ? src.plots
      : createPlots(farmJson);
    return {
      plots: plots.map((p) => ({
        id: String(p.id), state: String(p.state || "empty"), word: p.word || null,
        progress: Math.max(0, Number(p.progress) || 0),
        plantedDate: p.plantedDate || null, wateredDate: p.wateredDate || null,
      })),
    };
  }

  function findPlot(state, plotId) {
    return state.plots.find((p) => p.id === plotId) || null;
  }

  function seed(state, plotId, word, dateStr) {
    const plot = findPlot(state, plotId);
    if (!plot) return { ok: false, reason: "plot" };
    if (plot.state !== "empty") return { ok: false, reason: "occupied" };
    const w = String(word || "").trim();
    if (!w) return { ok: false, reason: "word" };
    plot.state = "planted";
    plot.word = w;
    plot.progress = 0;
    plot.plantedDate = String(dateStr);
    plot.wateredDate = null;
    return { ok: true, state };
  }

  /* 浇水 = 一次复习成功（调用方先出题）。每天每块地只浇一次；浇满 growDays 成熟。 */
  function water(state, plotId, dateStr, farmJson) {
    const cfg = config(farmJson);
    const plot = findPlot(state, plotId);
    if (!plot) return { ok: false, reason: "plot" };
    if (plot.state !== "planted") return { ok: false, reason: plot.state };
    if (plot.wateredDate === String(dateStr)) return { ok: false, reason: "watered" };
    plot.wateredDate = String(dateStr);
    plot.progress += 1;
    if (plot.progress >= cfg.growDays) plot.state = "grown";
    return { ok: true, state, grown: plot.state === "grown" };
  }

  function harvest(state, plotId, farmJson) {
    const cfg = config(farmJson);
    const plot = findPlot(state, plotId);
    if (!plot) return { ok: false, reason: "plot" };
    if (plot.state !== "grown") return { ok: false, reason: plot.state };
    const rewards = { word: plot.word, wordCard: Number(cfg.harvest.wordCard) || 0, gold: Number(cfg.harvest.gold) || 0 };
    plot.state = "empty";
    plot.word = null;
    plot.progress = 0;
    plot.plantedDate = null;
    plot.wateredDate = null;
    return { ok: true, state, rewards };
  }

  /* 枯萎检查：种植/成熟态超过 witherDays 天未照料 → 枯萎归空（调用方把词记入错词）。 */
  function witherCheck(state, todayStr, farmJson) {
    const cfg = config(farmJson);
    const withered = [];
    state.plots.forEach((plot) => {
      if (plot.state !== "planted" && plot.state !== "grown") return;
      const lastTouched = plot.wateredDate || plot.plantedDate;
      if (lastTouched && daysBetween(lastTouched, todayStr) >= cfg.witherDays) {
        withered.push({ plotId: plot.id, word: plot.word });
        plot.state = "empty";
        plot.word = null;
        plot.progress = 0;
        plot.plantedDate = null;
        plot.wateredDate = null;
      }
    });
    return { state, withered };
  }

  return { config, createPlots, normalize, seed, water, harvest, witherCheck, daysBetween };
});
