"use strict";

/* 趣配音工坊：逐句录音 + “我的声音看本集”放映厅。
 * URL: dub.html?ep=N[&node=nXXX][&back=player]（西游记）
 *      dub.html?series=minecraft&book=N / dub.html?series=mikey-jj&book=N
 * 录音只存在本机（IndexedDB），元数据索引 bookplay_dub_v1，奖励幂等 bookplay_dub_reward_v1。
 * 听原声回退链：句级音频（MC/MJ）→ 整集音频切片 → 视频原声 → TTS。
 * 无麦克风设备（电视版）只保留放映厅与台词浏览；IndexedDB 缺失时回退内存会话。
 */
(function dubMain() {
  const Core = window.WalaDubCore;
  const store = window.WalaDubStore.create({ indexedDB: window.indexedDB });
  const recorder = window.WalaDubRecorder.create({ env: window });
  const storage = window.WalaStorage.create(localStorage);

  const params = new URLSearchParams(location.search);
  const SERIES_IDS = ["minecraft", "mikey-jj"];
  const series = SERIES_IDS.includes(params.get("series")) ? params.get("series") : "jttw";
  const rawId = series === "jttw" ? params.get("ep") : (params.get("book") || params.get("ep"));
  const id = Math.max(1, parseInt(rawId || "1", 10) || 1);
  const deepNodeId = String(params.get("node") || "").trim();
  const backToPlayer = params.get("back") === "player";
  const BOOK_URLS = {
    jttw: (n) => `../data/dialogue_stories/ep${n}.json`,
    minecraft: (n) => `../data/storybooks-minecraft/book${n}.json`,
    "mikey-jj": (n) => `../data/storybooks-mikey-jj/book${n}.json`,
  };
  const shelfUrl = () => (series === "jttw" ? "shelf.html" : `map.html?series=${series}`);
  const playerUrl = () => (series === "jttw"
    ? `wala.html?ep=${id}`
    : `storybook.html?series=${series}&book=${id}&ui=unified-v3`);

  const $ = (id) => document.getElementById(id);
  const el = {
    back: $("dub-back"), title: $("dub-title"), sp: $("dub-sp"),
    theaterBtn: $("dub-theater-btn"), notice: $("dub-notice"),
    main: $("dub-main"), list: $("dub-scenes"), done: $("dub-done"), total: $("dub-total"),
    video: $("dub-video"), frame: $("dub-frame"),
    speaker: $("dub-speaker"), en: $("dub-en"), zh: $("dub-zh"),
    hear: $("dub-hear"), rec: $("dub-rec"), play: $("dub-play"),
    status: $("dub-status"), withVideoWrap: $("dub-withvideo-wrap"), withVideo: $("dub-withvideo"),
    stars: $("dub-stars"), save: $("dub-save"), deleteBtn: $("dub-delete"),
    theater: $("dub-theater"), tvideo: $("dub-tvideo"), tframe: $("dub-tframe"),
    tspeaker: $("dub-tspeaker"), ten: $("dub-ten"), tzh: $("dub-tzh"),
    tstop: $("dub-tstop"), tprogress: $("dub-tprogress"),
    audio: $("dub-audio"), take: $("dub-take"),
    taudio: $("dub-taudio"), ttake: $("dub-ttake"),
  };

  let book = null;
  let scenes = [];
  let index = -1;
  let hasVideo = false;
  let meta = readJson(Core.DUB_INDEX_KEY);
  let rewarded = readJson(Core.DUB_REWARD_KEY);
  let pendingBlob = null;
  let pendingSec = 0;
  let pendingStars = 0;
  let takeUrl = "";
  let session = null;
  let recTick = 0;
  let recStartAt = 0;
  let recording = false;
  let theaterRunning = false;
  const takeUrls = new Map();

  function readJson(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch (_) {
      return {};
    }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* 存不下就仅本次有效 */ }
  }

  function setStatus(message, tone) {
    el.status.textContent = message;
    el.status.classList.toggle("ok", tone === "ok");
  }

  function setNotice(message) {
    el.notice.textContent = message || "";
    el.notice.classList.toggle("hidden", !message);
  }

  function epKey() { return book ? book.key : ""; }
  function metaFor(nodeId) { return (meta[epKey()] || {})[nodeId] || null; }

  function renderSP() {
    el.sp.textContent = String(storage.getSP());
  }

  function renderHeader() {
    const names = (book && book.title) || {};
    const seriesLabel = series === "jttw" ? `西游记 第 ${id} 集`
      : series === "minecraft" ? `我的世界 第 ${id} 本`
        : `Mikey & JJ 第 ${id} 本`;
    el.title.textContent = `趣配音 · ${names.zh || names.en || seriesLabel}`;
    el.back.setAttribute("href", backToPlayer ? playerUrl() : shelfUrl());
    const coverage = Core.dubCoverage(meta, epKey(), scenes);
    el.done.textContent = String(coverage.done);
    el.total.textContent = String(coverage.total);
  }

  /* ---------- 媒体辅助 ---------- */

  function stopAllMedia() {
    [el.audio, el.take, el.taudio, el.ttake].forEach((media) => {
      try { media.pause(); } catch (_) { /* 未播放则忽略 */ }
    });
    stopVideo(el.video);
    stopVideo(el.tvideo);
  }

  function stopVideo(video) {
    if (!video) return;
    video.ontimeupdate = video.onended = video.onerror = null;
    try { video.pause(); } catch (_) { /* 未播放则忽略 */ }
  }

  function playSliceOn(audio, url, from, to) {
    return new Promise((resolve) => {
      if (!url) return resolve(false);
      let settled = false;
      const done = (ok) => {
        if (settled) return;
        settled = true;
        audio.ontimeupdate = audio.onended = audio.onerror = null;
        audio.removeEventListener("seeked", onSeeked);
        resolve(ok);
      };
      const onSeeked = () => {
        audio.removeEventListener("seeked", onSeeked);
        audio.play().catch(() => done(false));
      };
      const run = () => {
        audio.ontimeupdate = () => {
          if (audio.currentTime >= to - 0.05) { audio.pause(); done(true); }
        };
        audio.onended = () => done(true);
        audio.onerror = () => done(false);
        if (Math.abs(audio.currentTime - from) < 0.2) return audio.play().catch(() => done(false));
        audio.addEventListener("seeked", onSeeked);
        try { audio.currentTime = from; } catch (_) { audio.play().catch(() => done(false)); }
      };
      if (audio.getAttribute("src") !== url) {
        audio.onloadedmetadata = run;
        audio.onerror = () => done(false);
        audio.src = url;
      } else if (audio.readyState >= 1) run();
      else { audio.onloadedmetadata = run; audio.onerror = () => done(false); }
    });
  }

  function playVideoSliceOn(video, url, from, to, options) {
    const opts = options || {};
    return new Promise((resolve) => {
      if (!url) { updateVideoFallback(); return resolve(false); }
      let settled = false;
      const done = (ok) => {
        if (settled) return;
        settled = true;
        video.ontimeupdate = video.onended = video.onerror = null;
        video.removeEventListener("seeked", onSeeked);
        try { video.pause(); } catch (_) { /* 未播放则忽略 */ }
        resolve(ok);
      };
      const onSeeked = () => {
        video.removeEventListener("seeked", onSeeked);
        video.play().catch(() => done(false));
      };
      const run = () => {
        video.volume = opts.volume == null ? 1 : opts.volume;
        video.muted = Boolean(opts.muted);
        video.ontimeupdate = () => {
          if (video.currentTime >= to - 0.05) done(true);
        };
        video.onended = () => done(true);
        if (Math.abs(video.currentTime - from) < 0.35) {
          return video.play().catch(() => done(false));
        }
        video.addEventListener("seeked", onSeeked);
        try { video.currentTime = from; } catch (_) { video.play().catch(() => done(false)); }
      };
      if (video.getAttribute("src") !== url) {
        video.onerror = () => { hasVideo = false; updateVideoFallback(); done(false); };
        video.onloadeddata = () => { hasVideo = true; run(); };
        video.src = url;
      } else if (video.readyState >= 1) run();
      else {
        video.onerror = () => { hasVideo = false; updateVideoFallback(); done(false); };
        video.onloadeddata = () => { hasVideo = true; run(); };
      }
    });
  }

  function playBlobOn(audio, url) {
    return new Promise((resolve) => {
      if (!url) return resolve(false);
      audio.onended = () => { audio.onended = null; resolve(true); };
      audio.onerror = () => { audio.onended = null; resolve(false); };
      audio.src = url;
      audio.play().catch(() => resolve(false));
    });
  }

  function updateVideoFallback() {
    const scene = scenes[index];
    const useFrame = !hasVideo && scene && scene.illustration;
    el.video.classList.toggle("hidden", !hasVideo);
    el.frame.classList.toggle("hidden", !useFrame);
    if (useFrame) el.frame.setAttribute("src", `../${scene.illustration}`);
  }

  /* ---------- 台词本列表 ---------- */

  function renderList() {
    el.list.textContent = "";
    scenes.forEach((scene, i) => {
      const li = document.createElement("li");
      li.className = i === index ? "active" : "";
      li.setAttribute("data-node", scene.nodeId);
      const no = document.createElement("span");
      no.className = "dub-no";
      no.textContent = String(i + 1);
      const line = document.createElement("span");
      line.className = "dub-line";
      line.textContent = scene.textEn;
      li.append(no, line);
      if (metaFor(scene.nodeId)) {
        const mark = document.createElement("span");
        mark.className = "dub-star-mark";
        mark.textContent = "⭐";
        li.append(mark);
      }
      li.addEventListener("click", () => selectScene(i));
      el.list.append(li);
    });
  }

  /* ---------- 选中一句 ---------- */

  function maxSecFor(scene) {
    return Math.min(90, Math.max(6, Math.round(scene.to - scene.from) + 10));
  }

  function refreshTakeUrl(blob) {
    if (takeUrl) { URL.revokeObjectURL(takeUrl); takeUrl = ""; }
    if (blob) takeUrl = URL.createObjectURL(blob);
  }

  async function ensureTakeUrl(key) {
    if (takeUrls.has(key)) return takeUrls.get(key);
    const record = await store.getClip(key);
    if (!record || !record.blob) return "";
    const url = URL.createObjectURL(record.blob);
    takeUrls.set(key, url);
    return url;
  }

  async function selectScene(i) {
    if (i < 0 || i >= scenes.length) return;
    stopAllMedia();
    index = i;
    const scene = scenes[index];
    const saved = metaFor(scene.nodeId);
    pendingBlob = null;
    pendingSec = 0;
    pendingStars = saved ? saved.stars : 0;
    refreshTakeUrl(null);

    el.speaker.textContent = scene.speaker || "旁白";
    el.en.textContent = scene.textEn;
    el.zh.textContent = scene.textZh || "";
    if (scene.illustration) el.video.setAttribute("poster", `../${scene.illustration}`);
    el.save.disabled = true;
    updateVideoFallback();
    renderStars();
    setStatus(saved
      ? `这句配过 ${saved.stars} 星啦，可以重录或去配下一句`
      : "先听一遍原声，再按下录音跟它说！");
    renderList();
    renderHeader();

    if (saved) {
      const url = await ensureTakeUrl(Core.dubKey(epKey(), scene.nodeId));
      el.play.disabled = !url;
      el.deleteBtn.classList.toggle("hidden", !url);
    } else {
      el.play.disabled = true;
      el.deleteBtn.classList.add("hidden");
    }
    if (index < scenes.length - 1) {
      // 深链场景保持选中即可，不自动播放，避免吓到孩子
    }
  }

  /* ---------- 录音 ---------- */

  function updateRecUI() {
    el.rec.classList.toggle("recording", recording);
    el.rec.textContent = recording ? "⏹ 停止录音" : "⏺ 开始录音";
    el.hear.disabled = recording;
    el.play.disabled = recording || !takeUrl;
  }

  async function startRecording() {
    if (recording) return;
    const scene = scenes[index];
    if (!scene) return;
    stopAllMedia();
    session = Core.createDubSession({ maxSec: maxSecFor(scene) });
    const gate = await recorder.start();
    if (!gate.ok) {
      if (gate.reason === "not-allowed") setStatus("麦克风被拒绝了，在设置里允许后再来吧");
      else if (gate.reason === "no-mic") setStatus("没有找到麦克风，插上耳机麦试试");
      else setStatus("这台设备暂时不能录音");
      return;
    }
    const begin = session.start();
    if (!begin.ok) { recorder.cancel(); return; }
    recording = true;
    recStartAt = Date.now();
    updateRecUI();
    setStatus("录音中… 对着画面说这句台词！");
    if (el.withVideo.checked && hasVideo) {
      playVideoSliceOn(el.video, `../${book.video}`, scene.from, scene.to, { volume: 0, muted: true });
    }
    const limit = maxSecFor(scene);
    recTick = setInterval(() => {
      const elapsed = (Date.now() - recStartAt) / 1000;
      el.rec.textContent = `⏹ 停止（${elapsed.toFixed(1)}s）`;
      if (elapsed >= limit) stopRecording();
    }, 100);
  }

  async function stopRecording() {
    if (!recording) return;
    recording = false;
    clearInterval(recTick);
    recTick = 0;
    const elapsed = (Date.now() - recStartAt) / 1000;
    const verdict = session ? session.stop(elapsed) : { ok: false };
    stopVideo(el.video);
    el.rec.textContent = "⏹ 停止录音";
    const take = await recorder.stop();
    updateRecUI();
    if (!verdict.ok) {
      setStatus("这一句太短啦，再来一次，说完再停！");
      return;
    }
    if (!take.ok) {
      setStatus(take.reason === "no-data" ? "没有录到声音，靠近一点再试一次" : "录音失败了，再试一次");
      return;
    }
    pendingBlob = take.blob;
    pendingSec = verdict.sec;
    refreshTakeUrl(pendingBlob);
    el.play.disabled = false;
    el.save.disabled = false;
    setStatus(`录好啦！${verdict.sec.toFixed(1)} 秒，按下“听我的”听听自己的声音吧`, "ok");
  }

  /* ---------- 听原声 / 听我的 / 保存 / 删除 ---------- */

  async function playSentenceAudios(audio, paths) {
    for (const path of paths) {
      if (recording || theaterRunning) return true;
      await playSliceOn(audio, `../${path}`, 0, Number.POSITIVE_INFINITY);
    }
    return paths.length > 0;
  }

  /* 听原声回退链：句级音频（MC/MJ）→ 整集音频切片 → 视频原声 → TTS */
  async function playOriginal(scene, { theater = false } = {}) {
    const audio = theater ? el.taudio : el.audio;
    const video = theater ? el.tvideo : el.video;
    if (scene.sentenceAudios && scene.sentenceAudios.length) {
      return playSentenceAudios(audio, scene.sentenceAudios);
    }
    if (book.audio) {
      if (hasVideo) {
        await Promise.all([
          playSliceOn(audio, `../${book.audio}`, scene.from, scene.to),
          playVideoSliceOn(video, `../${book.video}`, scene.from, scene.to, { volume: 0.3 }),
        ]);
      } else {
        await playSliceOn(audio, `../${book.audio}`, scene.from, scene.to);
      }
      return true;
    }
    if (hasVideo) {
      // 数据包里常没有整集 MP3，视频本身带原声
      await playVideoSliceOn(video, `../${book.video}`, scene.from, scene.to, { volume: 1 });
      return true;
    }
    return false;
  }

  async function hearOriginal() {
    if (recording) return;
    const scene = scenes[index];
    stopAllMedia();
    setStatus("听原声…");
    const played = await playOriginal(scene);
    if (!played) {
      await playBlobOn(el.audio, `/api/tts?voice=en&text=${encodeURIComponent(scene.textEn)}`);
    }
    if (!recording) setStatus("听完啦，按下录音试试！");
  }

  async function playMyTake() {
    if (recording) return;
    const scene = scenes[index];
    const url = takeUrl || await ensureTakeUrl(Core.dubKey(epKey(), scene.nodeId));
    if (!url) { setStatus("还没有录音，先录一句吧"); return; }
    stopAllMedia();
    setStatus("这是你的声音配音～");
    const tasks = [playBlobOn(el.take, url)];
    if (hasVideo) {
      tasks.push(playVideoSliceOn(el.video, `../${book.video}`, scene.from, scene.to, { volume: 0.15 }));
    }
    await Promise.all(tasks);
    if (!recording) setStatus("听到自己的声音了吧？给这颗星评个分，然后保存！", "ok");
  }

  async function saveTake() {
    const scene = scenes[index];
    if (!scene || !pendingBlob) return;
    const saved = metaFor(scene.nodeId);
    const stars = pendingStars || (saved && saved.stars) || 1;
    const key = Core.dubKey(epKey(), scene.nodeId);
    const put = await store.putClip(key, pendingBlob, { stars, durSec: pendingSec });
    if (!put.ok) {
      setStatus(put.reason === "quota"
        ? "设备的存储空间不够啦，删掉几句旧配音再试"
        : "保存失败了，再试一次");
      return;
    }
    const now = Date.now();
    meta = Core.upsertDubMeta(meta, epKey(), scene.nodeId, { stars, durSec: pendingSec }, now);
    writeJson(Core.DUB_INDEX_KEY, meta);
    const reward = Core.firstSaveReward(meta, rewarded, epKey());
    if (reward.sp > 0) {
      rewarded = reward.rewarded;
      writeJson(Core.DUB_REWARD_KEY, rewarded);
      storage.addSP(reward.sp);
      renderSP();
      setStatus(`第一句配音完成，奖励 ${reward.sp} SP！给孩子鼓个掌 🎉`, "ok");
    } else {
      setStatus("已保存 ✓ 换下一句吧！", "ok");
    }
    pendingBlob = null;
    el.save.disabled = true;
    renderList();
    renderHeader();
    if (Core.dubCoverage(meta, epKey(), scenes).complete) {
      setNotice("🎉 本集台词全部配完！点右上角“放映厅”，用自己的声音看一遍吧");
    }
  }

  async function deleteTake() {
    const scene = scenes[index];
    if (!scene) return;
    const key = Core.dubKey(epKey(), scene.nodeId);
    await store.deleteClip(key);
    const next = JSON.parse(JSON.stringify(meta));
    if (next[epKey()]) delete next[epKey()][scene.nodeId];
    meta = next;
    writeJson(Core.DUB_INDEX_KEY, meta);
    if (takeUrls.has(key)) { URL.revokeObjectURL(takeUrls.get(key)); takeUrls.delete(key); }
    refreshTakeUrl(null);
    pendingBlob = null;
    el.play.disabled = true;
    el.save.disabled = true;
    el.deleteBtn.classList.add("hidden");
    setStatus("已删除，可以重新录一句");
    renderList();
    renderHeader();
  }

  /* ---------- 放映厅 ---------- */

  function renderTheaterProgress(i) {
    el.tprogress.textContent = "";
    scenes.forEach((_, j) => {
      const dot = document.createElement("span");
      if (j < i) dot.className = "done";
      if (j === i) dot.className = "now";
      el.tprogress.append(dot);
    });
  }

  function updateTheaterSubtitle(scene) {
    el.tspeaker.textContent = scene.speaker || "旁白";
    el.ten.textContent = scene.textEn;
    el.tzh.textContent = scene.textZh || "";
  }

  async function runTheater() {
    theaterRunning = true;
    el.main.classList.add("hidden");
    el.theaterBtn.classList.add("hidden");
    el.theater.classList.remove("hidden");
    const useVideo = hasVideo;
    el.tvideo.classList.toggle("hidden", !useVideo);
    el.tframe.classList.toggle("hidden", useVideo);
    for (let i = 0; theaterRunning && i < scenes.length; i += 1) {
      const scene = scenes[i];
      renderTheaterProgress(i);
      updateTheaterSubtitle(scene);
      if (!useVideo && scene.illustration) {
        el.tframe.setAttribute("src", `../${scene.illustration}`);
      }
      const key = Core.dubKey(epKey(), scene.nodeId);
      const dubbed = Boolean(metaFor(scene.nodeId));
      const url = dubbed ? await ensureTakeUrl(key) : "";
      if (!theaterRunning) break;
      const tasks = [];
      if (useVideo) {
        tasks.push(playVideoSliceOn(el.tvideo, `../${book.video}`, scene.from, scene.to, {
          volume: dubbed ? 0.15 : 1,
        }));
      } else if (!dubbed) {
        // 没视频的绘本（我的世界 / Mikey & JJ）：未配音页放原声（句音频→整集切片）
        if (scene.sentenceAudios && scene.sentenceAudios.length) {
          tasks.push(playSentenceAudios(el.taudio, scene.sentenceAudios));
        } else if (book.audio) {
          tasks.push(playSliceOn(el.taudio, `../${book.audio}`, scene.from, scene.to));
        }
      }
      if (url) tasks.push(playBlobOn(el.ttake, url));
      await Promise.all(tasks);
    }
    if (theaterRunning) {
      renderTheaterProgress(scenes.length);
      const coverage = Core.dubCoverage(meta, epKey(), scenes);
      el.ten.textContent = coverage.complete ? "🎉 本集配音全部完成，你就是配音演员啦！" : "放映结束，还有台词可以回去继续配哦";
      el.tspeaker.textContent = "";
      el.tzh.textContent = "";
      if (useVideo) stopVideo(el.tvideo);
      try { el.taudio.pause(); el.ttake.pause(); } catch (_) { /* 未播放则忽略 */ }
      await new Promise((resolve) => {
        const tap = () => { el.theater.removeEventListener("click", tap); resolve(); };
        el.theater.addEventListener("click", tap);
      });
    }
    exitTheater();
  }

  function exitTheater() {
    theaterRunning = false;
    stopAllMedia();
    el.theater.classList.add("hidden");
    el.main.classList.remove("hidden");
    el.theaterBtn.classList.remove("hidden");
  }

  /* ---------- 星级 ---------- */

  function renderStars() {
    el.stars.querySelectorAll("button").forEach((button) => {
      button.classList.toggle("lit", Number(button.getAttribute("data-star")) <= pendingStars);
    });
  }

  el.stars.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-star]");
    if (!button) return;
    pendingStars = Number(button.getAttribute("data-star")) || 0;
    renderStars();
    setStatus("星星已点亮，别忘了保存配音哦");
  });

  /* ---------- 启动 ---------- */

  async function init() {
    renderSP();
    el.rec.addEventListener("click", () => (recording ? stopRecording() : startRecording()));
    el.hear.addEventListener("click", hearOriginal);
    el.play.addEventListener("click", playMyTake);
    el.save.addEventListener("click", saveTake);
    el.deleteBtn.addEventListener("click", deleteTake);
    el.theaterBtn.addEventListener("click", runTheater);
    el.tstop.addEventListener("click", exitTheater);

    const caps = recorder.capabilities();
    const micReady = Boolean(caps.mic);
    el.rec.hidden = !micReady;
    el.withVideoWrap.classList.toggle("hidden", !micReady || !bookHasVideo());
    if (!micReady) setNotice("这台设备不支持录音，可以浏览台词或回放已配好的句子");

    try {
      const raw = await fetch(BOOK_URLS[series](id)).then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      });
      book = Core.normalizeDubBook(series, raw);
    } catch (_) {
      setNotice(series === "jttw" ? "没有找到这一集，去选集页看看吧" : "没有找到这本书，去书架看看吧");
      el.back.setAttribute("href", shelfUrl());
      return;
    }
    scenes = book.scenes;
    if (!scenes.length) {
      setNotice("这一集还没有可配音的台词");
      return;
    }
    hasVideo = Boolean(book.video);
    el.withVideoWrap.classList.toggle("hidden", !micReady || !hasVideo);
    if (store.memoryOnly) {
      setNotice("本设备不支持长期保存，这次录的配音关闭页面就没有啦");
    }

    renderHeader();
    const deepIndex = deepNodeId
      ? scenes.findIndex((scene) => scene.nodeId === deepNodeId)
      : -1;
    const firstUndone = scenes.findIndex((scene) => !metaFor(scene.nodeId));
    await selectScene(deepIndex >= 0 ? deepIndex : Math.max(0, firstUndone));

    if (params.get("theater") === "1") runTheater();
  }

  function bookHasVideo() {
    return Boolean(book && book.video);
  }

  init();
})();
