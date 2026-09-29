"use strict";

/* 精读课堂外壳：参考稿 Reading Path 的五步结构，内容全部内嵌在本页。
   每一步把既有学习页（wala 精学/绘本/单词/知识巩固/配音）装进步骤卡内，
   不再跳出课堂。完成信号复用既有存储（本页只读），wala 完成时通过
   postMessage 通知本页自动点亮下一步。 */

const $ = (id) => document.getElementById(id);

function epFromQuery() {
  const params = new URLSearchParams(location.search);
  return Math.max(1, parseInt(params.get("ep") || "1", 10) || 1);
}

// 五步完成信号统一由 study-state.js 提供（与地图弹层共用，只读既有存储）。
const readStepDone = (ep) => BookPlayStudyState.readStepDone(ep);

function buildSteps(ep) {
  return [
    {
      num: "01", en: "Watch & Read", name: "看故事",
      desc: "看动画，边看边想：故事里有谁？发生了什么？",
      say: "看动画啦！边看边想：故事里有谁？发生了什么？",
      done: null,
    },
    {
      num: "02", en: "Word Friends", name: "学方法",
      desc: "点一点单词朋友：听一听，跟着读。",
      say: "把单词和意思连起来！先点英文，再点中文。",
      done: null,
    },
    {
      num: "03", en: "Practice", name: "练一练",
      desc: "听发音，选一选。",
      say: "小游戏时间！听发音，选出你听到的单词。",
      done: null,
    },
    {
      num: "04", en: "Story Check", name: "理解挑战",
      desc: "答对七成，解锁大地图。",
      say: "理解挑战！答对七成，就能解锁大地图。",
      done: null,
    },
    {
      num: "05", en: "Tell the Story", name: "说出故事",
      desc: "把四幅图排成故事顺序，再照着说一说。",
      say: "最后一步！把四幅图排成故事顺序。",
      done: null,
    },

  ];
}

function renderRail(steps, current) {
  const rail = $("study-rail");
  rail.innerHTML = "";
  steps.forEach((step, i) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "study-rail-item"
      + (step.done ? " is-done" : "")
      + (i === current ? " is-current" : "");
    btn.innerHTML = `<span class="st-num">${step.num}</span>`
      + `<span class="st-name">${step.name}<span class="st-en">${step.en}</span></span>`
      + `<span class="st-lamp" aria-hidden="true"></span>`;
    btn.setAttribute("aria-current", i === current ? "step" : "false");
    btn.addEventListener("click", () => showStep(i));
    li.appendChild(btn);
    rail.appendChild(li);
  });
}

function showStep(i) {
  const state = window.__studyState;
  if (!state) return;
  state.current = i;
  const step = state.steps[i];
  // 大班/低年级：步骤指引开口说（中文），不依赖识字
  if (state.spokenSteps === undefined) state.spokenSteps = new Set();
  const say = state.steps[i].say;
  if (say && !state.spokenSteps.has(i)) {
    state.spokenSteps.add(i);
    speakText(say, "zh-CN");
  }
  // 步骤宿主：五步全部本页原生（元素重组，无整页 iframe）
  const hosts = ["watch-player", "method-player", "practice-player", "check-player", "output-player"];
  hosts.forEach((id, k) => { $(id).hidden = k !== i; });
  if (i === 0) WatchPlayer.ensure(state.ep).then(() => WatchPlayer.autostart()).catch(() => {});
  if (i === 1) MethodEngine.ensure(state.ep);
  if (i === 2) PracticeEngine.ensure(state.ep);
  if (i === 3) CheckEngine.ensure(state.ep);
  if (i === 4) OutputEngine.ensure(state.ep);
  $("study-step-chip").textContent = `STEP ${i + 1} OF ${state.steps.length}`;
  renderRail(state.steps, i);
}

// 大班/低年级：界面文字孩子不识字，指引一律开口说（系统语音，失败静默）
function speakText(text, lang) {
  try {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang || "zh-CN";
    utter.rate = 0.95;
    window.speechSynthesis.speak(utter);
  } catch (_) { /* 无语音环境静默 */ }
}

function renderProgress(flags) {
  const bar = $("study-progress");
  if (!bar) return;
  bar.innerHTML = "";
  flags.forEach((flag) => {
    const seg = document.createElement("i");
    seg.className = "study-progress-seg" + (flag ? " is-done" : "");
    bar.appendChild(seg);
  });
}

function refreshDone({ autoAdvance = false } = {}) {
  const state = window.__studyState;
  if (!state) return;
  const flags = readStepDone(state.ep);
  const prev = state.steps.map((step) => step.done);
  flags.forEach((flag, i) => {
    if (flag && prev[i] === false) StudyFX.stepDone(i);
  });
  state.steps.forEach((step, i) => { step.done = flags[i]; });
  renderProgress(flags);
  if (flags.every(Boolean)) {
    renderRail(state.steps, state.current);
    $("study-step-chip").textContent = "ALL DONE 🎉";
    StudyRewards.ceremony(state.ep);
    return;
  }
  const next = flags.findIndex((flag) => !flag);
  if (autoAdvance && next !== state.current) showStep(next);
  else renderRail(state.steps, state.current);
}

// 每辑背景：collections.json 里该集所属分辑的地图画（参考稿每 Book 一景）。
// 纸面卡片浮在压暗的地图上，解决"整页太亮"。
async function loadCollectionBackground(ep) {
  try {
    const res = await fetch("../data/dialogue_stories/collections.json", { cache: "no-store" });
    const data = await res.json();
    const col = (data.collections || []).find(
      (c) => Number(c.from) <= ep && ep <= Number(c.to) && c.background
    );
    if (!col) return;
    const shell = document.querySelector(".study-shell");
    shell.style.background =
      `linear-gradient(rgba(24, 18, 10, 0.55), rgba(24, 18, 10, 0.62)), ` +
      `url("../${col.background}") center / cover no-repeat fixed`;
    shell.dataset.collection = col.id;
    document.body.classList.add("has-map");
    const kicker = $("study-kicker");
    if (kicker && col.title && col.title.zh) kicker.textContent = col.title.zh + " · 精读课堂";
  } catch (_) { /* 没有背景时保持纸面 */ }
}

async function loadTitle(ep) {
  try {
    const res = await fetch(`../data/dialogue_stories/ep${ep}.json`, { cache: "no-store" });
    if (!res.ok) return;
    const book = await res.json();
    const en = book && book.title && book.title.en ? book.title.en : "";
    const zh = book && book.title && book.title.zh ? book.title.zh : "";
    // 有些数据源的中文标题自带"西游记 第N集"，避免和前缀重复
    const zhSuffix = zh && !/第\s*\d+\s*集/.test(zh) ? " · " + zh : "";
    $("study-title").textContent = `第 ${ep} 集 ${en}${zhSuffix}`;
    document.title = `豆豆龙英语 · 精读课堂 · 第 ${ep} 集`;
  } catch (_) {
    $("study-title").textContent = `第 ${ep} 集`;
  }
}

/* ================= 01 看故事：原生精读播放器 =================
   元素重组：视频（纯净大画面）+ 句级字幕词块 + 中文 + 词卡 + 上一句/下一句。
   数据全部来自既有文件：dialogue_stories/epN.json（节点与句级时间轴）、
   assets/adv_audio/epN/index.json（单词音频）。本步完成后写入
   bookplay_study_shell（唯一的课堂自写信号）。 */
const WatchPlayer = (function () {
  let ready = null;
  let nodes = [];
  let wordAudio = {};
  let idx = 0;
  let video = null;

  function normalize(word) {
    return String(word || "").toLowerCase().replace(/[^a-z']/g, "");
  }

  function audioFor(word) {
    const key = normalize(word);
    return wordAudio[key] || wordAudio[key.replace(/'/g, "")] || null;
  }

  function renderSentence() {
    const n = nodes[idx];
    $("watch-counter").textContent = `第 ${idx + 1} / ${nodes.length} 页`;
    const wrap = video && video.closest(".watch-video-wrap");
    if (wrap && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      wrap.classList.remove("is-turning");
      void wrap.offsetWidth;
      wrap.classList.add("is-turning");
    }
    const en = $("watch-en");
    en.innerHTML = "";
    const words = String(n.text_en).trim().split(/\s+/);
    words.forEach((word) => {
      const src = audioFor(word);
      const el = document.createElement(src ? "button" : "span");
      if (src) el.type = "button";
      el.className = "watch-word";
      el.textContent = word;
      if (src) {
        el.title = "听这个词";
        el.addEventListener("click", () => {
          new Audio(`../${src}`).play().catch(() => {});
        });
      }
      en.appendChild(el);
      en.appendChild(document.createTextNode(" "));
    });
    $("watch-zh").textContent = n.text_zh || "";
    renderVocab(n);
    updateHighlight();
  }

  function renderVocab(n) {
    const box = $("watch-words");
    box.innerHTML = "";
    (n.vocab || []).forEach((item) => {
      if (!item || !item.term) return;
      const card = document.createElement("button");
      card.type = "button";
      card.className = "watch-vocab-card";
      card.innerHTML = `<b>${item.term}</b><span>${item.zh || ""}</span>`;
      const src = audioFor(item.term);
      card.addEventListener("click", () => {
        if (src) new Audio(`../${src}`).play().catch(() => {});
      });
      box.appendChild(card);
    });
  }

  function updateHighlight() {
    const n = nodes[idx];
    if (!n) return;
    const words = $("watch-en").querySelectorAll(".watch-word");
    const t = video ? video.currentTime : 0;
    const dur = Math.max(0.4, Number(n.audio_end) - Number(n.audio_start));
    const active = Math.min(words.length - 1,
      Math.max(0, Math.floor(((t - Number(n.audio_start)) / dur) * words.length)));
    words.forEach((el, i) => el.classList.toggle("is-on", playing && i === active));
  }

  let playing = false;
  function playSentence() {
    const n = nodes[idx];
    playing = true;
    video.currentTime = Number(n.audio_start);
    video.play().catch(() => {});
    updateHighlight();
  }

  function goto(i, autoplay) {
    idx = Math.max(0, Math.min(nodes.length - 1, i));
    renderSentence();
    if (autoplay) playSentence();
    else { playing = false; updateHighlight(); }
    if (idx === nodes.length - 1 && !autoplay) { markWatchDone(); refreshDone({ autoAdvance: true }); }
  }

  function markWatchDone() {
    try {
      const state = window.__studyState;
      const map = JSON.parse(localStorage.getItem("bookplay_study_shell") || "{}");
      const rec = map[state.ep] && typeof map[state.ep] === "object" ? map[state.ep] : {};
      rec.watch = true;
      rec.updatedAt = new Date().toISOString();
      map[state.ep] = rec;
      localStorage.setItem("bookplay_study_shell", JSON.stringify(map));
      refreshDone({ autoAdvance: true });
    } catch (_) { /* 隐私模式忽略 */ }
  }

  function ensure(ep) {
    if (ready) return ready;
    ready = (async () => {
      video = $("watch-video");
      const res = await fetch(`../data/dialogue_stories/ep${ep}.json`, { cache: "no-store" });
      const book = await res.json();
      nodes = (book.nodes || []).filter((n) => n
        && n.type === "narration" && n.text_en
        && Number.isFinite(Number(n.audio_start)) && Number.isFinite(Number(n.audio_end)));
      try {
        const r = await fetch(`../assets/adv_audio/ep${ep}/index.json`, { cache: "no-store" });
        wordAudio = r.ok ? await r.json() : {};
      } catch (_) { wordAudio = {}; }
      video.addEventListener("timeupdate", () => {
        const n = nodes[idx];
        if (!n) return;
        if (video.currentTime >= Number(n.audio_end)) {
          video.pause();
          if (playing) {
            if (idx === nodes.length - 1) {
              playing = false;
              updateHighlight();
              markWatchDone();
              refreshDone({ autoAdvance: true }); // 全集看完 -> 自动进入 02 学方法
            } else {
              goto(idx + 1, true); // 连播下一句
            }
          }
        }
        updateHighlight();
      });
      $("watch-prev").addEventListener("click", () => goto(idx - 1, false));
      $("watch-next").addEventListener("click", () => goto(idx + 1, true));
      const big = $("watch-bigplay");
      if (big) big.addEventListener("click", () => { big.hidden = true; playSentence(); });
      $("watch-play").addEventListener("click", () => {
        if (video.paused) { playing = true; video.play().catch(() => {}); $("watch-play").textContent = "⏸"; }
        else { video.pause(); playing = false; $("watch-play").textContent = "▶ 续播"; }
      });
      renderSentence();
    })();
    return ready;
  }

  function autostart() {
    playing = true;
    const n = nodes[idx];
    video.currentTime = Number(n.audio_start);
    video.play().then(() => {
      const big = $("watch-bigplay");
      if (big) big.hidden = true;
    }).catch(() => {
      const big = $("watch-bigplay");
      if (big) big.hidden = false; // 浏览器拦自动播放：点大键开始
    });
  }

  return { ensure, autostart };
})();

/* ================= 02 学方法：方法卡 + 单词朋友 =================
   参考 img_4（方法卡/三问）+ img_10（单词卡：词/音标/释义/发音/例句）。
   数据：节点 learn 词卡（term/ipa/pos/def/zh/短语）+ 句型 patterns +
   assets/adv_audio/epN/index.json 单词发音。读完所有词卡点亮本步。 */
const MethodEngine = (function () {
  let ready = null;
  let selectedEn = null; // 当前选中的英文卡（DOM 引用 + 词）

  function normalize(word) {
    return String(word || "").toLowerCase().replace(/[^a-z']/g, "");
  }

  function build(book, wordAudio, ep) {
    const nodes = (book.nodes || []).filter((n) => n && n.type === "narration");
    const cards = [];
    const seenTerm = new Set();
    const seenZh = new Set();
    nodes.forEach((n) => (n.vocab || []).forEach((v) => {
      const key = normalize(v.term);
      const zhKey = String(v.zh || "").replace(/\s+/g, "").toLowerCase();
      // 配对题要求释义互不相同，否则两张中文卡都对
      if (v.term && v.mode === "learn" && v.zh && !seenTerm.has(key) && !seenZh.has(zhKey) && cards.length < 5) {
        seenTerm.add(key);
        seenZh.add(zhKey);
        cards.push({
          term: v.term, ipa: v.ipa || "", zh: v.zh || "",
          audio: wordAudio[normalize(v.term)] || null, matched: false,
        });
      }
    }));
    const patterns = (book.patterns || []).slice(0, 2);
    return { cards, patterns, ep };
  }

  function render(state) {
    const data = state.methodData;
    const enCol = $("match-col-en");
    const zhCol = $("match-col-zh");
    enCol.innerHTML = "";
    zhCol.innerHTML = "";
    const zhOrder = shuffle(data.cards.map((c, i) => i));
    data.cards.forEach((card, i) => {
      const en = document.createElement("button");
      en.type = "button";
      en.className = "match-card match-en-card" + (card.matched ? " is-matched" : "");
      en.dataset.pair = String(i);
      en.innerHTML = `<b class="mc-term">${card.term}</b>` +
        `<button type="button" class="mc-play" data-i="${i}" ${card.audio ? "" : "disabled"}>🔊</button>`;
      en.addEventListener("click", (ev) => {
        if (card.matched || ev.target.closest(".mc-play")) return;
        if (card.audio) new Audio(`../${card.audio}`).play().catch(() => {});
        selectEn(en, card);
      });
      enCol.appendChild(en);
    });
    zhOrder.forEach((i) => {
      const card = data.cards[i];
      const zh = document.createElement("button");
      zh.type = "button";
      zh.className = "match-card match-zh-card" + (card.matched ? " is-matched" : "");
      zh.dataset.pair = String(i);
      zh.innerHTML = `<span class="mc-zh">${card.zh}</span>`;
      zh.addEventListener("click", () => {
        if (card.matched) return;
        if (!selectedEn) {
          StudyFX.hint("先点一个英文单词");
          return;
        }
        const enCard = selectedEn.el;
        const enPair = Number(enCard.dataset.pair);
        if (enPair === i) {
          // 配对成功：连线 + 绿色点亮 + 音效
          card.matched = true;
          data.cards[enPair].matched = true;
          enCard.classList.add("is-matched");
          zh.classList.add("is-matched");
          drawLine(enCard, zh);
          clearSelected();
          window.BookPlayAudio?.sfx("correct");
          StudyFX.burst(zh);
          const note = $("method-note-text");
          if (note) note.textContent = `「${data.cards[enPair].term}」= ${card.zh} 配对成功！`;
          if (data.cards.every((c) => c.matched)) maybeFinish(state);
        } else {
          window.BookPlayAudio?.sfx("retry");
          zh.classList.add("is-wrong");
          window.setTimeout(() => zh.classList.remove("is-wrong"), 380);
        }
      });
      zhCol.appendChild(zh);
    });
    const patternsBox = $("method-patterns");
    patternsBox.innerHTML = "";
    (data.patterns || []).forEach((pat) => {
      const el = document.createElement("div");
      el.className = "pattern-card";
      el.innerHTML = `<p class="pattern-label">READ TOGETHER · 句型</p>` +
        `<p class="pattern-text" lang="en">${pat.pattern}</p>` +
        `<p class="pattern-zh">${pat.term} · ${pat.zh}</p>`;
      patternsBox.appendChild(el);
    });
    redrawLines();
  }

  function shuffle(list) {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function selectEn(el, card) {
    if (selectedEn && selectedEn.el) selectedEn.el.classList.remove("is-selected");
    selectedEn = { el, card };
    el.classList.add("is-selected");
  }

  function clearSelected() {
    if (selectedEn && selectedEn.el) selectedEn.el.classList.remove("is-selected");
    selectedEn = null;
  }

  function drawLine(enEl, zhEl) {
    const board = $("method-game");
    const svg = $("match-lines");
    if (!board || !svg) return;
    const br = board.getBoundingClientRect();
    const er = enEl.getBoundingClientRect();
    const zr = zhEl.getBoundingClientRect();
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", (er.right - br.left).toFixed(1));
    line.setAttribute("y1", (er.top + er.height / 2 - br.top).toFixed(1));
    line.setAttribute("x2", (zr.left - br.left).toFixed(1));
    line.setAttribute("y2", (zr.top + zr.height / 2 - br.top).toFixed(1));
    svg.appendChild(line);
  }

  function redrawLines() {
    const svg = $("match-lines");
    if (!svg) return;
    svg.innerHTML = "";
    $("match-col-en").querySelectorAll(".match-card.is-matched").forEach((enEl) => {
      const pair = Number(enEl.dataset.pair);
      const zhEl = $("match-col-zh").querySelector(`.match-card[data-pair="${pair}"]`);
      if (zhEl) drawLine(enEl, zhEl);
    });
  }
  window.addEventListener("resize", () => redrawLines());

  function maybeFinish(state) {
    const all = state.methodData.cards.every((c) => c.matched);
    if (!all) return;
    try {
      const map = JSON.parse(localStorage.getItem("bookplay_study_shell") || "{}");
      const rec = map[state.ep] && typeof map[state.ep] === "object" ? map[state.ep] : {};
      rec.method = true;
      rec.updatedAt = new Date().toISOString();
      map[state.ep] = rec;
      localStorage.setItem("bookplay_study_shell", JSON.stringify(map));
    } catch (_) { /* 隐私模式忽略 */ }
    const note = $("method-done-note");
    if (note) note.textContent = "单词朋友全部配对成功！第二步点亮，继续练一练。";
    refreshDone({ autoAdvance: false });
  }

  function ensure(ep) {
    if (ready) return ready;
    ready = (async () => {
      const res = await fetch(`../data/dialogue_stories/ep${ep}.json`, { cache: "no-store" });
      const book = await res.json();
      let wordAudio = {};
      try {
        const r = await fetch(`../assets/adv_audio/ep${ep}/index.json`, { cache: "no-store" });
        wordAudio = r.ok ? await r.json() : {};
      } catch (_) { wordAudio = {}; }
      window.__studyState.methodData = build(book, wordAudio, ep);
      render(window.__studyState);
    })();
    return ready;
  }

  return { ensure };
})();

const OutputEngine = (function () {
  let ready = null;

  function shuffle(list) {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function build(book) {
    const scenes = (book.nodes || []).filter((n) => n
      && n.type === "narration" && n.illustration
      && Number.isFinite(Number(n.audio_start)) && Number.isFinite(Number(n.audio_end)));
    const step = Math.max(1, Math.floor(scenes.length / 4));
    const picked = [scenes[0], scenes[step], scenes[step * 2], scenes[scenes.length - 1]]
      .filter(Boolean).slice(0, 4);
    return { correct: picked, slots: shuffle(picked.map((n, i) => i)) };
  }

  function render(state) {
    const data = state.outputData;
    const board = $("output-board");
    board.innerHTML = "";
    data.slots.forEach((sceneIdx, slot) => {
      const n = data.correct[sceneIdx];
      const el = document.createElement("div");
      el.className = "order-card";
      el.innerHTML =
        `<div class="order-no">${slot + 1}</div>` +
        `<img src="../${n.illustration}" alt="">` +
        `<button type="button" class="order-hint" data-scene="${sceneIdx}">🔊 听提示</button>` +
        `<div class="order-arrows">` +
        `<button type="button" class="order-up" data-slot="${slot}" ${slot === 0 ? "disabled" : ""}>↑</button>` +
        `<button type="button" class="order-down" data-slot="${slot}" ${slot === data.slots.length - 1 ? "disabled" : ""}>↓</button>` +
        `</div>`;
      board.appendChild(el);
    });
    board.querySelectorAll(".order-hint").forEach((btn) => {
      btn.addEventListener("click", () => {
        const n = data.correct[Number(btn.dataset.scene)];
        const player = new Audio(`../${book_audioSrc}`);
        player.currentTime = Math.max(0, Number(n.audio_start) - 0.2);
        player.play().catch(() => {});
        player.addEventListener("timeupdate", () => {
          if (player.currentTime >= Number(n.audio_end)) player.pause();
        });
      });
    });
    board.querySelectorAll(".order-up").forEach((btn) => {
      btn.addEventListener("click", () => moveSlot(Number(btn.dataset.slot), -1));
    });
    board.querySelectorAll(".order-down").forEach((btn) => {
      btn.addEventListener("click", () => moveSlot(Number(btn.dataset.slot), 1));
    });
  }

  let book_audioSrc = null;

  function moveSlot(slot, delta) {
    const data = window.__studyState.outputData;
    if (data.solved) return; // 排对后锁定，读句列表不再失序
    const target = slot + delta;
    if (target < 0 || target >= data.slots.length) return;
    [data.slots[slot], data.slots[target]] = [data.slots[target], data.slots[slot]];
    render(window.__studyState);
  }

  // img_12：排对后逐图亮出句子，连起来读一读（图/句/中文/重听）
  function revealSentences(state) {
    const data = state.outputData;
    const box = $("output-read");
    box.hidden = false;
    const list = $("output-read-list");
    list.innerHTML = "";
    data.slots.forEach((sceneIdx, slot) => {
      const n = data.correct[sceneIdx];
      const el = document.createElement("div");
      el.className = "read-row";
      el.innerHTML =
        `<span class="read-no">${slot + 1}</span>` +
        `<img src="../${n.illustration}" alt="">` +
        `<div class="read-text"><p lang="en">${n.text_en}</p><p lang="zh">${n.text_zh || ""}</p></div>` +
        `<button type="button" class="read-play" data-scene="${sceneIdx}">🔊 重听</button>`;
      list.appendChild(el);
      el.querySelector(".read-play").addEventListener("click", () => {
        const player = new Audio(`../${book_audioSrc}`);
        player.currentTime = Math.max(0, Number(n.audio_start) - 0.2);
        player.play().catch(() => {});
        player.addEventListener("timeupdate", () => {
          if (player.currentTime >= Number(n.audio_end)) player.pause();
        });
      });
    });
  }

  function checkOrder(state) {
    const data = state.outputData;
    const ok = data.slots.every((sceneIdx, slot) => sceneIdx === slot);
    const note = $("output-note");
    if (ok) {
      data.solved = true;
      revealSentences(state);
      try {
        const map = JSON.parse(localStorage.getItem("bookplay_study_shell") || "{}");
        const rec = map[state.ep] && typeof map[state.ep] === "object" ? map[state.ep] : {};
        rec.output = true;
        rec.updatedAt = new Date().toISOString();
        map[state.ep] = rec;
        localStorage.setItem("bookplay_study_shell", JSON.stringify(map));
      } catch (_) { /* 隐私模式忽略 */ }
      note.textContent = "🎉 顺序全对！这一步点亮。想留下自己的声音，去配音页录一遍吧。";
      const dub = $("output-dub");
      if (dub) dub.hidden = false;
      refreshDone({ autoAdvance: false });
    } else {
      const wrong = data.slots.filter((sceneIdx, slot) => sceneIdx !== slot).length;
      note.textContent = `有 ${wrong} 张图的位置不对——听提示再排一次。`;
    }
  }

  function ensure(ep) {
    if (ready) return ready;
    ready = (async () => {
      const res = await fetch(`../data/dialogue_stories/ep${ep}.json`, { cache: "no-store" });
      const book = await res.json();
      book_audioSrc = book.audio || `assets/lf_ep1/audio_ep1.mp3`;
      window.__studyState.outputData = build(book);
      window.__studyState.outputEp = ep;
      const state = window.__studyState;
      render(state);
      $("output-check").addEventListener("click", () => checkOrder(state));
      const dub = $("output-dub");
      if (dub) dub.href = `dub.html?ep=${ep}`;
    })();
    return ready;
  }

  return { ensure };
})();

const PracticeEngine = (function () {
  let ready = null;
  let questions = [];
  let idx = 0;
  let firstAnswer = [];
  let answered = false;
  let wordAudio = {}; // 词卡点击发声要用，必须与 renderQuestion 同作用域

  function shuffle(list) {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function normalize(word) {
    return String(word || "").toLowerCase().replace(/[^a-z']/g, "");
  }

  function build(book, wordAudio) {
    const nodes = (book.nodes || []).filter((n) => n && n.type === "narration" && n.text_en);
    const vocab = [];
    const seen = new Set();
    nodes.forEach((n) => (n.vocab || []).forEach((v) => {
      const key = normalize(v.term);
      if (v.term && v.zh && !seen.has(key)) { seen.add(key); vocab.push(v); }
    }));
    // 归一化比较：数据里的中文可能有全半角/空格变体，先去重再选干扰项
    const normZh = (zh) => String(zh).replace(/\s+/g, "").toLowerCase();
    const pickDistractors = (answer, all, count) => shuffle(
      all.map((v) => v.zh).filter((zh) => normZh(zh) !== normZh(answer))
    );
    const list = [];
    // 大班/低年级接受度：不考中文阅读。题型全部走"耳朵 + 画面 + 单词识别"：
    // ① 听音选词卡（音频 -> 3 张英文词卡，考单词识别）
    // ② 听句选画（句音频 -> 3 张插图，参考稿 img_5）
    // ③ 看词选义（英文词 -> 中文，仅低年级读写阶段，保留 1 题作为进阶）
    const EN_DISTRACTORS = (answerTerm, count) => shuffle(
      vocab.map((v) => v.term).filter((t) => normalize(t) !== normalize(answerTerm))
    ).slice(0, count);
    // 成长型坡度：词卡识别（最像游戏）-> 听音选义 -> 看词选义 -> 听句选画（最难）
    // ① 听音选词卡 ×2：音频 -> 3 张英文词卡（认识简单单词的识别练习）
    shuffle(vocab).slice(0, 2).forEach((v) => {
      const terms = shuffle([v.term, ...EN_DISTRACTORS(v.term, 2)]);
      list.push({
        kind: "audio-word", term: v.term, audio: wordAudio[normalize(v.term)],
        prompt: "听发音，选出你听到的单词", answer: v.term,
        choices: terms,
      });
    });
    // ② 听音选义 ×1：音频 -> 中文释义（孩子认识中文字）
    shuffle(vocab).slice(0, 1).forEach((v) => {
      const uniq = [];
      const used = new Set([normZh(v.zh)]);
      for (const zh of shuffle(pickDistractors(v, vocab, 8))) {
        if (!used.has(normZh(zh))) { used.add(normZh(zh)); uniq.push(zh); }
        if (uniq.length >= 2) break;
      }
      list.push({
        kind: "audio-zh", term: v.term, audio: wordAudio[normalize(v.term)],
        prompt: `听发音，选出「${v.term}」的意思`, answer: v.zh,
        choices: shuffle([v.zh, ...uniq]),
      });
    });
    // ③ 看词选义 ×1：英文词 -> 中文（识词进阶）
    shuffle(vocab).slice(0, 1).forEach((v) => {
      const uniq = [];
      const used = new Set([normZh(v.zh)]);
      for (const zh of shuffle(pickDistractors(v, vocab, 8))) {
        if (!used.has(normZh(zh))) { used.add(normZh(zh)); uniq.push(zh); }
        if (uniq.length >= 2) break;
      }
      list.push({
        kind: "word", term: v.term,
        prompt: `「${v.term}」是什么意思？`, answer: v.zh,
        choices: shuffle([v.zh, ...uniq]),
      });
    });
    // ④ 听句选画 ×2：句音频 -> 3 张插图（听力理解，压轴）
    const scenes = nodes.filter((n) => n.illustration && Number.isFinite(Number(n.audio_start)));
    shuffle(scenes).slice(0, 2).forEach((n) => {
      const others = shuffle(scenes.filter((m) => m !== n)).slice(0, 2);
      list.push({
        kind: "scene", term: "",
        audioSeg: { src: book.audio, start: Number(n.audio_start), end: Number(n.audio_end) },
        prompt: "听这一句，选出对应的画面", answer: n.illustration,
        choices: shuffle([n.illustration, ...others.map((m) => m.illustration)]),
      });
    });
    return list;
  }

  function renderDots() {
    const box = $("practice-dots");
    box.innerHTML = "";
    questions.forEach((q, i) => {
      const dot = document.createElement("i");
      if (i < idx) dot.className = "dot is-done";
      else if (i === idx) dot.className = "dot is-current";
      else dot.className = "dot";
      box.appendChild(dot);
    });
    $("practice-progress-label").textContent = `第 ${Math.min(idx + 1, questions.length)} 项练习 / 共 ${questions.length} 项`;
  }

  function renderQuestion() {
    const q = questions[idx];
    answered = false;
    renderDots();
    $("practice-feedback").textContent = "";
    $("practice-next").hidden = true;
    const audioBar = $("practice-audio-bar");
    if (q.kind === "scene") {
      audioBar.hidden = false;
      $("practice-prompt").textContent = q.prompt;
      const seg = q.audioSeg;
      const player = new Audio(`../${seg.src}`);
      player.currentTime = Math.max(0, seg.start - 0.2);
      player.play().catch(() => {});
      player.addEventListener("timeupdate", () => { if (player.currentTime >= seg.end) player.pause(); });
      $("practice-audio-play").onclick = () => {
        player.currentTime = Math.max(0, seg.start - 0.2);
        player.play().catch(() => {});
      };
      const pics = $("practice-pics");
      pics.hidden = false;
      pics.innerHTML = "";
      q.choices.forEach((src) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "pic-choice";
        btn.innerHTML = `<img src="../${src}" alt=""><span>画面</span>`;
        btn.addEventListener("click", () => answer(btn, src === q.answer));
        pics.appendChild(btn);
      });
      return;
    }
    if (q.kind === "audio-word" || q.kind === "audio-zh") {
      audioBar.hidden = false;
      $("practice-prompt").textContent = q.prompt;
      const src = q.audio ? `../${q.audio}` : null;
      $("practice-audio-play").onclick = () => { if (src) new Audio(src).play().catch(() => {}); };
      if (src) new Audio(src).play().catch(() => {});
      $("practice-pics").hidden = true;
      if (q.kind === "audio-word") {
        // 听音选词：选项是英文词卡，点一下可听该词发音（不提示对错）
        const list = $("practice-choices");
        list.innerHTML = "";
        q.choices.forEach((term) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "choice-row word-tile";
          btn.innerHTML = `<b class="word-tile-en">${term}</b>`;
          btn.addEventListener("click", () => {
            const wa = wordAudio[normalize(term)];
            if (wa) new Audio(`../${wa}`).play().catch(() => {});
            answer(btn, term === q.answer);
          });
          list.appendChild(btn);
        });
        return;
      }
    } else {
      audioBar.hidden = true;
      $("practice-prompt").textContent = q.prompt;
      $("practice-pics").hidden = true;
    }
    const list = $("practice-choices");
    list.innerHTML = "";
    q.choices.forEach((choice) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice-row";
      btn.textContent = choice;
      btn.addEventListener("click", () => answer(btn, choice === q.answer));
      list.appendChild(btn);
    });
  }

  function answer(btn, correct) {
    if (answered) return;
    answered = true;
    firstAnswer[idx] = correct;
    btn.classList.add(correct ? "is-correct" : "is-wrong");
    $("practice-feedback").textContent = correct
      ? "✓ Nice！你抓住线索了。"
      : "再想想——答案已经帮你标出来啦。";
    if (!correct) {
      const q = questions[idx];
      [...$("practice-choices").children].forEach((row) => {
        if (row.textContent.trim() === q.answer) row.classList.add("is-correct");
      });
      [...$("practice-pics").children].forEach((row) => {
        var img = row.querySelector && row.querySelector("img");
        if (img && img.getAttribute("src") === `../${q.answer}`) row.classList.add("is-correct");
      });
    }
    $("practice-next").hidden = false;
    $("practice-next").textContent = idx === questions.length - 1 ? "完成练习 →" : "下一题 →";
  }

  function finish() {
    const state = window.__studyState;
    const correct = firstAnswer.filter(Boolean).length;
    try {
      const map = JSON.parse(localStorage.getItem("bookplay_study_shell") || "{}");
      const rec = map[state.ep] && typeof map[state.ep] === "object" ? map[state.ep] : {};
      rec.practice = true;
      rec.practiceScore = `${correct}/${questions.length}`;
      rec.updatedAt = new Date().toISOString();
      map[state.ep] = rec;
      localStorage.setItem("bookplay_study_shell", JSON.stringify(map));
    } catch (_) { /* 隐私模式忽略 */ }
    $("practice-feedback").textContent = "";
    const summary = $("practice-summary");
    summary.hidden = false;
    summary.textContent = `练习完成！答对 ${correct} / ${questions.length}。第三步点亮，继续理解挑战。`;
    refreshDone({ autoAdvance: true });
  }

  function ensure(ep) {
    if (ready) return ready;
    ready = (async () => {
      const res = await fetch(`../data/dialogue_stories/ep${ep}.json`, { cache: "no-store" });
      const book = await res.json();
      try {
        const r = await fetch(`../assets/adv_audio/ep${ep}/index.json`, { cache: "no-store" });
        wordAudio = r.ok ? await r.json() : {};
      } catch (_) { wordAudio = {}; }
      questions = build(book, wordAudio);
      idx = 0; firstAnswer = [];
      renderQuestion();
      $("practice-next").addEventListener("click", () => {
        if (idx >= questions.length - 1) finish();
        else { idx += 1; renderQuestion(); }
      });
    })();
    return ready;
  }

  return { ensure };
})();

/* ================= 04 理解挑战：原生小测 =================
   题目来自既有 official_quiz（对应参考稿 img_11 Story Check）。
   首答记录、答错可继续；≥70% 按 lesson.js 的同一格式写入大地图解锁。 */
const CheckEngine = (function () {
  let ready = null;
  let questions = [];
  let idx = 0;
  let firstAnswer = [];
  let answered = false;
  const PASS_RATIO = 0.7;

  function renderDots() {
    const box = $("check-dots");
    box.innerHTML = "";
    questions.forEach((q, i) => {
      const dot = document.createElement("i");
      if (i < idx) dot.className = "dot is-done";
      else if (i === idx) dot.className = "dot is-current";
      else dot.className = "dot";
      box.appendChild(dot);
    });
    $("check-progress-label").textContent = `QUESTION ${Math.min(idx + 1, questions.length)} / ${questions.length}`;
  }

  function renderQuestion() {
    const q = questions[idx];
    answered = false;
    renderDots();
    $("check-feedback").textContent = "";
    $("check-next").hidden = true;
    $("check-q-en").textContent = q.q;
    $("check-q-zh").textContent = q.q_zh || "";
    const list = $("check-choices");
    list.innerHTML = "";
    const letters = ["A", "B", "C", "D"];
    q.choices.forEach((choice, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice-row";
      btn.innerHTML = `<i class="choice-letter">${letters[i] || "?"}</i><span>${choice}${q.choices_zh && q.choices_zh[i] ? `<small>${q.choices_zh[i]}</small>` : ""}</span>`;
      btn.addEventListener("click", () => answer(btn, i === Number(q.answer)));
      list.appendChild(btn);
    });
  }

  function answer(btn, correct) {
    if (answered) return;
    answered = true;
    firstAnswer[idx] = correct;
    btn.classList.add(correct ? "is-correct" : "is-wrong");
    $("check-feedback").textContent = correct
      ? "✓ 答对了。记录首次作答，答错也可以继续探索。"
      : "✗ 这一次不对——正确答案已标出，继续探索。";
    if (!correct) {
      const q = questions[idx];
      [...$("check-choices").children].forEach((row, i) => {
        if (i === Number(q.answer)) row.classList.add("is-correct");
      });
    }
    $("check-next").hidden = false;
    $("check-next").textContent = idx === questions.length - 1 ? "看成绩 →" : "下一题 →";
  }

  function finish() {
    const state = window.__studyState;
    const correct = firstAnswer.filter(Boolean).length;
    const ratio = questions.length ? correct / questions.length : 0;
    const passed = ratio >= PASS_RATIO;
    if (passed) {
      try {
        const mapProgress = JSON.parse(localStorage.getItem("bookplay_adv_progress") || "{}");
        const previous = mapProgress[String(state.ep)] && typeof mapProgress[String(state.ep)] === "object"
          ? mapProgress[String(state.ep)] : {};
        mapProgress[String(state.ep)] = {
          ...previous,
          done: true,
          lessonPassed: true,
          lessonScore: ratio,
          lessonPassedAt: new Date().toISOString(),
        };
        localStorage.setItem("bookplay_adv_progress", JSON.stringify(mapProgress));
      } catch (_) { /* 可选增强 */ }
    }
    const summary = $("check-summary");
    summary.hidden = false;
    summary.textContent = passed
      ? `🎉 答对 ${correct} / ${questions.length}，理解挑战通过！大地图已解锁，去降妖记闯一关吧。`
      : `答对 ${correct} / ${questions.length}，差一点点。再听一遍题目，再试一次吧。`;
    $("check-feedback").textContent = "";
    const retry = $("check-retry");
    if (retry) retry.hidden = passed; // 没过才显示重试
    refreshDone({ autoAdvance: Boolean(passed) });
  }

  function reset() {
    idx = 0; firstAnswer = [];
    $("check-summary").hidden = true;
    renderQuestion();
  }

  function ensure(ep) {
    if (ready) return ready;
    ready = (async () => {
      const res = await fetch(`../data/dialogue_stories/ep${ep}.json`, { cache: "no-store" });
      const book = await res.json();
      questions = book.official_quiz || [];
      idx = 0; firstAnswer = [];
      renderQuestion();
      $("check-next").addEventListener("click", () => {
        if (idx >= questions.length - 1) finish();
        else { idx += 1; renderQuestion(); }
      });
      const retry = $("check-retry");
      if (retry) retry.addEventListener("click", () => {
        speakText("没关系，再试一次！", "zh-CN");
        reset();
      });
    })();
    return ready;
  }

  return { ensure, reset };
})();

/* ================= 奖励层：完成演出 + 进度条 + 贴纸仪式 =================
   演出思路借用 game-feedback.js（浮字/星星/音效，prefers-reduced-motion 降级）。
   贴纸发放复用 BookPlayEpisodeReward（与知识巩固同一贴纸册，幂等不重发）。 */
const StudyFX = (function () {
  let particles = 0;

  function reducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function star(x, y) {
    const layer = $("study-fx");
    if (!layer || particles >= 40) return;
    particles += 1;
    const el = document.createElement("span");
    el.className = "study-star";
    el.textContent = "⭐";
    el.style.left = x + "px";
    el.style.top = y + "px";
    el.style.setProperty("--dx", (Math.random() - 0.5) * 150 + "px");
    el.style.setProperty("--dy", -50 - Math.random() * 80 + "px");
    layer.appendChild(el);
    window.setTimeout(() => { particles -= 1; el.remove(); }, 900);
  }

  function floatText(x, y, text) {
    const el = document.createElement("span");
    el.className = "study-float";
    el.textContent = text;
    el.style.left = x + "px";
    el.style.top = y + "px";
    document.body.appendChild(el);
    window.setTimeout(() => el.remove(), 1200);
  }

  function stepDone(stepIndex) {
    const x = window.innerWidth / 2 - 60;
    const y = 120;
    floatText(x, y, `第 ${stepIndex + 1} 步完成 ✓`);
    window.BookPlayAudio?.sfx("correct");
    if (reducedMotion()) return;
    star(x + 20, y + 10);
    star(x + 60, y + 20);
    star(x + 100, y + 10);
  }

  function burst(x, y) {
    if (reducedMotion()) return;
    star(x, y); star(x - 18, y - 6); star(x + 18, y - 6);
  }

  function hint(text) { floatText(window.innerWidth / 2 - 70, 140, text); }

  return { stepDone, burst, hint };
})();

const StudyRewards = (function () {
  let catalogPromise = null;

  function localDay(date = new Date()) {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
  }

  function catalog() {
    if (!catalogPromise) {
      catalogPromise = fetch("../data/rewards/jttw.json", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null);
    }
    return catalogPromise;
  }

  // 全部五步完成：发放本集贴纸（与知识巩固同一贴纸册，幂等），并演出仪式
  async function ceremony(ep) {
    const core = window.BookPlayEpisodeReward;
    try {
      const map = JSON.parse(localStorage.getItem("bookplay_study_shell") || "{}");
      const rec = map[ep] && typeof map[ep] === "object" ? map[ep] : {};
      if (rec.rewardShown) return;
      rec.rewardShown = true;
      rec.updatedAt = new Date().toISOString();
      map[ep] = rec;
      localStorage.setItem("bookplay_study_shell", JSON.stringify(map));
    } catch (_) { /* 隐私模式忽略 */ }
    window.BookPlayAudio?.sfx("reward");
    if (!core) return;
    const rewardCatalog = await catalog();
    if (!rewardCatalog) return;
    let state = {};
    try { state = JSON.parse(localStorage.getItem("bookplay_jttw_episode_rewards_v1") || "{}"); } catch (_) {}
    const result = core.grantEpisodeSticker(core.normalizeState(state), {
      episode: ep, completed: true, catalog: rewardCatalog, date: localDay(),
    });
    try {
      localStorage.setItem("bookplay_jttw_episode_rewards_v1", JSON.stringify(result.state));
    } catch (_) {}
    if (!result.item) return;
    showStickerCard(result.item, result.granted);
  }

  function showStickerCard(item, granted) {
    const overlay = $("study-sticker-overlay");
    if (!overlay || !item) return;
    const art = item.story_image || item.asset || item.cover_asset || "";
    overlay.querySelector(".sticker-art").innerHTML = art
      ? `<img src="../${art}" alt="">`
      : `<span class="sticker-glyph">${item.glyph || "✨"}</span>`;
    overlay.querySelector(".sticker-title").textContent = item.title_zh || "本集贴纸";
    overlay.querySelector(".sticker-origin").textContent = granted
      ? "新贴纸已收进贴纸册！"
      : "这本贴纸已经在册啦。";
    const close = overlay.querySelector(".sticker-close");
    close.onclick = () => { overlay.hidden = true; };
    overlay.hidden = false; // 填充完成后再显示
  }

  return { ceremony };
})();

async function main() {
  const ep = epFromQuery();
  const doneFlags = readStepDone(ep);
  const kickerEn = ["WATCH", "GUIDE", "PRACTICE", "CHECK", "OUTPUT"];
  const steps = buildSteps(ep);
  steps.forEach((step, i) => { step.done = doneFlags[i]; step.kickerEn = kickerEn[i]; });
  const allDone = doneFlags.every(Boolean);
  // 全完成的集重进：落在最后一步（回顾视角），不从头 STEP 1
  const current = allDone ? steps.length - 1 : Math.max(0, doneFlags.findIndex((flag) => !flag));
  window.__studyState = { ep, steps, current };
  const door = $("door-watch");
  door.href = `wala.html?ep=${ep}&pass=story`;
  door.textContent = doneFlags[3] ? "🎬 看动画回看" : "🎬 先去看一遍动画";
  // 用户在其他页学完回到本页时，刷新一次灯
  window.addEventListener("focus", () => refreshDone());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshDone();
  });
  renderProgress(doneFlags);
  document.querySelectorAll(".mission-ico").forEach((btn) => {
    btn.addEventListener("click", () => speakText(btn.dataset.say, "zh-CN"));
  });  const railToggle = $("rail-toggle");
  if (railToggle) railToggle.addEventListener("click", () => {
    const collapsed = document.body.classList.toggle("rail-collapsed");
    railToggle.textContent = collapsed ? "»" : "☰";
    railToggle.setAttribute("aria-expanded", String(!collapsed));
  });
  await loadTitle(ep);
  loadCollectionBackground(ep);
  showStep(current);
  if (allDone) refreshDone({ autoAdvance: false }); // 补 ALL DONE 态；仪式由 rewardShown 幂等
}

main();
