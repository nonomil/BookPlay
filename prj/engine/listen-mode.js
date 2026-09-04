"use strict";

(function exposeListenMode(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BookPlayListenMode = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function listenModeFactory() {
  const DEFAULT_LOOPS = 2;
  const ALLOWED_LOOPS = new Set([1, 2, 3]);
  const ALLOWED_SUBTITLES = new Set(["en", "enzh"]);

  function normalizeListenOptions(value = {}) {
    const source = value && typeof value === "object" ? value : {};
    const loops = Number(source.loops);
    return {
      loops: ALLOWED_LOOPS.has(loops) ? loops : DEFAULT_LOOPS,
      subtitle: ALLOWED_SUBTITLES.has(source.subtitle) ? source.subtitle : "en",
      autoStop: source.autoStop !== false,
    };
  }

  function validIndexes(indexes) {
    return (Array.isArray(indexes) ? indexes : [])
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 0);
  }

  function createListenSession(options = {}) {
    const normalized = normalizeListenOptions(options);
    const beforeIndex = Number.isInteger(Number(options.beforeIndex))
      ? Number(options.beforeIndex) : 0;
    let loop = 1;
    let status = "playing";

    function snapshot() {
      return {
        loops: normalized.loops,
        subtitle: normalized.subtitle,
        autoStop: normalized.autoStop,
        beforeIndex,
        loop,
        status,
      };
    }

    function advance(index, indexes) {
      if (status !== "playing") return { action: status, index: null, loop };
      const ordered = validIndexes(indexes);
      const current = Number(index);
      const position = ordered.indexOf(current);
      const next = position >= 0 ? ordered[position + 1] : ordered[0];
      if (next != null) return { action: "play", index: next, loop };
      if (loop < normalized.loops && ordered.length) {
        loop += 1;
        return { action: "play", index: ordered[0], loop };
      }
      status = "done";
      return { action: "done", index: null, loop };
    }

    return {
      start(indexes) {
        const ordered = validIndexes(indexes);
        return { action: "play", index: ordered[0] ?? null, loop };
      },
      advance,
      pause() {
        if (status === "playing") status = "paused";
        return snapshot();
      },
      resume() {
        if (status === "paused") status = "playing";
        return snapshot();
      },
      exit() {
        status = "exited";
        return { action: "exit", index: beforeIndex, loop };
      },
      snapshot,
    };
  }

  return { DEFAULT_LOOPS, normalizeListenOptions, createListenSession };
}));
