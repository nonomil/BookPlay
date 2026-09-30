"use strict";

/* 降妖记·页面共享工具（game.js 与 battle.js 的同款函数收敛为一份）。
 * 本模块只收"两个页面逐字节相同且无页面状态闭包"的纯函数；
 * 依赖页面 state/els/audioEl 的重复（speakTerm/speakDialogue/persistWeak/
 * freezeLevel/showToast）留在各自页面，收敛见 docs/plans/2026-09-30-游戏部分重构/00-方案.md 切片 1b。
 * 无 DOM 写操作 / 无自有存储键（键由调用方传入）。 */
(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BookPlayGameCommon = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function gameCommonFactory() {
  function readStore(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "{}") || {};
    } catch (_) {
      return {};
    }
  }

  function writeStore(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) { /* 存不下就只保留本次体验 */ }
  }

  function handheldOffline() {
    try {
      return document.documentElement.hasAttribute("data-handheld");
    } catch (_) {
      return false;
    }
  }

  function fetchJSON(url) {
    return fetch(url, { cache: "no-store" }).then((res) => (res.ok ? res.json() : null));
  }

  function assetUrl(path) {
    return path ? "../" + String(path).replace(/^\.\.\//, "") : "";
  }

  function catalogCards(level) {
    const cards = [];
    const push = (row) => {
      if (!row || !row.term || !row.zh) return;
      cards.push(row);
    };
    (level && level.previewWords || []).forEach(push);
    ((level && level.waves) || []).forEach((wave) => (wave.monsters || []).forEach(push));
    (((level && level.boss) || {}).hpWords || []).forEach(push);
    return cards;
  }

  return { readStore, writeStore, handheldOffline, fetchJSON, assetUrl, catalogCards };
});
