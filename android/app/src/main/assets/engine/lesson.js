"use strict";

const PROGRESS_KEY = "bookplay_lesson_progress_v1";
const REWARD_KEY = "bookplay_jttw_episode_rewards_v1";
const core = window.LessonCore;
const rewardCore = window.BookPlayEpisodeReward;
const reviewQueue = window.WalaReviewQueue;
const params = new URLSearchParams(window.location.search);
const episode = Math.max(1, Math.min(108, Number.parseInt(params.get("ep"), 10) || 1));
const episodeKey = `ep${String(episode).padStart(3, "0")}`;
const lessonWordsMode = params.get("mode") === "words" || document.body.classList.contains("lesson-words-body");
const WORD_STUDY_KEY = "bookplay_lesson_word_study_v1";
const STUDY_SESSION_KEY = "bookplay_lesson_session_v2";
const MAP_PROGRESS_KEY = "bookplay_adv_progress";
// The local server maps these keys to natural Edge-TTS neural voices.  Keeping
// the voice names here makes the lesson's audio contract explicit while still
// allowing the server to cache the generated MP3 files for every new sentence.
const EDGE_TTS_VOICES = Object.freeze({
  en: "en-US-JennyNeural",
  zh: "zh-CN-XiaoxiaoNeural",
});
const EDGE_TTS_ENDPOINT = "/api/tts";
const TEACHER_SPRITES = {
  idle: "../assets/cast/doudou-teacher/idle.png",
  talk: "../assets/cast/doudou-teacher/talk.png",
};

const ui = {
  title: document.getElementById("lesson-title"),
  kicker: document.getElementById("lesson-kicker"),
  progress: document.getElementById("lesson-progress"),
  card: document.getElementById("lesson-card"),
  tip: document.getElementById("teacher-tip"),
  slide: document.getElementById("lesson-slide"),
  teacher: document.getElementById("lesson-teacher"),
  hint: document.getElementById("lesson-hint"),
  titleSpeak: document.getElementById("lesson-title-speak"),
  titleZh: document.getElementById("lesson-title-zh"),
  introEn: document.getElementById("lesson-intro-en"),
  introSpeak: document.getElementById("lesson-intro-speak"),
  introZh: document.getElementById("lesson-intro-zh"),
  story: document.getElementById("lesson-story"),
  review: document.getElementById("lesson-word-review"),
  wordStudyContinue: document.getElementById("lesson-start-quiz"),
};

let lesson = null;
let story = null;
let questions = [];
let current = 0;
let correct = 0;
let answered = false;
let showChinese = false;
let audioToken = 0;
let voiceOffered = false;
let rewardCatalog = null;
let rewardState = {};
let rewardOffer = null;
let studySession = null;
const lessonAudio = typeof Audio === "function" ? new Audio() : null;
const voiceSttEndpoint = String(params.get("voiceStt") || "").trim();
let voicePort = null;
try {
  voicePort = window.WalaVoice && typeof window.WalaVoice.create === "function"
    ? window.WalaVoice.create({ endpoint: voiceSttEndpoint })
    : null;
} catch (_) {
  voicePort = null;
}

function setTeacherState(state) {
  const next = state === "talk" ? "talk" : "idle";
  if (!ui.teacher) return;
  if (ui.teacher.getAttribute("src") !== TEACHER_SPRITES[next]) {
    ui.teacher.src = TEACHER_SPRITES[next];
  }
  ui.teacher.dataset.state = next;
}

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function readSettings() {
  try {
    return core.normalizeSettings(JSON.parse(localStorage.getItem(core.SETTINGS_KEY) || "{}"));
  } catch (_) {
    return core.normalizeSettings({});
  }
}

function readProgress() {
  try {
    const value = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch (_) {
    return {};
  }
}

function readStudySessions() {
  try {
    const value = JSON.parse(localStorage.getItem(STUDY_SESSION_KEY) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch (_) {
    return {};
  }
}

function writeStudySessions(value) {
  try { localStorage.setItem(STUDY_SESSION_KEY, JSON.stringify(value || {})); } catch (_) { /* offline/private mode */ }
}

function readStudySession() {
  const sessions = readStudySessions();
  return core && typeof core.normalizeStudySession === "function"
    ? core.normalizeStudySession(sessions[episodeKey]) : null;
}

function writeStudySession(next) {
  if (!core || typeof core.normalizeStudySession !== "function") return;
  studySession = core.normalizeStudySession(next);
  const sessions = readStudySessions();
  sessions[episodeKey] = studySession;
  writeStudySessions(sessions);
}

function markWordHeard(term) {
  if (!studySession || !term) return;
  const key = String(term).toLowerCase();
  studySession.heardWords = Array.isArray(studySession.heardWords) ? studySession.heardWords : [];
  if (!studySession.heardWords.some((item) => String(item).toLowerCase() === key)) studySession.heardWords.push(term);
  studySession.updatedAt = new Date().toISOString();
  writeStudySession(studySession);
  const safeTerm = typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(term) : String(term).replace(/(["\\])/g, "\\$1");
  const item = document.querySelector(`.word-review-item[data-term="${safeTerm}"]`);
  if (item) {
    item.classList.add("is-heard");
    const status = item.querySelector(".word-study-status");
    if (status) status.textContent = "✓ 已听";
  }
  if (ui.progress) {
    const total = document.querySelectorAll(".word-review-item").length;
    const heardCount = studySession.heardWords.filter((value) => document.querySelector(`.word-review-item[data-term="${typeof CSS !== "undefined" && CSS.escape ? CSS.escape(value) : String(value).replace(/(["\\])/g, "\\$1")}"]`)).length;
    ui.progress.textContent = `${heardCount} / ${total} 已听`;
  }
}

function sessionWordCards(cards, storyData) {
  const storyWords = Array.isArray(storyData && storyData.official_words) ? storyData.official_words : [];
  if (studySession && Array.isArray(studySession.words) && studySession.words.length) {
    return studySession.words.map((item) => normalizeWordRecord({
      card_id: item.cardId,
      type: "word_review",
      prompt: { en: item.term, zh: item.zh },
      payload: item,
    }, storyWords)).filter(Boolean);
  }
  return (Array.isArray(cards) ? cards : [])
    .filter((card) => card.type === "word_review")
    .map((card) => normalizeWordRecord(card, storyWords))
    .filter(Boolean)
    .slice(0, 8);
}

function localDay(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readRewardState() {
  try {
    const value = JSON.parse(localStorage.getItem(REWARD_KEY) || "{}");
    return rewardCore ? rewardCore.normalizeState(value) : value;
  } catch (_) {
    return rewardCore ? rewardCore.normalizeState({}) : {};
  }
}

function saveRewardState() {
  localStorage.setItem(REWARD_KEY, JSON.stringify(rewardState));
}

async function loadRewardCatalog() {
  if (!rewardCore) return null;
  try {
    const response = await fetch("../data/rewards/jttw.json", { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json();
  } catch (_) {
    return null;
  }
}

function saveCompletion(passed = false) {
  const settings = readSettings();
  const progress = readProgress();
  progress.version = 1;
  progress.episodes = progress.episodes && typeof progress.episodes === "object" ? progress.episodes : {};
  const previousEpisode = progress.episodes[episodeKey] && typeof progress.episodes[episodeKey] === "object"
    ? progress.episodes[episodeKey] : {};
  const total = questions.filter((question) => question.scoreable !== false).length;
  const result = core && typeof core.evaluateLessonResult === "function"
    ? core.evaluateLessonResult(correct, total)
    : { passed: Boolean(passed), ratio: total ? correct / total : 0 };
  progress.episodes[episodeKey] = {
    done: Boolean(passed || previousEpisode.passed),
    passed: Boolean(passed || previousEpisode.passed),
    correct,
    total,
    ratio: result.ratio,
    gradeBand: settings.gradeBand,
    intensity: settings.intensity,
    attempts: Number(previousEpisode.attempts || 0) + 1,
    completedAt: new Date().toISOString(),
  };
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  if (studySession) {
    studySession.passed = Boolean(passed || studySession.passed);
    studySession.attempts = Number(studySession.attempts || 0) + 1;
    studySession.updatedAt = new Date().toISOString();
    writeStudySession(studySession);
  }
  if (passed) {
    try {
      const mapProgress = JSON.parse(localStorage.getItem(MAP_PROGRESS_KEY) || "{}");
      const previous = mapProgress[String(episode)] && typeof mapProgress[String(episode)] === "object"
        ? mapProgress[String(episode)] : {};
      mapProgress[String(episode)] = {
        ...previous,
        node: Number(previous.node || (Array.isArray(story?.nodes) ? story.nodes.length : 1)),
        total: Number(previous.total || (Array.isArray(story?.nodes) ? story.nodes.length : 1)),
        done: true,
        lessonPassed: true,
        lessonScore: result.ratio,
        lessonPassedAt: new Date().toISOString(),
      };
      localStorage.setItem(MAP_PROGRESS_KEY, JSON.stringify(mapProgress));
    } catch (_) { /* map progress is an optional enhancement */ }
  }
}

function normalizeSpeechText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function edgeTtsUrl(text, lang = "en-US") {
  const value = normalizeSpeechText(text);
  const voice = String(lang || "").toLowerCase().startsWith("zh") ? "zh" : "en";
  return `${EDGE_TTS_ENDPOINT}?voice=${voice}&text=${encodeURIComponent(value)}`;
}

function clearAudioState(trigger) {
  const active = trigger || document.querySelector(".lesson-speak-question.speaking, .lesson-speak-choice.speaking, .lesson-speak-review.speaking, .lesson-speak-order.speaking, .lesson-speak-fill.speaking, .listen-picture-hear.speaking, .title-audio.speaking, .intro-audio.speaking");
  if (active) active.classList.remove("speaking");
}

function stopLessonAudio() {
  audioToken += 1;
  if (lessonAudio) {
    lessonAudio.pause();
    lessonAudio.onloadedmetadata = null;
    lessonAudio.ontimeupdate = null;
    lessonAudio.onended = null;
    lessonAudio.onerror = null;
  }
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  clearAudioState();
}

function fallbackSpeakSequence(items, token, trigger) {
  if (!window.speechSynthesis || token !== audioToken) return false;
  let index = 0;
  const next = () => {
    if (token !== audioToken || index >= items.length) {
      if (token === audioToken) clearAudioState(trigger);
      return;
    }
    const item = items[index++];
    const utterance = new SpeechSynthesisUtterance(item.text);
    utterance.lang = item.lang;
    utterance.rate = item.lang.startsWith("zh") ? 0.95 : 0.88;
    utterance.onend = next;
    utterance.onerror = next;
    window.speechSynthesis.speak(utterance);
  };
  next();
  return true;
}

function fallbackSpeakItem(item, token, trigger) {
  if (!window.speechSynthesis || token !== audioToken || !item || !item.text) return Promise.resolve(false);
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(item.text);
    utterance.lang = item.lang;
    utterance.rate = item.lang.startsWith("zh") ? 0.95 : 0.88;
    const done = (ok) => {
      utterance.onend = null;
      utterance.onerror = null;
      resolve(ok);
    };
    utterance.onend = () => done(true);
    utterance.onerror = () => done(false);
    window.speechSynthesis.speak(utterance);
  });
}

function playEdgeClip(text, lang, token) {
  const value = normalizeSpeechText(text);
  if (!lessonAudio || !value || token !== audioToken) return Promise.resolve(false);
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      lessonAudio.onended = null;
      lessonAudio.onerror = null;
      resolve(ok);
    };
    lessonAudio.src = edgeTtsUrl(value, lang);
    lessonAudio.onended = () => done(true);
    lessonAudio.onerror = () => done(false);
    lessonAudio.play().catch(() => done(false));
  });
}

async function playSpeechSequence(items, trigger) {
  const normalized = (items || [])
    .map((item) => ({ text: normalizeSpeechText(item.text), lang: item.lang || "en-US" }))
    .filter((item) => item.text);
  if (!normalized.length) return false;
  stopLessonAudio();
  const token = audioToken;
  if (trigger) trigger.classList.add("speaking");
  for (const item of normalized) {
    const ok = await playEdgeClip(item.text, item.lang, token);
    if (token !== audioToken) return false;
    if (!ok) {
      const fallback = await fallbackSpeakItem(item, token, trigger);
      if (!fallback) {
        clearAudioState(trigger);
        return false;
      }
    }
  }
  if (token === audioToken) clearAudioState(trigger);
  return true;
}

function playLessonSlice(url, from, to, token) {
  if (!lessonAudio || !url || !Number.isFinite(from) || !Number.isFinite(to) || to <= from || token !== audioToken) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    let settled = false;
    let metadataTimer = 0;
    const onSeeked = () => {
      lessonAudio.removeEventListener("seeked", onSeeked);
      lessonAudio.play().catch(() => done(false));
    };
    const cleanup = () => {
      if (metadataTimer) window.clearTimeout(metadataTimer);
      lessonAudio.onloadedmetadata = null;
      lessonAudio.ontimeupdate = null;
      lessonAudio.onended = null;
      lessonAudio.onerror = null;
      lessonAudio.removeEventListener("seeked", onSeeked);
    };
    const done = (ok) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (ok) lessonAudio.pause();
      resolve(ok);
    };
    const run = () => {
      if (token !== audioToken) { done(false); return; }
      if (metadataTimer) window.clearTimeout(metadataTimer);
      metadataTimer = 0;
      lessonAudio.ontimeupdate = () => {
        if (lessonAudio.currentTime >= to - 0.05) done(true);
      };
      lessonAudio.onended = () => done(true);
      lessonAudio.onerror = () => done(false);
      if (Math.abs(lessonAudio.currentTime - from) < 0.2) {
        lessonAudio.play().catch(() => done(false));
        return;
      }
      lessonAudio.addEventListener("seeked", onSeeked);
      try { lessonAudio.currentTime = from; } catch (_) { lessonAudio.play().catch(() => done(false)); }
    };
    const currentSrc = lessonAudio.getAttribute("src");
    if (currentSrc !== url) {
      lessonAudio.onloadedmetadata = run;
      lessonAudio.onerror = () => done(false);
      metadataTimer = window.setTimeout(() => done(false), 1800);
      lessonAudio.src = url;
    } else if (lessonAudio.readyState >= 1) run();
    else {
      lessonAudio.onloadedmetadata = run;
      lessonAudio.onerror = () => done(false);
      metadataTimer = window.setTimeout(() => done(false), 1800);
    }
  });
}

function playEnglish(text, trigger) {
  return playSpeechSequence([{ text, lang: "en-US" }], trigger);
}

function playChinese(text, trigger) {
  return playSpeechSequence([{ text, lang: "zh-CN" }], trigger);
}

function playBilingual(en, zh, trigger) {
  return playSpeechSequence([
    { text: en, lang: "en-US" },
    { text: zh, lang: "zh-CN" },
  ], trigger);
}

async function playListenPictureAudio(question, trigger) {
  if (!question) return false;
  stopLessonAudio();
  const status = ui.card && ui.card.querySelector(".listen-picture-status");
  if (status) status.textContent = "正在播放原声…";
  const token = audioToken;
  if (trigger) trigger.classList.add("speaking");
  let played = false;
  if (question.audio && story && story.audio) {
    played = await playLessonSlice(`../${story.audio}`, question.audio.from, question.audio.to, token);
  }
  if (token !== audioToken) return false;
  if (!played) played = await playEnglish(question.textEn, trigger);
  if (questions[current] !== question) return played;
  if (status) status.textContent = played ? "听完啦，点击喇叭可以重听。" : "没有可播放的音频，仍可直接选图。";
  return played;
}

function rememberWordResult(question, isCorrect) {
  if (!reviewQueue || !question) return;
  let term = "";
  let zh = "";
  if (question.type === "word_choice") {
    term = normalizeSpeechText(question.targetEn || question.term);
    zh = normalizeSpeechText(question.targetZh || "");
  } else if (question.type === "sentence_fill") {
    term = normalizeSpeechText(question.answer || question.blank);
    const choice = (question.choices || []).find((item) => String(item.en || "") === term);
    zh = normalizeSpeechText(choice && choice.zh);
  }
  if (!term) return;
  if (isCorrect) reviewQueue.resolve(localStorage, term);
  else reviewQueue.enqueue(localStorage, {
    term,
    zh,
    sourceEpisode: episode,
    example: question.sentence || question.speech?.en || "",
    evidence: question.answerEvidence || question.promptEn || "",
  });
}

// Kept as a tiny compatibility wrapper for older callers and the offline
// browser fallback. Edge-TTS is always attempted before this path.
function speak(text) {
  return playEnglish(text);
}

function voiceReferenceFor(question) {
  if (!question) return "";
  if (question.type === "word_review") return normalizeSpeechText(question.term);
  if (question.type === "word_choice") return normalizeSpeechText(question.targetEn || question.promptEn);
  if (question.type === "sentence_order") return normalizeSpeechText(question.sentence || question.speech?.en);
  if (question.type === "sentence_fill") return normalizeSpeechText(question.speech?.en || question.answer);
  return normalizeSpeechText(question.speech?.en || question.promptEn);
}

function voiceModeFor(referenceText) {
  return (window.WalaVoiceCore && window.WalaVoiceCore.tokenizeEnglish(referenceText).length > 1)
    ? "read_sentence" : "read_word";
}

function voicePracticeMessage(result) {
  const feedback = window.WalaVoiceCore && typeof window.WalaVoiceCore.feedbackFor === "function"
    ? window.WalaVoiceCore.feedbackFor(result)
    : { message: "语音不可用，可以点选完成", tone: "fallback", showScore: false };
  const heard = result && result.transcript && result.kind !== "match"
    ? `（听到：${result.transcript}）` : "";
  return { ...feedback, message: `${feedback.message}${heard}` };
}

function offerVoicePractice(question) {
  if (voiceOffered || !ui.card) return;
  const referenceText = voiceReferenceFor(question);
  if (!referenceText) return;
  voiceOffered = true;
  const mode = voiceModeFor(referenceText);
  const capabilities = voicePort && typeof voicePort.capabilities === "function"
    ? voicePort.capabilities() : { mic: false, asr: false };
  const initial = capabilities.asr
    ? "可选练习：听示范后，试着说一遍。"
    : "可选练习：当前设备不能录音，仍可直接点选完成。";
  const panel = document.createElement("section");
  panel.className = "voice-practice";
  panel.setAttribute("aria-labelledby", "voice-practice-title");
  panel.innerHTML = `<div class="voice-practice-heading"><div><p class="voice-practice-kicker">Speaking · 跟读小练习</p><h3 id="voice-practice-title">跟着豆豆龙说一遍</h3></div><span class="voice-practice-optional">可选</span></div><p class="voice-practice-reference" lang="en">${escapeHtml(referenceText)}</p><div class="voice-practice-actions"><button class="voice-demo" type="button">听示范</button><button class="voice-record" type="button" ${capabilities.asr ? "" : "disabled"}>跟读</button><button class="voice-retry" type="button" hidden>再试一次</button><button class="voice-skip" type="button">跳过</button></div><p class="voice-practice-status" role="status" aria-live="polite">${initial}</p>`;
  ui.card.appendChild(panel);

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
      const result = await voicePort.listen({ referenceText, mode, lang: "en-US" });
      const feedback = voicePracticeMessage(result);
      setState(feedback.message, feedback.tone);
      retry.hidden = !["partial", "mismatch", "no-speech", "timeout"].includes(result && result.kind);
    } catch (_) {
      setState("语音暂时不可用，可以点选完成。", "fallback");
      retry.hidden = true;
    } finally {
      record.disabled = false;
    }
  };

  demo.addEventListener("click", () => playEnglish(referenceText, demo));
  record.addEventListener("click", run);
  retry.addEventListener("click", run);
  skip.addEventListener("click", () => {
    setState("已跳过跟读，继续答题即可。", "skipped");
    record.disabled = true;
    retry.hidden = true;
  });
}

function applyChineseVisibility() {
  document.querySelectorAll(".lesson-zh").forEach((node) => {
    node.hidden = !showChinese;
    node.classList.toggle("hidden", !showChinese);
  });
  if (ui.hint) {
    ui.hint.setAttribute("aria-expanded", String(showChinese));
    ui.hint.title = showChinese ? "隐藏中文提示" : "提示：显示中文";
    const label = ui.hint.querySelector(".hint-label");
    if (label) label.textContent = showChinese ? "隐藏中文" : "提示中文";
  }
}

function toggleChinese() {
  showChinese = !showChinese;
  applyChineseVisibility();
}

function speakerSvg() {
  return '<svg class="speaker-mark" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10v4h4l5 5V5L7 10H3zm11-2.03v8.05A4.49 4.49 0 0016.5 12 4.49 4.49 0 0014 7.97zM14 3.23v2.06a7 7 0 010 13.42v2.06a9 9 0 000-17.54z"/></svg>';
}

function sentenceQuestion(card) {
  const payload = card.payload || {};
  const choices = (payload.choices || []).map((choice, index) => ({
    id: choice.id == null ? String(index) : String(choice.id),
    en: choice.en || String(choice),
    zh: choice.zh || "",
  }));
  const rawAnswer = payload.answer;
  const answer = typeof rawAnswer === "number" && choices[rawAnswer]
    ? choices[rawAnswer].id : String(rawAnswer);
  return {
    type: "sentence_choice",
    kind: "sentence_choice",
    cardId: card.card_id,
    promptZh: (card.prompt && card.prompt.zh) || "选择正确答案",
    promptEn: (card.prompt && card.prompt.en) || "Choose the correct answer.",
    answer,
    choices,
    scoreable: true,
    speech: {
      en: (card.prompt && card.prompt.en) || "Choose the correct answer.",
      zh: (card.prompt && card.prompt.zh) || "选择正确答案",
    },
  };
}

function normalizeWordRecord(record, storyWords) {
  const raw = record || {};
  const payload = raw.payload || raw;
  const term = String(payload.term || raw.term || "").trim();
  if (!term) return null;
  const match = (Array.isArray(storyWords) ? storyWords : []).find((item) => String(item && (item.term || "")).toLowerCase() === term.toLowerCase()) || {};
  const mergedPayload = {
    ...payload,
    term,
    def: String(payload.def || raw.zh || match.zh || "").trim(),
    gloss: String(payload.gloss || raw.zh || (raw.prompt && raw.prompt.zh) || match.zh || payload.def || "").trim(),
    ipa: String(payload.ipa || match.ipa || "").trim(),
    pos: String(payload.pos || match.pos || "").trim(),
    example: String(payload.example || raw.example || match.example || "").trim(),
  };
  if (core && typeof core.isCleanGloss === "function" && !core.isCleanGloss(mergedPayload.gloss)) return null;
  return {
    ...raw,
    card_id: raw.card_id || `story-word-${term}`,
    type: "word_review",
    prompt: { ...(raw.prompt || {}), en: term, zh: mergedPayload.gloss },
    payload: mergedPayload,
    review_status: raw.review_status || "machine_verified",
  };
}

function buildQuestions(cards, selected, storyData, settings, session) {
  const storyWords = Array.isArray(storyData && storyData.official_words) ? storyData.official_words : [];
  const lessonWords = (Array.isArray(cards) ? cards : [])
    .filter((card) => card.type === "word_review" && card.review_status !== "needs_review")
    .map((card) => normalizeWordRecord(card, storyWords))
    .filter(Boolean);
  const selectedWords = (Array.isArray(selected) ? selected : [])
    .filter((card) => card.type === "word_review" && card.review_status !== "needs_review")
    .map((card) => normalizeWordRecord(card, storyWords))
    .filter(Boolean);
  const sessionWords = session && Array.isArray(session.words)
    ? session.words.map((item) => normalizeWordRecord({
      card_id: item.cardId,
      type: "word_review",
      prompt: { en: item.term, zh: item.zh },
      payload: item,
    }, storyWords)).filter(Boolean)
    : [];
  const sessionTerms = new Set(sessionWords.map((item) => item.payload.term.toLowerCase()));
  const wordPool = [...sessionWords];
  for (const item of lessonWords) {
    if (!wordPool.some((entry) => entry.payload.term.toLowerCase() === item.payload.term.toLowerCase())) wordPool.push(item);
  }
  for (const source of storyWords) {
    const normalized = normalizeWordRecord(source, storyWords);
    if (normalized && !wordPool.some((item) => item.payload.term.toLowerCase() === normalized.payload.term.toLowerCase())) wordPool.push(normalized);
  }
  const words = sessionWords.length
    ? sessionWords
    : (selectedWords.length ? selectedWords : wordPool.slice(0, 4));
  const output = [];
  const seen = new Set();
  const add = (question) => {
    if (!question) return;
    const key = `${question.kind || question.type}|${question.direction || ""}|${question.cardId || question.term || question.sentence || output.length}`;
    if (seen.has(key)) return;
    seen.add(key);
    output.push(question);
  };

  if (core && typeof core.buildListenPictureQuestions === "function") {
    const listenCount = settings && settings.gradeBand === "g1_2" ? 3 : 1;
    const listenChoiceCount = settings && settings.gradeBand === "g1_2" ? 2 : 4;
    core.buildListenPictureQuestions(storyData, {
      count: listenCount,
      choiceCount: listenChoiceCount,
    }).forEach(add);
  }

  if (words[0]) add(core.buildWordQuestion(words[0], wordPool, episode, "en_to_zh"));
  if (words[1] || words[0]) add(core.buildWordQuestion(words[1] || words[0], wordPool, episode, "zh_to_en"));

  const puzzles = Array.isArray(storyData && storyData.puzzles) ? storyData.puzzles : [];
  const nodes = Array.isArray(storyData && storyData.nodes) ? storyData.nodes : [];
  const puzzle = core && typeof core.pickPuzzle === "function" ? core.pickPuzzle(puzzles, episode) : puzzles[0];
  if (puzzle) {
    const orderNode = nodes.find((node) => node && node.text_en && node.text_en.trim() === String(puzzle.sentence || "").trim());
    add(core.buildSentenceOrderQuestion({
      ...puzzle,
      text_zh: puzzle.text_zh || (orderNode && orderNode.text_zh) || "",
    }, episode));
  }

  const fillSources = storyWords.filter((item) => item && item.example && item.term
    && (!sessionTerms.size || sessionTerms.has(String(item.term).toLowerCase())));
  for (const source of fillSources) {
    const fillNode = nodes.find((node) => node && node.text_en && node.text_en.trim() === String(source.example).trim());
    const fill = core.buildSentenceFillQuestion({
      ...source,
      text_zh: source.text_zh || (fillNode && fillNode.text_zh) || "",
    }, wordPool, episode);
    if (fill) { add(fill); break; }
  }

  for (const card of (Array.isArray(selected) ? selected : [])) {
    if (card.type === "sentence_choice") add(sentenceQuestion(card));
  }
  for (let index = 2; index < words.length; index += 1) {
    add(core.buildWordQuestion(words[index], wordPool, episode, index % 2 ? "en_to_zh" : "zh_to_en"));
  }
  const quota = core.getQuestionQuota(settings || {});
  return output.slice(0, quota);
}

function renderChoice(choice, question, index) {
  const direction = question.direction || "";
  const answerValue = question.type === "word_choice"
    ? (direction === "en_to_zh" ? choice.zh : choice.en)
    : (choice.id == null ? choice.en : choice.id);
  const presentation = core && typeof core.choicePresentation === "function"
    ? core.choicePresentation(choice, question)
    : {
      primary: question.type === "word_choice" && direction === "en_to_zh" ? choice.zh : choice.en,
      secondary: question.type === "word_choice" ? "" : choice.zh,
      primaryLang: question.type === "word_choice" && direction === "en_to_zh" ? "zh-CN" : "en",
      secondaryLang: "zh-CN",
    };
  const primary = presentation.primary;
  const primaryLang = presentation.primaryLang;
  const row = document.createElement("div");
  row.className = "choice-row";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "choice-button";
  button.dataset.answer = answerValue;
  const secondary = presentation.secondary;
  const secondaryClass = secondary === choice.zh ? "choice-zh lesson-zh" : "choice-secondary";
  const secondaryLang = presentation.secondaryLang;
  button.innerHTML = `<span class="choice-main"><span class="choice-en choice-primary" lang="${primaryLang}">${escapeHtml(primary)}</span>${secondary ? `<span class="${secondaryClass}" lang="${secondaryLang}" ${secondary === choice.zh ? "hidden" : ""}>${escapeHtml(secondary)}</span>` : ""}</span><span class="choice-letter" aria-hidden="true">${String.fromCharCode(65 + index)}</span>`;
  button.setAttribute("aria-label", `${primary}，点击选择答案`);
  button.addEventListener("click", () => answerQuestion(button, answerValue));
  const audioButton = document.createElement("button");
  audioButton.type = "button";
  audioButton.className = "audio-button lesson-speak-choice";
  audioButton.title = `朗读选项：${choice.en}${choice.zh ? ` / ${choice.zh}` : ""}`;
  audioButton.setAttribute("aria-label", `朗读选项：${choice.en}`);
  audioButton.innerHTML = `${speakerSvg()}<span class="sr-only">朗读选项 ${escapeHtml(choice.en)}</span>`;
  audioButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    playBilingual(choice.en, choice.zh, audioButton);
  });
  row.append(button, audioButton);
  return row;
}

function answerQuestion(button, value) {
  if (answered) return;
  answered = true;
  setTeacherState("talk");
  const question = questions[current];
  const isCorrect = String(value) === String(question.answer);
  if (isCorrect && question.scoreable !== false) correct += 1;
  rememberWordResult(question, isCorrect);
  persistQuizAnswer(question, isCorrect);
  const buttons = Array.from(ui.card.querySelectorAll(".choice-button"));
  buttons.forEach((item) => {
    item.disabled = true;
    const itemCorrect = String(item.dataset.answer) === String(question.answer);
    item.classList.toggle("is-correct", itemCorrect);
    item.classList.toggle("is-wrong", item === button && !isCorrect);
  });
  const answerChoice = (question.choices || []).find((choice) => {
    const key = question.type === "word_choice" && question.direction === "en_to_zh" ? choice.zh : (choice.id == null ? choice.en : choice.id);
    return String(key) === String(question.answer);
  });
  const detailEn = question.type === "word_choice"
    ? question.targetEn
    : question.type === "sentence_fill"
      ? question.answer
      : `${answerChoice ? answerChoice.en : question.answer}`;
  const detailZh = question.type === "word_choice"
    ? question.targetZh
    : (answerChoice && answerChoice.zh ? answerChoice.zh : "");
  appendFeedback(question, isCorrect, detailEn, detailZh);
}

function appendFeedback(question, isCorrect, detailEn, detailZh) {
  const feedback = document.createElement("div");
  feedback.className = `feedback ${isCorrect ? "is-correct" : "is-wrong"}`;
  const evidence = question && question.answerEvidence
    ? `<span class="feedback-evidence">例句：${escapeHtml(question.answerEvidence)}</span>` : "";
  feedback.innerHTML = `<strong>${isCorrect ? "回答正确" : "再记一下"}</strong><span>正确答案：${escapeHtml(detailEn)}</span>${detailZh ? `<span class="feedback-zh lesson-zh" lang="zh-CN" hidden>${escapeHtml(detailZh)}</span>` : ""}${evidence}<button class="audio-button feedback-audio" type="button" title="朗读正确答案" aria-label="朗读正确答案">${speakerSvg()}<span class="sr-only">朗读正确答案</span></button>`;
  const audio = feedback.querySelector(".feedback-audio");
  if (audio) audio.addEventListener("click", () => playBilingual(detailEn, detailZh, audio));
  ui.card.appendChild(feedback);
  applyChineseVisibility();
  const actions = document.createElement("div");
  actions.className = "question-actions";
  const next = document.createElement("button");
  next.type = "button";
  next.className = "primary-button";
  next.textContent = current + 1 >= questions.length ? "查看结果" : "下一题";
  next.addEventListener("click", () => {
    current += 1;
    answered = false;
    if (current >= questions.length) finishLesson();
    else renderQuestion();
  });
  actions.appendChild(next);
  ui.card.appendChild(actions);
  next.focus();
}

function persistQuizAnswer(question, isCorrect) {
  if (!studySession) return;
  const answers = Array.isArray(studySession.quiz?.answers) ? studySession.quiz.answers.slice() : [];
  const entry = {
    index: current,
    ok: Boolean(isCorrect),
    type: question && (question.kind || question.type),
    term: question && (question.targetEn || question.answer || question.term || question.correctNode || ""),
    at: new Date().toISOString(),
  };
  const existing = answers.findIndex((item) => Number(item.index) === current);
  if (existing >= 0) answers[existing] = entry;
  else answers.push(entry);
  studySession.quiz = { current, correct, answers };
  studySession.updatedAt = new Date().toISOString();
  writeStudySession(studySession);
}

function restoreQuizPosition() {
  if (!studySession || !studySession.quiz) return;
  const answers = Array.isArray(studySession.quiz.answers) ? studySession.quiz.answers : [];
  correct = answers.filter((item) => item && item.ok).length;
  const answeredIndexes = new Set(answers
    .filter((item) => item && (item.type !== "listen_picture" || item.ok === true))
    .map((item) => Number(item.index))
    .filter(Number.isInteger));
  current = 0;
  while (current < questions.length && answeredIndexes.has(current)) current += 1;
  if (current >= questions.length) {
    finishLesson();
  }
}

function resetQuizSession() {
  if (!studySession) return;
  studySession.quiz = { current: 0, correct: 0, answers: [] };
  studySession.passed = false;
  studySession.updatedAt = new Date().toISOString();
  writeStudySession(studySession);
}

function questionMeta(question) {
  const labels = {
    word_en_to_zh: "单词学习 · 英文选中文",
    word_zh_to_en: "单词学习 · 中文选英文",
    sentence_order: "句型练习 · 单词排序",
    sentence_fill: "句型练习 · 补全单词",
    sentence_choice: "剧情理解",
    listen_picture: "听力理解 · 听音识景",
  };
  return labels[question.kind || question.type] || "本集知识巩固";
}

function renderQuestionHeader(question) {
  // Sentence-order questions render their translation in the dedicated clue
  // panel below, so the global Chinese hint should not duplicate it in the
  // header. Other question types continue to use the on-demand hint line.
  const headerZh = question.type === "sentence_order"
    ? ""
    : question.type === "word_choice" && question.direction === "zh_to_en"
      ? "根据中文意思选择对应的英文单词"
      : question.promptZh;
  const speakerMarkup = question.kind === "listen_picture"
    ? ""
    : `<button class="audio-button lesson-speak-question" type="button" title="朗读题目" aria-label="朗读英文题目">${speakerSvg()}<span class="sr-only">朗读英文题目</span></button>`;
  ui.card.innerHTML = `<p class="question-meta">第 ${current + 1} 题 · ${questionMeta(question)}</p><div class="question-prompt"><div class="question-en-row"><h2 class="question-en" id="lesson-question-en" lang="en">${escapeHtml(question.promptEn || "")}</h2>${speakerMarkup}</div>${headerZh ? `<p class="question-zh lesson-zh" lang="zh-CN" hidden>${escapeHtml(headerZh)}</p>` : ""}</div>`;
  const speaker = ui.card.querySelector(".lesson-speak-question");
  if (speaker) speaker.addEventListener("click", () => playEnglish(question.promptEn, speaker));
}

function renderChoiceQuestion(question) {
  renderQuestionHeader(question);
  if (question.type === "word_choice") {
    const targetText = question.direction === "en_to_zh" ? question.targetEn : question.targetZh;
    const targetLang = question.direction === "en_to_zh" ? "en" : "zh-CN";
    ui.card.insertAdjacentHTML("beforeend", `<div class="word-target"><span class="word-target-label">${question.direction === "en_to_zh" ? "Word" : "Meaning"}</span><div class="word-target-row"><strong lang="${targetLang}">${escapeHtml(targetText)}</strong><button class="audio-button word-target-audio" type="button" title="朗读${question.direction === "en_to_zh" ? "单词" : "中文释义"}" aria-label="朗读${question.direction === "en_to_zh" ? "单词" : "中文释义"}">${speakerSvg()}<span class="sr-only">朗读目标词</span></button></div>${question.direction === "zh_to_en" && question.ipa ? `<span class="word-target-ipa">/${escapeHtml(question.ipa)}/</span>` : ""}</div>`);
    const targetSpeaker = ui.card.querySelector(".word-target-audio");
    if (targetSpeaker) targetSpeaker.addEventListener("click", () => { if (question.direction === "en_to_zh") playEnglish(question.targetEn, targetSpeaker); else playChinese(question.targetZh, targetSpeaker); });
  }
  ui.card.insertAdjacentHTML("beforeend", '<div class="choice-grid" id="lesson-choices"></div>');
  const grid = document.getElementById("lesson-choices");
  (question.choices || []).forEach((choice, index) => grid.appendChild(renderChoice(choice, question, index)));
  applyChineseVisibility();
  const first = grid.querySelector(".choice-button");
  if (first) first.focus();
}

function renderSentenceFillQuestion(question) {
  renderQuestionHeader(question);
  ui.card.insertAdjacentHTML("beforeend", `<div class="sentence-fill-card"><div class="sentence-fill-row"><p class="sentence-fill-text" lang="en">${escapeHtml(question.sentenceWithBlank)}</p><button class="audio-button lesson-speak-fill" type="button" title="朗读完整句子" aria-label="朗读完整句子">${speakerSvg()}<span class="sr-only">朗读完整句子</span></button></div>${question.speech.zh ? `<p class="sentence-translation lesson-zh" lang="zh-CN" hidden>${escapeHtml(question.speech.zh)}</p>` : ""}</div><div class="choice-grid" id="lesson-choices"></div>`);
  const speaker = ui.card.querySelector(".lesson-speak-fill");
  if (speaker) speaker.addEventListener("click", () => playBilingual(question.speech.en, question.speech.zh, speaker));
  const grid = document.getElementById("lesson-choices");
  (question.choices || []).forEach((choice, index) => grid.appendChild(renderChoice(choice, question, index)));
  applyChineseVisibility();
  const first = grid.querySelector(".choice-button");
  if (first) first.focus();
}

function renderListenPictureQuestion(question) {
  renderQuestionHeader(question);
  const nodeById = new Map((Array.isArray(story && story.nodes) ? story.nodes : []).map((node) => [
    String(node && (node.node_id || node.nodeId) || ""),
    node,
  ]));
  ui.card.insertAdjacentHTML("beforeend", `<div class="listen-picture-card"><div class="listen-picture-audio-row"><div><strong>听一听，选出对应的画面</strong><p class="listen-picture-status" role="status" aria-live="polite">正在准备原声…</p></div><button class="audio-button listen-picture-hear" type="button" title="重听原声" aria-label="重听原声">${speakerSvg()}<span class="sr-only">重听原声</span></button></div><div class="listen-picture-grid" id="lesson-listen-picture-options"></div></div>`);
  const grid = document.getElementById("lesson-listen-picture-options");
  (question.options || []).forEach((nodeId, index) => {
    const node = nodeById.get(String(nodeId));
    if (!node || !grid) return;
    const image = String(node.illustration || node.image || "").trim();
    const button = document.createElement("button");
    button.type = "button";
    button.className = "listen-picture-option";
    button.dataset.answer = String(nodeId);
    button.setAttribute("aria-label", `选择第 ${index + 1} 张场景插图`);
    button.innerHTML = `<span class="listen-picture-image"><img src="../data/${escapeHtml(image)}" alt="" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="listen-picture-image-fallback" hidden>场景插图</span></span><span class="choice-letter" aria-hidden="true">${String.fromCharCode(65 + index)}</span>`;
    button.addEventListener("click", () => answerListenPicture(button, nodeId));
    grid.appendChild(button);
  });
  const hear = ui.card.querySelector(".listen-picture-hear");
  if (hear) hear.addEventListener("click", () => playListenPictureAudio(question, hear));
  applyChineseVisibility();
  const first = grid && grid.querySelector(".listen-picture-option");
  if (first) first.focus();
  window.setTimeout(() => {
    if (questions[current] === question && !answered) playListenPictureAudio(question, hear);
  }, 0);
}

function setListenPictureOptionsDisabled(disabled) {
  if (!ui.card) return;
  ui.card.querySelectorAll(".listen-picture-option").forEach((button) => { button.disabled = disabled; });
}

function appendListenPictureFeedback(question, isCorrect) {
  const previous = ui.card.querySelector(".listen-picture-feedback");
  if (previous) previous.remove();
  const feedback = document.createElement("div");
  feedback.className = `feedback listen-picture-feedback ${isCorrect ? "is-correct" : "is-wrong"}`;
  if (isCorrect) {
    feedback.innerHTML = '<strong>图片对了就是懂！</strong><span>做得很好，继续下一题。</span><div class="question-actions"><button class="primary-button listen-picture-next" type="button">下一题</button></div>';
    const next = feedback.querySelector(".listen-picture-next");
    if (next) {
      next.addEventListener("click", () => {
        current += 1;
        answered = false;
        if (current >= questions.length) finishLesson();
        else renderQuestion();
      });
    }
  } else {
    feedback.innerHTML = '<strong>再听一遍，再试一次。</strong><span>别着急，听懂了再选。</span><div class="question-actions"><button class="primary-button listen-picture-retry" type="button">再听一遍</button></div>';
    const retry = feedback.querySelector(".listen-picture-retry");
    if (retry) {
      retry.addEventListener("click", async () => {
        feedback.remove();
        ui.card.querySelectorAll(".listen-picture-option").forEach((button) => {
          button.disabled = false;
          button.classList.remove("is-wrong", "is-correct");
        });
        setTeacherState("idle");
        await playListenPictureAudio(question, ui.card.querySelector(".listen-picture-hear"));
        const first = ui.card.querySelector(".listen-picture-option");
        if (first) first.focus();
      });
    }
  }
  ui.card.appendChild(feedback);
  if (!isCorrect) {
    const retry = feedback.querySelector(".listen-picture-retry");
    if (retry) retry.focus();
  }
}

function answerListenPicture(button, value) {
  if (answered) return;
  const question = questions[current];
  if (!question || question.kind !== "listen_picture") return;
  setTeacherState("talk");
  const isCorrect = String(value) === String(question.correctNode);
  if (!isCorrect) {
    if (!question.listenWrong) {
      question.listenWrong = true;
      persistQuizAnswer(question, false);
    }
    setListenPictureOptionsDisabled(true);
    if (button) button.classList.add("is-wrong");
    appendListenPictureFeedback(question, false);
    return;
  }
  if (!question.listenScored) {
    question.listenScored = true;
    correct += 1;
  }
  answered = true;
  persistQuizAnswer(question, true);
  setListenPictureOptionsDisabled(true);
  if (button) button.classList.add("is-correct");
  const answerButton = Array.from(ui.card.querySelectorAll(".listen-picture-option")).find((item) => String(item.dataset.answer) === String(question.correctNode));
  if (answerButton) answerButton.classList.add("is-correct");
  appendListenPictureFeedback(question, true);
  launchRewardConfetti();
}

function drawSentenceOrder(question) {
  const answerBox = ui.card.querySelector(".sentence-order-answer");
  const tiles = ui.card.querySelector(".sentence-order-tiles");
  const check = ui.card.querySelector(".sentence-order-check");
  if (!answerBox || !tiles || !check) return;
  answerBox.innerHTML = question.selected.length
    ? question.selected.map((word) => `<button type="button" class="order-token selected-token">${escapeHtml(word)}</button>`).join("")
    : '<span class="order-placeholder">点击下面的单词组成句子</span>';
  tiles.innerHTML = question.remaining.map((word, index) => `<button type="button" class="order-token" data-index="${index}">${escapeHtml(word)}</button>`).join("");
  tiles.querySelectorAll(".order-token").forEach((button) => button.addEventListener("click", () => {
    const index = Number(button.dataset.index);
    const [word] = question.remaining.splice(index, 1);
    if (word) question.selected.push(word);
    drawSentenceOrder(question);
  }));
  answerBox.querySelectorAll(".selected-token").forEach((button, index) => button.addEventListener("click", () => {
    const [word] = question.selected.splice(index, 1);
    if (word) question.remaining.push(word);
    drawSentenceOrder(question);
  }));
  check.disabled = !question.selected.length;
}

function checkSentenceOrder(question) {
  if (answered) return;
  answered = true;
  setTeacherState("talk");
  const normalize = (value) => String(value || "").replace(/[.!?,;:。！？？，；：]+$/g, "").toLowerCase();
  const isCorrect = question.selected.map(normalize).join(" ") === question.answer.map(normalize).join(" ");
  if (isCorrect) correct += 1;
  persistQuizAnswer(question, isCorrect);
  const check = ui.card.querySelector(".sentence-order-check");
  if (check) check.disabled = true;
  appendFeedback(question, isCorrect, question.sentence, question.speech.zh);
}

function renderSentenceOrderQuestion(question) {
  renderQuestionHeader(question);
  question.selected = [];
  question.remaining = question.words.slice();
  const clue = core && typeof core.getSentenceOrderClue === "function"
    ? core.getSentenceOrderClue(question)
    : {
      text: normalizeSpeechText(question.speech?.zh || question.sentence),
      lang: question.speech?.zh ? "zh-CN" : "en",
      source: question.speech?.zh ? "translation" : "sentence",
  };
  const clueMarkup = clue && clue.text
    ? `<div class="sentence-order-clue" data-clue-source="${escapeHtml(clue.source || "sentence")}" aria-label="排序题目"><span class="sentence-order-clue-label">题目 / Question</span><p class="sentence-order-clue-text" lang="${escapeHtml(clue.lang || "en")}">${escapeHtml(clue.text)}</p></div>`
    : "";
  ui.card.insertAdjacentHTML("beforeend", `<div class="sentence-order-card"><div class="sentence-order-audio-row"><span>听句子后，把单词排成正确顺序</span><button class="audio-button lesson-speak-order" type="button" title="朗读句子" aria-label="朗读句子">${speakerSvg()}<span class="sr-only">朗读句子</span></button></div>${clueMarkup}<div class="sentence-order-answer" aria-live="polite"></div><div class="sentence-order-tiles"></div><button class="primary-button sentence-order-check" type="button" disabled>确定</button></div>`);
  const speaker = ui.card.querySelector(".lesson-speak-order");
  if (speaker) speaker.addEventListener("click", () => playBilingual(question.speech.en, question.speech.zh, speaker));
  const check = ui.card.querySelector(".sentence-order-check");
  if (check) check.addEventListener("click", () => checkSentenceOrder(question));
  drawSentenceOrder(question);
  applyChineseVisibility();
}

function renderWordReviewCard(question) {
  renderQuestionHeader(question);
  const meaning = question.meaning || question.definition;
  ui.card.insertAdjacentHTML("beforeend", `<article class="word-review-card"><button class="word-review-term lesson-speak-review" type="button" lang="en">${escapeHtml(question.term)}</button><button class="audio-button review-audio" type="button" title="朗读单词和释义" aria-label="朗读单词和释义">${speakerSvg()}<span class="sr-only">朗读单词和释义</span></button><p class="word-review-meta">${escapeHtml(question.pos || "")}${question.ipa ? ` · /${escapeHtml(question.ipa)}/` : ""}</p><p class="word-review-definition">${escapeHtml(meaning)}</p>${question.example ? `<p class="word-review-example" lang="en">${escapeHtml(question.example)}</p>` : ""}</article><div class="question-actions"><button class="primary-button review-continue" type="button">开始练习</button></div>`);
  const term = ui.card.querySelector(".lesson-speak-review");
  const audio = ui.card.querySelector(".review-audio");
  if (term) term.addEventListener("click", () => playEnglish(question.term, term));
  if (audio) audio.addEventListener("click", () => playBilingual(question.term, meaning, audio));
  const next = ui.card.querySelector(".review-continue");
  if (next) next.addEventListener("click", () => { current += 1; answered = false; if (current >= questions.length) finishLesson(); else renderQuestion(); });
}

function renderQuestion() {
  stopLessonAudio();
  setTeacherState("idle");
  const question = questions[current];
  ui.progress.textContent = `${current + 1} / ${questions.length}`;
  ui.card.setAttribute("aria-busy", "false");
  if (question.kind === "listen_picture") renderListenPictureQuestion(question);
  else if (question.type === "sentence_order") renderSentenceOrderQuestion(question);
  else if (question.type === "sentence_fill") renderSentenceFillQuestion(question);
  else if (question.type === "word_review") renderWordReviewCard(question);
  else renderChoiceQuestion(question);
  if (question.kind !== "listen_picture") offerVoicePractice(question);
}

function rewardItemCard(item, index) {
  const asset = item.asset ? `<img src="../data/${escapeHtml(item.asset)}" alt="" loading="lazy" onerror="this.hidden=true">` : `<span class="episode-reward-glyph" aria-hidden="true">${escapeHtml(item.glyph || "✨")}</span>`;
  const typeLabels = { decor: "装饰", toy: "玩具", animal: "动物伙伴", weapon: "故事武器", gear: "故事装备" };
  const typeLabel = typeLabels[item.reward_type] || "故事纪念";
  const binding = rewardCore && typeof rewardCore.storyBinding === "function"
    ? rewardCore.storyBinding(rewardCatalog, episode, item.id)
    : item.story_binding;
  const origin = binding && (binding.source_label_zh || binding.source_label_en)
    ? `<small class="episode-reward-origin">来自 ${escapeHtml(binding.source_label_zh || binding.source_label_en)}</small>`
    : "";
  return `<button class="episode-reward-item" type="button" data-reward-item="${escapeHtml(item.id)}" aria-label="选择${escapeHtml(item.title_zh || item.title_en || "奖励")}">
    <span class="episode-reward-art">${asset}</span>
    <span class="episode-reward-name"><strong>${escapeHtml(item.title_zh || item.title_en || "奖励物品")}</strong><small lang="en">${escapeHtml(item.title_en || "Story keepsake")}</small>${origin}<em>${typeLabel}</em></span>
    <span class="episode-reward-number" aria-hidden="true">${index + 1}</span>
  </button>`;
}

function renderEpisodeSticker(item) {
  if (!item || !ui.card) return;
  const shape = String(item.shape || "circle").replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
  const tone = String(item.tone || "jade").replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
  const asset = item.asset
    ? `<img class="episode-sticker-art-image" src="../data/${escapeHtml(item.asset)}" alt="" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="episode-sticker-glyph-fallback" aria-hidden="true" hidden>${escapeHtml(item.glyph || "✨")}</span>`
    : `<span class="episode-sticker-glyph-fallback" aria-hidden="true">${escapeHtml(item.glyph || "✨")}</span>`;
  const section = document.createElement("section");
  section.className = "episode-sticker-reward";
  section.setAttribute("aria-labelledby", "episode-sticker-title");
  section.innerHTML = `<div class="episode-sticker-art sticker-shape-${shape} sticker-tone-${tone}" aria-hidden="true">${asset}<i>贴</i></div><div class="episode-sticker-copy"><span class="episode-reward-kicker">Story sticker · 本关小礼物</span><h3 id="episode-sticker-title">${escapeHtml(item.title_zh || "故事贴纸")} 已收入贴纸册</h3><p>${escapeHtml(item.caption_zh || "把这一关的故事元素收藏起来。")}</p><small>${escapeHtml(item.title_en || "Story sticker")} · 可回驿站查看，不占房间位置</small><a class="episode-sticker-link" href="stickers.html?series=jttw">打开贴纸册</a></div>`;
  ui.card.appendChild(section);
}

function launchRewardConfetti() {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const existing = document.querySelector(".reward-confetti");
  if (existing) existing.remove();
  const layer = document.createElement("div");
  layer.className = "reward-confetti";
  layer.setAttribute("aria-hidden", "true");
  const colors = ["#f7d774", "#8dd8ff", "#f2a7c7", "#b7e39a", "#ffffff"];
  for (let i = 0; i < 28; i += 1) {
    const piece = document.createElement("i");
    piece.style.setProperty("--x", `${(Math.random() * 100).toFixed(2)}vw`);
    piece.style.setProperty("--delay", `${(Math.random() * 0.3).toFixed(2)}s`);
    piece.style.setProperty("--spin", `${Math.round(180 + Math.random() * 540)}deg`);
    piece.style.setProperty("--color", colors[i % colors.length]);
    layer.appendChild(piece);
  }
  document.body.appendChild(layer);
  window.setTimeout(() => layer.remove(), 1800);
}

function renderEpisodeReward(passed) {
  if (!rewardCore || !rewardCatalog || !ui.card || !lesson) return;
  const stickerResult = rewardCore.grantEpisodeSticker(rewardState, {
    episode,
    completed: Boolean(passed),
    catalog: rewardCatalog,
    date: localDay(),
  });
  rewardState = stickerResult.state;
  saveRewardState();
  if (stickerResult.granted) renderEpisodeSticker(stickerResult.item);
  const total = questions.filter((question) => question.scoreable !== false).length;
  const prepared = rewardCore.prepareDrop({
    state: rewardState,
    episode,
    passed,
    catalog: rewardCatalog,
    date: localDay(),
  });
  rewardState = prepared.state;
  saveRewardState();
  if (!prepared.offered) return;
  const section = document.createElement("section");
  section.className = "episode-reward-offer";
  section.setAttribute("aria-labelledby", "episode-reward-title");
  const choiceText = prepared.items.length > 1 ? `${prepared.items.length} 选 1` : "本集纪念";
  section.innerHTML = `<div class="episode-reward-heading"><span class="episode-reward-kicker">Story keepsake · 故事纪念</span><h3 id="episode-reward-title">从花果山带走一件小礼物</h3><p>这是你第一次通过本集巩固，${prepared.items.length > 1 ? "选一件" : "收下一件"}放进小白龙的房间。</p></div><div class="episode-reward-options">${prepared.items.map(rewardItemCard).join("")}</div><p class="episode-reward-status" role="status" aria-live="polite">${choiceText}，选好后会永久保留。</p>`;
  ui.card.appendChild(section);
  section.querySelectorAll("[data-reward-item]").forEach((button) => {
    button.addEventListener("click", () => {
      if (section.classList.contains("is-claimed")) return;
      const result = rewardCore.grantChoice(rewardState, {
        episode,
        itemId: button.dataset.rewardItem,
        catalog: rewardCatalog,
        date: localDay(),
      });
      rewardState = result.state;
      saveRewardState();
      const status = section.querySelector(".episode-reward-status");
      if (!result.granted) {
        if (status) status.textContent = result.reason === "daily_cap" ? "今天的礼物已经领完，明天再来看看。" : "这件礼物已经放进房间了。";
        return;
      }
      section.classList.add("is-claimed");
      section.querySelectorAll("[data-reward-item]").forEach((itemButton) => { itemButton.disabled = true; });
      launchRewardConfetti();
      if (status) status.textContent = `${result.item.title_zh || result.item.title_en} 已放进花果山小屋，随时可以回去看看。`;
      const actions = document.createElement("div");
      actions.className = "episode-reward-actions";
      actions.innerHTML = '<a class="result-link reward-room-link" href="companion.html">去花果山看看</a><span class="episode-reward-tip">也可以直接继续下一集</span>';
      section.appendChild(actions);
    });
  });
}

function renderWordReviewPanel(cards, storyData) {
  if (!ui.review) return 0;
  const storyWords = Array.isArray(storyData && storyData.official_words) ? storyData.official_words : [];
  const selected = sessionWordCards(cards, storyData);
  const sessionTerms = new Set(selected.map((card) => card.payload.term.toLowerCase()));
  const fallback = storyWords
    .filter((item) => item && item.term && item.zh)
    .map((item) => normalizeWordRecord(item, storyWords))
    .filter(Boolean);
  const pool = [...selected];
  for (const item of fallback) {
    if (!sessionTerms.size || sessionTerms.has(item.payload.term.toLowerCase())) {
      if (!pool.some((entry) => entry.payload.term.toLowerCase() === item.payload.term.toLowerCase())) pool.push(item);
    }
    if (pool.length >= 8) break;
  }
  ui.review.innerHTML = "";
  if (!pool.length) {
    if (ui.story && !lessonWordsMode) ui.story.hidden = true;
    return 0;
  }
  if (ui.story) ui.story.hidden = false;
  pool.slice(0, 8).forEach((card) => {
    const review = core.buildWordReviewQuestion(card, episode);
    const item = document.createElement("article");
    item.className = "word-review-item";
    item.dataset.term = review.term;
    const heard = studySession && Array.isArray(studySession.heardWords)
      && studySession.heardWords.some((term) => String(term).toLowerCase() === review.term.toLowerCase());
    if (heard) item.classList.add("is-heard");
    const meaning = review.meaning || review.definition;
    item.innerHTML = `<button class="word-review-term lesson-speak-review" type="button" lang="en">${escapeHtml(review.term)}</button><button class="audio-button review-audio" type="button" title="朗读单词和释义" aria-label="朗读 ${escapeHtml(review.term)} 的单词和释义">${speakerSvg()}<span class="sr-only">朗读 ${escapeHtml(review.term)} 的单词和释义</span></button><p class="word-review-meta">${escapeHtml(review.pos || "重点词")}${review.ipa ? ` · /${escapeHtml(review.ipa)}/` : ""}</p><p class="word-review-definition">${escapeHtml(meaning)}</p><span class="word-study-status">${heard ? "✓ 已听" : "○ 未听"}</span>`;
    const term = item.querySelector(".lesson-speak-review");
    const audio = item.querySelector(".review-audio");
    if (term) term.addEventListener("click", () => { markWordHeard(review.term); playEnglish(review.term, term); });
    if (audio) audio.addEventListener("click", () => { markWordHeard(review.term); playBilingual(review.term, meaning, audio); });
    ui.review.appendChild(item);
  });
  return Math.min(pool.length, 8);
}

function markWordStudyComplete() {
  const completedAt = new Date().toISOString();
  if (studySession) {
    studySession.studyDone = true;
    studySession.studyCompletedAt = completedAt;
    studySession.updatedAt = completedAt;
    writeStudySession(studySession);
  }
  try {
    const state = JSON.parse(localStorage.getItem(WORD_STUDY_KEY) || "{}");
    const next = state && typeof state === "object" ? state : {};
    next[episodeKey] = { done: true, completedAt };
    localStorage.setItem(WORD_STUDY_KEY, JSON.stringify(next));
  } catch (_) {
    // The navigation remains usable even when storage is unavailable.
  }
}

function renderStudyGate() {
  if (!ui.card) return;
  ui.card.hidden = false;
  ui.card.setAttribute("aria-busy", "false");
  ui.card.innerHTML = `<div class="empty-state study-gate"><p class="question-meta">先学单词，再做测验</p><h2>还没完成本集单词学习</h2><p>先认识本集重点词，再回来挑战题目。这样每一道题都会和刚刚学过的词对应。</p><div class="result-actions"><a class="primary-button" href="lesson-words.html?ep=${episode}">进入单词学习</a><a class="result-link" href="shelf.html">回选集</a></div></div>`;
}

function finishLesson(empty = false) {
  stopLessonAudio();
  setTeacherState("idle");
  const scoreTotal = questions.filter((question) => question.scoreable !== false).length;
  const outcome = core && typeof core.evaluateLessonResult === "function"
    ? core.evaluateLessonResult(correct, scoreTotal)
    : { passed: scoreTotal > 0 && correct / scoreTotal >= 0.7, ratio: scoreTotal ? correct / scoreTotal : 0 };
  const passed = !empty && outcome.passed;
  saveCompletion(passed);
  ui.progress.textContent = "已完成";
  const nextHref = core.getNextHref(episode);
  const nextLabel = episode >= 108 ? "回到冒险地图" : `继续第 ${episode + 1} 集`;
  const score = scoreTotal ? `${correct} / ${scoreTotal}` : "完成";
  ui.tip.textContent = passed ? "做得好，今天学到的内容已经保存。" : "再复习一次错题，就能更稳地记住本集内容。";
  ui.card.setAttribute("aria-busy", "false");
  const resultTitle = empty ? "暂无可评分题" : passed ? "这一集掌握得不错" : "还需要再练一次";
  const resultCopy = empty
    ? "未审核题目已自动跳过，你可以安全继续学习。"
    : passed
      ? "通过条件已达成，下一集和故事奖励已经解锁。"
      : `正确率 ${(outcome.ratio * 100).toFixed(0)}%，先复习错题再挑战一次。`;
  const retryHref = `lesson.html?ep=${episode}&retry=1`;
  const nextAction = passed ? `<a class="result-link" href="${nextHref}">${nextLabel}</a>` : `<a class="primary-button" href="${retryHref}">再测一次</a>`;
  ui.card.innerHTML = `<div class="result-state"><p class="question-meta">本集知识巩固${passed ? "完成" : "结果"}</p><div class="result-score">${score}</div><h2>${resultTitle}</h2><p>${resultCopy}</p><div class="result-actions">${nextAction}<a class="result-link" href="parent.html?ep=${episode}">👨‍👩‍👧 亲子时间</a><a class="result-link" href="drill.html?ep=${episode}">复习错题</a><a class="result-link" href="shelf.html">回选集</a></div></div>`;
  renderEpisodeReward(passed);
}

async function start() {
  if (!core) throw new Error("lesson-core.js 未加载");
  if (ui.hint) ui.hint.addEventListener("click", toggleChinese);
  applyChineseVisibility();
  const url = `../data/lesson_guides/${episodeKey}/lesson.json`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`知识巩固数据加载失败：${response.status}`);
  lesson = await response.json();
  try {
    const storyResponse = await fetch(`../data/dialogue_stories/ep${episode}.json`, { cache: "no-store" });
    story = storyResponse.ok ? await storyResponse.json() : {};
  } catch (_) {
    // The lesson guide remains usable when an older offline pack has no story
    // companion; sentence-choice cards still provide a complete fallback.
    story = {};
  }
  rewardCatalog = await loadRewardCatalog();
  rewardState = readRewardState();
  document.title = lessonWordsMode
    ? `豆豆龙英语 · 第 ${episode} 集单词学习`
    : `豆豆龙英语 · 第 ${episode} 集知识巩固`;
  const title = lesson.title || {};
  const titleEn = normalizeSpeechText(title.en || title.zh || `Episode ${episode}`);
  const titleZh = normalizeSpeechText(title.zh || `第 ${episode} 集`);
  ui.title.lang = "en";
  ui.title.textContent = `Episode ${episode} · ${titleEn}`;
  if (ui.titleZh) {
    ui.titleZh.lang = "zh-CN";
    ui.titleZh.textContent = titleZh;
  }
  const introEn = normalizeSpeechText(
    lesson.guide?.en || lesson.intro?.en || lesson.summary?.en || `Let's review the story of ${titleEn}.`
  );
  const introZh = normalizeSpeechText(
    lesson.guide?.zh || lesson.intro?.zh || lesson.summary?.zh || `一起回顾《${titleZh}》的故事。`
  );
  if (ui.introEn) {
    ui.introEn.lang = "en";
    ui.introEn.textContent = introEn;
  }
  if (ui.introZh) {
    ui.introZh.lang = "zh-CN";
    ui.introZh.textContent = introZh;
  }
  if (ui.titleSpeak) {
    ui.titleSpeak.addEventListener("click", () => playBilingual(titleEn, titleZh, ui.titleSpeak));
  }
  if (ui.introSpeak) {
    ui.introSpeak.addEventListener("click", () => playBilingual(introEn, introZh, ui.introSpeak));
  }
  const settings = readSettings();
  const gradeName = { g1_2: "一二年级", g3_4: "三四年级", g5_6: "五六年级" }[settings.gradeBand];
  const intensityName = { light: "轻量", standard: "标准", challenge: "挑战" }[settings.intensity];
  ui.kicker.textContent = lessonWordsMode ? `${gradeName} · 单词学习` : `${gradeName} · ${intensityName}巩固`;
  const cards = Array.isArray(lesson.cards) ? lesson.cards : [];
  studySession = readStudySession();
  const sessionVersion = core && Number.isFinite(Number(core.STUDY_SESSION_VERSION))
    ? Number(core.STUDY_SESSION_VERSION) : 2;
  if (!studySession
      || studySession.version !== sessionVersion
      || studySession.episode !== episode
      || !Array.isArray(studySession.words)
      || !studySession.words.length) {
    studySession = core.createStudySession({
      episode,
      cards,
      storyWords: story && story.official_words,
      settings,
    });
    writeStudySession(studySession);
  }
  if (params.get("retry") === "1" || (!lessonWordsMode && studySession.passed)) resetQuizSession();
  if (lessonWordsMode) {
    const wordCount = renderWordReviewPanel(cards, story);
    if (ui.story) {
      ui.story.hidden = false;
      ui.story.setAttribute("aria-busy", "false");
    }
    if (ui.progress) {
      const heardCount = (studySession.heardWords || []).filter((term) => Array.from(document.querySelectorAll(".word-review-item")).some((item) => String(item.dataset.term || "").toLowerCase() === String(term).toLowerCase())).length;
      ui.progress.textContent = `${heardCount} / ${wordCount} 已听`;
    }
    if (ui.card) ui.card.hidden = true;
    if (ui.wordStudyContinue) {
      ui.wordStudyContinue.href = `lesson.html?ep=${episode}`;
      ui.wordStudyContinue.addEventListener("click", markWordStudyComplete);
    }
    return;
  }
  if (!core.isStudyComplete(studySession, episode)) {
    renderStudyGate();
    return;
  }
  if (ui.slide) {
    ui.slide.src = `../data/lesson_guides/${episodeKey}/assets/slide-001.webp`;
    ui.slide.hidden = false;
    ui.slide.addEventListener("error", () => { ui.slide.hidden = true; }, { once: true });
  }
  const selected = core.selectCards(cards, settings, episode);
  questions = buildQuestions(cards, selected, story, settings, studySession).filter((question) => {
    if (!question) return false;
    if (question.type === "sentence_order") return question.words.length >= 2;
    if (question.type === "sentence_fill" || question.type === "word_choice" || question.type === "sentence_choice") return Array.isArray(question.choices) && question.choices.length >= 2;
    if (question.kind === "listen_picture") return Array.isArray(question.options) && question.options.length >= 2;
    return question.type === "word_review";
  });
  if (!questions.length) {
    finishLesson(true);
    return;
  }
  restoreQuizPosition();
  if (current >= questions.length) return;
  renderQuestion();
}

start().catch((error) => {
  if (ui.card) ui.card.hidden = false;
  ui.card.setAttribute("aria-busy", "false");
  ui.card.innerHTML = `<div class="empty-state"><h2>本集知识巩固暂时无法打开</h2><p>${escapeHtml(error.message)}</p><div class="result-actions"><button class="primary-button" type="button" id="lesson-retry">重新加载</button><a class="result-link" href="shelf.html">回选集</a></div></div>`;
  const retry = document.getElementById("lesson-retry");
  if (retry) retry.addEventListener("click", () => window.location.reload());
});
