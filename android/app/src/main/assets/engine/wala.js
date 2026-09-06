"use strict";

/* 瓦拉风格主界面：冒险地图 / 场景播放器（自动播放+内嵌题）/ 知识回顾
 * 音频引擎与 adventure.js 同构：EN / EN+中 双模式，单词原音截取优先，中文 edge-tts 片段
 */

/* 存储合同仍为 bookplay_read_mode / bookplay_annot / bookplay_pass_mode /
 * bookplay_learn_level / bookplay_lesson_settings_v1 / bookplay_play_rate /
 * bookplay_adv_progress / bookplay_adv_vocab_stat / bookplay_sp。
 */
const storage = WalaStorage.create(localStorage);
const reviewQueue = window.WalaReviewQueue;

const $ = (id) => document.getElementById(id);
const el = {
  map: $("wala-map"), player: $("wala-player"), review: $("wala-review"),
  path: $("w-path"), sp: $("w-sp"), sp2: $("w-sp2"),
  reviewBtn: $("w-review"), listen: $("w-listen"),
  listenBar: $("w-listen-bar"), listenProgress: $("w-listen-progress"),
  listenPause: $("w-listen-pause"), listenExit: $("w-listen-exit"),
  breakCard: $("w-break-card"), breakRest: $("w-break-rest"), breakListen: $("w-break-listen"),
  breakContinue: $("w-break-continue"), breakCountdown: $("w-break-countdown"),
  listenPanel: $("w-listen-panel"), listenLoops: $("w-listen-loops"),
  listenStart: $("w-listen-start"), listenPanelClose: $("w-listen-panel-close"),
  listenDone: $("w-listen-done"), listenReturn: $("w-listen-return"), listenAgain: $("w-listen-again"),
  back: $("w-back"), epTitle: $("w-ep-title"), dub: $("w-dub"),
  modeEn: $("w-mode-en"), modeEnZh: $("w-mode-enzh"),
  annotOn: $("w-annot-on"), annotOff: $("w-annot-off"), autoBtn: $("w-auto"),
  sideCardsOn: $("w-sidecards-on"), sideCardsOff: $("w-sidecards-off"),
  passStory: $("w-pass-story"), passStudy: $("w-pass-study"),
  lvLite: $("w-lv-lite"), lvStd: $("w-lv-std"), lvMax: $("w-lv-max"),
  gradeG12: $("w-grade-g1-2"), gradeG34: $("w-grade-g3-4"), gradeG56: $("w-grade-g5-6"),
  intensityLight: $("w-intensity-light"), intensityStandard: $("w-intensity-standard"), intensityChallenge: $("w-intensity-challenge"),
  rateSlow: $("w-rate-slow"), rateNorm: $("w-rate-norm"), rateFast: $("w-rate-fast"),
  gear: $("w-gear"), settings: $("w-settings-panel"),
  wordcard: $("w-wordcard"),
  frame: document.querySelector(".w-frame"),
  img: $("w-img"), video: $("w-video"),
  enPlay: $("w-en-play"), zhPlay: $("w-zh-play"), zhRow: $("w-zh-row"),
  en: $("w-en"), zh: $("w-zh"), dots: $("w-dots"),
  bubble: document.querySelector(".w-bubble"),
  cards: $("w-cards"), cardsLeft: $("w-cards-left"), vocabPeek: $("w-vocab-peek"), puzzle: $("w-puzzle"),
  prev: $("w-prev"), next: $("w-next"), pager: $("w-pager"), avatar: $("w-avatar"),
  rback: $("w-rback"), rtitle: $("w-rtitle"), rbody: $("w-rbody"),
  end: $("wala-end"), quiz: $("w-quiz"), nextEp: $("w-next-ep"),
};

const params = new URLSearchParams(location.search);
const ep = parseInt(params.get("ep") || "", 10);
const voiceSttQuery = String(params.get("voiceStt") || "").trim();
let voicePort = null;
let voiceCapabilities = { mic: false, asr: false };
try {
  voicePort = window.WalaVoice && typeof window.WalaVoice.create === "function"
    ? window.WalaVoice.create({ endpoint: voiceSttQuery })
    : null;
  voiceCapabilities = voicePort && typeof voicePort.capabilities === "function"
    ? voicePort.capabilities() || voiceCapabilities
    : voiceCapabilities;
} catch (_) {
  voicePort = null;
}
const micReady = Boolean(voiceCapabilities.mic && voiceCapabilities.asr && voicePort
  && typeof voicePort.listen === "function");
const listenQuery = params.get("mode") === "listen";
const listenQueryLoops = params.get("loops");
const audioOnlyListenQuery = /^(audio|listen)$/i.test(String(params.get("visual") || "").trim());
const studyThresholdQuery = Number(params.get("study_threshold"));
const passModeQuery = params.get("passMode") || params.get("pass") || (params.get("mode") === "study" ? "study" : "");
const readModeQuery = params.get("subtitle") || params.get("readMode") || "";
const sideCardsQuery = params.get("sidecards") || params.get("sideCardsOn");
const annotQuery = params.get("annot");
const reviewReturnQuery = params.get("return") || "";
const reviewContext = params.get("review") === "1" || !!reviewReturnQuery;
const requestedNodeQuery = params.get("node") || params.get("node_id") || "";

function queryReadMode(value, fallback) {
  return value === "en" || value === "enzh" ? value : fallback;
}
function queryBoolean(value, fallback) {
  if (!value) return fallback;
  return /^(1|true|on|yes)$/i.test(String(value).trim());
}
function querySideCards(value, fallback) {
  return queryBoolean(value, fallback);
}
function safeReviewReturn(value) {
  if (!value) return "";
  try {
    const url = new URL(value, location.href);
    /* 只允许回到本站 drill.html，避免 return 参数变成开放跳转。 */
    if (!/\/drill\.html$/i.test(url.pathname)) return "";
    if (url.origin !== location.origin && !(url.protocol === location.protocol && location.origin === "null")) return "";
    return url.href;
  } catch (_) {
    return "";
  }
}
const reviewReturnUrl = safeReviewReturn(reviewReturnQuery);

let book = null;
let idx = 0;
let curText = "";
let autoPlay = false;
let readMode = queryReadMode(readModeQuery, storage.readMode());
let annotOn = queryBoolean(annotQuery, storage.readAnnot());
let sideCardsOn = querySideCards(sideCardsQuery, storage.readSideCards());
let passMode = "story";
let learnLevel = storage.readLearnLevel();
let lessonSettings = storage.readLessonSettings();
let playRate = storage.readPlayRate();
let listenMode = false;
let audioOnlyListen = false;
let listenSession = null;
let listenBefore = null;
let studyClock = window.BookPlayStudySession
  ? window.BookPlayStudySession.createStudySession({
    thresholdMs: Number.isFinite(studyThresholdQuery) && studyThresholdQuery > 0
      ? studyThresholdQuery : undefined,
  })
  : null;
let studyHeartbeat = 0;
let breakOpen = false;
let breakPending = false;
let breakTimer = 0;
let breakRemaining = 0;
function applyPlayRate() {
  media.setRate(playRate);
  if (el.rateSlow) el.rateSlow.classList.toggle("active", playRate === 0.75);
  if (el.rateNorm) el.rateNorm.classList.toggle("active", playRate === 1);
  if (el.rateFast) el.rateFast.classList.toggle("active", playRate === 1.25);
}
let rawNodes = null;
let firstSeenNode = {};
let wordCardPlan = {};
let askedThisEp = new Set();
let bagTerms = [];
let actToken = 0;
let actQueue = [];
let wordCardDone = null;
let studyFlushedAt = -1;
let plotQuizAt = {};
let checkpointPlan = { indexes: [], total: 0, byIndex: {} };
let lexIndex = {};
let wordAudio = {}, zhAudio = {}, enAudio = {}, sentEnAudio = {}, sentZhAudio = {};
let episodeFinished = false;

const COMPANION_FALLBACK_STAGE = Object.freeze({
  id: "mysterious-egg",
  name: "神秘龙蛋",
  form: "egg",
  art: "assets/companions/white-dragon/stages/mysterious-egg.png",
  hint: "西海的云纹龙蛋正在等待故事开门。",
});
let companionCatalog = { stages: [COMPANION_FALLBACK_STAGE] };
let companionCollections = [];
let episodeCatalog = {};

/* Episode avatar cast. Each episode resolves one entry once from its title and
 * bilingual narration corpus; setAvatar() only toggles the speaking state, so
 * a long sentence or a re-render cannot make the character jump randomly. */
const WALKING_CAST = Object.freeze({
  wukong: Object.freeze({
    id: "wukong", nameZh: "孙悟空", nameEn: "Sun Wukong",
    gif: "assets/generated/jttw-player-walkers/wukong/wukong-walk.gif",
    atlas: "assets/generated/jttw-player-walkers/wukong/wukong-walk-action-atlas.png",
    titleAliases: [["the monkey", 8], ["the waterfall cave", 5], ["powerful sage", 7], ["peach garden", 5], ["trouble in heaven", 7], ["the bet", 5], ["wukong gets tricked", 8], ["sun kongwu", 8], ["two wukongs", 8], ["battle of the wukongs", 8]],
    aliases: [["悟空", 3], ["齐天大圣", 4], ["美猴王", 4], ["wukong", 3], ["sun wukong", 4], ["monkey king", 4], ["monkey", 0.25]],
  }),
  tang: Object.freeze({
    id: "tang", nameZh: "唐僧", nameEn: "Tang Monk",
    gif: "assets/generated/jttw-player-walkers/tang/tang-walk.gif",
    titleAliases: [["the true scriptures", 5], ["a promise to protect", 6], ["the robe", 5], ["the injured monk", 6], ["two tang monks", 7], ["the scared boy", 4], ["the sad king", 4], ["the tang monk and the river", 7], ["the thunderclap monastery", 6]],
    aliases: [["唐僧", 4], ["唐三藏", 4], ["玄奘", 4], ["tang monk", 4], ["tripitaka", 4], ["monk", 0.8]],
  }),
  bajie: Object.freeze({
    id: "bajie", nameZh: "猪八戒", nameEn: "Zhu Bajie",
    gif: "assets/generated/jttw-player-walkers/bajie/bajie-walk.gif",
    titleAliases: [["bajie takes a nap", 8], ["bajie tries to sleep", 8], ["the treasure in the well", 6], ["magnificent silk vests", 5], ["wind and fog", 5], ["bajie and the monster", 8], ["rewards", 3]],
    aliases: [["猪八戒", 4], ["八戒", 4], ["bajie", 4], ["zhu bajie", 4], ["pigsy", 3], ["pig", 0.8]],
  }),
  shawujing: Object.freeze({
    id: "shawujing", nameZh: "沙悟净", nameEn: "Sha Wujing",
    gif: "assets/generated/jttw-player-walkers/shawujing/shawujing-walk.gif",
    titleAliases: [["the monster in the river", 8], ["the river god", 5], ["the demon under the ice", 6]],
    aliases: [["沙悟净", 4], ["沙僧", 4], ["悟净", 4], ["wujing", 4], ["sha wujing", 4], ["sandy", 3]],
  }),
  guanyin: Object.freeze({
    id: "guanyin", nameZh: "观音", nameEn: "Guanyin",
    gif: "assets/generated/jttw-player-walkers/guanyin/guanyin-walk.gif",
    titleAliases: [["the monster's friend", 6], ["a very strange pill", 6], ["guanyin's vase", 8], ["the goldfish in the basket", 6], ["a question for buddha", 5], ["the star lord", 4]],
    aliases: [["观音菩萨", 5], ["观世音", 5], ["观音", 5], ["guanyin", 5], ["kuan yin", 5], ["goddess of mercy", 4], ["bodhisattva", 2]],
  }),
  redboy: Object.freeze({
    id: "redboy", nameZh: "红孩儿", nameEn: "Red Boy",
    gif: "assets/generated/jttw-player-walkers/redboy/redboy-walk.gif",
    titleAliases: [["red boy", 9], ["magic fire", 8], ["guanyin becomes angry", 6], ["an ocean from a vase", 7], ["the man in the canoe", 6]],
    aliases: [["红孩儿", 6], ["红孩", 6], ["red boy", 6], ["redboy", 6], ["fire child", 4], ["三昧真火", 3], ["samadhi fire", 3], ["magic fire", 2]],
  }),
  ironfan: Object.freeze({
    id: "ironfan", nameZh: "铁扇公主", nameEn: "Princess Iron Fan",
    gif: "assets/generated/jttw-player-walkers/ironfan/ironfan-walk.gif",
    titleAliases: [["the iron immortal", 8], ["the magic fan", 8], ["tricked again and again", 6]],
    aliases: [["铁扇公主", 6], ["铁扇", 6], ["芭蕉扇", 5], ["iron fan", 6], ["princess iron fan", 6], ["iron immortal", 6], ["banana leaf fan", 4], ["magic fan", 3]],
  }),
  bullking: Object.freeze({
    id: "bullking", nameZh: "牛魔王", nameEn: "Bull King",
    gif: "assets/generated/jttw-player-walkers/bullking/bullking-walk.gif",
    titleAliases: [["the mountain of flames", 7]],
    aliases: [["牛魔王", 6], ["牛魔", 6], ["大力牛魔王", 6], ["bull demon king", 6], ["bull king", 6], ["bull demon", 5], ["bull", 0.7]],
  }),
  dragonking: Object.freeze({
    id: "dragonking", nameZh: "东海龙王", nameEn: "East Sea Dragon King",
    gif: "assets/generated/jttw-player-walkers/dragonking/dragonking-walk.gif",
    atlas: "assets/generated/jttw-player-walkers/dragonking/dragonking-walk-action-atlas.png",
    titleAliases: [["the dragon king", 8], ["tea with a dragon", 6]],
    aliases: [["东海龙王", 7], ["龙王", 6], ["龙宫", 4], ["dragon king", 7], ["east sea dragon king", 7], ["dragon palace", 4], ["dragon", 0.35]],
  }),
  chaosdemon: Object.freeze({
    id: "chaosdemon", nameZh: "混世魔王", nameEn: "Demon of Chaos",
    gif: "assets/generated/jttw-player-walkers/chaosdemon/chaosdemon-walk.gif",
    atlas: "assets/generated/jttw-player-walkers/chaosdemon/chaosdemon-walk-action-atlas.png",
    titleAliases: [["the demon of chaos", 10]],
    aliases: [["混世魔王", 9], ["混世", 8], ["demon of chaos", 9], ["chaos demon", 9]],
  }),
  whitedragonhorse: Object.freeze({
    id: "whitedragonhorse", nameZh: "白龙马", nameEn: "White Dragon Horse",
    gif: "assets/generated/jttw-player-walkers/whitedragonhorse/whitedragonhorse-walk.gif",
    titleAliases: [["the dragon in the river", 9], ["help from a dragon", 7]],
    aliases: [["白龙马", 7], ["小白龙", 6], ["白龙", 5], ["white dragon horse", 7], ["dragon horse", 6], ["little white dragon", 5], ["bai long ma", 6]],
  }),
  subodhi: Object.freeze({
    id: "subodhi", nameZh: "菩提祖师", nameEn: "Patriarch Subhuti",
    gif: "assets/generated/jttw-player-walkers/subodhi/subodhi-walk.gif",
    atlas: "assets/generated/jttw-player-walkers/subodhi/subodhi-walk-action-atlas.png",
    titleAliases: [["secret formulas", 9], ["菩提祖师", 9]],
    aliases: [["菩提祖师", 7], ["菩提", 6], ["祖师", 3], ["subhuti", 7], ["patriarch subhuti", 7], ["master subhuti", 6]],
  }),
  jadeemperor: Object.freeze({
    id: "jadeemperor", nameZh: "玉皇大帝", nameEn: "Jade Emperor",
    gif: "assets/generated/jttw-player-walkers/jadeemperor/jadeemperor-walk.gif",
    titleAliases: [["a job in heaven", 6], ["the powerful sage", 4], ["help from heaven", 7]],
    aliases: [["玉皇大帝", 7], ["玉帝", 7], ["jade emperor", 7], ["emperor of heaven", 6], ["heavenly emperor", 6]],
  }),
  yellowwind: Object.freeze({
    id: "yellowwind", nameZh: "黄风大王", nameEn: "Yellow Wind King",
    gif: "assets/generated/jttw-player-walkers/yellowwind/yellowwind-walk.gif",
    titleAliases: [["the great king yellow wind", 9], ["powerful wind magic", 8]],
    aliases: [["黄风大王", 7], ["黄风怪", 7], ["黄风", 6], ["yellow wind king", 7], ["yellow wind demon", 6], ["yellow wind", 5]],
  }),
  whitebone: Object.freeze({
    id: "whitebone", nameZh: "白骨夫人", nameEn: "Lady White Bone",
    gif: "assets/generated/jttw-player-walkers/whitebone/whitebone-walk.gif",
    titleAliases: [["lady whitebone", 9], ["lady white bone", 9], ["whitebone", 9], ["white bone", 8]],
    aliases: [["白骨夫人", 7], ["白骨精", 7], ["white bone demon", 7], ["lady white bone", 7], ["white bone", 5], ["bone demon", 5]],
  }),
  blackwind: Object.freeze({
    id: "blackwind", nameZh: "黑风大王", nameEn: "Black Wind King",
    gif: "assets/generated/jttw-player-walkers/blackwind/blackwind-walk.gif",
    titleAliases: [["the black bear spirit", 8], ["the monster's friend", 8], ["a very strange pill", 8]],
    aliases: [["黑风大王", 7], ["黑风怪", 7], ["黑熊精", 7], ["黑熊", 6], ["black wind king", 7], ["black bear spirit", 7], ["black bear", 6], ["bear spirit", 5]],
  }),
  zhenyuan: Object.freeze({
    id: "zhenyuan", nameZh: "镇元大仙", nameEn: "Great Immortal Zhenyuan",
    gif: "assets/generated/jttw-player-walkers/zhenyuan/zhenyuan-walk.gif",
    titleAliases: [["the ginseng fruit", 8], ["the magic sleeve", 8], ["the frying pan", 7]],
    aliases: [["镇元大仙", 7], ["镇元子", 7], ["大仙", 4], ["great immortal", 7], ["zhenyuan", 7], ["ginseng immortal", 5]],
  }),
  hundredflowers: Object.freeze({
    id: "hundredflowers", nameZh: "百花羞公主", nameEn: "Princess Hundred Flowers",
    gif: "assets/generated/jttw-player-walkers/hundredflowers/hundredflowers-walk.gif",
    titleAliases: [["tricked by the princess", 9], ["a visit to the king", 7], ["tricked again", 8]],
    aliases: [["百花羞", 7], ["百花羞公主", 7], ["公主", 4], ["princess hundred flowers", 7], ["hundred flowers", 6], ["princess", 2]],
  }),
  goldenhorn: Object.freeze({
    id: "goldenhorn", nameZh: "金角大王", nameEn: "Golden Horn",
    gif: "assets/generated/jttw-player-walkers/goldenhorn/goldenhorn-walk.gif",
    titleAliases: [["the injured monk", 8], ["the magic gourd", 9], ["a trade", 8], ["a visit from laozi", 7]],
    aliases: [["金角大王", 7], ["金角", 7], ["golden horn", 7], ["gold horn", 6], ["golden horn demon", 7]],
  }),
  liondemon: Object.freeze({
    id: "liondemon", nameZh: "狮魔王", nameEn: "Lion Demon",
    gif: "assets/generated/jttw-player-walkers/liondemon/liondemon-walk.gif",
    titleAliases: [["the lion demon", 9], ["a problem for the lion demon", 9], ["the elephant demon", 7], ["the raptor demon", 7]],
    aliases: [["狮魔王", 7], ["狮子精", 7], ["青狮", 6], ["lion demon", 7], ["lion king", 6], ["elephant demon", 6], ["raptor demon", 6]],
  }),
  tigerimmortal: Object.freeze({
    id: "tigerimmortal", nameZh: "虎力大仙", nameEn: "Tiger Immortal",
    gif: "assets/generated/jttw-player-walkers/tigerimmortal/tigerimmortal-walk.gif",
    titleAliases: [["the monks and the cart", 8], ["the tiger immortal", 10], ["a guessing game", 8], ["the meditation contest", 8]],
    aliases: [["虎力大仙", 8], ["虎力", 7], ["tiger immortal", 8], ["tiger", 1.2]],
  }),
  yellowbrows: Object.freeze({
    id: "yellowbrows", nameZh: "黄眉怪", nameEn: "Yellow Brows",
    gif: "assets/generated/jttw-player-walkers/yellowbrows/yellowbrows-walk.gif",
    titleAliases: [["the magic cloth", 10], ["the melon field", 8]],
    aliases: [["黄眉怪", 8], ["黄眉大王", 8], ["黄眉", 7], ["yellow brows", 8], ["yellow brow", 7], ["yellow brows demon", 8]],
  }),
  powerdemon: Object.freeze({
    id: "powerdemon", nameZh: "大力妖王", nameEn: "Demon of Power",
    gif: "assets/generated/jttw-player-walkers/powerdemon/powerdemon-walk.gif",
    titleAliases: [["the sad king", 8], ["fire smoke and sand", 9], ["magic bells", 10]],
    aliases: [["大力妖王", 8], ["大力魔王", 8], ["demon of power", 9], ["power demon", 8]],
  }),
  spiderdemon: Object.freeze({
    id: "spiderdemon", nameZh: "蜘蛛精", nameEn: "Spider Spirit",
    gif: "assets/generated/jttw-player-walkers/spiderdemon/spiderdemon-walk.gif",
    titleAliases: [["the three young women", 9], ["the priest's plan", 8]],
    aliases: [["蜘蛛精", 8], ["蜘蛛妖", 8], ["spider spirit", 8], ["spider spirits", 8], ["spider demon", 8]],
  }),
  centipededemon: Object.freeze({
    id: "centipededemon", nameZh: "多目怪", nameEn: "Centipede Spirit",
    gif: "assets/generated/jttw-player-walkers/centipededemon/centipededemon-walk.gif",
    titleAliases: [["many eyes", 10]],
    aliases: [["多目怪", 9], ["蜈蚣精", 9], ["centipede spirit", 9], ["centipede demon", 9], ["demon lord of many eyes", 9], ["many eyes", 8]],
  }),
});
let episodeWalker = null;
let episodeWalkerEpisode = null;
/* c01 章节内的主角是剧情资产的固定绑定，不依赖不完整的标题/台词抓取。 */
const EPISODE_WALKER_OVERRIDES = Object.freeze({
  1: "wukong", 2: "wukong", 3: "subodhi", 4: "subodhi",
  5: "chaosdemon", 6: "dragonking", 7: "wukong",
});

let advanceTimer = 0;
const media = WalaMedia.createController({
  audio: window.BookPlayAudio?.watchMedia(new Audio()) || new Audio(),
  rate: playRate,
  getBook: () => book,
  getEpisode: () => ep,
  getVideo: () => el.video,
  onVideoTime: (time, playing) => syncWordHighlight(time, playing),
  startKaraoke: () => startKaraoke(),
  stopKaraoke: () => stopKaraoke(),
  requestFrame: (callback) => requestAnimationFrame(callback),
  speechSynthesis: "speechSynthesis" in window ? window.speechSynthesis : null,
});
const ensureVideo = () => media.ensureVideo();
const seekVideo = (video, time) => media.seekVideo(video, time);
const unlockSeek = (video) => media.unlockSeek(video);
const playSeq = (items) => {
  clearTimeout(advanceTimer);
  advanceTimer = 0;
  return media.playSequence(items);
};

function clockNow() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now() : Date.now();
}
function localDay() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function persistStudyClock(snapshot) {
  if (!snapshot || !storage.writeStudySession) return;
  storage.writeStudySession({ activeMs: snapshot.activeMs, prompted: snapshot.prompted, day: localDay() });
}
function loadStudyClock() {
  if (!studyClock || !storage.readStudySession) return;
  const saved = storage.readStudySession();
  if (saved && saved.day === localDay()) studyClock.restore(saved, clockNow());
  else studyClock.reset();
}
function studyActivity() {
  if (listenMode || !book || !el.player || el.player.classList.contains("hidden")) return false;
  if (document.visibilityState !== "visible") return false;
  const videoPlaying = el.video && !el.video.paused && !el.video.ended;
  const activeCard = el.bubble && (el.bubble.classList.contains("card-quiz") || el.bubble.classList.contains("card-word"));
  return !!videoPlaying || !!activeCard;
}
function stopStudyHeartbeat() {
  if (!studyHeartbeat) return;
  window.clearInterval(studyHeartbeat);
  studyHeartbeat = 0;
}
function maybeOfferBreak() {
  if (!studyClock || listenMode || breakOpen) return false;
  const snapshot = studyClock.snapshot();
  if ((!breakPending && !snapshot.due) || !studyClock.consumeBreakPrompt()) return false;
  breakPending = false;
  persistStudyClock(studyClock.snapshot());
  showBreakCard();
  return true;
}
function startStudyHeartbeat() {
  if (!studyClock || studyHeartbeat) return;
  studyClock.start(clockNow());
  studyHeartbeat = window.setInterval(() => {
    const snapshot = studyClock.tick(clockNow(), studyActivity());
    persistStudyClock(snapshot);
    if (snapshot.due) breakPending = true;
  }, 1000);
}
function pauseStudyClock() {
  if (!studyClock) return;
  persistStudyClock(studyClock.pause(clockNow()));
}
function resumeStudyClock() {
  if (!studyClock || listenMode) return;
  studyClock.resume(clockNow());
  persistStudyClock(studyClock.snapshot());
}
function clearBreakTimer() {
  if (breakTimer) window.clearInterval(breakTimer);
  breakTimer = 0;
  breakRemaining = 0;
}
function hideBreakCard() {
  clearBreakTimer();
  breakOpen = false;
  if (el.breakCard) {
    el.breakCard.classList.add("hidden");
    el.breakCard.dataset.resting = "";
  }
  if (el.breakRest) el.breakRest.textContent = "休息 5 分钟";
  if (el.breakCountdown) {
    el.breakCountdown.classList.add("hidden");
    el.breakCountdown.textContent = "";
  }
}
function showBreakCard() {
  if (!el.breakCard || listenMode) return;
  stopSeq();
  pauseStudyClock();
  breakOpen = true;
  el.breakCard.classList.remove("hidden");
  if (el.breakRest) el.breakRest.textContent = "休息 5 分钟";
  if (el.breakCountdown) el.breakCountdown.classList.add("hidden");
}
function resumeAfterBreak() {
  hideBreakCard();
  resumeStudyClock();
  if (book && isListenNode(book.nodes[idx])) playCurrentSentence();
}
function startBreakRest() {
  if (!el.breakCard) return;
  clearBreakTimer();
  breakRemaining = 5 * 60;
  el.breakCard.dataset.resting = "1";
  if (el.breakRest) el.breakRest.textContent = "现在继续";
  if (el.breakListen) el.breakListen.disabled = true;
  if (el.breakContinue) el.breakContinue.disabled = true;
  const render = () => {
    if (!el.breakCountdown) return;
    const mm = Math.floor(breakRemaining / 60);
    const ss = String(breakRemaining % 60).padStart(2, "0");
    el.breakCountdown.textContent = `休息倒计时 ${mm}:${ss}`;
    el.breakCountdown.classList.remove("hidden");
  };
  render();
  breakTimer = window.setInterval(() => {
    breakRemaining -= 1;
    if (breakRemaining <= 0) {
      clearBreakTimer();
      if (el.breakListen) el.breakListen.disabled = false;
      if (el.breakContinue) el.breakContinue.disabled = false;
      resumeAfterBreak();
      return;
    }
    render();
  }, 1000);
}
function showListenPanel() {
  if (!el.listenPanel) return;
  pauseStudyClock();
  if (el.listenPanel) el.listenPanel.classList.remove("hidden");
  if (el.breakCard) el.breakCard.classList.add("hidden");
}
function hideListenPanel() {
  if (el.listenPanel) el.listenPanel.classList.add("hidden");
  if (breakOpen && el.breakCard) el.breakCard.classList.remove("hidden");
}
function listenIndexes() {
  return (book && Array.isArray(book.nodes) ? book.nodes : [])
    .map((node, index) => isListenNode(node) ? index : -1)
    .filter((index) => index >= 0);
}
function updateListenBar() {
  if (!el.listenBar) return;
  el.listenBar.classList.toggle("hidden", !listenMode);
  if (!listenSession) return;
  const state = listenSession.snapshot();
  if (el.listenProgress) el.listenProgress.textContent = `第 ${state.loop} / ${state.loops} 遍`;
  if (el.listenPause) el.listenPause.textContent = state.status === "paused" ? "继续" : (state.status === "done" ? "完成" : "暂停");
}
function showListenDone() {
  stopSeq();
  setAvatar(false);
  if (el.video) el.video.pause();
  updateListenBar();
  if (el.listenDone) el.listenDone.classList.remove("hidden");
}
function continueListenAfterSentence() {
  if (!listenMode || !listenSession) return;
  const result = listenSession.advance(idx, listenIndexes());
  updateListenBar();
  if (result.action === "play") {
    goListen(result.index);
    return;
  }
  showListenDone();
}
function enterListenMode(options = {}) {
  if (!book || !window.BookPlayListenMode) return;
  const normalized = window.BookPlayListenMode.normalizeListenOptions(options);
  listenBefore = { idx, passMode, readMode, audioOnly: audioOnlyListen };
  audioOnlyListen = options.audioOnly == null ? audioOnlyListenQuery : Boolean(options.audioOnly);
  listenBefore.audioOnly = audioOnlyListen;
  listenSession = window.BookPlayListenMode.createListenSession({
    loops: normalized.loops,
    subtitle: normalized.subtitle,
    autoStop: normalized.autoStop,
    beforeIndex: idx,
  });
  listenMode = true;
  if (el.frame) el.frame.classList.toggle("audio-only", audioOnlyListen);
  if (el.player) el.player.classList.toggle("audio-only", audioOnlyListen);
  hideBreakCard();
  hideListenPanel();
  if (el.listenDone) el.listenDone.classList.add("hidden");
  if (el.listenLoops) el.listenLoops.value = String(normalized.loops);
  readMode = normalized.subtitle;
  applySubtitle();
  if (el.passStory) el.passStory.classList.add("hidden");
  if (el.passStudy) el.passStudy.classList.add("hidden");
  updateListenBar();
  const first = listenSession.start(listenIndexes());
  if (first.index == null) { showListenDone(); return; }
  goListen(first.index);
}
function exitListenMode() {
  const resume = listenBefore || { idx: 0, passMode: "story" };
  stopSeq();
  listenMode = false;
  audioOnlyListen = false;
  listenSession = null;
  if (el.frame) el.frame.classList.remove("audio-only");
  if (el.player) el.player.classList.remove("audio-only");
  if (el.listenDone) el.listenDone.classList.add("hidden");
  if (el.listenPanel) el.listenPanel.classList.add("hidden");
  updateListenBar();
  if (el.passStory) el.passStory.classList.remove("hidden");
  if (el.passStudy) el.passStudy.classList.remove("hidden");
  passMode = resume.passMode;
  readMode = resume.readMode || readMode;
  applySubtitle();
  idx = Math.max(0, Math.min(book.nodes.length - 1, Number(resume.idx) || 0));
  listenBefore = null;
  if (typeof history !== "undefined" && typeof history.replaceState === "function") {
    const cleanUrl = new URL(location.href);
    cleanUrl.searchParams.delete("mode");
    cleanUrl.searchParams.delete("loops");
    cleanUrl.searchParams.delete("visual");
    history.replaceState({}, "", cleanUrl);
  }
  syncPassButtons();
  render();
  resumeStudyClock();
}

function readDrillProgress() {
  try {
    const value = JSON.parse(localStorage.getItem("bookplay_drill") || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch (_) { return {}; }
}

function resolveCompanionStage() {
  const core = window.BookPlayCompanion;
  if (!core || typeof core.deriveCompanionStage !== "function") return COMPANION_FALLBACK_STAGE;
  return core.deriveCompanionStage({
    catalog: companionCatalog,
    collections: companionCollections,
    progress: storage.readProgress(),
    drills: readDrillProgress(),
  }) || COMPANION_FALLBACK_STAGE;
}

function countAlias(text, alias) {
  const source = String(text || "");
  const escaped = String(alias).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const english = /^[a-z]/i.test(alias);
  const re = new RegExp(english ? `\\b${escaped}\\b` : escaped, "gi");
  return (source.match(re) || []).length;
}

function normalizeTitle(text) {
  return String(text || "")
    .toLocaleLowerCase()
    .replace(/[“”‘’'\".,!?！？：:、，。·()（）\[\]【】]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleSources() {
  const catalogTitle = episodeCatalog?.[ep]?.title || {};
  return [
    book?.title?.zh,
    book?.title?.en,
    catalogTitle.zh,
    catalogTitle.en,
  ].filter(Boolean).map(normalizeTitle).filter(Boolean);
}

function resolveEpisodeWalker() {
  if (episodeWalker && episodeWalkerEpisode === ep) return episodeWalker;
  const explicitId = EPISODE_WALKER_OVERRIDES[ep];
  if (explicitId && WALKING_CAST[explicitId]) {
    episodeWalker = WALKING_CAST[explicitId];
    episodeWalkerEpisode = ep;
    return episodeWalker;
  }
  const title = `${book?.title?.zh || ""} ${book?.title?.en || ""} ${episodeCatalog?.[ep]?.title?.zh || ""} ${episodeCatalog?.[ep]?.title?.en || ""}`;
  const normalizedTitles = titleSources();
  const body = (book?.nodes || []).map((node) => [
    node?.text_en, node?.text_zh, node?.speaker,
  ].filter(Boolean).join(" ")).join(" ");
  const roles = Object.values(WALKING_CAST).map((role) => {
    let score = 0;
    for (const [alias, weight] of role.titleAliases || []) {
      const normalizedAlias = normalizeTitle(alias);
      const exact = normalizedTitles.includes(normalizedAlias);
      score += exact ? weight * 10000 : countAlias(title, alias) * weight * 100;
    }
    // A proper name in the chapter title (for example “红孩儿” or “菩提祖师”)
    // is stronger evidence than a repeated supporting-character mention in the
    // narration body. This also keeps full-title matches ahead of short aliases.
    for (const [alias, weight] of role.aliases) {
      if (normalizedTitles.includes(normalizeTitle(alias))) score += weight * 10000;
    }
    for (const [alias, weight] of role.aliases) {
      score += countAlias(body, alias) * weight;
    }
    return { role, score };
  });
  const max = Math.max(...roles.map((item) => item.score));
  const tied = roles.filter((item) => item.score === max);
  const chosen = max > 0 ? tied[(Number.isFinite(ep) ? ep : 0) % tied.length] : null;
  episodeWalker = (chosen && chosen.role) || WALKING_CAST.wukong;
  episodeWalkerEpisode = ep;
  return episodeWalker;
}

function setAvatar(talking) {
  const stage = resolveCompanionStage();
  const walker = resolveEpisodeWalker();
  const asset = walker?.gif || stage?.art || COMPANION_FALLBACK_STAGE.art;
  const fallbackAsset = stage?.art || COMPANION_FALLBACK_STAGE.art;
  const src = `../${asset}`;
  const fallbackSrc = `../${fallbackAsset}`;
  if (!el.avatar || !src) return;
  let img = el.avatar.querySelector("img");
  if (!img) {
    el.avatar.innerHTML = "";
    img = document.createElement("img");
    el.avatar.appendChild(img);
  }
  const primaryAlt = walker ? `${walker.nameZh} · ${walker.nameEn} · 行走动画` : (stage?.name || COMPANION_FALLBACK_STAGE.name);
  const fallbackLabel = `打开养宠物界面，当前阶段：${stage?.name || COMPANION_FALLBACK_STAGE.name}`;
  /* A stale/partial data pack can contain the JSON but not the selected GIF.
   * Swap to the known companion stage instead of leaving a broken-image icon;
   * if even that fallback is unavailable, hide the image so the avatar shell
   * remains an honest empty state. */
  img.onload = () => { img.hidden = false; };
  img.onerror = () => {
    if (img.getAttribute("src") !== fallbackSrc) {
      img.hidden = false;
      img.alt = stage?.name || COMPANION_FALLBACK_STAGE.name;
      img.src = fallbackSrc;
      el.avatar.dataset.walker = "fallback";
      el.avatar.setAttribute("aria-label", fallbackLabel);
      el.avatar.title = fallbackLabel;
      return;
    }
    img.hidden = true;
    el.avatar.classList.remove("has-face");
  };
  img.alt = primaryAlt;
  img.hidden = false;
  if (img.getAttribute("src") !== src || img.dataset.primarySrc !== src) {
    img.dataset.primarySrc = src;
    img.src = src;
  }
  el.avatar.dataset.walker = walker?.id || "fallback";
  const avatarLabel = walker
    ? `打开养宠物界面，第 ${ep} 集主角：${walker.nameZh}，${walker.nameEn}，行走动画`
    : fallbackLabel;
  el.avatar.setAttribute("aria-label", avatarLabel);
  el.avatar.title = avatarLabel;
  el.avatar.classList.add("has-face");
  el.avatar.classList.toggle("talk", Boolean(talking));
}

async function loadCompanionData() {
  const [catalog, collectionData] = await Promise.all([
    j("../data/companions/white-dragon.json").catch(() => null),
    j("../data/dialogue_stories/collections.json").catch(() => null),
  ]);
  if (catalog && Array.isArray(catalog.stages) && catalog.stages.length) companionCatalog = catalog;
  if (collectionData && Array.isArray(collectionData.collections)) companionCollections = collectionData.collections;
}

/* ---------- 工具 ---------- */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]));
const j = (u) => fetch(u, { cache: "no-store" }).then((r) => {
  if (!r.ok) throw new Error(u + " " + r.status);
  return r.json();
});
async function mergeQuizAudio() {
  const [qe, qz] = await Promise.all([
    j("../assets/adv_audio/quiz_en_index.json").catch(() => ({})),
    j("../assets/adv_audio/quiz_zh_index.json").catch(() => ({})),
  ]);
  sentEnAudio = Object.assign({}, sentEnAudio, qe);
  sentZhAudio = Object.assign({}, sentZhAudio, qz);
}
const getSP = () => storage.getSP();
const addSP = (k) => { storage.addSP(k); renderSP(); };
function renderSP() { el.sp.textContent = getSP(); el.sp2.textContent = getSP(); }
function progress() { return storage.readProgress(); }
function vstat() { return storage.readVocabStats(); }
function rawIndex() {
  const n = book && book.nodes ? book.nodes[idx] : null;
  if (!n || !rawNodes) return idx;
  const base = String(n.node_id || "").split("__ex__")[0];
  const i = rawNodes.findIndex((x) => x.node_id === base);
  return i >= 0 ? i : idx;
}
function saveProgress(done) {
  if (reviewContext) return;
  const total = (rawNodes || (book && book.nodes) || []).length;
  storage.saveEpisodeProgress(ep, rawIndex() + 1, total, done);
}

/* ---------- 朗读序列引擎（EN / EN+中） ---------- */
function stopSeq() {
  actToken++;
  actQueue = [];
  wordCardDone = null;
  clearTimeout(advanceTimer);
  advanceTimer = 0;
  media.cancel();
  if (voicePort && typeof voicePort.stop === "function") voicePort.stop();
}
const ttsUrl = WalaMedia.ttsUrl;
const normSent = WalaMedia.normSent;
const sentClip = WalaMedia.sentClip;
function audioItem(text, lang) {
  const raw = normSent(text);
  if (!raw) return null;
  const zh = (lang || "").startsWith("zh");
  const code = zh ? "zh-CN" : "en-US";
  const clip = sentClip(zh ? sentZhAudio : sentEnAudio, raw)
    || lookupClip(zh ? zhAudio : enAudio, raw)
    || (!zh && lookupClip(wordAudio, raw));
  return { clip: clip ? "../" + clip : ttsUrl(raw, code), tts: raw, lang: code };
}
function sentItem(map, text, lang) {
  return audioItem(text, lang);
}
function edgeItems(text, lang) {
  const it = audioItem(text, lang);
  return it ? [it] : [];
}
function quizQItems(q) {
  if (q.review_term) {
    const items = termItems(q.review_term, "");
    const zh = q.q_zh || `${q.review_term} 是什么意思？`;
    items.push(...edgeItems(zh, "zh-CN"));
    return items;
  }
  return edgeItems(q.q, "en-US");
}
function quizChoiceItems(en, zh) {
  const items = edgeItems(en, "en-US");
  if (zh) items.push(...edgeItems(zh, "zh-CN"));
  return items;
}
function wordCardItems(w, exEn, exZh) {
  const items = [];
  const term = audioItem(w.term, "en-US");
  if (term) items.push(term);
  if (exEn) items.push(...edgeItems(exEn, "en-US"));
  if (exZh) items.push(...edgeItems(exZh, "zh-CN"));
  return items;
}
const lookupClip = WalaMedia.lookupClip;
const zhItems = (zh) => edgeItems(zh, "zh-CN");
function termItems(term, zh) {
  const items = edgeItems(term, "en-US");
  if (readMode === "enzh") items.push(...zhItems(zh));
  return items;
}

function wordReadFeedback(result) {
  const fallback = { message: "这台设备不能跟读，听老师读也很好", tone: "fallback", showScore: false };
  if (!window.WalaVoiceCore || typeof window.WalaVoiceCore.feedbackFor !== "function") return fallback;
  return window.WalaVoiceCore.feedbackFor(result || { kind: "unsupported" }) || fallback;
}

function bindWordRead(box, card) {
  if (!micReady || !box || !card || !card.term) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "vread";
  button.textContent = "🎤 跟读";
  button.title = "听示范后跟读";
  button.setAttribute("aria-label", `跟读 ${card.term}`);
  const feedback = document.createElement("div");
  feedback.className = "vread-feedback";
  feedback.setAttribute("role", "status");
  feedback.setAttribute("aria-live", "polite");
  box.append(button, feedback);

  let readAttempts = 0;
  let readBusy = false;
  let cooldownTimer = null;
  const setFeedback = (result) => {
    const note = wordReadFeedback(result);
    feedback.textContent = note.message;
    feedback.dataset.tone = note.tone || "retry";
    if (note.tone === "fallback") button.hidden = true;
  };
  const finishCooldown = () => {
    cooldownTimer = null;
    readAttempts = 0;
    if (!button.hidden) {
      button.disabled = false;
      button.textContent = "🎤 跟读";
    }
  };
  button.addEventListener("click", async (event) => {
    event.stopPropagation();
    if (readBusy || button.disabled || button.hidden) return;
    readBusy = true;
    readAttempts += 1;
    button.disabled = true;
    button.textContent = "🎤 听你说…";
    feedback.textContent = "先听示范，再说一遍";
    feedback.dataset.tone = "working";
    stopSeq();
    try {
      const demoPlayed = await playSeq(termItems(card.term, card.zh));
      if (!demoPlayed) return;
      feedback.textContent = "听你说…";
      const result = await voicePort.listen({
        referenceText: card.term,
        mode: "read_word",
        lang: "en-US",
      });
      setFeedback(result);
    } catch (error) {
      const result = window.WalaVoiceCore && typeof window.WalaVoiceCore.errorResult === "function"
        ? window.WalaVoiceCore.errorResult(error, { referenceText: card.term, mode: "read_word" })
        : { kind: "unsupported" };
      setFeedback(result);
    } finally {
      readBusy = false;
      if (button.hidden) return;
      if (readAttempts >= 3) {
        button.textContent = "稍等一下…";
        cooldownTimer = setTimeout(finishCooldown, 2000);
      } else {
        button.disabled = false;
        button.textContent = "🎤 跟读";
      }
    }
  });
}

function wordTapItems(term, zh) {
  const items = edgeItems(term, "en-US");
  if (zh) items.push(...zhItems(zh));
  return items;
}
function termMeaning(key, node) {
  const g = glossOf(key, node);
  if (usableZh(g)) return g;
  const lx = lexOf(key);
  if (lx && usableZh(lx.zh) && lx.zh !== key) return lx.zh;
  const bare = bareWord(key);
  const off = officialList().find((w) => {
    const t = bareWord(w.term);
    return t === bare || inflateLemma(t).has(bare);
  });
  if (off && usableZh(off.zh)) {
    let s = String(off.zh).replace(/^\d+\.\s*/, "").replace(/^\([^)]*\)/, "");
    s = s.split(/[,，;；(]/)[0].trim();
    return s || off.zh;
  }
  return "";
}
const sceneTimes = WalaMedia.sceneTimes;
function narrItems() {
  const n = book.nodes[idx];
  if (listenMode && audioOnlyListen) {
    const items = edgeItems(n.text_en, "en-US");
    if (readMode === "enzh" && n.text_zh) items.push(...zhItems(n.text_zh));
    return items.length ? items : [{ tts: n.text_en, lang: "en-US" }];
  }
  if (n.learn_example) {
    const items = [{ tts: n.text_en, lang: "en-US" }];
    if (readMode === "enzh" && n.text_zh) items.push(...zhItems(n.text_zh));
    return items;
  }
  const t = sceneTimes(n);
  return [{ video: t }];
}

/* ---------- 词卡（学习/测试/复习） ---------- */
function cardDone(box) { return !!box.dataset.done; }
function renderCard(card) {
  const box = document.createElement("div");
  box.className = `vcard vcard-${card.mode}`;
  const badge = { learn: "新词 · 学习", test: "测一测 · 选含义", review: "复习 · 选单词" }[card.mode];
  box.insertAdjacentHTML("beforeend", `<div class="vcard-head"><span class="vbadge">${badge}</span></div>`);

  if (card.mode === "learn") {
    const phraseEn = card.phrase_en || card.term;
    const phraseZh = card.phrase_zh || card.zh || "";
    const lx = lexOf(card.term) || {};
    const ipa = card.ipa || lx.ipa || "";
    const def = card.def || lx.def || "";
    box.classList.add(`vtone-${toneOf(card.term)}`);
    box.insertAdjacentHTML("beforeend",
      `<div class="vterm"><b>${esc(card.term)}</b>${ipa ? ` <span class="vipa">[${esc(ipa)}]</span>` : ""} <button class="vspk" title="朗读单词">🔊</button></div>
       ${def ? `<div class="vdef">${esc(def)}</div>` : ""}
       <div class="vphrase-en" title="点击听英文短语">${esc(phraseEn)}</div>
       <div class="vphrase-zh" title="点击听中文短语">🔊 ${esc(phraseZh)}</div>`);
    box.querySelector(".vterm b").addEventListener("click", () => playSeq(termItems(card.term, card.zh)));
    box.querySelector(".vspk").addEventListener("click", () => playSeq(termItems(card.term, card.zh)));
    box.querySelector(".vphrase-en").addEventListener("click", () => playSeq([{ tts: phraseEn, lang: "en-US" }]));
    box.querySelector(".vphrase-zh").addEventListener("click", () => playSeq(zhItems(phraseZh)));
    bindWordRead(box, card);
    return box;
  }

  const isTest = card.mode === "test";
  box.insertAdjacentHTML("beforeend",
    `<div class="vterm">${isTest
      ? `<b>${esc(card.term)}</b> <button class="vspk">🔊</button> 的意思是？`
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
        window.BookPlayAudio?.sfx("correct");
        bumpStat(card.term, true);
        addSP(10);
        playSeq(termItems(card.term, card.zh));
        setTimeout(() => box.classList.add("vdone"), 350);
        maybeAutoAfterQuiz(box);
      } else {
        b.classList.add("wrong");
        window.BookPlayAudio?.sfx("retry");
        b.disabled = true;
        bumpStat(card.term, false);
      }
    });
    opts.appendChild(b);
  });
  box.appendChild(opts);
  return box;
}
function escapeRe(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function officialList() {
  return (book && book.official_words) || [];
}
function termInText(term, text) {
  const raw = text || "";
  const forms = new Set([String(term || "").toLowerCase(), ...inflateLemma(bareWord(term))]);
  for (const f of forms) {
    if (!f) continue;
    const re = new RegExp(`\\b${escapeRe(f).replace(/\\ /g, "\\s+")}\\b`, "i");
    if (re.test(raw)) return true;
  }
  return false;
}
function officialInSentence(text) {
  const hits = [];
  const seen = new Set();
  officialList().forEach((w) => {
    const term = String(w.term || "").trim();
    if (!term || !termInText(term, text)) return;
    const key = bareWord(term) || term.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    hits.push(w);
  });
  return hits;
}
function firstHitPos(term, text) {
  const raw = String(text || "").toLowerCase();
  const forms = [String(term || "").toLowerCase(), ...inflateLemma(bareWord(term))];
  let best = Infinity;
  forms.forEach((f) => {
    if (!f) return;
    const pos = raw.search(new RegExp(`\\b${escapeRe(f).replace(/\\ /g, "\\s+")}\\b`, "i"));
    if (pos >= 0 && pos < best) best = pos;
  });
  return best;
}
function sideWordHits(text, node) {
  const hits = [];
  const seen = new Set();
  const add = (term, extra, requireInText) => {
    const key = bareWord(term) || String(term || "").toLowerCase();
    if (!key || seen.has(key)) return;
    if (requireInText && !termInText(term, text)) return;
    seen.add(key);
    const lx = lexOf(term) || {};
    hits.push({
      term,
      zh: extra.zh || lx.zh || lx.def || "",
      example: extra.example || "",
      ipa: extra.ipa || lx.ipa || "",
      def: extra.def || lx.def || "",
      _pos: firstHitPos(term, text),
    });
  };
  officialList().forEach((w) => add(w.term, w, true));
  ((node && node.page_words) || []).forEach((w) => add(w.term, w, false));
  Object.entries((book && book.script_lexicon) || {}).forEach(([lemma, info]) => {
    add(lemma, info || {}, true);
  });
  hits.sort((a, b) => (a._pos === Infinity ? 1 : 0) - (b._pos === Infinity ? 1 : 0) || a._pos - b._pos);
  return hits;
}
function sideCardLimit() { return WalaStudyPlan.sideCardLimit(learnLevel); }
function pickSideWords(text, node) {
  const hits = sideWordHits(text, node);
  const inLine = hits.filter((w) => w._pos !== Infinity);
  const rest = hits.filter((w) => w._pos === Infinity);
  let picked = inLine.length ? inLine : rest;
  // The side rail is a glanceable cue, not a second vocabulary lesson.
  // Keep it intentionally small even when the study level is set to max;
  // the full vocabulary list remains available from the review screen.
  const limit = Math.min(2, sideCardLimit());
  if (limit === 1 && picked.length > 1) {
    const off = new Set(officialInSentence(text).map((w) => bareWord(w.term)));
    picked = picked.slice().sort((a, b) => {
      const ao = off.has(bareWord(a.term)) ? 1 : 0;
      const bo = off.has(bareWord(b.term)) ? 1 : 0;
      if (ao !== bo) return bo - ao;
      const ap = a._pos === Infinity ? 1e9 : a._pos;
      const bp = b._pos === Infinity ? 1e9 : b._pos;
      return ap - bp;
    });
  }
  return picked.slice(0, limit);
}
const SIDE_STOP = new Set([
  "the", "a", "an", "of", "to", "in", "on", "at", "for", "and", "or", "from",
  "had", "has", "have", "was", "were", "is", "are", "be", "been", "that", "this",
  "with", "as", "by", "it", "his", "her", "their", "they", "he", "she", "but",
  "not", "so", "then", "than", "said", "one", "out", "up", "into", "over",
]);
function fallbackStoryWord(n) {
  const text = (n && n.text_en) || "";
  const fromVocab = ((n && n.vocab) || []).find((w) => termInText(w.term, text));
  if (fromVocab) {
    return { term: fromVocab.term, zh: fromVocab.zh || fromVocab.gloss || "", ipa: fromVocab.ipa || "", def: fromVocab.def || "" };
  }
  const page = ((n && n.page_words) || []).find((w) => termInText(w.term, text)) || ((n && n.page_words) || [])[0];
  if (page) return { term: page.term, zh: page.zh || page.def || "", ipa: page.ipa || "", def: page.def || "" };
  const tokens = tokenizeWords(text).filter((t) => t.type === "word").map((t) => t.text.replace(/[^A-Za-z'-]/g, ""));
  for (const raw of tokens) {
    const k = bareWord(raw);
    if (!k || k.length < 3 || SIDE_STOP.has(k)) continue;
    const off = findOfficial(k);
    const lx = lexOf(k) || {};
    return { term: off.term || raw, zh: displayZh(off) || lx.zh || lx.def || "", ipa: lx.ipa || "", def: lx.def || "" };
  }
  return null;
}
function fillSideCards() {
  if (!book || !book.nodes) return;
  if (el.cards) {
    el.cards.classList.remove("w-bag");
    el.cards.innerHTML = "";
  }
  if (el.cardsLeft) el.cardsLeft.innerHTML = "";
  const n = book.nodes[idx];
  if (!n || n.type === "choice" || n.type === "puzzle") {
    applySideCards();
    return;
  }
  let words = pickSideWords(n.text_en, n);
  if (!words.length) {
    const fb = fallbackStoryWord(n);
    if (fb) words = [fb];
  }
  // Keep the cue rail on one side. Alternating cards around the frame makes
  // the story compete with the learning UI and is especially distracting on
  // a TV-sized canvas.
  words.forEach((w) => {
    if (el.cards) el.cards.appendChild(renderSideWord(w));
  });
  applySideCards();
}
function vocabPeekInfo(term, node) {
  const official = findOfficial(term);
  const lx = lexOf(term) || {};
  const resolvedTerm = official.term || term;
  const zh = displayZh(official) || termMeaning(term, node) || shortZh(official.zh || lx.zh || "");
  return {
    term: resolvedTerm,
    zh,
    ipa: official.ipa || lx.ipa || "",
    node,
  };
}
function hideVocabPeek() {
  if (!el.vocabPeek) return;
  el.vocabPeek.classList.add("hidden");
  el.vocabPeek.innerHTML = "";
  el.vocabPeek.removeAttribute("data-term");
  applySideCards();
}
function positionVocabPeek(anchorRect) {
  const peek = el.vocabPeek;
  const frame = peek && peek.closest(".w-frame");
  if (!peek || !frame) return;
  const fr = frame.getBoundingClientRect();
  const pad = 10;
  const maxLeft = Math.max(pad, fr.width - peek.offsetWidth - pad);
  const anchorLeft = anchorRect ? anchorRect.left - fr.left : maxLeft;
  const anchorTop = anchorRect ? anchorRect.bottom - fr.top + 8 : fr.height * 0.2;
  let left = Math.max(pad, Math.min(maxLeft, anchorLeft));
  let top = anchorTop;
  if (top + peek.offsetHeight > fr.height - pad) {
    top = anchorRect ? anchorRect.top - fr.top - peek.offsetHeight - 8 : fr.height - peek.offsetHeight - pad;
  }
  top = Math.max(pad, Math.min(Math.max(pad, fr.height - peek.offsetHeight - pad), top));
  peek.style.left = `${left}px`;
  peek.style.top = `${top}px`;
}
function openVocabPeek(term, node, anchor) {
  if (!el.vocabPeek) return;
  const info = vocabPeekInfo(term, node);
  const anchorRect = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : null;
  el.vocabPeek.dataset.term = info.term;
  el.vocabPeek.innerHTML = `<div class="w-vocab-peek-head">
      <div class="w-vocab-peek-title"><b>${esc(info.term)}</b>${info.ipa ? ` <span>${esc(info.ipa)}</span>` : ""}</div>
      <button type="button" class="w-vocab-peek-close" data-vocab-action="close" aria-label="关闭词条">×</button>
    </div>
    ${info.zh ? `<div class="w-vocab-peek-zh">${esc(info.zh)}</div>` : ""}
    <div class="w-vocab-peek-actions">
      <button type="button" data-vocab-action="speak"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 10v4h4l5 5V5L7 10H3zm13.5 2c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg><span>听单词</span></button>
      ${info.zh ? `<button type="button" data-vocab-action="zh"><span class="w-vocab-peek-zh-icon">中</span><span>中文</span></button>` : ""}
      <button type="button" class="w-vocab-peek-replay" data-vocab-action="replay"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg><span>再学一次</span></button>
    </div>`;
  el.vocabPeek.classList.remove("hidden");
  applySideCards();
  requestAnimationFrame(() => positionVocabPeek(anchorRect));
  markSeen(info.term);
  const speak = () => playSeq(wordTapItems(info.term, info.zh));
  const close = () => hideVocabPeek();
  const replay = () => {
    close();
    stopSeq();
    playCurrentSentence();
  };
  el.vocabPeek.querySelectorAll("[data-vocab-action]").forEach((button) => {
    const action = button.dataset.vocabAction;
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      if (action === "close") close();
      else if (action === "zh") playSeq(zhItems(info.zh));
      else if (action === "replay") replay();
      else speak();
    });
  });
  // Opening a word is an intentional learning action; keep the familiar
  // immediate pronunciation while putting the richer controls in one place.
  const closeButton = el.vocabPeek.querySelector('[data-vocab-action="close"]');
  if (closeButton) closeButton.focus({ preventScroll: true });
  speak();
}
function renderSideWord(w) {
  const lx = lexOf(w.term) || {};
  const ipa = w.ipa || lx.ipa || "";
  const zh = displayZh(w) || shortZh(w.zh || lx.zh || "") || w.zh || lx.zh || "";
  const box = document.createElement("div");
  box.className = "vcard vcard-learn vcard-context";
  box.dataset.done = "1";
  box.setAttribute("role", "group");
  box.setAttribute("aria-label", `${w.term}${zh ? `，${zh}` : ""}，点击播放`);
  box.insertAdjacentHTML("beforeend",
    `<div class="vterm"><b>${esc(w.term)}</b>${ipa ? ` <span class="vipa">[${esc(ipa)}]</span>` : ""} <button class="vspk" type="button" title="听单词和中文" aria-label="听单词和中文"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 10v4h4l5 5V5L7 10H3zm13.5 2c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg></button></div>
     ${zh ? `<div class="vzh-off">${esc(zh)}</div>` : ""}`);
  box.addEventListener("click", (e) => {
    if (e) e.stopPropagation();
    openVocabPeek(w.term, book.nodes[idx], box);
  });
  return box;
}
function bumpStat(term, right) {
  storage.bumpVocab(term, right);
  rememberCarryover(term, right);
}
function markSeen(term) {
  storage.markVocabSeen(term);
}
function resolvePassMode() {
  if (passModeQuery === "story" || passModeQuery === "study") return passModeQuery;
  const explicit = storage.readPassMode();
  if (explicit === "story" || explicit === "study") return explicit;
  return (progress()[ep] || {}).done ? "study" : "story";
}
function findOfficial(term) {
  const key = bareWord(term);
  return officialList().find((w) => bareWord(w.term) === key || String(w.term).toLowerCase() === String(term || "").toLowerCase())
    || { term, zh: (lexOf(term) || {}).zh || "", example: "" };
}
function shortZh(zh) {
  let s = String(zh || "").trim();
  if (!s) return "";
  s = s.replace(/^\d+\.\s*/, "");
  s = s.replace(/^\([^)]*\)\s*/, "");
  s = s.split(/[，,；;]/)[0].trim();
  s = s.replace(/\s*[（(].*$/, "").trim();
  return s;
}
function displayZh(w) {
  const term = (w && w.term) || "";
  const pool = (book && book.vocab_pool) || {};
  const fromPool = pool[term] || pool[bareWord(term)];
  if (fromPool) return String(fromPool).split(/[；;]/)[0].trim();
  return shortZh(w && w.zh) || shortZh((lexOf(term) || {}).zh);
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const rebuildStudyPlan = () => {
  const plan = WalaStudyPlan.buildWordCardPlan({
    nodes: (book && book.nodes) || [],
    officialWords: officialList(),
    learnLevel,
    isListenNode,
    officialInSentence,
    bareWord,
  });
  firstSeenNode = plan.firstSeenNode;
  wordCardPlan = plan.wordCardPlan;
};
function collectBagThrough(i) {
  bagTerms = WalaStudyPlan.collectBagThrough({
    nodes: (book && book.nodes) || [],
    endIndex: i,
    isListenNode,
    officialInSentence,
    bareWord,
  });
}
function renderBag() {
  if (!el.cards) return;
  el.cards.classList.add("w-bag");
  el.cards.innerHTML = "";
  if (el.cardsLeft) {
    el.cardsLeft.innerHTML = "";
    el.cardsLeft.classList.add("hidden");
  }
  if (passMode !== "study") {
    el.cards.classList.add("hidden");
    return;
  }
  bagTerms.forEach((w) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "w-chip";
    b.textContent = `🏷 ${w.term} ${displayZh(w)}`;
    b.addEventListener("click", () => playSeq(termItems(w.term, w.zh)));
    el.cards.appendChild(b);
  });
  el.cards.classList.toggle("hidden", bagTerms.length === 0);
}
function hideWordCard() {
  if (voicePort && typeof voicePort.stop === "function") voicePort.stop();
  if (el.bubble) el.bubble.classList.remove("card-word");
  if (el.wordcard) {
    el.wordcard.classList.add("hidden");
    el.wordcard.innerHTML = "";
  }
  applySideCards();
}
function highlightTerm(sentence, term) {
  const raw = sentence || "";
  const re = new RegExp(`(\\b${escapeRe(term).replace(/\\ /g, "\\s+")}\\b)`, "i");
  if (!re.test(raw)) return esc(raw);
  return esc(raw).replace(new RegExp(`(${escapeRe(term).replace(/\\ /g, "\\s+")})`, "i"), "<b>$1</b>");
}
function showWordCard(term, onDone) {
  const w = findOfficial(term);
  const lx = lexOf(w.term) || {};
  const ipa = lx.ipa || "";
  const zh = displayZh(w) || w.zh || lx.zh || "";
  const node = book.nodes[idx] || {};
  const exEn = w.example || node.text_en || "";
  const exZh = node.text_zh || "";
  hideVocabPeek();
  hideWordCard();
  if (el.bubble) {
    el.bubble.classList.remove("card-quiz");
    el.bubble.classList.add("card-word");
  }
  if (el.puzzle) el.puzzle.classList.add("hidden");
  applySideCards();
  if (el.wordcard) {
    el.wordcard.classList.remove("hidden");
    el.wordcard.innerHTML = `<div class="wcard">
      <div class="wcard-term">${esc(w.term)}${ipa ? ` <span class="vipa">[${esc(ipa)}]</span>` : ""} 🔊</div>
      <div class="wcard-zh">${esc(zh)}</div>
      <div class="wcard-ex">${highlightTerm(exEn, w.term)}</div>
      ${exZh ? `<div class="wcard-ex-zh">${esc(exZh)}</div>` : ""}
    </div>`;
    bindWordRead(el.wordcard.querySelector(".wcard"), { term: w.term, zh });
    const replay = () => playSeq(wordCardItems(w, exEn, exZh));
    el.wordcard.onclick = replay;
    el.wordcard.oncontextmenu = (e) => { e.preventDefault(); playSeq(exZh ? [sentItem(sentZhAudio, exZh, "zh-CN")].filter(Boolean) : zhItems(zh)); };
  }
  markSeen(w.term);
  wordCardDone = onDone;
  playSeq(wordCardItems(w, exEn, exZh)).then(() => {
    if (wordCardDone !== onDone) return;
    setTimeout(() => {
      if (wordCardDone !== onDone) return;
      hideWordCard();
      onDone();
    }, 800);
  });
}
function unmastered(term) {
  return WalaStudyPlan.isUnmastered(vstat(), term, bareWord(term));
}
function makeReviewQ(w) {
  const zh = displayZh(w) || shortZh((lexOf(w.term) || {}).zh) || w.term;
  const pool = Object.values((book && book.vocab_pool) || {}).map(shortZh).filter((z) => z && z !== zh);
  officialList().forEach((o) => {
    const z = displayZh(o);
    if (z && z !== zh) pool.push(z);
  });
  return WalaQuiz.buildReviewQuestion({ term: w.term, zh, distractors: pool });
}
function readCarryoverReview() {
  if (!reviewQueue) return null;
  return reviewQueue.peek(localStorage, 1)[0] || null;
}
function makeCarryoverQ(item) {
  if (!item || !item.term || !item.zh || !window.WalaQuiz) return null;
  const distractors = officialList()
    .map((word) => displayZh(word))
    .filter((zh) => zh && zh !== item.zh);
  return WalaQuiz.buildReviewQuestion({ term: item.term, zh: item.zh, distractors });
}
function resolveCarryover(item) {
  if (reviewQueue && item && item.term) reviewQueue.resolve(localStorage, item.term);
}
function rememberCarryover(term, right) {
  if (!reviewQueue || !term || term === "quiz") return;
  const previous = reviewQueue.list(localStorage).find((item) => item.term.toLowerCase() === String(term).toLowerCase());
  const word = findOfficial(term);
  const zh = displayZh(word) || (previous && previous.zh) || shortZh((lexOf(term) || {}).zh);
  if (right) reviewQueue.resolve(localStorage, term);
  else reviewQueue.enqueue(localStorage, { term, zh, sourceEpisode: ep });
}
function pickReviewQuiz(nodeIdx) {
  if (learnLevel === "lite") return null;
  const n = book.nodes[nodeIdx];
  if (!n) return null;
  const cands = officialInSentence(n.text_en).filter((w) => {
    const key = bareWord(w.term);
    if (!key || askedThisEp.has(key)) return false;
    if (firstSeenNode[key] == null || firstSeenNode[key] >= nodeIdx) return false;
    return unmastered(w.term) || unmastered(key);
  });
  if (!cands.length) return null;
  askedThisEp.add(bareWord(cands[0].term));
  return makeReviewQ(cands[0]);
}
function runActs(acts) {
  const token = ++actToken;
  actQueue = (acts || []).slice();
  let inlineQueued = false;
  const step = () => {
    if (token !== actToken) return;
    const act = actQueue.shift();
    if (!act) {
      if (inlineQueued) {
        const ni = nextListenIndex(idx);
        if (ni < 0) startEndQuiz();
        else goListen(ni);
      }
      return;
    }
    if (act.type === "word") showWordCard(act.term, step);
    else if (act.type === "quiz" || act.type === "review") {
      const checkpoint = act.checkpoint || {};
      const meta = act.carryover
        ? { inline: true, carryover: true, carryoverItem: act.carryover }
        : (checkpoint.total ? { inline: true, ...checkpoint } : {});
      inlineQueued = inlineQueued || Boolean(meta.inline);
      showFreezeQuiz(act.q, step, meta);
    }
    else if (act.type === "advance") {
      const ni = nextListenIndex(idx);
      if (ni < 0) startEndQuiz();
      else goListen(ni);
    }
  };
  step();
}
function studyActsFor(nodeIdx) {
  const acts = [];
  if (passMode !== "study") return acts;
  (wordCardPlan[nodeIdx] || []).forEach((t) => acts.push({ type: "word", term: t }));
  const checkpoint = checkpointPlan.byIndex[nodeIdx];
  if (checkpoint) {
    if (nodeIdx === checkpointPlan.indexes[0]) {
      const carryover = readCarryoverReview();
      const carryoverQuestion = carryover && makeCarryoverQ(carryover);
      if (carryoverQuestion) acts.push({ type: "review", q: carryoverQuestion, carryover });
    }
    // Prefer the authored plot question at this scene boundary.  A vocabulary
    // recall question fills the slot only when the story has no authored one,
    // keeping the inline burden to one question per checkpoint.
    const q = nodeQuiz(nodeIdx);
    if (q) acts.push({ type: "quiz", q, checkpoint });
    else {
      const review = pickReviewQuiz(nodeIdx);
      if (review) acts.push({ type: "review", q: review, checkpoint });
    }
  }
  return acts;
}
function afterSentence() {
  collectBagThrough(idx);
  fillSideCards();
}

/* ---------- 句子排序题 ---------- */
function renderPuzzle(pz) {
  const box = el.puzzle;
  box.innerHTML = "";
  const words = pz.words;
  const slots = [];
  const slotsEl = document.createElement("div");
  slotsEl.className = "wz-slots";
  const tilesEl = document.createElement("div");
  tilesEl.className = "wz-tiles";
  const check = document.createElement("button");
  check.type = "button";
  check.className = "wz-check";
  check.textContent = "确定";

  const filled = new Array(words.length).fill(null); // {word, tileBtn}
  function refresh() {
    check.disabled = filled.some((f) => !f);
  }
  words.forEach((w) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "wz-tile";
    b.textContent = w;
    b.addEventListener("click", () => {
      if (box.dataset.done || b.disabled) return;
      const i = filled.findIndex((f) => !f);
      if (i < 0) return;
      filled[i] = { word: w, tileBtn: b };
      b.disabled = true;
      slots[i].textContent = w;
      slots[i].classList.add("filled");
      refresh();
    });
    tilesEl.appendChild(b);
  });
  for (let i = 0; i < words.length; i++) {
    const s = document.createElement("div");
    s.className = "wz-slot";
    s.addEventListener("click", () => {
      if (box.dataset.done || !filled[i]) return;
      filled[i].tileBtn.disabled = false;
      filled[i] = null;
      s.textContent = "";
      s.classList.remove("filled");
      refresh();
    });
    slotsEl.appendChild(s);
    slots.push(s);
  }
  check.addEventListener("click", () => {
    if (box.dataset.done) return;
    const attempt = filled.map((f) => f.word).join(" ").toLowerCase();
    const target = pz.sentence.replace(/[.!?]$/, "").toLowerCase();
    if (attempt === target) {
      box.dataset.done = "1";
      slotsEl.classList.add("wz-right");
      check.textContent = "✓ 太棒了 +10 SP";
      addSP(10);
      playSeq([{ tts: pz.sentence, lang: "en-US" }]);
    } else {
      slotsEl.classList.add("wz-bad");
      setTimeout(() => slotsEl.classList.remove("wz-bad"), 350);
    }
  });
  const hint = document.createElement("div");
  hint.className = "w-sec-title";
  hint.innerHTML = `🔊 <a href="#" id="wz-hear" style="color:var(--gold)">听一遍原句</a>（提示）`;
  box.appendChild(hint);
  box.appendChild(slotsEl);
  box.appendChild(tilesEl);
  box.appendChild(check);
  refresh();
  box.querySelector("#wz-hear").addEventListener("click", (e) => {
    e.preventDefault();
    playSeq([{ tts: pz.sentence, lang: "en-US" }]);
  });
}

function bareWord(word) {
  return String(word || "").replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "").toLowerCase();
}
function usableZh(z) {
  return /[\u4e00-\u9fff]/.test(z || "");
}
function inflateLemma(lemma) {
  const w = String(lemma || "").toLowerCase();
  const out = new Set([w]);
  const extras = [w + "s", w + "es", w + "ed", w + "ing", w + "'s"];
  if (w.endsWith("e")) extras.push(w.slice(0, -1) + "ing", w + "d");
  if (w.endsWith("y") && w.length > 2 && !"aeiou".includes(w[w.length - 2])) {
    extras.push(w.slice(0, -1) + "ies", w.slice(0, -1) + "ied");
  }
  if (w.length >= 3 && !"aeiouxyw".includes(w[w.length - 1]) && "aeiou".includes(w[w.length - 2])) {
    extras.push(w + w[w.length - 1] + "ed", w + w[w.length - 1] + "ing");
  }
  extras.forEach((x) => out.add(x));
  return out;
}
function rebuildLexIndex() {
  lexIndex = {};
  const lex = (book && book.script_lexicon) || {};
  Object.entries(lex).forEach(([lemma, info]) => {
    lexIndex[lemma] = info;
    inflateLemma(lemma).forEach((form) => {
      if (!lexIndex[form]) lexIndex[form] = info;
    });
  });
}
function lexOf(word) {
  const bare = bareWord(word);
  if (!bare) return null;
  const lex = (book && book.script_lexicon) || {};
  return lex[bare] || lexIndex[bare] || null;
}
function glossOf(word, node) {
  const bare = bareWord(word);
  if (!bare) return "";
  const g = ((book && book.script_gloss) || {})[bare];
  if (usableZh(g)) return g;
  const cards = (node && node.vocab) || [];
  const card = cards.find((c) => {
    const parts = String(c.term || "").toLowerCase().split(/\s+/);
    return parts.includes(bare) || bare === String(c.term || "").toLowerCase();
  });
  const cz = card && (card.gloss || card.zh);
  return usableZh(cz) ? cz : "";
}
function toneOf(term) {
  const s = bareWord(term);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (h % 3) + 1;
}
function tokenizeWords(text) {
  const parts = [];
  const re = /[^\s]+|\s+/g;
  let m;
  while ((m = re.exec(text || ""))) {
    parts.push({ type: /^\s+$/.test(m[0]) ? "space" : "word", text: m[0] });
  }
  return parts;
}
function wordTimings(text, from, to) {
  const tokens = tokenizeWords(text);
  const words = tokens.filter((t) => t.type === "word");
  const weights = words.map((w) => {
    const n = (w.text.match(/[A-Za-z]/g) || []).length;
    if (!n) return 0.35;
    return 1 + Math.pow(n, 0.72);
  });
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const span = Math.max(0.25, (to || 0) - (from || 0));
  const lead = Math.min(0.08, span * 0.04);
  const tail = Math.min(0.42, Math.max(0.14, span * 0.16));
  const dur = Math.max(0.2, span - lead - tail);
  let t = (from || 0) + lead;
  let wi = 0;
  for (const tok of tokens) {
    if (tok.type !== "word") continue;
    const d = dur * weights[wi] / sum;
    tok.i = wi;
    tok.start = t;
    tok.end = t + d;
    t += d;
    wi += 1;
  }
  return tokens;
}
function termAt(node, word) {
  const bare = word.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "").toLowerCase();
  const terms = [...new Set((node.vocab || []).map((c) => c.term))].sort((a, b) => b.length - a.length);
  return terms.find((term) => {
    const parts = term.toLowerCase().split(/\s+/);
    return parts.includes(bare) || bare === term.toLowerCase();
  }) || "";
}
function renderEnText(node) {
  const t = sceneTimes(node);
  const tokens = wordTimings(node.text_en || "", t.from, t.to);
  el.en.classList.toggle("annot", annotOn);
  el.en.innerHTML = tokens.map((tok) => {
    if (tok.type === "space") return tok.text.replace(/ /g, " ");
    // Pure listening removes the video, not the language scaffolding: keep
    // vocabulary marks available so the learner can still follow the words.
    const term = termAt(node, tok.text);
    const bare = bareWord(tok.text);
    const gloss = annotOn ? glossOf(bare, node) : "";
    const marked = !!(term || gloss);
    const cls = ["w-word", marked ? "w-term" : "", gloss ? `w-tone-${toneOf(bare || term)}` : ""]
      .filter(Boolean).join(" ");
    const inner = annotOn
      ? `<span class="w-enw">${esc(tok.text)}</span><span class="w-gloss">${gloss ? esc(gloss) : "&nbsp;"}</span>`
      : esc(tok.text);
    const hint = marked ? ' title="点击听单词和中文"' : "";
    const a11y = marked
      ? ` role="button" tabindex="0" aria-label="${esc(`重点词 ${tok.text}${gloss ? `，${gloss}` : ""}，点击查看发音和释义`)}"`
      : "";
    return `<span class="${cls}"${hint}${a11y} data-i="${tok.i}" data-start="${tok.start.toFixed(3)}" data-end="${tok.end.toFixed(3)}" data-term="${esc(term)}" data-bare="${esc(bare)}" data-zh="${esc(gloss || glossOf(bare, node))}">${inner}</span>`;
  }).join("");
  el.en.querySelectorAll(".w-term").forEach((m) => {
    const key = m.dataset.term || m.dataset.bare;
    if (!key) return;
    const inspectTerm = () => openVocabPeek(key, node, m);
    bindPressSpeak(m, inspectTerm);
    m.addEventListener("click", (e) => {
      if (m.dataset.held === "1") { e.preventDefault(); m.dataset.held = ""; return; }
      inspectTerm();
    });
    m.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      e.stopPropagation();
      inspectTerm();
    });
  });
}
function syncWordHighlight(now, playing) {
  const spans = el.en.querySelectorAll(".w-word");
  if (!spans.length) return;
  if (!playing) {
    spans.forEach((s) => s.classList.remove("w-on", "w-done", "w-wait"));
    return;
  }
  const clock = now + 0.12;
  spans.forEach((s) => {
    const a = Number(s.dataset.start);
    const b = Number(s.dataset.end);
    const on = clock >= a && clock < b;
    const done = clock >= b;
    s.classList.toggle("w-on", on);
    s.classList.toggle("w-done", done);
    s.classList.toggle("w-wait", clock < a);
  });
}
let karaokeRaf = 0;
function startKaraoke() {
  cancelAnimationFrame(karaokeRaf);
  const tick = () => {
    const v = el.video;
    if (v && !v.paused && !v.ended) syncWordHighlight(v.currentTime, true);
    karaokeRaf = requestAnimationFrame(tick);
  };
  karaokeRaf = requestAnimationFrame(tick);
}
function stopKaraoke() {
  cancelAnimationFrame(karaokeRaf);
  karaokeRaf = 0;
  syncWordHighlight(0, false);
}

function bindPressSpeak(node, speak) {
  let timer = null;
  const start = () => {
    node.dataset.held = "";
    timer = setTimeout(() => { node.dataset.held = "1"; speak(); }, 420);
  };
  const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
  node.addEventListener("pointerdown", start);
  node.addEventListener("pointerup", clear);
  node.addEventListener("pointerleave", clear);
  node.addEventListener("contextmenu", (e) => e.preventDefault());
}

/* ---------- 渲染节点 ---------- */
function pendingInteractive() {
  return [...el.cards.querySelectorAll(".vcard")].some((c) => c.dataset.done !== "1" && !c.classList.contains("vcard-learn"))
    || (el.puzzle.classList.contains("hidden") === false && !el.puzzle.dataset.done);
}
function render(opts) {
  const willPlay = !!(opts && opts.willPlay);
  hideVocabPeek();
  episodeFinished = false;
  if (el.next) {
    el.next.setAttribute("aria-label", "下一页");
    el.next.title = "下一页";
  }
  if (!willPlay) stopSeq();
  if (el.bubble) el.bubble.classList.remove("card-quiz", "card-word");
  hideWordCard();
  const n = book.nodes[idx];
  el.epTitle.textContent = `第 ${ep} 集 · ${book.title.en}`;
  if (el.dub) {
    const dubNode = n && n.node_id ? `&node=${encodeURIComponent(n.node_id)}` : "";
    el.dub.setAttribute("href", `dub.html?ep=${ep}${dubNode}&back=player`);
  }
  const showMarks = n.type === "narration";
  if (el.enPlay) el.enPlay.classList.toggle("hidden", !showMarks);
  if (el.zhPlay) el.zhPlay.classList.toggle("hidden", !showMarks);
  const t = sceneTimes(n);
  const audioOnly = listenMode && audioOnlyListen;
  if (el.frame) el.frame.classList.toggle("audio-only", audioOnly);
  if (el.player) el.player.classList.toggle("audio-only", audioOnly);
  if (el.video) {
    el.video.loop = false;
    el.video.autoplay = false;
    if (audioOnly) {
      el.video.pause();
      el.video.classList.add("hidden");
      if (el.img) el.img.classList.add("hidden");
    } else {
      el.video.classList.remove("hidden");
      if (!willPlay) el.video.pause();
      ensureVideo().then((ok) => {
        if (!ok) {
          el.video.classList.add("hidden");
          if (n.illustration) { el.img.src = "../" + n.illustration; el.img.classList.remove("hidden"); }
          else el.img.classList.add("hidden");
          return;
        }
        el.img.classList.add("hidden");
        if (!willPlay) {
          unlockSeek(el.video).then(() => seekVideo(el.video, t.from));
        }
      });
    }
  } else if (!audioOnly && n.illustration) {
    el.img.src = "../" + n.illustration;
    el.img.classList.remove("hidden");
  } else el.img.classList.add("hidden");
  curText = n.text_en;
  renderEnText(n);
  applySubtitle();
  el.pager.textContent = `${idx + 1} / ${book.nodes.length}`;

  el.puzzle.classList.add("hidden");
  el.puzzle.innerHTML = "";
  el.puzzle.dataset.done = "";
  if (n.type === "choice" && n.choices) {
    setAvatar(false);
    renderChoice(n);
    el.puzzle.classList.remove("hidden");
  } else if (n.type === "puzzle" && n.puzzle) {
    setAvatar(false);
    renderPuzzle(n.puzzle);
    el.puzzle.classList.remove("hidden");
  } else {
    setAvatar(false);
  }
  collectBagThrough(idx);
  fillSideCards();
  if (!listenMode) saveProgress(false);
  if (listenMode && !audioOnlyListen) {
    if (el.cards) el.cards.classList.add("hidden");
    if (el.cardsLeft) el.cardsLeft.classList.add("hidden");
    if (el.wordcard) el.wordcard.classList.add("hidden");
    if (el.puzzle) el.puzzle.classList.add("hidden");
  }
  el.dots.classList.add("hidden");
  setAvatar(false);
}

function renderChoice(n) {
  el.puzzle.innerHTML = "";
  el.puzzle.dataset.done = "";
  const row = document.createElement("div");
  row.className = "w-choice-row";
  n.choices.forEach((opt) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = `${opt.en} · ${opt.zh}`;
    b.addEventListener("click", () => {
      if (el.puzzle.dataset.done) return;
      el.puzzle.dataset.done = "1";
      b.style.borderColor = "#7dcea0";
      const reply = document.createElement("p");
      reply.className = "w-choice-reply";
      reply.textContent = opt.reply || "";
      el.puzzle.appendChild(reply);
      addSP(5);
    });
    row.appendChild(b);
  });
  el.puzzle.appendChild(row);
}

function isChapterTitle(n) {
  return !!(n && n.type === "narration" && /^Chapter\s+\d+/i.test((n.text_en || "").trim()));
}
function isListenNode(n) {
  return !!(n && n.type === "narration" && (n.text_en || "").trim() && !isChapterTitle(n));
}
function sameLine(a, b) {
  const nrm = (s) => String(s || "").toLowerCase().replace(/[^\w\u4e00-\u9fff]+/g, " ").replace(/\s+/g, " ").trim();
  return nrm(a) === nrm(b);
}
function withLearnNodes(nodes) {
  return (nodes || []).slice();
}
function rebuildPlayNodes(keepId) {
  if (!book) return;
  if (!rawNodes) rawNodes = book.nodes;
  const want = keepId || (book.nodes[idx] && book.nodes[idx].node_id);
  book.nodes = withLearnNodes(rawNodes);
  if (want) {
    const i = book.nodes.findIndex((n) => n.node_id === want);
    if (i >= 0) idx = i;
  }
}
function nextListenIndex(from) {
  for (let i = from + 1; i < book.nodes.length; i++) {
    if (isListenNode(book.nodes[i])) return i;
  }
  return -1;
}
function firstListenIndex() {
  const i = nextListenIndex(-1);
  return i >= 0 ? i : 0;
}

function rehomePlotQuizzes() {
  plotQuizAt = WalaQuiz.rehomePlotQuizzes({
    nodes: (book && book.nodes) || [],
    officialQuiz: (book && book.official_quiz) || [],
    isListenNode,
    normSent,
  });
}
function rebuildCheckpointPlan() {
  checkpointPlan = WalaStudyPlan.buildCheckpointPlan({
    nodes: (book && book.nodes) || [],
    isListenNode,
    quizIndexes: Object.keys(plotQuizAt).map(Number),
    learnLevel,
    enabled: passMode === "study",
  });
}
function nodeQuiz(nodeIdx) {
  const q = plotQuizAt[nodeIdx];
  return q && !q._asked ? q : null;
}
function showFreezeQuiz(q, onDone, meta = {}) {
  if (el.video) el.video.pause();
  stopKaraoke();
  el.dots.classList.add("hidden");
  if (el.bubble) el.bubble.classList.add("card-quiz");
  applySideCards();
  el.puzzle.classList.remove("hidden");
  el.puzzle.dataset.done = "";
  const letters = ["A", "B", "C", "D"];
  const inline = Boolean(meta.inline);
  const progressLabel = meta.carryover
    ? `<span class="w-quiz-progress">复习</span>`
    : (inline && meta.total ? `<span class="w-quiz-progress">${meta.ordinal} / ${meta.total}</span>` : "");
  const title = meta.carryover ? "上集回顾" : inline ? "本段小测" : "听完测一测";
  el.puzzle.innerHTML = `<div class="w-quiz-head"><span>${title}${progressLabel}</span><button type="button" class="w-quiz-hint-btn" id="w-quiz-hint">提示</button></div><p class="w-quiz-q">${esc(q.q)} <button type="button" class="w-spk-mini" id="w-quiz-q-spk" aria-label="朗读题目">🔊</button></p><div class="w-quiz-hint hidden" id="w-quiz-hint-box"></div><div class="w-quiz-opts"></div>`;
  const qSpk = $("w-quiz-q-spk");
  if (qSpk) qSpk.addEventListener("click", (e) => { e.stopPropagation(); playSeq(quizQItems(q)); });
  const box = el.puzzle.querySelector(".w-quiz-opts");
  let advanced = false;
  const advance = () => {
    if (advanced) return;
    advanced = true;
    if (onDone) onDone();
  };
  (q.choices || []).forEach((c, i) => {
    const row = document.createElement("div");
    row.className = "w-quiz-opt-row";
    const b = document.createElement("button");
    b.type = "button";
    b.className = "w-quiz-choice";
    b.textContent = `${letters[i]}. ${c}`;
    b.addEventListener("click", () => {
      if (el.puzzle.dataset.done) return;
      const ok = i === q.answer;
      if (ok) {
        el.puzzle.dataset.done = "1";
        q._asked = true;
        b.classList.add("right");
        window.BookPlayAudio?.sfx("correct");
        addSP(10);
        bumpStat(q.review_term || "quiz", true);
        resolveCarryover(meta.carryoverItem);
        if (inline) {
          const continueButton = document.createElement("button");
          continueButton.type = "button";
          continueButton.className = "w-quiz-continue";
          continueButton.textContent = "继续播放";
          continueButton.addEventListener("click", advance);
          el.puzzle.appendChild(continueButton);
          setTimeout(advance, 1100);
        } else setTimeout(advance, 800);
      } else {
        b.classList.add("wrong");
        window.BookPlayAudio?.sfx("retry");
        b.disabled = true;
        bumpStat(q.review_term || "quiz", false);
      }
    });
    const spk = document.createElement("button");
    spk.type = "button";
    spk.className = "w-spk-mini";
    spk.setAttribute("aria-label", "朗读选项");
    spk.textContent = "🔊";
    spk.addEventListener("click", (e) => {
      e.stopPropagation();
      playSeq(quizChoiceItems(c, (q.choices_zh || [])[i] || ""));
    });
    row.appendChild(b);
    row.appendChild(spk);
    box.appendChild(row);
  });
  if (inline) {
    const skip = document.createElement("button");
    skip.type = "button";
    skip.className = "w-quiz-skip";
    skip.textContent = "跳过本题，继续播放";
    skip.addEventListener("click", () => {
      if (el.puzzle.dataset.done) return;
      q._asked = true;
      el.puzzle.dataset.done = "1";
      media.cancel();
      resolveCarryover(meta.carryoverItem);
      advance();
    });
    el.puzzle.appendChild(skip);
  }
  const hintBtn = $("w-quiz-hint");
  const hintBox = $("w-quiz-hint-box");
  if (hintBtn && hintBox) {
    hintBtn.addEventListener("click", () => {
      const open = hintBox.classList.contains("hidden");
      hintBox.classList.toggle("hidden", !open);
      if (!open) return;
      const qzh = q.q_zh || "";
      const czh = q.choices_zh || [];
      hintBox.innerHTML = "";
      const qp = document.createElement("p");
      qp.className = "w-quiz-q-zh";
      qp.innerHTML = `${esc(qzh || "（暂无中文题面，先听英文）")} <button type="button" class="w-spk-mini" aria-label="朗读中文题目">🔊</button>`;
      const hintQSpk = qp.querySelector(".w-spk-mini");
      const playHintQ = () => playSeq(qzh ? edgeItems(qzh, "zh-CN") : quizQItems(q));
      qp.addEventListener("click", (e) => { if (!e.target.closest(".w-spk-mini")) playHintQ(); });
      if (hintQSpk) hintQSpk.addEventListener("click", (e) => { e.stopPropagation(); playHintQ(); });
      hintBox.appendChild(qp);
      const auto = qzh ? edgeItems(qzh, "zh-CN") : quizQItems(q);
      (q.choices || []).forEach((c, i) => {
        const zh = czh[i] || "";
        const hb = document.createElement("button");
        hb.type = "button";
        hb.textContent = `${letters[i]}. ${zh || c}`;
        hb.addEventListener("click", () => playSeq(quizChoiceItems(c, zh)));
        hintBox.appendChild(hb);
        auto.push(...quizChoiceItems(c, zh));
      });
      playSeq(auto);
    });
  }
  playSeq(quizQItems(q));
}
function finishEpisode() {
  if (listenMode) { showListenDone(); return; }
  stopSeq();
  // Story playback is only preparation.  The map is unlocked by the
  // knowledge-consolidation pass in lesson.js, so keep this episode in a
  // resumable (not done) state until the learner reaches the 70% threshold.
  saveProgress(false);
  setAvatar(false);
  episodeFinished = true;
  if (el.video) el.video.pause();
  el.player.classList.remove("hidden");
  el.end.classList.add("hidden");
  hideWordCard();
  if (el.bubble) el.bubble.classList.remove("card-quiz", "card-word");
  el.puzzle.classList.remove("hidden");
  el.puzzle.dataset.done = "1";
  collectBagThrough(book.nodes.length - 1);
  const y = officialList().length;
  const x = bagTerms.length;
  el.puzzle.innerHTML = `<div class="w-end-inline"><div><b>本集播放完成</b><div class="w-end-sub">本集词袋：${x} / ${y}</div><div class="w-end-next-hint">点击字幕框右上角的 ▶ 进入知识巩固 →</div></div></div>`;
  // The in-player arrow is a button, not an inline link.  `next()` owns the
  // post-completion transition after the user explicitly activates the
  // arrow.  Keeping navigation in one path avoids
  // a dead `href` property on a <button> and prevents the finish bubble from
  // embedding a second knowledge-consolidation link.
  if (el.next) {
    el.next.setAttribute("aria-label", "下一页：进入知识巩固");
    el.next.title = "下一页：进入知识巩固";
  }
}
function startEndQuiz() {
  if (listenMode) { showListenDone(); return; }
  if (passMode === "story") { finishEpisode(); return; }
  const extras = [];
  if (learnLevel === "max") {
    officialList().forEach((w) => {
      const s = vstat()[w.term] || {};
      if ((s.wrong || 0) > 0 && extras.length < 3 && !askedThisEp.has(bareWord(w.term))) {
        askedThisEp.add(bareWord(w.term));
        extras.push(makeReviewQ(w));
      }
    });
  }
  const rest = extras.concat((book.quiz || []).filter((q) => !q._asked));
  let i = 0;
  const step = () => {
    if (i >= rest.length) { finishEpisode(); return; }
    const q = rest[i++];
    showFreezeQuiz(q, step);
  };
  if (!rest.length) finishEpisode();
  else step();
}
function scheduleNextSentence() {
  afterSentence();
  if (maybeOfferBreak()) return;
}

async function playCurrentSentence() {
  const n = book.nodes[idx];
  if (!isListenNode(n)) {
    el.dots.classList.add("hidden");
    return;
  }
  setAvatar(true);
  const mine = media.nextSequenceToken();
  if (!audioOnlyListen) startKaraoke();
  const ok = await playSeq(narrItems());
  if (mine !== media.currentSequenceToken()) return;
  setAvatar(false);
  el.dots.classList.add("hidden");
  if (ok) {
    if (listenMode) continueListenAfterSentence();
    else scheduleNextSentence();
  }
}

function playZhSentence() {
  const n = book.nodes[idx];
  if (!n || !isListenNode(n) || !n.text_zh) return;
  stopSeq();
  const items = zhItems(n.text_zh);
  if (!items.length) return;
  playSeq(items);
}

async function runNode() {
  await playCurrentSentence();
}

function maybeAutoAfterQuiz(box) {
  return;
}

function goListen(i) {
  if (i < 0) { stopSeq(); if (listenMode) showListenDone(); else startEndQuiz(); return; }
  stopSeq();
  episodeFinished = false;
  studyFlushedAt = -1;
  idx = i;
  render({ willPlay: true });
  playCurrentSentence();
}

function next() {
  if (listenMode) {
    if (listenSession && listenSession.snapshot().status === "paused") return;
    continueListenAfterSentence();
    return;
  }
  if (episodeFinished) {
    stopSeq();
    location.href = `lesson-words.html?ep=${ep}`;
    return;
  }
  const n = book.nodes[idx];
  if (n && n.type === "choice" && !el.puzzle.dataset.done) return;
  if (n && n.type === "puzzle" && !el.puzzle.dataset.done) return;
  if (el.bubble && el.bubble.classList.contains("card-quiz") && el.puzzle && el.puzzle.dataset.done !== "1") return;
  if (el.bubble && el.bubble.classList.contains("card-word")) {
    const done = wordCardDone;
    wordCardDone = null;
    hideWordCard();
    media.cancel();
    if (done) done();
    return;
  }
  if (breakPending && maybeOfferBreak()) return;
  if (passMode === "study" && studyFlushedAt !== idx) {
    studyFlushedAt = idx;
    const acts = studyActsFor(idx);
    if (acts.length) {
      stopSeq();
      runActs(acts);
      return;
    }
  }
  const ni = nextListenIndex(idx);
  if (ni < 0) startEndQuiz();
  else goListen(ni);
}

/* ---------- 章末 ---------- */
function showEnd() {
  stopSeq();
  // The standalone end screen no longer counts as mastery; lesson.html owns
  // the scored pass and writes the shared map progress marker.
  saveProgress(false);
  el.player.classList.add("hidden");
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
        if (ok) { addSP(10); bumpStat("quiz", true); }
        b.style.borderColor = ok ? "#7dcea0" : "#e07474";
        b.style.background = ok ? "rgba(125,206,160,0.15)" : "rgba(224,116,116,0.1)";
        if (!ok) wrap.children[q.answer + 1].style.borderColor = "#7dcea0";
      });
      wrap.appendChild(b);
    });
    el.quiz.appendChild(wrap);
  });
  el.nextEp.href = `lesson-words.html?ep=${ep}`;
  el.nextEp.textContent = "先学单词，再做测验";
}

/* ---------- 知识回顾 ---------- */
function kcard(en, zh) {
  const d = document.createElement("div");
  d.className = "w-kcard";
  const lx = lexOf(en) || {};
  const ipa = lx.ipa ? ` <span class="vipa">[${esc(lx.ipa)}]</span>` : "";
  const def = lx.def || zh || "";
  d.innerHTML = `<div><div class="en">${esc(en)}${ipa}</div><div class="zh">${esc(def)}</div></div>
    <button class="spk" type="button">🔊</button>`;
  d.querySelector(".spk").addEventListener("click", () => playSeq(termItems(en, zh)));
  return d;
}
async function openReview(targetEp) {
  try {
    book = await j(`../data/dialogue_stories/ep${targetEp}.json`);
  } catch (_) {
    el.rbody.innerHTML = `<p class="w-empty">这一集还没有生成</p>`;
    return;
  }
  [wordAudio, zhAudio, enAudio, sentEnAudio, sentZhAudio] = await Promise.all([
    j(`../assets/adv_audio/ep${targetEp}/index.json`).catch(() => ({})),
    j("../assets/adv_audio/zh_index.json").catch(() => ({})),
    j("../assets/adv_audio/en_index.json").catch(() => ({})),
    j("../assets/adv_audio/sent_en_index.json").catch(() => ({})),
    j("../assets/adv_audio/sent_zh_index.json").catch(() => ({})),
  ]);
  await mergeQuizAudio();
  rebuildLexIndex();
  el.rtitle.textContent = `第 ${targetEp} 集 · 知识一览`;
  el.review.classList.remove("hidden");
  el.map.classList.add("hidden");
  renderReviewTab("words");
}
function renderReviewTab(tab) {
  el.rbody.innerHTML = "";
  if (tab === "words") {
    const official = book.official_words || [];
    if (official.length) {
      official.forEach((w) => el.rbody.appendChild(kcard(w.term, w.zh + (w.example ? ` · ${w.example}` : ""))));
      return;
    }
    const terms = Object.entries(book.vocab_pool || {});
    if (!terms.length) { el.rbody.innerHTML = `<p class="w-empty">本集暂无词表</p>`; return; }
    terms.forEach(([term, zh]) => el.rbody.appendChild(kcard(term, zh)));
  } else if (tab === "patterns") {
    const pats = book.patterns || [];
    if (!pats.length) { el.rbody.innerHTML = `<p class="w-empty">本集暂无句型</p>`; return; }
    pats.forEach((p) => el.rbody.appendChild(kcard(p.pattern, `${p.term} · ${p.zh}`)));
  } else {
    const s = vstat();
    const wrongTerms = Object.entries(s).filter(([k, v]) => k !== "quiz" && v.wrong > 0);
    if (!wrongTerms.length) { el.rbody.innerHTML = `<p class="w-empty">还没有错题，太棒了！</p>`; return; }
    wrongTerms.forEach(([term, v]) => {
      const zh = (book.vocab_pool || {})[term] || "";
      const others = Object.entries(book.vocab_pool || {}).filter(([w]) => w !== term).map(([, z]) => z);
      others.sort(() => Math.random() - 0.5);
      const opts = others.slice(0, 3).concat([zh || term]);
      opts.sort(() => Math.random() - 0.5);
      const rightIdx = opts.indexOf(zh || term);
      const box = document.createElement("div");
      box.className = "vcard vcard-test";
      box.innerHTML = `<div class="vcard-head"><span class="vbadge">错题重做 · 答对 +10 SP</span></div>
        <div class="vterm"><b>${esc(term)}</b> <button class="vspk">🔊</button> 的意思是？</div>`;
      box.querySelector(".vspk").addEventListener("click", () => playSeq(termItems(term, zh)));
      const optsEl = document.createElement("div");
      optsEl.className = "vopts";
      opts.forEach((opt, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = opt;
        b.addEventListener("click", () => {
          if (box.dataset.done) return;
          const ok = i === rightIdx;
          if (ok) {
            box.dataset.done = "1";
            b.classList.add("right");
        window.BookPlayAudio?.sfx("correct");
            addSP(10);
            bumpStat(term, true);
            playSeq(termItems(term, zh));
            setTimeout(() => box.classList.add("vdone"), 350);
          } else {
            b.classList.add("wrong");
        window.BookPlayAudio?.sfx("retry");
            b.disabled = true;
            bumpStat(term, false);
          }
        });
        optsEl.appendChild(b);
      });
      box.appendChild(optsEl);
      el.rbody.appendChild(box);
    });
  }
}

/* ---------- 地图 ---------- */
async function showMap() {
  const [catalog, advIdx] = await Promise.all([
    j("../data/storybooks/catalog.json").catch(() => ({ episodes: [] })),
    j("../data/dialogue_stories/index.json").then((d) => d.episodes).catch(() => []),
  ]);
  const have = new Set(advIdx);
  const prog = progress();
  const eps = catalog.episodes.filter((e) => have.has(e.episode));
  let firstUndone = eps.find((e) => !(prog[e.episode] || {}).done);
  const cur = firstUndone ? firstUndone.episode : eps[eps.length - 1]?.episode;

  el.path.innerHTML = "";
  eps.forEach((e, i) => {
    if (i > 0) {
      const c = document.createElement("div");
      c.className = "w-connector";
      el.path.appendChild(c);
    }
    const row = document.createElement("div");
    row.className = "w-row";
    const a = document.createElement("a");
    a.className = "w-node";
    a.href = `wala.html?ep=${e.episode}`;
    a.title = e.title.en;
    a.innerHTML = `<img src="../${e.cover || ""}" alt="">
      <span class="no">${e.episode}</span>`;
    const p = prog[e.episode];
    if (p && p.done) a.insertAdjacentHTML("beforeend", `<span class="done-badge">✓</span>`);
    if (e.episode === cur) {
      a.classList.add("current");
      a.insertAdjacentHTML("beforeend", `<span class="cta">继续 ▶</span>`);
      el.reviewBtn.dataset.ep = e.episode;
      el.listen.href = `wala.html?ep=${e.episode}&mode=listen&loops=2&visual=audio&subtitle=enzh`;
    }
    row.appendChild(a);
    el.path.appendChild(row);
  });
  if (!el.reviewBtn.dataset.ep && eps.length) el.reviewBtn.dataset.ep = eps[0].episode;
  el.map.classList.remove("hidden");
  el.player.classList.add("hidden");
  el.review.classList.add("hidden");
  renderSP();
  // 滚动到当前节点
  setTimeout(() => {
    const cur2 = el.path.querySelector(".w-node.current");
    if (cur2) cur2.scrollIntoView({ block: "center" });
  }, 60);
}

/* ---------- 绑定 ---------- */
function applySubtitle() {
  const n = book && book.nodes ? book.nodes[idx] : null;
  const showZh = readMode === "enzh" && !!(n && n.text_zh);
  if (el.zhRow) el.zhRow.classList.toggle("hidden", !showZh);
  if (el.zh) {
    el.zh.textContent = (n && n.text_zh) || "";
    el.zh.classList.toggle("hidden", !showZh);
  }
  if (el.modeEn) el.modeEn.classList.toggle("active", readMode === "en");
  if (el.modeEnZh) el.modeEnZh.classList.toggle("active", readMode === "enzh");
}
function syncPassButtons() {
  if (el.passStory) el.passStory.classList.toggle("active", passMode === "story");
  if (el.passStudy) el.passStudy.classList.toggle("active", passMode === "study");
}
function applySideCards() {
  const busy = el.bubble && (el.bubble.classList.contains("card-quiz") || el.bubble.classList.contains("card-word"));
  const peekOpen = el.vocabPeek && !el.vocabPeek.classList.contains("hidden");
  const audioOnlyAids = listenMode && audioOnlyListen;
  // Story mode keeps the canvas clean. The underlined words in the sentence
  // remain tappable, while the compact rail is reserved for intentional
  // study passes.
  const hidden = (!audioOnlyAids && (listenMode || passMode !== "study")) || !sideCardsOn || busy || peekOpen;
  if (el.cards) el.cards.classList.toggle("hidden", !!(hidden || !el.cards.childElementCount));
  if (el.cardsLeft) el.cardsLeft.classList.toggle("hidden", !!(hidden || !el.cardsLeft.childElementCount));
}
function bindMode() {
  const set = (m) => {
    readMode = m;
    if (!reviewContext) storage.writeMode(m);
    applySubtitle();
  };
  if (el.modeEn) el.modeEn.addEventListener("click", () => set("en"));
  if (el.modeEnZh) el.modeEnZh.addEventListener("click", () => set("enzh"));
  applySubtitle();
}
function bindSettings() {
  const syncLessonSettings = () => {
    if (el.gradeG12) el.gradeG12.classList.toggle("active", lessonSettings.gradeBand === "g1_2");
    if (el.gradeG34) el.gradeG34.classList.toggle("active", lessonSettings.gradeBand === "g3_4");
    if (el.gradeG56) el.gradeG56.classList.toggle("active", lessonSettings.gradeBand === "g5_6");
    if (el.intensityLight) el.intensityLight.classList.toggle("active", lessonSettings.intensity === "light");
    if (el.intensityStandard) el.intensityStandard.classList.toggle("active", lessonSettings.intensity === "standard");
    if (el.intensityChallenge) el.intensityChallenge.classList.toggle("active", lessonSettings.intensity === "challenge");
  };
  const setLessonSetting = (key, value) => {
    lessonSettings = storage.writeLessonSettings(Object.assign({}, lessonSettings, { [key]: value }));
    syncLessonSettings();
  };
  if (el.gradeG12) el.gradeG12.addEventListener("click", () => setLessonSetting("gradeBand", "g1_2"));
  if (el.gradeG34) el.gradeG34.addEventListener("click", () => setLessonSetting("gradeBand", "g3_4"));
  if (el.gradeG56) el.gradeG56.addEventListener("click", () => setLessonSetting("gradeBand", "g5_6"));
  if (el.intensityLight) el.intensityLight.addEventListener("click", () => setLessonSetting("intensity", "light"));
  if (el.intensityStandard) el.intensityStandard.addEventListener("click", () => setLessonSetting("intensity", "standard"));
  if (el.intensityChallenge) el.intensityChallenge.addEventListener("click", () => setLessonSetting("intensity", "challenge"));
  syncLessonSettings();

  const syncSideCards = () => {
    if (el.sideCardsOn) el.sideCardsOn.classList.toggle("active", sideCardsOn);
    if (el.sideCardsOff) el.sideCardsOff.classList.toggle("active", !sideCardsOn);
    applySideCards();
  };
  const setSideCards = (on) => {
    sideCardsOn = Boolean(on);
    if (!reviewContext) storage.writeSideCards(sideCardsOn);
    syncSideCards();
  };
  if (el.sideCardsOn) el.sideCardsOn.addEventListener("click", () => setSideCards(true));
  if (el.sideCardsOff) el.sideCardsOff.addEventListener("click", () => setSideCards(false));
  syncSideCards();

  const syncLv = () => {
    if (el.lvLite) el.lvLite.classList.toggle("active", learnLevel === "lite");
    if (el.lvStd) el.lvStd.classList.toggle("active", learnLevel === "std");
    if (el.lvMax) el.lvMax.classList.toggle("active", learnLevel === "max");
  };
  const setLv = (lv) => {
    learnLevel = lv;
    storage.writeLearnLevel(lv);
    syncLv();
    if (book) {
      rebuildStudyPlan();
      rehomePlotQuizzes();
      rebuildCheckpointPlan();
      collectBagThrough(idx);
      fillSideCards();
    }
  };
  if (el.lvLite) el.lvLite.addEventListener("click", () => setLv("lite"));
  if (el.lvStd) el.lvStd.addEventListener("click", () => setLv("std"));
  if (el.lvMax) el.lvMax.addEventListener("click", () => setLv("max"));
  syncLv();
  const setRate = (n) => {
    playRate = storage.writePlayRate(n);
    applyPlayRate();
  };
  if (el.rateSlow) el.rateSlow.addEventListener("click", () => setRate(0.75));
  if (el.rateNorm) el.rateNorm.addEventListener("click", () => setRate(1));
  if (el.rateFast) el.rateFast.addEventListener("click", () => setRate(1.25));
  applyPlayRate();
  const setPass = (m) => {
    passMode = m;
    if (!reviewContext) storage.writePassMode(m);
    syncPassButtons();
    if (book && book.nodes) {
      stopSeq();
      rebuildCheckpointPlan();
      render();
    }
  };
  if (el.passStory) el.passStory.addEventListener("click", () => setPass("story"));
  if (el.passStudy) el.passStudy.addEventListener("click", () => setPass("study"));
  syncPassButtons();
  if (el.gear && el.settings) {
    el.gear.addEventListener("click", (e) => {
      e.stopPropagation();
      el.settings.classList.toggle("hidden");
    });
    document.addEventListener("click", (e) => {
      if (el.settings.classList.contains("hidden")) return;
      if (e.target.closest(".w-settings")) return;
      el.settings.classList.add("hidden");
    });
  }
}
function bindAnnot() {
  const set = (on) => {
    annotOn = on;
    storage.writeAnnot(on);
    if (el.annotOn) el.annotOn.classList.toggle("active", on);
    if (el.annotOff) el.annotOff.classList.toggle("active", !on);
    if (book && book.nodes && book.nodes[idx]) {
      renderEnText(book.nodes[idx]);
      if (el.video && !el.video.paused) startKaraoke();
    }
  };
  if (el.annotOn) el.annotOn.addEventListener("click", () => set(true));
  if (el.annotOff) el.annotOff.addEventListener("click", () => set(false));
  if (el.annotOn) el.annotOn.classList.toggle("active", annotOn);
  if (el.annotOff) el.annotOff.classList.toggle("active", !annotOn);
}
function applyReviewReturnNavigation() {
  if (!el.back || !reviewReturnUrl) return;
  el.back.textContent = "返回题目";
  el.back.title = "返回当前测验题";
  el.back.setAttribute("aria-label", "返回当前测验题");
  el.back.href = reviewReturnUrl;
}
function bindPlayer() {
  el.prev.addEventListener("click", () => {
    for (let i = idx - 1; i >= 0; i--) {
      if (isListenNode(book.nodes[i])) { goListen(i); return; }
    }
  });
  el.next.addEventListener("click", next);
  if (el.enPlay) el.enPlay.addEventListener("click", () => { stopSeq(); playCurrentSentence(); });
  if (el.zhPlay) el.zhPlay.addEventListener("click", () => { playZhSentence(); });
  (function bindSentenceHold() {
    let timer = null;
    const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
    el.en.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".w-term, .w-sent-mark")) return;
      clear();
      timer = setTimeout(() => playCurrentSentence(), 420);
    });
    el.en.addEventListener("pointerup", clear);
    el.en.addEventListener("pointerleave", clear);
    el.en.addEventListener("contextmenu", (e) => e.preventDefault());
    bindPressSpeak(el.zh, () => {
      const n = book.nodes[idx];
      if (n && n.text_zh) playSeq(zhItems(n.text_zh));
    });
  })();
  el.autoBtn.addEventListener("click", () => {
    autoPlay = !autoPlay;
    storage.writeAutoPlay(autoPlay);
    el.autoBtn.classList.toggle("active", autoPlay);
    el.autoBtn.textContent = autoPlay ? "自动播放中" : "手动";
    if (autoPlay) scheduleNextSentence();
  });
  el.autoBtn.classList.toggle("active", autoPlay);
  el.autoBtn.textContent = autoPlay ? "自动播放中" : "手动";
  if (el.breakRest) el.breakRest.addEventListener("click", () => {
    if (el.breakCard && el.breakCard.dataset.resting === "1") resumeAfterBreak();
    else startBreakRest();
  });
  if (el.breakListen) el.breakListen.addEventListener("click", () => showListenPanel());
  if (el.breakContinue) el.breakContinue.addEventListener("click", () => resumeAfterBreak());
      if (el.listenStart) el.listenStart.addEventListener("click", () => {
        const loops = el.listenLoops ? Number(el.listenLoops.value) : 2;
        if (el.listenPanel) el.listenPanel.classList.add("hidden");
        enterListenMode({ loops, subtitle: readMode, audioOnly: true });
      });
  if (el.listenPanelClose) el.listenPanelClose.addEventListener("click", () => {
    hideListenPanel();
    if (!breakOpen) resumeStudyClock();
  });
  if (el.listenPause) el.listenPause.addEventListener("click", () => {
    if (!listenSession) return;
    const state = listenSession.snapshot();
    if (state.status === "paused") {
      listenSession.resume();
      updateListenBar();
      playCurrentSentence();
    } else {
      listenSession.pause();
      stopSeq();
      updateListenBar();
    }
  });
  if (el.listenExit) el.listenExit.addEventListener("click", () => exitListenMode());
  if (el.listenReturn) el.listenReturn.addEventListener("click", () => exitListenMode());
  if (el.listenAgain) el.listenAgain.addEventListener("click", () => {
    const before = listenBefore || { idx, passMode, readMode, audioOnly: audioOnlyListen };
    const loops = listenSession ? listenSession.snapshot().loops : 2;
    exitListenMode();
    idx = Number(before.idx) || 0;
    enterListenMode({ loops, subtitle: before.readMode || readMode, audioOnly: before.audioOnly });
  });
  el.back.addEventListener("click", (e) => {
    e.preventDefault();
    stopSeq();
    location.href = reviewReturnUrl || "shelf.html";
  });
  document.addEventListener("pointerdown", (e) => {
    if (!el.vocabPeek || el.vocabPeek.classList.contains("hidden")) return;
    if (e.target.closest("#w-vocab-peek, .w-term, .vcard-context")) return;
    hideVocabPeek();
  });
  document.addEventListener("keydown", (e) => {
    if (el.player.classList.contains("hidden")) return;
    if (e.key === "Escape" && el.vocabPeek && !el.vocabPeek.classList.contains("hidden")) {
      e.preventDefault();
      hideVocabPeek();
      return;
    }
    if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); next(); }
    if (e.key === "ArrowLeft") {
      for (let i = idx - 1; i >= 0; i--) {
        if (isListenNode(book.nodes[i])) { e.preventDefault(); goListen(i); return; }
      }
    }
  });
}
el.reviewBtn.addEventListener("click", () => openReview(parseInt(el.reviewBtn.dataset.ep || "2", 10)));
el.rback.addEventListener("click", (e) => { e.preventDefault(); stopSeq(); location.href = "shelf.html"; });
$("w-rtabs").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  [...$("w-rtabs").children].forEach((x) => x.classList.toggle("active", x === b));
  renderReviewTab(b.dataset.tab);
});

bindMode();
bindAnnot();
bindSettings();
bindPlayer();
renderSP();
if (ep >= 1) {
  (async () => {
    try {
      const [loadedBook, catalog] = await Promise.all([
        j(`../data/dialogue_stories/ep${ep}.json`),
        j("../data/storybooks/catalog.json").catch(() => ({ episodes: [] })),
      ]);
      book = loadedBook;
      episodeCatalog = Object.fromEntries((catalog?.episodes || []).map((item) => [item.episode, item]));
    } catch (e) {
      if (window.BookPlayContentGate) {
        window.BookPlayContentGate.showImportPrompt({ series: "jttw", id: ep });
      } else {
        document.body.textContent = `第 ${ep} 集暂未导入，请选择对应数据包。`;
      }
      return;
    }
    episodeWalker = null;
    episodeWalkerEpisode = null;
    if (!book.video) book.video = `assets/video/ep${ep}.mp4`;
    rawNodes = book.nodes;
    passMode = resolvePassMode();
    syncPassButtons();
    applyReviewReturnNavigation();
    rebuildLexIndex();
    document.title = `豆豆龙英语 · 第${ep}集 ${book.title.en}`;
        await loadCompanionData();
        if (!audioOnlyListenQuery) await ensureVideo();
    [wordAudio, zhAudio, enAudio, sentEnAudio, sentZhAudio] = await Promise.all([
      j(`../assets/adv_audio/ep${ep}/index.json`).catch(() => ({})),
      j("../assets/adv_audio/zh_index.json").catch(() => ({})),
      j("../assets/adv_audio/en_index.json").catch(() => ({})),
      j("../assets/adv_audio/sent_en_index.json").catch(() => ({})),
      j("../assets/adv_audio/sent_zh_index.json").catch(() => ({})),
    ]);
    await mergeQuizAudio();
    const saved = progress()[ep];
    const requestedNodeIndex = requestedNodeQuery
      ? rawNodes.findIndex((node) => String(node && node.node_id || "") === String(requestedNodeQuery))
      : -1;
    const requestedIdxValue = params.get("idx");
    const requestedIndex = requestedNodeIndex >= 0
      ? requestedNodeIndex
      : (requestedIdxValue !== null && Number.isFinite(Number(requestedIdxValue))
        ? Math.max(0, Math.min(rawNodes.length - 1, Number(requestedIdxValue))) : -1);
    const hasReviewTarget = requestedIndex >= 0;
    idx = hasReviewTarget
      ? requestedIndex
      : (reviewContext ? 0 : (saved && saved.node ? Math.min(rawNodes.length - 1, saved.node - 1) : 0));
    const keepId = rawNodes[idx] && rawNodes[idx].node_id;
    rebuildPlayNodes(keepId);
    rebuildStudyPlan();
    rehomePlotQuizzes();
    rebuildCheckpointPlan();
    askedThisEp = new Set();
    loadStudyClock();
    if (!hasReviewTarget && !isListenNode(book.nodes[idx])) {
      const i = nextListenIndex(idx - 1);
      idx = i >= 0 ? i : firstListenIndex();
    }
    el.map.classList.add("hidden");
    el.player.classList.remove("hidden");
        startStudyHeartbeat();
        if (listenQuery) {
          enterListenMode({
            loops: Number(listenQueryLoops),
            subtitle: queryReadMode(readModeQuery, "en"),
            audioOnly: audioOnlyListenQuery,
            autoStop: true,
          });
    } else {
      render({ willPlay: true });
      playCurrentSentence();
    }
  })();
} else {
  location.replace("home.html");
}
