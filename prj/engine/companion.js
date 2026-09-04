"use strict";

const SERIES_ID = new URLSearchParams(window.location.search).get("series") === "minecraft" ? "minecraft" : "jttw";
const IS_MINECRAFT = SERIES_ID === "minecraft";
const ACHIEVEMENT_KEY = "bookplay_achievements_v1";
const ACHIEVEMENT_STORAGE_KEY = IS_MINECRAFT ? ACHIEVEMENT_KEY + ":minecraft" : ACHIEVEMENT_KEY;
const COMPANION_KEY = IS_MINECRAFT ? "bookplay_minecraft_companion_v1" : "bookplay_jttw_companion_v1";
const REWARD_KEY = IS_MINECRAFT ? "bookplay_storybook_rewards_v1" : "bookplay_jttw_episode_rewards_v1";
const PROGRESS_KEY = "bookplay_adv_progress";
const DRILL_KEY = "bookplay_drill";
const ROOM_ID = IS_MINECRAFT ? "room.minecraft" : "room.huaguo";
const IS_MEDALS_PAGE = document.body?.classList.contains("medals-page");
const IS_STICKERS_PAGE = document.body?.classList.contains("stickers-page");
const MINECRAFT_MEDAL_TOTAL = 3;
// Minecraft medal page has 3 枚勋章，孩子直接看三张卡就够了。
// Keep the authored Minecraft scene-image family explicit so the UI contract
// remains discoverable even when exact paths come from reward JSON.
const MINECRAFT_SCENE_ASSET_PREFIX = "assets/generated/storybooks/minecraft-story-scenes-v1/";
const rewardCore = window.BookPlayEpisodeReward;
const $ = (id) => document.getElementById(id);

let achievementCatalog = { achievements: [] };
let companionCatalog = { stages: [], care_actions: [], cosmetics: [] };
let collections = [];
let progress = {};
let drills = {};
let achievementResult = { earned: [], newlyUnlocked: [], nextTargets: [], receipts: {} };
let companionState = {};
let rewardCatalog = {};
let rewardState = {};
let storyCatalog = { episodes: [] };
let medalFilter = "all";
let stageArtRequest = 0;
let eventsBound = false;

function setLoading(loading) {
  const app = $("companion-app");
  if (app) app.setAttribute("aria-busy", String(Boolean(loading)));
  const retry = $("companion-retry");
  if (retry) retry.disabled = Boolean(loading);
  document.querySelectorAll("#care-actions button, #medal-wall button, #medal-filters button, #next-target-card button, #recent-strip button, #sticker-book-filter button").forEach((button) => {
    button.disabled = Boolean(loading);
  });
}

function setControlsEnabled(enabled) {
  document.querySelectorAll("#care-actions button, #medal-wall button, #medal-filters button, #next-target-card button, #recent-strip button, #sticker-book-filter button").forEach((button) => {
    button.disabled = !enabled;
  });
}

function clearLoadError() {
  const panel = $("companion-error");
  if (panel) panel.hidden = true;
}

function showLoadError(error) {
  setLoading(false);
  setControlsEnabled(false);
  const panel = $("companion-error");
  const message = $("companion-error-message");
  if (message) message.textContent = `数据加载失败：${error?.message || "未知错误"}`;
  if (panel) panel.hidden = false;
  const response = $("care-response");
  if (response) response.textContent = "驿站还在整理行囊，点击“重新加载”再试一次。";
}

const CHAPTER_VISUALS = [
  { shape: "seal", pattern: "clouds", tone: "stone" },
  { shape: "cloud", pattern: "waves", tone: "jade" },
  { shape: "diamond", pattern: "stars", tone: "sky" },
  { shape: "shield", pattern: "wind", tone: "indigo" },
  { shape: "lotus", pattern: "lotus", tone: "rose" },
  { shape: "gourd", pattern: "dots", tone: "amber" },
  { shape: "flame", pattern: "flame", tone: "coral" },
  { shape: "ribbon", pattern: "constellation", tone: "violet" },
  { shape: "scroll", pattern: "waves", tone: "sand" },
  { shape: "star", pattern: "stars", tone: "gold" },
  { shape: "sun", pattern: "sun", tone: "orange" },
  { shape: "knot", pattern: "clouds", tone: "jade" },
  { shape: "crown", pattern: "constellation", tone: "gold" },
];

const JOURNEY_VISUALS = {
  "jttw.first-step": { shape: "seal", pattern: "dots", tone: "jade" },
  "jttw.ten-episodes": { shape: "diamond", pattern: "stars", tone: "sky" },
  "jttw.halfway": { shape: "shield", pattern: "waves", tone: "violet" },
  "jttw.seventy-two": { shape: "star", pattern: "constellation", tone: "gold" },
  "jttw.hundred": { shape: "ribbon", pattern: "flame", tone: "orange" },
  "jttw.complete": { shape: "crown", pattern: "sun", tone: "gold" },
};

function readObject(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch (_) { return {}; }
}

function seriesProgressView(value) {
  if (!IS_MINECRAFT) return value;
  const result = {};
  Object.entries(value || {}).forEach(([key, record]) => {
    if (key.startsWith("minecraft:")) result[key.slice("minecraft:".length)] = record;
  });
  return result;
}

function rewardStateFromStorage() {
  if (!rewardCore) return {};
  const raw = readObject(REWARD_KEY);
  if (!IS_MINECRAFT) return rewardCore.normalizeState(raw);
  const scoped = raw.minecraft && typeof raw.minecraft === "object" ? raw.minecraft : {};
  return rewardCore.normalizeState(scoped);
}

function saveRewardStateToStorage() {
  if (!IS_MINECRAFT) {
    localStorage.setItem(REWARD_KEY, JSON.stringify(rewardState));
    return;
  }
  const all = readObject(REWARD_KEY);
  all.minecraft = rewardState;
  localStorage.setItem(REWARD_KEY, JSON.stringify(all));
}

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
}

function localDay(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function applySeriesChrome() {
  if (!IS_MINECRAFT) return;
  document.body.classList.add("minecraft-page");
  document.title = "我的世界故事驿站 · 豆豆龙英语";
  document.querySelectorAll(".back-link").forEach((link) => {
    link.href = "map.html?series=minecraft";
    link.textContent = "← 返回我的世界地图";
  });
  const topLabel = document.querySelector(".inn-topbar p");
  if (topLabel) topLabel.textContent = "MINECRAFT COMPANION";
  const topTitle = document.querySelector(".inn-topbar h1");
  if (topTitle) topTitle.textContent = "Byte 方块驿站";
  const careActions = $("care-actions");
  if (careActions) {
    careActions.setAttribute("aria-label", "和 Byte 一起玩耍");
    const labels = ["喂苹果", "擦掉方块灰", "玩接物", "一起休息"];
    careActions.querySelectorAll("button").forEach((button, index) => {
      const label = labels[index];
      if (label) {
        const text = button.lastChild;
        if (text && text.nodeType === Node.TEXT_NODE) text.nodeValue = label;
        button.setAttribute("aria-label", label);
      }
    });
  }
  const careResponse = $("care-response");
  if (careResponse) careResponse.textContent = "今天完成一点学习，再来和 Byte 互动，就能盖一枚探险印。";
  const journalTitle = $("journal-title");
  if (journalTitle) journalTitle.textContent = "探险日记";
  const travelUnit = document.querySelector("#travel-days + span");
  if (travelUnit) travelUnit.textContent = " 个探险日";
  const journalNote = document.querySelector("#travel-journal > small");
  if (journalNote) journalNote.textContent = "漏一天不会清零，Byte 也不会生病或伤心。";
  const roomEmpty = $("room-empty");
  if (roomEmpty) roomEmpty.textContent = "完成本书巩固后，从故事纪念品里选一件放进来。轻互动都可以跳过。";
  document.querySelectorAll(".toy-rack").forEach((rack) => {
    rack.setAttribute("aria-label", "方块玩具架");
    rack.querySelector(".toy-rack-header strong")?.replaceChildren(document.createTextNode("方块玩具架"));
    rack.querySelector(".toy-rack-header small")?.replaceChildren(document.createTextNode("小玩具会在这里等你"));
  });
  document.querySelectorAll(".medal-shortcut").forEach((link) => {
    link.href = "stickers.html?series=minecraft";
    link.setAttribute("aria-label", "打开我的世界故事贴纸册");
  });
  const title = $("medal-title");
  if (title) title.textContent = "我的世界勋章墙";
  const recentEmpty = $("recent-empty");
  if (recentEmpty) recentEmpty.textContent = "还没有获得勋章，先去方块探险吧！";
  const medalFilters = $("medal-filters");
  if (medalFilters) {
    medalFilters.setAttribute("aria-label", "筛选方块勋章");
    medalFilters.querySelector('[data-medal-filter="chapter"]')?.setAttribute("hidden", "");
  }
  const stickerTitle = $("sticker-book-title");
  if (stickerTitle) stickerTitle.textContent = "我的世界故事贴纸册";
  const stickerIntro = $("sticker-book-intro");
  if (stickerIntro && !new URLSearchParams(window.location.search).get("chapter")) stickerIntro.textContent = "选一本，打开你的方块故事。";
  const stickerMap = $("sticker-chapter-map");
  if (stickerMap) stickerMap.setAttribute("aria-label", STICKER_MAP_LABEL);
  const mapBack = $("chapter-map-back");
  if (mapBack) { mapBack.href = "stickers.html?series=minecraft"; mapBack.textContent = "← 两本绘本地图"; }
  const roomTitle = $("room-title");
  if (roomTitle) roomTitle.textContent = "方块探险小屋";
  const roomScene = $("room-scene");
  if (roomScene) roomScene.setAttribute("aria-label", "方块探险小屋和已摆放的故事纪念品");
  const companionLink = $("companion-medal-link");
  if (companionLink) {
    companionLink.href = "stickers.html?series=minecraft";
    companionLink.innerHTML = "📚 查看我的世界故事贴纸册 · <span id=\"companion-medal-count\">0 / 2</span>";
  }
  const navMedal = document.querySelector(".inn-nav-card-medals");
  if (navMedal) {
    navMedal.href = "medals.html?series=minecraft";
    navMedal.querySelector(".inn-nav-art-main")?.setAttribute("src", "/data/assets/generated/storybooks/minecraft/rewards/badges/first-block.png");
    navMedal.querySelector(".inn-nav-art-accent")?.setAttribute("src", "/data/assets/generated/storybooks/minecraft/rewards/badges/block-expedition-complete.png");
    navMedal.querySelector(".inn-nav-copy strong")?.replaceChildren(document.createTextNode("我的世界勋章墙"));
    navMedal.querySelector(".inn-nav-copy small")?.replaceChildren(document.createTextNode(`${MINECRAFT_MEDAL_TOTAL} 枚勋章 · 记录方块探险`));
    navMedal.querySelector(".inn-nav-art-badge")?.replaceChildren(document.createTextNode(`${MINECRAFT_MEDAL_TOTAL} 枚勋章`));
  }
  const navSticker = document.querySelector(".inn-nav-card-stickers");
  if (navSticker) {
    navSticker.href = "stickers.html?series=minecraft";
    navSticker.querySelector(".inn-nav-art-main")?.setAttribute("src", "/data/assets/generated/storybooks/minecraft/rewards/stickers/golden-helmet.png");
    navSticker.querySelector(".inn-nav-art-accent")?.setAttribute("src", "/data/assets/generated/storybooks/minecraft/rewards/stickers/nether-portal-shard.png");
    navSticker.querySelector(".inn-nav-copy strong")?.replaceChildren(document.createTextNode("我的世界故事贴纸册"));
    navSticker.querySelector(".inn-nav-copy small")?.replaceChildren(document.createTextNode("2 张 · 每本带走一张"));
    navSticker.querySelector(".inn-nav-art-badge")?.replaceChildren(document.createTextNode("故事礼物"));
  }
  const navRoom = document.querySelector(".inn-nav-card-room");
  if (navRoom) {
    navRoom.href = "room.html?series=minecraft";
    navRoom.querySelector(".inn-nav-room-image")?.setAttribute("src", "/data/assets/collections/mc01.jpg");
    navRoom.querySelector(".inn-nav-copy strong")?.replaceChildren(document.createTextNode("方块探险小屋"));
    navRoom.querySelector(".inn-nav-copy small")?.replaceChildren(document.createTextNode("摆放 Byte 的故事纪念品"));
  }
  const medalDialogLink = document.querySelector("#medal-dialog a");
  if (medalDialogLink) {
    medalDialogLink.href = "companion.html?series=minecraft";
    medalDialogLink.textContent = "回到 Byte 方块驿站";
  }
}

function saveAchievementReceipts() {
  localStorage.setItem(ACHIEVEMENT_STORAGE_KEY, JSON.stringify({
    schema_version: 1,
    catalog_version: achievementCatalog.catalog_version || 1,
    unlocked: achievementResult.receipts,
    migration_version: 1,
  }));
}

function saveCompanionState() {
  localStorage.setItem(COMPANION_KEY, JSON.stringify(companionState));
}

function inferTodayLearning() {
  const today = localDay();
  const episodeActivity = Object.values(progress).some((item) => item?.day === today);
  const drillActivity = Object.values(drills).some((item) => item?.day === today);
  if (episodeActivity || drillActivity) {
    companionState = BookPlayCompanion.markLearningDay(companionState, today);
  }
}

function stageGlyph(stage) {
  if (stage?.form === "egg") return "🥚";
  if (stage?.form === "wolf") return "🐺";
  if (stage?.form === "buddy") return "🐺✨";
  if (stage?.form === "horse") return "🐎";
  if (stage?.form === "celestial-dragon") return "🐲";
  return "🐉";
}

function stageArtCandidates(stage) {
  if (!stage?.art) return [];
  const candidates = [stage.art];
  if (/\.png$/i.test(stage.art)) candidates.push(stage.art.replace(/\.png$/i, ".svg"));
  return candidates;
}

function renderStageArt(stage) {
  const avatar = $("companion-avatar");
  const glyph = $("companion-glyph");
  // The first Minecraft stage is intentionally an egg; do not show the
  // later wolf artwork before the child has completed book 1.
  const candidates = stage?.form === "egg" ? [] : stageArtCandidates(stage);
  const request = ++stageArtRequest;
  avatar.style.backgroundImage = "";
  glyph.textContent = stageGlyph(stage);
  if (!candidates.length) return;

  const probe = new Image();
  let index = 0;
  const tryNext = () => {
    if (request !== stageArtRequest) return;
    if (index >= candidates.length) return;
    probe.src = `/data/${candidates[index]}`;
  };
  probe.onload = () => {
    if (request !== stageArtRequest) return;
    avatar.style.backgroundImage = `url('/data/${candidates[index]}')`;
    glyph.textContent = "";
  };
  probe.onerror = () => {
    index += 1;
    tryNext();
  };
  tryNext();
}

function renderStage() {
  const stageRoot = $("companion-stage");
  const avatar = $("companion-avatar");
  if (!stageRoot || !avatar) return;
  const stage = BookPlayCompanion.deriveCompanionStage({
    catalog: companionCatalog,
    collections,
    progress,
    drills,
  });
  const index = Math.max(0, companionCatalog.stages.findIndex((item) => item.id === stage?.id));
  stageRoot.dataset.form = stage?.form || "egg";
  avatar.setAttribute("aria-label", stage?.name || "神秘龙蛋");
  renderStageArt(stage);
  $("stage-number").textContent = (IS_MINECRAFT ? "伙伴阶段" : "成长阶段") + " " + (index + 1) + " / " + companionCatalog.stages.length;
  $("companion-heading").textContent = stage?.name || (IS_MINECRAFT ? "神秘方块蛋" : "神秘龙蛋");
  $("stage-hint").textContent = stage?.hint || (IS_MINECRAFT ? "一起读故事，Byte 会在方块世界陪你长大。" : "一起读故事，小白龙会慢慢长大。");
  $("canon-note").textContent = companionCatalog.note || "";
}

function medalState(item, nextId) {
  if (achievementResult.receipts[item.id]) return "earned";
  if (item.id === nextId) return "next";
  return "future";
}

function medalVisual(item) {
  if (item?.kind === "chapter") {
    const chapterNumber = Number(String(item.condition?.collection_id || "").replace(/^c/, ""));
    return CHAPTER_VISUALS[chapterNumber - 1] || CHAPTER_VISUALS[0];
  }
  return JOURNEY_VISUALS[item?.id] || { shape: "seal", pattern: "dots", tone: "stone" };
}

function medalArtMarkup(item) {
  const visual = medalVisual(item);
  const asset = item?.asset ? `/data/${escapeHtml(item.asset)}` : "";
  const glyph = escapeHtml(item?.glyph || "🏅");
  const artClass = "";
  const image = asset
    ? `<img class="medal-art-image" src="${asset}" alt="" loading="lazy" onload="this.nextElementSibling.hidden=true;this.parentElement.classList.add('has-art')" onerror="this.hidden=true;this.nextElementSibling.hidden=false;this.parentElement.classList.remove('has-art')"><span class="medal-art-glyph-fallback" aria-hidden="true" hidden>${glyph}</span>`
    : `<span class="medal-art-glyph-fallback" aria-hidden="true">${glyph}</span>`;
  return `<span class="medal-art shape-${visual.shape} pattern-${visual.pattern} tone-${visual.tone}${artClass}" aria-hidden="true">${image}</span>`;
}

function medalMarkup(item, state) {
  const target = achievementResult.nextTargets.find((entry) => entry.id === item.id);
  const receipt = achievementResult.receipts[item.id];
  const progressText = target ? `${target.progress.current}/${target.progress.target}` : "已获得";
  const newFlag = receipt && receipt.seen === false ? '<span class="new-flag">NEW</span>' : "";
  const statusLabel = state === "earned" ? "已获得" : state === "next" ? "下一目标" : "未获得";
  return `<button class="medal-card ${state}" type="button" data-medal="${item.id}" data-kind="${item.kind}" aria-haspopup="dialog" aria-label="${item.name}，${statusLabel}，${state === "earned" ? "已收入勋章墙" : progressText}">
    ${newFlag}
    ${medalArtMarkup(item)}
    ${state === "earned" ? "" : '<span class="medal-lock" aria-label="未解锁">🔒</span>'}
    <span class="medal-name">${item.name}</span>
    <small>${state === "earned" ? "已收入勋章墙" : progressText}</small>
    <span class="medal-card-hint">点击查看大图与动态</span>
  </button>`;
}

const FILTER_LABELS = { all: "全部", earned: "已获得", chapter: "篇章勋章", journey: "旅程勋章" };

function medalMatchesFilter(item) {
  if (medalFilter === "earned") return Boolean(achievementResult.receipts[item.id]);
  if (medalFilter === "chapter") return item.kind === "chapter";
  if (medalFilter === "journey") return item.kind === "journey";
  return true;
}

function recentMedals() {
  return achievementResult.earned
    .slice()
    .sort((a, b) => (b.receipt?.at || 0) - (a.receipt?.at || 0))
    .slice(0, 3);
}

function renderNextTarget() {
  const card = $("next-target-card");
  // Minecraft's three cards already show their own progress and lock state;
  // repeating the same next target above the wall costs the child the first
  // screen. Keep the target model for dialogs, but omit the duplicate block.
  if (IS_MINECRAFT && IS_MEDALS_PAGE) {
    if (card) {
      card.hidden = true;
      card.innerHTML = "";
    }
    const targetCopy = $("next-target");
    if (targetCopy) targetCopy.textContent = "点一枚勋章，看大图和小动画。";
    return;
  }
  const next = achievementResult.nextTargets[0] || null;
  const targetCopy = $("next-target");
  if (targetCopy) targetCopy.textContent = next
    ? `下一目标：${next.name} · ${next.condition_text}`
    : (IS_MINECRAFT ? "三枚方块勋章全部点亮，探险完成！" : "十九枚勋章全部点亮，取经圆满！");
  if (!card) return;
  card.hidden = false;
  if (!next) {
    card.innerHTML = `<div class="next-target-done" role="status">🏆 ${IS_MINECRAFT ? "方块远征完成！" : "十九枚勋章全部点亮，取经圆满！"}</div>`;
    return;
  }
  card.innerHTML = `<button class="next-target-btn" type="button" data-medal="${next.id}" aria-haspopup="dialog" aria-label="下一目标：${next.name}，进度 ${next.progress.current}/${next.progress.target}">
    <span class="next-target-label">下一目标</span>
    ${medalArtMarkup(next)}
    <span class="next-target-copy">
      <span class="medal-name">${next.name}</span>
      <small>${next.condition_text}</small>
      <b>${next.progress.current}/${next.progress.target}</b>
    </span>
  </button>`;
}

function renderRecentMedals() {
  const recent = recentMedals();
  const section = $("recent-medals");
  if (IS_MINECRAFT && IS_MEDALS_PAGE) {
    if (section) {
      section.hidden = true;
      section.setAttribute("aria-hidden", "true");
    }
    return;
  }
  if (section) {
    section.hidden = false;
    section.removeAttribute("aria-hidden");
  }
  const empty = $("recent-empty");
  if (empty) empty.hidden = recent.length > 0;
  const strip = $("recent-strip");
  if (strip) strip.innerHTML = recent.map((item) => medalMarkup(item, "earned")).join("");
}

function renderMedalWall() {
  const wall = $("medal-wall");
  if (!wall) return;
  const next = achievementResult.nextTargets[0] || null;
  const visible = achievementCatalog.achievements.filter(medalMatchesFilter);
  wall.innerHTML = visible.length
    ? visible.map((item) => medalMarkup(item, medalState(item, next?.id))).join("")
    : '<p class="medal-wall-empty" role="status">这个筛选下还没有勋章。</p>';
  const count = $("medal-filter-count");
  if (count) count.textContent = `${FILTER_LABELS[medalFilter] || "全部"} · ${visible.length} 枚`;
  document.querySelectorAll("#medal-filters [data-medal-filter]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.medalFilter === medalFilter));
  });
}

function renderMedals() {
  if ($("medal-wall") || $("next-target-card") || $("recent-strip")) {
    renderNextTarget();
    renderRecentMedals();
    renderMedalWall();
  }
  const countText = `${achievementResult.earned.length} / ${achievementCatalog.achievements.length}`;
  const storyItems = IS_MINECRAFT && rewardCore
    ? rewardCore.stickerItems(rewardState, rewardCatalog || {})
    : [];
  const storyEarnedText = IS_MINECRAFT
    ? `${storyItems.filter((item) => item.owned).length} / ${storyItems.length || 2}`
    : "";
  const topCount = $("top-medal-count");
  if (topCount) {
    topCount.textContent = IS_MINECRAFT && !IS_MEDALS_PAGE
      ? `📚 故事礼物 · ${storyEarnedText}`
      : `🏅 勋章墙 · ${IS_MINECRAFT ? `${achievementResult.earned.length} / ${achievementCatalog.achievements.length}` : countText}`;
  }
  const companionCount = $("companion-medal-count");
  if (companionCount) companionCount.textContent = IS_MINECRAFT ? storyEarnedText : countText;
  const medalPageCount = $("medal-page-count");
  if (medalPageCount) medalPageCount.textContent = countText;
  const stickerPageCount = $("sticker-page-count");
  if (stickerPageCount && IS_MINECRAFT) stickerPageCount.textContent = storyEarnedText;
}

function renderJournal() {
  const daysEl = $("travel-days");
  if (!daysEl) return;
  const days = companionState.care?.days || [];
  const today = localDay();
  const stamped = days.includes(today);
  daysEl.textContent = String(days.length);
  const todayStatus = $("today-status");
  if (todayStatus) todayStatus.textContent = IS_MINECRAFT
    ? (stamped ? "今天的探险印已经盖好 ✓" : companionState.learning_days?.includes(today) ? "今天已经学习，和 Byte 互动即可盖探险印" : "今天完成一点学习，再来互动即可盖探险印")
    : (stamped ? "今天的同行印已经盖好 ✓" : companionState.learning_days?.includes(today) ? "今天已经学习，和小白龙互动即可盖印" : "今天完成一点学习，再来互动即可盖印");
  const cosmeticList = $("cosmetic-list");
  const visibleCosmetics = companionCatalog.cosmetics.filter((item) => !IS_MINECRAFT || item.asset);
  if (cosmeticList) {
    cosmeticList.hidden = visibleCosmetics.length === 0;
    cosmeticList.innerHTML = visibleCosmetics.map((item) => {
    const unlocked = companionState.unlocked_cosmetics?.includes(item.id);
    return `<span class="cosmetic ${unlocked ? "unlocked" : ""}">${unlocked ? "✓" : "○"} ${item.name} · ${item.days} 日</span>`;
    }).join("");
  }
  const cosmeticComingSoon = $("cosmetic-coming-soon");
  if (cosmeticComingSoon) cosmeticComingSoon.hidden = !IS_MINECRAFT || visibleCosmetics.length > 0;
}

const STICKER_TYPE_LABELS = { decor: "装饰元素", toy: "小玩具", animal: "动物朋友", weapon: "故事武器", gear: "故事装备", sticker: "故事图案" };
const STICKER_UNIT = IS_MINECRAFT ? "本" : "集";
const STICKER_UNIT_EN = IS_MINECRAFT ? "book" : "episode";
const STICKER_STORY_NAME = IS_MINECRAFT ? "Minecraft 绘本" : "西游故事";
const STICKER_MAP_LABEL = IS_MINECRAFT ? "两本绘本地图" : "十三篇地图";

function stickerClass(value) {
  return String(value || "circle").replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
}

function stickerImage(item) {
  if (!item) return null;
  if (IS_MINECRAFT) {
    return item.story_image || item.asset || (item.episode
      ? `${MINECRAFT_SCENE_ASSET_PREFIX}book${String(item.episode).padStart(3, "0")}.jpg`
      : null);
  }
  return item.story_binding && item.asset ? item.asset : (item.story_image || item.asset);
}

function rewardRoomAsset(item) {
  if (!item) return null;
  // room_asset is the explicit transparent cutout contract.  `asset` remains
  // the backwards-compatible fallback for the EP2 items while their
  // story-bound transparent drawings are still being generated and reviewed.
  if (item.room_asset) return item.room_asset;
  if (item.asset_status === "pending-transparent-generation") return null;
  return item.asset || null;
}

function stickerMarkup(item) {
  const owned = Boolean(item.owned);
  const shape = stickerClass(item.shape);
  const tone = stickerClass(item.tone);
  const glyph = item.glyph || "✨";
  const status = owned ? "已获得" : "未解锁";
  // EP1 has individually reviewed transparent keepsakes with page/scene
  // bindings, so keep those precise object drawings. Later chapters use the
  // authored story frame as the safe fallback until their own GPT prompts are
  // reviewed; this prevents generic old-sheet art from leading the card.
  const image = stickerImage(item);
  const imageClass = image === item.story_image ? " story-scene-image" : "";
  const artContent = image
    ? `<img class="sticker-art-image${imageClass}" src="/data/${escapeHtml(image)}" alt="${escapeHtml(item.title_zh || "故事贴纸")}" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="sticker-glyph-fallback" aria-hidden="true" hidden>${escapeHtml(glyph)}</span>`
    : `<span class="sticker-glyph-fallback" aria-hidden="true">${escapeHtml(glyph)}</span>`;
  const cardContent = `<div class="sticker-art sticker-shape-${shape} sticker-tone-${tone}" aria-hidden="true">${artContent}<i>${STICKER_UNIT} ${String(item.episode).padStart(2, "0")}</i></div>
    <div class="sticker-copy"><strong>${escapeHtml(item.title_zh || "故事贴纸")}</strong><small>第 ${item.episode} ${STICKER_UNIT}</small><b>${owned ? "✓ 已贴上" : "🔒 等你发现"}</b></div>`;
  return `<button class="sticker-card ${owned ? "earned" : "missing"}" type="button" data-sticker-id="${escapeHtml(item.id)}" data-sticker-owned="${String(owned)}" aria-haspopup="dialog" aria-label="第 ${item.episode} ${STICKER_UNIT} ${escapeHtml(item.title_zh || "故事贴纸")}，${status}，点击查看大图">${cardContent}</button>`;
}

function stickerChapterNumber() {
  const value = Number.parseInt(new URLSearchParams(window.location.search).get("chapter"), 10);
  const max = IS_MINECRAFT ? 2 : 13;
  return Number.isInteger(value) && value >= 1 && value <= max ? value : null;
}

function stickerChapterHref(chapter) {
  return `stickers.html?series=${SERIES_ID}&chapter=${chapter}`;
}

function decorateStickerItem(item) {
  if (!item || item.story_binding) return item;
  const episode = Number(item.episode);
  const story = Array.isArray(storyCatalog.episodes)
    ? storyCatalog.episodes.find((entry) => Number(entry?.episode) === episode)
    : null;
  const titleZh = String(story?.title?.zh || "").trim();
  const titleEn = String(story?.title?.en || "").trim();
  if (!titleZh && !titleEn) return item;
  return {
    ...item,
    title_zh: `${titleZh || item.title_zh || "故事场景"}贴纸`,
    title_en: `${titleEn || item.title_en || "Story Scene"} Sticker`,
    caption_zh: `这张图来自《西游记》第 ${episode} 集“${titleZh || item.title_zh || "故事场景"}”。完成本集，就能把这个故事瞬间贴进收藏册。`,
    caption_en: `A scene sticker from Journey to the West episode ${episode}, “${titleEn || item.title_en || "Story scene"}”. Finish the episode to collect it.`,
  };
}

function stickerCoverArt(motif, className = "") {
  const glyph = motif?.glyph || "✨";
  const art = motif?.asset
    ? `<img src="/data/${escapeHtml(motif.asset)}" alt="" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span aria-hidden="true" hidden>${escapeHtml(glyph)}</span>`
    : `<span aria-hidden="true">${escapeHtml(glyph)}</span>`;
  return `<span class="sticker-chapter-cover ${className}">${art}</span>`;
}

function stickerStoryCover(asset, className = "") {
  if (!asset) return "";
  return `<span class="sticker-chapter-story-cover ${className}"><img src="/data/${escapeHtml(asset)}" alt="" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span aria-hidden="true" hidden>📖</span></span>`;
}

function chapterCardMarkup(theme, items) {
  const chapter = Number(theme.chapter);
  const earned = items.filter((item) => item.owned).length;
  const motifs = Array.isArray(theme.motifs) ? theme.motifs.slice(0, 3) : [];
  // When a chapter has an authored story image, let it be the whole visual
  // anchor. Overlaying unrelated motif cutouts on a character's face was the
  // main source of the “画面奇怪、和故事无关” feeling. Motifs remain in the
  // sticker cards and dialog, where they are attached to a specific episode.
  const art = theme.cover_asset
    ? stickerStoryCover(theme.cover_asset)
    : motifs.map((motif, index) => stickerCoverArt(motif, `cover-${index + 1}`)).join("");
  const dots = items.map((item) => `<i class="${item.owned ? "earned" : ""}" aria-hidden="true"></i>`).join("");
  return `<a class="sticker-chapter-card sticker-tone-${stickerClass(theme.tone)}" data-sticker-chapter="${chapter}" href="${stickerChapterHref(chapter)}" aria-label="第 ${chapter} ${STICKER_UNIT} ${escapeHtml(theme.title_zh || STICKER_STORY_NAME)}，已收集 ${earned} / ${items.length}">
    <span class="sticker-chapter-art" aria-hidden="true">${art}</span>
    <span class="sticker-chapter-copy"><em>第 ${chapter} ${STICKER_UNIT}</em><strong>${escapeHtml(theme.title_zh || STICKER_STORY_NAME)}</strong><small>${earned} / ${items.length} 已贴上</small><span class="chapter-progress-dots">${dots}</span></span>
    <b aria-hidden="true">打开 →</b>
  </a>`;
}

function stickerDialogClose() {
  const dialog = $("sticker-dialog");
  if (!dialog) return;
  if (typeof dialog.close === "function" && dialog.open) dialog.close();
  else dialog.removeAttribute("open");
}

function openSticker(id) {
  if (!rewardCore) return;
  const item = rewardCore.stickerItems(rewardState, rewardCatalog || {}).map(decorateStickerItem).find((entry) => entry.id === id);
  if (!item) return;
  const dialog = $("sticker-dialog");
  if (!dialog) return;
  const owned = Boolean(item.owned);
  const glyph = item.glyph || "✨";
  const shape = stickerClass(item.shape);
  const tone = stickerClass(item.tone);
  const image = stickerImage(item);
  const imageClass = image === item.story_image ? " story-scene-image" : "";
  const artContent = image
    ? `<img class="sticker-dialog-art-image${imageClass}" src="/data/${escapeHtml(image)}" alt="${escapeHtml(item.title_zh || "故事贴纸")}" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="sticker-dialog-glyph" aria-hidden="true" hidden>${escapeHtml(glyph)}</span>`
    : `<span class="sticker-dialog-glyph" aria-hidden="true">${escapeHtml(glyph)}</span>`;
  $("sticker-dialog-art").innerHTML = `<div class="sticker-art sticker-shape-${shape} sticker-tone-${tone}">${artContent}<i aria-hidden="true">EP ${String(item.episode).padStart(3, "0")}</i></div>`;
  dialog.classList.toggle("is-locked", !owned);
  $("sticker-dialog-status").textContent = owned ? "✓ 已贴进故事册" : "🔒 还差一步";
  $("sticker-dialog-title").textContent = item.title_zh || "故事贴纸";
  $("sticker-dialog-en").textContent = owned ? item.title_en || "Story Sticker" : `Finish ${STICKER_UNIT_EN} ${item.episode}`;
  const storyHintZh = item.source_label_zh ? `来源：${item.source_label_zh}` : "";
  const storyHintEn = item.source_label_en ? `Source: ${item.source_label_en}` : "";
  $("sticker-dialog-description").textContent = `${item.caption_zh || "这是你从故事里收下的小礼物。"}${owned ? "" : ` 完成第 ${item.episode} ${STICKER_UNIT}，就能把它贴进故事册。`}`;
  $("sticker-dialog-description-en").textContent = `${item.caption_en || "A story gift from this story."}${owned ? "" : ` Read, listen, and finish ${STICKER_UNIT_EN} ${item.episode} to collect it.`}`;
  const motion = item.motion_zh || (IS_MINECRAFT
    ? (Number(item.episode) === 1 ? "传送门紫光一闪，方块边角依次亮起。" : "草地方块亮起来，小伙伴轻轻跳一下。")
    : "贴纸会轻轻浮起，边角闪一下。");
  const motionEl = $("sticker-dialog-motion");
  if (motionEl) motionEl.textContent = `动态预览：${motion}`;
  const chapterHint = item.chapter && Number(item.chapter) !== Number(item.episode)
    ? ` · 第 ${item.chapter} ${STICKER_UNIT}` : ` · ${STICKER_STORY_NAME}`;
  $("sticker-dialog-source").textContent = [`第 ${item.episode} ${STICKER_UNIT}${chapterHint}`, storyHintZh].filter(Boolean).join(" · ");
  $("sticker-dialog-type").textContent = STICKER_TYPE_LABELS[item.story_element_type] || "故事图案";
  $("sticker-dialog-acquired").textContent = owned && item.acquired_at
    ? new Date(item.acquired_at).toLocaleDateString("zh-CN")
    : owned ? "刚刚收入" : "等你来收集";
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function renderStickerBook() {
  const chapterGrid = $("sticker-chapter-grid");
  const chapterView = $("sticker-chapter-view");
  if (!chapterGrid || !chapterView || !rewardCore) return;
  const items = rewardCore.stickerItems(rewardState, rewardCatalog || {}).map(decorateStickerItem);
  const earned = items.filter((item) => item.owned).length;
  const themes = Array.isArray(rewardCatalog.sticker_themes) ? rewardCatalog.sticker_themes : [];
  const count = $("sticker-book-count");
  if (count) count.textContent = `${earned} / ${items.length} 已收入`;
  const pageCount = $("sticker-page-count");
  if (pageCount) pageCount.textContent = `${earned} / ${items.length}`;
  chapterGrid.innerHTML = themes.map((theme) => chapterCardMarkup(theme, items.filter((item) => item.chapter === Number(theme.chapter)))).join("");

  const chapter = stickerChapterNumber();
  const theme = themes.find((entry) => Number(entry.chapter) === chapter);
  const chapterMap = $("sticker-chapter-map");
  if (!chapter || !theme) {
    chapterMap.hidden = false;
    chapterView.hidden = true;
  $("sticker-book-intro").textContent = `选${IS_MINECRAFT ? "一本" : "一篇"}，打开你的${IS_MINECRAFT ? "方块故事" : "西游场景"}。`;
    return;
  }

  const chapterItems = items.filter((item) => item.chapter === chapter);
  const chapterEarned = chapterItems.filter((item) => item.owned).length;
  chapterMap.hidden = true;
  chapterView.hidden = false;
  $("sticker-book-intro").textContent = "点一枚贴纸，看大图。";
  $("chapter-view-number").textContent = `第 ${chapter} ${STICKER_UNIT} · 第 ${theme.from}–${theme.to} ${STICKER_UNIT}`;
  $("chapter-view-title").textContent = theme.title_zh || STICKER_STORY_NAME;
  $("chapter-view-en").textContent = theme.title_en || (IS_MINECRAFT ? "Minecraft Story" : "Journey West");
  $("chapter-view-progress").textContent = `${chapterEarned} / ${chapterItems.length} 已贴上`;
  const sceneArt = $("chapter-scene-art");
  sceneArt.className = `chapter-scene-art sticker-tone-${stickerClass(theme.tone)}`;
  const storyScene = theme.detail_asset || theme.cover_asset;
  sceneArt.innerHTML = stickerStoryCover(storyScene, "detail");
  $("chapter-sticker-grid").innerHTML = chapterItems.map(stickerMarkup).join("");
  const previous = $("chapter-prev");
  const next = $("chapter-next");
  previous.hidden = chapter <= 1;
  previous.href = stickerChapterHref(Math.max(1, chapter - 1));
  next.hidden = chapter >= themes.length;
  next.href = stickerChapterHref(Math.min(themes.length, chapter + 1));
}

function roomSlotClass(slot) {
  return String(slot || "shelf.center").toLowerCase().replace(/[^a-z0-9_-]/g, "-");
}

function roomItemMarkup(entry, options = {}) {
  const item = entry.item;
  const interaction = item.interaction || {};
  const className = options.rack ? "room-rack-item room-item rack" : `room-item slot-${roomSlotClass(entry.slot)}`;
  const roomAsset = rewardRoomAsset(item);
  const art = roomAsset
    ? `<img src="/data/${escapeHtml(roomAsset)}" alt="${escapeHtml(item.title_zh || item.title_en || "故事纪念品")}" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="room-art-fallback" aria-hidden="true" hidden>${escapeHtml(item.glyph || "✨")}</span>`
    : `<span class="room-item-glyph" aria-hidden="true">${escapeHtml(item.glyph || "✨")}</span>`;
  const interactionLabel = interaction.text_zh || interaction.text_en || "点一下玩，互动可跳过";
  return `<button class="${className}" type="button" data-room-item="${escapeHtml(item.id)}" data-room-interaction="${escapeHtml(interaction.kind || "none")}" aria-label="${escapeHtml(item.title_zh || item.title_en || "故事纪念品")}，${escapeHtml(interactionLabel)}">${art}<span class="room-item-label">${escapeHtml(item.title_zh || item.title_en || "故事纪念品")}</span></button>`;
}

function renderRoomCompanion() {
  const companion = $("room-companion");
  const image = $("room-companion-image");
  const fallback = $("room-companion-fallback");
  if (!companion || !image || !fallback) return;
  const stage = BookPlayCompanion.deriveCompanionStage({
    catalog: companionCatalog,
    collections,
    progress,
    drills,
  });
  companion.setAttribute("aria-label", `${stage?.name || (IS_MINECRAFT ? "Byte" : "小白龙")}在房间里陪你`);
  image.alt = stage?.name || (IS_MINECRAFT ? "Byte" : "小白龙");
  fallback.textContent = stageGlyph(stage);
  image.hidden = true;
  fallback.hidden = false;
  image.onload = () => {
    image.hidden = false;
    fallback.hidden = true;
  };
  image.onerror = () => {
    image.hidden = true;
    fallback.hidden = false;
  };
  if (stage?.art && stage?.form !== "egg") image.src = `/data/${stage.art}`;
}

function bindRoomInteractions(container, entries) {
  if (!container) return;
  container.querySelectorAll("[data-room-item]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = entries.find((entry) => entry.item.id === button.dataset.roomItem)?.item;
      if (!item) return;
      const interaction = item.interaction || {};
      const text = interaction.text_zh || interaction.text_en || `${item.title_en || "Story keepsake"} · ${item.caption_zh || item.caption_en || "这是你在故事里留下的纪念品。"}`;
      const companion = $("room-companion");
      const reaction = $("room-reaction");
      button.classList.remove("is-interacting");
      void button.offsetWidth;
      button.classList.add("is-interacting");
      button.addEventListener("animationend", () => button.classList.remove("is-interacting"), { once: true });
      if (companion) {
        Array.from(companion.classList).filter((name) => name.startsWith("reaction-")).forEach((name) => companion.classList.remove(name));
        companion.classList.remove("is-reacting");
        void companion.offsetWidth;
        companion.classList.add("is-reacting", `reaction-${stickerClass(interaction.kind || "cheer")}`);
        companion.addEventListener("animationend", () => companion.classList.remove("is-reacting"), { once: true });
      }
      if (reaction) reaction.textContent = text;
    });
  });
}

function renderRoom() {
  const scene = $("room-scene");
  const placements = $("room-placements");
  if (!scene || !placements || !rewardCore) return;
  const room = rewardCatalog.rooms?.[ROOM_ID] || {};
  if (room.background) scene.style.backgroundImage = `url('/data/${room.background}')`;
  renderRoomCompanion();
  const entries = rewardCore.roomItems(rewardState, rewardCatalog, ROOM_ID).filter((entry) => entry.item);
  const toyEntries = entries.filter((entry) => entry.item.placement === "toy" || String(entry.slot || "").startsWith("rack."));
  const decorEntries = entries.filter((entry) => !toyEntries.includes(entry));
  const rackItems = $("toy-rack-items");
  $("room-count").textContent = `${entries.length} 件纪念品`;
  const roomPageCount = $("room-page-count");
  if (roomPageCount) roomPageCount.textContent = `${entries.length} 件`;
  $("room-empty").hidden = entries.length > 0;
  placements.innerHTML = decorEntries.map((entry) => roomItemMarkup(entry)).join("");
  if (rackItems) {
      rackItems.innerHTML = toyEntries.length
      ? toyEntries.map((entry) => roomItemMarkup(entry, { rack: true })).join("")
      : `<p class="toy-rack-empty">完成${IS_MINECRAFT ? "一本" : "一集"}巩固，就会有小玩具来报到。</p>`;
  }
  bindRoomInteractions(placements, decorEntries);
  bindRoomInteractions(rackItems, toyEntries);
}

function openMedal(id) {
  const item = achievementCatalog.achievements.find((entry) => entry.id === id);
  if (!item) return;
  const receipt = achievementResult.receipts[id];
  $("dialog-medal").innerHTML = medalArtMarkup(item);
  const dialogStatus = $("dialog-status");
  dialogStatus.className = `dialog-status ${receipt ? "earned" : "locked"}`;
  dialogStatus.textContent = receipt ? "已获得 · 永久收藏" : "未解锁 · 先看看目标";
  $("dialog-title").textContent = item.name;
  $("dialog-en").textContent = item.title_en;
  $("dialog-description").textContent = item.description_zh || item.blessing || (IS_MINECRAFT ? "这是方块探险中的一枚故事勋章。" : "这是西游旅程中的一枚故事勋章。");
  $("dialog-motion").textContent = item.motion_zh || "动态预览：勋章会轻轻漂浮，亮起一圈温柔高光。";
  $("dialog-blessing").textContent = item.blessing;
  $("dialog-condition").textContent = `获得条件：${item.condition_text}`;
  $("dialog-date").textContent = receipt
    ? `获得于 ${new Date(receipt.at).toLocaleDateString("zh-CN")}`
    : "尚未获得，继续阅读就会越来越近。";
  if (receipt) {
    receipt.seen = true;
    saveAchievementReceipts();
    renderMedals();
  }
  const dialog = $("medal-dialog");
  if (typeof dialog.showModal === "function") dialog.showModal();
}

function care(actionId, button) {
  const action = companionCatalog.care_actions.find((item) => item.id === actionId);
  const result = BookPlayCompanion.recordCare(companionState, {
    day: localDay(),
    action: actionId,
    cosmetics: companionCatalog.cosmetics,
  });
  companionState = result.state;
  saveCompanionState();
  const avatar = $("companion-avatar");
  if (avatar) {
    avatar.classList.remove("reacting");
    void avatar.offsetWidth;
    avatar.classList.add("reacting");
  }
  document.querySelectorAll("[data-care]").forEach((item) => item.classList.toggle("active", item === button));
  const response = $("care-response");
  const fallbackResponse = IS_MINECRAFT ? "Byte 开心地摇了摇尾巴。" : "小白龙开心地回应了你。";
  if (response) response.textContent = result.stamped
    ? `${action?.response || fallbackResponse} ${IS_MINECRAFT ? "今日探险印" : "今日同行印"} +1！`
    : `${action?.response || fallbackResponse} ${companionState.learning_days.includes(localDay()) ? (IS_MINECRAFT ? "今天已经盖过探险印啦。" : "今天已经盖过同行印啦。") : (IS_MINECRAFT ? "今天学习后再互动，就能盖探险印。" : "今天学习后再互动，就能盖同行印。")}`;
  renderJournal();
}

async function init() {
  applySeriesChrome();
  setLoading(true);
  clearLoadError();
  try {
    const [achievements, companion, collectionData, rewards, stories] = await Promise.all([
      fetch(IS_MINECRAFT ? "/data/achievements/minecraft.json" : "/data/achievements/jttw.json", { cache: "no-store" }).then((r) => {
        if (!r.ok) throw new Error(`勋章数据 ${r.status}`);
        return r.json();
      }),
      fetch(IS_MINECRAFT ? "/data/companions/block-buddy.json" : "/data/companions/white-dragon.json", { cache: "no-store" }).then((r) => {
        if (!r.ok) throw new Error(`伙伴数据 ${r.status}`);
        return r.json();
      }),
      fetch(IS_MINECRAFT ? "/data/storybooks-minecraft/collections.json" : "/data/dialogue_stories/collections.json", { cache: "no-store" }).then((r) => {
        if (!r.ok) throw new Error(`路线数据 ${r.status}`);
        return r.json();
      }),
      fetch(IS_MINECRAFT ? "/data/rewards/storybooks.json" : "/data/rewards/jttw.json", { cache: "no-store" }).then((r) => {
        if (!r.ok) throw new Error(`奖励数据 ${r.status}`);
        return r.json();
      }).catch(() => ({})),
      fetch(IS_MINECRAFT ? "/data/storybooks-minecraft/catalog.json" : "/data/storybooks/catalog.json", { cache: "no-store" }).then((r) => {
        if (!r.ok) throw new Error(`故事目录 ${r.status}`);
        return r.json();
      }).catch(() => ({ episodes: [] })),
    ]);
    achievementCatalog = achievements;
    companionCatalog = companion;
    collections = collectionData.collections || [];
    progress = seriesProgressView(readObject(PROGRESS_KEY));
    drills = readObject(DRILL_KEY);
    companionState = BookPlayCompanion.normalizeState(readObject(COMPANION_KEY), {
      companionId: IS_MINECRAFT ? "minecraft-byte" : "white-dragon-horse",
    });
    rewardCatalog = IS_MINECRAFT ? (rewards.storybooks?.minecraft || {}) : (rewards || {});
    storyCatalog = stories || { episodes: [] };
    rewardState = rewardStateFromStorage();
    inferTodayLearning();
    const savedAchievements = readObject(ACHIEVEMENT_STORAGE_KEY);
    achievementResult = BookPlayCompanion.evaluateAchievements({
      catalog: achievementCatalog,
      collections,
      progress,
      drills,
      receipts: savedAchievements.unlocked || {},
    });
    saveAchievementReceipts();
    saveCompanionState();
    renderStage();
    renderMedals();
    renderJournal();
    renderRoom();
    renderStickerBook();

    if (!eventsBound) {
      const careActions = $("care-actions");
      if (careActions) careActions.addEventListener("click", (event) => {
        const button = event.target.closest("[data-care]");
        if (button) care(button.dataset.care, button);
      });
      const medalWall = $("medal-wall");
      if (medalWall) medalWall.addEventListener("click", (event) => {
        const card = event.target.closest("[data-medal]");
        if (card) openMedal(card.dataset.medal);
      });
      const recentStrip = $("recent-strip");
      if (recentStrip) recentStrip.addEventListener("click", (event) => {
        const card = event.target.closest("[data-medal]");
        if (card) openMedal(card.dataset.medal);
      });
      const nextTargetCard = $("next-target-card");
      if (nextTargetCard) nextTargetCard.addEventListener("click", (event) => {
        const card = event.target.closest("[data-medal]");
        if (card) openMedal(card.dataset.medal);
      });
      const medalFilters = $("medal-filters");
      if (medalFilters) medalFilters.addEventListener("click", (event) => {
        const button = event.target.closest("[data-medal-filter]");
        if (!button) return;
        medalFilter = button.dataset.medalFilter;
        renderMedalWall();
      });
      const stickerGrid = $("chapter-sticker-grid");
      if (stickerGrid) stickerGrid.addEventListener("click", (event) => {
        const card = event.target.closest("[data-sticker-id]");
        if (card) openSticker(card.dataset.stickerId);
      });
      const dialogClose = $("dialog-close");
      const medalDialog = $("medal-dialog");
      if (dialogClose && medalDialog) {
        dialogClose.addEventListener("click", () => medalDialog.close());
        medalDialog.addEventListener("click", (event) => {
          if (event.target === medalDialog) medalDialog.close();
        });
      }
      const stickerDialogCloseButton = $("sticker-dialog-close");
      const stickerDialog = $("sticker-dialog");
      if (stickerDialogCloseButton && stickerDialog) {
        stickerDialogCloseButton.addEventListener("click", stickerDialogClose);
        stickerDialog.addEventListener("click", (event) => {
          if (event.target === stickerDialog) stickerDialogClose();
        });
        stickerDialog.addEventListener("cancel", stickerDialogClose);
      }
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && $("sticker-dialog")?.open) stickerDialogClose();
      });
      eventsBound = true;
    }
    setLoading(false);
  } catch (error) {
    showLoadError(error);
  }
}

function redirectLegacyCollectionHash() {
  if (document.body?.classList.contains("collection-page")) return false;
  const hash = String(window.location.hash || "").replace(/^#/, "").toLowerCase();
  const target = hash.includes("sticker") ? "stickers.html" : hash.includes("medal") ? "medals.html" : "";
  if (!target) return false;
  const query = window.location.search || "?series=jttw";
  window.location.replace(`${target}${query}`);
  return true;
}

const retryButton = $("companion-retry");
if (retryButton) retryButton.addEventListener("click", () => init());
if (!redirectLegacyCollectionHash()) init();
