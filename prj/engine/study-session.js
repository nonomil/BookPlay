"use strict";

(function exposeStudySession(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BookPlayStudySession = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function studySessionFactory() {
  const DEFAULT_THRESHOLD_MS = 25 * 60 * 1000;

  function finiteMs(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : fallback;
  }

  function nowValue(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : Date.now();
  }

  function createStudySession(options = {}) {
    const configuredThreshold = Number(options.thresholdMs);
    const thresholdMs = Number.isFinite(configuredThreshold) && configuredThreshold > 0
      ? configuredThreshold : DEFAULT_THRESHOLD_MS;
    let activeMs = 0;
    let running = false;
    let prompted = false;
    let lastAt = null;

    function accrue(at, activity) {
      const current = nowValue(at);
      if (lastAt == null) {
        lastAt = current;
        return;
      }
      const delta = Math.max(0, current - lastAt);
      lastAt = current;
      if (running && activity !== false) activeMs += delta;
    }

    function snapshot() {
      return {
        activeMs,
        thresholdMs,
        running,
        prompted,
        due: activeMs >= thresholdMs,
      };
    }

    return {
      start(at = Date.now()) {
        if (!running) {
          running = true;
          lastAt = nowValue(at);
        }
        return snapshot();
      },
      pause(at = Date.now()) {
        // Do not guess unobserved time between the last heartbeat and a pause.
        // The next heartbeat before pausing can account for it when needed.
        accrue(at, false);
        running = false;
        lastAt = null;
        return snapshot();
      },
      resume(at = Date.now()) {
        if (!running) {
          running = true;
          lastAt = nowValue(at);
        }
        return snapshot();
      },
      tick(at = Date.now(), activity = true) {
        if (running) accrue(at, activity);
        return snapshot();
      },
      consumeBreakPrompt() {
        if (activeMs < thresholdMs || prompted) return false;
        prompted = true;
        return true;
      },
      restore(value, at = Date.now()) {
        const source = value && typeof value === "object" ? value : {};
        activeMs = finiteMs(source.activeMs);
        prompted = source.prompted === true;
        running = false;
        lastAt = nowValue(at);
        return snapshot();
      },
      reset() {
        activeMs = 0;
        prompted = false;
        running = false;
        lastAt = null;
        return snapshot();
      },
      snapshot,
    };
  }

  return { DEFAULT_THRESHOLD_MS, createStudySession };
}));
