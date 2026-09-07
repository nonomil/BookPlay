"use strict";

(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WalaMedia = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function mediaFactory() {
  function normSent(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function lookupClip(map, key) {
    if (!map || !key) return null;
    if (map[key]) return map[key];
    const lower = String(key).toLowerCase();
    if (map[lower]) return map[lower];
    for (const candidate of Object.keys(map)) {
      if (candidate.toLowerCase() === lower) return map[candidate];
    }
    return null;
  }

  function sentClip(map, text) {
    const normalized = normSent(text);
    if (!normalized || !map) return null;
    if (map[normalized]) return map[normalized];
    for (const candidate of Object.keys(map)) {
      if (normSent(candidate) === normalized) return map[candidate];
    }
    return null;
  }

  function ttsUrl(text, lang) {
    const voice = String(lang || "").startsWith("zh") ? "zh" : "en";
    return `/api/tts?voice=${encodeURIComponent(voice)}&text=${encodeURIComponent(normSent(text))}`;
  }

  function videoUrl(book, episode) {
    return "../" + (book && book.video ? book.video : `assets/video/ep${episode}.mp4`);
  }

  function sceneTimes(node) {
    if (node && node.audio_start != null && node.audio_end != null) {
      return { from: node.audio_start, to: node.audio_end };
    }
    return { from: 0, to: 4 };
  }

  function createController(options) {
    const audio = options.audio;
    if (!audio) throw new TypeError("WalaMedia.createController requires an audio element");
    let rate = options.rate || 1;
    let sequenceToken = 0;
    let playGeneration = 0;
    let videoReady = null;

    const getVideo = () => options.getVideo ? options.getVideo() : null;
    const getBook = () => options.getBook ? options.getBook() : null;
    const applyRate = () => {
      const video = getVideo();
      if (video) {
        video.defaultPlaybackRate = rate;
        video.playbackRate = rate;
        try { video.preservesPitch = true; } catch (_) {}
      }
      audio.playbackRate = rate;
    };

    function setRate(value) {
      rate = value;
      applyRate();
    }

    function cancel() {
      sequenceToken++;
      playGeneration++;
      audio.pause();
      const video = getVideo();
      if (video) video.pause();
      if (options.stopKaraoke) options.stopKaraoke();
      if (options.speechSynthesis) options.speechSynthesis.cancel();
    }

    function ensureVideo() {
      const video = getVideo();
      const book = getBook();
      if (!video || !book) return Promise.resolve(false);
      const url = videoUrl(book, options.getEpisode());
      if (video.getAttribute("src") === url && video.readyState >= 1) return Promise.resolve(true);
      if (videoReady && video.getAttribute("src") === url) return videoReady;
      videoReady = new Promise((resolve) => {
        video.onerror = () => resolve(false);
        video.onloadedmetadata = () => resolve(true);
        video.src = url;
        video.load();
      });
      return videoReady;
    }

    function playClip(url) {
      return new Promise((resolve) => {
        audio.src = url;
        applyRate();
        const done = (ok) => {
          audio.onended = audio.onerror = null;
          resolve(ok);
        };
        audio.onended = () => done(true);
        audio.onerror = () => done(false);
        audio.play().catch(() => done(false));
      });
    }

    function playSlice(from, to) {
      return new Promise((resolve) => {
        const book = getBook();
        if (!book || !book.audio) return resolve(false);
        const url = "../" + book.audio;
        let finished = false;
        const done = (ok) => {
          if (finished) return;
          finished = true;
          audio.onended = audio.onerror = audio.ontimeupdate = null;
          resolve(ok);
        };
        const run = () => {
          applyRate();
          audio.ontimeupdate = () => {
            if (audio.currentTime >= to - 0.05) {
              audio.pause();
              done(true);
            }
          };
          audio.onended = () => done(true);
          audio.onerror = () => done(false);
          const play = () => audio.play().catch(() => done(false));
          const onSeeked = () => {
            audio.removeEventListener("seeked", onSeeked);
            play();
          };
          if (Math.abs(audio.currentTime - from) < 0.15) return play();
          audio.addEventListener("seeked", onSeeked);
          try { audio.currentTime = from; } catch (_) { play(); }
        };
        if (audio.getAttribute("src") !== url) {
          audio.src = url;
          audio.onloadedmetadata = run;
        } else if (audio.readyState >= 1) run();
        else audio.onloadedmetadata = run;
      });
    }

    function seekVideo(video, time) {
      return new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          video.removeEventListener("seeked", finish);
          resolve();
        };
        const go = () => {
          try { video.currentTime = time; } catch (_) { finish(); }
        };
        video.addEventListener("seeked", finish);
        if (video.readyState >= 1) go();
        else video.addEventListener("loadeddata", go, { once: true });
        setTimeout(finish, 1400);
      });
    }

    async function unlockSeek(video) {
      if (video.readyState >= 2 && video.currentTime > 0) return;
      try {
        await video.play();
        video.pause();
      } catch (_) {}
    }

    function playVideoSlice(from, to) {
      const generation = ++playGeneration;
      return new Promise(async (resolve) => {
        const video = getVideo();
        if (!video) return resolve(false);
        const loaded = await ensureVideo();
        if (!loaded || generation !== playGeneration) return resolve(false);
        let finished = false;
        const done = (ok) => {
          if (finished) return;
          finished = true;
          video.ontimeupdate = video.onended = video.onerror = null;
          try { video.pause(); } catch (_) {}
          resolve(ok);
        };
        const start = Math.max(0, from || 0);
        const stop = Math.max(start + 0.35, to || start + 3);
        applyRate();
        video.pause();
        await unlockSeek(video);
        if (generation !== playGeneration) return done(false);
        for (let attempt = 0; attempt < 5 && generation === playGeneration; attempt++) {
          await seekVideo(video, start);
          if (Math.abs(video.currentTime - start) <= 0.55) break;
        }
        if (generation !== playGeneration) return done(false);
        video.ontimeupdate = () => {
          if (generation !== playGeneration) return done(false);
          if (options.onVideoTime) options.onVideoTime(video.currentTime, true);
          if (video.currentTime >= stop - 0.05) {
            video.pause();
            if (options.onVideoTime) options.onVideoTime(stop, true);
            done(true);
          }
        };
        video.onended = () => {
          try { video.pause(); } catch (_) {}
          if (options.onVideoTime) options.onVideoTime(stop, true);
          done(true);
        };
        video.onerror = () => done(false);
        if (options.startKaraoke) options.startKaraoke();
        const watch = () => {
          if (finished || generation !== playGeneration) return;
          if (video.currentTime >= stop - 0.05) {
            try { video.pause(); } catch (_) {}
            if (options.onVideoTime) options.onVideoTime(stop, true);
            done(true);
            return;
          }
          options.requestFrame(watch);
        };
        try {
          await video.play();
        } catch (_) {
          return done(false);
        }
        if (generation !== playGeneration) return done(false);
        if (options.startKaraoke) options.startKaraoke();
        options.requestFrame(watch);
      });
    }

    async function playEdge(text, lang, clip) {
      const raw = normSent(text);
      if (clip) {
        const ok = await playClip(clip);
        if (ok) return true;
      }
      if (!raw) return false;
      return playClip(ttsUrl(raw, lang));
    }

    async function playSequence(items) {
      const token = ++sequenceToken;
      if (options.speechSynthesis) options.speechSynthesis.cancel();
      const usesVideo = (items || []).some((item) => item.video);
      if (!usesVideo) {
        playGeneration++;
        const video = getVideo();
        if (video) video.pause();
        if (options.stopKaraoke) options.stopKaraoke();
      } else {
        audio.pause();
      }
      for (const item of items || []) {
        if (token !== sequenceToken) return false;
        if (item.video) {
          const ok = await playVideoSlice(item.video.from, item.video.to);
          const video = getVideo();
          if (!ok && item.tts && !(video && video.getAttribute("src"))) await playEdge(item.tts, item.lang);
        } else if (item.slice) {
          const ok = await playSlice(item.slice.from, item.slice.to);
          if (!ok && item.tts) await playEdge(item.tts, item.lang);
        } else {
          await playEdge(item.tts, item.lang, item.clip);
        }
      }
      return token === sequenceToken;
    }

    return {
      setRate,
      cancel,
      ensureVideo,
      seekVideo,
      unlockSeek,
      playSequence,
      currentSequenceToken: () => sequenceToken,
      nextSequenceToken: () => sequenceToken + 1,
    };
  }

  return { normSent, lookupClip, sentClip, ttsUrl, videoUrl, sceneTimes, createController };
});
