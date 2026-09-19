/* ============================================================================
 * 西游记 · 合辑路线图 (map.html)
 * ----------------------------------------------------------------------------
 * 手动造进度 (localStorage) 验收方法:
 *
 *   1) 清空进度:
 *        localStorage.removeItem("bookplay_adv_progress")
 *        localStorage.removeItem("bookplay_drill")
 *        localStorage.removeItem("bookplay_battle_progress_v1")
 *      西游记：所有集都可点，贴纸为「未完成」；巩固关仍按辑锁定。
 *      其它系列：只有第 1 辑第 1 集可点 (current), 其余全部锁定。
 *
 *   2) 学完第 1 辑前两集:
 *        localStorage.setItem("bookplay_adv_progress", JSON.stringify({
 *          "1": { node: 7, total: 7, done: true },
 *          "2": { node: 2, total: 7, done: false }
 *        }))
 *      刷新后: 第 2 集高亮为「开始」, 第 3 集起锁定;
 *              第 1 辑巩固圆点仍锁, 第 2 辑整页锁并显示「学完上一辑解锁」。
 *
 *   3) 本切片没有 drill.html, drillDone 恒为 false, 所以按规则只有第 1 辑
 *      可玩 —— 这是预期行为, 不要为「看到后面」绕过规则。
 *      想临时看第 2 辑解锁: 把 1..7 全标 done, 再执行:
 *        localStorage.setItem("bookplay_drill", JSON.stringify({ "c01": { done: true } }))
 *      刷新后第 2 辑即可滑过去。
 * ========================================================================== */
"use strict";

const SERIES_PARAM = new URLSearchParams(location.search).get("series");
const SERIES_ID = SERIES_PARAM === "minecraft" ? "minecraft"
  : SERIES_PARAM === "mikey-jj" ? "mikey-jj"
  : "jttw";
const SERIES = SERIES_ID === "minecraft" ? {
  collectionsUrl: "/data/storybooks-minecraft/collections.json",
  catalogUrl: "/data/storybooks-minecraft/catalog.json",
  progKey: "bookplay_story_progress",   // storybook.js 写的就是这个
  progPrefix: "minecraft:",
  hasDrill: false,
  href: (n) => `storybook.html?series=minecraft&book=${n}&ui=unified-v3`,
  listUrl: "shelf.html?series=minecraft",
  splashCover: "/data/assets/minecraft/escape-from-the-nether/cover.webp",
  pageTitle: "豆豆龙英语 · 我的世界路线图",
  unit: "本",
} : SERIES_ID === "mikey-jj" ? {
  collectionsUrl: "/data/storybooks-mikey-jj/collections.json",
  catalogUrl: "/data/storybooks-mikey-jj/catalog.json",
  progKey: "bookplay_story_progress",
  progPrefix: "mikey-jj:",
  hasDrill: false,
  href: (n) => `storybook.html?series=mikey-jj&book=${n}&ui=unified-v3`,
  listUrl: "shelf.html?series=mikey-jj",
  splashCover: "/data/assets/mikey-jj/zombie-school-adventure/pages/p01.webp",
  pageTitle: "豆豆龙英语 · Mikey & JJ 路线图",
  unit: "本",
} : {
  collectionsUrl: "/data/dialogue_stories/collections.json",
  catalogUrl: "/data/storybooks/catalog.json",
  progKey: "bookplay_adv_progress",
  progPrefix: "",
  hasDrill: true,
  dualPath: true,
  href: (n) => `wala.html?ep=${n}`,
  listUrl: "shelf.html",
  splashCover: "/data/assets/covers/journey-west-cover.png",
  pageTitle: "豆豆龙英语 · 西游记路线图",
  unit: "集",
};

const PROG_KEY  = SERIES.progKey;
const DRILL_KEY = "bookplay_drill";
const SP_KEY    = "bookplay_sp";

const COLLECTIONS_URL = SERIES.collectionsUrl;
const CATALOG_URL     = SERIES.catalogUrl;
const MAP_AUDIO_URL   = SERIES_ID === "jttw" ? "/data/assets/map_audio/index.json" : "";
const ACHIEVEMENTS_URL = SERIES_ID === "minecraft"
  ? "/data/achievements/minecraft.json"
  : "/data/achievements/jttw.json";
const COMPANION_URL = SERIES_ID === "minecraft"
  ? "/data/companions/block-buddy.json"
  : "/data/companions/white-dragon.json";
/* JTTW 地图路线伙伴：原创孙悟空风格四向走路精灵图集。Minecraft 地图继续使用
 * 原来的内联占位图，避免把西游角色带入另一条路线。图集行顺序为
 * east / south / west / north，每行 8 帧。 */
/* 路线伙伴图集：四向走路精灵（行顺序 east/south/west/north，每行 8 帧，
 * 背景尺寸 800% 400%）。西游记用悟空图集；Mikey & JJ 用同名规格的
 * mikey-walk-atlas.png（未生成/加载失败时回退内联占位小人）。 */
function routeCompanionSpriteUrl() {
  if (SERIES_ID === "jttw") return "/data/assets/generated/jttw-route-companion/transparent/wukong-walk-atlas.png";
  if (SERIES_ID === "mikey-jj") return "/data/assets/generated/mikey-jj-route-companion/transparent/mikey-walk-atlas.png";
  if (SERIES_ID === "minecraft") return "/data/assets/generated/minecraft-route-companion/transparent/byte-walk-atlas.png";
  return "";
}
const ROUTE_COMPANION_SPRITE_URL = routeCompanionSpriteUrl();
/* 第一章先按集切换真正的主角图集。后续章节继续沿用悟空图集，直到对应
 * 章节资产生成；映射是显式的，避免标题/台词缺失时全部误用悟空。 */
const JTTW_EPISODE_ROUTE_CAST = Object.freeze({
  1: "wukong", 2: "wukong", 3: "subodhi", 4: "subodhi",
  5: "chaosdemon", 6: "dragonking", 7: "wukong",
});
const ROUTE_CAST_ATLAS = Object.freeze({
  wukong: "/data/assets/generated/jttw-player-walkers/wukong/wukong-walk-action-atlas.png",
  subodhi: "/data/assets/generated/jttw-player-walkers/subodhi/subodhi-walk-action-atlas.png",
  chaosdemon: "/data/assets/generated/jttw-player-walkers/chaosdemon/chaosdemon-walk-action-atlas.png",
  dragonking: "/data/assets/generated/jttw-player-walkers/dragonking/dragonking-walk-action-atlas.png",
});
function routeCastForEpisode(value) {
  if (SERIES_ID !== "jttw") return "";
  const episode = Number(value);
  return JTTW_EPISODE_ROUTE_CAST[episode] || "wukong";
}
function routeAtlasForEpisode(value) {
  const role = routeCastForEpisode(value);
  return ROUTE_CAST_ATLAS[role] || ROUTE_COMPANION_SPRITE_URL;
}
function setCompanionAtlas(mark, node) {
  if (!mark || SERIES_ID !== "jttw") return;
  const episode = node?.dataset?.episode;
  const role = routeCastForEpisode(episode);
  const atlas = routeAtlasForEpisode(episode);
  if (!atlas) return;
  mark.dataset.role = role;
  mark.setAttribute("data-role", role);
  mark.style.setProperty("--route-companion-sprite", `url('${atlas}')`);
}
/* 图集是异步探测的：加载成功才切到精灵图，否则保留占位小人，避免空盒子。 */
let routeCompanionSpriteReady = false;
if (ROUTE_COMPANION_SPRITE_URL && typeof Image !== "undefined") {
  const spriteProbe = new Image();
  spriteProbe.onload = () => {
    routeCompanionSpriteReady = true;
    document.body.classList.add("route-companion-sprite-ready");
    document.querySelectorAll(".route-companion").forEach((mark) => {
      if (!mark.querySelector(".route-companion-sprite")) mark.innerHTML = companionMarkup();
    });
  };
  spriteProbe.src = ROUTE_COMPANION_SPRITE_URL;
}
const ACHIEVEMENTS_KEY = "bookplay_achievements_v1";
const ACHIEVEMENTS_STORAGE_KEY = SERIES_ID === "minecraft"
  ? `${ACHIEVEMENTS_KEY}:minecraft`
  : ACHIEVEMENTS_KEY;

const $ = (id) => document.getElementById(id);
const track = $("map-track");

let cols = [];           // collections.json 的 collections[]
let catalogMap = new Map(); // episode -> { title: { en, zh }, cover }
let pages = [];          // { col, el }
let visibleCollectionIndex = -1;
let narrationReady = false;
let narrationTimer = 0;
let speechToken = 0;
let activeSpeechTrigger = null;
let mapAudio = { collections: {}, episodes: {} };
let achievementCatalog = { achievements: [] };
let companionCatalog = { stages: [] };
const mapAudioPlayer = new Audio();
const MAP_NARRATION_RATE = 0.8;
mapAudioPlayer.defaultPlaybackRate = MAP_NARRATION_RATE;
mapAudioPlayer.playbackRate = MAP_NARRATION_RATE;
mapAudioPlayer.preservesPitch = true;
let mapUtterance = null;
window.BookPlayAudio?.watchMedia(mapAudioPlayer);
let audioResolver = null;

/* ---------------- 数据读取 ----------------
 * 渲染一屏要判上百次 epDone/colDone，每次都 JSON.parse 太浪费。
 * 按渲染缓存，buildPages 开头和写入 localStorage 后失效。 */
let progCache = null;
let drillCache = null;

const readProg = () => {
  if (!progCache) {
    try { progCache = JSON.parse(localStorage.getItem(PROG_KEY) || "{}"); } catch { progCache = {}; }
  }
  return progCache;
};
const readDrill = () => {
  if (!drillCache) {
    try { drillCache = JSON.parse(localStorage.getItem(DRILL_KEY) || "{}"); } catch { drillCache = {}; }
  }
  return drillCache;
};
const invalidateCache = () => { progCache = null; drillCache = null; };

/* A1 升级豁免迁移：一次性，永不重复。升级时已经学完的合辑自动记为巩固通过 */
const MIGRATE_KEY = "bookplay_drill_migrated";

function grandfatherDrills() {
  if (!SERIES.hasDrill) return 0;
  if (localStorage.getItem(MIGRATE_KEY)) return 0;   // 只跑一次
  const d = readDrill();
  let n = 0;
  for (const c of cols) {
    if (colDone(c) && !d[c.id]) { d[c.id] = { done: true, grandfathered: true, at: Date.now() }; n++; }
  }
  localStorage.setItem(DRILL_KEY, JSON.stringify(d));
  localStorage.setItem(MIGRATE_KEY, "1");
  invalidateCache();
  return n;
}

/* ---------------- 解锁规则 (照抄任务卡, 不要自己发明) ---------------- */
const epNums = (c) => {
  if (Array.isArray(c.books) && c.books.length) return c.books.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
  const a = [];
  for (let n = c.from; n <= c.to; n++) a.push(n);
  return a;
};

function collectionRangeLabel(c) {
  const nums = epNums(c);
  if (!nums.length) return `暂无${SERIES.unit}`;
  const contiguous = nums.every((value, index) => index === 0 || value === nums[index - 1] + 1);
  if (contiguous) return `第${nums[0]}—${nums[nums.length - 1]}${SERIES.unit}`;
  // Published catalogs can intentionally skip source numbers (for example
  // Mikey & JJ has no book 4). Show the real list instead of implying dead
  // links generated from the from/to range.
  return `第${nums.join("、")}${SERIES.unit}`;
}

const progId  = (n) => SERIES.progPrefix ? SERIES.progPrefix + n : n;
const epDone  = (n) => { const p = readProg()[progId(n)]; return !!(p && p.done); };
const GAME_PROG_KEY = "bookplay_battle_progress_v1";
function readGameProg() {
  try { return JSON.parse(localStorage.getItem(GAME_PROG_KEY) || "{}"); }
  catch { return {}; }
}
const gameDone = (n) => {
  const rec = readGameProg()[n] || readGameProg()[String(n)] || {};
  return rec.mapStage === "complete" || Number(rec.clears) > 0;
};
const epCleared = (n) => epDone(n) || (SERIES_ID === "jttw" && gameDone(n));
const colDone = (c) => epNums(c).every(epDone);
const drillDone = (c) => !SERIES.hasDrill || !!(readDrill()[c.id] && readDrill()[c.id].done);
const colUnlocked = (c, prev) => c.index === 1 || (colDone(prev) && drillDone(prev));
// 西游记选关开放所有集；巩固关仍按辑锁定。其它系列保持顺序解锁。
const OPEN_SELECT = SERIES_ID === "jttw";
const epUnlocked  = (n, c) => {
  if (OPEN_SELECT) return true;
  const nums = epNums(c);
  const i = nums.indexOf(n);
  return i <= 0 || epDone(nums[i - 1]);
};
const drillUnlocked = (c, prev) => colUnlocked(c, prev) && colDone(c);

function collectionIdForEp(n) {
  const hit = cols.find((item) => Number(item.from) <= n && n <= Number(item.to));
  return hit && hit.id ? hit.id : "c01";
}

/* 合辑 = 世界，集 = 节点。字段形状对齐像素世界 manifest
 * (id/title/subtitle/background + nodes[{levelId,order,label,subtitle,position,icon}])，
 * 文案、封面、坐标都用西游合辑/目录，不引入星港/森林/方块。 */
function collectionWorld(c) {
  const authored = Array.isArray(c.nodes) ? c.nodes : [];
  const authoredByEp = new Map();
  authored.forEach((node) => {
    const id = Number(node.levelId || node.episode);
    if (Number.isFinite(id) && id > 0) authoredByEp.set(id, node);
  });
  return {
    id: c.id,
    title: (c.title && c.title.zh) || "",
    subtitle: (c.summary && c.summary.zh) || "",
    background: c.background || "",
    nodes: epNums(c).map((n, i) => {
      const extra = authoredByEp.get(n) || {};
      const meta = epMeta(n);
      const pos = extra.position && typeof extra.position === "object" ? extra.position : null;
      return {
        worldId: c.id,
        levelId: n,
        order: extra.order || i + 1,
        label: extra.label || meta.zh,
        subtitle: extra.subtitle || meta.en,
        icon: extra.icon || meta.cover,
        position: pos,
      };
    }),
  };
}

function worldNodeAnchors(c, nodeCount) {
  const world = collectionWorld(c);
  if (world.nodes.length !== nodeCount) return null;
  const pts = world.nodes.map((node) => {
    const x = Number(node.position && node.position.x);
    const y = Number(node.position && node.position.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return (x > 1 || y > 1) ? [x / 100, y / 100] : [x, y];
  });
  if (pts.some((p) => !p)) return null;
  return pts;
}

function buildWorldStrip() {
  // 2026-09-12 全屏改版：合辑缩略图条不再展示（切辑用两侧 ‹ › 箭头/滑动）
  const nav = $("map-worlds");
  if (!nav) return;
  nav.hidden = true;
  nav.innerHTML = "";
  return;
  if (SERIES_ID !== "jttw") {
    nav.hidden = true;
    nav.innerHTML = "";
    document.body.classList.remove("map-terminal");
    return;
  }
  document.body.classList.add("map-terminal");
  nav.hidden = false;
  nav.innerHTML = cols.map((c, i) => {
    const world = collectionWorld(c);
    const thumb = c.background ? `/data/${c.background}` : "";
    const img = thumb ? `<img src="${thumb}" alt="">` : "";
    return `<button type="button" class="map-world-button" data-world-index="${i}" aria-selected="false">
      ${img}
      <span><strong>${world.title}</strong><small>${collectionRangeLabel(c)} · ${world.nodes.length}站</small></span>
    </button>`;
  }).join("");
  nav.querySelectorAll(".map-world-button").forEach((btn) => {
    btn.addEventListener("click", () => scrollToIndex(Number(btn.dataset.worldIndex)));
  });
}

/* ---------------- 小工具 ---------------- */
function toast(msg) {
  const t = $("map-toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add("hidden"), 2200);
}

/* catalog.json 里每集都有 cover / title.en / title.zh；catalog 拉取失败时退化成集号 */
function epMeta(n) {
  const ep = catalogMap.get(n) || {};
  const t = ep.title || {};
  return {
    cover: ep.cover ? `/data/${ep.cover}` : "",
    en: t.en || "",
    zh: t.zh || `第${n}${SERIES.unit}`,
  };
}

function renderSP() {
  const el = $("sp-badge");
  if (!el) return; // 顶栏已随全屏改版移除
  try {
    el.textContent = `★ ${parseInt(localStorage.getItem(SP_KEY) || "0", 10)}`;
  } catch {
    el.hidden = true;  // 读不到 SP 时整块省略
  }
}

function readObject(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch (_) { return {}; }
}

function companionGlyph(stage) {
  if (!stage) return "🥚";
  if (stage.form === "egg") return "🥚";
  if (stage.form === "wolf") return "🐺";
  if (stage.form === "horse") return "🐎";
  return "🐉";
}

const SPLASH_CHAPTER_SHAPES = [
  "seal", "cloud", "diamond", "shield", "lotus", "gourd", "flame",
  "ribbon", "scroll", "star", "sun", "knot", "crown",
];

function splashMedalShape(item) {
  if (item?.kind !== "chapter") return "star";
  const number = Number(String(item.condition?.collection_id || "").replace(/^c/, ""));
  return SPLASH_CHAPTER_SHAPES[number - 1] || "seal";
}

function renderSplashMedals(result) {
  const strip = $("splash-medal-strip");
  const empty = $("splash-medal-empty"); // Minecraft splash-medal-empty：完成一本故事后再点亮
  if (!strip) return;
  const recent = (result?.earned || [])
    .slice()
    .sort((a, b) => (b.receipt?.at || 0) - (a.receipt?.at || 0))
    .slice(0, 3);
  strip.replaceChildren();
  recent.forEach((item) => {
    const badge = document.createElement("span");
    badge.className = `splash-medal shape-${splashMedalShape(item)}`;
    const fallback = SERIES_ID === "minecraft" ? "方块勋章" : "西游勋章";
    badge.setAttribute("title", item.name || fallback);
    badge.setAttribute("aria-label", `${item.name || fallback}，已获得`);
    badge.textContent = item.glyph || "章";
    strip.appendChild(badge);
  });
  if (empty) {
    empty.hidden = recent.length > 0;
    empty.textContent = SERIES_ID === "minecraft"
      ? "完成一本故事，点亮第一枚方块勋章"
      : "完成一集故事，点亮第一枚勋章";
  }
}

function renderCompanionSummary() {
  const entry = $("companion-entry"); // 顶栏已随全屏改版移除：函数体内部逐项判空，splash 渲染继续
  const splashEntry = $("splash-companion");
  const supportsCompanion = SERIES_ID === "jttw" || SERIES_ID === "minecraft";
  const isMinecraft = SERIES_ID === "minecraft";
  if (entry) {
    entry.hidden = !supportsCompanion;
    if (supportsCompanion) {
      entry.href = `companion.html?series=${SERIES_ID}`;
      entry.setAttribute("aria-label", isMinecraft ? "进入 Byte 方块驿站" : "进入白龙马驿站");
    }
  }
  if (splashEntry) {
    splashEntry.hidden = !supportsCompanion;
    if (supportsCompanion) {
      splashEntry.href = `companion.html?series=${SERIES_ID}`;
      splashEntry.setAttribute("aria-label", isMinecraft ? "进入 Byte 方块驿站" : "进入白龙马驿站");
    }
  }
  if (!supportsCompanion) {
    const splashMedals = $("splash-companion-medals");
    if (splashMedals) splashMedals.hidden = true;
    return;
  }
  if (!window.BookPlayCompanion) return;
  const saved = readObject(ACHIEVEMENTS_STORAGE_KEY);
  const result = window.BookPlayCompanion.evaluateAchievements({
    catalog: achievementCatalog,
    collections: cols,
    progress: readProg(),
    drills: readDrill(),
    receipts: saved.unlocked || {},
  });
  localStorage.setItem(ACHIEVEMENTS_STORAGE_KEY, JSON.stringify({
    schema_version: 1,
    catalog_version: achievementCatalog.catalog_version || 1,
    unlocked: result.receipts,
    migration_version: 1,
  }));
  const stage = window.BookPlayCompanion.deriveCompanionStage({
    catalog: companionCatalog,
    collections: cols,
    progress: readProg(),
    drills: readDrill(),
  });
  const total = achievementCatalog.achievements.length || (isMinecraft ? 3 : 19);
  const fallbackName = isMinecraft ? "神秘方块蛋" : "小白龙";
  const label = `${stage?.name || fallbackName} · 🏅 ${result.earned.length}/${total}`;
  if ($("companion-entry-label")) $("companion-entry-label").textContent = label;
  if ($("splash-companion-name")) $("splash-companion-name").textContent = stage?.name || fallbackName;
  if ($("splash-companion-progress")) $("splash-companion-progress").textContent = `🏅 ${result.earned.length} / ${total}`;
  renderSplashMedals(result);
  const icon = splashEntry?.querySelector(".splash-companion-icon");
  if (icon) icon.textContent = companionGlyph(stage);
  const entryIcon = entry?.querySelector("[data-companion-icon]");
  if (entryIcon) entryIcon.textContent = companionGlyph(stage);
}

/* ---------------- 标题与篇章朗读 ----------------
 * 首选预生成 Edge-TTS：晓晓读中文、Jenny 读英文，按中→英顺序双语播放。
 * 系统 Web Speech 只在预生成文件加载失败时兜底。新朗读会取消上一次，避免串音。 */
const speakerIcon = () => `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M4 9v6h4l5 4V5L8 9H4z"></path>
    <path d="M16 8.2a5 5 0 0 1 0 7.6M18.7 5.5a9 9 0 0 1 0 13"></path>
  </svg>`;

function clearSpeechState() {
  if (mapUtterance) window.BookPlayAudio?.setForeground(mapUtterance, false);
  mapUtterance = null;
  if (activeSpeechTrigger) activeSpeechTrigger.classList.remove("speaking");
  activeSpeechTrigger = null;
}

function stopGeneratedAudio() {
  mapAudioPlayer.pause();
  mapAudioPlayer.onended = null;
  mapAudioPlayer.onerror = null;
  if (audioResolver) {
    const resolve = audioResolver;
    audioResolver = null;
    resolve(false);
  }
}

function beginSpeech(trigger) {
  const token = ++speechToken;
  stopGeneratedAudio();
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  clearSpeechState();
  activeSpeechTrigger = trigger || null;
  if (activeSpeechTrigger) activeSpeechTrigger.classList.add("speaking");
  return token;
}

function speakText(text, lang, trigger) {
  if (!("speechSynthesis" in window) || !text) {
    toast("当前设备暂不支持标题朗读");
    return false;
  }
  const token = beginSpeech(trigger);

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = lang.startsWith("zh") ? 0.8 : 0.75;
  mapUtterance = utterance;
  utterance.onstart = () => {
    if (token === speechToken) window.BookPlayAudio?.setForeground(utterance, true);
  };
  const want = lang.toLowerCase().slice(0, 2);
  const voice = window.speechSynthesis.getVoices()
    .find((v) => (v.lang || "").toLowerCase().startsWith(want));
  if (voice) utterance.voice = voice;

  const done = () => {
    if (token !== speechToken) return;
    clearSpeechState();
  };
  utterance.onend = done;
  utterance.onerror = done;
  window.speechSynthesis.speak(utterance);
  return true;
}

function playGeneratedClip(rel, token) {
  return new Promise((resolve) => {
    if (token !== speechToken || !rel) return resolve(false);
    const done = (ok) => {
      mapAudioPlayer.onended = null;
      mapAudioPlayer.onerror = null;
      audioResolver = null;
      resolve(ok);
    };
    audioResolver = resolve;
    mapAudioPlayer.src = rel.startsWith("/") ? rel : `/data/${rel}`;
    mapAudioPlayer.playbackRate = MAP_NARRATION_RATE;
    mapAudioPlayer.onended = () => done(true);
    mapAudioPlayer.onerror = () => done(false);
    mapAudioPlayer.play().catch(() => done(false));
  });
}

function playGeneratedAudio(paths, fallbackText, fallbackLang, trigger) {
  const clips = paths.filter(Boolean);
  if (!clips.length) return speakText(fallbackText, fallbackLang, trigger);
  const token = beginSpeech(trigger);
  (async () => {
    for (const clip of clips) {
      const ok = await playGeneratedClip(clip, token);
      if (token !== speechToken) return;
      if (!ok) {
        clearSpeechState();
        speakText(fallbackText, fallbackLang, trigger);
        return;
      }
    }
    if (token === speechToken) clearSpeechState();
  })();
  return true;
}

function speakCollection(index, trigger) {
  const c = cols[index];
  if (!c) return false;
  const range = `第${c.from}到${c.to}${SERIES.unit}`;
  const text = [c.title.zh, range, c.summary?.zh].filter(Boolean).join("。 ");
  const audio = mapAudio.collections?.[c.id] || {};
  return playGeneratedAudio([audio.zh, audio.en], text, "zh-CN", trigger);
}

function scheduleCollectionNarration(index) {
  clearTimeout(narrationTimer);
  narrationTimer = setTimeout(() => speakCollection(index), 900);
}

/* ---------------- 路线：开放三排 S 形折线 ----------------
 * 正常桌面/竖屏不再绕闭合环。节点按 1～3 排 S 形推进：偶数排从左到右、
 * 奇数排从右到左，排与排之间用斜向段连接。集数变多时加密列数，不按
 * 集数缩小 --card。坐标在 drawRoute 里按真实像素写入，与 SVG viewBox 一致。 */
const ZIGZAG_INSET_X = 0.13;
const ZIGZAG_INSET_Y = 0.18;
const CARD_MIN = 120;
const companionMemory = new Map();

function routeCfg(route) {
  const n = (k, fallback) => {
    const v = parseFloat(route.dataset[k]);
    return Number.isFinite(v) ? v : fallback;
  };
  return {
    insetX: n("insetX", ZIGZAG_INSET_X),
    top: n("top", ZIGZAG_INSET_Y),
    bottom: n("bottom", ZIGZAG_INSET_Y),
  };
}

function zigzagRowSizes(n) {
  if (n <= 0) return [];
  const rows = n <= 3 ? 1 : n <= 6 ? 2 : 3;
  const base = Math.floor(n / rows);
  const extra = n % rows;
  return Array.from({ length: rows }, (_, r) => base + (r < extra ? 1 : 0));
}

function zigzagPoints(w, h, n, cfg) {
  cfg = cfg || {};
  if (n <= 0) return [];
  let x0 = Math.max(24, (cfg.insetX ?? ZIGZAG_INSET_X) * w);
  let x1 = w - x0;
  const requestedY0 = Math.max(28, (cfg.top ?? ZIGZAG_INSET_Y) * h);
  const requestedY1 = h - Math.max(28, (cfg.bottom ?? ZIGZAG_INSET_Y) * h);
  if (n === 1) return [{ x: (x0 + x1) / 2, y: (requestedY0 + requestedY1) / 2 }];
  const sizes = zigzagRowSizes(n);
  const rows = sizes.length;
  let spanX = Math.max(8, x1 - x0);
  const requestedSpanY = Math.max(8, requestedY1 - requestedY0);
  /* 旧 route.top/bottom 是环形路线时代的视觉提示，不能继续把三排压到
   * 卡片高度以内。drawRoute 会把真实节点高度传进来，按「卡片高 + 间距」
   * 推出最小排距；只有在旧边距已经足够时才沿用它的纵向中心。 */
  const nodeHeight = Math.max(0, Number(cfg.nodeHeight) || 0);
  const rowGap = Math.max(12, Number(cfg.rowGap) || 16);
  const minSpanY = rows > 1 && nodeHeight
    ? (rows - 1) * (nodeHeight + rowGap)
    : 0;
  const requestedEdge = Math.max(28, Math.min(requestedY0, h - requestedY1));
  const targetSpanY = Math.max(requestedSpanY, minSpanY);
  /* 当旧边距不足以容纳「卡片高 + 行间距」时，向内收紧边距而不是
   * 再压缩排距；这样 top/bottom 仍是提示值，但不会制造卡片擦碰。 */
  const edge = targetSpanY > h - requestedEdge * 2
    ? Math.max(28, (h - targetSpanY) / 2)
    : requestedEdge;
  const availableSpanY = Math.max(8, h - edge * 2);
  const spanY = Math.min(availableSpanY, targetSpanY);
  /* 卡片整体抬起后，三排路线要在页头下方留出安全呼吸带；当最小排距
   * 触发扩展时向下偏一点，避免第一排封面顶住“继续学习”按钮。 */
  const verticalBias = spanY > requestedSpanY
    ? Math.min(20, Math.max(0, (h - spanY) * 0.1))
    : 0;
  const centeredY = spanY > requestedSpanY
    ? h / 2 + verticalBias
    : (requestedY0 + requestedY1) / 2;
  const minCenter = 28 + spanY / 2;
  const maxCenter = h - 28 - spanY / 2;
  const yCenter = Math.min(maxCenter, Math.max(minCenter, centeredY));
  const y0 = yCenter - spanY / 2;
  const y1 = yCenter + spanY / 2;
  const maxCount = Math.max(...sizes);
  /* 相邻排使用交错车道，让排间连接段保持斜向，也避免卡片在同一列
   * 完全重叠。偶数排占偶数车道，奇数排反向占奇数车道。 */
  const laneCount = Math.max(2, maxCount * 2);
  /* 窄屏上五张卡如果继续沿用旧 inset，laneStep 会小于卡片宽度的一半，
   * 同一排就会互相盖住。按真实节点宽度收紧到安全边缘，优先保留
   * 卡片尺寸；宽屏仍沿用数据里的 inset。 */
  const nodeWidth = Math.max(0, Number(cfg.nodeWidth) || 0);
  const minLaneStep = nodeWidth
    ? Math.max(8, nodeWidth * 0.5 + Math.max(2, nodeWidth * 0.02))
    : 0;
  const requiredSpanX = (laneCount - 1) * minLaneStep;
  if (requiredSpanX > spanX) {
    const safeInset = nodeWidth ? Math.max(24, nodeWidth / 2 + 4) : 24;
    const widenedInset = Math.max(safeInset, Math.min(x0, (w - requiredSpanX) / 2));
    x0 = widenedInset;
    x1 = w - x0;
    spanX = Math.max(8, x1 - x0);
  }
  const laneStep = spanX / (laneCount - 1);
  const denseRows = nodeWidth > 0 && requiredSpanX > spanX;
  const laneFor = (count, index, reverse) => {
    const slotIndex = count === 1
      ? Math.floor((maxCount - 1) / 2)
      : Math.round(index * (maxCount - 1) / (count - 1));
    return reverse
      ? (maxCount - 1 - slotIndex) * 2 + 1
      : slotIndex * 2;
  };
  const points = [];
  sizes.forEach((count, r) => {
    const yBase = rows === 1 ? (y0 + y1) / 2 : y0 + r * spanY / (rows - 1);
    const ltr = r % 2 === 0;
    for (let c = 0; c < count; c++) {
      const slot = laneFor(count, c, !ltr);
      let x = x0 + slot * laneStep;
      if (denseRows) {
        /* 当屏幕窄到无法放下交错车道时，同一排优先均匀铺满可用宽度，
         * 只给反向排留一点内缩，既保住卡片宽度，也让排间连接保持斜线。 */
        const t = count === 1 ? 0.5 : c / (count - 1);
        const rowInset = r % 2 ? Math.min(nodeWidth * 0.12, spanX * 0.04) : 0;
        const usable = Math.max(8, spanX - rowInset * 2);
        x = x0 + rowInset + (ltr ? t : 1 - t) * usable;
      }
      const t = spanX ? (x - x0) / spanX : 0.5;
      const yOff = (ltr ? t - 0.5 : 0.5 - t) * spanY * 0.05;
      points.push({ x, y: yBase + yOff });
    }
  });
  return points;
}

function zigzagPath(points) {
  if (!points.length) return "";
  const n = (v) => Number(v).toFixed(1);
  return points.map((p, i) => `${i ? "L" : "M"} ${n(p.x)} ${n(p.y)}`).join(" ");
}

function measureCardRatio(route, w) {
  route.style.setProperty("--card", w + "px");
  let tallest = 0;
  route.querySelectorAll(".node:not(.drill)").forEach((el) => {
    tallest = Math.max(tallest, el.offsetHeight);
  });
  return tallest ? tallest / w : 1;
}

/* 卡片宽度只看视口：宽屏上限 17.5%，高度要能放下三排。不按集数收缩。 */
function fitCardWidth(route, w, h) {
  const cap = Math.round(w * 0.27);
  const k = measureCardRatio(route, cap);
  const byHeight = k ? Math.floor((h - 36) / (3 * k)) : cap;
  return Math.max(CARD_MIN, Math.min(cap, byHeight || cap));
}

function companionIndex(nodes) {
  const current = nodes.findIndex((el) => el.classList.contains("current"));
  if (current >= 0) return current;
  let lastDone = -1;
  nodes.forEach((el, i) => { if (el.classList.contains("done")) lastDone = i; });
  return lastDone >= 0 ? lastDone : 0;
}

const COMPANION_DIRECTIONS = new Set(["east", "south", "west", "north"]);
const COMPANION_GAP = 14;
/* 路线上的角色要贴着标题侧边走：保留一点呼吸感，但不要像旧版那样
 * 整个角色宽度都离开卡片。脚部锚点再下移 4px，正好落在虚线的下沿。 */
const LINE_COMPANION_GAP = 6;
const LINE_COMPANION_FOOT_OFFSET = 4;

function overlapArea(a, b) {
  if (!a || !b) return 0;
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return width * height;
}

function clippedArea(box, width, height) {
  if (!box || !width || !height) return 0;
  const insideWidth = Math.max(0, Math.min(box.right, width) - Math.max(box.left, 0));
  const insideHeight = Math.max(0, Math.min(box.bottom, height) - Math.max(box.top, 0));
  return Math.max(0, box.width * box.height - insideWidth * insideHeight);
}

/* 伙伴是路线上的独立角色，不把中心点压回卡片。候选位置会同时考虑：
 * 当前卡片边缘、路线边界、相邻卡片碰撞；优先选择卡片外且不遮挡其它封面的
 * 一侧。这样桌面三排路线与极短横屏网格都能保持「大图 + 伙伴」的呼吸感。 */
function companionPlacement(route, nodes, index, w, h, mark, forwardDirection = "east", lineAnchor = null) {
  const rr = route.getBoundingClientRect();
  const node = nodes[index];
  if (!node || !rr.width || !rr.height) return null;
  const nr = node.getBoundingClientRect();
  const nodeBox = {
    left: nr.left - rr.left,
    top: nr.top - rr.top,
    right: nr.right - rr.left,
    bottom: nr.bottom - rr.top,
    width: nr.width,
    height: nr.height,
  };
  const coverRect = node.querySelector(".node-cover")?.getBoundingClientRect();
  const coverBottom = coverRect
    ? coverRect.bottom - rr.top
    : nodeBox.top + Math.min(nodeBox.height, nodeBox.width * 9 / 16);
  const markRect = mark.getBoundingClientRect();
  const mw = Math.max(1, markRect.width || mark.offsetWidth || 72);
  const mh = Math.max(1, markRect.height || mark.offsetHeight || 96);
  const center = {
    x: nodeBox.left + nodeBox.width / 2,
    y: nodeBox.top + nodeBox.height / 2,
  };
  const towardCenter = center.x < w / 2 ? "right" : "left";
  const compact = route.classList.contains("compact");
  const lineMode = !compact && lineAnchor
    && Number.isFinite(Number(lineAnchor.x)) && Number.isFinite(Number(lineAnchor.y));
  const verticalDistance = nodeBox.height / 2 + mh / 2 + COMPANION_GAP;
  const horizontalDistance = nodeBox.width / 2 + mw / 2 + COMPANION_GAP;
  const forwardSign = forwardDirection === "west" ? -1 : 1;
  const forwardOffset = Math.min(42, Math.max(18, nodeBox.width * 0.22));
  const regularCandidates = [
    { name: "above", dx: 0, dy: -1, distance: verticalDistance },
    { name: "above-forward", offsetX: forwardSign * forwardOffset, offsetY: -verticalDistance },
    { name: "below", dx: 0, dy: 1, distance: verticalDistance },
    { name: "below-forward", offsetX: forwardSign * forwardOffset, offsetY: verticalDistance },
    { name: "left", dx: -1, dy: 0, distance: horizontalDistance },
    { name: "right", dx: 1, dy: 0, distance: horizontalDistance },
  ];
  /* 普通路线沿虚线锚点选择卡片侧边，并把角色停在封面下沿的空白处；
   * 这样它会跟着路线移动，但不会压住封面或下面三行标题。compact 网格没有
   * 虚线，继续使用四周避让候选。 */
  const lineSide = forwardDirection === "west"
    ? "line-west"
    : forwardDirection === "east"
      ? "line-east"
      : towardCenter === "right" ? "line-east" : "line-west";
  const oppositeLineSide = lineSide === "line-east" ? "line-west" : "line-east";
  const lineCandidates = lineMode ? [
    /* line-* 仍使用脚部锚点变换，但把脚部放在「虚线 + 少量余量」处，
     * 让脚底贴着虚线、身体向上展开，既不遮住标题也不会被避让算法
     * 推到卡片上方。透明画布的底部留白由 10% 精灵高度吸收。 */
    {
      name: "line-east",
      line: true,
      cx: nodeBox.right + mw / 2 + LINE_COMPANION_GAP,
      cy: Math.max(Number(lineAnchor.y), coverBottom) + LINE_COMPANION_FOOT_OFFSET + mh * 0.1,
    },
    {
      name: "line-west",
      line: true,
      cx: nodeBox.left - mw / 2 - LINE_COMPANION_GAP,
      cy: Math.max(Number(lineAnchor.y), coverBottom) + LINE_COMPANION_FOOT_OFFSET + mh * 0.1,
    },
  ] : [];
  const candidates = [...lineCandidates, ...regularCandidates];
  const yRatio = h ? center.y / h : 0.5;
  const regularPreferred = compact
    ? [towardCenter, towardCenter === "right" ? "left" : "right", "above", "below"]
    : yRatio < 0.36
      ? ["below-forward", "below", towardCenter, towardCenter === "right" ? "left" : "right", "above-forward", "above"]
      : yRatio > 0.66
        ? ["above-forward", "above", towardCenter, towardCenter === "right" ? "left" : "right", "below-forward", "below"]
        : [towardCenter, towardCenter === "right" ? "left" : "right", "below-forward", "above-forward", "above", "below"];
  const preferred = lineMode
    ? [lineSide, oppositeLineSide, ...regularPreferred]
    : regularPreferred;
  const rank = new Map(preferred.map((name, i) => [name, i]));
  const otherBoxes = nodes
    .filter((_, i) => i !== index)
    .map((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left - rr.left, top: r.top - rr.top, right: r.right - rr.left, bottom: r.bottom - rr.top, width: r.width, height: r.height };
    });
  const scored = candidates.map((candidate) => {
    const cx = candidate.line
      ? candidate.cx
      : center.x + (candidate.offsetX ?? candidate.dx * candidate.distance);
    const cy = candidate.line
      ? candidate.cy
      : center.y + (candidate.offsetY ?? candidate.dy * candidate.distance);
    const box = {
      left: cx - mw / 2,
      top: candidate.line ? cy - mh : cy - mh / 2,
      right: cx + mw / 2,
      bottom: candidate.line ? cy : cy + mh / 2,
      width: mw,
      height: candidate.line ? mh : mh / 2 + mh / 2,
    };
    const selfOverlap = overlapArea(box, nodeBox);
    const neighborOverlap = otherBoxes.reduce((sum, other) => sum + overlapArea(box, other), 0);
    const clipped = clippedArea(box, w, h);
    /* 虚线侧边是伙伴的首选车道：只要不压住当前卡片，就优先于
     * 「上/下方但离虚线很远」的候选。相邻卡片的少量透明画布重叠
     * 由精灵本身的透明边缘吸收，仍以当前卡片自遮挡为硬约束。 */
    const linePriority = candidate.line && selfOverlap <= 0.5 ? -1e7 : 0;
    const score = linePriority + selfOverlap * 1000 + neighborOverlap * 100 + clipped * 2 + (rank.get(candidate.name) || 0) * 0.01;
    return { ...candidate, cx, cy, box, score };
  });
  scored.sort((a, b) => a.score - b.score);
  const chosen = scored[0];
  if (!chosen) return null;
  return {
    x: (chosen.cx / w) * 100,
    y: (chosen.cy / h) * 100,
    placement: chosen.name,
  };
}

/* 用相邻节点的位移选择四向图集行。对角线取位移较大的轴，避免小幅纵向
 * 排版抖动把水平行走误判成上下行走；没有足够位移时保持上一方向。 */
function companionDirection(from, to, fallback = "east") {
  const previous = COMPANION_DIRECTIONS.has(from?.direction) ? from.direction : fallback;
  const fx = Number(from?.x);
  const fy = Number(from?.y);
  const tx = Number(to?.x);
  const ty = Number(to?.y);
  if (![fx, fy, tx, ty].every(Number.isFinite)) return previous;
  const dx = tx - fx;
  const dy = ty - fy;
  if (Math.hypot(dx, dy) < 0.05) return previous;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "east" : "west";
  return dy >= 0 ? "south" : "north";
}

function companionPointDirection(points, index, fallback = "east") {
  if (!Array.isArray(points) || !points.length) return fallback;
  const current = points[index];
  if (!current) return fallback;
  if (index > 0 && points[index - 1]) {
    return companionDirection(points[index - 1], current, fallback);
  }
  if (index + 1 < points.length && points[index + 1]) {
    return companionDirection(current, points[index + 1], fallback);
  }
  return fallback;
}

/* 伙伴当前帧朝向沿「下一段」取值，保证它从一个节点走向下一个节点时，
 * 向前的停靠偏移也在虚线前进方向上；最后一个节点则沿到达方向停靠。 */
function companionForwardDirection(points, index, fallback = "east") {
  if (!Array.isArray(points) || !points.length) return fallback;
  if (points[index + 1]) return companionDirection(points[index], points[index + 1], fallback);
  if (points[index - 1]) return companionDirection(points[index - 1], points[index], fallback);
  return fallback;
}

/* 悬停时仍然沿同一条虚线向目标卡片走。这个小包装保留了 east/west 的
 * 明确语义，避免「鼠标在左边但精灵仍朝右」时只更新位置、不更新图集行。 */
function hoverDirection(from, to, fallback = "east") {
  const direction = companionDirection(from, to, fallback);
  if (direction === "west") return "west";
  if (direction === "east") return "east";
  return direction;
}

function companionMarkup() {
  if (ROUTE_COMPANION_SPRITE_URL && routeCompanionSpriteReady) {
    return `<span class="route-companion-figure route-companion-sprite route-motion-enabled" style="--route-companion-sprite: url('${ROUTE_COMPANION_SPRITE_URL}')" aria-hidden="true"></span>`;
  }
  if (ROUTE_COMPANION_SPRITE_URL) {
    // 图集还在加载：先渲染占位小人，探测成功后由 probe 回调原位替换
    return `<svg class="route-companion-figure route-companion-figure--pending" viewBox="0 0 36 48" aria-hidden="true" focusable="false">
    <ellipse cx="18" cy="45" rx="9" ry="2.6" fill="rgba(20,12,6,.35)"/>
    <rect x="11.5" y="20" width="13" height="17" rx="6.5" fill="#e8a923"/>
    <circle cx="18" cy="14" r="8" fill="#ffe9a8"/>
    <circle cx="15.2" cy="13.2" r="1.35" fill="#241b0d"/>
    <circle cx="20.8" cy="13.2" r="1.35" fill="#241b0d"/>
    <path d="M14.5 17.2 Q18 19.6 21.5 17.2" fill="none" stroke="#241b0d" stroke-width="1.15" stroke-linecap="round"/>
    </svg>`;
  }
  if (SERIES_ID === "minecraft") {
    return `<span class="route-companion-figure route-companion-avatar" aria-hidden="true"></span>`;
  }
  return `<svg class="route-companion-figure" viewBox="0 0 36 48" aria-hidden="true" focusable="false">
    <ellipse cx="18" cy="45" rx="9" ry="2.6" fill="rgba(20,12,6,.35)"/>
    <rect x="11.5" y="20" width="13" height="17" rx="6.5" fill="#e8a923"/>
    <circle cx="18" cy="14" r="8" fill="#ffe9a8"/>
    <circle cx="15.2" cy="13.2" r="1.35" fill="#241b0d"/>
    <circle cx="20.8" cy="13.2" r="1.35" fill="#241b0d"/>
    <path d="M14.5 17.2 Q18 19.6 21.5 17.2" fill="none" stroke="#241b0d" stroke-width="1.15" stroke-linecap="round"/>
  </svg>`;
}

function companionAnchor(route, node, point, w, h) {
  if (point && w && h) {
    return { x: (point.x / w) * 100, y: (point.y / h) * 100 };
  }
  const rr = route.getBoundingClientRect();
  const nr = node?.getBoundingClientRect();
  if (!nr || !rr.width || !rr.height) return null;
  return {
    x: ((nr.left + nr.width / 2 - rr.left) / rr.width) * 100,
    y: ((nr.top + nr.height / 2 - rr.top) / rr.height) * 100,
  };
}

/* 鼠标/键盘悬停只影响演出位置与朝向，不写入 progress/localStorage。
 * route._companionLayout 由 drawRoute 更新，因此横向滑动、字体换行或旋转屏幕后
 * 仍能把角色投影到最新的卡片和虚线坐标。 */
function setCompanionHoverTarget(route, index, force = false) {
  const layout = route?._companionLayout;
  const nodes = layout?.nodes || [];
  if (!nodes.length) {
    route._companionHoverIndex = Number(index);
    return false;
  }
  const i = Math.max(0, Math.min(nodes.length - 1, Number(index) || 0));
  if (!force && route.dataset.hovering === "true"
      && Number(route.dataset.hoverNodeIndex) === i) return true;
  route._companionHoverIndex = i;
  route.dataset.hovering = "true";
  route.setAttribute("data-hovering", "true");
  route.dataset.hoverNodeIndex = String(i);
  const mark = route.querySelector(".route-companion");
  const node = nodes[i];
  if (!mark || !node) return false;
  setCompanionAtlas(mark, node);
  const w = layout.w || route.clientWidth;
  const h = layout.h || route.clientHeight;
  const anchor = companionAnchor(route, node, layout.points?.[i] || null, w, h);
  if (!anchor || !w || !h) return false;
  const currentX = parseFloat(mark.style.left);
  const currentY = parseFloat(mark.style.top);
  const fallback = COMPANION_DIRECTIONS.has(mark.dataset.direction)
    ? mark.dataset.direction : "east";
  const baseDirection = COMPANION_DIRECTIONS.has(mark.dataset.baseDirection)
    ? mark.dataset.baseDirection : fallback;
  const direction = Number(mark.dataset.nodeIndex) === i
    ? baseDirection
    : hoverDirection(
      { x: Number.isFinite(currentX) ? currentX : anchor.x, y: Number.isFinite(currentY) ? currentY : anchor.y },
      anchor,
      fallback,
    );
  const target = companionPlacement(
    route,
    nodes,
    i,
    w,
    h,
    mark,
    direction,
    layout.points?.[i] || null,
  ) || { x: anchor.x, y: anchor.y, placement: "center" };
  mark.dataset.direction = direction;
  mark.setAttribute("data-direction", direction);
  mark.dataset.placement = target.placement;
  mark.setAttribute("data-placement", target.placement);
  mark.style.left = target.x.toFixed(2) + "%";
  mark.style.top = target.y.toFixed(2) + "%";
  return true;
}

function clearCompanionHover(route) {
  if (!route) return;
  route._companionHoverIndex = null;
  delete route.dataset.hovering;
  route.removeAttribute("data-hovering");
  delete route.dataset.hoverNodeIndex;
  const layout = route._companionLayout;
  if (layout?.nodes?.length) {
    placeCompanion(route, layout.nodes, layout.points, layout.w, layout.h);
  }
}

function bindCompanionHover(route) {
  /* 伙伴不再跟随鼠标/悬停：只由进度位置和点击行走来驱动。 */
  return;
  if (!route || route._companionHoverBound) return;
  route._companionHoverBound = true;
  route.querySelectorAll(".node").forEach((node, index) => {
    const enter = () => setCompanionHoverTarget(route, index);
    const leave = (event) => {
      const next = event?.relatedTarget?.closest?.(".node");
      if (next && route.contains(next)) return;
      if (route._companionHoverIndex === index) clearCompanionHover(route);
    };
    node.addEventListener("pointerenter", enter);
    node.addEventListener("pointerleave", leave);
    node.addEventListener("focusin", enter);
    node.addEventListener("focusout", leave);
  });
}

function placeCompanion(route, nodes, points, w, h) {
  if (!nodes.length) return;
  route._companionLayout = {
    nodes,
    points: Array.isArray(points) ? points : null,
    w: w || route.clientWidth,
    h: h || route.clientHeight,
  };
  const hasProgress = nodes.some((el) =>
    el.classList.contains("current") || el.classList.contains("done"));
  if (!hasProgress && route.dataset.unlocked !== "true") {
    route.querySelector(".route-companion")?.remove();
    return;
  }
  let mark = route.querySelector(".route-companion");
  if (!mark) {
    mark = document.createElement("div");
    mark.className = "route-companion";
    mark.classList.add("route-motion-enabled");
    mark.setAttribute("role", "img");
    mark.setAttribute("aria-label", "当前进度伙伴");
    mark.innerHTML = companionMarkup();
    route.appendChild(mark);
  }
  const i = Math.max(0, Math.min(nodes.length - 1, companionIndex(nodes)));
  mark.dataset.nodeIndex = String(i);
  setCompanionAtlas(mark, nodes[i]);
  let xPct;
  let yPct;
  if (points && points[i] && w && h) {
    xPct = (points[i].x / w) * 100;
    yPct = (points[i].y / h) * 100;
  } else {
    const rr = route.getBoundingClientRect();
    const nr = nodes[i].getBoundingClientRect();
    if (!rr.width || !rr.height) return;
    xPct = ((nr.left + nr.width / 2 - rr.left) / rr.width) * 100;
    yPct = ((nr.top + nr.height / 2 - rr.top) / rr.height) * 100;
  }
  const anchor = { x: xPct, y: yPct };
  const colId = (route.closest(".map-page") || {}).dataset.col || "";
  const prev = companionMemory.get(colId);
  const current = { x: anchor.x, y: anchor.y };
  let direction = COMPANION_DIRECTIONS.has(prev?.direction)
    ? prev.direction
    : (COMPANION_DIRECTIONS.has(mark.dataset.direction) ? mark.dataset.direction : "east");
  if (prev && (Math.abs(xPct - prev.x) + Math.abs(yPct - prev.y)) >= 0.05) {
    direction = companionDirection(prev, current, direction);
  } else if (!prev && points) {
    direction = companionPointDirection(points, i, direction);
  }
  mark.dataset.baseDirection = direction;
  mark.setAttribute("data-base-direction", direction);
  const forwardDirection = points
    ? companionForwardDirection(points, i, direction)
    : direction;
  const placement = companionPlacement(
    route,
    nodes,
    i,
    w || route.clientWidth,
    h || route.clientHeight,
    mark,
    forwardDirection,
    points?.[i] || null,
  );
  const target = placement || { x: xPct, y: yPct, placement: "center" };
  mark.dataset.direction = direction;
  mark.setAttribute("data-direction", direction);
  mark.dataset.placement = target.placement;
  mark.setAttribute("data-placement", target.placement);
  const apply = () => {
    mark.style.left = target.x.toFixed(2) + "%";
    mark.style.top = target.y.toFixed(2) + "%";
    companionMemory.set(colId, {
      x: anchor.x,
      y: anchor.y,
      displayX: target.x,
      displayY: target.y,
      direction,
    });
  };
  if (!prev) {
    mark.classList.add("no-motion");
    apply();
    if (Number.isInteger(route._companionHoverIndex)) {
      setCompanionHoverTarget(route, route._companionHoverIndex, true);
    }
    requestAnimationFrame(() => mark.classList.remove("no-motion"));
    return;
  }
  if (!mark.dataset.ready) {
    mark.classList.add("no-motion");
    const previousX = Number.isFinite(prev.displayX) ? prev.displayX : prev.x;
    const previousY = Number.isFinite(prev.displayY) ? prev.displayY : prev.y;
    mark.style.left = previousX.toFixed(2) + "%";
    mark.style.top = previousY.toFixed(2) + "%";
    mark.dataset.ready = "1";
    requestAnimationFrame(() => {
      mark.classList.remove("no-motion");
      apply();
      if (Number.isInteger(route._companionHoverIndex)) {
        setCompanionHoverTarget(route, route._companionHoverIndex, true);
      }
    });
    return;
  }
  apply();
  if (Number.isInteger(route._companionHoverIndex)) {
    setCompanionHoverTarget(route, route._companionHoverIndex, true);
  }
}

/* 点击节点：主角沿路线逐段走过去（按每段主方向选四向图集行），到达后跳转 */
function walkCompanionTo(route, targetIndex, done) {
  const layout = route?._companionLayout;
  const mark = route.querySelector(".route-companion");
  if (!layout || !layout.points || !mark) { done(); return; }
  const nodes = layout.nodes;
  const from = Math.max(0, Math.min(nodes.length - 1, Number(mark.dataset.nodeIndex) || 0));
  const to = Math.max(0, Math.min(nodes.length - 1, targetIndex));
  if (from === to) { done(); return; }
  const w = layout.w || route.clientWidth;
  const h = layout.h || route.clientHeight;
  const pts = layout.points;
  route._walking = true;
  mark.style.transition = "none";
  const stepMs = 430;
  let k = from;
  const step = () => {
    if (k === to) {
      route._walking = false;
      mark.style.transition = "";
      mark.dataset.nodeIndex = String(to);
      setCompanionHoverTarget(route, to, true);
      done();
      return;
    }
    const nextK = k < to ? k + 1 : k - 1;
    const a = pts[k] || pts[to];
    const b = pts[nextK] || pts[to];
    const dx = (b.x - a.x) * w;
    const dy = (b.y - a.y) * h;
    const direction = Math.abs(dx) >= Math.abs(dy)
      ? (dx >= 0 ? "east" : "west")
      : (dy >= 0 ? "south" : "north");
    mark.dataset.direction = direction;
    mark.setAttribute("data-direction", direction);
    mark.style.left = ((b.x / w) * 100).toFixed(2) + "%";
    mark.style.top = ((b.y / h) * 100).toFixed(2) + "%";
    k = nextK;
    setTimeout(step, stepMs);
  };
  step();
}

function bindCompanionNavigation(route) {
  if (!route || route._companionNavBound) return;
  route._companionNavBound = true;
  route.querySelectorAll(".node").forEach((node, index) => {
    const link = node.querySelector("a.node-main");
    if (!link) return;
    link.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (route._walking) return;
      const nodes = [...route.querySelectorAll(".node")]; // NodeList→数组：companionIndex 需要 findIndex
      const current = Math.max(0, Math.min(nodes.length - 1, companionIndex(nodes)));
      const n = Number(link.dataset.detail);
      const show = () => { if (n) openEpisodeDetail(n); };
      if (index === current || node.classList.contains("locked") || !n) {
        show();
        return;
      }
      walkCompanionTo(route, index, show);
    });
  });
}

function drawRoute(route) {
  const svg = route.querySelector(".route-line");
  if (!svg) return;
  bindCompanionHover(route);
  bindCompanionNavigation(route);
  const w = route.clientWidth;
  const h = route.clientHeight;
  if (!w || !h) return;

  const nodes = [...route.querySelectorAll(".node")];
  if (!nodes.length) return;

  /* 极短横屏改用四列蛇形网格；这是布局模式切换，不是缩小封面。 */
  if (h < 160 && matchMedia("(orientation: landscape)").matches) {
    route.classList.add("compact", "laid");
    route.style.removeProperty("--card");
    const compactColumns = 4;
    const compactMax = nodes.length > compactColumns * 3;
    route.style.setProperty("--compact-cols", compactColumns);
    route.classList.toggle("three-row", nodes.length > compactColumns * 2);
    route.classList.toggle("compact-max", compactMax);
    nodes.forEach((el, i) => {
      el.style.removeProperty("left");
      el.style.removeProperty("top");
      if (compactMax && el.classList.contains("drill")) {
        el.style.removeProperty("grid-row");
        el.style.removeProperty("grid-column");
        return;
      }
      const row = Math.floor(i / compactColumns);
      const offset = i % compactColumns;
      const column = row % 2 === 0 ? offset + 1 : compactColumns - offset;
      el.style.gridRow = String(row + 1);
      el.style.gridColumn = String(column);
    });
    svg.removeAttribute("viewBox");
    placeCompanion(route, nodes, null, w, h);
    return;
  }
  route.classList.remove("compact", "three-row", "compact-max");
  route.style.removeProperty("--compact-cols");
  nodes.forEach((el) => {
    el.style.removeProperty("grid-row");
    el.style.removeProperty("grid-column");
  });

  // 锚点模式：collections.json 的 route.anchors 给出每张背景图上
  // 手绘路线的落点，节点直接压在路线地标上，不再用之字排布。
  const anchors = (() => {
    const raw = route.dataset.anchors;
    if (!raw) return null;
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) && arr.length === nodes.length ? arr : null;
    } catch (_) { return null; }
  })();
  if (anchors) {
    const cardWidthA = fitCardWidth(route, w, h);
    route.style.setProperty("--card", cardWidthA + "px");
    const nodeH = nodes.reduce((max, el) => Math.max(max, el.offsetHeight), 0);
    const nodeW = nodes.reduce((max, el) => Math.max(max, el.offsetWidth), 0);
    const pts = anchors.map(([ax, ay]) => ({
      x: Math.min(w - nodeW / 2, Math.max(nodeW / 2, ax * w)),
      y: Math.min(h - nodeH / 2, Math.max(nodeH / 2, ay * h)),
    }));
    nodes.forEach((el, i) => {
      const pt = pts[i];
      el.style.left = ((pt.x / w) * 100).toFixed(2) + "%";
      el.style.top = ((pt.y / h) * 100).toFixed(2) + "%";
    });
    svg.setAttribute("width", w);
    svg.setAttribute("height", h);
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    const d = zigzagPath(pts);
    svg.querySelectorAll("path").forEach((p) => p.setAttribute("d", d));
    placeCompanion(route, nodes, pts, w, h);
    route.classList.add("laid", "anchored");
    return;
  }
  const cardWidth = fitCardWidth(route, w, h);
  route.style.setProperty("--card", cardWidth + "px");
  const nodeHeight = nodes.reduce((max, el) => Math.max(max, el.offsetHeight), 0);
  const nodeWidth = nodes.reduce((max, el) => Math.max(max, el.offsetWidth), 0);
  const points = zigzagPoints(w, h, nodes.length, {
    ...routeCfg(route),
    nodeHeight,
    nodeWidth,
    /* yOff 给折线一点手绘起伏，行间距要把这段起伏也算进去；否则
     * 相邻行的卡片边缘会在同一列附近擦碰。 */
    /* 伙伴需要在第一排封面下方有一整格落脚空间；略放大行距，
     * 让 72×96 的角色不会被下一排卡片的上沿挤回卡片正下方。 */
    rowGap: Math.max(34, Math.round(cardWidth * 0.20)),
  });
  nodes.forEach((el, i) => {
    const p = points[i] || points[0];
    if (!p) return;
    el.style.left = ((p.x / w) * 100).toFixed(2) + "%";
    el.style.top = ((p.y / h) * 100).toFixed(2) + "%";
  });

  svg.setAttribute("width", w);
  svg.setAttribute("height", h);
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  const d = zigzagPath(points);
  svg.querySelectorAll("path").forEach((p) => p.setAttribute("d", d));
  placeCompanion(route, nodes, points, w, h);
  route.classList.add("laid");
}

/* ---------------- 渲染 ---------------- */
/* 单集节点卡片：封面缩图 +「第 N 集 · 中文题名」+ 英文题名 + 独立朗读按钮 */
function epCard(n, state, worldNode) {
  const m = epMeta(n);
  const label = (worldNode && worldNode.label) || m.zh;
  const subtitle = (worldNode && worldNode.subtitle) || m.en;
  const icon = (worldNode && worldNode.icon) || m.cover;
  const worldId = (worldNode && worldNode.worldId) || collectionIdForEp(n);
  const img = icon
    ? `<img src="${icon}" alt="${label}封面" loading="lazy" onerror="this.parentNode.classList.add('no-cover')">`
    : "";
  const badge = OPEN_SELECT
    ? `<b class="node-sticker ${state === "done" ? "is-done" : "is-todo"}" aria-label="${state === "done" ? "已完成" : "未完成"}"><img src="/assets/game-stickers/${collectionIdForEp(n)}.png" alt=""></b>`
    : state === "done" ? `<b class="node-badge">✓</b>`
    : state === "locked" ? `<b class="node-badge lock">🔒</b>`
    : `<b class="node-tip">开始</b>`;
  const content = `
      <span class="node-cover">${img}${badge}</span>
      <span class="node-text">
        <b class="episode-title"><span class="episode-number">第${n}${SERIES.unit}</span><span class="episode-name">${label}</span></b>
        <span class="episode-en" lang="en">${subtitle}</span>
      </span>`;
  // 卡片面只留封面+标题；学习/磨耳朵/地图在集详情弹层三选一。
  // node-main 保留 href 作为无 JS 回退，点击被拦截开弹层。
  const nodeAttrs = `data-episode="${n}" data-node-world="${worldId}" data-node-id="${n}"`;
  return state === "locked"
    ? `<article class="node locked" data-lock="ep" ${nodeAttrs}>${content}</article>`
    : `<article class="node ${state}" ${nodeAttrs}><a class="node-main" data-detail="${n}" href="${SERIES.href(n)}" aria-label="查看${label}详情">${content}</a></article>`;
}

/* ---- 集详情弹层：大封面 + 标题 + 学习 / 磨耳朵 / 地图 ---- */
let detailEl = null;
function openEpisodeDetail(n) {
  const m = epMeta(n);
  const icon = m.cover || "";
  if (!detailEl) {
    detailEl = document.createElement("div");
    detailEl.id = "episode-detail";
    detailEl.className = "episode-detail";
    detailEl.hidden = true;
    document.body.appendChild(detailEl);
    detailEl.addEventListener("click", (ev) => {
      if (ev.target === detailEl) closeEpisodeDetail();
    });
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && !detailEl.hidden) closeEpisodeDetail();
    });
  }
  const done = epDone(n);
  const collection = cols.find((item) => Number(item.from) <= n && n <= Number(item.to));
  const prevCollection = collection
    ? cols.find((item) => Number(item.index) === Number(collection.index) - 1)
    : null;
  const drillReady = Boolean(
    SERIES.hasDrill && collection && collection.has_drill !== false && drillUnlocked(collection, prevCollection)
  );
  const drillCurrent = drillReady && colDone(collection) && !drillDone(collection);
  const drillLink = drillReady
    ? `<a class="episode-detail-option${drillCurrent ? " is-ready" : ""}" href="drill.html?c=${collection.id}" tabindex="0">★ 本辑巩固</a>`
    : "";
  // 2026-09-19 P1 双路径入口：同一个故事，听力/阅读两种入章方式（吸收初章书 Demo）。
  const progRec = readProg()[n] || {};
  const resumeLine = progRec.done
    ? "已完成 ✓，再看一遍也很棒"
    : Number(progRec.node) > 0
      ? `上次读到第 ${progRec.node}/${progRec.total || "?"} 句 · 打开接着播`
      : "15–20 分钟 · 每天一点点";
  const listenHref = `wala.html?ep=${n}&mode=listen&loops=2&visual=audio&subtitle=enzh`;
  const pathCards = SERIES.dualPath ? `
        <p class="episode-detail-ask">今天想怎么学？同一个好故事，两条路都通。</p>
        <div class="episode-detail-paths">
          <a class="path-card path-listen" href="${listenHref}" tabindex="0">
            <b>👂 听力入章</b>
            <span>先听见，一个新世界</span>
            <small>不暂停 · 不查词 · 抓住主线</small>
            <em>约 15 分钟</em>
          </a>
          <a class="path-card path-read" href="${SERIES.href(n)}" tabindex="0">
            <b>📖 阅读入章</b>
            <span>读进去，发现更多</span>
            <small>字幕跟读 · 意群阅读 · 找线索</small>
            <em>约 20 分钟</em>
          </a>
        </div>
        <p class="episode-detail-resume">${resumeLine}</p>` : "";
  const learnMode = SERIES.dualPath ? "" : `<a class="episode-detail-mode" href="${SERIES.href(n)}" tabindex="0">学习</a>`;
  const retellLink = SERIES.dualPath ? `<a class="episode-detail-option" href="retell.html?ep=${n}" tabindex="0">🎤 复述</a>` : "";
  detailEl.innerHTML = `
    <div class="episode-detail-card" role="dialog" aria-modal="true" aria-label="第${n}${SERIES.unit}详情">
      <button type="button" class="episode-detail-close" aria-label="关闭" tabindex="0">✕</button>
      <span class="episode-detail-cover"><img src="${icon}" alt="${m.zh}封面" onerror="this.parentNode.classList.add('no-cover')"></span>
      <b class="episode-detail-number">第${n}${SERIES.unit}${done ? " · 已完成 ✓" : ""}</b>
      <h2 class="episode-detail-title" lang="zh">${m.zh}</h2>
      <p class="episode-detail-en" lang="en">${m.en}</p>
      <div class="episode-detail-actions">
        ${pathCards}
        <div class="episode-detail-modes">
          ${learnMode}<a class="episode-detail-mode" href="game.html?ep=${n}" tabindex="0">地图</a>
        </div>
        <div class="episode-detail-options">
          <a class="episode-detail-option" href="dub.html?ep=${n}" tabindex="0">配音</a>
          ${retellLink}
          ${drillLink}
        </div>
      </div>
    </div>`;
  detailEl.hidden = false;
  const closeBtn = detailEl.querySelector(".episode-detail-close");
  if (closeBtn) closeBtn.addEventListener("click", closeEpisodeDetail);
}

function closeEpisodeDetail() {
  if (detailEl) detailEl.hidden = true;
}


/* 节点按 DOM 顺序摆到开放 S 形折线上，坐标由 drawRoute 写入 */
/* 章节节点：一书一图，节点是书内的章节。状态由进度里的最远页推导：
 * 章节 done = 已读到章节之后（或整本完成）；reachable = 最远页已到章节起点。 */
function chapterNodesHTML(c, isUnlocked) {
  const chapters = c.chapterList || [];
  if (!chapters.length) {
    return epNums(c).map((n) => epCard(n, isUnlocked ? (epDone(n) ? "done" : "current") : "locked")).join("");
  }
  const rec = readProg()[progId(c.chapterBook)] || {};
  const furthest = Number(rec.page) || (rec.done ? 999 : 0);
  const bookDone = Boolean(rec.done);
  return chapters.map((ch) => {
    const done = bookDone || furthest > ch.to;
    const reachable = ch.index === 1 || furthest >= ch.from - 1 || done;
    const state = done ? "done" : reachable ? "current" : "locked";
    const href = `storybook.html?series=minecraft&book=${c.chapterBook}&chapter=${ch.index}&ui=unified-v3`;
    const badge = done ? `<b class="node-badge">✓</b>`
      : reachable ? `<b class="node-tip">开始</b>`
      : `<b class="node-badge lock">🔒</b>`;
    const cover = ch.cover || c.chapterCover || "";
    const img = cover ? `<img src="/data/${cover}" alt="${ch.title_zh}封面" loading="lazy">` : "";
    return `<article class="node ${state}" data-chapter="${ch.index}">
      <a class="node-main" href="${href}">
        <span class="node-cover">${img}${badge}</span>
        <span class="node-text">
          <b class="episode-title"><span class="episode-number">第 ${ch.index} 章</span><span class="episode-name">${ch.title_zh}</span></b>
          <span class="episode-en" lang="en">${ch.title_en}</span>
        </span>
      </a>
    </article>`;
  }).join("");
}

function nodesHTML(c, isUnlocked) {
  let html = "";

  if (SERIES_ID === "minecraft" && c.chapters) {
    return chapterNodesHTML(c, isUnlocked);
  }

  const worldByEp = new Map((SERIES_ID === "jttw" ? collectionWorld(c).nodes : []).map((node) => [node.levelId, node]));
  epNums(c).forEach((n) => {
    let state;
    if (epCleared(n)) state = "done";
    else if (OPEN_SELECT || (isUnlocked && epUnlocked(n, c))) state = "current";
    else state = "locked";
    html += epCard(n, state, worldByEp.get(n));
  });

  if (SERIES.hasDrill && c.has_drill !== false) {
    const dInner = `<i>★</i><b>去巩固</b>`;
    if (drillDone(c)) {
      html += `<a class="node drill done" href="drill.html?c=${c.id}">${dInner}</a>`;
    } else if (isUnlocked && colDone(c)) {
      html += `<a class="node drill current" href="drill.html?c=${c.id}">${dInner}</a>`;
    } else {
      html += `<span class="node drill locked" data-lock="drill">${dInner}</span>`;
    }
  }
  return html;
}

function buildPages() {
  invalidateCache();
  track.innerHTML = "";
  pages = [];
  cols.forEach((c, i) => {
    const isUnlocked = OPEN_SELECT || colUnlocked(c, cols[i - 1] || null);
    const doneCount = epNums(c).filter(epCleared).length;
    const total = epNums(c).length;
    const route = c.route || {};
    const summaryZh = c.summary?.zh || "";
    const drillCount = SERIES.hasDrill && c.has_drill !== false ? 1 : 0;
    const anchors = route.anchors || (SERIES_ID === "jttw" ? worldNodeAnchors(c, total + drillCount) : null);
    const stageClass = SERIES_ID === "jttw" ? "route terminal-stage" : "route";
    const stageImg = SERIES_ID === "jttw" && c.background
      ? `<img class="route-stage-image" src="/data/${c.background}" alt="${c.title.zh}地图">`
      : "";

    const page = document.createElement("section");
    page.className = "map-page";
    page.dataset.col = c.id;
    page.dataset.world = c.id;
    page.style.setProperty("--bg", `url('/data/${c.background}')`);
    page.innerHTML = `
      <div class="page-veil"></div>
      <div class="${stageClass}" data-unlocked="${isUnlocked ? "true" : "false"}" data-inset-x="${route.insetX ?? ""}" data-top="${route.top ?? ""}" data-bottom="${route.bottom ?? ""}"${anchors ? ` data-anchors='${JSON.stringify(anchors)}'` : ""}>
        ${stageImg}
        <svg class="route-line" aria-hidden="true">
          <path class="rl-out" d=""></path>
          <path class="rl-in" d=""></path>
        </svg>
        ${nodesHTML(c, isUnlocked)}
      </div>
      <footer class="page-foot">
        <b class="page-foot-title">${c.title.zh}</b>
        <span class="page-foot-en" lang="en">${c.title.en}</span>
        <span class="page-foot-range">${collectionRangeLabel(c)}</span>
        <span class="page-foot-count">已学 ${doneCount}/${total}</span>
      </footer>`;
    track.appendChild(page);
    const routeEl = page.querySelector(".route");
    if (routeEl) bindCompanionHover(routeEl);
    pages.push({ col: c, el: page });
  });

  const drawAllRoutes = () => pages.forEach((p) => {
    const route = p.el.querySelector(".route");
    if (route) drawRoute(route);
  });
  requestAnimationFrame(drawAllRoutes);
  /* 开场遮罩 1.25s 后才让出页面，期间 route 尺寸为 0，首绘会空过；
   * 遮罩清除后尺寸不再变化、ResizeObserver 不会再触发，这里补两次重排。 */
  setTimeout(drawAllRoutes, 600);
  setTimeout(drawAllRoutes, 1600);

  /* 逐个 route 观察，不能只观察 track：页头在字体/徽章换行后还会变高，
   * 那时 track 尺寸没变但 route 缩了，用旧高度算出来的卡片会顶出边界。 */
  if (!buildPages._ro && "ResizeObserver" in window) {
    buildPages._ro = new ResizeObserver((entries) => entries.forEach((e) => drawRoute(e.target)));
  }
  if (buildPages._ro) {
    buildPages._ro.disconnect();
    pages.forEach((p) => {
      const route = p.el.querySelector(".route");
      if (route) buildPages._ro.observe(route);
    });
  }

  buildWorldStrip();
  updateChrome();
  requestAnimationFrame(() => scrollToIndex(initialIndex()));
}

/* ---------------- 横向滑动 / 导航 ---------------- */
function currentIndex() {
  const w = track.clientWidth || 1;
  return Math.max(0, Math.min(pages.length - 1, Math.round(track.scrollLeft / w)));
}

function scrollToIndex(i) {
  const page = pages[i] && pages[i].el;
  if (page) track.scrollTo({ left: page.offsetLeft, behavior: "smooth" });
}

function updateChrome() {
  const i = currentIndex();
  if ($("col-name")) $("col-name").textContent = pages[i] ? pages[i].col.title.zh : "";
  $("nav-prev").disabled = i <= 0;
  $("nav-next").disabled = i >= pages.length - 1;
  document.querySelectorAll(".map-world-button").forEach((btn) => {
    const on = Number(btn.dataset.worldIndex) === i;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });
  if (i !== visibleCollectionIndex) {
    visibleCollectionIndex = i;
    if (narrationReady) scheduleCollectionNarration(i);
    const activeWorld = document.querySelector(`.map-world-button[data-world-index="${i}"]`);
    if (activeWorld && typeof activeWorld.scrollIntoView === "function") {
      activeWorld.scrollIntoView({ inline: "center", block: "nearest" });
    }
  }
}

function initialIndex() {
  // 打开时停在当前可玩辑，但后面的合辑地图仍可滑过去看（节点保持锁定）
  const firstLocked = cols.findIndex((c, i) => !colUnlocked(c, cols[i - 1] || null));
  const cap = firstLocked === -1 ? cols.length - 1 : firstLocked;
  for (let i = 0; i <= cap; i++) {
    const c = cols[i];
    if (!colUnlocked(c, cols[i - 1] || null)) continue;
    if (!colDone(c)) return i;
    if (SERIES.hasDrill && c.has_drill !== false && !drillDone(c)) return i;
  }
  return cap;
}

track.addEventListener("scroll", updateChrome, { passive: true });
$("nav-prev").addEventListener("click", () => scrollToIndex(currentIndex() - 1));
$("nav-next").addEventListener("click", () => scrollToIndex(currentIndex() + 1));

/* 标题朗读；点锁定节点时抖动 320ms + toast */
track.addEventListener("click", (e) => {
  const epSpeaker = e.target.closest(".node-speak");
  if (epSpeaker) {
    e.preventDefault();
    e.stopPropagation();
    const n = Number(epSpeaker.dataset.ep);
    const m = epMeta(n);
    const audio = mapAudio.episodes?.[String(n)] || {};
    playGeneratedAudio([audio.zh, audio.en], `第${n}${SERIES.unit}，${m.zh}`, "zh-CN", epSpeaker);
    return;
  }
  const detailLink = e.target.closest(".node-main[data-detail]");
  if (detailLink) {
    e.preventDefault();
    openEpisodeDetail(Number(detailLink.dataset.detail));
    return;
  }
  const pageSpeaker = e.target.closest(".page-speak");
  if (pageSpeaker) {
    e.preventDefault();
    speakCollection(Number(pageSpeaker.dataset.col), pageSpeaker);
    return;
  }
  const node = e.target.closest(".node.locked");
  if (!node) return;
  e.preventDefault();
  node.classList.remove("shake");
  void node.offsetWidth;  // 重启动画
  node.classList.add("shake");
  setTimeout(() => node.classList.remove("shake"), 340);
  const unitLabel = SERIES.unit === "本" ? "本" : "集"; // SERIES.unit：锁定提示为“先学完上一本/上一集”
  const lockHint = node.dataset.lock === "drill"
    ? (SERIES_ID === "jttw" ? "先学完本辑所有集" : `先学完本辑所有${unitLabel}`)
    : `先学完上一${unitLabel}`;
  toast(lockHint);
});

/* ---------------- 进场闪屏 ----------------
 * 显示「当前辑」的背景图和辑名，1.25s 后淡出。点一下立刻跳过。
 * CSS 里有 3.4s 纯动画兜底，所以这里出任何异常都不会卡住用户。 */
function splash() {
  const el = $("map-splash");
  if (!el) return;
  el.style.setProperty("--splash-bg", `url('${SERIES.splashCover}')`);
  const c = cols[initialIndex()] || cols[0];
  if (c) {
    $("splash-title").textContent = c.title.zh;
    $("splash-sub").textContent = c.title.en;
  }
  el.classList.add("ready");
  const skip = () => el.classList.add("gone");
  el.addEventListener("click", skip, { once: true });
  setTimeout(skip, 1250);
}

/* ---------------- 启动 ---------------- */
async function init() {
  const [colResp, catResp, audioResp, achievementResp, companionResp] = await Promise.all([
    fetch(COLLECTIONS_URL, { cache: "no-store" }).then((r) => r.json()),
    fetch(CATALOG_URL, { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => ({ episodes: [] })),
    MAP_AUDIO_URL
      ? fetch(MAP_AUDIO_URL, { cache: "no-store" }).then((r) => r.json()).catch(() => mapAudio)
      : Promise.resolve(mapAudio),
    SERIES_ID === "jttw" || SERIES_ID === "minecraft"
      ? fetch(ACHIEVEMENTS_URL, { cache: "no-store" }).then((r) => r.json()).catch(() => achievementCatalog)
      : Promise.resolve(achievementCatalog),
    SERIES_ID === "jttw" || SERIES_ID === "minecraft"
      ? fetch(COMPANION_URL, { cache: "no-store" }).then((r) => r.json()).catch(() => companionCatalog)
      : Promise.resolve(companionCatalog),
  ]);
  cols = colResp.collections || [];
  // 章节地图：marks chapters:true 的合辑按“一书一图”，节点是书的章节
  if (SERIES_ID === "minecraft") {
    await Promise.all(cols.filter((c) => c.chapters).map(async (c) => {
      const bookNo = (epNums(c)[0] || 0);
      if (!bookNo) return;
      c.chapterList = await fetch(`/data/storybooks-minecraft/book${bookNo}.json`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => d.chapters || [])
        .catch(() => []);
      c.chapterBook = bookNo;
      const meta = catalogMap.get(bookNo);
      if (meta && meta.cover) c.chapterCover = meta.cover;
    }));
  }
  mapAudio = audioResp || mapAudio;
  achievementCatalog = achievementResp || achievementCatalog;
  companionCatalog = companionResp || companionCatalog;
  for (const ep of (catResp.episodes || [])) catalogMap.set(ep.book || ep.episode, ep);
  document.title = SERIES.pageTitle;
  if ($("btn-list")) $("btn-list").href = SERIES.listUrl; // 顶栏已移除时跳过
  if (cols.length < 2) {
    $("map-hint").classList.add("hidden");
    $("nav-prev").classList.add("hidden");
    $("nav-next").classList.add("hidden");
  }
  grandfatherDrills();   // A1 豁免迁移：cols 就绪后、buildPages() 前，跑一次
  renderSP();
  buildPages();
  renderCompanionSummary();
  splash();
  narrationReady = true;
  scheduleCollectionNarration(initialIndex());
}

/* 从 wala/drill 用返回键回来时，页面可能是 bfcache 取出的，进度会是旧的 */
window.addEventListener("pageshow", (e) => {
  if (e.persisted && cols.length) { renderSP(); buildPages(); renderCompanionSummary(); }
});

init().catch((err) => toast("地图数据加载失败: " + err.message));

/* P4 学习教练浮标：「下一步练什么」。数据全在本机，渲染失败静默不挡地图。 */
(function coachFloat() {
  try {
    const log = window.BookPlayStepLog ? window.BookPlayStepLog.read() : [];
    const summary = window.BookPlayStepLogCore ? window.BookPlayStepLogCore.summarize(log, { days: 7 }) : { rows: [] };
    const v = window.BookPlayCoach.verdict({
      summary,
      log,
      vstat: JSON.parse(localStorage.getItem("bookplay_adv_vocab_stat") || "{}"),
      progress: JSON.parse(localStorage.getItem("bookplay_adv_progress") || "{}"),
    });
    const pill = document.getElementById("map-coach-float");
    const text = document.getElementById("map-coach-text");
    if (!pill || !text || !v.nextAction) return;
    pill.href = v.nextAction.href;
    text.textContent = v.nextAction.label;
    pill.title = v.headline;
    pill.classList.remove("hidden");
  } catch (_) { /* 教练缺席不挡地图 */ }
})();
