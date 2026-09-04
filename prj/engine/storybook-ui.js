(function exposeStorybookUI(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BookPlayStorybookUI = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function storybookUIFactory() {
  "use strict";

  const PREFERENCES_KEY = "bookplay_storybook_preferences";

  function finitePositive(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  /**
   * Return the visible rectangle produced by object-fit: contain.
   * left/top are relative to the containing box unless boxLeft/boxTop are supplied.
   */
  function containedRect({
    boxLeft = 0,
    boxTop = 0,
    boxWidth,
    boxHeight,
    naturalWidth,
    naturalHeight,
  } = {}) {
    const bw = finitePositive(boxWidth);
    const bh = finitePositive(boxHeight);
    const nw = finitePositive(naturalWidth);
    const nh = finitePositive(naturalHeight);
    if (!bw || !bh || !nw || !nh) return null;
    const scale = Math.min(bw / nw, bh / nh);
    const width = nw * scale;
    const height = nh * scale;
    const left = Number(boxLeft) + (bw - width) / 2;
    const top = Number(boxTop) + (bh - height) / 2;
    return { left, top, width, height };
  }

  /** Project a normalized bubble (x/y/w/h) into a contained image rectangle. */
  function projectRelativeBox(rect, bubble) {
    if (!rect || !bubble) return null;
    const left = Number(rect.left);
    const top = Number(rect.top);
    const width = Number(rect.width);
    const height = Number(rect.height);
    const x = Number(bubble.x);
    const y = Number(bubble.y);
    const w = Number(bubble.w);
    const h = Number(bubble.h);
    if (![left, top, width, height, x, y, w, h].every(Number.isFinite)) return null;
    if (width <= 0 || height <= 0 || w <= 0 || h <= 0) return null;
    // Annotation coordinates are normalized to the source page. Clamp the
    // projected box to the actual contained image so letterboxing is never hit.
    const minX = Math.max(0, Math.min(1, x));
    const minY = Math.max(0, Math.min(1, y));
    const maxX = Math.max(minX, Math.min(1, x + w));
    const maxY = Math.max(minY, Math.min(1, y + h));
    const projected = {
      left: left + minX * width,
      top: top + minY * height,
      width: (maxX - minX) * width,
      height: (maxY - minY) * height,
    };
    if (projected.width <= 0 || projected.height <= 0) return null;
    return projected;
  }

  function formatUnitProgress({ page, pages, sentence, sentences } = {}) {
    const p = Number(page);
    const ps = Number(pages);
    const s = Number(sentence);
    const ss = Number(sentences);
    const hasPage = Number.isFinite(p) && Number.isFinite(ps) && ps > 0;
    const hasSentence = Number.isFinite(s) && Number.isFinite(ss) && ss > 0;
    if (hasPage && hasSentence) return `第 ${Math.max(1, p)}/${ps} 页 · 第 ${Math.max(1, s)}/${ss} 句`;
    if (hasPage) return `第 ${Math.max(1, p)}/${ps} 页`;
    if (hasSentence) return `第 ${Math.max(1, s)}/${ss} 句`;
    return "";
  }

  function resolveReaderMode(_series, requested) {
    if (requested === "story" || requested === "study") return requested;
    // First entry should feel like a picture book: let the child experience
    // the whole story before opening the精学回放/词卡 loop.  Both series still
    // expose the study toggle, and Mikey & JJ remains click-to-advance because
    // its sentence player has an explicit reader-paced contract.
    return "story";
  }

  function shouldAutoAdvance({ mode, unlocked, hasAudio } = {}) {
    return mode === "story" && Boolean(unlocked) && Boolean(hasAudio);
  }

  function shouldShowKeywords(items, mode) {
    return mode === "study" && Array.isArray(items) && items.length > 0;
  }

  function shouldShowTranslation({ zh, preference } = {}) {
    return Boolean(preference) && typeof zh === "string" && zh.trim().length > 0;
  }

  /**
   * Resolve the word index for a sentence caption.  Authored word timings are
   * preferred whenever they cover every visible word; otherwise the reader
   * falls back to a clearly approximate, duration-proportional highlight.
   * Returning `wordCount` means playback has passed the last authored boundary.
   */
  function wordHighlightIndex({ currentMs = 0, durationMs = 0, timings = [], wordCount = 0 } = {}) {
    const count = Math.max(0, Number(wordCount) || 0);
    if (!count) return -1;
    const valid = Array.isArray(timings) && timings.length === count && timings.every((timing) => {
      const start = Number(timing && timing.start_ms);
      const end = Number(timing && timing.end_ms);
      return Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start;
    });
    const now = Math.max(0, Number(currentMs) || 0);
    if (valid) {
      const active = timings.findIndex((timing) => now >= Number(timing.start_ms) && now < Number(timing.end_ms));
      if (active >= 0) return active;
      if (now < Number(timings[0].start_ms)) return 0;
      if (now >= Number(timings[count - 1].end_ms)) return count;
      return 0;
    }
    const duration = Math.max(0.05, Number(durationMs) || 0.05);
    return Math.min(count - 1, Math.max(0, Math.floor((now / duration) * count)));
  }

  function flattenSentences(book) {
    return (book && Array.isArray(book.pages) ? book.pages : []).flatMap((page) => (
      Array.isArray(page && page.sentences) ? page.sentences : []
    ));
  }

  function seriesCapabilities(series, book = {}) {
    const sentences = flattenSentences(book);
    const hasSentenceMode = sentences.length > 0;
    const hasWordTiming = sentences.some((s) => Array.isArray(s && s.words) && s.words.some((w) => (
      Number.isFinite(Number(w && w.start_ms)) && Number.isFinite(Number(w && w.end_ms))
    )));
    const hasTranslation = sentences.some((s) => typeof (s && s.zh) === "string" && s.zh.trim())
      || Boolean(book && book.zh);
    const hasBubbleLocator = series === "mikey-jj" && sentences.some((s) => (
      s && s.bubble && ["x", "y", "w", "h"].every((key) => Number.isFinite(Number(s.bubble[key])))
    ));
    return {
      hasSentenceMode,
      hasWordTiming,
      hasTranslation,
      hasSpeaker: series === "mikey-jj" && sentences.some((s) => s && s.speaker),
      hasBubbleLocator,
    };
  }

  function readPreferenceMap(storage) {
    if (!storage || typeof storage.getItem !== "function") return {};
    try {
      const parsed = JSON.parse(storage.getItem(PREFERENCES_KEY) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function readPreferences(storage, series) {
    const map = readPreferenceMap(storage);
    const value = map[series];
    return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
  }

  function writePreferences(storage, series, preferences) {
    if (!storage || typeof storage.setItem !== "function" || !series) return false;
    const map = readPreferenceMap(storage);
    map[series] = preferences && typeof preferences === "object" && !Array.isArray(preferences)
      ? { ...preferences }
      : {};
    try {
      storage.setItem(PREFERENCES_KEY, JSON.stringify(map));
      return true;
    } catch (_) {
      return false;
    }
  }

  return {
    containedRect,
    projectRelativeBox,
    formatUnitProgress,
    seriesCapabilities,
    readPreferences,
    writePreferences,
    resolveReaderMode,
    shouldAutoAdvance,
    shouldShowKeywords,
    shouldShowTranslation,
    wordHighlightIndex,
  };
}));
