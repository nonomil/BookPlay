/* ============================================================================
 * 巩固提高单元 (drill.html) —— 单词补全 / 句型排序 / 剧情测验
 * 出题量按 bookplay_learn_level (lite/std/max); 达标写 bookplay_drill[cid].done。
 * 音频复用 sent/quiz/en 索引, 命中加 "../" 前缀,
 * 未命中回落 /api/tts; 使用持久 Audio 元素播放。
 * ========================================================================== */
"use strict";

const DRILL_KEY = "bookplay_drill";          // { c01: { done, words, puzzles, quiz, at } }
const VSTAT     = "bookplay_adv_vocab_stat"; // { term: { seen, right, wrong } }
const SP_KEY    = "bookplay_sp";
const LEVEL_KEY = "bookplay_learn_level";    // "lite" | "std" | "max", 默认 "std"
const RESUME_KEY = "bookplay_drill_resume_v1";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const cid = (params.get("c") || "").trim();
const voiceSttEndpoint = String(params.get("voiceStt") || "").trim();
let voicePort = null;
try {
  voicePort = window.WalaVoice && typeof window.WalaVoice.create === "function"
    ? window.WalaVoice.create({ endpoint: voiceSttEndpoint })
    : null;
} catch (_) {
  voicePort = null;
}

const VALID_CID = /^c(0[1-9]|1[0-3])$/;   // c01..c13

const QUOTA = {
  lite: { words: 8,  puzzles: 4, quizPer: 1 },
  std:  { words: 12, puzzles: 6, quizPer: 3 },
  max:  { words: 16, puzzles: 8, quizPer: 5 },
};
const REVIEW_PAGE_SIZE = 8;
const REVIEW_COUNTDOWN = 4;
const PANEL_NAMES = ["review", "words", "puzzles", "quiz", "wrong", "finish"];

let pack = null;
let quota = QUOTA.std;

/* 题目池与进度 */
let wordsTotal = 0, puzzlesTotal = 0, quizTotal = 0;
let wordsRight = 0, puzzlesRight = 0, quizRight = 0;
let wordsIdx = 0, puzzlesIdx = 0, quizIdx = 0;

/* 单词答题后的自动跳题计时；回顾层打开时暂停，关闭后从剩余时间继续。 */
let wordAdvanceTimer = null;
let wordAdvanceDue = 0;
let wordAdvanceRemaining = 0;

let wordQs = [];    // { id, term, zh, example, blanked, options: [term...], review? }
let puzzleQs = [];  // { id, sentence, words: [...] }
let quizQs = [];    // { id, episode, q, choices, answer, q_zh, choices_zh, review? }
let reviewWords = [];
let reviewTimer = null;
let wrongQs = [];
let wrongIdx = 0;
let voiceOffered = false;
let voicePracticeTerm = "";

/* 剧情测验错题回到对应画面时，缓存每集对白 JSON，避免重复请求。 */
const quizReviewBooks = new Map();

function escHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isTruthyQuery(value) {
  return /^(1|true|on|yes)$/i.test(String(value || "").trim());
}

/* 已答对集合 —— 「再做一次」时已答对的题不再出 */
const doneWords = new Set();   // term
const donePuzzles = new Set(); // sentence
const doneQuiz = new Set();    // id

/* 当前句型排序的交互状态 */
let curTiles = [];   // 剩余待选词
let curAnswer = [];  // 已选词
let curStrike = 0;   // 答错次数 (可重排一次)

/* ---------------- 通用小工具 ---------------- */
const normSent = (s) => String(s || "").replace(/\s+/g, " ").trim();

function vstat() { try { return JSON.parse(localStorage.getItem(VSTAT) || "{}"); } catch { return {}; } }
function readDrill() { try { return JSON.parse(localStorage.getItem(DRILL_KEY) || "{}"); } catch { return {}; } }

function saveQuizResume(question) {
  if (!question) return;
  try {
    sessionStorage.setItem(RESUME_KEY, JSON.stringify({
      cid,
      kind: "quiz",
      quizId: question.id,
      wordsRight,
      puzzlesRight,
      quizRight,
      savedAt: Date.now(),
    }));
  } catch (_) { /* 无 sessionStorage 时仍可正常打开复习页 */ }
}

function takeDrillResume() {
  try {
    const raw = sessionStorage.getItem(RESUME_KEY);
    sessionStorage.removeItem(RESUME_KEY);
    const resume = raw ? JSON.parse(raw) : null;
    return resume && resume.cid === cid ? resume : null;
  } catch (_) {
    return null;
  }
}

function takeQuizResume() {
  return takeDrillResume();
}

function saveWordResume(question) {
  if (!question) return;
  try {
    sessionStorage.setItem(RESUME_KEY, JSON.stringify({
      cid,
      kind: "word",
      wordId: question.id || question.term,
      wordsRight,
      puzzlesRight,
      quizRight,
      savedAt: Date.now(),
    }));
  } catch (_) { /* 无 sessionStorage 时仍可通过 URL 恢复当前题 */ }
}

function bumpStat(term, right) {
  const s = vstat();
  s[term] = s[term] || { seen: 0, right: 0, wrong: 0 };
  if (right) s[term].right++; else s[term].wrong++;
  localStorage.setItem(VSTAT, JSON.stringify(s));
}

function clearWrong(term) {
  const stats = vstat();
  stats[term] = stats[term] || { seen: 0, right: 0, wrong: 0 };
  stats[term].wrong = 0;
  stats[term].right = (stats[term].right || 0) + 1;
  localStorage.setItem(VSTAT, JSON.stringify(stats));
}

function addSP(k) {
  const cur = parseInt(localStorage.getItem(SP_KEY) || "0", 10);
  localStorage.setItem(SP_KEY, String(cur + k));
  renderSP();
}

function renderSP() {
  $("d-sp").textContent = `★ ${parseInt(localStorage.getItem(SP_KEY) || "0", 10)}`;
}

function toast(msg) {
  const t = $("d-toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add("hidden"), 2200);
}

const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [b[i], b[j]] = [b[j], b[i]]; } return b; };

/* ---------------- 音频 (合并索引 + 持久播放器) ---------------- */
let sentEn = {}, sentZh = {}, enIdx = {};
const drillAudio = typeof Audio !== "undefined" ? new Audio() : null;
const mediaApi = typeof WalaMedia !== "undefined" ? WalaMedia : null;

function findClip(text, lang) {
  const t = normSent(text);
  if (!t || !mediaApi) return null;
  const zh = String(lang || "").startsWith("zh");
  const maps = zh ? [sentZh] : [sentEn, enIdx];
  for (const map of maps) {
    const clip = mediaApi.sentClip(map, t) || mediaApi.lookupClip(map, t);
    if (clip) return clip;
  }
  return null;
}

const ttsUrl = (text, lang) => mediaApi
  ? mediaApi.ttsUrl(text, lang || "en-US")
  : `/api/tts?voice=${String(lang || "").startsWith("zh") ? "zh" : "en"}&text=${encodeURIComponent(normSent(text))}`;

async function playText(text, lang) {
  const t = normSent(text);
  if (!t || !drillAudio) return;
  const clip = findClip(t, lang);
  const url = clip ? "../" + clip : ttsUrl(t, lang);
  const playUrl = async (source) => {
    // Reuse the single element and stop any previous prompt before changing
    // its source.  This keeps rapid taps from leaving overlapping audio.
    drillAudio.pause();
    drillAudio.src = source;
    drillAudio.onerror = () => {};
    await drillAudio.play();
  };
  try {
    await playUrl(url);
  } catch {
    // A selective data pack can legitimately omit a clip for an unselected
    // episode.  Fall back to the local TTS gateway instead of staying silent.
    if (!clip) return;
    try { await playUrl(ttsUrl(t, lang)); } catch { /* 失败静默跳过 */ }
  }
}

function voiceMessage(result) {
  const feedback = window.WalaVoiceCore && typeof window.WalaVoiceCore.feedbackFor === "function"
    ? window.WalaVoiceCore.feedbackFor(result)
    : { message: "语音不可用，可以点选完成", tone: "fallback" };
  const heard = result && result.transcript && result.kind !== "match"
    ? `（听到：${result.transcript}）` : "";
  return { ...feedback, message: `${feedback.message}${heard}` };
}

function addVoicePractice(container, term) {
  if (!container || !term) return;
  // The offer is scoped to the first word of this run.  Re-rendering that
  // question after a tab switch restores the card; later words stay quiet.
  if (!voiceOffered) {
    voiceOffered = true;
    voicePracticeTerm = term;
  } else if (voicePracticeTerm !== term) {
    return;
  }
  const capabilities = voicePort && typeof voicePort.capabilities === "function"
    ? voicePort.capabilities() : { asr: false };
  const panel = document.createElement("section");
  panel.className = "voice-practice";
  panel.setAttribute("aria-labelledby", "drill-voice-title");
  panel.innerHTML = `<div class="voice-practice-heading"><div><p class="voice-practice-kicker">Speaking · 跟读小练习</p><h3 id="drill-voice-title">跟着豆豆龙说一遍</h3></div><span class="voice-practice-optional">可选</span></div><p class="voice-practice-reference" lang="en"></p><div class="voice-practice-actions"><button class="voice-demo" type="button">听示范</button><button class="voice-record" type="button" ${capabilities.asr ? "" : "disabled"}>跟读</button><button class="voice-retry" type="button" hidden>再试一次</button><button class="voice-skip" type="button">跳过</button></div><p class="voice-practice-status" role="status" aria-live="polite"></p>`;
  panel.querySelector(".voice-practice-reference").textContent = term;
  panel.querySelector(".voice-practice-status").textContent = capabilities.asr
    ? "可选练习：听示范后，试着说一遍。"
    : "可选练习：当前设备不能录音，仍可直接点选完成。";
  container.appendChild(panel);

  const demo = panel.querySelector(".voice-demo");
  const record = panel.querySelector(".voice-record");
  const retry = panel.querySelector(".voice-retry");
  const skip = panel.querySelector(".voice-skip");
  const status = panel.querySelector(".voice-practice-status");
  const setState = (message, tone = "") => {
    status.textContent = message;
    status.dataset.tone = tone;
    panel.classList.toggle("is-busy", tone === "busy");
  };
  const run = async () => {
    if (!voicePort || typeof voicePort.listen !== "function") {
      setState("这台设备不支持语音，可以点选完成。", "fallback");
      retry.hidden = true;
      return;
    }
    record.disabled = true;
    retry.hidden = true;
    setState("正在听你说…", "busy");
    try {
      const result = await voicePort.listen({ referenceText: term, mode: "read_word", lang: "en-US" });
      const feedback = voiceMessage(result);
      setState(feedback.message, feedback.tone);
      retry.hidden = !["partial", "mismatch", "no-speech", "timeout"].includes(result && result.kind);
    } catch (_) {
      setState("语音暂时不可用，可以点选完成。", "fallback");
      retry.hidden = true;
    } finally {
      record.disabled = false;
    }
  };
  demo.addEventListener("click", () => playText(term));
  record.addEventListener("click", run);
  retry.addEventListener("click", run);
  skip.addEventListener("click", () => {
    setState("已跳过跟读，继续答题即可。", "skipped");
    record.disabled = true;
    retry.hidden = true;
  });
}

function scheduleWordAdvance(delay = 1000) {
  if (wordAdvanceTimer !== null) clearTimeout(wordAdvanceTimer);
  const wait = Math.max(0, Number(delay) || 0);
  wordAdvanceRemaining = 0;
  wordAdvanceDue = Date.now() + wait;
  wordAdvanceTimer = setTimeout(() => {
    wordAdvanceTimer = null;
    wordAdvanceDue = 0;
    wordsIdx++;
    renderWord();
  }, wait);
}

/* ---------------- 再学一次: 跳转完整精读播放器 ---------------- */
function wordReturnUrl(index) {
  const url = new URL(location.href);
  url.searchParams.set("tab", "words");
  url.searchParams.delete("quiz");
  url.searchParams.delete("quizId");
  const question = wordQs[Math.max(0, Number(index) || 0)];
  if (question && question.id) url.searchParams.set("wordId", question.id);
  return url.href;
}

async function loadWordReviewBook(episode) {
  const n = Number(episode);
  if (!Number.isFinite(n) || n < 1) return null;
  if (!quizReviewBooks.has(`word:${n}`)) {
    const promise = fetch(`../data/dialogue_stories/ep${n}.json`)
      .then((response) => response.ok ? response.json() : null)
      .catch(() => null);
    quizReviewBooks.set(`word:${n}`, promise);
  }
  return quizReviewBooks.get(`word:${n}`);
}

function wordReviewNode(book, question) {
  const nodes = Array.isArray(book && book.nodes) ? book.nodes : [];
  const example = normQuizKey(question && question.example);
  if (example) {
    const exact = nodes.find((node) => normQuizKey(node && node.text_en) === example);
    if (exact) return exact;
  }
  const term = String(question && question.term || "").trim();
  if (!term) return null;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${escaped}\\b`, "i");
  return nodes.find((node) => isListenNodeForReview(node) && re.test(String(node.text_en || ""))) || null;
}

async function resolveWordReview(question) {
  const explicit = question && question.review;
  const episode = Number((explicit && explicit.episode) || (question && question.episode));
  let nodeId = explicit && (explicit.node_id || explicit.nodeId);
  if (!nodeId && episode) {
    const book = await loadWordReviewBook(episode);
    const node = wordReviewNode(book, question);
    nodeId = node && (node.node_id || node.nodeId) || "";
  }
  return { episode, nodeId: nodeId || "" };
}

async function openWordRelearn(question, button = $("w-relearn")) {
  if (!question || (button && button.dataset.loading === "1")) return;
  if (button) {
    button.dataset.loading = "1";
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
  }
  try {
    const target = await resolveWordReview(question);
    if (!target.episode || !target.nodeId) throw new Error("word scene unavailable");
    const url = new URL("wala.html", location.href);
    url.searchParams.set("ep", String(target.episode));
    url.searchParams.set("node", String(target.nodeId));
    url.searchParams.set("mode", "study");
    url.searchParams.set("subtitle", "enzh");
    url.searchParams.set("sidecards", "1");
    url.searchParams.set("annot", "1");
    url.searchParams.set("review", "1");
    url.searchParams.set("return", wordReturnUrl(wordsIdx));
    saveWordResume(question);
    location.href = url.href;
  } catch (_) {
    if (button) {
      button.dataset.loading = "";
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
    toast("暂时找不到对应画面，请先看完本集");
  }
}

/* ---------------- 出题构建 ---------------- */
const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const containsTerm = (example, term) => new RegExp("\\b" + escRe(term) + "\\b", "i").test(String(example || ""));
const blankIt = (example, term) => String(example || "").replace(new RegExp("\\b" + escRe(term) + "\\b", "gi"), "_____");

function buildWordQs() {
  const pool = [];
  for (const ep of pack.episodes) for (const w of ep.official_words || []) {
    if (w && w.term && w.zh && containsTerm(w.example, w.term) && !doneWords.has(w.term)) {
      pool.push({ ...w, episode: Number(ep.episode) });
    }
  }
  const st = vstat();
  // wrong>0 优先 (按错次降序), 其余随机补足
  pool.sort((a, b) => (st[b.term]?.wrong || 0) - (st[a.term]?.wrong || 0));
  const picked = shuffle(pool).slice(0, quota.words);
  const qs = [];
  for (const w of picked) {
    const dist = pool
      .filter((o) => o.term !== w.term)
      .map((o) => ({ o, d: Math.abs(o.term.length - w.term.length) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 2)
      .map((x) => x.o.term);
    const options = shuffle([w.term, ...dist]);
    qs.push({
      id: w.term,
      term: w.term,
      zh: w.zh,
      example: w.example,
      blanked: blankIt(w.example, w.term),
      options,
      episode: Number(w.episode),
      review: w.review || null,
    });
  }
  return qs;
}

function buildPuzzleQs() {
  const picked = [];
  for (const ep of pack.episodes) for (const p of ep.puzzles || []) {
    if (p && p.sentence && Array.isArray(p.words) && p.words.length >= 2 && !donePuzzles.has(p.sentence)) picked.push(p);
  }
  return shuffle(picked).slice(0, quota.puzzles).map((p) => ({ id: p.sentence, sentence: p.sentence, words: p.words.slice() }));
}

function buildQuizQs() {
  const qs = [];
  pack.episodes.forEach((ep, ei) => {
    const list = (ep.official_quiz || []).filter((q, qi) => !doneQuiz.has(`q${ei}:${qi}`));
    const take = Math.min(quota.quizPer, list.length);
    for (let i = 0; i < take; i++) {
      const raw = list[i] || {};
      qs.push({
        id: `q${ei}:${i}`,
        episode: Number(ep.episode || ei + 1),
        q: raw.q,
        choices: raw.choices || [],
        answer: raw.answer,
        q_zh: raw.q_zh,
        choices_zh: raw.choices_zh || [],
        review: raw.review || raw.relearn || null,
      });
    }
  });
  return shuffle(qs);
}

function normQuizKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function quizReviewNode(book, question) {
  const nodes = Array.isArray(book && book.nodes) ? book.nodes : [];
  const wanted = normQuizKey(question && question.q);
  const exact = nodes.find((node) => normQuizKey(node && node.quiz_after && node.quiz_after.q) === wanted);
  if (exact) return exact;

  /* 旧数据没有 quiz_after 时，按题干 + 正确选项中的关键词找最近画面。 */
  const answer = question && question.choices ? question.choices[Number(question.answer)] : "";
  const terms = `${question && question.q || ""} ${answer || ""}`
    .toLowerCase()
    .match(/[a-z][a-z0-9]{2,}/g) || [];
  let best = null;
  let bestScore = 0;
  for (const node of nodes) {
    if (!node || !isListenNodeForReview(node)) continue;
    const hay = normQuizKey(`${node.text_en || ""} ${node.text_zh || ""}`);
    const hayTokens = new Set(hay.split(" "));
    let score = 0;
    for (const term of terms) if (hayTokens.has(term) || hay.includes(term)) score += 1;
    if (score > bestScore) { best = node; bestScore = score; }
  }
  return best;
}

function isListenNodeForReview(node) {
  return !!(node && (node.type === "narration" || node.type === "dialogue") && String(node.text_en || "").trim());
}

async function loadQuizReviewBook(episode) {
  const n = Number(episode);
  if (!Number.isFinite(n) || n < 1) return null;
  if (!quizReviewBooks.has(n)) {
    const promise = fetch(`../data/dialogue_stories/ep${n}.json`)
      .then((response) => response.ok ? response.json() : null)
      .catch(() => null);
    quizReviewBooks.set(n, promise);
  }
  return quizReviewBooks.get(n);
}

async function resolveQuizReview(question) {
  const explicit = question && question.review;
  const episode = Number((explicit && explicit.episode) || (question && question.episode));
  if (explicit && (explicit.node_id || explicit.nodeId)) {
    return {
      episode,
      nodeId: explicit.node_id || explicit.nodeId,
      start: explicit.start,
      end: explicit.end,
    };
  }
  const book = await loadQuizReviewBook(episode);
  const node = quizReviewNode(book, question);
  return {
    episode,
    nodeId: node && (node.node_id || node.nodeId) || "",
    start: node && node.audio_start,
    end: node && node.audio_end,
  };
}

function quizReturnUrl(index) {
  const url = new URL(location.href);
  url.searchParams.set("tab", "quiz");
  url.searchParams.set("quiz", String(Math.max(0, Number(index) || 0)));
  const question = quizQs[Math.max(0, Number(index) || 0)];
  if (question && question.id) url.searchParams.set("quizId", question.id);
  return url.href;
}

async function openQuizRelearn(question, button) {
  if (!question || (button && button.dataset.loading === "1")) return;
  if (button) {
    button.dataset.loading = "1";
    button.disabled = true;
    button.textContent = "正在打开画面…";
  }
  try {
    const target = await resolveQuizReview(question);
    if (!target || !target.episode) throw new Error("quiz scene unavailable");
    const url = new URL("wala.html", location.href);
    url.searchParams.set("ep", String(target.episode));
    if (target.nodeId) url.searchParams.set("node", String(target.nodeId));
    url.searchParams.set("mode", "study");
    url.searchParams.set("subtitle", "enzh");
    url.searchParams.set("sidecards", "1");
    url.searchParams.set("review", "1");
    url.searchParams.set("return", quizReturnUrl(quizIdx));
    saveQuizResume(question);
    location.href = url.href;
  } catch (_) {
    if (button) {
      button.dataset.loading = "";
      button.disabled = false;
      button.textContent = "再学一次";
    }
    toast("暂时找不到对应画面，请先看完本集");
  }
}

function buildAll() {
  wordQs = buildWordQs();
  puzzleQs = buildPuzzleQs();
  quizQs = buildQuizQs();
  wordsTotal = wordQs.length; puzzlesTotal = puzzleQs.length; quizTotal = quizQs.length;
  wordsRight = puzzlesRight = quizRight = 0;
  wordsIdx = puzzlesIdx = quizIdx = 0;
  voiceOffered = false;
  voicePracticeTerm = "";
  updateTabs();
}

/* ---------------- 知识回顾 / 错题回顾（不参与通关门禁） ---------------- */
function allOfficialWords() {
  const byTerm = new Map();
  for (const ep of (pack && pack.episodes) || []) {
    for (const word of ep.official_words || []) {
      if (!word || !word.term || !word.zh || byTerm.has(word.term)) continue;
      byTerm.set(word.term, word);
    }
  }
  return [...byTerm.values()];
}

function buildReviewWords() {
  const stats = vstat();
  return allOfficialWords().sort((a, b) => {
    const aWrong = Number(stats[a.term]?.wrong || 0);
    const bWrong = Number(stats[b.term]?.wrong || 0);
    return bWrong - aWrong || String(a.term).localeCompare(String(b.term), "en");
  }).slice(0, REVIEW_PAGE_SIZE);
}

function stopReviewCountdown() {
  if (reviewTimer !== null) clearInterval(reviewTimer);
  reviewTimer = null;
}

function renderReview() {
  stopReviewCountdown();
  reviewWords = buildReviewWords();
  const grid = $("review-grid");
  grid.innerHTML = "";
  for (const word of reviewWords) {
    const card = document.createElement("article");
    card.className = "review-card";
    const term = document.createElement("button");
    term.type = "button";
    term.className = "review-term";
    term.textContent = word.term;
    term.setAttribute("aria-label", `${word.term}，点击发音`);
    term.addEventListener("click", () => playText(word.term));
    const meta = document.createElement("span");
    meta.className = "review-pos";
    meta.textContent = word.pos || "重点词";
    const zh = document.createElement("p");
    zh.textContent = word.zh;
    card.append(term, meta, zh);
    grid.appendChild(card);
  }
  if (!reviewWords.length) grid.innerHTML = '<p class="wrong-empty">本辑暂无可回顾词汇</p>';
  const button = $("review-continue");
  let left = REVIEW_COUNTDOWN;
  button.disabled = true;
  button.textContent = `继续 (${left})`;
  button.onclick = () => showTab("words");
  reviewTimer = setInterval(() => {
    left -= 1;
    if (left > 0) {
      button.textContent = `继续 (${left})`;
      return;
    }
    stopReviewCountdown();
    button.disabled = false;
    button.textContent = "继续做题";
  }, 1000);
}

function buildWrongQs() {
  const stats = vstat();
  const all = allOfficialWords();
  const wrong = all.filter((word) => Number(stats[word.term]?.wrong || 0) > 0);
  return wrong.map((word) => {
    const distractors = all
      .filter((item) => item.term !== word.term && item.zh !== word.zh)
      .sort((a, b) => Math.abs(a.term.length - word.term.length) - Math.abs(b.term.length - word.term.length))
      .slice(0, 2)
      .map((item) => item.zh);
    return { term: word.term, zh: word.zh, options: shuffle([word.zh, ...distractors]) };
  });
}

function updateWrongTab() {
  const count = allOfficialWords().filter((word) => Number(vstat()[word.term]?.wrong || 0) > 0).length;
  if ($("t-wrong")) $("t-wrong").textContent = String(count);
}

function renderWrong() {
  updateWrongTab();
  if (wrongIdx >= wrongQs.length) {
    $("wrong-progress").textContent = "0/0";
    $("wrong-card").innerHTML = '<div class="wrong-empty"><strong>还没有错题，太棒了</strong><p>做题时答错的单词会出现在这里。</p></div>';
    return;
  }
  const question = wrongQs[wrongIdx];
  $("wrong-progress").textContent = `${wrongIdx + 1}/${wrongQs.length}`;
  $("wrong-card").innerHTML = `
    <div class="wrong-question">
      <button class="review-term" id="wrong-term" type="button" aria-label="${question.term}，点击发音">${question.term}</button>
      <p>这个单词是什么意思？</p>
    </div>
    <div class="opt-grid">${question.options.map((option, index) => `<button class="opt" data-i="${index}">${option}</button>`).join("")}</div>
    <div id="wrong-feedback" class="wrong-feedback hidden" aria-live="polite"></div>`;
  $("wrong-term").addEventListener("click", () => playText(question.term));
  $("wrong-card").querySelectorAll(".opt").forEach((button) => {
    button.addEventListener("click", () => wrongAnswer(button, question));
  });
}

function wrongAnswer(button, question) {
  const grid = button.closest(".opt-grid");
  if (grid.dataset.done) return;
  grid.dataset.done = "1";
  const selected = question.options[Number(button.dataset.i)];
  const ok = selected === question.zh;
  grid.querySelectorAll(".opt").forEach((item, index) => {
    item.disabled = true;
    if (question.options[index] === question.zh) item.classList.add("correct");
    else if (item === button) item.classList.add("wrong");
  });
  if (ok) clearWrong(question.term);
  const feedback = $("wrong-feedback");
  feedback.classList.remove("hidden");
  feedback.innerHTML = `<strong>${ok ? "已清除这道错题" : "再记一下正确含义"}</strong><span>${question.term}：${question.zh}</span><button id="wrong-next" class="btn-gold" type="button">${wrongIdx + 1 < wrongQs.length ? "下一题" : "完成回顾"}</button>`;
  $("wrong-next").addEventListener("click", () => {
    wrongIdx += 1;
    renderWrong();
  });
  updateWrongTab();
}

/* ---------------- 标签切换 ---------------- */
let activeTab = "words";
function showTab(tab) {
  stopReviewCountdown();
  if (tab === "wrong" && activeTab !== "wrong") {
    wrongQs = buildWrongQs();
    wrongIdx = 0;
  }
  activeTab = tab;
  for (const t of ["review", "words", "puzzles", "quiz", "wrong"]) {
    $(`d-${t}`).classList.toggle("hidden", t !== tab);
  }
  for (const btn of document.querySelectorAll("#d-tabs .tab")) {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  }
  renderCurrent();
}

function renderCurrent() {
  if (activeTab === "review") renderReview();
  else if (activeTab === "words") renderWord();
  else if (activeTab === "puzzles") renderPuzzle();
  else if (activeTab === "quiz") renderQuiz();
  else renderWrong();
}

function updateTabs() {
  $("t-words").textContent = `${wordsRight}/${wordsTotal}`;
  $("t-puzzles").textContent = `${puzzlesRight}/${puzzlesTotal}`;
  $("t-quiz").textContent = `${quizRight}/${quizTotal}`;
  if (pack) updateWrongTab();
}

/* ---------------- 单词补全 ---------------- */
function renderWord() {
  if (wordsIdx >= wordsTotal) {
    if (puzzlesIdx < puzzlesTotal) { showTab("puzzles"); return; }
    if (quizIdx < quizTotal) { showTab("quiz"); return; }
    return finishCheck();
  }
  const w = wordQs[wordsIdx];
  $("w-progress").textContent = `${wordsIdx + 1}/${wordsTotal}`;
  const opts = w.options.map((o, i) => {
    const zh = w.term === o ? w.zh : (wordQs.find((x) => x.term === o) || {}).zh || "";
    return `<button class="opt" data-i="${i}">${o}${zh ? `<span class="opt-zh">${zh}</span>` : ""}</button>`;
  }).join("");
  $("w-card").innerHTML = `
    <div class="lead">
      <button class="speak-btn" type="button">🔊</button>
      <span>${w.blanked}</span>
    </div>
    <div class="zh-line">听单词发音, 选出正确的词</div>
    <div class="opt-grid">${opts}</div>`;
  addVoicePractice($("w-card"), w.term);
  $("w-card").querySelector(".speak-btn").addEventListener("click", () => playText(w.term));
  const grid = $("w-card").querySelector(".opt-grid");
  grid.querySelectorAll(".opt").forEach((btn) => {
    btn.addEventListener("click", () => wordAnswer(btn, w));
  });
  const rb = $("w-relearn");
  if (rb) rb.onclick = () => openWordRelearn(w);
}

function wordAnswer(btn, w) {
  const grid = btn.closest(".opt-grid");
  if (grid.dataset.done) return;
  grid.dataset.done = "1";
  const ok = btn.dataset.i === String(w.options.indexOf(w.term));
  grid.querySelectorAll(".opt").forEach((b, i) => {
    b.disabled = true;
    const isCorrect = w.options[i] === w.term;
    if (isCorrect) b.classList.add("correct");
    else if (b === btn) b.classList.add("wrong");
  });
  if (ok) {
    wordsRight++;
    doneWords.add(w.term);
    addSP(5);
    bumpStat(w.term, true);
  } else {
    bumpStat(w.term, false);
  }
  if (voicePort && typeof voicePort.stop === "function") voicePort.stop();
  updateTabs();
  scheduleWordAdvance(1000);
}

/* ---------------- 句型排序 ---------------- */
function renderPuzzle() {
  if (puzzlesIdx >= puzzlesTotal) {
    if (quizIdx < quizTotal) { showTab("quiz"); return; }
    return finishCheck();
  }
  const p = puzzleQs[puzzlesIdx];
  $("p-progress").textContent = `${puzzlesIdx + 1}/${puzzlesTotal}`;
  curTiles = p.words.slice();
  curAnswer = [];
  curStrike = 0;
  drawPuzzle(p);
}

function drawPuzzle(p) {
  const answerHtml = curAnswer.map((w, i) =>
    `<button class="p-tile" data-pos="${i}">${w}</button>`).join("") || `<span class="p-answer-empty">点击下方单词组成句子</span>`;
  const tilesHtml = curTiles.map((w) =>
    `<button class="p-tile">${w}</button>`).join("");
  $("p-card").innerHTML = `
    <div class="lead">
      <button class="speak-btn" type="button">🔊</button>
      <span>听句子, 点单词组成句子</span>
    </div>
    <div class="p-answer" id="p-answer">${answerHtml}</div>
    <div class="p-tiles" id="p-tiles">${tilesHtml}</div>
    <button id="p-check" type="button" ${curAnswer.length === 0 ? "disabled" : ""}>确定</button>`;
  $("p-card").querySelector(".speak-btn").addEventListener("click", () => playText(p.sentence));
  $("p-card").querySelectorAll("div#p-tiles .p-tile").forEach((btn) => {
    btn.addEventListener("click", () => {
      const w = btn.textContent;
      curAnswer.push(w);
      const idx = curTiles.indexOf(w);   // 去掉一个匹配项(保留重复词)
      if (idx !== -1) curTiles.splice(idx, 1);
      drawPuzzle(p);
    });
  });
  $("p-card").querySelectorAll("div#p-answer .p-tile").forEach((btn) => {
    btn.addEventListener("click", () => {
      const w = btn.textContent;
      const idx = curAnswer.indexOf(w);
      if (idx !== -1) curAnswer.splice(idx, 1);
      curTiles.push(w);
      drawPuzzle(p);
    });
  });
  const chk = $("p-check");
  if (chk) chk.addEventListener("click", () => checkPuzzle(p));
}

function normPuzzleKey(s) {
  return normSent(s).replace(/[.!?,;:…。！？，；：""''~\-]+$/g, "").toLowerCase();
}

function checkPuzzle(p) {
  const joined = curAnswer.join(" ");
  const ok = normPuzzleKey(joined) === normPuzzleKey(p.sentence);
  $("p-check").disabled = true;
  if (ok) {
    puzzlesRight++;
    donePuzzles.add(p.sentence);
    addSP(10);
    updateTabs();
    toast("✓ 句子正确");
    setTimeout(() => { puzzlesIdx++; renderPuzzle(); }, 900);
    return;
  }
  curStrike++;
  if (curStrike === 1) {
    // 高亮正确顺序, 可重排一次
    curAnswer = p.words.slice();
    drawPuzzle(p);
    const ansEl = $("p-answer");
    ansEl.querySelectorAll(".p-tile").forEach((b) => b.classList.add("correct"));
    toast("答案顺序如上, 重排一次再试");
    setTimeout(() => { curAnswer = []; curTiles = p.words.slice(); drawPuzzle(p); }, 1600);
    return;
  }
  toast("再听一遍, 下一题");
  setTimeout(() => { puzzlesIdx++; renderPuzzle(); }, 900);
}

/* ---------------- 剧情测验 ---------------- */
function renderQuiz() {
  if (quizIdx >= quizTotal) {
    return finishCheck();
  }
  const q = quizQs[quizIdx];
  const display = window.BookPlayEpisodeVocabQuiz && typeof window.BookPlayEpisodeVocabQuiz.quizDisplay === "function"
    ? window.BookPlayEpisodeVocabQuiz.quizDisplay(q)
    : {
      promptEn: String(q.q || "").trim(),
      promptZh: String(q.q_zh || "").trim(),
      choicesEn: (q.choices || []).map((choice) => String(choice || "").trim()).filter(Boolean),
      choicesZh: (q.choices_zh || []).map((choice) => String(choice || "").trim()),
    };
  $("q-progress").textContent = `${quizIdx + 1}/${quizTotal}`;
  const opts = display.choicesEn.map((c, i) =>
    `<div class="quiz-option-row"><button class="opt" data-i="${i}">${escHtml(c)}</button><button class="opt-speak opt-speak-en" type="button" aria-label="朗读英文选项 ${i + 1}">🔊</button></div>`).join("");
  // 中文仍然是可选提示，但一旦打开提示，题干和每个中文选项都有
  // 独立的播放按钮；这样不会把翻译塞进答题卡，也不会遮挡选项。
  const promptZhHint = display.promptZh
    ? `<div class="quiz-zh-row"><span>${escHtml(display.promptZh)}</span><button class="opt-speak opt-speak-zh" data-kind="prompt" type="button" aria-label="朗读中文题干">🔊</button></div>`
    : "";
  const hintChoices = display.choicesZh.map((choice, i) => choice
    ? `<div class="quiz-zh-row"><span>${String.fromCharCode(65 + i)}. ${escHtml(choice)}</span><button class="opt-speak opt-speak-zh" data-i="${i}" type="button" aria-label="朗读中文选项 ${i + 1}">🔊</button></div>`
    : "").join("");
  $("q-card").innerHTML = `
    <div class="lead">
      <button class="speak-btn" type="button">🔊</button>
      <span>${escHtml(display.promptEn)}</span>
    </div>
    <div class="hint-row"><button class="hint-btn" id="q-hint" type="button">💡 提示</button></div>
    <div id="q-hint-box" class="hidden">${promptZhHint}${hintChoices}</div>
    <div class="opt-grid" style="margin-top:0.8rem">${opts}</div>
    <div id="q-feedback" class="quiz-feedback hidden" aria-live="polite"></div>`;
  $("q-card").querySelector(".speak-btn").addEventListener("click", () => playText(display.promptEn));
  const promptZhButton = $("q-card").querySelector('.opt-speak-zh[data-kind="prompt"]');
  if (promptZhButton) {
    promptZhButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      playText(display.promptZh, "zh-CN");
    });
  }
  $("q-card").querySelector("#q-hint").addEventListener("click", () => {
    $("q-hint-box").classList.toggle("hidden");
  });
  const grid = $("q-card").querySelector(".opt-grid");
  grid.querySelectorAll(".opt-speak-en").forEach((button, index) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      playText(display.choicesEn[index]);
    });
  });
  $("q-card").querySelectorAll('.opt-speak-zh[data-i]').forEach((button) => {
    const index = Number(button.dataset.i);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      playText(display.choicesZh[index], "zh-CN");
    });
  });
  grid.querySelectorAll(".opt").forEach((btn) => {
    btn.addEventListener("click", () => quizAnswer(btn, q));
  });
}

function quizAnswer(btn, q) {
  const grid = btn.closest(".opt-grid");
  if (grid.dataset.done) return;
  grid.dataset.done = "1";
  const ok = Number(btn.dataset.i) === q.answer;
  grid.querySelectorAll(".opt").forEach((b, i) => {
    b.disabled = true;
    if (i === q.answer) b.classList.add("correct");
    else if (b === btn) b.classList.add("wrong");
  });
  if (ok) {
    quizRight++;
    doneQuiz.add(q.id);
    addSP(10);
    bumpStat("quiz", true);
  } else {
    bumpStat("quiz", false);
  }
  updateTabs();
  if (ok) {
    setTimeout(() => { quizIdx++; renderQuiz(); }, 1000);
    return;
  }
  const feedback = $("q-feedback");
  if (!feedback) return;
  feedback.classList.remove("hidden");
  feedback.innerHTML = `<strong>再看一眼这段故事</strong><span>正确答案：${escHtml(q.choices && q.choices[q.answer])}</span><div class="quiz-feedback-actions"><button id="q-relearn" class="btn-ghost" type="button">再学一次</button><button id="q-next" class="btn-gold" type="button">下一题</button></div>`;
  const relearn = $("q-relearn");
  if (relearn) relearn.addEventListener("click", () => openQuizRelearn(q, relearn));
  const nextButton = $("q-next");
  if (nextButton) nextButton.addEventListener("click", () => { quizIdx++; renderQuiz(); });
}

/* ---------------- 通过判定 ---------------- */
function finishCheck() {
  const wPass = wordsTotal === 0 || wordsRight >= Math.ceil(wordsTotal * 0.8);
  const pPass = puzzlesTotal === 0 || puzzlesRight >= Math.ceil(puzzlesTotal * 0.8);
  const qPass = quizTotal === 0 || quizRight >= Math.ceil(quizTotal * 0.7);
  const pass = wPass && pPass && qPass;

  const rows = `
    <div class="finish-row"><span>单词补全</span><b>${wordsRight}/${wordsTotal}</b></div>
    <div class="finish-row"><span>句型排序</span><b>${puzzlesRight}/${puzzlesTotal}</b></div>
    <div class="finish-row"><span>剧情测验</span><b>${quizRight}/${quizTotal}</b></div>`;

  if (pass) {
    const d = readDrill();
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    d[cid] = { done: true, words: wordsRight, puzzles: puzzlesRight, quiz: quizRight, at: now.getTime(), day };
    localStorage.setItem(DRILL_KEY, JSON.stringify(d));
    $("d-finish").innerHTML = `
      <h2>🎉 本辑巩固通过！</h2>
      <p>下一辑已解锁</p>
      <div class="finish-rows">${rows}</div>
      <div class="finish-actions">
        <a class="btn-gold" href="map.html">回地图, 继续闯关</a>
      </div>`;
  } else {
    $("d-finish").innerHTML = `
      <h2>还差一点点</h2>
      <div class="finish-rows">${rows}</div>
      <div class="finish-actions">
        <a class="btn-gold" href="map.html">回地图</a>
        <button class="btn-ghost" id="btn-redo" type="button">再做一次</button>
      </div>`;
    $("btn-redo").addEventListener("click", () => {
      buildAll();               // 已答对的题 (done*) 不再出
      showTab("words");
      $("d-finish").classList.add("hidden");
    });
  }
  for (const t of ["words", "puzzles", "quiz"]) $(`d-${t}`).classList.add("hidden");
  showPanel("finish");
  updateTabs();
}

function showPanel(name) {
  stopReviewCountdown();
  for (const t of PANEL_NAMES) {
    $(`d-${t}`).classList.toggle("hidden", t !== name);
  }
}

/* ---------------- 参数错误 ---------------- */
function showError() {
  for (const t of PANEL_NAMES) $(`d-${t}`).classList.add("hidden");
  for (const btn of document.querySelectorAll("#d-tabs .tab")) btn.disabled = true;
  $("d-error").classList.remove("hidden");
}

/* ---------------- 启动 ---------------- */
async function init() {
  if (!VALID_CID.test(cid)) { showError(); return; }
  quota = QUOTA[localStorage.getItem(LEVEL_KEY) || "std"] || QUOTA.std;
  try {
    const resp = await fetch(`/data/dialogue_stories/drill/${cid}.json`);
    if (!resp.ok) throw new Error("not found");
    pack = await resp.json();
  } catch { showError(); return; }
  document.title = `豆豆龙英语 · ${pack.title.zh} 巩固`;
  $("d-title").textContent = `${pack.title.zh} · 巩固`;
  renderSP();
  buildAll();
  const resume = (params.get("quizId") || params.get("wordId")) ? takeDrillResume() : null;
  if (resume) {
    wordsRight = Math.max(0, Math.min(wordsTotal, Number(resume.wordsRight) || 0));
    puzzlesRight = Math.max(0, Math.min(puzzlesTotal, Number(resume.puzzlesRight) || 0));
    quizRight = Math.max(0, Math.min(quizTotal, Number(resume.quizRight) || 0));
    if (resume.kind === "word" || resume.wordId) {
      const resumeWordIndex = wordQs.findIndex((question) => question.id === resume.wordId);
      if (resumeWordIndex >= 0) wordsIdx = resumeWordIndex;
    }
    updateTabs();
  }
  const resumeQuizId = params.get("quizId");
  const resumeQuizIndex = resumeQuizId
    ? quizQs.findIndex((question) => question.id === resumeQuizId)
    : Number(params.get("quiz"));
  if (Number.isInteger(resumeQuizIndex) && resumeQuizIndex >= 0 && resumeQuizIndex < quizQs.length) quizIdx = resumeQuizIndex;
  const resumeWordId = params.get("wordId");
  if (resumeWordId) {
    const resumeWordIndex = wordQs.findIndex((question) => question.id === resumeWordId);
    if (resumeWordIndex >= 0) wordsIdx = resumeWordIndex;
  }
  // 音频索引 (失败静默, 不影响做题)
  try {
    const [se, sz, qe, qz, ei] = await Promise.all([
      fetch("../assets/adv_audio/sent_en_index.json").then((r) => r.json()).catch(() => ({})),
      fetch("../assets/adv_audio/sent_zh_index.json").then((r) => r.json()).catch(() => ({})),
      fetch("../assets/adv_audio/quiz_en_index.json").then((r) => r.json()).catch(() => ({})),
      fetch("../assets/adv_audio/quiz_zh_index.json").then((r) => r.json()).catch(() => ({})),
      fetch("../assets/adv_audio/en_index.json").then((r) => r.json()).catch(() => ({})),
    ]);
    sentEn = Object.assign({}, se || {}, qe || {});
    sentZh = Object.assign({}, sz || {}, qz || {});
    enIdx = ei || {};
  } catch { /* 静默 */ }
  const requestedTab = params.get("tab");
  showTab(["review", "words", "puzzles", "quiz", "wrong"].includes(requestedTab) ? requestedTab : "review");

  // 标签切换
  document.querySelectorAll("#d-tabs .tab").forEach((btn) => {
    btn.addEventListener("click", () => showTab(btn.dataset.tab));
  });
}

init();
