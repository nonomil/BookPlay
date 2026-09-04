"use strict";

(function expose(root, factory) {
  const core = root && root.WalaVoiceCore
    ? root.WalaVoiceCore
    : (typeof require === "function" ? require("./voice-core.js") : null);
  const api = factory(core);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WalaVoice = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function voiceFactory(core) {
  if (!core) throw new Error("WalaVoiceCore is required");

  function makeResult(kind, options) {
    return core.errorResult(kind, options || {});
  }

  function speechConstructor(env) {
    return env && (env.SpeechRecognition || env.webkitSpeechRecognition);
  }

  function recorderConstructor(env) {
    return env && env.MediaRecorder;
  }

  function hasRecorder(env) {
    const media = env && env.navigator && env.navigator.mediaDevices;
    return Boolean(media && typeof media.getUserMedia === "function" && recorderConstructor(env));
  }

  function chooseMime(Recorder, env) {
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
    if (Recorder && typeof Recorder.isTypeSupported === "function") {
      const supported = candidates.find((mime) => {
        try { return Recorder.isTypeSupported(mime); } catch (_) { return false; }
      });
      if (supported) return supported;
    }
    return (env && env.AudioContext) ? "audio/webm" : "";
  }

  function create(options) {
    const opts = options || {};
    const env = opts.env || (typeof window !== "undefined" ? window : globalThis);
    const endpoint = String(opts.endpoint || "").trim();
    const fetchImpl = opts.fetch || (env && env.fetch);
    let activeStop = null;

    function capabilities() {
      const Recognition = speechConstructor(env);
      return {
        mic: Boolean(Recognition || hasRecorder(env)),
        asr: Boolean(Recognition || (endpoint && hasRecorder(env))),
        pronunciation: false,
        offline: false,
      };
    }

    function clearActive(stop) {
      if (activeStop === stop) activeStop = null;
    }

    function listenWeb(request) {
      const Recognition = speechConstructor(env);
      if (!Recognition) return Promise.resolve(makeResult("unsupported", request));
      return new Promise((resolve) => {
        const rec = new Recognition();
        let settled = false;
        let timer = null;
        const finish = (result) => {
          if (settled) return;
          settled = true;
          if (timer != null) (env.clearTimeout || clearTimeout)(timer);
          clearActive(stop);
          resolve(result);
        };
        const stop = () => {
          try { rec.stop?.(); } catch (_) { try { rec.abort?.(); } catch (__) {} }
        };
        activeStop = stop;
        rec.lang = request.lang || "en-US";
        rec.interimResults = false;
        rec.continuous = false;
        rec.maxAlternatives = 5;
        rec.onresult = (event) => {
          const row = event && event.results && event.results[0];
          const alternatives = [];
          if (row) {
            for (let i = 0; i < row.length; i += 1) {
              if (row[i] && row[i].transcript) alternatives.push(String(row[i].transcript));
            }
          }
          const values = alternatives.length ? alternatives : [""];
          const results = values.map((text) => core.normalizeResult({ text }, request));
          finish(results.find((item) => item.accepted) || results[0]);
        };
        rec.onerror = (event) => {
          const kind = core.normalizeErrorKind(event && event.error);
          if (endpoint && hasRecorder(env) && (kind === "network-error" || kind === "unsupported")) {
            // Hand the request to the gateway without resolving the Web Speech
            // promise first.  Resolving with null here used to make the
            // fallback result unreachable to callers.
            settled = true;
            if (timer != null) (env.clearTimeout || clearTimeout)(timer);
            clearActive(stop);
            listenGateway(request).then(resolve, () => resolve(makeResult("network-error", { ...request, provider: "gateway-asr" })));
            return;
          }
          finish(makeResult(kind, { ...request, provider: "none" }));
        };
        rec.onend = () => {
          if (!settled) finish(makeResult("no-speech", request));
        };
        const setTimeoutImpl = env.setTimeout || setTimeout;
        timer = setTimeoutImpl(stop, Math.max(1000, Number(request.maxMs) || 4500));
        try { rec.start(); } catch (error) { finish(makeResult(core.normalizeErrorKind(error), request)); }
      });
    }

    function listenGateway(request) {
      const media = env && env.navigator && env.navigator.mediaDevices;
      const Recorder = recorderConstructor(env);
      if (!endpoint || !hasRecorder(env) || typeof fetchImpl !== "function") {
        return Promise.resolve(makeResult("unsupported", request));
      }
      return new Promise((resolve) => {
        let settled = false;
        let recorder = null;
        let stream = null;
        let timer = null;
        const chunks = [];
        const finish = (result) => {
          if (settled) return;
          settled = true;
          if (timer != null) (env.clearTimeout || clearTimeout)(timer);
          if (stream && typeof stream.getTracks === "function") stream.getTracks().forEach((track) => track.stop());
          clearActive(stop);
          resolve(result);
        };
        const stop = () => {
          try { recorder?.stop?.(); } catch (_) { finish(makeResult("timeout", request)); }
        };
        activeStop = stop;
        media.getUserMedia({ audio: true }).then((nextStream) => {
          if (settled) {
            nextStream.getTracks?.().forEach((track) => track.stop());
            return;
          }
          stream = nextStream;
          const mimeType = chooseMime(Recorder, env);
          try {
            recorder = mimeType ? new Recorder(stream, { mimeType }) : new Recorder(stream);
          } catch (_) {
            finish(makeResult("unsupported", request));
            return;
          }
          recorder.ondataavailable = (event) => {
            if (event && event.data && event.data.size !== 0) chunks.push(event.data);
          };
          recorder.onerror = () => finish(makeResult("network-error", request));
          recorder.onstop = async () => {
            if (settled) return;
            const BlobImpl = env.Blob || (typeof Blob !== "undefined" ? Blob : null);
            if (!BlobImpl) {
              finish(makeResult("unsupported", request));
              return;
            }
            try {
              const body = new BlobImpl(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
              const response = await fetchImpl(endpoint, {
                method: "POST",
                headers: {
                  "Content-Type": body.type || "audio/webm",
                  "x-reference-text": core.normalizeText(request.referenceText).slice(0, 120),
                  "x-question-mode": request.mode || "read_word",
                },
                body,
              });
              if (!response || !response.ok) throw new Error("network");
              const payload = await response.json();
              finish(core.normalizeResult(payload, { ...request, provider: payload.provider || "gateway-asr" }));
            } catch (error) {
              finish(makeResult(core.normalizeErrorKind(error), { ...request, provider: "gateway-asr" }));
            }
          };
          try { recorder.start(); } catch (_) { finish(makeResult("unsupported", request)); return; }
          const setTimeoutImpl = env.setTimeout || setTimeout;
          timer = setTimeoutImpl(stop, Math.max(1000, Number(request.maxMs) || 4500));
        }).catch((error) => {
          const kind = /notallowed|permission|denied/i.test(String(error && (error.name || error.message)))
            ? "permission-denied" : "unsupported";
          finish(makeResult(kind, request));
        });
      });
    }

    function listen(request) {
      const input = { ...(request || {}) };
      input.referenceText = core.normalizeText(input.referenceText);
      if (!input.referenceText) return Promise.resolve(makeResult("unsupported", input));
      const Recognition = speechConstructor(env);
      if (Recognition) return listenWeb(input);
      if (endpoint && hasRecorder(env)) return listenGateway(input);
      return Promise.resolve(makeResult("unsupported", input));
    }

    function stop() {
      if (activeStop) activeStop();
    }

    return { capabilities, listen, stop };
  }

  return { create };
});
