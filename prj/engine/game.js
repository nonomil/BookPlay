"use strict";

/* 降妖记·大地图（word-memory-map 同款玩法移植）：
 * 4×4 平铺大世界 + 镜头跟随；主角八方向自由行走（方向键/摇杆）；
 * 小怪头顶英文单词、会追踪并撞击主角；地面刷中文词球，走过捡起、
 * 点对小怪投掷（追踪弹）；答对爆碎掉星/掉道具，答错词球弹回；
 * 支援道具（蟠桃挡伤/芭蕉扇减速/紫金葫芦瞄准/筋斗云加速/紧箍咒提示/金箍棒补盾）；
 * NPC 剧情对话答题（pixel-story 式游标）；Boss 区跳转 battle.html 对战。
 * 移动内核与实体渲染方式对照 word-memory-map：世界坐标 → 百分比定位，
 * rAF 逐帧只改 left/top 与镜头 translate3d，不重建 DOM。
 * 纯逻辑复用 battle-core + game-core；存储键：bookplay_battle_progress_v1 / bookplay_battle_collection_v1。
 */
(function () {
  const Core = window.BookPlayBattleCore;
  const Game = window.BookPlayGameCore;
  const Util = window.BookPlayGameCommon;

  const params = new URLSearchParams(window.location.search);
  const EP = Math.max(1, Number(params.get("ep")) || 1);
  const DEBUG = params.get("debug") === "1";
  const FROM_BATTLE = params.get("from") === "battle";
  const FROM_LESSON = params.get("from") === "lesson";

  const KEY_PROGRESS = "bookplay_battle_progress_v1";
  const KEY_COLLECTION = "bookplay_battle_collection_v1";
  const KEY_WEAK = "bookplay_weak_v1";

  const WORLD = Game.WORLD_TILES;  // 默认 4×4 视口；关卡可用 map.worldTiles 覆盖
  // 归一化单位 NU = 一个视口宽（地图坐标）；速度语义 = 视口/秒，与 worldTiles 无关。
  // 派生量在 boot 按关卡 worldTiles 重算（recomputeTuning），否则 worldTiles=1 时全部慢 4 倍。
  let NU = 1 / WORLD;
  let HERO_SPEED = Game.MOVEMENT_SPEEDS.hero * NU;
  let MONSTER_WANDER = Game.MOVEMENT_SPEEDS.monsterWander * NU;
  let MONSTER_CHASE = Game.MOVEMENT_SPEEDS.monsterChase * NU;
  let AGGRO_DIST = Game.MONSTER_AI.aggro * NU;
  const KEEP_DIST = Game.PACK.chaseRadius;
  const PACK_GAP = Game.PACK.separation;
  const SPAWN_GAP = Game.PACK.spawnGap;
  let ATTACK_DIST = Game.MONSTER_AI.attack * NU;
  const ATTACK_CD = Game.MONSTER_AI.attackCd;
  const HERO_INVULN = 2400;
  let ORB_PICKUP = 0.11 * NU;
  // Auto-walk targets must settle inside the pickup radius. The old fixed
  // 0.03 stop threshold was larger than ORB_PICKUP (0.0275), leaving a
  // clicked word orb visibly beside the hero but never collectible.
  let TARGET_STOP = ORB_PICKUP * 0.45;
  let SHOT_SPEED = 1.75 * NU;
  const SHOT_ARM = 0.12;
  let SHOT_HIT = 0.18 * NU;
  const SHOT_TTL = 2.2;
  let INTERACT_DIST = 0.14 * NU;
  const CAMERA_MARGIN = 0.32;      // 视口内边距（占视口比例）：人物先走，接近边缘才推镜头
  const CAMERA_TAU = 0.14;         // 镜头跟上更快的走速，避免人物贴边等地图

  function recomputeTuning() {
    NU = 1 / mapWorld();
    HERO_SPEED = Game.MOVEMENT_SPEEDS.hero * NU;
    MONSTER_WANDER = Game.MOVEMENT_SPEEDS.monsterWander * NU;
    MONSTER_CHASE = Game.MOVEMENT_SPEEDS.monsterChase * NU;
    AGGRO_DIST = Game.MONSTER_AI.aggro * NU;
    ATTACK_DIST = Game.MONSTER_AI.attack * NU;
    ORB_PICKUP = 0.11 * NU;
    TARGET_STOP = ORB_PICKUP * 0.45;
    SHOT_SPEED = 1.75 * NU;
    SHOT_HIT = 0.18 * NU;
    INTERACT_DIST = 0.14 * NU;
  }

  const THEME_ZH = {
    "flower-fruit-mountain": "花果山",
    "water-curtain-cave": "水帘洞",
    "three-star-cave": "斜月三星洞",
    "water-dirty-cave": "水脏洞",
    "dragon-palace": "龙宫",
    "underworld": "幽冥界",
    "heaven-palace": "天宫",
    "peach-garden": "蟠桃园",
  };
  // 新关卡把区域与点位写进 map；这些只为旧数据包提供一次性兼容。
  const DEFAULT_MAP_REGIONS = Object.freeze({ hero: 5, waves: [5, 6], npc: { intro: 5, quiz: 6 }, boss: 7 });
  const SLOT_MONSTERS = [[0.62, 0.46], [0.76, 0.54], [0.68, 0.66], [0.82, 0.48]];
  // Peaches stay on the hero's left; English minions stay on the right.
  const SLOT_ORBS = [[0.22, 0.50], [0.32, 0.62], [0.24, 0.74], [0.36, 0.48]];
  const WUKONG_WALK_PNG = [1, 2, 3, 4, 5, 6, 7, 8].map(
    (n) => `assets/generated/jttw-player-walkers/wukong/wukong-walk-0${n}.png`
  );

  const FALLBACK_MAP = {
    theme: "generic",
    npcSpots: [{ role: "intro", sprite: "imp", nameZh: "小妖" }, { role: "quiz", sprite: "imp", nameZh: "小妖" }],
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    root: $("game-root"),
    scene: $("game-scene"),
    world: $("game-world"),
    backdrop: $("game-backdrop"),
    entities: $("game-entities"),
    projectiles: $("game-projectiles"),
    particles: $("game-particles"),
    stars: $("game-stars"),
    progress: $("game-progress"),
    shields: $("game-shields"),
    carried: $("game-carried"),
    combo: $("game-combo"),
    hint: $("game-hint"),
    exit: $("game-exit"),
    banner: $("game-banner"),
    bannerKicker: $("game-banner-kicker"),
    bannerTitle: $("game-banner-title"),
    route: $("game-route"),
    supports: $("game-supports"),
    hintcard: $("game-hintcard"),
    typepad: $("game-typepad"),
    joystick: $("game-joystick"),
    stick: $("game-stick"),
    dialogue: $("game-dialogue"),
    dialogueFace: $("game-dialogue-face"),
    dialogueKicker: $("game-dialogue-kicker"),
    dialogueName: $("game-dialogue-name"),
    dialogueEn: $("game-dialogue-en"),
    dialogueZh: $("game-dialogue-zh"),
    dialogueChoices: $("game-dialogue-choices"),
    dialogueReplay: $("game-dialogue-replay"),
    dialogueNext: $("game-dialogue-next"),
    dialogueClose: $("game-dialogue-close"),
    bossgate: $("game-bossgate"),
    pause: $("game-pause"),
    gate: $("game-gate"),
    toast: $("game-toast"),
  };

  const state = {
    level: null,
    sprites: {},
    pickup: { id: "peach", nameZh: "仙桃", emoji: "🍑", image: "" },
    taunts: {},
    audio: null,
    voicePending: false,
    phase: "loading",
    locked: false,
    paused: false,
    ignoreHidden: false,
    vw: window.innerWidth,
    vh: window.innerHeight,
    hero: { x: 0.375, y: 0.375, dir: "south", el: null, img: null, invulnUntil: 0, attackUntil: 0, moving: false, pose: "idle", walkFrame: 0, walkTick: 0 },
    camera: { x: 0, y: 0 },
    monsters: [],
    orbs: [],
    shots: [],
    supportDrops: [],
    npcs: [],
    bossSpot: null,
    waveIndex: 0,
    killed: 0,
    stars: 0,
    shield: 3,
    combo: { streak: 0 },
    wrongWords: {},
    weakWords: {},
    hintUsedThisOrb: false,
    targetArrow: null,
    carried: null,          // {zh, el?} 手里的中文词球
    items: Game.emptyItems(),
    buffs: Game.emptyBuffs(),
    npcBonus: false,
    npcDone: false,
    npcUnlocked: false,
    pendingWave: null,
    mapStage: "wave1",
    defeatedKeys: new Set(),
    usedTerms: new Set(),
    introAutoPlayed: false,
    playVerb: "tag-shoot",
    listenSpoken: "",
    listenRings: [],
    bossGateOpen: false,
    bossReady: false,
    bossNear: false,
    intent: { x: 0, y: 0 },
    held: new Set(),
    input: null,
    lastTs: 0,
    raf: 0,
  };

  /* ---------- 基础工具 ---------- */

  // 通用工具收敛到 game-common.js（window.BookPlayGameCommon）；本地别名绑定，调用点保持不变。
  const readStore = Util.readStore;
  const writeStore = Util.writeStore;
  const handheldOffline = Util.handheldOffline;
  const fetchJSON = Util.fetchJSON;
  const assetUrl = Util.assetUrl;
  const catalogCards = Util.catalogCards;

  const persistWeak = Util.makeWeakPersister({ key: KEY_WEAK, state, ep: EP });

  const freezeLevel = Util.makeFreezeLevel({ core: Game, state, ep: EP });

  function persistProgress(extra) {
    const progress = readStore(KEY_PROGRESS);
    const rec = Object.assign({}, progress[EP] || {}, {
      wrongWords: state.wrongWords,
      mapStage: state.mapStage,
      mapWaveIndex: state.waveIndex,
      mapKilled: state.killed,
      mapStars: state.stars,
      mapShield: state.shield,
      npcBonus: state.npcBonus,
      npcDone: state.npcDone,
      npcUnlocked: state.npcUnlocked,
      mapDefeatedKeys: Array.from(state.defeatedKeys),
      mapItems: state.items,
    }, extra || {});
    rec.updatedAt = new Date().toISOString();
    persistWeak();
    progress[EP] = rec;
    writeStore(KEY_PROGRESS, progress);
  }

  let audioEl = null;
  function stopGameAudio(reason) {
    const why = reason || "stop";
    state.audio?.stop(why);
    if (audioEl) {
      try {
        audioEl.pause();
        audioEl.currentTime = 0;
      } catch (_) { /* media boundary */ }
    }
    return true;
  }

  function navigateGame(url) {
    stopGameAudio("navigation");
    window.location.href = url;
  }

  function leaveUrl() {
    if (FROM_LESSON) return `lesson.html?ep=${EP}`;
    try {
      if (document.documentElement.hasAttribute("data-handheld") || location.hostname === "127.0.0.1") {
        return "play-map.html";
      }
    } catch (_) { /* ignore */ }
    return "map.html";
  }

  const speakTerm = Util.makeSpeakTerm({
    getAudio: () => state.audio,
    getEl: () => audioEl,
    setEl: (v) => { audioEl = v; },
  });

  function speakDialogue(line) {
    if (!line) return Promise.resolve(false);
    const textEn = line.textEn || "";
    const textZh = line.textZh || "";
    const req = textEn
      ? { ref: line.id ? `dialogue:${line.id}:en` : (line.audioRef || `sent_en:${textEn}`), text: textEn, lang: "en-US" }
      : (textZh ? { ref: line.id ? `dialogue:${line.id}:zh` : `sent_zh:${textZh}`, text: textZh, lang: "zh-CN" } : null);
    if (!req) return Promise.resolve(false);
    if (!state.audio) {
      return speakTerm(req.text, req.lang.startsWith("zh") ? "zh" : "en");
    }
    return Promise.resolve(state.audio.play(req)).then((ok) => {
      state.voicePending = !ok;
      return ok;
    });
  }

  function kickVoice(ev) {
    window.BookPlayAudio?.unlock?.();
    if (!state.dlg) return;
    if (ev && ev.target && ev.target.closest && ev.target.closest("#game-dialogue-next, #game-dialogue-close")) return;
    const line = state.dlg.lines[state.dlg.idx];
    if (line) speakDialogue(line);
  }

  function spawnDust(x, y) {
    const dust = document.createElement("span");
    dust.className = "game-dust";
    placeAt(dust, x, y + 0.04 * NU);
    els.particles.appendChild(dust);
    window.setTimeout(() => dust.remove(), 280);
  }

  function pickupFruitHtml() {
    const p = state.pickup || {};
    if (p.image) {
      return `<img class="game-orb-fruit-img" src="${assetUrl(p.image)}" alt="" draggable="false">`;
    }
    return `<span class="game-orb-fruit" aria-hidden="true">${p.emoji || "🍑"}</span>`;
  }

  function bindPickupImage(root) {
    const img = root && root.querySelector(".game-orb-fruit-img");
    if (!img) return;
    img.addEventListener("error", () => {
      img.hidden = true;
      const span = document.createElement("span");
      span.className = "game-orb-fruit";
      span.setAttribute("aria-hidden", "true");
      span.textContent = (state.pickup && state.pickup.emoji) || "🍑";
      img.after(span);
    }, { once: true });
  }

  function emitFx(kind, el, extra) {
    try {
      const r = (el || state.hero.el || document.querySelector("#game-hero")).getBoundingClientRect();
      document.dispatchEvent(new CustomEvent("game-fx", {
        detail: Object.assign({ kind, x: r.left + r.width / 2, y: r.top + r.height / 2 }, extra || {}),
      }));
    } catch (_) { /* 演出不阻塞玩法 */ }
  }

  const showToast = Util.makeToast(els.toast);

  function spriteSrc(spriteId) {
    const entry = state.sprites[spriteId];
    return entry && entry.gif ? assetUrl(entry.gif) : "";
  }

  const FX_DIR = "assets/generated/jttw-hud-fx-v1/";
  const FX = {
    burst: FX_DIR + "fx-star-burst.png",
    bonk: FX_DIR + "fx-staff-bonk.png",
    impact: FX_DIR + "fx-staff-impact.png",
    shock: FX_DIR + "fx-shockwave.png",
    sparkle: FX_DIR + "fx-match-sparkle.png",
    bounce: FX_DIR + "fx-wrong-bounce.png",
    ring: FX_DIR + "fx-listen-ring.png",
    arrow: FX_DIR + "fx-target-arrow.png",
    sweep: FX_DIR + "fx-combo-sweep.png",
    shield: FX_DIR + "fx-shield-flash.png",
    stars: FX_DIR + "fx-combo-stars.png",
  };

  function spriteForPose(spriteId, dir, pose) {
    if (spriteId === "wukong" && pose === "hurt") {
      return assetUrl("assets/generated/jttw-player-walkers/wukong/directions/wukong-south-hurt.png");
    }
    if (spriteId === "wukong" && pose === "celebrate") {
      return assetUrl("assets/generated/jttw-player-walkers/wukong/directions/wukong-south-celebrate.png");
    }
    if (spriteId === "wukong" && pose === "walk" && (dir === "east" || dir === "west")) {
      const idx = Math.max(0, (state.hero.walkFrame || 0) % WUKONG_WALK_PNG.length);
      return assetUrl(WUKONG_WALK_PNG[idx]);
    }
    const entry = state.sprites[spriteId];
    const table = pose === "attack"
      ? entry && entry.attackGifs
      : (pose === "idle" ? entry && entry.idleFrames : entry && entry.walkGifs);
    if (table && table[dir]) return assetUrl(table[dir]);
    if (pose === "walk" && entry && entry.idleFrames && entry.idleFrames[dir]) {
      return assetUrl(entry.idleFrames[dir]);
    }
    return spriteSrc(spriteId);
  }

  function setInputBlocked(blocked) {
    const next = Boolean(blocked);
    if (next) {
      // Opening a modal must also cancel any pointer/keyboard intent and
      // click-to-walk target.  Otherwise the first frame after closing the
      // modal resumes the direction that was held before it opened.
      state.intent.x = 0;
      state.intent.y = 0;
      state.hero.tx = null;
      state.hero.ty = null;
    }
    state.input?.setBlocked(next);
  }

  function setSpriteImage(img, spriteId, dir, pose) {
    if (!img) return;
    const src = spriteForPose(spriteId, dir, pose);
    const key = `${spriteId}:${dir}:${pose}:${src || ""}`;
    if (img.dataset.spriteKey === key) return;
    if (src) img.src = src;
    img.style.transform = spriteId === "wukong" && dir === "west" ? "scaleX(-1)" : "";
    img.dataset.spriteKey = key;
  }

  function makeImg(spriteId, dir, fallbackText, pose) {
    const img = document.createElement("img");
    setSpriteImage(img, spriteId, dir || "south", pose || "idle");
    img.alt = fallbackText || "";
    img.decoding = "async";
    img.addEventListener("error", () => {
      const idle = spriteForPose(spriteId, dir || "south", "idle") || spriteSrc(spriteId);
      if (idle && img.getAttribute("src") !== idle) {
        img.src = idle;
        return;
      }
      img.alt = (fallbackText || "悟").slice(0, 1);
    });
    return img;
  }

  function regionOrigin(region) {
    return Game.regionOrigin(WORLD, region);
  }

  function regionPoint(region, rx, ry) {
    return Game.regionPoint(WORLD, region, rx, ry, 0.03);
  }

  function mapWorld() {
    const value = Number(state.level && state.level.map && state.level.map.worldTiles);
    return Number.isFinite(value) && value >= 1 ? value : WORLD;
  }

  function mapRegions() {
    const raw = state.level && state.level.map && state.level.map.regions;
    if (!raw || typeof raw !== "object") return DEFAULT_MAP_REGIONS;
    const waves = Array.isArray(raw.waves) && raw.waves.length ? raw.waves.slice(0, 2) : DEFAULT_MAP_REGIONS.waves;
    return {
      hero: Number.isFinite(Number(raw.hero)) ? Number(raw.hero) : DEFAULT_MAP_REGIONS.hero,
      waves,
      npc: Object.assign({}, DEFAULT_MAP_REGIONS.npc, raw.npc || {}),
      boss: Number.isFinite(Number(raw.boss)) ? Number(raw.boss) : DEFAULT_MAP_REGIONS.boss,
    };
  }

  function mapPoint(point, role, index) {
    const map = state.level && state.level.map;
    const p = point && typeof point === "object" ? point : {};
    if (map && map.coordinateSpace === "world-normalized") {
      return clampWorld(Number(p.x), Number(p.y));
    }
    const regions = mapRegions();
    let region = regions.hero;
    if (role === "monster" || role === "orb") region = regions.waves[Math.min(Number(index) || 0, regions.waves.length - 1)] || regions.waves[0];
    else if (role === "npc") region = regions.npc[p.role] ?? regions.npc.intro;
    else if (role === "boss") region = regions.boss;
    return Game.regionPoint(mapWorld(), region, p.x, p.y, 0.03);
  }

  function mapWalkable() {
    const map = state.level && state.level.map;
    const walkable = map && map.walkable;
    if (!walkable || typeof walkable !== "object") return null;
    const rects = Array.isArray(walkable.rects) ? walkable.rects.filter((r) => r && typeof r === "object") : [];
    const source = rects.length ? rects : [walkable];
    const valid = source.filter((r) => [r.x, r.y, r.w, r.h].every((v) => Number.isFinite(Number(v))));
    if (!valid.length) return null;
    const minX = Math.min(...valid.map((r) => Number(r.x)));
    const minY = Math.min(...valid.map((r) => Number(r.y)));
    const maxX = Math.max(...valid.map((r) => Number(r.x) + Number(r.w)));
    const maxY = Math.max(...valid.map((r) => Number(r.y) + Number(r.h)));
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  function clampWorld(x, y) {
    const m = 0.03 / mapWorld();
    const walkable = mapWalkable();
    const minX = walkable ? walkable.x + m : m;
    const minY = walkable ? walkable.y + m : m;
    const maxX = walkable ? walkable.x + walkable.w - m : 1 - m;
    const maxY = walkable ? walkable.y + walkable.h - m : 1 - m;
    return {
      x: Math.min(maxX, Math.max(minX, Number.isFinite(Number(x)) ? Number(x) : minX)),
      y: Math.min(maxY, Math.max(minY, Number.isFinite(Number(y)) ? Number(y) : minY)),
    };
  }

  function randomWalkablePoint() {
    const area = mapWalkable() || { x: 0.03, y: 0.03, w: 0.94, h: 0.94 };
    return clampWorld(area.x + area.w * (0.15 + Math.random() * 0.7), area.y + area.h * (0.15 + Math.random() * 0.7));
  }

  function placeAt(el, x, y) {
    el.style.left = `${(x * 100).toFixed(3)}%`;
    el.style.top = `${(y * 100).toFixed(3)}%`;
  }

  function tileCamera(focus, world) {
    const w = Math.max(1, Number(world) || 1);
    const vf = 1 / w;
    const fx = Math.min(0.999, Math.max(0, Number(focus && focus.x) || 0));
    const fy = Math.min(0.999, Math.max(0, Number(focus && focus.y) || 0));
    const col = Math.min(w - 1, Math.floor(fx / vf));
    const row = Math.min(w - 1, Math.floor(fy / vf));
    return { x: col * vf, y: row * vf };
  }

  // 边缘平滑跟随：主角在视口死区内自由移动，越出才推镜头；指数平滑不抖。
  // 实体坐标 = 全图归一化 [0,1]（placeAt 按整个世界元素的百分比定位）；
  // 一个视口占全图的 1/world，镜头（视口左上角）活动范围 = [0, 1 - 1/world]。
  function updateCamera(dtSec) {
    const world = mapWorld();
    const half = 0.5 / world;                    // 半个视口宽（全图归一化）
    const maxCam = Math.max(0, 1 - 1 / world);   // 镜头可滚动范围
    const tx = Math.max(0, Math.min(maxCam, state.hero.x - half));
    const ty = Math.max(0, Math.min(maxCam, state.hero.y - half));
    const dt = Math.max(0.001, Number(dtSec) || 0.016);
    const k = 1 - Math.exp(-dt / 0.10);
    state.camera.x += (tx - state.camera.x) * k;
    state.camera.y += (ty - state.camera.y) * k;
    els.world.style.transform = `translate3d(${(-state.camera.x * state.vw * world).toFixed(1)}px, ${(-state.camera.y * state.vh * world).toFixed(1)}px, 0)`;
  }

  /* ---------- 实体构建 ---------- */

  // 预载四方向 GIF：消除行走换向时首次解码造成的卡顿（移动流畅性关键）
  function precacheSprites() {
    const ids = [state.level.cast.hero && state.level.cast.hero.id,
      state.level.cast.boss && state.level.cast.boss.sprite]
      .concat((state.level.cast.minors || []).map((m) => m && m.sprite))
      .concat(state.npcs.map((n) => n.sprite))
      .filter(Boolean);
    const seen = new Set();
    ids.forEach((id) => {
      if (seen.has(id)) return;
      seen.add(id);
      const entry = state.sprites[id];
      if (!entry) return;
      const srcs = [];
      if (entry.walkGifs) srcs.push(...Object.values(entry.walkGifs));
      if (entry.gif) srcs.push(entry.gif);
      srcs.forEach((src) => {
        const img = new Image();
        img.src = assetUrl(src);
      });
    });
  }

  function buildEntities() {
    els.entities.textContent = "";
    const map = state.level.map || FALLBACK_MAP;

    const heroEl = document.createElement("div");
    heroEl.className = "game-entity is-hero";
    heroEl.id = "game-hero";
    const heroImg = makeImg(state.level.cast.hero.id, "south", "悟");
    heroEl.appendChild(heroImg);
    els.entities.appendChild(heroEl);
    state.hero.el = heroEl;
    state.hero.img = heroImg;
    const heroSpawn = map.heroSpawn || { x: 0.5, y: 0.58 };
    const spawn = mapPoint(heroSpawn, "hero");
    state.hero.x = spawn.x;
    state.hero.y = spawn.y;
    placeAt(heroEl, state.hero.x, state.hero.y);

    const waveMonsters = [];
    state.usedTerms = new Set();
    state.level.waves.forEach((wave, waveIndex) => {
      const authored = Core.buildWaveQuestions(state.level, waveIndex, state.wrongWords);
      const fallbackSprite = (authored[0] && authored[0].sprite)
        || (state.level.cast.minors[0] && state.level.cast.minors[0].id)
        || "imp";
      pickRunWords(authored, authored.length || 4).forEach((m) => {
        waveMonsters.push(Object.assign({ waveIndex, sprite: m.sprite || fallbackSprite }, m));
      });
    });
    state.monsters = waveMonsters.map((m, idx) => {
      const monster = Object.assign({}, m, {
        el: null, x: 0, y: 0, tx: 0, ty: 0, alive: true, active: false,
        img: null, dir: "south", idleUntil: 0, fleeUntil: 0, attackCd: 0, attackUntil: 0, windupUntil: 0, moving: false, pose: "idle", waveIndex: m.waveIndex, slotIndex: 0,
      });
      const el = document.createElement("button");
      el.type = "button";
      el.className = "game-entity is-monster";
      el.setAttribute("aria-label", `${m.term}`);
      const monsterImg = makeImg(m.sprite || "imp", monster.dir, m.zh);
      el.appendChild(monsterImg);
      const word = document.createElement("span");
      word.className = "game-word";
      word.textContent = m.term;
      el.appendChild(word);
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        onMonsterClick(monster);
      });
      els.entities.appendChild(el);
      monster.el = el;
      monster.img = monsterImg;
      monster.el.style.display = "none";
      return monster;
    });

    state.npcs = (map.npcSpots || []).map((spot, idx) => {
      const pos = mapPoint({
        ...spot,
        x: spot.x ?? (0.5 + (idx % 2 ? 0.16 : -0.18)),
        y: spot.y ?? 0.62,
      }, "npc");
      const npc = { role: spot.role, sprite: spot.sprite, nameZh: spot.nameZh || "", x: pos.x, y: pos.y, el: null, done: spot.role === "quiz" && state.npcDone };
      const el = document.createElement("button");
      el.type = "button";
      el.className = "game-entity is-npc";
      el.setAttribute("aria-label", `和${npc.nameZh || npc.role}对话`);
      el.appendChild(makeImg(npc.sprite, "south", npc.nameZh));
      const speech = document.createElement("span");
      speech.className = "game-speech";
      speech.textContent = npc.done ? "⭐" : (npc.role === "quiz" && !Game.canTalkQuizNpc(state.npcUnlocked) ? "…" : "💬");
      el.appendChild(speech);
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        openDialogue(npc);
      });
      els.entities.appendChild(el);
      npc.el = el;
      placeAt(el, npc.x, npc.y);
      return npc;
    });

    const boss = state.level.cast.boss;
    const bossLocal = map.bossSpot || { x: 0.5, y: 0.5 };
    const bossPos = mapPoint(bossLocal, "boss");
    const bossEl = document.createElement("button");
    bossEl.type = "button";
    bossEl.className = "game-entity is-bossspot is-locked";
    bossEl.setAttribute("aria-label", `挑战${boss.nameZh}`);
    const aura = document.createElement("span");
    aura.className = "game-boss-aura";
    aura.textContent = "⚔️";
    bossEl.appendChild(aura);
    bossEl.appendChild(makeImg(boss.sprite, "south", boss.nameZh));
    bossEl.addEventListener("click", (ev) => {
      ev.stopPropagation();
      openBossGate();
    });
    els.entities.appendChild(bossEl);
    placeAt(bossEl, bossPos.x, bossPos.y);
    state.bossSpot = { x: bossPos.x, y: bossPos.y, el: bossEl };

    // Every authored theme is a complete scene illustration.  Stretch it
    // once across the world and never tile a 1280×720 image into seams.
    const tiles = mapWorld();
    els.backdrop.style.backgroundSize = `${100 / tiles}% ${100 / tiles}%`;
    els.backdrop.style.backgroundRepeat = "repeat";
    els.backdrop.style.backgroundPosition = "0 0";
    const theme = (state.level.map && state.level.map.theme) || "";
    const epBg = `../assets/game-backgrounds/ep${EP}.jpg`;
    const themeBg = theme && theme !== "generic" ? `../assets/game-backgrounds/${theme}.jpg` : "";
    const illustration = state.level.background.illustration
      ? assetUrl(state.level.background.illustration)
      : "";
    els.backdrop.style.backgroundImage = `url("${epBg}")`;
    els.backdrop.addEventListener("error", () => {
      if (themeBg) {
        els.backdrop.style.backgroundImage = `url("${themeBg}")`;
        return;
      }
      els.backdrop.style.backgroundImage = illustration ? `url("${illustration}")` : "";
    }, { once: true });
  }

  /* ---------- 波次 ---------- */

  function spawnWave(waveIndex, silent) {
    if (state.playVerb === "word-banish" || state.phase === "pack1") return;
    state.waveIndex = waveIndex;
    state.mapStage = waveIndex === 0 ? "wave1" : "wave2";
    state.monsters.forEach((m) => {
      m.active = false;
      if (m.alive) m.el.style.display = "none";
    });
    const waveMonsters = state.monsters.filter((m) => m.waveIndex === waveIndex && m.alive);
    const mapSpawns = (state.level.map && Array.isArray(state.level.map.waveSpawns)
      ? state.level.map.waveSpawns[waveIndex]
      : state.level.map && state.level.map.monsterSpawns) || [];
    const rawSpawns = waveMonsters.map((m, idx) => {
      const slot = SLOT_MONSTERS[idx % SLOT_MONSTERS.length];
      const authored = mapSpawns[idx % Math.max(1, mapSpawns.length)] || { x: slot[0], y: slot[1] };
      return mapPoint(authored, "monster", waveIndex);
    });
    const spreadSpawns = Game.spreadPack(rawSpawns, SPAWN_GAP).map((p) => clampWorld(p.x, p.y));
    waveMonsters.forEach((m, idx) => {
      const pos = spreadSpawns[idx] || rawSpawns[idx];
      m.alive = true;
      m.active = true;
      m.slotIndex = idx;
      m.x = pos.x;
      m.y = pos.y;
      m.tx = pos.x;
      m.ty = pos.y;
      m.attackCd = 0;
      m.el.style.display = "";
      m.el.classList.remove("is-dead");
      // Spawn on the hero's right, so default south (¾ view) reads as "stuck facing right".
      m.moving = true;
      setMonsterDir(m, Game.directionFromDelta(state.hero.x - m.x, state.hero.y - m.y, "west"));
      placeAt(m.el, m.x, m.y);
    });
    // 地面词球：本波每只小怪的中文释义一颗
    els.projectiles.querySelectorAll(".game-orb").forEach((el) => el.remove());
    state.orbs = [];
    waveMonsters.forEach((m, idx) => {
      const slot = SLOT_ORBS[idx % SLOT_ORBS.length];
      const orb = { zh: m.zh, el: null, x: 0, y: 0 };
      const el = document.createElement("button");
      el.type = "button";
      el.className = "game-orb";
      el.innerHTML = `${pickupFruitHtml()}<span class="game-orb-tag">${m.zh}</span>`;
      bindPickupImage(el);
      el.setAttribute("aria-label", `捡起${state.pickup.nameZh || "仙桃"} ${m.zh}`);
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        walkTo(orb.x, orb.y);
      });
      els.projectiles.appendChild(el);
      orb.el = el;
      const orbSpawns = state.level.map && Array.isArray(state.level.map.orbSpawns)
        ? state.level.map.orbSpawns[waveIndex] || []
        : [];
      const authoredOrb = orbSpawns[idx] || { x: slot[0], y: slot[1] };
      let pos = mapPoint(authoredOrb, "orb", waveIndex);
      const monsterPos = { x: m.x, y: m.y };
      if (Math.hypot(pos.x - monsterPos.x, pos.y - monsterPos.y) < 0.08 * NU * 4) {
        pos = mapPoint({ x: slot[0], y: slot[1] }, "orb", waveIndex);
      }
      orb.x = pos.x;
      orb.y = pos.y;
      placeAt(el, orb.x, orb.y);
      state.orbs.push(orb);
    });
    persistProgress();
    syncListenRings(silent);
    if (!silent) {
      const theme = (state.level.map && state.level.map.theme) || "";
      showBanner(`第 ${waveIndex + 1} 波`, THEME_ZH[theme] || (state.level.title && state.level.title.zh) || state.level.title.en);
      window.BookPlayAudio?.sfx("start");
    }
    refreshQuizNpcLock();
    updateHud();
  }

  function clearListenRings() {
    (state.listenRings || []).forEach((ring) => {
      try { ring.el && ring.el.remove(); } catch (_) { /* detached */ }
    });
    state.listenRings = [];
  }

  function syncListenRings(silent) {
    clearListenRings();
    if (state.playVerb !== "listen-rings") return;
    const wave = aliveMonsters();
    state.listenRings = wave.map((monster) => {
      const el = document.createElement("div");
      el.className = "game-listen-ring";
      el.setAttribute("aria-hidden", "true");
      el.style.backgroundImage = `url("${assetUrl(FX.ring)}")`;
      els.entities.appendChild(el);
      const ring = {
        term: monster.term,
        x: monster.x,
        y: monster.y,
        collected: false,
        alive: true,
        el,
        monster,
      };
      placeAt(el, ring.x, ring.y);
      return ring;
    });
    const first = wave[0];
    if (first) {
      state.listenSpoken = Game.armListenSpoken(state.listenSpoken, first.term);
      speakTerm(first.term);
      if (!silent) showToast(`听！走进「${first.term}」的光环`, 2800);
    }
  }

  function updatePlotVfx() {
    const verb = state.playVerb;
    const zh = state.carried && state.carried.zh;
    const fanAim = verb === "fan-blow" && zh
      ? Game.chooseFanTarget(state.hero, aliveMonsters(), zh, state.hero.dir)
      : null;
    if (state.hero && state.hero.el) {
      const hot = verb === "fire-ward" && aliveMonsters().some((m) => Game.fireTooClose(verb, state.hero, m));
      state.hero.el.classList.toggle("is-too-close", hot);
    }
    state.monsters.forEach((monster) => {
      if (!monster.el) return;
      const live = Boolean(monster.alive && monster.active);
      monster.el.classList.toggle("is-burning", live && verb === "fire-ward" && Game.fireTooClose(verb, state.hero, monster));
      monster.el.classList.toggle("is-fan-aim", live && fanAim === monster);
    });
  }

  function updateListenRings() {
    if (state.playVerb !== "listen-rings") return;
    state.listenRings.forEach((ring) => {
      const monster = ring.monster;
      if (monster) {
        ring.x = monster.x;
        ring.y = monster.y;
        ring.alive = Boolean(monster.alive && monster.active);
        ring.collected = ring.collected || !monster.alive;
      }
      if (ring.el) {
        placeAt(ring.el, ring.x, ring.y);
        ring.el.classList.toggle("is-armed", Game.listenRingHits(state.listenSpoken, ring.term));
        ring.el.classList.toggle("is-collected", Boolean(ring.collected));
        ring.el.style.display = ring.alive && !ring.collected ? "" : "none";
      }
    });
    const hit = Game.chooseListenRing(state.listenRings, state.listenSpoken);
    if (!hit || hit.collected || !Game.listenRingWalkHit(state.hero, hit, ORB_PICKUP)) return;
    const monster = hit.monster;
    if (!monster || !monster.alive) return;
    hit.collected = true;
    window.BookPlayAudio?.sfx("correct");
    speakTerm(monster.term);
    const bonus = Game.onCorrectHit(state.buffs, state.shield);
    state.buffs = bonus.buffs;
    state.shield = bonus.shield;
    state.stars += 1;
    state.killed += 1;
    killMonster(monster);
    spawnBurst(monster);
    maybeDrop(monster);
    showToast(`听对了：${monster.term} · ${monster.zh}`, 1700);
    persistProgress();
    advanceWaveIfNeeded();
    const next = state.listenRings.find((ring) => !ring.collected && ring.alive !== false && ring.monster && ring.monster.alive);
    state.listenSpoken = Game.armListenSpoken(state.listenSpoken, next && next.term);
    if (next) speakTerm(next.term);
    updateHud();
  }

  function orbEl(orb) {
    return orb && orb.el;
  }

  function shuffleInPlace(list) {
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    return list;
  }

  function pickRunWords(preferred, count) {
    const used = state.usedTerms || new Set();
    state.usedTerms = used;
    const merged = [];
    const seen = new Set();
    const pool = (state.level && (state.level.sessionCards || state.level.previewWords)) || [];
    (preferred || []).concat(pool).forEach((word) => {
      if (!word || !word.term || !word.zh) return;
      const key = String(word.term).toLowerCase();
      if (seen.has(key) || used.has(key)) return;
      seen.add(key);
      merged.push(word);
    });
    shuffleInPlace(merged);
    const picked = merged.slice(0, Math.max(1, Number(count) || 4));
    if (!picked.length) return (preferred || []).slice(0, count);
    picked.forEach((word) => used.add(String(word.term).toLowerCase()));
    return picked;
  }

  function matchingMonster(zh) {
    return state.monsters.find((m) => m.alive && m.active && m.zh === zh) || null;
  }

  function walkTo(x, y) {
    const p = clampWorld(x, y);
    state.hero.tx = p.x;
    state.hero.ty = p.y;
  }

  function aliveMonsters() {
    return state.monsters.filter((m) => m.alive && m.active);
  }

  function currentWaveAlive() {
    return state.monsters.filter((m) => m.alive && m.active && m.waveIndex === state.waveIndex);
  }

  /* ---------- 主角移动 ---------- */

  function setHeroPose(pose) {
    state.hero.pose = pose;
    if (state.hero.el) {
      state.hero.el.dataset.pose = pose;
      state.hero.el.classList.toggle("is-walking", pose === "walk");
      state.hero.el.classList.toggle("is-attacking", pose === "attack");
    }
    setSpriteImage(state.hero.img, state.level.cast.hero.id, state.hero.dir, pose);
  }

  function setHeroDir(dir) {
    if (!dir) return;
    state.hero.dir = dir;
    setHeroPose(performance.now() < state.hero.attackUntil ? "attack" : (state.hero.moving ? "walk" : "idle"));
  }

  function setMonsterPose(monster, pose) {
    if (!monster) return;
    monster.pose = pose;
    if (monster.el) {
      monster.el.dataset.pose = pose;
      monster.el.classList.toggle("is-walking", pose === "walk");
      monster.el.classList.toggle("is-attacking", pose === "attack");
    }
    setSpriteImage(monster.img, monster.sprite || "imp", monster.dir, pose);
  }

  function setMonsterDir(monster, dir) {
    if (!monster || !dir) return;
    monster.dir = dir;
    setMonsterPose(monster, performance.now() < monster.attackUntil ? "attack" : (monster.moving ? "walk" : "idle"));
  }

  function moveHeroBy(dx, dy, dt) {
    const speed = Game.heroSpeed(HERO_SPEED, state.buffs, performance.now());
    const moved = Game.moveStepViewport(dx, dy, speed, dt / 1000, { width: state.vw, height: state.vh });
    if (!moved.moving) return;
    const next = clampWorld(state.hero.x + moved.dx, state.hero.y + moved.dy);
    if (moved.facing) setHeroDir(moved.facing);
    if (!state.hero.moving) spawnDust(state.hero.x, state.hero.y);
    state.hero.moving = true;
    state.hero.walkTick = (state.hero.walkTick || 0) + dt;
    if (state.hero.walkTick > 80) {
      state.hero.walkTick = 0;
      state.hero.walkFrame = ((state.hero.walkFrame || 0) + 1) % WUKONG_WALK_PNG.length;
    }
    setHeroPose("walk");
    state.hero.x = next.x;
    state.hero.y = next.y;
  }

  function updateHero(dt) {
    if (performance.now() < state.hero.attackUntil) return;
    let ix = state.intent.x;
    let iy = state.intent.y;
    if (ix || iy) {
      state.hero.tx = null;
      state.hero.ty = null;
      moveHeroBy(ix, iy, dt);
    } else if (state.hero.tx != null) {
      const dx = state.hero.tx - state.hero.x;
      const dy = state.hero.ty - state.hero.y;
      const dist = Math.hypot(dx, dy);
      if (dist < TARGET_STOP) {
        state.hero.tx = null;
        state.hero.ty = null;
        state.hero.moving = false;
        setHeroPose("idle");
      } else {
        moveHeroBy(dx / dist, dy / dist, dt);
      }
    } else {
      state.hero.moving = false;
      setHeroPose("idle");
    }
    if (!state.hero.moving) setHeroPose("idle");
    placeAt(state.hero.el, state.hero.x, state.hero.y);
  }

  /* ---------- 小怪 AI（游荡/追击/撞击，对照 word-memory-map） ---------- */

  function updateMonsters(dt, now) {
    const hero = state.hero;
    const live = state.monsters.filter((item) => item.alive && item.active);
    live.forEach((m) => {
      if (now < m.attackUntil) {
        m.moving = false;
        placeAt(m.el, m.x, m.y);
        return;
      }
      if (m.windupUntil && now < m.windupUntil) {
        m.moving = false;
        setMonsterPose(m, "attack");
        placeAt(m.el, m.x, m.y);
        return;
      }
      if (m.windupUntil && now >= m.windupUntil) {
        m.windupUntil = 0;
        if (m.el) m.el.classList.remove("is-winding");
        const stillClose = Math.hypot(hero.x - m.x, hero.y - m.y) <= ATTACK_DIST * 1.35;
        if (stillClose && !state.locked) monsterAttack(m);
        else setMonsterPose(m, "idle");
        placeAt(m.el, m.x, m.y);
        return;
      }
      const heroDist = Math.hypot(hero.x - m.x, hero.y - m.y);
      const intent = Game.monsterIntent(heroDist, AGGRO_DIST, now < m.fleeUntil);
      let speed = Game.monsterSpeed(MONSTER_WANDER, state.buffs, now);
      let gx = m.tx;
      let gy = m.ty;
      if (intent === "flee") {
        speed = Game.monsterSpeed(MONSTER_CHASE * Game.MONSTER_AI.fleeMult, state.buffs, now);
        const away = clampWorld(m.x - (hero.x - m.x), m.y - (hero.y - m.y));
        gx = away.x;
        gy = away.y;
      } else if (intent === "chase") {
        // Living minions walk toward a unique slot around the hero, then
        // push apart so the pack does not collapse into one pile.
        speed = Game.monsterSpeed(MONSTER_CHASE, state.buffs, now);
        const slot = Number.isFinite(Number(m.slotIndex)) ? m.slotIndex : live.indexOf(m);
        const anchor = Game.chaseAnchor(hero, m, slot, live.length, KEEP_DIST);
        const sep = Game.packSeparation(m, live, PACK_GAP);
        gx = anchor.x + sep.x * PACK_GAP;
        gy = anchor.y + sep.y * PACK_GAP;
        if (Game.canStartMelee(now, heroDist, ATTACK_DIST, m.attackCd, hero.invulnUntil, state.locked)) {
          m.windupUntil = now + Game.MONSTER_AI.windupMs;
          m.attackCd = now + ATTACK_CD;
          m.moving = false;
          setMonsterPose(m, "attack");
          if (m.el) m.el.classList.add("is-winding");
          placeAt(m.el, m.x, m.y);
          return;
        }
      } else {
        if (!Number.isFinite(gx) || !Number.isFinite(gy)) {
          const spot = randomWalkablePoint();
          m.tx = spot.x;
          m.ty = spot.y;
          gx = spot.x;
          gy = spot.y;
        }
      }
      const dx = gx - m.x;
      const dy = gy - m.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.002) {
        // Joystick intent is -1..1. Passing raw world deltas (< 1 on one screen)
        // made minions crawl and look frozen, with facing stuck on east.
        const moved = Game.moveStepViewport(dx / dist, dy / dist, speed, dt / 1000, { width: state.vw, height: state.vh });
        const next = clampWorld(m.x + moved.dx, m.y + moved.dy);
        m.x = next.x;
        m.y = next.y;
        m.moving = true;
        setMonsterDir(m, moved.facing || Game.directionFromDelta(dx, dy, m.dir));
      } else if (!m.fleeUntil || now >= m.fleeUntil) {
        m.moving = false;
        setMonsterDir(m, Game.directionFromDelta(hero.x - m.x, hero.y - m.y, m.dir));
        setMonsterPose(m, "idle");
        if (!m.idleUntil) {
          m.idleUntil = now + 1200 + Math.random() * 900;
        } else if (now >= m.idleUntil) {
          m.idleUntil = 0;
          const spot = randomWalkablePoint();
          m.tx = spot.x;
          m.ty = spot.y;
        }
      }
      placeAt(m.el, m.x, m.y);
    });
  }

  function monsterAttack(monster) {
    const hit = Game.absorbHit(state.items, state.shield);
    state.items = hit.items;
    state.combo.streak = 0;
    window.BookPlayAudio?.sfx("shield");
    monster.attackUntil = performance.now() + Game.MONSTER_AI.recoverMs;
    monster.moving = false;
    setMonsterPose(monster, "attack");
    const hero = state.hero;
    // P1 张力包：被撞会把手里的词球震落在原地，捡回要再跑一趟——有代价才有紧张感
    if (state.carried && state.playVerb !== "listen-rings") {
      const lostZh = state.carried.zh;
      dropOrbAt(hero.x, hero.y, null, 1600);
      showToast(`${state.pickup.nameZh || "仙桃"}掉了！「${lostZh}」散落在地上，快捡回来`, 2200);
    }
    const kb = Game.MONSTER_AI.knockback;
    const away = clampWorld(hero.x - (monster.x - hero.x) * kb, hero.y - (monster.y - hero.y) * kb);
    hero.x = away.x;
    hero.y = away.y;
    hero.invulnUntil = performance.now() + HERO_INVULN;
    if (hero.el) {
      setHeroPose("hurt");
      emitFx("hero-hurt", hero.el);
      spawnFx("shield", hero.x, hero.y);
      hero.el.classList.add("is-hurt", "is-invuln");
      window.setTimeout(() => {
        if (hero.el) hero.el.classList.remove("is-hurt");
        if (performance.now() >= hero.attackUntil) setHeroPose(hero.moving ? "walk" : "idle");
      }, 280);
      window.setTimeout(() => {
        if (hero.el && performance.now() >= hero.invulnUntil) hero.el.classList.remove("is-invuln");
      }, HERO_INVULN);
    }
    state.monsters.forEach((other) => {
      if (other.alive && other.active) {
        other.attackCd = Math.max(other.attackCd || 0, performance.now() + 1400);
      }
    });
    if (hit.absorbed) {
      renderSupports();
      updateHud();
      showToast("蟠桃挡了一下！护盾还在 🍑", 1500);
      return;
    }
    state.shield = hit.shield;
    updateHud();
    if (state.shield <= 0) {
      showToast("护盾碎了！小妖重新列阵，别灰心 💪", 2000);
      state.shield = 3;
      respawnCurrentWave();
    } else {
      showToast("被小妖打中了！躲开挥招，捡词球反击 ⚔️", 1600);
    }
  }

  function respawnCurrentWave() {
    const waveMonsters = state.monsters.filter((m) => m.waveIndex === state.waveIndex);
    const revived = waveMonsters.filter((m) => !m.alive).length;
    state.killed = Math.max(0, state.killed - revived);
    waveMonsters.forEach((m) => {
      state.defeatedKeys.delete(m.key);
      m.alive = true;
      m.el.classList.remove("is-dead");
    });
    state.carried = null;
    spawnWave(state.waveIndex, true);
    persistProgress();
    updateHud();
  }

  /* ---------- 词球：拾取 / 投掷 / 命中 ---------- */

  function updateOrbs() {
    if (state.carried) return;
    const now = performance.now();
    state.orbs.forEach((orb) => {
      if (orb.el && orb.el.style.display !== "none") {
        if (orb.pickGuardUntil && now < orb.pickGuardUntil) return; // 刚被撞掉的球：冷却中
        const d = Math.hypot(state.hero.x - orb.x, state.hero.y - orb.y);
        if (d < ORB_PICKUP) pickUp(orb);
      }
    });
  }

  function termForZh(zh) {
    const monster = state.monsters.find((item) => item.zh === zh && item.term);
    if (monster) return monster.term;
    const word = (state.level.previewWords || []).find((item) => item.zh === zh);
    return word && word.term || "";
  }

  function pickUp(orb) {
    if (state.playVerb === "word-banish" || state.phase === "pack1") return;
    state.hintUsedThisOrb = false;
    state.carried = { zh: orb.zh, term: termForZh(orb.zh), typed: "", wrong: "" };
    orb.el.style.display = "none";
    window.BookPlayAudio?.sfx("start");
    emitFx("pickup", orb.el, { zh: orb.zh });
    speakTerm(orb.zh, "zh");
    if (state.playVerb === "type-lock") showToast(`捡到${state.pickup.nameZh || "仙桃"}！跟打头顶英文才飞得出去`, 1800);
    else if (state.playVerb === "gourd-seek") showToast(`捡到${state.pickup.nameZh || "仙桃"}！葫芦会自己找对的英文小妖`, 1800);
    else if (state.playVerb === "fan-blow") showToast(`捡到${state.pickup.nameZh || "仙桃"}！朝小妖的方向扇，扇子会找对的英文`, 1800);
    else if (state.playVerb === "fire-ward") showToast(`捡到${state.pickup.nameZh || "仙桃"}！离火远一点再扔`, 1800);
    else showToast(`捡到${state.pickup.nameZh || "仙桃"}！扔向对应的英文小妖`, 1600);
    updateHud();
  }

  function onTypeCarried(key) {
    if (!state.carried || !state.carried.term) return;
    const next = Game.typingStep(state.carried, key, state.carried.term, true);
    state.carried.typed = next.typed;
    state.carried.wrong = next.wrong;
    if (next.status === "wrong") window.BookPlayAudio?.sfx("retry");
    updateHud();
    if (next.status === "complete") {
      speakTerm(state.carried.term, "en");
      const matched = state.monsters.find((m) => m.alive && m.active && m.zh === state.carried.zh);
      if (matched) throwOrb(matched);
      else showToast("打对了！点对应的英文小妖扔出去", 1600);
    }
  }

  function dropOrbAt(x, y, orbRef, guardMs) {
    // Once a shot is created state.carried is cleared, so a miss must use the
    // orb reference captured by that shot rather than searching the HUD state.
    const orb = orbRef || state.orbs.find((o) => state.carried && o.zh === state.carried.zh && o.el.style.display === "none");
    const pos = clampWorld(x, y);
    if (orb) {
      orb.x = pos.x;
      orb.y = pos.y;
      orb.el.style.display = "";
      // P1 张力包：被撞掉落的球有短暂拾取冷却——捡球半径远大于击退距离，
      // 无冷却会被秒捡回，"掉球代价"形同虚设。投掷落空（无 guardMs）不受影响。
      orb.pickGuardUntil = guardMs ? performance.now() + guardMs : 0;
      placeAt(orb.el, orb.x, orb.y);
    }
    state.carried = null;
    updateHud();
  }

  function previewWordOf(monster) {
    if (!monster) return null;
    return (state.level.previewWords || []).find((word) => word.term === monster.term) || monster;
  }

  function previewMonsterWord(monster) {
    if (state.locked || !monster || !monster.alive) return;
    const word = previewWordOf(monster);
    els.hintcard.textContent = "";
    if (word.illustration) {
      const img = document.createElement("img");
      img.src = assetUrl(word.illustration);
      img.alt = "";
      img.addEventListener("error", () => img.remove());
      els.hintcard.appendChild(img);
    }
    const body = document.createElement("div");
    const term = document.createElement("span");
    term.className = "game-hint-term";
    term.textContent = word.term;
    const zh = document.createElement("span");
    zh.className = "game-hint-zh";
    zh.textContent = state.carried
      ? `${word.zh}（头上顶着这个词的就是目标）`
      : `${word.zh} · 空手预习，捡中文球再扔`;
    body.append(term, zh);
    const hear = document.createElement("button");
    hear.type = "button";
    hear.textContent = "♪";
    hear.setAttribute("aria-label", `朗读 ${word.term}`);
    hear.tabIndex = 0;
    hear.addEventListener("click", () => {
      if (state.playVerb === "listen-rings") state.listenSpoken = Game.armListenSpoken(state.listenSpoken, word.term);
      speakTerm(word.term);
    });
    els.hintcard.append(body, hear);
    els.hintcard.hidden = false;
    if (state.playVerb === "listen-rings") state.listenSpoken = Game.armListenSpoken(state.listenSpoken, word.term);
    speakTerm(word.term);
    if (state.carried) state.hintUsedThisOrb = true;
    if (!state.carried) showToast(`预习：${word.term} · ${word.zh}`, 1800);
  }

  function onMonsterClick(monster) {
    if (state.locked || !monster.alive) return;
    if (!state.carried) {
      previewMonsterWord(monster);
      return;
    }
    throwOrb(monster);
  }

  function throwOrb(monster) {
    // 投掷不锁世界：小怪照常追击/游荡，追踪弹逐帧更新（对照 word-memory-map）
    // 点中谁飞向谁；词牌不对则弹回。紫金葫芦 / gourd-seek 才自动改瞄配对小妖。
    if (state.playVerb === "word-banish" || state.phase === "pack1") return;
    if (!state.carried) return;
    if (Game.throwLocked(state.playVerb, state.carried, state.carried.term)) {
      const goal = Game.typingTarget(state.carried.term);
      showToast(`跟打完「${goal}」才飞得出去`, 1800);
      renderTypePad();
      return;
    }
    const matched = matchingMonster(state.carried.zh);
    const aim = Game.seekAutoAim(state.playVerb, state.buffs);
    state.buffs = aim.buffs;
    let choice;
    if (state.playVerb === "fan-blow") {
      const blown = Game.chooseFanTarget(state.hero, aliveMonsters(), state.carried.zh, state.hero.dir);
      if (!blown) {
        showToast("转到小妖那边再扇芭蕉扇！", 1600);
        spawnFx("sweep", state.hero.x, state.hero.y, "is-wide");
        return;
      }
      choice = Game.chooseThrowTarget(monster, blown, true);
      spawnFx("sweep", state.hero.x, state.hero.y, "is-wide");
    } else {
      choice = Game.chooseThrowTarget(monster, matched, aim.armed);
    }
    const target = choice.target;
    if (!target || !target.alive) {
      showToast("场上没有对应的英文小妖", 1400);
      return;
    }
    if (Game.fireTooClose(state.playVerb, state.hero, target)) {
      showToast("火太近！先退开再扔！", 1700);
      spawnFx("shield", state.hero.x, state.hero.y);
      return;
    }
    if (!Game.wordTagHits(state.carried.zh, target.zh) && !choice.auto) {
      showToast("这个英文对不上，扔过去会弹回来！", 1500);
    }
    window.BookPlayAudio?.sfx("attack");
    if (state.hero.el) {
      state.hero.attackUntil = performance.now() + 620;
      state.hero.moving = false;
      setHeroPose("attack");
      state.hero.el.classList.add("is-throw");
      window.setTimeout(() => {
        if (!state.hero.el) return;
        state.hero.el.classList.remove("is-throw");
        if (performance.now() >= state.hero.attackUntil) setHeroPose(state.hero.moving ? "walk" : "idle");
      }, 620);
    }
    const thrownOrb = state.orbs.find((orb) => state.carried && orb.zh === state.carried.zh && orb.el.style.display === "none") || null;
    const shot = {
      zh: state.carried.zh,
      target,
      orb: thrownOrb,
      x: state.hero.x,
      y: state.hero.y - 0.04,
      age: 0,
      el: document.createElement("span"),
      trailTimer: 0,
    };
    shot.el.className = "game-shot";
    shot.el.innerHTML = pickupFruitHtml();
    bindPickupImage(shot.el);
    shot.el.setAttribute("aria-label", shot.zh);
    els.projectiles.appendChild(shot.el);
    placeAt(shot.el, shot.x, shot.y);
    state.shots.push(shot);
    state.carried = null;
    updateHud();
  }

  function updateShots(dt, now) {
    state.shots.forEach((shot) => {
      shot.age += dt / 1000;
      const target = shot.target;
      if (target && target.alive) {
        const dx = target.x - shot.x;
        const dy = target.y - shot.y;
        const dist = Math.hypot(dx, dy);
        const norm = dist || 1;
        const step = (dt / 1000) * SHOT_SPEED;
        shot.x += (dx / norm) * step;
        shot.y += (dy / norm) * step;
        if (shot.age >= SHOT_ARM && dist <= SHOT_HIT) {
          resolveShot(shot);
          return;
        }
      }
      if (shot.age >= SHOT_TTL) {
        settleMissedShot(shot);
        return;
      }
      shot.trailTimer += dt;
      if (shot.trailTimer > 60) {
        shot.trailTimer = 0;
        const ghost = document.createElement("span");
        ghost.className = "game-shot-trail";
        placeAt(ghost, shot.x, shot.y);
        els.particles.appendChild(ghost);
        window.setTimeout(() => ghost.remove(), 350);
      }
      placeAt(shot.el, shot.x, shot.y);
    });
    state.shots = state.shots.filter((shot) => !shot.done);
  }

  function removeShot(shot) {
    shot.done = true;
    shot.el.remove();
  }

  function resolveShot(shot) {
    const monster = shot.target;
    const verdict = Core.judgeHit({ zh: shot.zh }, monster, state.combo);
    removeShot(shot);
    if (verdict.correct) {
      window.BookPlayAudio?.sfx("correct");
      speakTerm(monster.term);
      const bonus = Game.onCorrectHit(state.buffs, state.shield);
      state.buffs = bonus.buffs;
      state.shield = bonus.shield;
      state.stars += 1;
      state.killed += 1;
      killMonster(monster);
      spawnBurst(monster);
      spawnFx("sparkle", monster.x, monster.y);
      emitFx("hit", monster.el, { term: monster.term, zh: monster.zh });
      if (verdict.comboReady) emitFx("combo", monster.el, { combo: verdict.combo ? verdict.combo + 2 : 3 });
      maybeDrop(monster);
      setHeroPose("celebrate");
      window.setTimeout(() => {
        if (performance.now() >= state.hero.attackUntil) setHeroPose(state.hero.moving ? "walk" : "idle");
      }, 420);
      showToast(`记住它：${monster.term} · ${monster.zh}`, 1700);
      if (verdict.comboReady) {
        spawnFx("sweep", state.hero.x, state.hero.y, "is-wide");
        spawnFx("stars", monster.x, monster.y);
        const rest = currentWaveAlive();
        rest.forEach((m) => {
          state.killed += 1;
          state.stars += 1;
          killMonster(m);
          spawnBurst(m);
        });
        if (rest.length) {
          window.BookPlayAudio?.sfx("reward");
          showToast("连击横扫！本波小妖全灭 ⚡", 1700);
        }
      }
      state.weakWords = Game.recordWeakAnswer(state.weakWords, monster.term, {
        correct: true,
        assisted: Boolean(state.hintUsedThisOrb),
      });
      state.hintUsedThisOrb = false;
      persistProgress();
      advanceWaveIfNeeded();
    } else {
      window.BookPlayAudio?.sfx("retry");
      state.wrongWords[monster.term] = (state.wrongWords[monster.term] || 0) + 1;
      state.weakWords = Game.recordWeakAnswer(state.weakWords, monster.term, { correct: false });
      state.hintUsedThisOrb = false;
      persistProgress();
      state.combo.streak = 0;
      monster.fleeUntil = performance.now() + 2400;
      monster.el.classList.add("is-wrong");
      spawnFx("bounce", monster.x, monster.y);
      emitFx("miss", monster.el);
      window.setTimeout(() => monster.el.classList.remove("is-wrong"), 900);
      dropOrbAt(shot.x, shot.y, shot.orb);
      showToast(`词球弹回来了！「${shot.zh}」对不上「${monster.term}」`, 1800);
    }
    updateHud();
  }

  function settleMissedShot(shot) {
    dropOrbAt(shot.x, shot.y, shot.orb);
    removeShot(shot);
    showToast("词球落地了，走过去捡起来再扔", 1500);
  }

  function killMonster(monster) {
    monster.alive = false;
    monster.active = false;
    state.defeatedKeys.add(monster.key);
    // 图鉴"曾遇见"标记（P1-6）：见到并打败即计入，捕捉仍由 Boss 战结算
    try {
      if (window.BookPlayCollectionCore && monster.sprite && state.dexJson) {
        const dexState = window.BookPlayCollectionCore.markSeen(readStore("bookplay_dex_v1"), monster.sprite);
        writeStore("bookplay_dex_v1", dexState);
      }
    } catch (_) { /* 图鉴标记失败不影响战斗 */ }
    monster.el.classList.add("is-dead");
    window.setTimeout(() => {
      monster.el.style.display = "none";
    }, 600);
  }

  function spawnFx(name, x, y, extraClass) {
    const src = FX[name];
    if (!src) return;
    const el = document.createElement("img");
    el.className = "game-fx-stamp" + (extraClass ? " " + extraClass : "");
    el.src = assetUrl(src);
    el.alt = "";
    el.setAttribute("aria-hidden", "true");
    placeAt(el, x, y);
    els.particles.appendChild(el);
    window.setTimeout(() => el.remove(), 700);
  }

  function spawnBurst(monster) {
    spawnFx("impact", monster.x, monster.y);
    spawnFx("shock", monster.x, monster.y, "is-wide");
    for (let i = 0; i < 4; i += 1) {
      const star = document.createElement("img");
      star.className = "game-star game-fx-stamp is-star";
      star.src = assetUrl(FX.burst);
      star.alt = "";
      placeAt(star, monster.x, monster.y);
      star.style.setProperty("--dx", `${(Math.random() - 0.5) * 130}px`);
      star.style.setProperty("--dy", `${-40 - Math.random() * 70}px`);
      els.particles.appendChild(star);
      window.setTimeout(() => star.remove(), 800);
    }
  }

  function maybeDrop(monster) {
    const type = Game.nextDropType(state.killed);
    const def = Game.SUPPORT_DEFS[type];
    const drop = { type, x: monster.x, y: monster.y, el: document.createElement("button") };
    drop.el.type = "button";
    drop.el.className = "game-support-drop";
    if (def.image) {
      const img = document.createElement("img");
      img.src = assetUrl(def.image);
      img.alt = "";
      img.draggable = false;
      drop.el.appendChild(img);
    } else {
      drop.el.textContent = def.icon;
    }
    drop.el.setAttribute("aria-label", `捡起${def.label}`);
    drop.el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      walkTo(drop.x, drop.y);
    });
    els.projectiles.appendChild(drop.el);
    placeAt(drop.el, drop.x, drop.y);
    state.supportDrops.push(drop);
    showToast(`${def.icon} 掉在地上了，走过去捡起来！`, 1500);
  }

  function updateSupportDrops() {
    state.supportDrops.forEach((drop) => {
      if (!drop.el || !drop.el.isConnected) return;
      if (Math.hypot(state.hero.x - drop.x, state.hero.y - drop.y) >= ORB_PICKUP) return;
      state.items = Game.addItem(state.items, drop.type);
      drop.el.remove();
      window.BookPlayAudio?.sfx("reward");
      showToast(Game.SUPPORT_DEFS[drop.type].toastPick, 1800);
      renderSupports();
      persistProgress();
    });
    state.supportDrops = state.supportDrops.filter((drop) => drop.el && drop.el.isConnected);
  }

  function renderSupports() {
    els.supports.textContent = "";
    Game.SUPPORT_IDS.forEach((id) => {
      const def = Game.SUPPORT_DEFS[id];
      const count = state.items[id];
      if (!count) return;
      const btn = document.createElement("button");
      btn.type = "button";
      if (def.image) {
        const img = document.createElement("img");
        img.src = assetUrl(def.image);
        img.alt = "";
        img.draggable = false;
        btn.appendChild(img);
      } else {
        btn.textContent = def.icon;
      }
      btn.dataset.count = String(count);
      btn.setAttribute("aria-label", def.label);
      btn.tabIndex = 0;
      btn.addEventListener("click", () => useSupport(id));
      els.supports.appendChild(btn);
    });
  }

  function useSupport(type) {
    if (state.locked) return;
    const used = Game.applySupportUse(state.items, state.buffs, type, performance.now(), state.shield);
    if (!used.used) return;
    state.items = used.items;
    state.buffs = used.buffs;
    state.shield = used.shield;
    window.BookPlayAudio?.sfx("reward");
    showToast(used.toast, 1400);
    if (used.effect === "hint") showMantraHint();
    renderSupports();
    updateHud();
  }

  function showMantraHint() {
    const hint = Game.consumeHint(state.buffs);
    state.buffs = hint.buffs;
    const carried = state.carried && state.carried.zh;
    const target = (carried
      ? state.monsters.find((m) => m.alive && m.zh === carried)
      : aliveMonsters()[0]) || aliveMonsters()[0];
    if (!target) {
      showToast("没有可提示的小妖了", 1400);
      return;
    }
    const letter = Game.hintLetter(target.term);
    showToast(`紧箍咒：目标单词以 ${letter} 开头`, 2000);
  }

  function refreshQuizNpcLock() {
    state.npcs.forEach((npc) => {
      if (npc.role !== "quiz" || !npc.el) return;
      const speech = npc.el.querySelector(".game-speech");
      if (speech && !npc.done) {
        speech.textContent = Game.canTalkQuizNpc(state.npcUnlocked) ? "💬" : "…";
      }
    });
  }

  function advanceWaveIfNeeded() {
    updateHud();
    if (currentWaveAlive().length) return;
    const nextStage = Game.nextMapStage(state.waveIndex, state.level.waves.length, state.npcDone);
    if (nextStage === "npc") {
      state.mapStage = "npc";
      state.npcUnlocked = true;
      refreshQuizNpcLock();
      persistProgress();
      showBanner("小妖已清", "去右边找剧情 NPC 答题");
      window.BookPlayAudio?.sfx("reward");
      showToast("找到头顶 💬 的 NPC，答题后开启下一片区域", 2600);
    } else if (nextStage === "next-wave") {
      window.setTimeout(() => spawnWave(state.waveIndex + 1), 500);
    } else if (!state.bossReady) {
      state.bossReady = true;
      state.mapStage = "boss";
      state.bossSpot.el.classList.remove("is-locked");
      state.bossSpot.el.classList.add("is-ready");
      persistProgress();
      showBanner("所有小妖肃清", `去挑战 ${state.level.cast.boss.nameZh}！`);
      window.BookPlayAudio?.sfx("reward");
      showToast("去右边找 Boss 决战吧！⚔️", 2600);
    }
  }

  /* ---------- NPC 对话（扁平游标 + choice 行） ---------- */

  function quizNpcWord() {
    const authored = state.level.npcDialogue && state.level.npcDialogue.quiz;
    const authoredWord = authored && authored.word;
    if (authoredWord && authoredWord.term && authoredWord.zh) {
      const matched = state.level.previewWords.find((word) => word.term.toLowerCase() === String(authoredWord.term).toLowerCase());
      return matched || authoredWord;
    }
    const wrongSorted = Object.entries(state.wrongWords)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    const term = wrongSorted.length ? wrongSorted[0][0] : (state.level.previewWords[0] || {}).term;
    return state.level.previewWords.find((w) => w.term === term) || state.level.previewWords[0] || null;
  }

  function authoredNpcLines(role) {
    const section = state.level.npcDialogue && state.level.npcDialogue[role];
    if (!section || !Array.isArray(section.lines)) return [];
    return section.lines
      .filter((line) => line && (line.textEn || line.textZh))
      .map((line) => Object.assign({ type: "dialogue" }, line));
  }

  function buildNpcLines(npc) {
    if (npc.role === "intro") {
      const authored = authoredNpcLines("intro");
      return authored.length ? authored : state.level.intro.map((line) => ({
        type: "dialogue",
        textEn: line.textEn,
        textZh: line.textZh,
        speaker: line.speaker || "narrator",
      }));
    }
    const authored = authoredNpcLines("quiz");
    const tauntArr = state.taunts[npc.sprite] || [];
    const taunt = tauntArr[0] || { en: "Let's practice one word!", zh: "来练一个词吧！" };
    const word = quizNpcWord();
    const opening = authored.length ? authored : [{
      type: "dialogue",
      textEn: taunt.en,
      textZh: taunt.zh,
      speaker: npc.nameZh || "NPC",
    }];
    const section = state.level.npcDialogue && state.level.npcDialogue.quiz;
    const question = section && section.question;
    const options = section && Array.isArray(section.options) ? section.options : [];
    return opening.concat([{
      type: "choice",
      word,
      question,
      options,
      lessonCardId: section && section.lessonCardId || "",
      sourceNodeId: question && question.id || "",
      audioRef: "",
    }]);
  }

  function openDialogue(npc) {
    if (state.locked || !npc) return;
    if (npc.role === "quiz" && !Game.canTalkQuizNpc(state.npcUnlocked)) {
      showToast("先把这一片的小妖打完，再来找我答题！", 1800);
      return;
    }
    if (npc.role === "quiz" && npc.done) {
      showToast(`${npc.nameZh || "NPC"}：你已经拿到我的词卡啦，去打 Boss 吧！`, 1800);
      return;
    }
    state.locked = true;
    setInputBlocked(true);
    state.dlg = { npc, lines: buildNpcLines(npc), idx: 0, retried: false, choiceResolved: false };
    els.dialogue.hidden = false;
    renderDialogueLine();
  }

  function renderDialogueLine() {
    const dlg = state.dlg;
    const line = dlg.lines[dlg.idx];
    if (els.dialogueKicker) {
      els.dialogueKicker.textContent = dlg.npc.role === "quiz" ? "小 Boss 问答" : "剧情";
    }
    const isNarration = line.type === "dialogue" && String(line.speaker || "narrator") === "narrator";
    els.dialogue.classList.toggle("is-narration", isNarration);
    els.dialogueName.textContent = isNarration ? "旁白" : (dlg.npc.nameZh || "NPC");
    const src = spriteSrc(dlg.npc.sprite);
    if (src) {
      els.dialogueFace.src = src;
      els.dialogueFace.style.display = "";
    } else {
      els.dialogueFace.style.display = "none";
    }
    els.dialogueChoices.textContent = "";
    // Keep evidence metadata on the rendered panel so an audio adapter can
    // resolve the authored clip without scraping visible text.
    els.dialogue.dataset.sourceNodeId = line.sourceNodeId || "";
    els.dialogue.dataset.audioRef = line.audioRef || "";
    if (els.dialogueReplay) els.dialogueReplay.hidden = !(line.textEn || line.textZh);
    els.dialogueNext.hidden = false;
    if (line.type === "dialogue") {
      els.dialogueEn.textContent = line.textEn;
      els.dialogueZh.textContent = line.textZh || "";
      if (line.audioRef || dlg.npc.role === "intro") speakDialogue(line);
      els.dialogueNext.textContent = dlg.idx + 1 >= dlg.lines.length ? "出发！⚔️" : "继续 ▼";
    } else {
      const word = line.word || state.level.previewWords[0];
      els.dialogueEn.textContent = line.question && line.question.textEn
        ? line.question.textEn
        : word.term + (word.ipa ? `  ${word.ipa}` : "");
      els.dialogueZh.textContent = line.question && line.question.textZh
        ? line.question.textZh
        : "它的意思是？";
      speakTerm(word.term);
      els.dialogueNext.hidden = true;
      const authored = Array.isArray(line.options) ? line.options.filter((opt) => opt && (opt.textZh || opt.textEn)) : [];
      if (authored.length >= 2) {
        authored.forEach((opt) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = opt.textZh || opt.textEn;
          btn.tabIndex = 0;
          btn.addEventListener("click", () => resolveNpcAuthoredChoice(opt, word, btn));
          els.dialogueChoices.appendChild(btn);
        });
      } else {
        const seed = state.level.seedBase + 800;
        const set = Core.buildOrbSet(word, state.level.previewWords, seed);
        set.orbs.forEach((orb) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = orb.zh;
          btn.tabIndex = 0;
          btn.addEventListener("click", () => resolveNpcChoice(orb, word, btn));
          els.dialogueChoices.appendChild(btn);
        });
      }
      const skip = document.createElement("button");
      skip.type = "button";
      skip.className = "battle-secondary";
      skip.textContent = "不会";
      skip.tabIndex = 0;
      skip.addEventListener("click", () => skipNpcChoice(word));
      els.dialogueChoices.appendChild(skip);
    }
  }

  function skipNpcChoice(word) {
    const dlg = state.dlg;
    if (!dlg || dlg.choiceResolved) return;
    state.weakWords = Game.recordWeakAnswer(state.weakWords, word && word.term, { skipped: true });
    persistWeak();
    const feedback = document.createElement("div");
    feedback.className = "game-feedback";
    feedback.textContent = "先跳过，这张不算错。";
    els.dialogueChoices.appendChild(feedback);
    completeQuizNpc(dlg.npc, false);
    els.dialogueNext.hidden = false;
    els.dialogueNext.textContent = "继续 ▼";
    dlg.choiceResolved = true;
    updateHud();
  }

  function resolveNpcAuthoredChoice(opt, word, btn) {
    const dlg = state.dlg;
    const correctLabel = (dlg.lines.find((line) => line.type === "choice") || {}).options
      ? ((dlg.lines.find((line) => line.type === "choice").options || []).find((item) => item.correct) || {}).textZh
        || ((dlg.lines.find((line) => line.type === "choice").options || []).find((item) => item.correct) || {}).textEn
        || (word && word.zh) || ""
      : (word && word.zh) || "";
    const verdict = { correct: Boolean(opt.correct), feedback: String(opt.feedback || "") };
    const fakeOrb = { zh: opt.textZh || opt.textEn, term: word && word.term };
    return resolveNpcChoice(fakeOrb, { term: word && word.term || "", zh: correctLabel }, btn, verdict);
  }

  function resolveNpcChoice(orb, word, btn, verdictOverride) {
    const dlg = state.dlg;
    const verdict = verdictOverride || Core.judgeHit(orb, { term: word.term, zh: word.zh }, { streak: 0 });
    const feedback = document.createElement("div");
    feedback.className = "game-feedback";
    if (verdict.correct) {
      state.weakWords = Game.recordWeakAnswer(state.weakWords, word && word.term, { correct: true });
      persistWeak();
      [...els.dialogueChoices.children].forEach((choice) => {
        if (choice.tagName === "BUTTON") choice.disabled = true;
        if (choice.textContent === word.zh) choice.classList.add("is-right");
      });
      window.BookPlayAudio?.sfx("correct");
      speakTerm(word.term);
      if (!dlg.npc.done) {
        state.stars += 2;
        completeQuizNpc(dlg.npc, true);
        window.BookPlayAudio?.sfx("reward");
        feedback.textContent = (verdict.feedback || "答对啦！奖励词卡 + ⭐⭐");
      } else {
        feedback.textContent = verdict.feedback || "答对啦！";
      }
      els.dialogueChoices.appendChild(feedback);
      els.dialogueNext.hidden = false;
      els.dialogueNext.textContent = "继续 ▼";
      dlg.choiceResolved = true;
    } else if (!dlg.retried) {
      dlg.retried = true;
      btn.disabled = true;
      btn.classList.add("is-wrong");
      window.BookPlayAudio?.sfx("retry");
      feedback.textContent = verdict.feedback || `再想一想～提示：${word.zh}（还可再试一次）`;
      els.dialogueChoices.appendChild(feedback);
    } else {
      btn.disabled = true;
      btn.classList.add("is-wrong");
      [...els.dialogueChoices.children].forEach((choice) => {
        if (choice.textContent === word.zh) choice.classList.add("is-right");
      });
      feedback.textContent = `正确答案是「${word.zh}」，跟着读一遍：${word.term}！`;
      els.dialogueChoices.appendChild(feedback);
      state.wrongWords[word.term] = (state.wrongWords[word.term] || 0) + 1;
      state.weakWords = Game.recordWeakAnswer(state.weakWords, word && word.term, { correct: false });
      persistWeak();
      completeQuizNpc(dlg.npc, false);
      els.dialogueNext.hidden = false;
      els.dialogueNext.textContent = "继续 ▼";
      dlg.choiceResolved = true;
    }
    updateHud();
  }

  function completeQuizNpc(npc, rewarded) {
    if (!npc || npc.done) return;
    npc.done = true;
    state.npcDone = true;
    state.npcBonus = state.npcBonus || Boolean(rewarded);
    const speech = npc.el && npc.el.querySelector(".game-speech");
    if (speech) speech.textContent = "⭐";
    const next = state.waveIndex + 1;
    if (state.monsters.some((m) => m.waveIndex === next && m.alive)) {
      state.pendingWave = next;
      state.mapStage = "wave2";
    }
    persistProgress();
  }

  function advanceDialogue() {
    const dlg = state.dlg;
    if (!dlg || els.dialogueNext.hidden) return;
    const line = dlg.lines[dlg.idx];
    if (!Game.canAdvanceDialogue(line, dlg.choiceResolved || line.type !== "choice")) return;
    stopGameAudio("next");
    dlg.idx += 1;
    dlg.choiceResolved = false;
    if (dlg.idx >= dlg.lines.length) {
      closeDialogue();
      return;
    }
    renderDialogueLine();
  }

  function closeDialogue() {
    const dlg = state.dlg;
    // A manually closed NPC panel must stop both static audio and TTS fallback
    // and release the modal input lock.  If the quiz was already answered,
    // continue the pending next wave so closing the sentence cannot strand the
    // run in a dead state.
    stopGameAudio("close");
    state.dlg = null;
    els.dialogue.hidden = true;
    state.locked = false;
    els.dialogueChoices.textContent = "";
    els.dialogueEn.textContent = "";
    els.dialogueZh.textContent = "";
    if (els.dialogueReplay) els.dialogueReplay.hidden = true;
    setInputBlocked(false);
    state.hero.moving = false;
    state.hero.tx = null;
    state.hero.ty = null;
    setHeroPose("idle");
    // advanceDialogue 在点「继续」时会先把 choiceResolved 清掉再 close。
    // 刷下一波只看答题已经完成（npcDone + pendingWave），避免卡在 NPC 门后。
    if (state.npcDone && state.pendingWave != null) {
      const next = state.pendingWave;
      state.pendingWave = null;
      spawnWave(next);
    }
  }

  /* ---------- Boss 门 ---------- */

  function openBossGate() {
    if (state.locked) return;
    if (Game.isMapRunComplete(state.mapStage)) {
      showCompletedRun();
      return;
    }
    const remaining = state.monsters.filter((m) => m.alive).length;
    if (!Game.canOpenBoss(remaining, state.npcDone)) {
      showToast(state.npcDone ? `还有 ${remaining} 只小妖，先清完再挑战 Boss` : "先完成 NPC 剧情答题，再挑战 Boss", 2000);
      return;
    }
    state.locked = true;
    setInputBlocked(true);
    const boss = state.level.cast.boss;
    els.bossgate.textContent = "";
    const title = document.createElement("h2");
    title.className = "battle-panel-title";
    title.textContent = `⚔️ 挑战 ${boss.nameZh}？`;
    const text = document.createElement("p");
    text.textContent = "小妖已经清完！Boss 血条会优先考本局错词。";
    const go = document.createElement("button");
    go.type = "button";
    go.className = "game-primary";
    go.tabIndex = 0;
    go.textContent = "开战！";
    go.addEventListener("click", () => {
      state.mapStage = "boss";
      persistProgress();
      const wrong = Object.keys(state.wrongWords).filter((term) => state.wrongWords[term] > 0).join(",");
      navigateGame(`battle.html?ep=${EP}&skip=intro,preview,waves,quiz&from=${FROM_LESSON ? "lesson" : "game"}${wrong ? `&wrong=${encodeURIComponent(wrong)}` : ""}`);
    });
    const later = document.createElement("button");
    later.type = "button";
    later.className = "battle-secondary";
    later.tabIndex = 0;
    later.textContent = "先逛逛";
    later.addEventListener("click", () => {
      els.bossgate.hidden = true;
      state.bossGateOpen = false;
      state.locked = false;
      setInputBlocked(false);
    });
    els.bossgate.append(title, text, go, later);
    els.bossgate.hidden = false;
    state.bossGateOpen = true;
  }

  /* ---------- HUD / 提示卡 / 面板 ---------- */

  function updateHud() {
    els.stars.textContent = String(state.stars);
    const total = state.monsters.length + state.level.boss.hpWords.length;
    els.progress.textContent = `${state.killed} / ${total}`;
    els.shields.textContent = "🛡️".repeat(state.shield) + "⬜".repeat(Math.max(0, 3 - state.shield));
    if (!state.carried) {
      els.carried.textContent = "空手";
    } else {
      const goal = Game.typingTarget(state.carried.term || "");
      const typed = state.carried.typed || "";
      const rest = "·".repeat(Math.max(0, goal.length - typed.length));
      els.carried.textContent = `${state.carried.zh}  ${typed}${state.carried.wrong || rest}`;
    }
    els.combo.textContent = String(state.combo.streak);
    refreshRoute();
    renderTypePad();
    updateTargetArrow();
  }

  function updateTargetArrow() {
    if (!els.particles) return;
    if (!state.targetArrow) {
      const img = document.createElement("img");
      img.className = "game-target-arrow";
      img.src = assetUrl(FX.arrow);
      img.alt = "";
      img.setAttribute("aria-hidden", "true");
      els.particles.appendChild(img);
      state.targetArrow = img;
    }
    const target = state.carried ? matchingMonster(state.carried.zh) : null;
    const show = Boolean(target && target.alive && target.active);
    state.targetArrow.hidden = !show;
    if (show) placeAt(state.targetArrow, target.x, target.y - 0.08);
  }

  function renderTypePad() {
    if (!els.typepad) return;
    const show = state.playVerb === "type-lock"
      && state.carried
      && state.carried.term
      && !Game.typingComplete(state.carried, state.carried.term);
    els.typepad.hidden = !show;
    if (!show) {
      els.typepad.textContent = "";
      delete els.typepad.dataset.sig;
      return;
    }
    const letters = Game.typePadLetters(state.carried, state.carried.term);
    const sig = `${state.carried.term}:${state.carried.typed || ""}:${letters.join("")}`;
    if (els.typepad.dataset.sig === sig) return;
    els.typepad.dataset.sig = sig;
    els.typepad.textContent = "";
    letters.forEach((letter) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "game-typekey";
      btn.textContent = letter;
      btn.setAttribute("aria-label", `输入 ${letter}`);
      btn.tabIndex = 0;
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        onTypeCarried(letter);
      });
      els.typepad.appendChild(btn);
    });
  }

  function refreshRoute() {
    if (!els.route) return;
    const stage = state.mapStage;
    const current = {
      wave1: stage === "wave1",
      npc: stage === "npc" || stage === "wave2",
      boss: stage === "boss" || stage === "complete",
    };
    els.route.querySelectorAll("[data-stop]").forEach((node) => {
      const stop = node.dataset.stop;
      node.classList.toggle("is-current", Boolean(current[stop]));
      node.classList.toggle("is-done",
        (stop === "wave1" && state.npcUnlocked)
        || (stop === "npc" && state.npcDone)
        || (stop === "boss" && stage === "complete"));
      node.classList.toggle("is-locked",
        (stop === "npc" && !state.npcUnlocked)
        || (stop === "boss" && !state.bossReady && stage !== "complete"));
    });
  }

  function onRouteStop(stop) {
    if (stop === "npc") {
      const npc = state.npcs.find((item) => item.role === "quiz");
      if (!npc) return;
      if (!Game.canTalkQuizNpc(state.npcUnlocked)) {
        showToast("先把这一片的小妖打完，再去问答站", 1600);
        return;
      }
      walkTo(npc.x, npc.y);
      return;
    }
    if (stop === "boss") {
      const remaining = state.monsters.filter((item) => item.alive).length;
      if (!state.bossReady && !Game.canOpenBoss(remaining, state.npcDone)) {
        showToast("先完成问答，再去大战", 1600);
        return;
      }
      if (state.bossSpot) walkTo(state.bossSpot.x, state.bossSpot.y);
    }
  }

  function showBanner(kicker, title) {
    els.bannerKicker.textContent = kicker;
    els.bannerTitle.textContent = title;
    els.banner.hidden = false;
    window.clearTimeout(showBanner.timer);
    showBanner.timer = window.setTimeout(() => {
      els.banner.hidden = true;
    }, 2200);
  }

  function toggleHintCard() {
    if (!els.hintcard.hidden) {
      els.hintcard.hidden = true;
      return;
    }
    const alive = aliveMonsters();
    if (!alive.length) {
      showToast("小妖都清完啦，去挑战 Boss！", 1600);
      return;
    }
    previewMonsterWord(alive[Math.floor(Math.random() * alive.length)]);
  }

  function showGate(message) {
    setInputBlocked(true);
    els.gate.textContent = "";
    const title = document.createElement("h2");
    title.className = "battle-panel-title";
    title.textContent = "还没准备好";
    const text = document.createElement("p");
    text.textContent = message;
    const back = document.createElement("button");
    back.type = "button";
    back.className = "game-primary";
    back.tabIndex = 0;
    back.textContent = FROM_LESSON ? "回课堂" : "回地图";
    back.addEventListener("click", () => navigateGame(leaveUrl()));
    els.gate.append(title, text, back);
    els.gate.hidden = false;
  }

  function deactivateAllMonsters() {
    state.monsters.forEach((monster) => {
      monster.active = false;
      monster.el.style.display = "none";
    });
    els.projectiles.querySelectorAll(".game-orb").forEach((el) => el.remove());
    state.orbs = [];
    clearListenRings();
  }

  function restoreMapRun(prev) {
    state.defeatedKeys = new Set(Array.isArray(prev.mapDefeatedKeys) ? prev.mapDefeatedKeys : []);
    state.killed = Math.max(0, Number(prev.mapKilled) || 0);
    state.stars = Math.max(0, Number(prev.mapStars) || 0);
    state.shield = Math.max(1, Math.min(3, Number(prev.mapShield) || 3));
    state.items = Object.assign(Game.emptyItems(), prev.mapItems || {});
    state.npcDone = Boolean(prev.npcDone);
    state.npcBonus = Boolean(prev.npcBonus);
    state.npcUnlocked = Boolean(prev.npcUnlocked || state.npcDone || prev.mapStage === "npc");
    state.mapStage = ["wave1", "npc", "wave2", "boss", "complete"].includes(prev.mapStage) ? prev.mapStage : "wave1";
    state.monsters.forEach((monster) => {
      if (!state.defeatedKeys.has(monster.key)) return;
      monster.alive = false;
      monster.active = false;
      monster.el.style.display = "none";
      monster.el.classList.add("is-dead");
    });
    state.npcs.forEach((npc) => {
      if (npc.role !== "quiz") return;
      npc.done = state.npcDone;
      const speech = npc.el.querySelector(".game-speech");
      if (speech) speech.textContent = npc.done ? "⭐" : (state.npcUnlocked ? "💬" : "…");
    });
    if (state.mapStage === "wave2") {
      spawnWave(Math.min(1, state.level.waves.length - 1), true);
    } else if (state.mapStage === "npc") {
      state.waveIndex = 0;
      deactivateAllMonsters();
      refreshQuizNpcLock();
    } else if (state.mapStage === "boss" || state.mapStage === "complete") {
      deactivateAllMonsters();
      state.waveIndex = Math.max(0, state.level.waves.length - 1);
      state.bossReady = true;
      state.bossSpot.el.classList.remove("is-locked");
      state.bossSpot.el.classList.add("is-ready");
    } else {
      spawnWave(0, true);
    }
  }

  function showCompletedRun() {
    setInputBlocked(true);
    els.gate.textContent = "";
    const title = document.createElement("h2");
    title.className = "battle-panel-title";
    title.textContent = `🏆 ${state.level.cast.boss.nameZh} 已击败`;
    const text = document.createElement("p");
    text.textContent = "本集降妖完成，学习和战斗结果已经保存。还可以在地图上逛一逛。";
    const wander = document.createElement("button");
    wander.type = "button";
    wander.className = "game-primary";
    wander.textContent = "继续逛地图";
    wander.addEventListener("click", () => {
      els.gate.hidden = true;
      els.gate.textContent = "";
      setInputBlocked(false);
      state.locked = false;
    });
    const back = document.createElement("button");
    back.type = "button";
    back.className = "battle-secondary";
    back.textContent = FROM_LESSON ? "回课堂" : "返回绘本地图";
    back.addEventListener("click", () => navigateGame(leaveUrl()));
    const replay = document.createElement("button");
    replay.type = "button";
    replay.className = "battle-secondary";
    replay.textContent = "重新游玩本集";
    replay.addEventListener("click", () => {
      const progress = readStore(KEY_PROGRESS);
      progress[EP] = Object.assign({}, progress[EP] || {}, {
        mapStage: "wave1", mapWaveIndex: 0, mapKilled: 0, mapStars: 0, mapShield: 3,
        mapDefeatedKeys: [], mapItems: Game.emptyItems(), npcDone: false, npcBonus: false, npcUnlocked: false,
      });
      writeStore(KEY_PROGRESS, progress);
      stopGameAudio("navigation");
      window.location.reload();
    });
    els.gate.append(title, text, wander, back, replay);
    els.gate.hidden = false;
  }

  /* ---------- 输入 ---------- */

  function nearestEntity() {
    let best = null;
    let bestDist = INTERACT_DIST;
    const check = (x, y) => Math.hypot(state.hero.x - x, state.hero.y - y);
    state.monsters.forEach((m) => {
      if (!m.alive || !m.active) return;
      const d = check(m.x, m.y);
      if (d < bestDist) { best = { kind: "monster", ref: m }; bestDist = d; }
    });
    state.npcs.forEach((n) => {
      const d = check(n.x, n.y);
      if (d < bestDist) { best = { kind: "npc", ref: n }; bestDist = d; }
    });
    if (state.bossSpot) {
      const d = check(state.bossSpot.x, state.bossSpot.y);
      if (d < bestDist) { best = { kind: "boss", ref: state.bossSpot }; bestDist = d; }
    }
    return best;
  }

  function bindInput() {
    window.BookPlayDirectionalInputActive = () => state.phase === "explore" && !state.locked && !state.paused;
    document.addEventListener("pointerdown", kickVoice, true);
    document.addEventListener("keydown", kickVoice, true);
    els.scene.addEventListener("click", () => { /* 世界点击交给实体；空白处不移动（摇杆/方向键负责） */ });

    els.hint.addEventListener("click", toggleHintCard);
    if (els.route) {
      els.route.querySelectorAll("[data-stop]").forEach((node) => {
        node.addEventListener("click", () => onRouteStop(node.dataset.stop));
      });
    }
    els.exit.addEventListener("click", togglePause);
    $("game-resume").addEventListener("click", togglePause);
    $("game-restart").addEventListener("click", () => {
      stopGameAudio("navigation");
      window.location.reload();
    });
    $("game-map").addEventListener("click", () => {
      navigateGame(leaveUrl());
    });
    if (FROM_LESSON) $("game-map").textContent = "回课堂";
    els.dialogueNext.addEventListener("click", advanceDialogue);
    els.dialogueClose?.addEventListener("click", closeDialogue);
    els.dialogueReplay?.addEventListener("click", () => {
      const line = state.dlg && state.dlg.lines[state.dlg.idx];
      if (!line) return;
      const last = state.audio?.getState?.().lastRequest;
      const expectedRef = line.audioRef || `dialogue:${line.id || "line"}:en`;
      const lastRef = typeof last === "string" ? last : last && (last.ref || last.audioRef || last.id);
      if (state.audio && lastRef === expectedRef) state.audio.replay();
      else speakDialogue(line);
    });

    // 输入适配器：键盘 + 摇杆统一意图；Enter=交互、Esc=暂停；弹层打开时意图清零
    state.input = window.BookPlayGameInput.create({
      joystick: els.joystick,
      stick: els.stick,
      deadZone: 0.14,
      blocked: () => state.locked || state.paused || state.phase !== "explore",
      typingMode: () => Boolean(state.carried && state.carried.term),
      onType: onTypeCarried,
      onIntent: (ix, iy) => {
        state.intent.x = ix;
        state.intent.y = iy;
      },
      onAction: () => {
        const near = nearestEntity();
        if (near && near.kind === "monster" && state.carried) throwOrb(near.ref);
        else if (near && near.kind === "monster") previewMonsterWord(near.ref);
        if (near && near.kind === "npc") openDialogue(near.ref);
        if (near && near.kind === "boss") openBossGate();
      },
      onPause: () => {
        if (state.dlg) closeDialogue();
        else togglePause();
      },
    });

    window.addEventListener("resize", () => {
      state.vw = window.innerWidth;
      state.vh = window.innerHeight;
      updateCamera(0);
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopGameAudio("hidden");
    });
    window.addEventListener("pagehide", () => stopGameAudio("pagehide"));
  }

  function togglePause() {
    if (state.phase !== "explore") return;
    state.paused = !state.paused;
    setInputBlocked(state.paused);
    if (state.paused) stopGameAudio("pause");
    els.pause.hidden = !state.paused;
  }

  /* ---------- 主循环 ---------- */

  function step(now) {
    const dt = Math.min(48, now - (state.lastTs || now));
    state.lastTs = now;
    if (state.phase !== "explore") return;
    if (state.paused) return;
    if (document.hidden && !state.ignoreHidden) {
      state.lastTs = now;
      return;
    }
    if (state.locked) {
      // Keep minions walking during dialogue/modals. Freezing the whole
      // loop left them on default south, which reads as "stuck facing right".
      updateMonsters(dt, now);
      return;
    }
    updateHero(dt);
    updateOrbs();          // 先判定拾取：避免小怪撞击的击退把主角推离词球
    updateSupportDrops();
    updateMonsters(dt, now);
    updateShots(dt, now);
    updateListenRings();
    updatePlotVfx();
    updateProximity(now);
    updateCamera(dt / 1000);
  }

  function frame(ts) {
    step(ts);
    state.raf = window.requestAnimationFrame(frame);
  }

  function updateProximity(now) {
    if (state.bossSpot) {
      const d = Math.hypot(state.hero.x - state.bossSpot.x, state.hero.y - state.bossSpot.y);
      const near = d < INTERACT_DIST;
      if (near && state.bossReady && !state.bossGateOpen && !state.bossNear) openBossGate();
      state.bossNear = near;
    }
    if (false && Game.shouldAutoIntro(FROM_BATTLE, state.introAutoPlayed)) { // 禁用自动剧情：玩家自己点 NPC
      const introNpc = state.npcs.find((n) => n.role === "intro");
      if (introNpc) {
        const d = Math.hypot(state.hero.x - introNpc.x, state.hero.y - introNpc.y);
        if (d < INTERACT_DIST + 0.04) {
          state.introAutoPlayed = true;
          openDialogue(introNpc);
        }
      }
    }
  }

  /* ---------- 启动 ---------- */

  function boot() {
    bindInput();
    Promise.all([
      fetchJSON(`../data/game/levels/ep${EP}.json`),
      fetchJSON("../data/game/sprites.json").catch(() => null),
      fetchJSON("../data/game/taunts.json").catch(() => ({})),
      fetchJSON("../data/game/pickups.json").catch(() => null),
      fetchJSON("../data/game/dex.json").catch(() => null),
      fetchJSON(`../data/game/audio/ep${EP}.json`).catch(() => null),
    ]).then(([rawLevel, registry, taunts, pickups, dexJson, audioIndex]) => {
      if (!rawLevel) {
        showGate(`第 ${EP} 集的地图还没解锁，先去读一读这一集的故事吧！`);
        return;
      }
      const level = Core.buildLevel(rawLevel);
      if (!level) {
        showGate("这一集的关卡数据不完整，请重新生成数据包。");
        return;
      }
      state.level = level;
      state.playVerb = Game.resolvePlayVerb(rawLevel);
      state.sprites = Core.loadSprites(registry || null, level.spriteIds);
      state.pickup = Game.resolvePickup(pickups, EP);
      state.dexJson = dexJson || null;
      if (level.pickup && typeof level.pickup === "object") {
        state.pickup = Object.assign({}, state.pickup, level.pickup);
      }
      state.taunts = taunts && typeof taunts === "object" ? taunts : {};
      if (window.BookPlayGameAudio) {
        state.audio = window.BookPlayGameAudio.createGameAudio({
          episode: EP,
          audioIndex: audioIndex || {},
          onState: (status, meta) => {
            if (status === "unavailable" && state.dlg && meta && meta.text) {
              els.dialogue.dataset.audioState = "unavailable";
            }
          },
        });
      }
      const progress = readStore(KEY_PROGRESS);
      const prev = progress[EP] || {};
      Object.entries(prev.wrongWords || {}).forEach(([term, count]) => {
        state.wrongWords[term] = count;
      });
      const weakAll = readStore(KEY_WEAK);
      state.weakWords = weakAll[String(EP)] && typeof weakAll[String(EP)] === "object" ? weakAll[String(EP)] : {};
      state.level = freezeLevel(level, state.wrongWords);
      state.npcBonus = Boolean(prev.npcBonus);
      state.npcDone = Boolean(prev.npcDone);
      if (window.BookPlayXiyouPack1 && window.BookPlayXiyouPack1.isDefaultPath(EP, params)) {
        state.playVerb = "word-banish";
        state.phase = "pack1";
        els.world.style.width = "100%";
        els.world.style.height = "100%";
        els.backdrop.style.backgroundSize = "cover";
        els.backdrop.style.backgroundRepeat = "no-repeat";
        els.backdrop.style.backgroundPosition = "center";
        const packBg = state.level.background && state.level.background.illustration
          ? assetUrl(state.level.background.illustration)
          : `../assets/game-backgrounds/ep${EP}.jpg`;
        els.backdrop.style.backgroundImage = packBg ? `url("${packBg}")` : "";
        window.BookPlayGameDebug = state;
        window.BookPlayXiyouPack1.start({
          ep: EP,
          fromLesson: FROM_LESSON,
          leaveUrl: leaveUrl(),
          level: state.level,
          sprites: state.sprites,
          audio: state.audio,
          weakState: state,
          persistWeak,
          readStore,
          writeStore,
          speakTerm,
        });
        return;
      }
      recomputeTuning(); // 关卡可能声明单屏(worldTiles=1)或更大的世界：速度/距离按"视口宽"重算
      buildEntities();
      restoreMapRun(prev);
      precacheSprites();
          // 世界尺寸与背景分块按关卡 map.worldTiles 设置；旧数据仍回退 4×4。
          const world = mapWorld();
          els.world.style.width = (world * 100) + "%";
          els.world.style.height = (world * 100) + "%";
          // Tile the authored scene once per viewport so a 4×4 world is
          // 16 playable screens, each showing the full illustration.
          els.backdrop.style.backgroundSize = `${100 / world}% ${100 / world}%`;
          els.backdrop.style.backgroundRepeat = "repeat";
          state.camera = tileCamera(state.hero, world);
      updateCamera();
      updateHud();
      renderSupports();
      state.phase = "explore";
      state.lastTs = performance.now();
      state.raf = window.requestAnimationFrame(frame);
      window.setInterval(() => {
        if (performance.now() - state.lastTs > 320) step(performance.now());
      }, 320);
      window.BookPlayGameDebug = state;
      window.BookPlayGameDebug.step = step;
      if (state.mapStage === "complete") {
        showBanner("已完成", `${state.level.title.zh || state.level.title.en} · 可以继续逛`);
        showToast("本集已完成，可以继续逛。点 Boss 区看结算。", 2800);
      } else {
        showBanner("出发！", `${state.level.title.zh || state.level.title.en} · ${THEME_ZH[(state.level.map || {}).theme] || ""}`);
        if (FROM_BATTLE) showToast("战斗归来！进度已经恢复 🗺️", 2000);
        else if (state.playVerb === "listen-rings") showToast("听英文，走进发光的词环！也可以捡中文球扔配对小妖。", 4200);
        else if (state.playVerb === "type-lock") showToast("捡中文球，跟打头顶英文才飞得出去！", 4200);
        else if (state.playVerb === "gourd-seek") showToast("紫金葫芦篇：扔出去会自己找对的英文小妖。", 4200);
        else if (state.playVerb === "fan-blow") showToast("芭蕉扇篇：对着小妖的方向扇，会吹中配对的英文。", 4200);
        else if (state.playVerb === "fire-ward") showToast("三昧真火：离小妖远一点再扔，别烫着！", 4200);
        else if (FROM_LESSON) showToast("巩固过的词就在地图上，捡起来扔对应的小妖！", 4200);
        else showToast("走过中文词球捡起来，点头顶有对应英文的小妖！", 4200);
      }
    });
  }

  boot();
}());
