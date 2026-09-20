"use strict";

/* 趣配音录音网关：getUserMedia + MediaRecorder，产出本地 Blob。
 * 与 voice.js 的网关约定同构：能力探测、稳定错误类型、停止后释放全部 MediaStream tracks。
 * 失败不抛异常，一律返回 { ok, reason } 合同。 */
(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WalaDubRecorder = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function dubRecorderFactory() {
  const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

  function chooseMime(Recorder) {
    if (!Recorder || typeof Recorder.isTypeSupported !== "function") return "";
    for (const mime of MIME_CANDIDATES) {
      try {
        if (Recorder.isTypeSupported(mime)) return mime;
      } catch (_) { /* 继续尝试下一个 */ }
    }
    return "";
  }

  function create(options) {
    const opts = options || {};
    const env = opts.env || (typeof window !== "undefined" ? window : globalThis);
    const nowFn = typeof opts.now === "function" ? opts.now : () => Date.now();
    const media = env && env.navigator && env.navigator.mediaDevices;
    const Recorder = env && env.MediaRecorder;
    const mime = chooseMime(Recorder);
    const hasMic = Boolean(media && typeof media.getUserMedia === "function" && Recorder);

    let stream = null;
    let recorder = null;
    let chunks = [];
    let startedAt = 0;
    let active = false;

    function capabilities() {
      return { mic: hasMic, mime };
    }

    function snapshot() {
      return { state: active ? "recording" : "idle", mime };
    }

    function releaseTracks() {
      if (stream && typeof stream.getTracks === "function") {
        stream.getTracks().forEach((track) => {
          try { track.stop(); } catch (_) { /* 已释放则忽略 */ }
        });
      }
      stream = null;
    }

    function teardown() {
      active = false;
      recorder = null;
      chunks = [];
      startedAt = 0;
      releaseTracks();
    }

    function start() {
      if (active) return Promise.resolve({ ok: false, reason: "busy" });
      if (!hasMic) return Promise.resolve({ ok: false, reason: "unsupported" });
      return media.getUserMedia({ audio: true }).then((nextStream) => {
        try {
          chunks = [];
          stream = nextStream;
          recorder = new Recorder(nextStream, mime ? { mimeType: mime } : undefined);
          recorder.ondataavailable = (event) => {
            if (event && event.data) chunks.push(event.data);
          };
          recorder.start();
          startedAt = nowFn();
          active = true;
          return { ok: true, mime };
        } catch (err) {
          teardown();
          return { ok: false, reason: "error", detail: String((err && err.message) || err) };
        }
      }, (err) => {
        const name = String((err && err.name) || "");
        if (/NotAllowed|Permission|SecurityError/i.test(name)) return { ok: false, reason: "not-allowed" };
        if (/NotFound|DevicesNotFound/i.test(name)) return { ok: false, reason: "no-mic" };
        return { ok: false, reason: "no-mic" };
      });
    }

    function stop() {
      if (!active || !recorder) return Promise.resolve({ ok: false, reason: "idle" });
      const elapsedSec = Math.max(0, (nowFn() - startedAt) / 1000);
      const current = recorder;
      const BlobCtor = env.Blob || function Blob(parts, blobOpts) {
        this.parts = parts;
        this.type = (blobOpts && blobOpts.type) || "";
        this.size = parts.reduce((sum, part) => sum + ((part && part.size) || 0), 0);
      };
      return new Promise((resolve) => {
        let settled = false;
        const finish = (payload) => {
          if (settled) return;
          settled = true;
          teardown();
          resolve(payload);
        };
        current.onstop = () => {
          const blob = new BlobCtor(chunks, { type: mime || (chunks[0] && chunks[0].type) || "audio/webm" });
          if (!blob.size) {
            finish({ ok: false, reason: "no-data" });
            return;
          }
          finish({ ok: true, blob, mime: blob.type, sec: elapsedSec });
        };
        current.onerror = () => finish({ ok: false, reason: "error" });
        try {
          current.stop();
        } catch (_) {
          finish({ ok: false, reason: "error" });
        }
      });
    }

    function cancel() {
      if (recorder) {
        try { recorder.stop(); } catch (_) { /* 已停止则忽略 */ }
      }
      teardown();
      return { ok: true };
    }

    return { capabilities, start, stop, cancel, snapshot };
  }

  return { create, MIME_CANDIDATES };
});
