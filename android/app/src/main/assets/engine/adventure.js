"use strict";

/* 对话冒险播放器
 * 朗读模式（全局切换，localStorage 持久）:
 *   EN    = 只读英文（单词优先原音截取片段，回退 TTS）
 *   EN+中 = 英文后接中文（中文释义用 edge-tts 预合成的女声片段，回退 TTS zh-CN）
 */

const PROG = "bookplay_adv_progress";
const VSTAT = "bookplay_adv_vocab_stat";
const MODE_KEY = "bookplay_read_mode";

const $ = (id) => document.getElementById(id);
const el = {
  list: $("adv-list"), reader: $("adv-reader"), grid: $("adv-grid"), status: $("adv-status"),
  title: $("adv-title"), img: $("adv-img"), en: $("adv-en"), zh: $("adv-zh"),
  cards: $("adv-cards"), pager: $("adv-pager"), bar: $("adv-bar"),
  prev: $("adv-prev"), next: $("adv-next"), tts: $("adv-tts"), audioBtn: $("adv-audio"),
  end: $("adv-end"), quiz: $("adv-quiz"), nextEp: $("adv-next-ep"),
  modeEn: $("mode-en"), modeEnZh: $("mode-enzh"),
};

const params = new URLSearchParams(location.search);
const ep = parseInt(params.get("ep") || "", 10);

let book = null;
let idx = 0;
let curText = "";
let readMode = localStorage.getItem(MODE_KEY) === "enzh" ? "enzh" : "en";
let wordAudio = {};   // term -> assets 路径（本集原音截取清单）
let zhAudio = {};     // 中文文本 -> assets 路径（全局释义合成清单）

const seqAudio = new Audio();
let seqToken = 0;

/* ---------- 基础工具 ---------- */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]));

const j = (u) => fetch(u, { cache: "no-store" }).then((r) => {
  if (!r.ok) throw new Error(u + " " + r.status);
  return r.json();
});

function vstat() {
  try { return JSON.parse(localStorage.getItem(VSTAT) || "{}"); } catch (_) { return {}; }
}
function bumpStat(term, right) {
  const s = vstat();
  s[term] = s[term] || { right: 0, wrong: 0 };
  right ? s[term].right++ : s[term].wrong++;
  localStorage.setItem(VSTAT, JSON.stringify(s));
}
function progress() {
  try { return JSON.parse(localStorage.getItem(PROG) || "{}"); } catch (_) { return {}; }
}

function localDay(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function saveProgress(done = false) {
  const p = progress();
  const previous = p[ep] && typeof p[ep] === "object" ? p[ep] : {};
  const reachedEnd = done || previous.done === true;
  const record = { ...previous, node: idx + 1, total: book.nodes.length, done: reachedEnd };
  // 仅翻过至少一页或完成整集才算有效学习；打开页面本身不盖同行日。
  if (done || idx > 0) record.day = localDay();
  p[ep] = record;
  localStorage.setItem(PROG, JSON.stringify(p));
}

/* ---------- 朗读序列引擎 ----------
 * playSeq(items)：items 元素
 *   { clip: url,  tts: text, lang }  优先播片段，失败退 TTS
 *   { tts: text,  lang }             直接 TTS
 *   { slice: { from, to } }          播整集 MP3 的 [from,to] 秒（英文旁白原声）
 */
function stopSeq() {
  seqToken++;
  seqAudio.pause();
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

function playClip(url) {
  return new Promise((res) => {
    seqAudio.src = url;
    const done = (ok) => { seqAudio.onended = seqAudio.onerror = null; res(ok); };
    seqAudio.onended = () => done(true);
    seqAudio.onerror = () => done(false);
    seqAudio.play().catch(() => done(false));
  });
}

function playSlice(from, to) {
  return new Promise((res) => {
    if (!book.audio) return res(false);
    seqAudio.src = "../" + book.audio;
    const done = (ok) => { seqAudio.onended = seqAudio.onerror = seqAudio.ontimeupdate = null; res(ok); };
    seqAudio.ontimeupdate = () => {
      if (seqAudio.currentTime >= to) { seqAudio.pause(); done(true); }
    };
    seqAudio.onended = () => done(true);
    seqAudio.onerror = () => done(false);
    seqAudio.currentTime = from;
    seqAudio.play().catch(() => done(false));
  });
}

function speakWait(text, lang) {
  return new Promise((res) => {
    if (!("speechSynthesis" in window) || !text) return res(false);
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang || "en-US";
    u.rate = (lang || "").startsWith("zh") ? 1.0 : 0.92;
    const want = (lang || "en-US").toLowerCase();
    const v = window.speechSynthesis.getVoices().find((x) => (x.lang || "").toLowerCase().startsWith(want));
    if (v) u.voice = v;
    u.onend = () => res(true);
    u.onerror = () => res(false);
    window.speechSynthesis.speak(u);
  });
}

async function playSeq(items) {
  const token = ++seqToken;
  for (const it of items) {
    if (token !== seqToken) return;
    if (it.slice) {
      const ok = await playSlice(it.slice.from, it.slice.to);
      if (!ok && it.tts) await speakWait(it.tts, it.lang);
    } else if (it.clip) {
      const ok = await playClip(it.clip);
      if (!ok && it.tts) await speakWait(it.tts, it.lang);
    } else {
      await speakWait(it.tts, it.lang);
    }
  }
}

/* ---------- 声音解析 ---------- */
function zhItems(zh) {
  if (!zh) return [];
  return [{ clip: zhAudio[zh] ? "../" + zhAudio[zh] : null, tts: zh, lang: "zh-CN" }];
}
function termItems(term, zh) {
  const items = [{ clip: wordAudio[term] ? "../" + wordAudio[term] : null, tts: term, lang: "en-US" }];
  if (readMode === "enzh") items.push(...zhItems(zh));
  return items;
}
function narrItems() {
  const n = book.nodes[idx];
  const items = [];
  if (n.audio_start != null && book.audio) items.push({ slice: { from: n.audio_start, to: n.audio_end } , tts: n.text_en, lang: "en-US" });
  else items.push({ tts: n.text_en, lang: "en-US" });
  if (readMode === "enzh" && n.text_zh) items.push(...zhItems(n.text_zh));
  return items;
}

/* ---------- 词卡 ---------- */
function renderCard(card) {
  const box = document.createElement("div");
  box.className = `vcard vcard-${card.mode}`;
  const badge = { learn: "新词 · 学习", test: "测一测 · 选含义", review: "复习 · 选单词" }[card.mode];
  box.insertAdjacentHTML("beforeend", `<div class="vcard-head"><span class="vbadge">${badge}</span></div>`);

  if (card.mode === "learn") {
    box.insertAdjacentHTML("beforeend",
      `<div class="vterm"><b>${esc(card.term)}</b> <button class="vspk" title="朗读单词">🔊</button></div>
       <div class="vzh" title="点击听中文">🔊 ${esc(card.zh)}</div>
       <div class="vex">${esc(card.example || "")}</div>`);
    box.querySelector(".vterm b").addEventListener("click", () => playSeq([{ tts: card.term, lang: "en-US" }]));
    box.querySelector(".vspk").addEventListener("click", () => playSeq(termItems(card.term, card.zh)));
    box.querySelector(".vzh").addEventListener("click", () => playSeq(zhItems(card.zh)));
    return box;
  }

  const isTest = card.mode === "test";
  box.insertAdjacentHTML("beforeend",
    `<div class="vterm">${isTest
      ? `<b>${esc(card.term)}</b> <button class="vspk" title="朗读单词">🔊</button> 的意思是？`
      : `哪个单词表示「<b class="vzh-word">${esc(card.zh)}</b>」？`}</div>`);
  if (isTest) box.querySelector(".vspk").addEventListener("click", () => playSeq(termItems(card.term, card.zh)));
  else box.querySelector(".vzh-word").addEventListener("click", () => playSeq(zhItems(card.zh)));

  const opts = document.createElement("div");
  opts.className = "vopts";
  card.options.forEach((opt, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = opt;
    b.addEventListener("click", () => {
      if (box.dataset.done) return;
      const ok = i === card.answer;
      if (ok) {
        box.dataset.done = "1";
        b.classList.add("right");
        bumpStat(card.term, true);
        playSeq([{ tts: card.term, lang: "en-US" }]); // 答对读单词巩固
        setTimeout(() => box.classList.add("vdone"), 350);
      } else {
        b.classList.add("wrong");
        b.disabled = true;
        bumpStat(card.term, false);
      }
    });
    opts.appendChild(b);
  });
  box.appendChild(opts);
  return box;
}

/* ---------- 渲染 ---------- */
function render() {
  const n = book.nodes[idx];
  el.title.textContent = `第 ${ep} 集 · ${book.title.en}`;
  if (n.illustration) {
    el.img.src = "../" + n.illustration;
    el.img.classList.remove("hidden");
  } else el.img.classList.add("hidden");
  curText = n.text_en;
  el.en.textContent = n.text_en;
  el.zh.textContent = n.text_zh || "";
  el.zh.classList.toggle("hidden", !n.text_zh);
  el.pager.textContent = `${idx + 1} / ${book.nodes.length}`;
  el.bar.style.width = `${((idx + 1) / book.nodes.length) * 100}%`;
  el.prev.disabled = idx === 0;
  el.next.textContent = idx === book.nodes.length - 1 ? "完成 ✓" : "下一页";

  el.cards.innerHTML = "";
  (n.vocab || []).forEach((c) => el.cards.appendChild(renderCard(c)));
  saveProgress(false);
}

function next() {
  stopSeq();
  if (idx < book.nodes.length - 1) { idx++; render(); }
  else showEnd();
}

/* ---------- 章末 ---------- */
function showEnd() {
  stopSeq();
  saveProgress(true);
  el.reader.classList.add("hidden");
  el.end.classList.remove("hidden");
  el.quiz.innerHTML = "";
  (book.quiz || []).forEach((q, qi) => {
    const wrap = document.createElement("div");
    wrap.className = "quiz-item";
    wrap.innerHTML = `<p>${qi + 1}. ${esc(q.q)}</p>`;
    q.choices.forEach((c, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = c;
      b.addEventListener("click", () => {
        if (wrap.dataset.done) return;
        wrap.dataset.done = "1";
        const ok = i === q.answer;
        b.style.borderColor = ok ? "#7dcea0" : "#e07474";
        b.style.background = ok ? "rgba(125,206,160,0.15)" : "rgba(224,116,116,0.1)";
        if (!ok) wrap.children[q.answer + 1].style.borderColor = "#7dcea0";
      });
      wrap.appendChild(b);
    });
    el.quiz.appendChild(wrap);
  });
  el.nextEp.href = `adventure.html?ep=${ep + 1}`;
  el.nextEp.textContent = ep >= 108 ? "全集完成 🎉" : `下一集：第 ${ep + 1} 集`;
  if (ep >= 108) el.nextEp.href = "adventure.html";
}

/* ---------- 启动 ---------- */
function applyModeButtons() {
  el.modeEn.classList.toggle("active", readMode === "en");
  el.modeEnZh.classList.toggle("active", readMode === "enzh");
}

async function openEpisode() {
  try {
    book = await j(`../data/dialogue_stories/ep${ep}.json`);
  } catch (e) {
    if (window.BookPlayContentGate) {
      window.BookPlayContentGate.showImportPrompt({ series: "jttw", id: ep });
    } else {
      document.body.textContent = `第 ${ep} 集暂未导入，请选择对应数据包。`;
    }
    return;
  }
  document.title = `豆豆龙英语 · 第${ep}集 ${book.title.en}`;
  [wordAudio, zhAudio] = await Promise.all([
    j(`../assets/adv_audio/ep${ep}/index.json`).catch(() => ({})),
    j("../assets/adv_audio/zh_index.json").catch(() => ({})),
  ]);
  const saved = progress()[ep];
  idx = saved && saved.node ? Math.min(book.nodes.length - 1, saved.node - 1) : 0;
  el.list.classList.add("hidden");
  el.reader.classList.remove("hidden");
  render();

  el.prev.addEventListener("click", () => { if (idx > 0) { stopSeq(); idx--; render(); } });
  el.next.addEventListener("click", next);
  el.tts.addEventListener("click", () => playSeq(narrItems()));       // 朗读（按模式）
  el.audioBtn.addEventListener("click", () => playSeq(narrItems())); // 原声优先，同一条链路
  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); next(); }
    if (e.key === "ArrowLeft" && idx > 0) { stopSeq(); idx--; render(); }
  });
}

async function showList() {
  const [catalog, idxRes] = await Promise.all([
    j("../data/storybooks/catalog.json").catch(() => ({ episodes: [] })),
    j("../data/dialogue_stories/index.json").then((d) => d.episodes).catch(() => []),
  ]);
  const have = new Set(idxRes);
  const prog = progress();
  const items = catalog.episodes.filter((e) => have.has(e.episode));
  el.grid.innerHTML = items.map((e) => {
    const p = prog[e.episode] || {};
    const st = p.done ? "已完成 ✓" : p.node ? `读到 ${p.node}/${p.total} 页` : "未开始";
    return `<a class="card" href="adventure.html?ep=${e.episode}">
      <img src="../${e.cover || ""}" alt="">
      <div class="meta"><div class="ep">第 ${e.episode} 集 · ${e.pages} 页</div>
      <div class="name">${esc(e.title.en)}</div><div class="prog">${st}</div></div></a>`;
  }).join("");
  el.status.textContent = `已生成 ${items.length} 集对话冒险`;
}

/* 模式切换（全局生效） */
function bindModeToggle() {
  const set = (m) => {
    readMode = m;
    localStorage.setItem(MODE_KEY, m);
    stopSeq();
    applyModeButtons();
  };
  el.modeEn.addEventListener("click", () => set("en"));
  el.modeEnZh.addEventListener("click", () => set("enzh"));
  applyModeButtons();
}

bindModeToggle();
if (ep >= 1) openEpisode();
else showList();
