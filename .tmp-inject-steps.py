# -*- coding: utf-8 -*-
"""一次性重构：study.js 五步全原生（02 学方法=单词朋友+方法卡，05 说出故事=四图排序）。"""
import io
import re

p = "study.js"
s = io.open(p, encoding="utf-8").read()

# ---- 1) buildSteps：全部原生，去掉 href/embedSrc/frameLoaded ----
start = s.index("function buildSteps(ep) {")
end = s.index("function renderRail(steps, current)")
new_build = '''function buildSteps(ep) {
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

'''
s = s[:start] + new_build + s[end:]

# ---- 2) showStep：五步全原生宿主 ----
old_host = '''  // 步骤宿主：0 看故事 / 2 练一练 / 3 理解挑战 = 本页原生；1 绘本 / 4 配音 = 内嵌既有页
  const hosts = ["watch-player", null, "practice-player", "check-player", null];
  hosts.forEach((id, k) => { if (id) $(id).hidden = k !== i; });
  const native = Boolean(hosts[i]);
  if (i === 0) WatchPlayer.ensure(state.ep);
  if (i === 2) PracticeEngine.ensure(state.ep);
  if (i === 3) CheckEngine.ensure(state.ep);
  $("step-frame-holder").hidden = native;
  if (!native) ensureFrame(i);
  $("step-pop").href = step.href;'''
new_host = '''  // 步骤宿主：五步全部本页原生（元素重组，无整页 iframe）
  const hosts = ["watch-player", "method-player", "practice-player", "check-player", "output-player"];
  hosts.forEach((id, k) => { $(id).hidden = k !== i; });
  if (i === 0) WatchPlayer.ensure(state.ep);
  if (i === 1) MethodEngine.ensure(state.ep);
  if (i === 2) PracticeEngine.ensure(state.ep);
  if (i === 3) CheckEngine.ensure(state.ep);
  if (i === 4) OutputEngine.ensure(state.ep);'''
assert old_host in s, "showStep host block"
s = s.replace(old_host, new_host)

# ---- 3) 删除 ensureFrame 函数 ----
m = re.search(r"function ensureFrame\(stepIndex\) \{[\s\S]*?\n\}\n\n", s)
assert m, "ensureFrame not found"
s = s.replace(m.group(0), "")

# ---- 4) main() 里去掉 step-pop / study-shell focus 不变 ----
old_pop = '''  const door = $("door-watch");
  door.href = `wala.html?ep=${ep}&pass=story`;
  door.textContent = doneFlags[3] ? "🎬 看动画回看" : "🎬 先去看一遍动画";'''
new_pop = '''  const door = $("door-watch");
  door.href = `wala.html?ep=${ep}&pass=story`;
  door.textContent = doneFlags[3] ? "🎬 看动画回看" : "🎬 先去看一遍动画";'''
assert old_pop in s

# ---- 5) 注入 MethodEngine + OutputEngine（放在 PracticeEngine 注释前）----
anchor = "/* ================= 03 练一练：原生练习 ================="
engines = '''/* ================= 02 学方法：方法卡 + 单词朋友 =================
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

async function main() {'''
assert anchor in s
s = s.replace(anchor, engines, 1)
io.open(p, "w", encoding="utf-8", newline="\n").write(s)
print("study.js rebuilt")
