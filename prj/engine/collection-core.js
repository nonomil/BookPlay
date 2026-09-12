"use strict";

/* 降妖记图鉴纯逻辑：解锁/登记/进化/完成度。
 * 数据 = content/game/dex.json（手写源）；玩家侧 dexState 由调用方持有（本模块无存储）。
 * 真值约定：mastery = Set<string>（已掌握词，casefold 前后一致由调用方保证）。
 */
(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BookPlayCollectionCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function collectionCoreFactory() {
  function normalizeState(state) {
    const src = state && typeof state === "object" ? state : {};
    return {
      caught: Array.isArray(src.caught) ? src.caught.slice() : [],
      seen: Array.isArray(src.seen) ? src.seen.slice() : [],
      stars: src.stars && typeof src.stars === "object" ? Object.assign({}, src.stars) : {},
    };
  }

  function entryWords(entry) {
    return Array.isArray(entry && entry.words) ? entry.words.map((w) => String(w).toLowerCase()) : [];
  }

  function masterySet(words) {
    return new Set((Array.isArray(words) ? words : []).map((w) => String(w).toLowerCase()));
  }

  function unlockable(dexJson, masteredWords) {
    const list = dexJson && Array.isArray(dexJson.dex) ? dexJson.dex : [];
    const mastered = masterySet(masteredWords);
    return list.filter((entry) => {
      const words = entryWords(entry);
      return words.length > 0 && words.every((w) => mastered.has(w));
    }).map((entry) => entry.id);
  }

  function findEntry(dexJson, dexId) {
    const list = dexJson && Array.isArray(dexJson.dex) ? dexJson.dex : [];
    return list.find((entry) => entry.id === dexId) || null;
  }

  function register(dexState, dexId, options) {
    const opts = options || {};
    const state = normalizeState(dexState);
    if (!state.caught.includes(dexId)) state.caught.push(dexId);
    if (!state.seen.includes(dexId)) state.seen.push(dexId);
    if (opts.stars != null) {
      const prev = Number(state.stars[dexId]) || 0;
      state.stars[dexId] = Math.max(prev, Math.max(0, Number(opts.stars) || 0));
    }
    return state;
  }

  function markSeen(dexState, dexId) {
    const state = normalizeState(dexState);
    if (!state.seen.includes(dexId)) state.seen.push(dexId);
    return state;
  }

  function evolutionReady(dexJson, dexState, masteredWords) {
    const state = normalizeState(dexState);
    const mastered = masterySet(masteredWords);
    const out = [];
    (Array.isArray(dexJson && dexJson.dex) ? dexJson.dex : []).forEach((entry) => {
      const evo = entry.evolution;
      if (!evo) return;
      if (!state.caught.includes(entry.id)) return;
      const gained = entryWords(entry).filter((w) => mastered.has(w)).length;
      const stars = Number(state.stars[entry.id]) || 0;
      const ready = gained >= Number(evo.requireWords) && stars >= Number(evo.requireStars);
      out.push({ from: entry.id, to: evo.to, ready, missing: {
        words: Math.max(0, Number(evo.requireWords) - gained),
        stars: Math.max(0, Number(evo.requireStars) - stars),
      } });
    });
    return out;
  }

  function completion(dexJson, dexState) {
    const list = dexJson && Array.isArray(dexJson.dex) ? dexJson.dex : [];
    const state = normalizeState(dexState);
    const total = list.length;
    const caught = list.filter((entry) => state.caught.includes(entry.id)).length;
    const seen = list.filter((entry) => state.seen.includes(entry.id)).length;
    return { total, caught, seen, ratio: total ? caught / total : 0 };
  }

  function isCaught(dexState, dexId) {
    return normalizeState(dexState).caught.includes(dexId);
  }

  return {
    normalizeState,
    unlockable,
    findEntry,
    register,
    markSeen,
    evolutionReady,
    completion,
    isCaught,
  };
});
