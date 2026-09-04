/* BookPlay 书戏 · M1 引擎
 * 职责：加载三层剧情 JSON → 校验 → 推进/分支/存档/朗读（F1/F2/F5/F7）
 * 台词优先级：generated_text（GLM 预生成）> fallback_text（手写兜底）
 */
"use strict";

const SAVE_KEY = "bookplay_save_jttw";
const PREF_KEY = "bookplay_prefs";

const $ = (id) => document.getElementById(id);
const el = {
  title: $("title-screen"), game: $("game-screen"), end: $("end-screen"),
  btnContinue: $("btn-continue"), btnNew: $("btn-new"), btnAgain: $("btn-again"),
  btnRestart: $("btn-restart"), btnSpeak: $("btn-speak"),
  background: $("background"), portraitL: $("portrait-left"), portraitR: $("portrait-right"),
  box: $("dialogue-box"), name: $("speaker-name"), textEn: $("text-en"), textZh: $("text-zh"),
  hint: $("advance-hint"), choices: $("choices"),
  chapterLabel: $("chapter-label"), prefSubtitle: $("pref-subtitle"), prefVoice: $("pref-voice"),
  checkpointText: $("checkpoint-text"), endStats: $("end-stats"),
  error: $("error-overlay"),
};

let G = null;      // {world, outline, scenes, dialogues, characters, nodeIndex, audioMap}
let state = null;  // 存档状态
let prefs = { subtitle: true, voice: true };
let currentTextEn = "";

/* ---------------- 数据加载 ---------------- */

async function j(url) {
  const r = await fetch(url, { cache: "no-store" }); // 剧情数据始终取最新（改 JSON 后刷新即生效）
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return r.json();
}

async function loadData() {
  const world = await j("../data/world.json");
  const outline = await j("../data/story_outline.json");
  const scenes = {}, dialogues = {}, characters = {};
  for (const ch of outline.chapters) {
    for (const sid of ch.scenes) scenes[sid] = await j(`../data/scenes/${sid}.json`);
  }
  for (const sid of Object.keys(scenes)) {
    dialogues[sid] = await j(`../data/${scenes[sid].dialogue_tree}`);
    dialogues[sid]._index = Object.fromEntries(dialogues[sid].nodes.map((n) => [n.node_id, n]));
  }
  const charIds = new Set();
  Object.values(scenes).forEach((s) => s.characters_present.forEach((c) => charIds.add(c)));
  for (const cid of charIds) characters[cid] = await j(`../data/characters/${cid}.json`);

  // 可选的预生成音频清单（tts_generate.py 产物），不存在则静默降级到浏览器 TTS
  let audioMap = null;
  try { audioMap = await j("../assets/audio/index.json"); } catch (_) { /* 无清单 */ }

  return { world, outline, scenes, dialogues, characters, audioMap };
}

/* ---------------- 存档（F7） ---------------- */

function newTextState() {
  const ch = G.outline.chapters[0];
  return {
    chapter_id: ch.chapter_id,
    scene_id: ch.scenes[0],
    node_id: G.dialogues[ch.scenes[0]].start_node,
    flags: {}, attrs: {}, steps: 0, choices_made: 0,
    checkpoints: {}, finished: false, updated_at: null,
  };
}

function save() {
  state.updated_at = new Date().toISOString();
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    return s && !s.finished ? s : null;
  } catch (_) { return null; }
}

/* ---------------- 偏好设置 ---------------- */

function loadPrefs() {
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREF_KEY)) || {}); } catch (_) {}
  el.prefSubtitle.checked = prefs.subtitle;
  el.prefVoice.checked = prefs.voice;
  el.prefSubtitle.addEventListener("change", () => {
    prefs.subtitle = el.prefSubtitle.checked;
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
    applyPrefs();
  });
  el.prefVoice.addEventListener("change", () => {
    prefs.voice = el.prefVoice.checked;
    if (!prefs.voice) stopSpeaking();
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  });
}

function applyPrefs() {
  el.textZh.classList.toggle("hidden", !prefs.subtitle);
}

/* ---------------- 流程控制（F2） ---------------- */

function startNew() {
  state = newTextState();
  enterNode(state.node_id, { firstScene: true });
}

function resume() {
  enterNode(state.node_id, { firstScene: true });
}

function applyNodeFlags(node) {
  for (const f of node.set_flags || []) state.flags[f] = true;
}

function enterNode(nodeId, opts = {}) {
  const d = G.dialogues[state.scene_id];
  const node = d._index[nodeId];
  if (!node) return fatalError(`节点不存在: ${nodeId}`);
  state.node_id = nodeId;
  state.steps += opts.firstScene ? 0 : 1;
  applyNodeFlags(node);
  save();
  render(node, opts);
}

function advance() {
  const node = G.dialogues[state.scene_id]._index[state.node_id];
  if (node.node_type === "chapter_end") return showChapterEnd();
  if (node.player_choices && node.player_choices.length) return; // 等玩家选择
  if (!node.next) return;
  stopSpeaking();
  enterNode(node.next);
}

function pickChoice(choice) {
  stopSpeaking();
  for (const f of choice.set_flags || []) state.flags[f] = true;
  state.choices_made += 1;
  enterNode(choice.next);
}

/* ---------------- 渲染 ---------------- */

function render(node, opts = {}) {
  const scene = G.scenes[state.scene_id];
  const spk = G.world.speakers[node.speaker] || {};
  const chapter = G.outline.chapters.find((c) => c.chapter_id === state.chapter_id);

  el.chapterLabel.textContent = `${chapter.title.zh} · ${scene.location.zh}`;
  el.name.textContent = spk.name_zh || spk.name_en || "";
  el.name.style.color = spk.color || "var(--cream)";

  const text = node.generated_text || node.fallback_text;
  currentTextEn = text.en;
  el.textEn.textContent = text.en;
  el.textZh.textContent = text.zh;
  applyPrefs();

  // 画面：节点剧照优先（LF 视频截图），否则场景默认背景
  const wantBg = node.illustration || scene.background;
  if (el.background.dataset.img !== wantBg) {
    el.background.src = "../" + wantBg;
    el.background.dataset.img = wantBg;
  }
  if (scene.show_portraits === false) {
    el.portraitL.classList.add("hidden-portrait");
    el.portraitR.classList.add("hidden-portrait");
  } else {
    renderPortraits(node, scene, spk);
  }

  // 选项（F2：require_flag 过滤）
  el.choices.innerHTML = "";
  const choices = (node.player_choices || []).filter(
    (c) => !c.require_flag || state.flags[c.require_flag]
  );
  for (const c of choices) {
    const b = document.createElement("button");
    b.className = "choice-btn";
    const t = c.generated_text || c.text;
    b.innerHTML = `<span class="en"></span><span class="zh"></span>`;
    b.querySelector(".en").textContent = t.en;
    b.querySelector(".zh").textContent = t.zh;
    b.addEventListener("click", (e) => { e.stopPropagation(); pickChoice(c); });
    el.choices.appendChild(b);
  }
  el.hint.style.visibility = choices.length ? "hidden" : "visible";
}

function renderPortraits(node, scene, spk) {
  const shown = scene.characters_present.filter((cid) => {
    const s = Object.values(G.world.speakers).find((x) => x.character_ref === cid);
    return s && s.show_portrait;
  });
  const [leftId, rightId] = shown;
  const paint = (img, cid, isActive) => {
    if (!cid) { img.classList.add("hidden-portrait"); return; }
    const ch = G.characters[cid];
    const url = (ch.emotions && (node.emotion && ch.emotions[node.emotion] || ch.emotions.neutral)) || ch.portrait_base;
    img.src = "../" + url;
    img.classList.remove("hidden-portrait");
    img.classList.toggle("active", isActive);
  };
  paint(el.portraitL, leftId, spk.character_ref === leftId);
  paint(el.portraitR, rightId, spk.character_ref === rightId);
}

/* ---------------- 朗读（F5） ---------------- */

function stopSpeaking() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  el.box.classList.remove("speaking");
}

function speak() {
  if (!prefs.voice || !currentTextEn) return;
  // 优先播放预生成音频（tts_generate.py 产物）
  const map = G.audioMap && G.audioMap[state.scene_id];
  if (map && map[state.node_id]) {
    stopSpeaking();
    el.box.classList.add("speaking");
    const a = new Audio("../" + map[state.node_id]);
    a.onended = a.onerror = () => el.box.classList.remove("speaking");
    a.play().catch(() => el.box.classList.remove("speaking"));
    return;
  }
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(currentTextEn);
  u.lang = G.world.tts.lang || "en-US";
  u.rate = G.world.tts.rate || 1;
  const v = window.speechSynthesis.getVoices().find((x) => (x.lang || "").toLowerCase().startsWith("en"));
  if (v) u.voice = v;
  el.box.classList.add("speaking");
  u.onend = u.onerror = () => el.box.classList.remove("speaking");
  window.speechSynthesis.speak(u);
}

/* ---------------- 章节结算（F4） ---------------- */

async function showChapterEnd() {
  const ch = G.outline.chapters.find((c) => c.chapter_id === state.chapter_id);
  let summary = state.checkpoints[ch.chapter_id] || ch.summary_for_checkpoint;
  try { // 有 GLM 生成的检查点则优先
    const c = await j(`../data/checkpoints/${ch.chapter_id}.json`);
    if (c && c.summary) summary = c.summary;
  } catch (_) {}
  state.checkpoints[ch.chapter_id] = summary;
  state.finished = true;
  save();
  stopSpeaking();
  el.checkpointText.textContent = summary;
  el.endStats.textContent =
    `本章推进 ${state.steps} 步 · 做出 ${state.choices_made} 次选择 · 触发线索 ${Object.keys(state.flags).length} 条`;
  el.game.classList.add("hidden");
  el.end.classList.remove("hidden");
  renderChapterQuiz(ch);
}

/* 通关小测：答对才算“真正通关”，计入统计 */
function renderChapterQuiz(ch) {
  const area = document.getElementById("quiz-area");
  area.innerHTML = "";
  const quiz = ch.quiz || [];
  if (!quiz.length) return;
  let correct = 0;
  const scoreline = document.createElement("p");
  scoreline.className = "quiz-score";
  area.appendChild(scoreline);
  const update = () => { scoreline.textContent = `通关小测：${correct} / ${quiz.length}`; };
  update();
  quiz.forEach((q, qi) => {
    const wrap = document.createElement("div");
    wrap.className = "quiz-item";
    const head = document.createElement("p");
    head.textContent = `${qi + 1}. ${q.q}`;
    wrap.appendChild(head);
    q.choices.forEach((c, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = c;
      b.addEventListener("click", () => {
        if (wrap.dataset.done) return;
        wrap.dataset.done = "1";
        const ok = i === q.answer;
        if (ok) correct += 1;
        b.style.borderColor = ok ? "#7dcea0" : "#e07474";
        b.style.background = ok ? "rgba(125,206,160,0.15)" : "rgba(224,116,116,0.1)";
        if (!ok) wrap.children[q.answer + 1].style.borderColor = "#7dcea0";
        update();
      });
      wrap.appendChild(b);
    });
    area.appendChild(wrap);
  });
}

/* ---------------- 错误处理 ---------------- */

function fatalError(msg) {
  el.error.textContent =
    "出错了：\n" + msg +
    "\n\n如果这是首次打开：请双击 启动服务.bat，用 http://127.0.0.1 打开。不要用 python -m http.server。";
  el.error.classList.remove("hidden");
}

/* ---------------- 启动 ---------------- */

function bindEvents() {
  el.btnNew.addEventListener("click", () => { state = newTextState(); el.title.classList.add("hidden"); el.game.classList.remove("hidden"); enterNode(state.node_id, { firstScene: true }); });
  el.btnContinue.addEventListener("click", () => { el.title.classList.add("hidden"); el.game.classList.remove("hidden"); resume(); });
  el.btnAgain.addEventListener("click", () => { el.end.classList.add("hidden"); el.game.classList.remove("hidden"); startNew(); });
  el.btnRestart.addEventListener("click", () => { stopSpeaking(); el.game.classList.remove("hidden"); el.end.classList.add("hidden"); startNew(); });
  el.box.addEventListener("click", advance);
  el.textEn.addEventListener("click", (e) => { e.stopPropagation(); speak(); });
  el.btnSpeak.addEventListener("click", (e) => { e.stopPropagation(); speak(); });
  document.addEventListener("keydown", (e) => {
    if ((e.code === "Space" || e.code === "Enter") && !el.game.classList.contains("hidden")) {
      const hasChoices = el.choices.children.length > 0;
      if (!hasChoices) { e.preventDefault(); advance(); }
    }
  });
  // 浏览器语音列表可能异步就绪
  if ("speechSynthesis" in window) window.speechSynthesis.getVoices();
}

async function boot() {
  loadPrefs();
  bindEvents();
  try {
    G = await loadData();
  } catch (err) {
    return fatalError("加载数据失败: " + err.message);
  }
  const s = loadSave();
  el.btnContinue.classList.toggle("hidden", !s);
  if (s) state = s;
}

boot();
