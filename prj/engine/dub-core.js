"use strict";

/* 趣配音纯逻辑核心：场景目录、录音会话状态机、元数据与奖励幂等。
 * 数据合同（浏览器侧持久化在 dub-store / dub.js，这里只定义常量与纯变换）：
 *   localStorage bookplay_dub_v1       —— 元数据索引 { [ep]: { [nodeId]: {stars,durSec,createdAt,updatedAt} } }
 *   localStorage bookplay_dub_reward_v1 —— 每集首次配音 SP 幂等 { [ep]: true }
 *   IndexedDB  bookplay_dub_audio_v1 / clips —— 录音 Blob
 */
(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WalaDubCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function dubCoreFactory() {
  const DUB_INDEX_KEY = "bookplay_dub_v1";
  const DUB_REWARD_KEY = "bookplay_dub_reward_v1";
  const IDB_NAME = "bookplay_dub_audio_v1";
  const IDB_STORE = "clips";
  const MIN_RECORD_SEC = 0.5;
  const DEFAULT_MAX_SEC = 90;
  const REWARD_SP = 5;
  const SERIES_KEYS = { "jttw": "ep", "minecraft": "mc", "mikey-jj": "mj" };

  function bookKey(series, id) {
    const prefix = SERIES_KEYS[series] || SERIES_KEYS.jttw;
    return `${prefix}${Math.max(1, parseInt(id, 10) || 1)}`;
  }

  function dubKey(key, nodeId) {
    return `${String(key || "")}:${String(nodeId || "")}`;
  }

  function usableClip(node) {
    const from = Number(node.audio_start);
    const to = Number(node.audio_end);
    return Boolean(node)
      && String(node.text_en || "").trim().length > 0
      && Number.isFinite(from)
      && Number.isFinite(to)
      && to > from;
  }

  function buildSceneList(book) {
    const nodes = (book && Array.isArray(book.nodes)) ? book.nodes : [];
    return nodes.filter(usableClip).map((node) => ({
      nodeId: String(node.node_id || ""),
      speaker: String(node.speaker || "").trim(),
      textEn: String(node.text_en || "").trim(),
      textZh: String(node.text_zh || "").trim(),
      illustration: String(node.illustration || "").trim(),
      from: Number(node.audio_start),
      to: Number(node.audio_end),
      sentenceAudios: [],
    })).filter((scene) => scene.nodeId);
  }

  function sentenceTimes(series, sentence) {
    // mikey-jj 的时间是毫秒，minecraft/西游记是秒
    const scale = series === "mikey-jj" ? 1000 : 1;
    const from = Number(sentence.start_ms) / scale;
    const to = Number(sentence.end_ms) / scale;
    const fromSec = Number.isFinite(from) ? from : Number(sentence.start_sec);
    const toSec = Number.isFinite(to) ? to : Number(sentence.end_sec);
    if (!Number.isFinite(fromSec) || !Number.isFinite(toSec) || toSec <= fromSec) return null;
    return [fromSec, toSec];
  }

  function pageScenes(series, pages) {
    const scenes = [];
    (Array.isArray(pages) ? pages : []).forEach((page, index) => {
      const textEn = String((page && page.text_en) || "").trim();
      if (!textEn) return;
      const sentences = Array.isArray(page.sentences) ? page.sentences : [];
      const times = [];
      const sentenceAudios = [];
      sentences.forEach((sentence) => {
        const span = sentenceTimes(series, sentence);
        if (span) times.push(span);
        if (sentence && sentence.audio) sentenceAudios.push(String(sentence.audio));
      });
      // 页级时间轴不可靠时（例如 minecraft book1 页时间与句时间不一致），
      // 只要句级时间存在就以句级为准。
      let from;
      let to;
      if (times.length) {
        from = Math.min(...times.map((span) => span[0]));
        to = Math.max(...times.map((span) => span[1]));
      } else {
        const pageSpan = sentenceTimes(series, page);
        from = pageSpan ? pageSpan[0] : NaN;
        to = pageSpan ? pageSpan[1] : NaN;
      }
      if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return;
      const textZh = sentences
        .map((sentence) => String((sentence && sentence.zh) || "").trim())
        .filter(Boolean).join(" ");
      const speakerLabel = sentences[0] && sentences[0].speaker && sentences[0].speaker.label;
      scenes.push({
        nodeId: String(page.page_no != null ? page.page_no : index + 1),
        speaker: String(speakerLabel || "旁白").trim(),
        textEn,
        textZh,
        illustration: String(page.image || "").trim(),
        from,
        to,
        sentenceAudios,
      });
    });
    return scenes;
  }

  function normalizeDubBook(series, raw) {
    const book = raw && typeof raw === "object" ? raw : {};
    const title = book.title && typeof book.title === "object" ? book.title : {};
    if (series === "minecraft" || series === "mikey-jj") {
      return {
        key: bookKey(series, book.book),
        series,
        title: { zh: String(title.zh || ""), en: String(title.en || "") },
        audio: String(book.audio || ""),
        video: "",
        scenes: pageScenes(series, book.pages),
      };
    }
    return {
      key: bookKey("jttw", book.episode),
      series: "jttw",
      title: { zh: String(title.zh || ""), en: String(title.en || "") },
      audio: String(book.audio || ""),
      video: String(book.video || ""),
      scenes: buildSceneList(book),
    };
  }

  function createDubSession(options) {
    const opts = options || {};
    const maxSec = Number.isFinite(opts.maxSec) && opts.maxSec > MIN_RECORD_SEC ? opts.maxSec : DEFAULT_MAX_SEC;
    let state = "idle";
    let sec = 0;

    function snapshot() {
      return { state, sec };
    }

    function start() {
      if (state === "recording") return { ok: false, reason: "busy" };
      state = "recording";
      sec = 0;
      return { ok: true };
    }

    function stop(elapsedSec) {
      if (state !== "recording") return { ok: false, reason: "idle" };
      const elapsed = Number(elapsedSec);
      if (!Number.isFinite(elapsed) || elapsed < MIN_RECORD_SEC) {
        state = "idle";
        return { ok: false, reason: "too-short" };
      }
      sec = Math.min(elapsed, maxSec);
      state = "recorded";
      return { ok: true, sec };
    }

    function cancel() {
      state = "idle";
      sec = 0;
      return { ok: true };
    }

    return { start, stop, cancel, snapshot };
  }

  function normalizeDubMeta(raw) {
    const value = raw && typeof raw === "object" ? raw : {};
    const durSec = Number(value.durSec);
    if (!Number.isFinite(durSec) || durSec <= 0) return null;
    const stars = Number(value.stars);
    const clamped = Number.isFinite(stars) ? Math.min(3, Math.max(1, Math.round(stars))) : 1;
    const createdAt = Number(value.createdAt);
    const updatedAt = Number(value.updatedAt);
    return {
      stars: clamped,
      durSec,
      createdAt: Number.isFinite(createdAt) ? createdAt : 0,
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
    };
  }

  function upsertDubMeta(index, key, nodeId, meta, now) {
    const current = index && typeof index === "object" ? index : {};
    const normalized = normalizeDubMeta(meta);
    if (!normalized) return current;
    const epKey = String(key || "");
    const nodeKey = String(nodeId || "");
    if (!epKey || !nodeKey) return current;
    const prev = current[epKey] && current[epKey][nodeKey];
    const stamp = Number.isFinite(now) ? now : 0;
    const record = {
      ...normalized,
      createdAt: prev && prev.createdAt ? prev.createdAt : stamp,
      updatedAt: stamp,
    };
    return {
      ...current,
      [epKey]: { ...(current[epKey] || {}), [nodeKey]: record },
    };
  }

  function firstSaveReward(index, rewarded, key) {
    const current = index && typeof index === "object" ? index : {};
    const marks = rewarded && typeof rewarded === "object" ? rewarded : {};
    const epKey = String(key || "");
    const hasDub = Boolean(current[epKey]) && Object.keys(current[epKey]).length > 0;
    if (!epKey || !hasDub || marks[epKey]) return { sp: 0, rewarded: marks };
    return { sp: REWARD_SP, rewarded: { ...marks, [epKey]: true } };
  }

  function dubCoverage(index, key, scenes) {
    const current = index && typeof index === "object" ? index : {};
    const list = Array.isArray(scenes) ? scenes : [];
    const epKey = String(key || "");
    const done = list.filter((scene) => current[epKey] && current[epKey][scene.nodeId]).length;
    return { done, total: list.length, complete: list.length > 0 && done === list.length };
  }

  return {
    DUB_INDEX_KEY,
    DUB_REWARD_KEY,
    IDB_NAME,
    IDB_STORE,
    REWARD_SP,
    MIN_RECORD_SEC,
    SERIES_KEYS,
    bookKey,
    dubKey,
    buildSceneList,
    normalizeDubBook,
    createDubSession,
    normalizeDubMeta,
    upsertDubMeta,
    firstSaveReward,
    dubCoverage,
  };
});
