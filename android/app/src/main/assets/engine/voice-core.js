"use strict";

(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WalaVoiceCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function voiceCoreFactory() {
  const KINDS = Object.freeze([
    "match",
    "partial",
    "mismatch",
    "no-speech",
    "permission-denied",
    "unsupported",
    "network-error",
    "timeout",
  ]);

  function normalizeText(value) {
    return String(value == null ? "" : value)
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function tokenizeEnglish(value) {
    const text = normalizeText(value);
    const matches = text.match(/[a-z]+(?:'[a-z]+)?/g);
    return matches ? matches : [];
  }

  function lcsMatches(reference, heard) {
    const ref = Array.isArray(reference) ? reference : [];
    const got = Array.isArray(heard) ? heard : [];
    const table = Array.from({ length: ref.length + 1 }, () => Array(got.length + 1).fill(0));
    for (let i = 1; i <= ref.length; i += 1) {
      for (let j = 1; j <= got.length; j += 1) {
        table[i][j] = ref[i - 1] === got[j - 1]
          ? table[i - 1][j - 1] + 1
          : Math.max(table[i - 1][j], table[i][j - 1]);
      }
    }
    const indexes = [];
    let i = ref.length;
    let j = got.length;
    while (i > 0 && j > 0) {
      if (ref[i - 1] === got[j - 1]) {
        indexes.unshift(i - 1);
        i -= 1;
        j -= 1;
      } else if (table[i - 1][j] >= table[i][j - 1]) {
        i -= 1;
      } else {
        j -= 1;
      }
    }
    return indexes;
  }

  function resultShape(value) {
    return {
      kind: value.kind,
      accepted: Boolean(value.accepted),
      transcript: String(value.transcript || ""),
      referenceText: String(value.referenceText || ""),
      coverage: Number.isFinite(value.coverage) ? value.coverage : 0,
      missing: Array.isArray(value.missing) ? value.missing.slice() : [],
      provider: value.provider || "asr",
      scores: value.scores || null,
      mode: value.mode || "read_word",
    };
  }

  function matchReference(referenceText, transcript, options) {
    const reference = tokenizeEnglish(referenceText);
    const heard = tokenizeEnglish(transcript);
    const opts = options || {};
    const base = {
      referenceText: normalizeText(referenceText),
      transcript: normalizeText(transcript),
      provider: opts.provider || "asr",
      mode: opts.mode || (reference.length > 1 ? "read_sentence" : "read_word"),
      scores: null,
    };
    if (!reference.length) return resultShape({ ...base, kind: "unsupported" });
    if (!heard.length) return resultShape({ ...base, kind: "no-speech" });

    const matchedIndexes = lcsMatches(reference, heard);
    const matched = new Set(matchedIndexes);
    const coverage = matchedIndexes.length / reference.length;
    const missing = reference.filter((_, index) => !matched.has(index));
    const accepted = coverage === 1;
    return resultShape({
      ...base,
      kind: accepted ? "match" : (coverage > 0 ? "partial" : "mismatch"),
      accepted,
      coverage,
      missing,
    });
  }

  function normalizeErrorKind(error) {
    const value = String(error && (error.error || error.kind || error.message) || error || "").toLowerCase();
    if (/not-allowed|permission|denied/.test(value)) return "permission-denied";
    if (/network|service-not-allowed/.test(value)) return "network-error";
    if (/timeout/.test(value)) return "timeout";
    if (/no-speech|no speech|empty/.test(value)) return "no-speech";
    if (/unsupported|not available|not implemented/.test(value)) return "unsupported";
    return "mismatch";
  }

  function errorResult(error, options) {
    const opts = options || {};
    return resultShape({
      kind: KINDS.includes(error) ? error : normalizeErrorKind(error),
      accepted: false,
      transcript: "",
      referenceText: normalizeText(opts.referenceText),
      provider: opts.provider || "none",
      mode: opts.mode || "read_word",
      scores: null,
    });
  }

  function normalizeResult(payload, options) {
    const opts = options || {};
    if (payload && payload.kind && KINDS.includes(payload.kind)) {
      return resultShape({
        ...payload,
        referenceText: opts.referenceText || payload.referenceText,
        mode: opts.mode || payload.mode,
        provider: opts.provider || payload.provider,
        scores: null,
      });
    }
    const value = payload && typeof payload === "object"
      ? (payload.text ?? payload.transcript ?? "")
      : payload;
    const result = matchReference(opts.referenceText, value, opts);
    // MVP deliberately keeps scores empty. A future pronunciation adapter may
    // fill this field after validating a provider-specific result contract.
    return resultShape({ ...result, provider: opts.provider || "asr", scores: null });
  }

  function feedbackFor(result) {
    const current = result || {};
    if (current.kind === "match") {
      return { message: "听到了目标词，跟读成功！", tone: "success", showScore: false };
    }
    if (current.kind === "partial") {
      return {
        message: `听到了${Math.round((current.coverage || 0) * 100)}%，再说完整一点`,
        tone: "retry",
        showScore: false,
      };
    }
    if (current.kind === "no-speech") return { message: "没有听到声音，再试一次", tone: "retry", showScore: false };
    if (current.kind === "permission-denied") return { message: "麦克风不可用，可以点选完成", tone: "fallback", showScore: false };
    if (current.kind === "unsupported") return { message: "这台设备不支持语音，可以点选完成", tone: "fallback", showScore: false };
    if (current.kind === "network-error") return { message: "语音服务暂时不可用，可以点选完成", tone: "fallback", showScore: false };
    if (current.kind === "timeout") return { message: "等待语音服务超时，再试一次", tone: "retry", showScore: false };
    return { message: "没有匹配，再听一遍示范", tone: "retry", showScore: false };
  }

  return {
    KINDS,
    normalizeText,
    tokenizeEnglish,
    matchReference,
    normalizeErrorKind,
    normalizeResult,
    errorResult,
    feedbackFor,
  };
});
