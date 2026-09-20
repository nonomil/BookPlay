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
      desc: "纯净大画面看动画，字幕逐句点亮；看的时候留意下面三个小问题。",
      done: null,
    },
    {
      num: "02", en: "Word Friends", name: "学方法",
      desc: "先认识本集的单词朋友和句型：听一听、读一读，别急着追每个单词。",
      done: null,
    },
    {
      num: "03", en: "Practice", name: "练一练",
      desc: "词卡小游戏：听音选义、看词选义、听句选画。",
      done: null,
    },
    {
      num: "04", en: "Story Check", name: "理解挑战",
      desc: "答对七成，就能解锁这一集的大地图，进入降妖记。",
      done: null,
    },
    {
      num: "05", en: "Tell the Story", name: "说出故事",
      desc: "把四幅图排成故事顺序，再照着画面说出这段冒险。",
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
  $("step-kicker").textContent = `${step.num} / ${step.kickerEn}`;
  $("step-title").textContent = step.name;
  $("step-en").textContent = step.en;
  $("step-desc").textContent = step.desc;
  // 步骤宿主：五步全部本页原生（元素重组，无整页 iframe）
  const hosts = ["watch-player", "method-player", "practice-player", "check-player", "output-player"];
  hosts.forEach((id, k) => { $(id).hidden = k !== i; });
  if (i === 0) WatchPlayer.ensure(state.ep);
  if (i === 1) MethodEngine.ensure(state.ep);
  if (i === 2) PracticeEngine.ensure(state.ep);
  if (i === 3) CheckEngine.ensure(state.ep);
  if (i === 4) OutputEngine.ensure(state.ep);
  $("study-step-chip").textContent = `STEP ${i + 1} OF ${state.steps.length}`;
  renderRail(state.steps, i);
}

function refreshDone({ autoAdvance = false } = {}) {
  const state = window.__studyState;
  if (!state) return;
  const flags = readStepDone(state.ep);
  state.steps.forEach((step, i) => { step.done = flags[i]; });
  if (flags.every(Boolean)) {
    renderRail(state.steps, state.current);
    $("study-step-chip").textContent = "ALL DONE 🎉";
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
    $("watch-counter").textContent = `第 ${idx + 1} / ${nodes.length} 句`;
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
    const t = video.currentTime;
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
    if (idx === nodes.length - 1 && !autoplay) markWatchDone();
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
      sayStepDone();
    } catch (_) { /* 隐私模式忽略 */ }
  }

  function sayStepDone() {
    const note = $("step-note");
    if (note) note.textContent = "第一步完成啦！右侧旅程会点亮，继续下一步。";
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
      video.src = book.video ? `../${book.video}` : `../assets/video/ep${ep}.mp4`;
      video.addEventListener("timeupdate", () => {
        const n = nodes[idx];
        if (!n) return;
        if (video.currentTime >= Number(n.audio_end)) {
          video.pause();
          if (playing) { playing = false; updateHighlight(); }
        }
        updateHighlight();
      });
      $("watch-prev").addEventListener("click", () => goto(idx - 1, false));
      $("watch-next").addEventListener("click", () => goto(idx + 1, true));
      $("watch-play").addEventListener("click", playSentence);
      renderSentence();
    })();
    return ready;
  }

  return { ensure };
})();

/* ================= 02 学方法：方法卡 + 单词朋友 =================
   参考 img_4（方法卡/三问）+ img_10（单词卡：词/音标/释义/发音/例句）。
   数据：节点 learn 词卡（term/ipa/pos/def/zh/短语）+ 句型 patterns +
   assets/adv_audio/epN/index.json 单词发音。读完所有词卡点亮本步。 */
const MethodEngine = (function () {
  let ready = null;

  function normalize(word) {
    return String(word || "").toLowerCase().replace(/[^a-z']/g, "");
  }

  function build(book, wordAudio, ep) {
    const nodes = (book.nodes || []).filter((n) => n && n.type === "narration");
    const cards = [];
    const seen = new Set();
    nodes.forEach((n) => (n.vocab || []).forEach((v) => {
      const key = normalize(v.term);
      if (v.term && v.mode === "learn" && !seen.has(key) && cards.length < 6) {
        seen.add(key);
        cards.push({
          term: v.term, ipa: v.ipa || "", pos: v.pos || "", def: v.def || v.zh || "",
          zh: v.zh || "", phraseEn: v.phrase_en || "", phraseZh: v.phrase_zh || "",
          audio: wordAudio[normalize(v.term)] || null, checked: false,
        });
      }
    }));
    const patterns = (book.patterns || []).slice(0, 2);
    return { cards, patterns, ep };
  }

  function render(state) {
    const data = state.methodData;
    const list = $("method-cards");
    list.innerHTML = "";
    data.cards.forEach((card, i) => {
      const el = document.createElement("div");
      el.className = "word-friend" + (card.checked ? " is-checked" : "");
      el.innerHTML =
        `<div class="wf-head"><b class="wf-term">${card.term}</b>` +
        `<span class="wf-ipa">${card.ipa}</span>` +
        `<button type="button" class="wf-play" data-i="${i}" ${card.audio ? "" : "disabled"}>🔊</button></div>` +
        `<p class="wf-def">${card.pos} ${card.def}</p>` +
        (card.phraseEn ? `<p class="wf-phrase">${card.phraseEn} <span>${card.phraseZh || ""}</span></p>` : "") +
        `<button type="button" class="wf-read" data-i="${i}">${card.checked ? "✓ 读过了" : "我读过了"}</button>`;
      list.appendChild(el);
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
    list.querySelectorAll(".wf-play").forEach((btn) => {
      btn.addEventListener("click", () => {
        const card = data.cards[Number(btn.dataset.i)];
        if (card.audio) new Audio(`../${card.audio}`).play().catch(() => {});
        const note = $("method-note-text");
        if (note) note.textContent = `「${card.term}」 ${card.def}`;
      });
    });
    list.querySelectorAll(".wf-read").forEach((btn) => {
      btn.addEventListener("click", () => {
        const card = data.cards[Number(btn.dataset.i)];
        card.checked = true;
        render(state);
        maybeFinish(state);
      });
    });
  }

  function maybeFinish(state) {
    const all = state.methodData.cards.every((c) => c.checked);
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
    if (note) note.textContent = "单词朋友都读完啦！第二步点亮，继续练一练。";
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

/* ================= 05 说出故事：四图排序 + 复述 =================
   参考 img_7：四幅插图乱序展示，↑↓ 调整顺序，听提示回顾剧情；
   排对后点亮本步，并引导去配音页录下自己的讲述。 */
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
    const target = slot + delta;
    if (target < 0 || target >= data.slots.length) return;
    [data.slots[slot], data.slots[target]] = [data.slots[target], data.slots[slot]];
    render(window.__studyState);
  }

  function checkOrder(state) {
    const data = state.outputData;
    const ok = data.slots.every((sceneIdx, slot) => sceneIdx === slot);
    const note = $("output-note");
    if (ok) {
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
    // 题型一：听音选义（参考稿 img_5/6）
    shuffle(vocab).slice(0, 3).forEach((v) => {
      list.push({
        kind: "audio-word", term: v.term, audio: wordAudio[normalize(v.term)],
        prompt: `听发音，选出「${v.term}」的意思`, answer: v.zh,
        choices: (() => {
          const uniq = [];
          const used = new Set([normZh(v.zh)]);
          for (const zh of shuffle(pickDistractors(v, vocab, 8))) {
            if (!used.has(normZh(zh))) { used.add(normZh(zh)); uniq.push(zh); }
            if (uniq.length >= 2) break;
          }
          return shuffle([v.zh, ...uniq]);
        })(),
      });
    });
    // 题型二：看词选义
    shuffle(vocab).slice(0, 2).forEach((v) => {
      list.push({
        kind: "word", term: v.term,
        prompt: `「${v.term}」是什么意思？`, answer: v.zh,
        choices: (() => {
          const uniq = [];
          const used = new Set([normZh(v.zh)]);
          for (const zh of shuffle(pickDistractors(v, vocab, 8))) {
            if (!used.has(normZh(zh))) { used.add(normZh(zh)); uniq.push(zh); }
            if (uniq.length >= 2) break;
          }
          return shuffle([v.zh, ...uniq]);
        })(),
      });
    });
    // 题型三：听句选画（参考稿 img_5 听问题选图片）
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
    if (q.kind === "audio-word") {
      audioBar.hidden = false;
      $("practice-prompt").textContent = q.prompt;
      const src = q.audio ? `../${q.audio}` : null;
      $("practice-audio-play").onclick = () => { if (src) new Audio(src).play().catch(() => {}); };
      if (src) new Audio(src).play().catch(() => {});
      $("practice-pics").hidden = true;
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
      : `答对 ${correct} / ${questions.length}，差一点点。再试一次也可以继续探索。`;
    $("check-feedback").textContent = "";
    refreshDone({ autoAdvance: false });
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
    })();
    return ready;
  }

  return { ensure, reset };
})();

async function main() {
  const ep = epFromQuery();
  const doneFlags = readStepDone(ep);
  const kickerEn = ["WATCH", "GUIDE", "PRACTICE", "CHECK", "OUTPUT"];
  const steps = buildSteps(ep);
  steps.forEach((step, i) => { step.done = doneFlags[i]; step.kickerEn = kickerEn[i]; });
  const current = Math.max(0, doneFlags.findIndex((flag) => !flag));
  window.__studyState = { ep, steps, current };
  const door = $("door-watch");
  door.href = `wala.html?ep=${ep}&pass=story`;
  door.textContent = doneFlags[3] ? "🎬 看动画回看" : "🎬 先去看一遍动画";
  // 用户在其他页学完回到本页时，刷新一次灯
  window.addEventListener("focus", () => refreshDone());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshDone();
  });
  await loadTitle(ep);
  loadCollectionBackground(ep);
  showStep(current);
}

main();
