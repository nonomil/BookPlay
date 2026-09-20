"use strict";

/* 看图复述（P3 OUTPUT）：排一排（四图排序）→ 讲一讲（逐图录音）→ 放映（听自己的故事）。
 * 场景图运行时派生自 dialogue_stories 的 illustration；录音复用 dub-store(IndexedDB) + dub-recorder。
 * 数据只存本机：录音 IndexedDB（retell:<ep>:<idx>），元数据 bookplay_retell_v1，奖励幂等 bookplay_retell_reward_v1。 */
(function retellMain() {
  const Core = window.BookPlayRetellCore;
  const $ = (id) => document.getElementById(id);
  const RETELL_KEY = "bookplay_retell_v1";
  const REWARD_KEY = "bookplay_retell_reward_v1";
  const REWARD_SP = 20;

  const params = new URLSearchParams(location.search);
  const ep = Math.max(1, parseInt(params.get("ep"), 10) || 1);
  const storage = window.WalaStorage ? window.WalaStorage.create(localStorage) : null;
  const store = window.WalaDubStore.create({ indexedDB: window.indexedDB });
  const recorder = window.WalaDubRecorder.create({ env: window });

  let scenes = [];
  let placement = [];
  let current = 0;
  let recording = false;
  let finishLogged = false;
  let entered = false;
  let showing = false;

  const el = {
    title: $("retell-title"), unavailable: $("retell-unavailable"),
    stageOrder: $("stage-order"), pool: $("order-pool"), slots: $("order-slots"),
    orderCheck: $("order-check"), orderFeedback: $("order-feedback"),
    stageTell: $("stage-tell"), tellImg: $("tell-img"), tellEn: $("tell-en"), tellZh: $("tell-zh"),
    tellHint: $("tell-hint"), tellRec: $("tell-rec"), tellDots: $("tell-dots"),
    tellFeedback: $("tell-feedback"), tellPrev: $("tell-prev"), tellFinish: $("tell-finish"),
    stageShow: $("stage-show"), showImg: $("show-img"), showPlay: $("show-play"),
    showDots: $("show-dots"), finish: $("retell-finish"),
  };

  function logStep(event, extra) {
    try {
      if (window.BookPlayStepLog) {
        window.BookPlayStepLog.log(Object.assign({ ep, step: "output", kind: "retell", event }, extra || {}));
      }
    } catch (_) { /* 诊断不挡学习 */ }
  }
  window.addEventListener("pagehide", () => {
    if (entered && !finishLogged) logStep("quit");
  });

  const readMeta = () => {
    try {
      const all = JSON.parse(localStorage.getItem(RETELL_KEY) || "{}");
      return (all && typeof all === "object" ? all[String(ep)] : null) || { takes: {} };
    } catch (_) { return { takes: {} }; }
  };
  const writeMeta = (meta) => {
    try {
      const all = JSON.parse(localStorage.getItem(RETELL_KEY) || "{}");
      all[String(ep)] = meta;
      localStorage.setItem(RETELL_KEY, JSON.stringify(all));
    } catch (_) { /* 存储满则静默 */ }
  };

  const show = (stage) => {
    for (const node of [el.stageOrder, el.stageTell, el.stageShow]) node.classList.add("hidden");
    stage.classList.remove("hidden");
  };

  /* ---------- 第一步：排一排 ---------- */
  function renderOrder() {
    el.pool.innerHTML = "";
    el.slots.innerHTML = "";
    const inPool = [];
    for (let slot = 0; slot < scenes.length; slot += 1) {
      if (placement[slot] == null) inPool.push(slot);
    }
    for (const sceneIdx of inPool) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pic";
      btn.innerHTML = `<img src="/${scenes[sceneIdx].illustration}" alt="故事图 ${sceneIdx + 1}">`;
      btn.addEventListener("click", () => {
        const slot = placement.findIndex((value) => value == null);
        if (slot < 0) return;
        placement[slot] = sceneIdx;
        renderOrder();
      });
      el.pool.appendChild(btn);
    }
    for (let slot = 0; slot < scenes.length; slot += 1) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "slot";
      const filled = placement[slot] != null;
      if (filled) {
        cell.classList.add("filled");
        cell.innerHTML = `<img src="/${scenes[placement[slot]].illustration}" alt="第${slot + 1}幅"><span class="slot-label">第${slot + 1}幅</span>`;
        cell.addEventListener("click", () => {
          placement[slot] = null;
          el.orderFeedback.textContent = "";
          renderOrder();
        });
      } else {
        cell.innerHTML = `<span class="slot-label">第${slot + 1}幅</span>`;
      }
      el.slots.appendChild(cell);
    }
    el.orderCheck.disabled = placement.some((value) => value == null);
    el.orderCheck.style.opacity = el.orderCheck.disabled ? "0.5" : "1";
  }

  function checkPlacement() {
    const wrongSlot = Core.checkOrder(placement);
    if (wrongSlot < 0) {
      [...el.slots.children].forEach((cell) => cell.classList.add("right"));
      el.orderFeedback.textContent = "顺序全对！接下来，把故事讲出来吧 🎉";
      window.BookPlayAudio?.sfx("reward");
      setTimeout(() => enterTell(), 900);
      return;
    }
    const cells = [...el.slots.children];
    placement.forEach((sceneIdx, slot) => {
      if (sceneIdx !== slot) cells[slot].classList.add("wrong");
    });
    el.orderFeedback.textContent = "红色的图放错位置啦，点一下它回去再试试。想一想：最先发生了什么？";
    window.BookPlayAudio?.sfx("retry");
    setTimeout(() => {
      placement.forEach((sceneIdx, slot) => {
        if (sceneIdx !== slot) placement[slot] = null;
      });
      renderOrder();
    }, 1100);
  }

  /* ---------- 第二步：讲一讲 ---------- */
  function enterTell() {
    show(el.stageTell);
    current = 0;
    renderTell();
  }

  function renderDots(host, activeIndex, doneFlags) {
    host.innerHTML = "";
    scenes.forEach((_, index) => {
      const dot = document.createElement("span");
      dot.className = "dot" + (doneFlags[index] ? " done" : index === activeIndex ? " now" : "");
      host.appendChild(dot);
    });
  }

  function renderTell() {
    const meta = readMeta();
    const scene = scenes[current];
    el.tellImg.src = `/${scene.illustration}`;
    el.tellEn.textContent = scene.hintEn;
    el.tellZh.textContent = scene.hintZh;
    el.tellHint.classList.toggle("hidden", !scene.hintAudio);
    el.tellRec.classList.toggle("hidden", !recorder.capabilities().mic);
    el.tellRec.textContent = recording ? "■ 说完点这里" : "🎙 按下开始说";
    el.tellRec.classList.toggle("recording", recording);
    el.tellPrev.classList.toggle("hidden", current <= 0);
    const coverage = Core.retellCoverage(meta, scenes);
    el.tellFinish.classList.toggle("hidden", !coverage.complete);
    el.tellFeedback.textContent = meta.takes[String(current)]
      ? "这张已经录好啦，可以「再说一遍」，也可以讲下一张。"
      : "用自己的话讲这一张，说错也没关系！";
    renderDots(el.tellDots, current, scenes.map((_, index) => Boolean(meta.takes[String(index)])));
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hint-btn";
    btn.textContent = "⏭ 跳过这张";
    btn.addEventListener("click", () => { if (current < scenes.length - 1) { current += 1; renderTell(); } });
    const old = $("tell-skip");
    if (old) old.remove();
    el.tellFeedback.after(btn);
    btn.id = "tell-skip";
  }

  async function toggleRecord() {
    if (!recording) {
      const res = await recorder.start();
      if (!res.ok) {
        el.tellFeedback.textContent = res.reason === "not-allowed"
          ? "麦克风没打开。可以在设置里允许，或先看图说给爸爸妈妈听。"
          : "这台设备暂时不能录音，先看图说一说吧。";
        return;
      }
      recording = true;
      renderTell();
      return;
    }
    const res = await recorder.stop();
    recording = false;
    if (!res.ok || !res.blob) {
      el.tellFeedback.textContent = "这次没录上，再试一次就好。";
      renderTell();
      return;
    }
    const key = `retell:${ep}:${current}`;
    const meta = readMeta();
    await store.putClip(key, res.blob, { ep, scene: current, at: Date.now(), durSec: res.elapsedSec || null });
    meta.takes[String(current)] = { at: Date.now(), durSec: res.elapsedSec || null };
    writeMeta(meta);
    el.tellFeedback.textContent = "录好啦！你的声音真棒 🌟";
    window.BookPlayAudio?.sfx("correct");
    if (current < scenes.length - 1) current += 1;
    renderTell();
  }

  /* ---------- 第三步：放映 ---------- */
  function enterShow() {
    show(el.stageShow);
    current = 0;
    awardOnce();
    if (!finishLogged) { finishLogged = true; logStep("finish", { ok: true }); }
    renderShow();
  }

  function awardOnce() {
    try {
      const rewarded = JSON.parse(localStorage.getItem(REWARD_KEY) || "{}");
      if (!rewarded[String(ep)]) {
        rewarded[String(ep)] = true;
        localStorage.setItem(REWARD_KEY, JSON.stringify(rewarded));
        if (storage) storage.addSP(REWARD_SP);
        el.finish.innerHTML = `<h2>🎉 你把整个故事讲出来啦！</h2><p>奖励 ${REWARD_SP} SP，讲得越来越好了。</p>
          <div class="actions"><a class="primary" href="map.html">回地图</a><button class="ghost" type="button" onclick="location.reload()">再讲一遍</button></div>`;
      } else {
        el.finish.innerHTML = `<h2>🎉 又讲完一遍！</h2>
          <div class="actions"><a class="primary" href="map.html">回地图</a><button class="ghost" type="button" onclick="location.reload()">再讲一遍</button></div>`;
      }
    } catch (_) { /* 奖励失败不影响放映 */ }
  }

  function renderShow() {
    const meta = readMeta();
    el.showImg.src = `/${scenes[current].illustration}`;
    renderDots(el.showDots, current, scenes.map((_, index) => Boolean(meta.takes[String(index)])));
  }

  async function playShow() {
    if (showing) return;
    showing = true;
    el.showPlay.disabled = true;
    for (let index = 0; index < scenes.length; index += 1) {
      current = index;
      renderShow();
      const clip = await store.getClip(`retell:${ep}:${index}`);
      if (!clip || !clip.blob) continue;
      const url = URL.createObjectURL(clip.blob);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => {
        const audio = new Audio(url);
        audio.onended = resolve;
        audio.onerror = resolve;
        audio.play().catch(() => resolve());
      });
      URL.revokeObjectURL(url);
    }
    showing = false;
    el.showPlay.disabled = false;
  }

  /* ---------- 启动 ---------- */
  async function init() {
    let sentEnIndex = {};
    try {
      [scenes, sentEnIndex] = await Promise.all([
        fetch(`../data/dialogue_stories/ep${ep}.json`, { cache: "no-store" }).then((r) => r.json()).then((book) => Core.buildRetellScenes(book.nodes, { limit: Core.MAX_SCENES })),
        fetch("../assets/adv_audio/sent_en_index.json", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
      ]);
    } catch (_) {
      scenes = [];
    }
    if (!Core.retellable(scenes)) {
      el.unavailable.classList.remove("hidden");
      return;
    }
    scenes = scenes.map((scene) => (scene.hintAudio ? { ...scene, hintAudio: `/${scene.hintAudio}` } : scene));
    document.title = `看图复述 · 第 ${ep} 集`;
    el.title.textContent = `看图复述 · 第 ${ep} 集`;
    placement = new Array(scenes.length).fill(null);
    entered = true;
    logStep("enter");
    el.orderCheck.addEventListener("click", checkPlacement);
    el.tellRec.addEventListener("click", toggleRecord);
    el.tellHint.addEventListener("click", () => {
      const scene = scenes[current];
      if (!scene.hintAudio) return;
      const audio = new Audio(scene.hintAudio);
      audio.play().catch(() => { /* 静默 */ });
    });
    el.tellPrev.addEventListener("click", () => { if (current > 0) { current -= 1; recording = false; renderTell(); } });
    el.tellFinish.addEventListener("click", enterShow);
    el.showPlay.addEventListener("click", playShow);
    show(el.stageOrder);
    renderOrder();
  }

  init();
})();
