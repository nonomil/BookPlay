"use strict";

(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WalaReviewQueue = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function reviewQueueFactory() {
  const KEY = "bookplay_carryover_review_v1";
  const MAX_ITEMS = 8;

  function read(storage) {
    if (!storage || typeof storage.getItem !== "function") return [];
    try {
      const value = JSON.parse(storage.getItem(KEY) || "{}");
      const items = Array.isArray(value && value.items) ? value.items : [];
      return items.filter((item) => item && String(item.term || "").trim());
    } catch (_) {
      return [];
    }
  }

  function write(storage, items) {
    if (!storage || typeof storage.setItem !== "function") return [];
    const normalized = (items || [])
      .map((item) => ({
        term: String(item && item.term || "").trim(),
        zh: String(item && item.zh || "").trim(),
        sourceEpisode: Number(item && item.sourceEpisode) || 0,
        example: String(item && item.example || "").trim(),
        evidence: String(item && item.evidence || "").trim(),
        at: Number(item && item.at) || Date.now(),
      }))
      .filter((item) => item.term)
      .slice(0, MAX_ITEMS);
    storage.setItem(KEY, JSON.stringify({ version: 1, items: normalized }));
    return normalized;
  }

  function enqueue(storage, item) {
    const term = String(item && item.term || "").trim();
    if (!term || term.toLowerCase() === "quiz") return read(storage);
    const current = read(storage);
    const previous = current.find((entry) => entry.term.toLowerCase() === term.toLowerCase());
    const next = {
      term,
      zh: String(item.zh || previous?.zh || "").trim(),
      sourceEpisode: Number(item.sourceEpisode) || Number(previous?.sourceEpisode) || 0,
      example: String(item.example || previous?.example || "").trim(),
      evidence: String(item.evidence || previous?.evidence || "").trim(),
      at: Number(item.at) || Date.now(),
    };
    return write(storage, [next, ...current.filter((entry) => entry.term.toLowerCase() !== term.toLowerCase())]);
  }

  function resolve(storage, term) {
    const key = String(term || "").trim().toLowerCase();
    if (!key) return read(storage);
    return write(storage, read(storage).filter((item) => item.term.toLowerCase() !== key));
  }

  function peek(storage, limit = 1) {
    const count = Math.max(0, Number(limit) || 0);
    return read(storage).slice(0, count);
  }

  return { KEY, MAX_ITEMS, list: read, enqueue, resolve, peek };
});
