"use strict";

(function exposeWordTokenAudio(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else if (root) root.BookPlayWordTokenAudio = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function wordTokenAudioFactory() {
  function tokenizeCaptionWords(text) {
    const parts = [];
    const re = /[^\s]+|\s+/g;
    let match;
    while ((match = re.exec(String(text || "")))) {
      parts.push({ type: /^\s+$/.test(match[0]) ? "space" : "word", text: match[0] });
    }
    return parts;
  }

  function cleanWord(value) {
    return String(value || "").replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "");
  }

  function resolveWordAudio({ staticUrl = null, sentenceUrl = null, timing = null, ttsUrl = null } = {}) {
    if (staticUrl) return { kind: "static", url: String(staticUrl) };
    if (sentenceUrl && timing && Number.isFinite(Number(timing.start_ms)) && Number.isFinite(Number(timing.end_ms))
      && Number(timing.end_ms) > Number(timing.start_ms)) {
      return {
        kind: "seek",
        url: String(sentenceUrl),
        start_ms: Number(timing.start_ms),
        end_ms: Number(timing.end_ms),
      };
    }
    if (ttsUrl) return { kind: "tts", url: String(ttsUrl) };
    return null;
  }

  return { tokenizeCaptionWords, cleanWord, resolveWordAudio };
}));
