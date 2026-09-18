"use strict";

/* Small, page-local voice adapter shared by the map and Boss pages.
 * It deliberately owns no storage and never decides game state. Static clips
 * win over TTS; a generation token prevents a late play/ended callback from
 * resurrecting a sentence after the player has pressed next or left the page.
 */
(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BookPlayGameAudio = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function gameAudioFactory() {
  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function langKey(value) {
    return String(value || "").toLowerCase().startsWith("zh") ? "zh" : "en";
  }

  function findEntry(index, ref, text, lang) {
    const table = index && typeof index === "object" ? index : {};
    const candidates = [
      table.entries && table.entries[ref],
      table[ref],
      table[lang] && table[lang][text],
      table[langKey(lang)] && table[langKey(lang)][text],
      table[lang === "zh-CN" ? "zh" : "en"] && table[lang === "zh-CN" ? "zh" : "en"][text],
    ];
    const lower = clean(text).toLowerCase();
    for (const candidate of candidates) {
      if (candidate) return candidate;
    }
    for (const bucket of [table.entries, table[lang], table[langKey(lang)], table.en, table.zh]) {
      if (!bucket || typeof bucket !== "object") continue;
      for (const [key, value] of Object.entries(bucket)) {
        if (clean(key).toLowerCase() === lower) return value;
        // Published indexes use stable dialogue ids as keys while callers may
        // still carry the source ``audioRef``. Match the audited clip text as
        // a second lookup path, but keep language separation when metadata is
        // present so an English request cannot pick a Chinese clip.
        const valueText = clean(value && (value.text || value.textEn || value.textZh)).toLowerCase();
        if (valueText === lower && (!value.lang || langKey(value.lang) === langKey(lang))) return value;
      }
    }
    return null;
  }

  function normalizeRequest(input) {
    if (typeof input === "string") {
      const ref = input;
      const split = ref.indexOf(":");
      if (split > 0 && /^(sent_en|sent_zh|word|dialogue|quiz)/i.test(ref.slice(0, split))) {
        const prefix = ref.slice(0, split).toLowerCase();
        const text = clean(ref.slice(split + 1));
        const lang = prefix === "sent_zh" ? "zh-CN" : "en-US";
        return { ref, text, lang };
      }
      return { ref, text: clean(ref), lang: "en-US" };
    }
    const value = input && typeof input === "object" ? input : {};
    const ref = String(value.ref || value.audioRef || value.id || "");
    const text = clean(value.text || value.textEn || value.term || (ref.includes(":") ? ref.slice(ref.indexOf(":") + 1) : ""));
    return { ref, text, lang: value.lang || (value.textZh && !value.textEn ? "zh-CN" : "en-US"), priority: Number(value.priority) || 0 };
  }

  function srcFor(entry, prefix) {
    const src = typeof entry === "string" ? entry : entry && (entry.src || entry.url);
    if (!src) return "";
    const value = String(src);
    if (/^(?:[a-z]+:|\/|\.\.\/)/i.test(value)) return value;
    return `${prefix || "../"}${value}`;
  }

  function createGameAudio(options) {
    const opts = options || {};
    const media = opts.media || (typeof Audio === "function" ? new Audio() : null);
    const index = opts.audioIndex && typeof opts.audioIndex === "object" ? opts.audioIndex : {};
    const onState = typeof opts.onState === "function" ? opts.onState : () => {};
    const assetPrefix = opts.assetPrefix == null ? "../" : String(opts.assetPrefix);
    const ttsEndpoint = opts.ttsEndpoint || "/api/tts";
    const allowTts = opts.allowTts != null
      ? Boolean(opts.allowTts)
      : !(typeof document !== "undefined" && document.documentElement && document.documentElement.hasAttribute("data-handheld"));
    let generation = 0;
    let active = null;
    let lastRequest = null;
    let disposed = false;
    const listeners = [];

    function report(state, meta) {
      try { onState(state, Object.assign({ episode: opts.episode || null }, meta || {})); } catch (_) { /* telemetry must not block audio */ }
    }

    function detach(activeRequest) {
      if (!activeRequest || !media) return;
      for (const [event, handler] of activeRequest.handlers) media.removeEventListener(event, handler);
      activeRequest.handlers = [];
    }

    function settle(activeRequest, result) {
      if (!activeRequest || activeRequest.settled) return;
      activeRequest.settled = true;
      detach(activeRequest);
      if (active === activeRequest) active = null;
      activeRequest.resolve(Boolean(result));
    }

    function stop(reason) {
      generation += 1;
      const previous = active;
      active = null;
      if (previous) settle(previous, false);
      if (media) {
        try { media.pause(); } catch (_) { /* platform boundary */ }
      }
      report("idle", { reason: reason || "stop" });
      return true;
    }

    function play(input) {
      if (disposed || !media) {
        report("unavailable", { reason: disposed ? "disposed" : "no-media" });
        return Promise.resolve(false);
      }
      const request = normalizeRequest(input);
      if (!request.text && !request.ref) {
        report("unavailable", { reason: "empty-reference" });
        return Promise.resolve(false);
      }
      const current = ++generation;
      if (active) {
        const old = active;
        active = null;
        settle(old, false);
        try { media.pause(); } catch (_) {}
      }
      lastRequest = input;
      const entry = findEntry(index, request.ref, request.text, request.lang);
      const staticSrc = srcFor(entry, assetPrefix);
      if (!staticSrc && !allowTts) {
        report("unavailable", { reason: "offline-no-static", ref: request.ref, text: request.text, lang: request.lang, source: "offline" });
        return Promise.resolve(false);
      }
      const url = staticSrc || `${ttsEndpoint}?voice=${langKey(request.lang)}&text=${encodeURIComponent(request.text)}`;
      const source = staticSrc ? "static" : "tts-fallback";
      report("loading", { ref: request.ref, text: request.text, lang: request.lang, url, source });
      const task = { generation: current, handlers: [], settled: false, resolve: null };
      const promise = new Promise((resolve) => { task.resolve = resolve; });
      active = task;
      const guard = (fn) => (...args) => {
        if (disposed || current !== generation || active !== task) return;
        fn(...args);
      };
      const ended = guard(() => { report("ended", { ref: request.ref, url, source }); settle(task, true); });
      const failed = guard((event) => { report("unavailable", { ref: request.ref, url, source, error: event && event.error ? String(event.error) : "media-error" }); settle(task, false); });
      const started = guard(() => report("playing", { ref: request.ref, url, source }));
      task.handlers = [["ended", ended], ["error", failed], ["play", started]];
      task.handlers.forEach(([event, handler]) => media.addEventListener(event, handler));
      try {
        media.src = url;
        media.currentTime = 0;
        const result = media.play();
        Promise.resolve(result).then(() => {
          if (disposed || current !== generation || active !== task) return settle(task, false);
          report("playing", { ref: request.ref, url, source });
          // The promise resolves when playback starts; the ended event later
          // moves the observable state to ended without blocking the caller.
          task.resolve(true);
        }).catch((error) => {
          if (disposed || current !== generation || active !== task) return settle(task, false);
          report("unavailable", { ref: request.ref, url, source, error: String(error && error.message || error) });
          settle(task, false);
        });
      } catch (error) {
        report("unavailable", { ref: request.ref, url, source, error: String(error && error.message || error) });
        settle(task, false);
      }
      return promise;
    }

    function replay() {
      return lastRequest == null ? Promise.resolve(false) : play(lastRequest);
    }

    if (media && opts.watchMedia && typeof opts.watchMedia === "function") opts.watchMedia(media);
    else if (media && typeof window !== "undefined" && window.BookPlayAudio?.watchMedia) window.BookPlayAudio.watchMedia(media);

    return {
      play,
      replay,
      stop,
      getState: () => ({ generation, active: Boolean(active), lastRequest }),
      dispose() {
        if (disposed) return;
        disposed = true;
        stop("dispose");
        listeners.splice(0).forEach((off) => { try { off(); } catch (_) {} });
      },
    };
  }

  return { createGameAudio, normalizeRequest, findEntry, srcFor };
});
