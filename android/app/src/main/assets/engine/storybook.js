"use strict";

const WB_KEY = "bookplay_wordbook";
const PROG_KEY = "bookplay_story_progress";
const STORYBOOK_REWARD_KEY = "bookplay_storybook_rewards_v1";
const SP_KEY = "bookplay_sp";
const VSTAT_KEY = "bookplay_adv_vocab_stat";

const $ = (id) => document.getElementById(id);
const pageImg = $("sb-page");
const spriteImg = $("sb-sprite");
const portraitImg = $("sb-portrait");
const speakerEl = $("sb-speaker");
const modeEl = $("sb-mode");
const dialogueEl = $("sb-dialogue");
const textEl = $("sb-text");
const glossEl = $("sb-glossary");
const choiceEl = $("sb-choice");
const pager = $("sb-pager");
const reviewEl = $("sb-review");
const quizEl = $("sb-quiz");
const endNav = $("sb-endnav");
const audio = $("sb-audio");
const btnAudio = $("btn-audio");
const btnPrev = $("btn-prev");
const btnNext = $("btn-next");
const titleEl = $("chapter-label");
const readerModesEl = $("sb-reader-modes");
const unitProgressEl = $("sb-unit-progress");
const speakerChipEl = $("sb-speaker-chip");
const translationToggleEl = $("sb-translation-toggle");
const zhEl = $("sb-zh");
const readerNoticeEl = $("sb-reader-notice");
const readerNoticeTextEl = $("sb-reader-notice-text");
const readerNoticeActionEl = $("sb-reader-notice-action");

let feedbackEl = $("sb-feedback");
if (!feedbackEl) {
  feedbackEl = document.createElement("p");
  feedbackEl.id = "sb-feedback";
  feedbackEl.className = "sb-feedback";
  feedbackEl.setAttribute("aria-live", "polite");
  glossEl.after(feedbackEl);
}
function sayFeedback(message) {
  feedbackEl.textContent = message;
}

const request = BookPlayStorybookRoute.resolveStorybookRequest(location.search);
const ep = request.id;
const progressKey = request.progressKey;
const STORY_UNIT_ZH = request.series === "minecraft" || request.series === "mikey-jj" ? "本" : "集";

if (request.uiVariant === "unified-v3") document.body.classList.add("sb-ui-v3");

let book = null;
let mikeyVocabAudio = null;
let minecraftVocabAudio = null;
let minecraftQuizAudio = null;
let mikeyQuizAudio = null;
let idx = 0;
let beats = [];
let bidx = 0;
let seeking = false;
let holding = false;
let sentIdx = 0;            // 句级模式：当前页内句索引
let quizOpen = false;       // Minecraft 全屏测验
let quizIndex = 0;
let reviewOpen = false;
let practiceResultOpen = false;
let practiceState = null;
let captionLabelEl = null;
let zhLineEl = null;
const studyReplayState = typeof BookPlayStudyReplayState !== "undefined" ? BookPlayStudyReplayState : null;
const studyReplayQueue = typeof BookPlayStudyReplayQueue !== "undefined" ? BookPlayStudyReplayQueue : null;
const wordTokenAudio = typeof BookPlayWordTokenAudio !== "undefined" ? BookPlayWordTokenAudio : null;
const episodeVocabQuiz = typeof BookPlayEpisodeVocabQuiz !== "undefined" ? BookPlayEpisodeVocabQuiz : null;
const studyReplayButton = $("btn-study-replay");
const studyReplaySkipButton = $("btn-study-skip");
let replayScenes = [];
let replayQueue = [];
let replaySceneIndex = -1;
let studyReplayActive = false;
let studyReplayReturn = null;
let episodeFullComplete = false;
let activeQuiz = [];
let quizQuestionOverride = null;
let quizRecoveryCount = 0;
let quizRecoveryTimer = 0;
let storybookRewardCatalog = null;
let storybookRewardState = {};
let storybookAssetManifest = null;
let completionCardData = null;
let publishedBookIds = null;

const readerState = {
  mode: "study",
  translation: true,
  audioUnlocked: false,
  autoAdvancePending: false,
};

function normalizeVocabTerm(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function runtimeAssetUrl(value) {
  if (!value) return null;
  const path = String(value).replace(/\\/g, "/").replace(/^prj\//, "");
  if (/^(?:https?:|data:|blob:|\/|\.\.\/)/i.test(path)) return path;
  return `../${path}`;
}

function currentVocabAudioIndex() {
  if (request.series === "mikey-jj") return mikeyVocabAudio;
  if (request.series === "minecraft") return minecraftVocabAudio;
  return null;
}

function vocabEntryFor(term) {
  const index = currentVocabAudioIndex();
  const key = normalizeVocabTerm(term);
  if (!index || !key) return null;
  const buckets = [index.terms, index.phrases].filter((bucket) => bucket && typeof bucket === "object");
  for (const bucket of buckets) {
    const match = bucket[key]
      || Object.entries(bucket).find(([candidate]) => normalizeVocabTerm(candidate) === key)?.[1];
    if (match) return match;
  }
  return null;
}

function staticVocabAudio(term, lang) {
  const quizAudio = request.series === "minecraft" ? minecraftQuizAudio
    : request.series === "mikey-jj" ? mikeyQuizAudio : null;
  if (quizAudio && quizAudio.text_audio) {
    const bucket = String(lang || "").startsWith("zh") ? quizAudio.text_audio.zh : quizAudio.text_audio.en;
    const quizPath = bucket && bucket[normalizeVocabTerm(term)];
    if (quizPath) return runtimeAssetUrl(quizPath);
  }
  const index = currentVocabAudioIndex();
  if (!index) return null;
  const key = normalizeVocabTerm(term);
  if (!key) return null;
  const isChinese = String(lang || "").startsWith("zh");
  if (isChinese && index.definitions) {
    const definitions = index.definitions;
    const directDefinition = definitions[key];
    const matchedDefinition = directDefinition || Object.entries(definitions)
      .find(([definition]) => normalizeVocabTerm(definition) === key);
    const definitionPath = Array.isArray(matchedDefinition) ? matchedDefinition[1] : matchedDefinition;
    if (definitionPath) return runtimeAssetUrl(definitionPath);
  }
  const buckets = [index.terms, index.phrases].filter((bucket) => bucket && typeof bucket === "object");
  for (const terms of buckets) {
    const direct = isChinese ? null : terms[key];
    const fallback = direct || Object.entries(terms).find(([candidate, candidateEntry]) => {
      if (normalizeVocabTerm(candidate) === key) return true;
      return isChinese && (normalizeVocabTerm(candidateEntry && candidateEntry.zh) === key
        || (candidateEntry && candidateEntry.audio_zh_variants || [])
          .some((variant) => normalizeVocabTerm(variant.zh) === key));
    });
    const entry = Array.isArray(fallback) ? fallback[1] : fallback;
    if (!entry) continue;
    const path = typeof entry === "string"
      ? entry
      : (String(lang || "").startsWith("zh") ? entry.audio_zh : entry.audio_en);
    if (path) return runtimeAssetUrl(path);
  }
  return null;
}

const QUIZ_LETTERS = ["A", "B", "C", "D", "E"];

function pageSentences(page) {
  const list = (page && page.sentences) || [];
  return list.length ? list : null;
}

function useSentenceMode() {
  return !useBeats() && (request.series === "minecraft" || request.series === "mikey-jj") && pageSentences(book && book.pages[idx]) != null;
}

function sentenceClip(sen) {
  return sen && sen.audio ? `../${sen.audio}` : null;
}

function publishedCatalogUrl() {
  if (request.series === "minecraft") return "../data/storybooks-minecraft/catalog.json";
  if (request.series === "mikey-jj") return "../data/storybooks-mikey-jj/catalog.json";
  return null;
}

async function loadPublishedBookIds() {
  const url = publishedCatalogUrl();
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const payload = await response.json();
    const ids = Array.isArray(payload && payload.episodes)
      ? payload.episodes
        .map((item) => Number(item && (item.book ?? item.episode)))
        .filter((value) => Number.isInteger(value) && value > 0)
      : [];
    publishedBookIds = [...new Set(ids)].sort((a, b) => a - b);
    return publishedBookIds;
  } catch (_) {
    return null;
  }
}

function nextPublishedBookId(currentId) {
  const ids = Array.isArray(publishedBookIds) ? publishedBookIds : [];
  const current = Number(currentId);
  const next = ids.find((value) => value > current);
  if (next) return next;
  // Keep a compatibility fallback for older packs that predate catalog
  // episodes. New catalogs always take the non-contiguous published path.
  if (!ids.length && Number.isInteger(current) && current > 0
    && Number.isInteger(Number(book && book.series_count))
    && current < Number(book.series_count)) return current + 1;
  return null;
}

let currentClipSrc = null;

function useBeats() {
  return false;
}

function flattenBeats() {
  const out = [];
  book.scenes.forEach((scene, si) => {
    const list = scene.beats || [];
    list.forEach((beat, bi) => {
      out.push({
        ...beat,
        scene,
        sceneIdx: si,
        localIdx: bi,
        lastInScene: bi === list.length - 1,
      });
    });
  });
  return out;
}

function current() {
  return beats[bidx];
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function loadWordbook() {
  try { return JSON.parse(localStorage.getItem(WB_KEY) || "[]"); } catch (_) { return []; }
}

function saveWord(term, zh) {
  const items = loadWordbook();
  if (items.some((w) => w.term.toLowerCase() === term.toLowerCase())) return;
  items.push({ term, zh, ep, series: request.series });
  localStorage.setItem(WB_KEY, JSON.stringify(items));
}

function loadProgress() {
  try { return JSON.parse(localStorage.getItem(PROG_KEY) || "{}"); } catch (_) { return {}; }
}

function episodeStudyContract() {
  if (!book) return { series: request.series, episode: progressKey, sceneIds: [], targetTerms: [] };
  const sceneIds = replayScenes.length
    ? replayScenes.map((scene, index) => String(scene && (scene.id || `scene-${index + 1}`)))
    : Array.isArray(book.scenes) && book.scenes.length
    ? book.scenes.map((scene, index) => String(scene && (scene.id || `scene-${index + 1}`)))
    : (book.pages || []).flatMap((page, pageIndex) => {
      const sentences = Array.isArray(page && page.sentences) ? page.sentences : [];
      return sentences.length
        ? sentences.map((sentence, sentenceIndex) => String(sentence && (sentence.id || `p${pageIndex + 1}-s${sentenceIndex + 1}`)))
        : [`p${pageIndex + 1}`];
    });
  const targetTerms = (book.pages || []).flatMap((page) => {
    const sentences = Array.isArray(page && page.sentences) ? page.sentences : [page];
    return sentences.flatMap((sentence) => (sentence && Array.isArray(sentence.glossary) ? sentence.glossary : []))
      .map((entry) => entry && entry.term);
  });
  return { series: request.series, episode: progressKey, sceneIds, targetTerms };
}

function setupStudyReplayQueue() {
  if (!studyReplayQueue || !book) return;
  replayScenes = Array.isArray(book.replay_scenes) && book.replay_scenes.length
    ? book.replay_scenes
    : studyReplayQueue.deriveScenes(book, { maxNodes: 4 });
  replayQueue = studyReplayQueue.buildReplayQueue(replayScenes);
}

function readEpisodeQuizSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem("bookplay_lesson_settings_v1") || "{}");
    const gradeBand = raw && raw.gradeBand;
    return {
      grade: gradeBand === "g1_2" ? 1 : gradeBand === "g5_6" ? 6 : 4,
      intensity: raw && ["light", "standard", "challenge"].includes(raw.intensity) ? raw.intensity : "standard",
    };
  } catch (_) {
    return { grade: 4, intensity: "standard" };
  }
}

function quizQuestionHasAuthoredEvidence(question) {
  if (!question || typeof question !== "object") return false;
  return Boolean(
    question.term
    || question.source_sentence_id
    || (Array.isArray(question.source_sentence_ids) && question.source_sentence_ids.length)
    || question.scene_id
    || question.concept_id
  );
}

function prepareEpisodeQuiz() {
  const authored = Array.isArray(book && book.quiz) ? book.quiz : [];
  if (request.series !== "minecraft" && request.series !== "mikey-jj") {
    activeQuiz = authored;
    return;
  }
  if (!episodeVocabQuiz) {
    activeQuiz = authored;
    return;
  }
  const targetTerms = (book && Array.isArray(book.pages) ? book.pages : []).flatMap((page) => {
    const sentences = Array.isArray(page && page.sentences) ? page.sentences : [page];
    return sentences.flatMap((sentence) => (sentence && Array.isArray(sentence.glossary) ? sentence.glossary : []));
  });
  const evidenceByTerm = new Map();
  (book && Array.isArray(book.pages) ? book.pages : []).forEach((page) => {
    const sentences = Array.isArray(page && page.sentences) ? page.sentences : [page];
    sentences.forEach((sentence) => {
      (sentence && Array.isArray(sentence.glossary) ? sentence.glossary : []).forEach((entry) => {
        const key = normalizeVocabTerm(entry && entry.term);
        if (key && !evidenceByTerm.has(key)) evidenceByTerm.set(key, {
          source_sentence_id: sentence.id || "",
          audio: sentence.audio || null,
          source_text_en: sentence.text_en || "",
        });
      });
    });
  });
  const termPool = targetTerms.map((entry) => entry && entry.term).filter(Boolean);
  const enriched = authored.map((question) => {
    const term = quizQuestionHasAuthoredEvidence(question)
      ? normalizeVocabTerm(question.term)
      : episodeVocabQuiz.questionTerm(question, { targetTerms: termPool });
    const evidence = evidenceByTerm.get(normalizeVocabTerm(term));
    return {
      ...question,
      ...(term && !question.term ? { term } : {}),
      ...(evidence && !question.source_sentence_id ? { source_sentence_id: evidence.source_sentence_id } : {}),
      ...(evidence && !question.audio ? { audio: evidence.audio } : {}),
      ...(evidence && !question.source_text_en ? { source_text_en: evidence.source_text_en } : {}),
    };
  });
  const settings = readEpisodeQuizSettings();
  activeQuiz = episodeVocabQuiz.buildEpisodeQuiz(enriched, {
    ...settings,
    seed: `${request.series}:${ep}`,
    targetTerms: termPool,
  });
}

function quizQuestions() {
  if (Array.isArray(quizQuestionOverride)) return quizQuestionOverride;
  return activeQuiz.length ? activeQuiz : (book && Array.isArray(book.quiz) ? book.quiz : []);
}

function replaySentenceIds(scene) {
  return Array.isArray(scene && scene.sentence_ids) ? scene.sentence_ids.map(String) : [];
}

function locateSentence(sentenceId) {
  const wanted = String(sentenceId || "");
  for (let pageIndex = 0; pageIndex < (book && book.pages ? book.pages.length : 0); pageIndex += 1) {
    const sentences = pageSentences(book.pages[pageIndex]);
    if (!sentences) continue;
    const sentenceIndex = sentences.findIndex((sentence, index) => String(sentence && (sentence.id || `p${pageIndex + 1}-s${index + 1}`)) === wanted);
    if (sentenceIndex >= 0) return { pageIndex, sentenceIndex };
  }
  return null;
}

function currentSentenceNode() {
  const sentences = pageSentences(book && book.pages[idx]);
  return sentences ? sentences[sentIdx] || null : null;
}

function renderStudyReplayControls() {
  if (!studyReplayButton || !studyReplaySkipButton) return;
  const canReplay = !studyReplayActive && episodeFullComplete && replayQueue.length > 0;
  studyReplayButton.hidden = !canReplay;
  studyReplaySkipButton.hidden = !studyReplayActive;
  if (studyReplayActive) endNav.classList.remove("hidden");
}

function showStudyReplayOffer() {
  renderStudyReplayControls();
  endNav.classList.remove("hidden");
  if (replayQueue.length) {
    sayFeedback(`本${STORY_UNIT_ZH}看完了。共有 ${replayQueue.length} 个小节可以精学回放。`);
  }
}

function finishStudyReplay() {
  const returnFlow = studyReplayReturn;
  studyReplayReturn = null;
  studyReplayActive = false;
  replaySceneIndex = -1;
  if (!returnFlow) {
    updateStudyProgress((record) => {
      const next = studyReplayState.normalizeEpisodeState(record, episodeStudyContract());
      next.study_replay.completed = true;
      return next;
    });
  }
  renderStudyReplayControls();
  if (returnFlow && returnFlow.kind === "quiz-retry") {
    replayQueue = Array.isArray(returnFlow.queue) ? returnFlow.queue : replayQueue;
    startPracticeQuiz(returnFlow.questions, { resetRecovery: false });
    sayFeedback("错题小节复习完成，重新挑战这些题。");
    return;
  }
  if (request.series === "minecraft" || request.series === "mikey-jj") {
    if (isUnifiedV3()) openReview();
    else openQuiz();
  }
}

function playReplayScene(sceneIndex) {
  const scene = replayQueue[sceneIndex];
  if (!scene) { finishStudyReplay(); return; }
  const first = locateSentence(replaySentenceIds(scene)[0]);
  if (!first) {
    updateStudyProgress((record) => studyReplayState.markSceneSkipped(record, scene.id, episodeStudyContract()));
    playReplayScene(sceneIndex + 1);
    return;
  }
  replaySceneIndex = sceneIndex;
  idx = first.pageIndex;
  sentIdx = first.sentenceIndex;
  render();
  seekToUnit();
  renderStudyReplayControls();
  if (speakable() || useSentenceMode()) playCurrentSentence();
}

function startStudyReplay({ queue = null } = {}) {
  if (!Array.isArray(queue)) studyReplayReturn = null;
  if (Array.isArray(queue)) replayQueue = queue;
  if (!replayQueue.length) { openQuiz(); return; }
  stopAllSpeaking();
  studyReplayActive = true;
  playReplayScene(0);
  sayFeedback("精学回放开始：先听原句，再学习本节重点词。");
  if (studyReplaySkipButton) studyReplaySkipButton.focus();
}

function skipStudyScene() {
  if (!studyReplayActive || replaySceneIndex < 0) return;
  const scene = replayQueue[replaySceneIndex];
  updateStudyProgress((record) => studyReplayState.markSceneSkipped(record, scene.id, episodeStudyContract()));
  playReplayScene(replaySceneIndex + 1);
}

function currentProgressRecord(map = loadProgress()) {
  return map[progressKey] || (request.series === "jttw" ? map[ep] : null) || {};
}

function updateStudyProgress(mutator) {
  if (!studyReplayState || typeof mutator !== "function") return null;
  const map = loadProgress();
  const next = mutator(studyReplayState.normalizeEpisodeState(currentProgressRecord(map), episodeStudyContract()));
  if (!next) return null;
  map[progressKey] = next;
  localStorage.setItem(PROG_KEY, JSON.stringify(map));
  return next;
}

function readJsonStorage(key, fallback = {}) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "");
    return value && typeof value === "object" ? value : fallback;
  } catch (_) {
    return fallback;
  }
}

function writeJsonStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* offline/private mode */ }
}

function readVocabStats() {
  return readJsonStorage(VSTAT_KEY, {});
}

function recordVocabAnswer(term, correct) {
  const key = normalizeVocabTerm(term);
  if (!key) return;
  const stats = readVocabStats();
  const previous = stats[key] && typeof stats[key] === "object" ? stats[key] : {};
  stats[key] = {
    ...previous,
    seen: Math.max(0, Number(previous.seen) || 0) + 1,
    right: Math.max(0, Number(previous.right) || 0) + (correct ? 1 : 0),
    wrong: Math.max(0, Number(previous.wrong) || 0) + (correct ? 0 : 1),
    last_seen_at: new Date().toISOString(),
  };
  writeJsonStorage(VSTAT_KEY, stats);
}

function vocabProgress() {
  const record = studyReplayState
    ? studyReplayState.normalizeEpisodeState(currentProgressRecord(), episodeStudyContract())
    : currentProgressRecord();
  const target = [...new Set((episodeStudyContract().targetTerms || []).map(normalizeVocabTerm).filter(Boolean))];
  const vocab = record.vocab || {};
  const learned = (vocab.seen_terms || []).filter((term) => !target.length || target.includes(normalizeVocabTerm(term)));
  const mastered = (vocab.mastered_terms || []).filter((term) => !target.length || target.includes(normalizeVocabTerm(term)));
  return {
    targetTerms: target,
    learnedTerms: [...new Set(learned.map(normalizeVocabTerm))],
    masteredTerms: [...new Set(mastered.map(normalizeVocabTerm))],
    wrongTerms: [...new Set((vocab.wrong_terms || []).map(normalizeVocabTerm))],
  };
}

function recordQuizAnswer(question, correct) {
  if (!question) return;
  const term = question.term || "";
  if (studyReplayState && term) {
    updateStudyProgress((record) => studyReplayState.recordQuizTerm(record, term, correct, episodeStudyContract()));
  }
  recordVocabAnswer(term, correct);
}

function saveQuizResult(summary) {
  if (!summary) return;
  const wrongTerms = (practiceState && Array.isArray(practiceState.questions) ? practiceState.questions : [])
    .filter((question) => summary.wrongIds.includes(question.id))
    .map((question) => question.term)
    .filter(Boolean);
  if (studyReplayState) {
    updateStudyProgress((record) => studyReplayState.recordQuiz(record, {
      score: summary.total ? summary.correct / summary.total : 0,
      passed: summary.total > 0 && summary.correct / summary.total >= 0.7,
      wrongTerms,
    }, episodeStudyContract()));
  }
}

function readStorybookRewardState() {
  const all = readJsonStorage(STORYBOOK_REWARD_KEY, {});
  const state = all[request.series] && typeof all[request.series] === "object" ? all[request.series] : {};
  return window.BookPlayEpisodeReward ? window.BookPlayEpisodeReward.normalizeState(state) : state;
}

function saveStorybookRewardState() {
  const all = readJsonStorage(STORYBOOK_REWARD_KEY, {});
  all[request.series] = storybookRewardState;
  writeJsonStorage(STORYBOOK_REWARD_KEY, all);
}

function grantStorybookSP(amount) {
  const current = Number.parseInt(localStorage.getItem(SP_KEY) || "0", 10) || 0;
  const next = current + Math.max(0, Number(amount) || 0);
  localStorage.setItem(SP_KEY, String(next));
  return next;
}

async function loadStorybookRewardCatalog() {
  if (!window.BookPlayEpisodeReward) return null;
  try {
    const response = await fetch("../data/rewards/storybooks.json", { cache: "no-store" });
    if (!response.ok) return null;
    const payload = await response.json();
    const catalog = payload && payload.storybooks && payload.storybooks[request.series];
    return catalog && typeof catalog === "object" ? catalog : null;
  } catch (_) {
    return null;
  }
}

async function loadStorybookAssetManifest() {
  try {
    const url = `../assets/generated/storybooks/${request.series}/ep${String(ep).padStart(3, "0")}/manifest.json`;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const payload = await response.json();
    return payload && Array.isArray(payload.assets) ? payload : null;
  } catch (_) {
    return null;
  }
}

function saveProgress(done = false) {
  const map = loadProgress();
  const prev = currentProgressRecord(map);
  const next = {
    ...prev,
    page: useBeats() ? (current() && current().page_no) || 1 : idx + 1,
    beat: useBeats() ? bidx + 1 : undefined,
    done: Boolean(done || prev.done),
    choices: prev.choices || {},
    ...(prev.practice ? { practice: prev.practice } : {}),
    updated_at: new Date().toISOString(),
  };
  map[progressKey] = studyReplayState
    ? studyReplayState.normalizeEpisodeState(next, episodeStudyContract())
    : next;
  localStorage.setItem(PROG_KEY, JSON.stringify(map));
}

function isUnifiedV3() {
  return request.uiVariant === "unified-v3";
}

function preferenceStorage() {
  try { return window.localStorage; } catch (_) { return null; }
}

function setReaderNotice(message, { action = false } = {}) {
  if (!readerNoticeEl || !readerNoticeTextEl) return;
  readerNoticeTextEl.textContent = message || "";
  readerNoticeEl.hidden = !message;
  if (readerNoticeActionEl) readerNoticeActionEl.hidden = !action;
}

function clearReaderNotice() {
  if (!readerNoticeEl) return;
  readerNoticeEl.hidden = true;
  if (readerNoticeActionEl) readerNoticeActionEl.hidden = true;
  if (readerNoticeTextEl) readerNoticeTextEl.textContent = "";
}

function renderReaderModes() {
  if (!readerModesEl) return;
  const visible = isUnifiedV3() && (request.series === "minecraft" || request.series === "mikey-jj");
  readerModesEl.hidden = !visible;
  readerModesEl.querySelectorAll("[data-reader-mode]").forEach((button) => {
    const active = button.dataset.readerMode === readerState.mode;
    button.setAttribute("aria-pressed", String(active));
  });
}

function setReaderMode(requestedMode) {
  const next = BookPlayStorybookUI.resolveReaderMode(request.series, requestedMode);
  if (next === readerState.mode) return;
  readerState.mode = next;
  readerState.autoAdvancePending = false;
  invalidateNavigation();
  renderReaderModes();
  if (isUnifiedV3()) {
    BookPlayStorybookUI.writePreferences(preferenceStorage(), request.series, {
      mode: readerState.mode,
      translation: readerState.translation,
    });
  }
  render();
}

function updateReaderHeader(page, sentence) {
  if (unitProgressEl) {
    const sentences = pageSentences(page);
    let label = BookPlayStorybookUI.formatUnitProgress({
      page: page && page.page_no != null ? page.page_no : idx + 1,
      pages: book && book.pages ? book.pages.length : 0,
      sentence: sentences ? sentIdx + 1 : undefined,
      sentences: sentences ? sentences.length : undefined,
    });
    const band = sentencePanelBand(page, sentence);
    if (band) label += band[0] < (page.panel[1] + page.panel[2]) / 2 ? " · 上半" : " · 下半";
    unitProgressEl.textContent = label;
  }
  if (speakerChipEl) {
    const speaker = sentence && sentence.speaker;
    const label = speaker && (speaker.label || speaker.id);
    speakerChipEl.hidden = !label;
    speakerChipEl.textContent = label || "";
    if (speaker && speaker.id) speakerChipEl.dataset.speaker = speaker.id;
    else speakerChipEl.removeAttribute("data-speaker");
  }
  if (translationToggleEl) {
    const hasTranslation = Boolean(sentence && typeof sentence.zh === "string" && sentence.zh.trim());
    translationToggleEl.hidden = !hasTranslation;
    translationToggleEl.setAttribute("aria-pressed", String(readerState.translation));
  }
  if (zhEl) {
    const translation = sentence && typeof sentence.zh === "string" ? sentence.zh.trim() : "";
    zhEl.textContent = translation;
    zhEl.hidden = !BookPlayStorybookUI.shouldShowTranslation({
      zh: translation,
      preference: readerState.translation,
    });
  }
}

function showAutoplayUnlockNotice() {
  if (isUnifiedV3()) {
    if (unlockBtn) unlockBtn.hidden = true;
    setReaderNotice("浏览器需要一次点击才能开始有声阅读。", { action: true });
    return;
  }
  if (unlockBtn) unlockBtn.hidden = false;
}

function markAudioUnlocked() {
  readerState.audioUnlocked = true;
  playbackState.unlockRequired = false;
  clearReaderNotice();
  if (unlockBtn) unlockBtn.hidden = true;
}

function choiceKey(id) {
  return String(id);
}

function savedChoice(id) {
  const map = loadProgress();
  const rec = map[progressKey] || (request.series === "jttw" ? map[ep] : null) || {};
  return (rec.choices || {})[choiceKey(id)] || null;
}

function saveChoice(id, optionId) {
  const map = loadProgress();
  const rec = map[progressKey] || (request.series === "jttw" ? map[ep] : null) || { page: 1, done: false, choices: {} };
  rec.choices = rec.choices || {};
  rec.choices[choiceKey(id)] = optionId;
  rec.updated_at = new Date().toISOString();
  map[progressKey] = rec;
  localStorage.setItem(PROG_KEY, JSON.stringify(map));
}

function highlight(text, glossary) {
  let html = escapeHtml(text).replace(/\n/g, "<br>");
  const terms = [...(glossary || [])].sort((a, b) => b.term.length - a.term.length);
  for (const g of terms) {
    const re = new RegExp(`\\b(${g.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\\b`, "gi");
    html = html.replace(re, `<mark data-term="${escapeHtml(g.term)}" data-zh="${escapeHtml(g.zh)}">$1</mark>`);
  }
  return html;
}

function tokenizeCaptionWords(text) {
  if (wordTokenAudio) return wordTokenAudio.tokenizeCaptionWords(text);
  const parts = [];
  const re = /[^\s]+|\s+/g;
  let m;
  while ((m = re.exec(text || ""))) {
    parts.push({ type: /^\s+$/.test(m[0]) ? "space" : "word", text: m[0] });
  }
  return parts;
}

function bareSpeakWord(text) {
  if (wordTokenAudio) return wordTokenAudio.cleanWord(text);
  return String(text || "").replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "");
}

function glossaryForWord(word, glossary) {
  const bare = bareSpeakWord(word).toLowerCase();
  if (!bare) return null;
  const terms = [...(glossary || [])].sort((a, b) => (b.term || "").length - (a.term || "").length);
  return terms.find((g) => {
    const t = String(g.term || "").toLowerCase();
    return t === bare || t.split(/\s+/).includes(bare);
  }) || null;
}

function bindSentenceWordTaps() {
  textEl.querySelectorAll(".sb-sentence-word").forEach((node) => {
    const speak = () => {
      const term = node.dataset.speak;
      const zh = node.dataset.zh || "";
      if (!term) return;
      const mark = node.querySelector("mark");
      if (mark && mark.dataset.term) {
        sayFeedback(`${mark.dataset.term} — ${mark.dataset.zh || ""}（已收入生词本）`);
        saveWord(mark.dataset.term, mark.dataset.zh || "");
      }
      if (studyReplayState) {
        updateStudyProgress((record) => studyReplayState.markTermSeen(record, term, episodeStudyContract()));
      }
      speakGlossaryWord(term, zh, node);
    };
    node.addEventListener("click", (ev) => {
      ev.stopPropagation();
      speak();
    });
    node.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      ev.preventDefault();
      ev.stopPropagation();
      speak();
    });
  });
}

function renderSentenceCaption(text, glossary) {
  const tokens = tokenizeCaptionWords(text);
  let wi = 0;
  textEl.innerHTML = tokens.map((tok) => {
    if (tok.type === "space") return tok.text.replace(/\n/g, "<br>");
    const g = glossaryForWord(tok.text, glossary);
    const speak = bareSpeakWord(tok.text) || tok.text;
    const vocab = vocabEntryFor(speak);
    const zh = g && g.zh ? g.zh : (vocab && vocab.zh ? vocab.zh : "");
    const reviewed = g || (vocab && vocab.zh ? { term: vocab.term, zh: vocab.zh } : null);
    const inner = reviewed
      ? `<mark data-term="${escapeHtml(reviewed.term)}" data-zh="${escapeHtml(reviewed.zh || "")}">${escapeHtml(tok.text)}</mark>`
      : escapeHtml(tok.text);
    const label = zh ? `朗读 ${speak}，${zh}` : `朗读 ${speak}`;
    const staticAttr = vocab && vocab.audio_en ? ' data-static-audio="true"' : "";
    const definitionAttr = zh ? ' data-has-definition="true"' : "";
    const html = `<span class="sb-sentence-word" role="button" tabindex="0" data-i="${wi}" data-speak="${escapeHtml(speak)}" data-zh="${escapeHtml(zh)}"${staticAttr}${definitionAttr} aria-label="${escapeHtml(label)}">${inner}</span>`;
    wi += 1;
    return html;
  }).join("");
  textEl.querySelectorAll(".sb-sentence-word").forEach((node) => {
    if (node.dataset.staticAudio === "true") node.classList.add("has-static-audio");
    if (node.dataset.hasDefinition === "true") node.classList.add("has-definition");
  });
  bindSentenceWordTaps();
}

function syncSentenceWordHighlight(tSec) {
  if ((request.series !== "minecraft" && request.series !== "mikey-jj") || !useSentenceMode()) return;
  const words = textEl.querySelectorAll(".sb-sentence-word");
  if (!words.length) return;
  const dur = Math.max(0.05, audio.duration || 1);
  const sentence = book && book.pages[idx] && book.pages[idx].sentences
    ? book.pages[idx].sentences[sentIdx]
    : null;
  const i = BookPlayStorybookUI.wordHighlightIndex({
    currentMs: Math.max(0, Number(tSec) || 0) * 1000,
    durationMs: dur * 1000,
    timings: sentence && Array.isArray(sentence.words) ? sentence.words : [],
    wordCount: words.length,
  });
  words.forEach((node) => {
    const wi = Number(node.dataset.i);
    node.classList.toggle("is-word-active", wi === i);
    node.classList.toggle("is-word-done", i >= words.length ? true : wi < i);
    node.classList.toggle("is-word-wait", i < 0 || (i < words.length && wi > i));
  });
}

function clearSentenceWordHighlight() {
  textEl.querySelectorAll(".sb-sentence-word").forEach((node) => {
    node.classList.remove("is-word-active", "is-word-done", "is-word-wait");
  });
}

function setTalking(on) {
  portraitImg.classList.toggle("talk", on);
  spriteImg.classList.toggle("talk", on);
  if (current() && current().scene.sprite) {
    spriteImg.src = `../${current().scene.sprite.replace("idle.png", on ? "talk.png" : "idle.png")}`;
  }
}

function renderChoiceFor(choice, key) {
  if (!choice || !(choice.options || []).length) {
    choiceEl.classList.add("hidden");
    choiceEl.innerHTML = "";
    return;
  }
  choiceEl.classList.remove("hidden");
  const picked = savedChoice(key);
  const pickedOpt = (choice.options || []).find((o) => o.id === picked);
  choiceEl.innerHTML = "";
  const prompt = document.createElement("p");
  prompt.className = "prompt";
  prompt.textContent = choice.prompt || "";
  choiceEl.appendChild(prompt);
  if (choice.prompt_zh) {
    const zh = document.createElement("p");
    zh.className = "prompt-zh";
    zh.textContent = choice.prompt_zh;
    choiceEl.appendChild(zh);
  }
  choice.options.forEach((opt) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = `${opt.en} ${opt.zh ? `· ${opt.zh}` : ""}`;
    if (picked === opt.id) b.style.borderColor = "#7dcea0";
    b.disabled = Boolean(picked);
    b.addEventListener("click", () => {
      saveChoice(key, opt.id);
      renderChoiceFor(choice, key);
    });
    choiceEl.appendChild(b);
  });
  if (pickedOpt) {
    const reply = document.createElement("p");
    reply.className = "reply";
    reply.textContent = pickedOpt.reply;
    choiceEl.appendChild(reply);
  }
}

function renderBeat() {
  const beat = current();
  const scene = beat.scene;
  pageImg.src = `../${beat.image}`;
  pageImg.alt = `${scene.title.zh} ${beat.id}`;
  pageImg.classList.toggle("clip", scene.mode === "clip" || scene.mode === "hybrid");
  const modeName = { clip: "短片拍", hybrid: "场景+头像", sprite: "立绘" }[scene.mode] || scene.mode;
  modeEl.textContent = `${scene.title.zh} · ${modeName}`;
  if (scene.sprite) {
    spriteImg.classList.remove("hidden");
    spriteImg.src = `../${scene.sprite}`;
  } else {
    spriteImg.classList.add("hidden");
    spriteImg.removeAttribute("src");
  }
  dialogueEl.classList.remove("no-portrait");
  $("sb-portrait-wrap").classList.remove("hidden");
  portraitImg.src = `../${scene.portrait}`;
  speakerEl.textContent = scene.speaker || "";
  textEl.innerHTML = highlight(beat.text_en, beat.glossary || []);
  glossEl.textContent = holding ? "本句停住了。点下一句，或点朗读再听一遍。" : "点击金色词可看释义。一句播完会停住。";
  pager.textContent = `${scene.title.zh} ${beat.localIdx + 1}/${scene.beats.length} · ${bidx + 1}/${beats.length}`;
  btnPrev.disabled = bidx === 0;
  const last = bidx === beats.length - 1;
  btnPrev.textContent = "上一句";
  btnNext.textContent = last ? "做题" : "下一句";
  const showChoice = beat.lastInScene && scene.choice;
  renderChoiceFor(showChoice ? scene.choice : null, scene.id);
  quizEl.classList.toggle("hidden", !last || !quizQuestions().length);
  endNav.classList.toggle("hidden", !last);
  titleEl.textContent = `第 ${ep} ${STORY_UNIT_ZH} · ${book.title.en} · ${scene.title.zh}`;
  saveProgress(false);
}

function renderGlossaryCards(example, glossary, sentenceMode = false) {
  glossEl.innerHTML = "";
  glossEl.hidden = false;
  if (request.series !== "minecraft" && request.series !== "mikey-jj") {
    glossEl.textContent = "点击金色词可看释义并收入生词本。";
    return;
  }
  const items = glossary || [];
  if (isUnifiedV3() && !BookPlayStorybookUI.shouldShowKeywords(items, readerState.mode)) {
    glossEl.hidden = true;
    return;
  }
  const wrap = document.createElement("div");
  wrap.className = "sb-keywords";
  const label = document.createElement("p");
  label.className = "sb-section-label";
  label.textContent = "Key words · 本句重点词";
  wrap.appendChild(label);
  if (!items.length) {
    const hint = document.createElement("p");
    hint.className = "sb-hint";
    hint.textContent = sentenceMode ? "本句没有列出的重点词。" : "本页没有列出的重点词。";
    wrap.appendChild(hint);
  } else {
    const list = document.createElement("div");
    list.className = "sb-word-list";
    items.forEach((g) => {
      const card = document.createElement("div");
      card.className = "sb-word-card";
      const term = document.createElement("strong");
      term.textContent = g.term || "";
      const ipaPos = document.createElement("span");
      ipaPos.className = "sb-word-ipa-pos";
      ipaPos.textContent = [g.ipa ? `/${g.ipa}/` : "", g.pos || ""].filter(Boolean).join(" ");
      const arrow = document.createElement("span");
      arrow.className = "sb-word-arrow";
      arrow.textContent = "→";
      const zh = document.createElement("span");
      zh.className = "sb-word-zh";
      zh.textContent = g.zh || "";
      const playHint = document.createElement("span");
      playHint.className = "sb-word-play";
      playHint.textContent = "▶ 点读";
      card.setAttribute("role", "button");
      card.tabIndex = 0;
      card.setAttribute("aria-label", `点读 ${g.term || ""}，${g.zh || ""}`);
      card.append(term, document.createTextNode(" "), ipaPos, document.createTextNode(" "), arrow, document.createTextNode(" "), zh, playHint);
      const speakCard = () => {
        sayFeedback(`${g.term} — ${g.zh || ""}（已收入生词本）`);
        saveWord(g.term, g.zh || "");
        speakGlossaryWord(g.term, g.zh, card);
      };
      card.addEventListener("click", speakCard);
      card.addEventListener("keydown", (ev) => {
        if (ev.key !== "Enter" && ev.key !== " ") return;
        ev.preventDefault();
        ev.stopPropagation();
        speakCard();
      });
      if (example) {
        const ex = document.createElement("small");
        ex.className = "sb-word-example";
        const lowerEx = example.toLowerCase();
        const t = (g.term || "").toLowerCase();
        const at = t ? lowerEx.indexOf(t) : -1;
        if (at >= 0) {
          ex.append(document.createTextNode("例句："));
          ex.append(document.createTextNode(example.slice(0, at)));
          const hit = document.createElement("mark");
          hit.textContent = example.slice(at, at + g.term.length);
          ex.appendChild(hit);
          ex.append(document.createTextNode(example.slice(at + g.term.length)));
        } else {
          ex.textContent = `例句：${example}`;
        }
        card.appendChild(ex);
      }
      list.appendChild(card);
    });
    wrap.appendChild(list);
  }
  glossEl.appendChild(wrap);
}

function renderPage() {
  const page = book.pages[idx];
  const sents = pageSentences(page);
  if (sents) {
    sentIdx = Math.min(sentIdx, sents.length - 1);
    const cur = sents[sentIdx];
    const clip = sentenceClip(cur);
    if (clip) {
      if (clip !== currentClipSrc) {
        playbackState.generation++;
        stopSpeakingAudio();
        currentClipSrc = clip;
        audio.src = clip;
        audio.currentTime = 0;
      }
      btnAudio.disabled = false;
      btnAudio.textContent = audio.paused ? "▶ 本句" : "❚❚ 暂停";
      btnAudio.title = book.audio ? "" : "本句使用合成朗读，不是整本原声";
    } else {
      // mixed-audio：本句原音缺失 —— 暂停、清除上一句 src、禁用按钮并说明原因
      if (currentClipSrc !== null) {
        currentClipSrc = null;
        audio.pause();
      }
      if (audio.hasAttribute("src") || audio.src) {
        audio.removeAttribute("src");
        audio.load();
      }
      btnAudio.disabled = true;
      btnAudio.textContent = "本句原音缺失";
      sayFeedback(cur.audio_missing_reason || "这句在原音中没有对应朗读。");
    }
  } else {
    if (currentClipSrc) {
      currentClipSrc = null;
      audio.src = `../${book.audio}`;
    }
  }
  pageImg.src = `../${page.image}`;
  pageImg.alt = `page ${page.page_no}`;
  applyPageView();
  pageImg.classList.remove("clip");
  modeEl.textContent = "";
  spriteImg.classList.add("hidden");
  $("sb-portrait-wrap").classList.add("hidden");
  dialogueEl.classList.add("no-portrait");
  const shown = sents ? sents[sentIdx].text_en : page.text_en;
  const cardGlossary = sents ? (sents[sentIdx].glossary || []) : (page.glossary || []);
  if (sents) renderSentenceCaption(shown, cardGlossary);
  else textEl.innerHTML = highlight(shown, cardGlossary);
  const currentSentence = sents
    ? { ...sents[sentIdx], zh: sents[sentIdx].zh || "" }
    : (page.zh ? { zh: page.zh } : null);
  updateReaderHeader(page, currentSentence);
  renderGlossaryCards(shown, cardGlossary, Boolean(sents));
  pager.textContent = `${idx + 1} / ${book.pages.length}`;
  if (captionLabelEl) {
    captionLabelEl.textContent = studyReplayActive
      ? `Study replay · 精学回放 · 第 ${replaySceneIndex + 1}/${replayQueue.length} 小节`
      : (sents
        ? `Story · 第 ${sentIdx + 1} 句 / 共 ${sents.length} 句`
        : "Story · 原文字幕");
  }
  const chip = $("sb-progress-chip");
  if (chip) chip.textContent = studyReplayActive
    ? `精学小节 ${replaySceneIndex + 1} / ${replayQueue.length}`
    : `故事进度 ${idx + 1} / ${book.pages.length}`;
  const last = idx === book.pages.length - 1;
  if (sents) {
    const lastSent = sentIdx === sents.length - 1;
    btnPrev.disabled = idx === 0 && sentIdx === 0;
    btnPrev.textContent = sentIdx > 0 ? "上一句" : "上一页";
    btnNext.textContent = last && lastSent ? "做题" : (lastSent ? "下一页" : "下一句");
  } else {
    btnPrev.disabled = idx === 0;
    btnPrev.textContent = "上一页";
    btnNext.textContent = last ? "做题" : "下一页";
  }
  btnNext.disabled = false;
  quizEl.classList.toggle("hidden", !last || !quizQuestions().length);
  endNav.classList.toggle("hidden", !last);
  renderStudyReplayControls();
  renderChoiceFor(page.choice, page.page_no);
  saveProgress(false);
}

function render() {
  if (useBeats()) renderBeat();
  else renderPage();
}

/* ===== Storybook speaking bubble + autoplay + word sync + glossary TTS ===== */

const bubbleEl = $("sb-speaking-bubble");
const bubbleLocatorEl = $("sb-bubble-locator");
const wordAudio = $("sb-word-audio");
const unlockBtn = $("sb-autoplay-unlock");

const playbackState = {
  generation: 0,
  navigationGeneration: 0,
  wordGeneration: 0,
  pendingWordResolve: null,
  unlockRequired: false,
  wordSpeaking: false,
  resumeAt: 0,
  hideTimer: 0,
  naturalEnd: false,
};

const BUBBLE_TONES = ["sb-tone-1", "sb-tone-2", "sb-tone-3", "sb-tone-4"];

function currentSpeakingSentence() {
  const s = currentMikeySentence();
  return s && s.audio && (s.bubble || s.speaker) ? s : null;
}

function currentMikeySentence() {
  if (request.series !== "mikey-jj" || !useSentenceMode() || !book || !book.pages[idx]) return null;
  return book.pages[idx].sentences[sentIdx] || null;
}

function canLocateBubble() {
  const sentence = currentMikeySentence();
  return Boolean(sentence && (sentence.bubble || sentence.speaker));
}

/* ===== 面板拆分视图：上下两格的页面每次只显示一格 ===== */

let activePanelBand = null;

function pagePanelBands(page) {
  const band = page && page.panel;
  if (!Array.isArray(band) || band.length !== 4) return null;
  if (!(band[1] > band[0]) || !(band[3] > band[2])) return null;
  return band;
}

function sentencePanelBand(page, sentence) {
  const bands = pagePanelBands(page);
  if (!bands || !sentence || !sentence.bubble) return null;
  const centerY = sentence.bubble.y + (sentence.bubble.h || 0) / 2;
  const splitCenter = (bands[1] + bands[2]) / 2;
  return centerY < splitCenter ? [bands[0], bands[1]] : [bands[2], bands[3]];
}

function currentPanelBand() {
  if (request.series !== "mikey-jj" || !useSentenceMode() || !book || !book.pages[idx]) return null;
  const page = book.pages[idx];
  const s = page.sentences[sentIdx];
  return sentencePanelBand(page, s) || activePanelBand;
}

function applyPageView() {
  const band = currentPanelBand();
  const inner = $("sb-stage-inner");
  if (!inner) return;
  if (band && pageImg.naturalWidth && pageImg.naturalHeight) {
    const fraction = band[1] - band[0];
    const panelAR = pageImg.naturalWidth / (pageImg.naturalHeight * fraction);
    document.body.classList.add("sb-split-view");
    inner.style.aspectRatio = `${pageImg.naturalWidth} / ${Math.round(pageImg.naturalHeight * fraction * 1000) / 1000}`;
    // A short window clamps the stage height; shrink the width so the visible
    // window still matches the band exactly (never crops into the band).
    inner.style.width = "";
    const expectedH = inner.clientWidth / panelAR;
    const maxH = parseFloat(getComputedStyle(inner).maxHeight);
    if (Number.isFinite(maxH) && expectedH > maxH) {
      inner.style.width = `${Math.floor(maxH * panelAR)}px`;
    }
    pageImg.style.width = "100%";
    pageImg.style.height = "auto";
    // translate % is relative to the img's own height, which spans the whole
    // page; shifting by the band start crops exactly at the gutter.
    pageImg.style.transform = `translateY(${(-band[0] * 100).toFixed(3)}%)`;
  } else {
    document.body.classList.remove("sb-split-view");
    inner.style.aspectRatio = "";
    inner.style.width = "";
    pageImg.style.width = "";
    pageImg.style.height = "";
    pageImg.style.transform = "";
  }
  activePanelBand = band;
}

function speakable() {
  return request.series === "mikey-jj" && currentSpeakingSentence() != null;
}

function toneOf(term) {
  let h = 0;
  const s = String(term || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return BUBBLE_TONES[h % BUBBLE_TONES.length];
}

function renderSpeakingBubble(sentence) {
  if (!bubbleEl) return;
  const speaker = sentence.speaker || { id: "system", label: "旁白" };
  const words = sentence.words || [];
  bubbleEl.setAttribute("data-speaker", speaker.id);
  bubbleEl.classList.toggle("sb-bubble-tail", (sentence.bubble || {}).tail !== "none");
  let html = `<span class="sb-bubble-speaker">${escapeHtml(speaker.label || speaker.id)}</span><div class="sb-bubble-words">`;
  words.forEach((w, i) => {
    const spoken = bareSpeakWord(w && w.text);
    const term = (w.term
      ? { term: w.term, zh: w.zh || ((sentence.glossary || []).find((g) => g.term === w.term) || {}).zh || "" }
      : null) || (sentence.glossary || []).find((g) => {
        const re = new RegExp(`\\b${g.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
        return re.test(w.text);
      }) || null;
    if (!spoken) {
      html += `<span class="sb-bubble-word" data-index="${i}">${escapeHtml(w.text)}</span>`;
      return;
    }
    const actualTerm = term ? String(term.term || spoken) : spoken;
    const zh = term ? String(term.zh || "") : "";
    const tone = term ? toneOf(actualTerm) : "sb-bubble-word-plain";
    const zhMarkup = zh ? `<span class="sb-bubble-word-zh">${escapeHtml(zh)}</span>` : "";
    const label = zh ? `朗读 ${actualTerm}，${zh}` : `朗读 ${actualTerm}`;
    html += `<button type="button" class="sb-bubble-word ${tone}" data-term="${escapeHtml(actualTerm)}" data-zh="${escapeHtml(zh)}" data-index="${i}" aria-label="${escapeHtml(label)}"><span class="sb-bubble-word-en">${escapeHtml(w.text)}</span>${zhMarkup}</button>`;
  });
  html += `</div>`;
  bubbleEl.innerHTML = html;
  bubbleEl.querySelectorAll("button.sb-bubble-word").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const term = btn.dataset.term || "";
      const zh = btn.dataset.zh || "";
      if (studyReplayState) updateStudyProgress((record) => studyReplayState.markTermSeen(record, term, episodeStudyContract()));
      speakGlossaryWord(term, zh, btn);
    });
  });
}

function hideBubbleLocator() {
  if (!bubbleLocatorEl) return;
  bubbleLocatorEl.hidden = true;
  bubbleLocatorEl.removeAttribute("data-speaker");
}

function updateBubbleLocator(sentence) {
  if (!bubbleLocatorEl || !sentence || !sentence.bubble) {
    hideBubbleLocator();
    return;
  }
  const inner = $("sb-stage-inner");
  if (!inner || !pageImg.naturalWidth || !pageImg.naturalHeight) {
    hideBubbleLocator();
    return;
  }
  const innerRect = inner.getBoundingClientRect();
  let target;
  if (activePanelBand) {
    // Split view: the <img> is shifted inside the cropped stage window and
    // its transformed rect already reflects that, so project directly.
    const imgRect = pageImg.getBoundingClientRect();
    target = {
      left: imgRect.left - innerRect.left + sentence.bubble.x * imgRect.width,
      top: imgRect.top - innerRect.top + sentence.bubble.y * imgRect.height,
      width: sentence.bubble.w * imgRect.width,
      height: sentence.bubble.h * imgRect.height,
    };
  } else {
    const imageRect = pageImg.getBoundingClientRect();
    const contained = BookPlayStorybookUI.containedRect({
      boxLeft: imageRect.left - innerRect.left,
      boxTop: imageRect.top - innerRect.top,
      boxWidth: imageRect.width,
      boxHeight: imageRect.height,
      naturalWidth: pageImg.naturalWidth,
      naturalHeight: pageImg.naturalHeight,
    });
    target = BookPlayStorybookUI.projectRelativeBox(contained, sentence.bubble);
    if (!contained || !target) {
      hideBubbleLocator();
      return;
    }
  }
  const pad = 4;
  const left = Math.max(0, target.left - pad);
  const top = Math.max(0, target.top - pad);
  const right = Math.min(innerRect.width, target.left + target.width + pad);
  const bottom = Math.min(innerRect.height, target.top + target.height + pad);
  if (right <= left || bottom <= top) {
    hideBubbleLocator();
    return;
  }
  bubbleLocatorEl.style.left = `${left}px`;
  bubbleLocatorEl.style.top = `${top}px`;
  bubbleLocatorEl.style.width = `${right - left}px`;
  bubbleLocatorEl.style.height = `${bottom - top}px`;
  if (sentence.speaker && sentence.speaker.id) bubbleLocatorEl.dataset.speaker = sentence.speaker.id;
  else bubbleLocatorEl.removeAttribute("data-speaker");
  bubbleLocatorEl.hidden = false;
}

async function positionSpeakingBubble(sentence) {
  if (!bubbleEl) return;
  const img = pageImg;
  if (!img || !img.naturalWidth) return;
  const rect = img.getBoundingClientRect();
  const inner = $("sb-stage-inner");
  if (!inner) return;
  const innerRect = inner.getBoundingClientRect();
  const b = sentence.bubble || { x: 0.5, y: 0.5, w: 0.3, h: 0.15 };
  const x = rect.left - innerRect.left + b.x * rect.width;
  const y = rect.top - innerRect.top + b.y * rect.height;
  const w = Math.min(b.w * rect.width, rect.width * 0.48);
  const h = Math.min(b.h * rect.height, rect.height * 0.42);
  bubbleEl.style.left = `${x}px`;
  bubbleEl.style.top = `${y}px`;
  bubbleEl.style.width = `${w}px`;
  bubbleEl.style.minHeight = `${Math.max(24, h)}px`;
}

function showSpeakingBubble() {
  const s = currentSpeakingSentence();
  if (!s) return;
  if (!bubbleEl) return;
  clearTimeout(playbackState.hideTimer);
  if (isUnifiedV3()) {
    // Unified v3 keeps the comic unobstructed. The speaker chip and the
    // sentence caption in the learning column are the single source of truth;
    // every word there remains a point-read target. Keep the legacy DOM node
    // for old cached pages, but never paint a floating panel over the artwork.
    hideBubbleLocator();
    bubbleEl.classList.remove("is-visible");
    bubbleEl.hidden = true;
    return;
  }
  // Legacy layout also keeps the artwork unobstructed: the floating word
  // strip covered the comic, so only the red locator frame marks the bubble
  // while it is being read. Point-read stays in the caption buttons.
  bubbleEl.classList.remove("is-visible");
  bubbleEl.hidden = true;
  updateBubbleLocator(s);
}

/* v3 大弹窗：贴舞台底部居中，宽度吃满大部分舞台，不锚定 PDF 坐标 */
function positionPopupBubble() {
  const inner = $("sb-stage-inner");
  if (!bubbleEl || !inner) return;
  const width = Math.min(inner.clientWidth * 0.92, 680);
  bubbleEl.style.left = `${Math.max(0, (inner.clientWidth - width) / 2)}px`;
  bubbleEl.style.top = "auto";
  bubbleEl.style.bottom = "2.5%";
  bubbleEl.style.width = `${width}px`;
  bubbleEl.style.minHeight = "0";
  bubbleEl.style.maxWidth = "none";
}

function hideSpeakingBubble({ immediate = false } = {}) {
  hideBubbleLocator();
  if (!bubbleEl || bubbleEl.hidden) return;
  clearTimeout(playbackState.hideTimer);
  const finish = () => {
    bubbleEl.classList.remove("is-visible");
    bubbleEl.hidden = true;
    bubbleEl.querySelectorAll(".sb-bubble-word").forEach((w) => {
      w.classList.remove("is-word-active", "is-word-done");
    });
  };
  if (immediate) {
    finish();
    return;
  }
  playbackState.hideTimer = setTimeout(() => {
    playbackState.naturalEnd = false;
    finish();
  }, 600);
}

function syncBubbleWords(tMs) {
  if (!bubbleEl || bubbleEl.hidden) return;
  bubbleEl.querySelectorAll("[data-index]").forEach((node) => {
    const i = Number(node.dataset.index);
    const w = (currentSpeakingSentence()?.words || [])[i];
    if (!w) return;
    node.classList.toggle("is-word-active", tMs >= w.start_ms && tMs < Math.max(w.end_ms, w.start_ms + 60));
    node.classList.toggle("is-word-done", tMs >= Math.max(w.end_ms, w.start_ms + 60));
  });
}

function cancelWordPlayback() {
  playbackState.wordGeneration += 1;
  if (playbackState.pendingWordResolve) {
    playbackState.pendingWordResolve({ cancelled: true });
    playbackState.pendingWordResolve = null;
  }
  try { wordAudio.pause(); } catch (_) {}
  wordAudio.onended = null;
  wordAudio.onerror = null;
  try { wordAudio.removeAttribute("src"); } catch (_) {}
  playbackState.wordSpeaking = false;
}

function stopSpeakingAudio() {
  cancelWordPlayback();
}

function invalidateNavigation() {
  playbackState.navigationGeneration += 1;
  playbackState.generation += 1;
  readerState.autoAdvancePending = false;
  cancelWordPlayback();
  hideSpeakingBubble({ immediate: true });
}

function stopAllSpeaking() {
  invalidateNavigation();
  try { audio.pause(); } catch (_) {}
  hideSpeakingBubble({ immediate: true });
}

function playCurrentSentence() {
  if (!speakable()) return;
  playLoadedSentenceClip(currentSpeakingSentence());
}

function playLoadedSentenceClip(sentence) {
  const clip = sentenceClip(sentence);
  if (!clip) return;
  const gen = ++playbackState.generation;
  cancelWordPlayback();
  if (clip !== currentClipSrc) {
    currentClipSrc = clip;
    audio.src = clip;
  }
  audio.currentTime = 0;
  audio.play().catch((err) => {
    if (gen !== playbackState.generation) return;
    if (err && err.name === "NotAllowedError") {
      if (!playbackState.unlockRequired) {
        playbackState.unlockRequired = true;
        showAutoplayUnlockNotice();
      }
    } else {
      sayFeedback("本句暂时无法播放。");
      btnAudio.textContent = "▶ 本句";
    }
  });
}

function playActiveSentence() {
  if (speakable()) {
    playCurrentSentence();
    return;
  }
  if (!useSentenceMode() || !book || !book.pages[idx]) return;
  playLoadedSentenceClip(book.pages[idx].sentences[sentIdx]);
}

async function speakGlossaryWord(term, zh, btn, primaryLang = "en-US") {
  if (!term || !wordAudio) return;
  const wasPlaying = (speakable() || (request.series === "minecraft" && useSentenceMode())) && !audio.paused;
  const resumeAt = wasPlaying ? audio.currentTime : 0;
  if (wasPlaying) { try { audio.pause(); } catch (_) {} }
  const navigationGeneration = playbackState.navigationGeneration;
  cancelWordPlayback();
  const wordGeneration = playbackState.wordGeneration;
  playbackState.wordSpeaking = true;
  playbackState.resumeAt = resumeAt;
  if (speakable()) {
    showSpeakingBubble();
    bubbleEl.querySelectorAll("button.sb-bubble-word").forEach((b) => {
      const on = b === btn;
      b.classList.toggle("is-word-active", on);
      b.classList.toggle("is-word-done", !on);
    });
  }
  const play = (text, lang) => new Promise((resolve) => {
    let settled = false;
    let fallbackTried = false;
    const fallbackUrl = () => WalaMedia.ttsUrl(text, lang);
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      wordAudio.onended = wordAudio.onerror = null;
      if (playbackState.pendingWordResolve === cancel) playbackState.pendingWordResolve = null;
      resolve(ok);
    };
    const cancel = () => finish({ cancelled: true });
    playbackState.pendingWordResolve = cancel;
    const tryPlay = (url, isFallback = false) => {
      if (!url) { finish(false); return; }
      try {
        wordAudio.src = url;
      } catch (_) {
        if (!isFallback && !fallbackTried) {
          fallbackTried = true;
          tryPlay(fallbackUrl(), true);
        } else finish(false);
        return;
      }
      wordAudio.onended = () => finish(true);
      wordAudio.onerror = () => {
        if (!isFallback && !fallbackTried) {
          fallbackTried = true;
          tryPlay(fallbackUrl(), true);
        } else finish(false);
      };
      wordAudio.play().catch(() => {
        if (!isFallback && !fallbackTried) {
          fallbackTried = true;
          tryPlay(fallbackUrl(), true);
        } else finish(false);
      });
    };
    // Published storybook packs ship deterministic Edge-TTS clips.  Keep the
    // WalaMedia endpoint as an explicit fallback for older/offline packs.
    const staticUrl = staticVocabAudio(text, lang);
    tryPlay(staticUrl || fallbackUrl(), !staticUrl);
  });
  const isCurrent = () => navigationGeneration === playbackState.navigationGeneration
    && wordGeneration === playbackState.wordGeneration;
  const okEn = await play(term, primaryLang);
  if (!isCurrent()) return;
  // Chinese-first controls pass an empty `zh`; keep the second clip scoped to
  // the normal English-first glossary path so it cannot replay Chinese twice.
  if (primaryLang === "en-US") {
    if (zh && okEn === true) await play(zh, "zh-CN");
  }
  if (!isCurrent()) return;
  playbackState.wordSpeaking = false;
  wordAudio.pause();
  wordAudio.onended = wordAudio.onerror = null;
  wordAudio.removeAttribute("src");
  playbackState.pendingWordResolve = null;
  if (okEn !== true) sayFeedback("单词朗读暂时不可用。");
  // restore sentence audio only when it was playing before and both generations match
  if (isCurrent() && wasPlaying) {
    try {
      audio.currentTime = Math.min(resumeAt, (audio.duration || resumeAt) - 0.02);
      await audio.play();
    } catch (_) {
      btnAudio.textContent = "▶ 本句";
    }
  }
  if (isCurrent() && speakable()) {
    bubbleEl.querySelectorAll("button.sb-bubble-word").forEach((b) => b.classList.remove("is-word-active"));
  }
  if (isCurrent() && isUnifiedV3() && canLocateBubble() && !wasPlaying) {
    hideBubbleLocator();
  }
}

function seekToUnit() {
  let start;
  if (useBeats()) {
    start = current() && current().start_sec;
  } else if (useSentenceMode()) {
    const sen = book.pages[idx].sentences[sentIdx];
    const clip = sentenceClip(sen);
    if (clip && clip !== currentClipSrc) {
      currentClipSrc = clip;
      audio.src = clip;
    }
    start = 0; // 派生句段：从片段自身 0 播放，不套用整书绝对秒数
  } else {
    start = book.pages[idx].start_sec;
  }
  if (start == null || !audio.src) return;
  seeking = true;
  holding = false;
  audio.currentTime = start;
  setTimeout(() => { seeking = false; }, 180);
}

function mustChoose() {
  if (useBeats()) {
    const beat = current();
    return beat.lastInScene && beat.scene.choice && !savedChoice(beat.scene.id);
  }
  const page = book.pages[idx];
  return page.choice && !savedChoice(page.page_no);
}

function unitEnd() {
  if (useBeats()) return current().end_sec;
  if (useSentenceMode()) return book.pages[idx].sentences[sentIdx].end_sec;
  return book.pages[idx].end_sec;
}

function finishFullEpisode() {
  episodeFullComplete = true;
  saveProgress(true);
  if ((request.series === "minecraft" || request.series === "mikey-jj") && replayQueue.length) {
    showStudyReplayOffer();
    return;
  }
  if (isUnifiedV3()) openReview();
  else sayFeedback("这一章读完了。可以进入巩固练习。");
}

function queueSentenceAdvance() {
  if (readerState.autoAdvancePending || !useSentenceMode()) return;
  readerState.autoAdvancePending = true;
  const generation = playbackState.generation;
  const navigationGeneration = playbackState.navigationGeneration;
  setTimeout(() => {
    if (generation !== playbackState.generation || navigationGeneration !== playbackState.navigationGeneration) {
      readerState.autoAdvancePending = false;
      return;
    }
    readerState.autoAdvancePending = false;
    if (studyReplayActive) {
      const scene = replayQueue[replaySceneIndex];
      const ids = replaySentenceIds(scene);
      const currentNode = currentSentenceNode();
      const currentId = currentNode && currentNode.id
        ? String(currentNode.id)
        : "";
      const localIndex = ids.indexOf(currentId);
      if (localIndex >= 0 && localIndex < ids.length - 1) {
        const next = locateSentence(ids[localIndex + 1]);
        if (next) {
          idx = next.pageIndex;
          sentIdx = next.sentenceIndex;
          render();
          seekToUnit();
          playCurrentSentence();
          return;
        }
      }
      updateStudyProgress((record) => studyReplayState.markSceneComplete(record, scene.id, episodeStudyContract()));
      playReplayScene(replaySceneIndex + 1);
      return;
    }
    const sents = pageSentences(book && book.pages[idx]);
    if (!sents) return;
    if (sentIdx < sents.length - 1) {
      sentIdx += 1;
    } else if (idx < book.pages.length - 1) {
      idx += 1;
      sentIdx = 0;
    } else {
      finishFullEpisode();
      return;
    }
    render();
    seekToUnit();
    if (speakable()) {
      playCurrentSentence();
    } else {
      audio.play().catch(() => { btnAudio.textContent = "▶ 本句"; });
    }
  }, 120);
}

function quizDisplayFor(question) {
  if (episodeVocabQuiz && typeof episodeVocabQuiz.quizDisplay === "function") {
    return episodeVocabQuiz.quizDisplay(question);
  }
  const source = question && typeof question === "object" ? question : {};
  const choicesEn = (Array.isArray(source.choices) ? source.choices : [])
    .map((choice) => String(choice == null ? "" : choice).trim())
    .filter(Boolean);
  const choicesZh = Array.isArray(source.choices_zh) ? source.choices_zh : [];
  return {
    promptEn: String(source.prompt_en || source.q || "").trim(),
    promptZh: String(source.prompt_zh || source.q_zh || "").trim(),
    choicesEn,
    choicesZh: choicesEn.map((_, index) => String(choicesZh[index] == null ? "" : choicesZh[index]).trim()),
  };
}

function createQuizSpeaker(text, label = "", lang = "en-US") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "sb-quiz-speaker";
  button.textContent = "🔊";
  button.setAttribute("aria-label", `朗读${label || text}`);
  button.title = `朗读${label || text}`;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    speakGlossaryWord(text, "", button, lang);
  });
  return button;
}

let quizClipAudio = null;
let quizAutoSpeakTimer = 0;

function playQuizSentenceClip(relPath) {
  if (!relPath) return;
  try {
    if (quizClipAudio) quizClipAudio.pause();
    quizClipAudio = new Audio(runtimeAssetUrl(relPath));
    quizClipAudio.play().catch(() => {});
  } catch (_) {}
}

function quizSourceSentenceAudio(question) {
  if (question && question.audio) return question.audio;
  if (!question || !book) return null;
  const wanted = String(question.source_sentence_id || "");
  if (!wanted) return null;
  for (const page of book.pages || []) {
    for (const sentence of page.sentences || []) {
      if (String(sentence.id || "") === wanted) return sentence.audio || null;
    }
  }
  return null;
}

function appendQuizHint(card, display, idSuffix) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "sb-quiz-hint";
  button.textContent = "💡";
  button.setAttribute("aria-label", "中文提示");
  button.title = "中文提示";
  // 右上角：放进题干行、朗读按钮左侧
  const questionRow = card.querySelector(".sb-quiz-question-row");
  if (questionRow) {
    const speaker = questionRow.querySelector(".sb-quiz-speaker");
    questionRow.insertBefore(button, speaker || null);
  } else {
    const row = document.createElement("div");
    row.className = "sb-quiz-hint-row";
    row.appendChild(button);
    card.appendChild(row);
  }
  const box = document.createElement("div");
  box.id = `sb-quiz-hint-${idSuffix}`;
  box.className = "sb-quiz-hint-box";
  box.hidden = true;
  button.setAttribute("aria-controls", box.id);
  button.setAttribute("aria-expanded", "false");
  const hasChoices = display.choicesZh.some(Boolean);
  if (display.promptZh) {
    const prompt = document.createElement("div");
    prompt.className = "sb-quiz-hint-prompt-row";
    const promptText = document.createElement("p");
    promptText.className = "sb-quiz-hint-prompt";
    promptText.textContent = display.promptZh;
    prompt.append(promptText, createQuizSpeaker(display.promptZh, "中文题干", "zh-CN"));
    box.appendChild(prompt);
  }
  if (hasChoices) {
    const choices = document.createElement("div");
    choices.className = "sb-quiz-hint-choices";
    display.choicesZh.forEach((choice, index) => {
      if (!choice) return;
      const item = document.createElement("div");
      item.className = "sb-quiz-hint-choice-row";
      const itemText = document.createElement("span");
      itemText.textContent = `${QUIZ_LETTERS[index] || String(index + 1)}. ${choice}`;
      item.append(itemText, createQuizSpeaker(choice, `中文选项 ${QUIZ_LETTERS[index] || String(index + 1)}`, "zh-CN"));
      choices.appendChild(item);
    });
    box.appendChild(choices);
  }
  if (!display.promptZh && !hasChoices) {
    const empty = document.createElement("p");
    empty.className = "sb-quiz-hint-empty";
    empty.textContent = "暂无中文提示";
    box.appendChild(empty);
  }
  button.addEventListener("click", () => {
    const expanded = !box.hidden;
    box.hidden = expanded;
    button.setAttribute("aria-expanded", String(!expanded));
    button.classList.toggle("is-open", !expanded);
  });
  card.appendChild(box);
}

function renderQuiz() {
  const quiz = quizQuestions();
  quizEl.innerHTML = "";
  const head = document.createElement("div");
  head.className = "sb-quiz-head";
  const kicker = document.createElement("p");
  kicker.className = "sb-section-label";
  kicker.textContent = `Book challenge · ${quiz.length} questions`;
  const title = document.createElement("h2");
  title.textContent = "章末小测";
  head.append(kicker, title);
  quizEl.appendChild(head);
  const letters = ["A", "B", "C", "D", "E"];
  quiz.forEach((q, qi) => {
    const display = quizDisplayFor(q);
    const card = document.createElement("div");
    card.className = "sb-quiz-card";
    const index = document.createElement("p");
    index.className = "sb-quiz-index";
    index.textContent = `第 ${qi + 1} 题 / 共 ${quiz.length} 题`;
    const questionRow = document.createElement("div");
    questionRow.className = "sb-quiz-question-row";
    const question = document.createElement("h3");
    question.textContent = display.promptEn;
    questionRow.append(question, createQuizSpeaker(display.promptEn, "题目"));
    const options = document.createElement("div");
    options.className = "sb-quiz-options";
    const feedback = document.createElement("p");
    feedback.className = "sb-quiz-feedback";
    feedback.setAttribute("aria-live", "polite");
    display.choicesEn.forEach((c, i) => {
      const optionRow = document.createElement("div");
      optionRow.className = "sb-quiz-option-row";
      const b = document.createElement("button");
      b.type = "button";
      b.className = "sb-quiz-option";
      const badge = document.createElement("span");
      badge.textContent = letters[i] || String(i + 1);
      b.append(badge, document.createTextNode(c));
      b.addEventListener("click", () => {
        if (b.disabled) return;
        const correct = i === q.answer;
        recordQuizAnswer(q, correct);
        if (correct) {
          b.classList.add("is-correct");
          feedback.textContent = "✓ 答对了。";
          feedback.classList.remove("is-wrong");
          saveProgress(true);
        } else {
          b.classList.add("is-wrong");
          feedback.textContent = `✗ 答错了。正确答案是 ${letters[q.answer] || display.choicesEn[q.answer]}：${display.choicesEn[q.answer]}`;
          feedback.classList.add("is-wrong");
        }
        options.querySelectorAll(".sb-quiz-option").forEach((o) => { o.disabled = true; });
      });
      optionRow.append(b, createQuizSpeaker(c, `选项 ${letters[i] || String(i + 1)}`));
      options.appendChild(optionRow);
    });
    card.append(index, questionRow);
    appendQuizHint(card, display, `legacy-${qi}`);
    card.append(options, feedback);
    quizEl.appendChild(card);
  });
}

function reviewWordsForBook() {
  if (!window.BookPlayStorybookPractice) return [];
  return BookPlayStorybookPractice.buildReviewWords(book, { max: 6 });
}

function renderReview() {
  if (!reviewEl) return;
  reviewEl.innerHTML = "";
  reviewEl.classList.remove("hidden");
  const heading = document.createElement("div");
  heading.className = "sb-review-head";
  const kicker = document.createElement("p");
  kicker.className = "sb-section-label";
  kicker.textContent = "Review · 巩固准备";
  const title = document.createElement("h2");
  title.textContent = "先复习，再挑战";
  const sub = document.createElement("p");
  sub.className = "sb-review-subtitle";
  sub.textContent = "把本章重点词快速读一遍，然后开始小测。";
  const progress = vocabProgress();
  const stats = document.createElement("p");
  stats.className = "sb-vocab-progress";
  stats.textContent = `已学习 ${progress.learnedTerms.length}/${progress.targetTerms.length} · 已掌握 ${progress.masteredTerms.length}/${progress.targetTerms.length}`;
  const track = document.createElement("div");
  track.className = "sb-review-progress-track";
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-label", "本章重点词学习进度");
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", String(progress.targetTerms.length || 1));
  track.setAttribute("aria-valuenow", String(progress.learnedTerms.length));
  const fill = document.createElement("span");
  fill.className = "sb-review-progress-fill";
  fill.style.width = `${progress.targetTerms.length ? Math.round((progress.learnedTerms.length / progress.targetTerms.length) * 100) : 0}%`;
  track.appendChild(fill);
  const helper = document.createElement("p");
  helper.className = "sb-review-helper";
  helper.textContent = "点击词卡听英文发音 · 读完后开始本章小测";
  heading.append(kicker, title, sub, stats, track, helper);
  const list = document.createElement("div");
  list.className = "sb-review-words";
  const words = reviewWordsForBook();
  if (!words.length) {
    const empty = document.createElement("p");
    empty.className = "sb-review-empty";
    empty.textContent = "本章没有可复习的重点词，可以直接开始小测。";
    list.appendChild(empty);
  } else {
    words.forEach((word, wordIndex) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "sb-review-word";
      button.dataset.index = String(wordIndex + 1);
      button.setAttribute("aria-label", `点读 ${word.term}，${word.zh || ""}`);
      const term = document.createElement("strong");
      term.textContent = word.term || "";
      const zh = document.createElement("span");
      zh.textContent = word.zh || "";
      const audio = document.createElement("small");
      audio.className = "sb-review-audio";
      audio.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><path d="M4 10v4h4l5 4V6l-5 4H4Zm12.5-2.5a5 5 0 0 1 0 9M18.5 5a9 9 0 0 1 0 14"/></svg><span>点读</span>';
      button.append(term, zh, audio);
      button.addEventListener("click", () => {
        if (studyReplayState) updateStudyProgress((record) => studyReplayState.markTermSeen(record, word.term, episodeStudyContract()));
        speakGlossaryWord(word.term, word.zh || "", button);
      });
      list.appendChild(button);
    });
  }
  const actions = document.createElement("div");
  actions.className = "sb-review-actions";
  const back = document.createElement("button");
  back.type = "button";
  back.id = "sb-close-review";
  back.textContent = "返回阅读";
  back.addEventListener("click", closeReview);
  const start = document.createElement("button");
  start.type = "button";
  start.id = "sb-start-practice";
  start.className = "sb-review-primary";
  start.textContent = "开始小测 →";
  start.disabled = !quizQuestions().length;
  start.addEventListener("click", startPracticeQuiz);
  actions.append(back, start);
  reviewEl.append(heading, list, actions);
}

function openReview() {
  if (!isUnifiedV3() || !reviewEl || !quizQuestions().length) {
    if (quizEl) quizEl.scrollIntoView({ behavior: "smooth" });
    return;
  }
  stopAllSpeaking();
  quizOpen = false;
  practiceResultOpen = false;
  reviewOpen = true;
  quizEl.classList.add("hidden");
  document.body.classList.remove("sb-quiz-full", "sb-practice-result-full");
  document.body.classList.add("sb-review-full");
  renderReview();
  const first = reviewEl.querySelector("#sb-start-practice") || reviewEl.querySelector("button");
  if (first) first.focus();
}

function closeReview() {
  clearQuizRecoveryTimer();
  reviewOpen = false;
  quizQuestionOverride = null;
  quizRecoveryCount = 0;
  document.body.classList.remove("sb-review-full");
  if (reviewEl) {
    reviewEl.classList.add("hidden");
    reviewEl.innerHTML = "";
  }
  render();
  btnNext.focus();
}

function clearQuizRecoveryTimer() {
  if (!quizRecoveryTimer) return;
  window.clearTimeout(quizRecoveryTimer);
  quizRecoveryTimer = 0;
}

function startPracticeQuiz(questions = null, { resetRecovery = questions == null } = {}) {
  clearQuizRecoveryTimer();
  if (quizAutoSpeakTimer) { clearTimeout(quizAutoSpeakTimer); quizAutoSpeakTimer = 0; }
  if (!window.BookPlayStorybookPractice) return;
  quizQuestionOverride = Array.isArray(questions) && questions.length ? questions : null;
  if (!quizQuestions().length) return;
  if (resetRecovery) quizRecoveryCount = 0;
  reviewOpen = false;
  practiceResultOpen = false;
  practiceState = BookPlayStorybookPractice.createPracticeState(quizQuestions());
  quizIndex = 0;
  quizOpen = true;
  if (reviewEl) {
    reviewEl.classList.add("hidden");
    reviewEl.innerHTML = "";
  }
  document.body.classList.remove("sb-review-full", "sb-practice-result-full");
  document.body.classList.add("sb-quiz-full");
  quizEl.classList.remove("hidden");
  renderQuizItem();
}

function focusedReplayQueueForTerms(terms) {
  const wanted = new Set((Array.isArray(terms) ? terms : []).map(normalizeVocabTerm).filter(Boolean));
  const focused = replayQueue.filter((scene) => Array.isArray(scene && scene.target_terms)
    && scene.target_terms.some((term) => wanted.has(normalizeVocabTerm(term))));
  // A malformed/legacy quiz may not carry a term-to-scene link. Keep the
  // recovery path usable by replaying the authored study queue in that case.
  return focused.length ? focused : replayQueue.slice();
}

function focusedReplayQueueForQuestions(questions) {
  if (studyReplayQueue && typeof studyReplayQueue.replayQueueForQuestions === "function") {
    const focused = studyReplayQueue.replayQueueForQuestions(replayQueue, questions);
    if (focused.length) return focused;
    // An authored question with no matching scene is a data defect. Do not
    // disguise it by replaying unrelated study scenes.
    if ((Array.isArray(questions) ? questions : []).some(quizQuestionHasAuthoredEvidence)) return [];
  }
  const terms = (Array.isArray(questions) ? questions : []).map((question) => question && question.term).filter(Boolean);
  return focusedReplayQueueForTerms(terms);
}

function startFocusedQuizRecovery(summary) {
  if (!summary || !Array.isArray(summary.wrongIds) || !summary.wrongIds.length) return;
  if (!practiceState || !window.BookPlayStorybookPractice || studyReplayActive) return;
  const wrongIds = new Set(summary.wrongIds.map(String));
  const questions = practiceState.questions.filter((question) => wrongIds.has(String(question.id)));
  if (!questions.length) return;
  const originalQueue = replayQueue.slice();
  const focusedQueue = focusedReplayQueueForQuestions(questions);
  quizRecoveryCount += 1;
  clearQuizRecoveryTimer();
  if (!focusedQueue.length) {
    // Keep malformed/legacy books recoverable even when they have no replay
    // scenes to show: go straight to the bounded wrong-question retry.
    startPracticeQuiz(questions, { resetRecovery: false });
    sayFeedback("没有可回放的小节，先重做错题。");
    return;
  }
  studyReplayReturn = { kind: "quiz-retry", questions, queue: originalQueue };
  stopAllSpeaking();
  quizOpen = false;
  reviewOpen = false;
  practiceResultOpen = false;
  document.body.classList.remove("sb-quiz-full", "sb-review-full", "sb-practice-result-full");
  if (reviewEl) {
    reviewEl.classList.add("hidden");
    reviewEl.innerHTML = "";
  }
  startStudyReplay({ queue: focusedQueue });
}

function applyCompletionProgressFlag(flag, value = true) {
  if (!studyReplayState) return;
  updateStudyProgress((record) => studyReplayState.markReward(record, flag, value, episodeStudyContract()));
}

function prepareStorybookRewards(card) {
  if (!card || !card.passed || !storybookRewardCatalog || !window.BookPlayEpisodeReward) {
    return { sticker: null, offer: null, spGranted: false, firstPass: Boolean(card && card.first_pass) };
  }
  const progress = currentProgressRecord();
  const firstPass = window.BookPlayCompletionCard
    ? window.BookPlayCompletionCard.isFirstPass(progress, true)
    : !progress.completion?.reward_granted;
  storybookRewardState = readStorybookRewardState();
  let spGranted = false;
  if (firstPass && !(progress.completion && progress.completion.sp_granted)) {
    grantStorybookSP(storybookRewardCatalog.sp_reward || 10);
    applyCompletionProgressFlag("sp_granted");
    spGranted = true;
  }
  const stickerResult = window.BookPlayEpisodeReward.grantEpisodeSticker(storybookRewardState, {
    episode: ep,
    completed: true,
    catalog: storybookRewardCatalog,
    date: new Date().toISOString().slice(0, 10),
  });
  storybookRewardState = stickerResult.state;
  if (stickerResult.granted) applyCompletionProgressFlag("sticker_granted");
  const prepared = window.BookPlayEpisodeReward.prepareDrop({
    state: storybookRewardState,
    episode: ep,
    passed: true,
    catalog: storybookRewardCatalog,
    date: new Date().toISOString().slice(0, 10),
  });
  storybookRewardState = prepared.state;
  saveStorybookRewardState();
  return { sticker: stickerResult.granted ? stickerResult.item : null, offer: prepared.offered ? prepared : null, spGranted, firstPass };
}

function launchStorybookConfetti() {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const existing = document.querySelector(".sb-reward-confetti");
  if (existing) existing.remove();
  const layer = document.createElement("div");
  layer.className = "sb-reward-confetti";
  layer.setAttribute("aria-hidden", "true");
  const colors = ["#ffd84f", "#78db8a", "#8bc8ff", "#ff8b7e", "#ffffff"];
  for (let i = 0; i < 30; i += 1) {
    const piece = document.createElement("i");
    piece.style.setProperty("--x", `${(Math.random() * 100).toFixed(2)}vw`);
    piece.style.setProperty("--delay", `${(Math.random() * 0.22).toFixed(2)}s`);
    piece.style.setProperty("--spin", `${Math.round(180 + Math.random() * 540)}deg`);
    piece.style.setProperty("--color", colors[i % colors.length]);
    layer.appendChild(piece);
  }
  document.body.appendChild(layer);
  window.setTimeout(() => layer.remove(), 1700);
}

function renderStorybookReward(card, reward) {
  if (!card || !reward) return;
  const rewardWrap = document.createElement("div");
  rewardWrap.className = "sb-completion-rewards";
  if (reward.spGranted) {
    const sp = document.createElement("p");
    sp.className = "sb-reward-pill";
    sp.textContent = `+${storybookRewardCatalog?.sp_reward || 10} SP · 首次通过奖励`;
    rewardWrap.appendChild(sp);
  }
  if (reward.sticker) {
    const sticker = document.createElement("p");
    sticker.className = "sb-reward-pill sb-reward-sticker";
    sticker.textContent = `${reward.sticker.title_zh || reward.sticker.title_en || "故事贴纸"} 已收入贴纸册`;
    rewardWrap.appendChild(sticker);
  }
  if (reward.offer) {
    const heading = document.createElement("p");
    heading.className = "sb-reward-choice-heading";
    heading.textContent = `从本${STORY_UNIT_ZH}故事里选一件小礼物`;
    rewardWrap.appendChild(heading);
    const postpone = document.createElement("small");
    postpone.className = "sb-reward-choice-note";
    postpone.textContent = "现在不选也没关系，稍后还能回来选。";
    rewardWrap.appendChild(postpone);
    const options = document.createElement("div");
    options.className = "sb-reward-choice-grid";
    reward.offer.items.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "sb-reward-choice";
      button.dataset.rewardItem = item.id;
      const roomAsset = item.room_asset || item.asset || "";
      const asset = roomAsset ? `../${String(roomAsset).replace(/^\.\//, "")}` : "";
      const storySource = item.story_image ? ` data-story-image="${escapeHtml(item.story_image)}"` : "";
      button.innerHTML = `${asset ? `<img src="${escapeHtml(asset)}" alt="" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false">` : ""}<span class="sb-reward-choice-fallback" aria-hidden="true" hidden>${escapeHtml(item.glyph || "✨")}</span><strong>${escapeHtml(item.title_zh || item.title_en || "故事纪念")}</strong><span${storySource}>${escapeHtml(item.title_en || "Story keepsake")}</span>`;
      button.addEventListener("click", () => {
        const result = window.BookPlayEpisodeReward.grantChoice(storybookRewardState, {
          episode: ep,
          itemId: item.id,
          catalog: storybookRewardCatalog,
          date: new Date().toISOString().slice(0, 10),
        });
        storybookRewardState = result.state;
        saveStorybookRewardState();
        if (!result.granted) return;
        applyCompletionProgressFlag("room_item_granted");
        applyCompletionProgressFlag("reward_granted");
        options.querySelectorAll("button").forEach((candidate) => { candidate.disabled = true; });
        const chosen = document.createElement("p");
        chosen.className = "sb-reward-confirmation";
        chosen.textContent = `${result.item.title_zh || result.item.title_en} 已放进 Byte 的小屋！`;
        rewardWrap.appendChild(chosen);
        appendCompletionRewardActions(rewardWrap);
      });
      options.appendChild(button);
    });
    rewardWrap.appendChild(options);
  } else {
    appendCompletionRewardActions(rewardWrap);
  }
  card.appendChild(rewardWrap);
}

function appendCompletionRewardActions(rewardWrap) {
  if (!rewardWrap || rewardWrap.querySelector(".sb-reward-actions")) return;
  const actions = document.createElement("div");
  actions.className = "sb-reward-actions";
  const room = document.createElement("a");
  room.className = "sb-reward-action sb-reward-action-room";
  room.href = `room.html?series=${encodeURIComponent(request.series)}`;
  room.textContent = "去小屋看看 →";
  actions.appendChild(room);
  const next = endNav?.querySelector("#btn-next-ep");
  if (next?.href) {
    const nextLink = document.createElement("a");
    nextLink.className = "sb-reward-action sb-reward-action-next";
    nextLink.href = next.href;
    nextLink.textContent = next.textContent || `下一${STORY_UNIT_ZH}`;
    actions.appendChild(nextLink);
  }
  rewardWrap.appendChild(actions);
}

function renderPracticeResult() {
  if (!reviewEl || !practiceState || !window.BookPlayStorybookPractice) return;
  const summary = BookPlayStorybookPractice.practiceSummary(practiceState);
  summary.passed = summary.total > 0 && summary.correct / summary.total >= 0.7;
  summary.wrongTerms = practiceState.questions.filter((question) => summary.wrongIds.includes(question.id)).map((question) => question.term).filter(Boolean);
  const progress = vocabProgress();
  completionCardData = window.BookPlayCompletionCard
    ? window.BookPlayCompletionCard.buildCompletionCard({
      series: request.series,
      episode: ep,
      titleEn: book.title.en,
      titleZh: book.title.zh,
      summary,
      targetTerms: progress.targetTerms,
      learnedTerms: progress.learnedTerms,
      masteredTerms: progress.masteredTerms,
      wrongTerms: progress.wrongTerms.length ? progress.wrongTerms : summary.wrongTerms,
      progress: currentProgressRecord(),
      assetManifest: storybookAssetManifest,
      nextHref: endNav && endNav.querySelector("#btn-next-ep") ? endNav.querySelector("#btn-next-ep").href : "",
    })
    : null;
  reviewEl.innerHTML = "";
  reviewEl.classList.remove("hidden");
  const heading = document.createElement("div");
  heading.className = "sb-review-head";
  const kicker = document.createElement("p");
  kicker.className = "sb-section-label";
  kicker.textContent = "Result · 本章结果";
  const title = document.createElement("h2");
  title.textContent = summary.passed ? `本${STORY_UNIT_ZH}完成卡` : "再试一次";
  heading.append(kicker, title);
  const score = document.createElement("p");
  score.className = "sb-result-score";
  score.textContent = `答对 ${summary.correct} / ${summary.total} · ${summary.percent}% · 已学习 ${progress.learnedTerms.length}/${progress.targetTerms.length} · 已掌握 ${progress.masteredTerms.length}/${progress.targetTerms.length}`;
  const autoRecover = !summary.passed && summary.wrongIds.length > 0 && quizRecoveryCount < 1;
  const recoveryNote = document.createElement("p");
  recoveryNote.className = "sb-recovery-note";
  if (autoRecover) {
    recoveryNote.textContent = "本次未达标，将自动回到错题对应小节，再学一遍。";
  } else if (!summary.passed && summary.wrongIds.length) {
    recoveryNote.textContent = "可以手动重做错题；完成后会再次检查掌握度。";
  }
  const wrong = document.createElement("div");
  wrong.className = "sb-result-wrong";
  if (summary.wrongIds.length) {
    const label = document.createElement("p");
    label.textContent = "再看一遍错题";
    wrong.appendChild(label);
    summary.wrongIds.forEach((id) => {
      const q = practiceState.questions.find((item) => item.id === id);
      if (!q) return;
      const item = document.createElement("p");
      item.textContent = q.prompt_en;
      wrong.appendChild(item);
    });
  } else {
    wrong.textContent = "全对！本章重点词掌握得很好。";
  }
  const actions = document.createElement("div");
  actions.className = "sb-review-actions";
  const back = document.createElement("button");
  back.type = "button";
  back.textContent = "回到本书";
  back.addEventListener("click", closeQuiz);
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "sb-review-primary";
  retry.textContent = summary.passed ? "再复习错词" : "重做错题";
  retry.disabled = !summary.wrongIds.length;
  retry.addEventListener("click", () => {
    const wrongSet = new Set(summary.wrongIds);
    startPracticeQuiz(practiceState.questions.filter((q) => wrongSet.has(q.id)), { resetRecovery: false });
  });
  actions.append(back, retry);
  const completion = document.createElement("section");
  completion.className = "sb-completion-card";
  completion.setAttribute("aria-label", summary.passed ? `本${STORY_UNIT_ZH}完成卡` : `本${STORY_UNIT_ZH}学习结果`);
  if (completionCardData && completionCardData.asset) completion.style.setProperty("--sb-completion-bg", `url(${JSON.stringify(runtimeAssetUrl(completionCardData.asset))})`);
  const companionAsset = summary.passed
    ? (request.series === "minecraft"
      ? "assets/generated/storybooks/minecraft/characters/duo/transparent/celebrate.png"
      : "assets/generated/storybooks/mikey-jj/characters/mikey/transparent/celebrate.png")
    : (request.series === "minecraft"
      ? "assets/generated/storybooks/minecraft/characters/alex/transparent/rescue.png"
      : "assets/generated/storybooks/mikey-jj/characters/duo/transparent/rescue.png");
  const companion = document.createElement("img");
  companion.className = "sb-completion-companion";
  companion.src = runtimeAssetUrl(companionAsset);
  companion.alt = summary.passed ? "主角庆祝动作" : "伙伴鼓励再试一次";
  companion.loading = "lazy";
  companion.decoding = "async";
  companion.addEventListener("error", () => companion.remove(), { once: true });
  completion.append(companion, heading, score, recoveryNote, wrong, actions);
  reviewEl.appendChild(completion);
  if (summary.passed) {
    const reward = prepareStorybookRewards(completionCardData);
    renderStorybookReward(completion, reward);
    if (reward.firstPass) {
      launchStorybookConfetti();
      applyCompletionProgressFlag("card_shown");
      applyCompletionProgressFlag("confetti_shown");
    }
  }
  if (autoRecover) {
    clearQuizRecoveryTimer();
    quizRecoveryTimer = window.setTimeout(() => {
      quizRecoveryTimer = 0;
      if (practiceResultOpen) startFocusedQuizRecovery(summary);
    }, 1300);
  }
  const focusTarget = retry.disabled ? back : retry;
  focusTarget.focus();
}

function savePracticeSummary(summary) {
  if (!summary) return;
  const map = loadProgress();
  const rec = map[progressKey] || {};
  const previous = rec.practice || {};
  rec.practice = {
    attempts: Number(previous.attempts || 0) + 1,
    best_correct: Math.max(Number(previous.best_correct || 0), summary.correct),
    total: summary.total,
    last_wrong_ids: summary.wrongIds,
    last_wrong_terms: summary.wrongTerms || [],
    passed: Boolean(summary.passed || (summary.total > 0 && summary.correct / summary.total >= 0.7)),
    updated_at: new Date().toISOString(),
  };
  map[progressKey] = rec;
  localStorage.setItem(PROG_KEY, JSON.stringify(map));
}

function openQuiz() {
  stopAllSpeaking();
  if (request.series !== "minecraft" && request.series !== "mikey-jj") {
    quizEl.scrollIntoView({ behavior: "smooth" });
    return;
  }
  if (!quizQuestions().length) return;
  if (isUnifiedV3()) {
    openReview();
    return;
  }
  quizQuestionOverride = null;
  quizRecoveryCount = 0;
  quizOpen = true;
  quizIndex = 0;
  quizEl.classList.remove("hidden");
  document.body.classList.add("sb-quiz-full");
  renderQuizItem();
}

function closeQuiz() {
  clearQuizRecoveryTimer();
  if (reviewOpen || practiceResultOpen) {
    reviewOpen = false;
    practiceResultOpen = false;
    quizQuestionOverride = null;
    quizRecoveryCount = 0;
    document.body.classList.remove("sb-review-full", "sb-practice-result-full");
    if (reviewEl) { reviewEl.classList.add("hidden"); reviewEl.innerHTML = ""; }
    render();
    btnNext.focus();
    return;
  }
  quizOpen = false;
  quizQuestionOverride = null;
  quizRecoveryCount = 0;
  document.body.classList.remove("sb-quiz-full");
  quizEl.innerHTML = "";
  render();
  btnNext.focus();
}

function finishQuiz() {
  if (practiceState && isUnifiedV3()) {
    const finalSummary = BookPlayStorybookPractice.practiceSummary(practiceState);
    saveQuizResult(finalSummary);
    quizOpen = false;
    practiceResultOpen = true;
    document.body.classList.remove("sb-quiz-full");
    document.body.classList.add("sb-practice-result-full");
    quizEl.classList.add("hidden");
    renderPracticeResult();
    savePracticeSummary(finalSummary);
    saveProgress(true);
    return;
  }
  quizOpen = false;
  document.body.classList.remove("sb-quiz-full");
  quizEl.innerHTML = "";
  sayFeedback("本章小测完成了！");
  endNav.classList.remove("hidden");
}

function renderQuizItem() {
  const quiz = quizQuestions();
  quizEl.innerHTML = "";
  const q = practiceState && practiceState.questions.length
    ? practiceState.questions[quizIndex]
    : quiz[quizIndex];
  if (!q) { finishQuiz(); return; }
  const display = quizDisplayFor(q);
  const isListen = q.type === "listen-choice";
  const isContextFill = q.type === "context-fill";
  const clipAudio = (isListen || isContextFill) ? quizSourceSentenceAudio(q) : null;
  const head = document.createElement("div");
  head.className = "sb-quiz-head";
  const kicker = document.createElement("p");
  kicker.className = "sb-section-label";
  kicker.textContent = `Book challenge · ${quiz.length} questions`;
  const title = document.createElement("h2");
  title.textContent = "章末小测";
  head.append(kicker, title);
  const card = document.createElement("div");
  card.className = "sb-quiz-card";
  const index = document.createElement("p");
  index.className = "sb-quiz-index";
  index.textContent = `第 ${quizIndex + 1} 题 / 共 ${quiz.length} 题`;
  const questionRow = document.createElement("div");
  questionRow.className = "sb-quiz-question-row";
  const question = document.createElement("h3");
  question.textContent = display.promptEn;
  questionRow.append(question);
  if (clipAudio) {
    // 听音选句 / 选词填空：喇叭播放原句切片，而不是合成朗读挖空文本
    const play = createQuizSpeaker("🔊", "原句发音");
    play.classList.add("sb-quiz-audio-play");
    play.addEventListener("click", () => playQuizSentenceClip(clipAudio));
    questionRow.append(play);
  } else {
    questionRow.append(createQuizSpeaker(display.promptEn, "题目"));
  }
  const options = document.createElement("div");
  options.className = "sb-quiz-options";
  const feedback = document.createElement("p");
  feedback.className = "sb-quiz-feedback";
  feedback.setAttribute("aria-live", "polite");
  display.choicesEn.forEach((c, i) => {
    const optionRow = document.createElement("div");
    optionRow.className = "sb-quiz-option-row";
    const b = document.createElement("button");
    b.type = "button";
    b.className = "sb-quiz-option";
    const badge = document.createElement("span");
    badge.textContent = QUIZ_LETTERS[i] || String(i + 1);
    b.append(badge, document.createTextNode(c));
      b.addEventListener("click", () => {
        if (b.disabled) return;
        if (practiceState) practiceState = BookPlayStorybookPractice.answerQuestion({ ...practiceState, index: quizIndex }, i);
        const correct = i === q.answer;
        recordQuizAnswer(q, correct);
        if (correct) {
          b.classList.add("is-correct");
          feedback.textContent = `✓ 答对了。${q.explanation || `正确答案是 ${QUIZ_LETTERS[q.answer] || q.choices[q.answer]}。`}`;
        feedback.classList.remove("is-wrong");
        saveProgress(true);
      } else {
        b.classList.add("is-wrong");
        feedback.textContent = `✗ 答错了。正确答案是 ${QUIZ_LETTERS[q.answer] || display.choicesEn[q.answer]}：${display.choicesEn[q.answer]}`;
        feedback.classList.add("is-wrong");
      }
      options.querySelectorAll(".sb-quiz-option").forEach((o) => { o.disabled = true; });
    });
    optionRow.append(b, createQuizSpeaker(c, `选项 ${QUIZ_LETTERS[i] || String(i + 1)}`));
    options.appendChild(optionRow);
  });
  card.append(index, questionRow);
  appendQuizHint(card, display, `item-${quizIndex}`);
  card.append(options, feedback);
  quizEl.append(head, card);
  // 进入章节测试（及每次翻题）自动朗读：普通题合成朗读题干，听音/填空题播放原句
  if (quizAutoSpeakTimer) clearTimeout(quizAutoSpeakTimer);
  quizAutoSpeakTimer = setTimeout(() => {
    if (clipAudio) playQuizSentenceClip(clipAudio);
    else {
      const speaker = card.querySelector(".sb-quiz-question-row .sb-quiz-speaker");
      if (speaker) speaker.click();
    }
  }, 350);

  const nav = document.createElement("div");
  nav.className = "sb-quiz-nav";
  if (quizIndex > 0) {
    const prev = document.createElement("button");
    prev.type = "button";
    prev.className = "sb-quiz-nav-button";
    prev.textContent = "← 上一题";
    prev.addEventListener("click", () => { quizIndex -= 1; renderQuizItem(); });
    nav.appendChild(prev);
  }
  const progress = document.createElement("span");
  progress.className = "sb-quiz-progress";
  progress.textContent = `第 ${quizIndex + 1} / ${quiz.length} 题`;
  nav.appendChild(progress);
  const next = document.createElement("button");
  next.type = "button";
  next.className = "sb-quiz-nav-button sb-quiz-nav-primary";
  if (quizIndex < quiz.length - 1) {
    next.textContent = "下一题 →";
    next.addEventListener("click", () => { quizIndex += 1; renderQuizItem(); });
  } else {
    next.textContent = "完成";
    next.addEventListener("click", finishQuiz);
  }
  nav.appendChild(next);
  quizEl.appendChild(nav);
}

async function loadMikeyVocabAudioIndex() {
  const target = request.series === "mikey-jj"
    ? { series: "mikey-jj", url: "../assets/mikey-jj/vocab/index.json" }
    : request.series === "minecraft"
      ? { series: "minecraft", url: "../assets/minecraft/vocab/index.json" }
      : null;
  if (!target) return;
  try {
    // Keep the two published paths explicit: this makes the runtime contract
    // easy to audit and preserves compatibility with older cached packs.
    const response = target.series === "mikey-jj"
      ? await fetch("../assets/mikey-jj/vocab/index.json", { cache: "no-store" })
      : await fetch("../assets/minecraft/vocab/index.json", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    if (payload && payload.series === target.series && payload.terms && typeof payload.terms === "object") {
      if (target.series === "mikey-jj") mikeyVocabAudio = payload;
      else minecraftVocabAudio = payload;
    }
  } catch (_) {
    // Static audio is an enhancement; the normal /api/tts path remains the
    // fallback when an older data pack does not ship the manifest.
  }
}

async function loadMinecraftQuizAudioIndex() {
  if (request.series !== "minecraft") return;
  try {
    const response = await fetch("../assets/minecraft/quiz/index.json", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    if (payload && payload.series === "minecraft" && payload.text_audio) minecraftQuizAudio = payload;
  } catch (_) {
    // Older data packs continue to use the normal vocab/TTS fallback.
  }
}

async function loadMikeyQuizAudioIndex() {
  if (request.series !== "mikey-jj") return;
  try {
    const response = await fetch("../assets/mikey-jj/quiz/index.json", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    if (payload && payload.series === "mikey-jj" && payload.text_audio) mikeyQuizAudio = payload;
  } catch (_) {
    // Older packs continue to use the normal WalaMedia TTS fallback.
  }
}

async function main() {
  let r;
  try {
    r = await fetch(request.dataUrl, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    book = await r.json();
  } catch (error) {
    const gate = window.BookPlayContentGate;
    if (gate) {
      gate.showImportPrompt({ series: request.series, id: ep });
    } else {
      document.body.textContent = `绘本 ${ep} 暂未导入，请选择对应数据包。`;
    }
    return;
  }
  await loadMikeyVocabAudioIndex();
  await loadMikeyQuizAudioIndex();
  await loadMinecraftQuizAudioIndex();
  await loadPublishedBookIds();
  setupStudyReplayQueue();
  prepareEpisodeQuiz();
  storybookRewardCatalog = await loadStorybookRewardCatalog();
  storybookRewardState = readStorybookRewardState();
  storybookAssetManifest = await loadStorybookAssetManifest();
  if (storybookAssetManifest && Array.isArray(storybookAssetManifest.assets)) {
    const quizAsset = storybookAssetManifest.assets.find((asset) => asset.kind === "quiz-background" && asset.runtime_path);
    if (quizAsset && quizEl) {
      const mask = request.series === "minecraft"
        ? "radial-gradient(circle at 20% 15%, rgba(150, 200, 120, 0.14), transparent 42%),"
        : "radial-gradient(circle at 20% 15%, rgba(255, 255, 255, 0.1), transparent 42%),";
      quizEl.style.backgroundImage = `${mask} url(${JSON.stringify(runtimeAssetUrl(quizAsset.runtime_path))})`;
    }
    const reviewAsset = storybookAssetManifest.assets.find((asset) => asset.kind === "review-background" && asset.runtime_path);
    if (reviewAsset && reviewEl) {
      const reviewBackground = `url(${JSON.stringify(runtimeAssetUrl(reviewAsset.runtime_path))})`;
      reviewEl.style.setProperty("--sb-review-bg", reviewBackground);
      // The full-screen backdrop lives on #sb-panel, one level above the
      // review content. Set the custom property on both nodes so the image
      // remains available to either layout without relying on upward CSS
      // inheritance (which browsers do not provide).
      if (reviewEl.parentElement) reviewEl.parentElement.style.setProperty("--sb-review-bg", reviewBackground);
    }
  }
  if (book.layout === "spread_with_right_caption") document.body.classList.add("storybook-split");
  if (request.series === "minecraft") document.body.classList.add("sb-mc");
  if (request.series === "mikey-jj") document.body.classList.add("sb-mj");
  if (request.series === "minecraft" || request.series === "mikey-jj") {
    captionLabelEl = document.createElement("p");
    captionLabelEl.className = "sb-section-label";
    captionLabelEl.textContent = "Story · 原文字幕";
    dialogueEl.insertBefore(captionLabelEl, textEl);
    const chip = document.createElement("div");
    chip.id = "sb-progress-chip";
    chip.className = "sb-progress-chip";
    $("sb-stage").appendChild(chip);
    zhLineEl = zhEl;
  }
  if (isUnifiedV3() && (request.series === "minecraft" || request.series === "mikey-jj")) {
    const preferences = BookPlayStorybookUI.readPreferences(preferenceStorage(), request.series);
    readerState.mode = BookPlayStorybookUI.resolveReaderMode(request.series, preferences.mode);
    readerState.translation = preferences.translation !== false;
  }
  renderReaderModes();
  document.title = `豆豆龙英语 · ${book.title.en}`;
  const unit = request.series === "minecraft" || request.series === "mikey-jj" ? "本" : "集";
  titleEl.textContent = `第 ${ep} ${unit} · ${book.title.en}`;
  $("btn-shelf").href = request.shelfUrl;
  const dubBtn = $("btn-dub");
  if (dubBtn) {
    dubBtn.href = request.series === "jttw"
      ? `dub.html?ep=${ep}`
      : `dub.html?series=${request.series}&book=${ep}`;
  }
  if (book.audio) {
    audio.src = `../${book.audio}`;
  } else {
    btnAudio.disabled = true;
    btnAudio.textContent = "暂无原音";
    btnAudio.title = "资料库中没有与这本 PDF 匹配的 MP3";
  }
  if (useBeats()) beats = flattenBeats();
  const progress = loadProgress();
  const saved = progress[progressKey] || (request.series === "jttw" ? progress[ep] : null);
  episodeFullComplete = Boolean(saved && (saved.episode_complete || saved.done));
  if (useBeats()) {
    if (saved && saved.beat) bidx = Math.min(beats.length - 1, Math.max(0, saved.beat - 1));
    else bidx = 0;
  } else if (saved && saved.page) {
    idx = Math.min(book.pages.length - 1, Math.max(0, saved.page - 1));
  }
  const nextBook = nextPublishedBookId(ep);
  const nextHref = request.series === "minecraft"
    ? (nextBook == null ? request.shelfUrl : `storybook.html?series=minecraft&book=${nextBook}&ui=unified-v3`)
    : request.series === "mikey-jj"
      ? (nextBook == null ? request.shelfUrl : `storybook.html?series=mikey-jj&book=${nextBook}&ui=unified-v3`)
      : `storybook.html?ep=${ep + 1}`;
  $("btn-next-ep").href = nextHref;
  $("btn-next-ep").textContent = nextBook == null && (request.series === "minecraft" || request.series === "mikey-jj")
    ? "回目录"
    : `下一${unit} 第 ${nextBook ?? ep + 1} ${unit}`;
  render();
  if (request.series !== "minecraft" && request.series !== "mikey-jj") renderQuiz();
  // Mikey & JJ uses reader-paced playback: do not start narration until the
  // child clicks "下一句" or "▶ 本句". This also avoids a blocked autoplay
  // attempt on first load.
  if (useSentenceMode() && request.series !== "mikey-jj") playActiveSentence();

  if (readerModesEl) {
    readerModesEl.querySelectorAll("[data-reader-mode]").forEach((button) => {
      button.addEventListener("click", () => setReaderMode(button.dataset.readerMode));
    });
  }
  if (studyReplayButton) studyReplayButton.addEventListener("click", startStudyReplay);
  if (studyReplaySkipButton) studyReplaySkipButton.addEventListener("click", skipStudyScene);
  if (translationToggleEl) {
    translationToggleEl.addEventListener("click", () => {
      readerState.translation = !readerState.translation;
      if (isUnifiedV3()) {
        BookPlayStorybookUI.writePreferences(preferenceStorage(), request.series, {
          mode: readerState.mode,
          translation: readerState.translation,
        });
      }
      render();
      translationToggleEl.focus();
    });
  }

  btnPrev.addEventListener("click", () => {
    if (useBeats()) {
      if (bidx > 0) { invalidateNavigation(); bidx -= 1; holding = false; render(); seekToUnit(); }
      return;
    }
    const sents = pageSentences(book.pages[idx]);
    if (sents) {
      if (sentIdx > 0) { invalidateNavigation(); sentIdx -= 1; render(); seekToUnit(); playActiveSentence(); }
      else if (idx > 0) { invalidateNavigation(); idx -= 1; sentIdx = (pageSentences(book.pages[idx]) || []).length - 1; render(); seekToUnit(); playActiveSentence(); }
      return;
    }
    if (idx > 0) { invalidateNavigation(); idx -= 1; render(); seekToUnit(); }
  });
  btnNext.addEventListener("click", () => {
    if (mustChoose()) {
      sayFeedback("先选一个，再继续。");
      return;
    }
    if (useBeats()) {
      if (bidx < beats.length - 1) {
        invalidateNavigation();
        bidx += 1;
        holding = false;
        render();
        seekToUnit();
        if (!audio.paused) setTalking(true);
      } else {
        quizEl.scrollIntoView({ behavior: "smooth" });
      }
      return;
    }
    const sents = pageSentences(book.pages[idx]);
    if (sents) {
      const lastSent = sentIdx === sents.length - 1;
      if (!lastSent) {
        invalidateNavigation();
        sentIdx += 1;
        render();
        seekToUnit();
        playActiveSentence();
      } else if (idx < book.pages.length - 1) {
        invalidateNavigation();
        idx += 1;
        sentIdx = 0;
        render();
        seekToUnit();
        playActiveSentence();
      } else {
        openQuiz();
      }
      return;
    }
    if (idx < book.pages.length - 1) { invalidateNavigation(); idx += 1; render(); seekToUnit(); }
    else openQuiz();
  });
  textEl.addEventListener("click", (ev) => {
    const mark = ev.target.closest("mark");
    if (!mark) return;
    sayFeedback(`${mark.dataset.term} — ${mark.dataset.zh}（已收入生词本）`);
    saveWord(mark.dataset.term, mark.dataset.zh);
  });
  btnAudio.addEventListener("click", async () => {
    if (audio.paused) {
      seekToUnit();
      holding = false;
      try {
        if (speakable() || useSentenceMode()) {
          playActiveSentence();
        } else {
          await audio.play();
        }
        btnAudio.textContent = "❚❚ 暂停";
        setTalking(true);
        if (useBeats() || useSentenceMode()) sayFeedback("正在读这一句。");
      } catch (err) {
        if (err && err.name === "NotAllowedError") {
          playbackState.unlockRequired = true;
          showAutoplayUnlockNotice();
        } else {
          sayFeedback("本句暂时无法播放。");
        }
      }
    } else {
      audio.pause();
      btnAudio.textContent = (useBeats() || useSentenceMode()) ? "▶ 本句" : "▶ 朗读";
      setTalking(false);
    }
  });
  audio.addEventListener("ended", () => {
    btnAudio.textContent = (useBeats() || useSentenceMode()) ? "▶ 本句" : "▶ 朗读";
    setTalking(false);
    if (useSentenceMode()) {
      const sentence = book && book.pages[idx] && book.pages[idx].sentences
        ? book.pages[idx].sentences[sentIdx]
        : null;
      const canAdvance = request.series !== "mikey-jj" && BookPlayStorybookUI.shouldAutoAdvance({
        mode: readerState.mode,
        unlocked: readerState.audioUnlocked,
        hasAudio: Boolean(sentenceClip(sentence)),
      });
      if (canAdvance) queueSentenceAdvance();
      else sayFeedback("这一句读完了。点下一句或再听一遍。");
    }
    clearSentenceWordHighlight();
    if (speakable()) {
      // REPAIR r3: natural end -> keep the 600ms linger; the browser's trailing
      // pause event must not cancel it (pause listener checks naturalEnd)
      playbackState.naturalEnd = true;
      hideSpeakingBubble();
    }
  });
  audio.addEventListener("playing", () => {
    playbackState.naturalEnd = false; // REPAIR r4: 新播放复位，防止上次自然结束污染此后的手动暂停
    markAudioUnlocked();
    if (speakable()) showSpeakingBubble();
  });
  audio.addEventListener("pause", () => {
    // 浏览器先发 pause 后发 ended：自然结束时 audio.ended 已为 true，此 pause 不 immediate hide，
    // 交由 ended 监听维持 600ms 淡出；手动暂停 audio.ended=false 仍立即隐藏。
    if (speakable() && !playbackState.wordSpeaking && !audio.ended) hideSpeakingBubble({ immediate: true });
  });
  audio.addEventListener("timeupdate", () => {
    if (seeking || audio.paused) return;
    const t = audio.currentTime;
    if (speakable() && !playbackState.wordSpeaking) syncBubbleWords(t * 1000);
    if ((request.series === "minecraft" || request.series === "mikey-jj")
      && useSentenceMode() && !playbackState.wordSpeaking) syncSentenceWordHighlight(t);
    if (useBeats()) {
      const beat = current();
      if (beat.end_sec != null && t >= beat.end_sec - 0.06) {
        audio.pause();
        holding = true;
        btnAudio.textContent = "▶ 本句";
        setTalking(false);
        audio.currentTime = Math.max((beat.end_sec || t) - 0.05, beat.start_sec || 0);
        renderBeat();
      }
      return;
    }
    if (useSentenceMode()) return; // 派生句段：片段自身 0..duration 播放，靠 ended 停，不套整书绝对秒数
    if (book.pages[0].start_sec == null) return;
    const cur = book.pages[idx];
    if (cur.choice && !savedChoice(cur.page_no) && t >= (cur.end_sec || 0)) {
      audio.pause();
      btnAudio.textContent = "▶ 朗读";
      audio.currentTime = Math.max((cur.end_sec || t) - 0.05, cur.start_sec || 0);
      sayFeedback("先选一个，再继续听。");
      return;
    }
    const next = book.pages.findIndex((p) => t >= (p.start_sec || 0) && t < (p.end_sec || 1e9));
    if (next >= 0 && next !== idx) { idx = next; render(); }
  });
  wordAudio.addEventListener("playing", () => {
    if (!isUnifiedV3() && canLocateBubble()) updateBubbleLocator(currentMikeySentence());
    else if (speakable()) showSpeakingBubble();
  });
  wordAudio.addEventListener("error", () => {
    // The static storybook clip may 404 in an older pack and immediately retry
    // through /api/tts.  Do not tear down the bubble or speaking state while
    // that guarded fallback is still pending.
    if (playbackState.pendingWordResolve) return;
    playbackState.wordSpeaking = false;
    if (!isUnifiedV3()) hideBubbleLocator();
    sayFeedback("单词朗读暂时不可用。");
  });
  if (unlockBtn) {
    unlockBtn.addEventListener("click", () => {
      playbackState.unlockRequired = false;
      unlockBtn.hidden = true;
      playCurrentSentence();
    });
  }
  if (readerNoticeActionEl) {
    readerNoticeActionEl.addEventListener("click", () => {
      playbackState.unlockRequired = false;
      clearReaderNotice();
      playCurrentSentence();
      readerNoticeActionEl.focus();
    });
  }
  window.addEventListener("resize", () => {
    applyPageView();
    const s = currentSpeakingSentence();
    if (s) {
      if (isUnifiedV3()) positionPopupBubble();
      else updateBubbleLocator(s);
    }
  });
  pageImg.addEventListener("load", () => {
    applyPageView();
    const s = currentSpeakingSentence();
    if (s) {
      if (isUnifiedV3()) positionPopupBubble();
      else updateBubbleLocator(s);
    }
  });
  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(() => {
      const s = currentSpeakingSentence();
      if (s && isUnifiedV3()) positionPopupBubble();
      else if (s) updateBubbleLocator(s);
    });
    observer.observe($("sb-stage-inner"));
  }
  window.addEventListener("pagehide", stopAllSpeaking);
  window.addEventListener("beforeunload", stopAllSpeaking);
  $("btn-wordbook").addEventListener("click", () => {
    const items = loadWordbook();
    sayFeedback(items.length
      ? items.map((w) => `${w.term} — ${w.zh}`).join(" · ")
      : "生词本还是空的。");
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && (quizOpen || reviewOpen || practiceResultOpen)) {
      ev.preventDefault();
      closeQuiz();
      return;
    }
    // 重点词按钮自身处理 Enter/Space；全局快捷键不得吞掉它
    if (ev.target && ev.target.closest && (ev.target.closest("button.sb-bubble-word") || ev.target.closest(".sb-word-card") || ev.target.closest(".sb-sentence-word") || ev.target.closest("#sb-reader-modes button") || ev.target.closest("#sb-translation-toggle") || ev.target.closest("input, textarea, select"))) return;
    if (ev.key === "ArrowRight" || ev.key === " ") { ev.preventDefault(); btnNext.click(); }
    if (ev.key === "ArrowLeft") btnPrev.click();
  });
}

main().catch((err) => { document.body.textContent = String(err); });
