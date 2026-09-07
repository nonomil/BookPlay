"use strict";

/* 降妖记·大地图（word-memory-map 同款玩法移植）：
 * 3×3 平铺大世界 + 镜头跟随；主角八方向自由行走（方向键/摇杆）；
 * 小怪头顶英文单词、会追踪并撞击主角；地面刷中文词球，走过捡起、
 * 点对小怪投掷（追踪弹）；答对爆碎掉星/掉道具，答错词球弹回；
 * 支援道具（蟠桃回盾/芭蕉扇横扫）；区域横幅推进波次；
 * NPC 剧情对话答题（pixel-story 式游标）；Boss 区跳转 battle.html 对战。
 * 移动内核与实体渲染方式对照 word-memory-map：世界坐标 → 百分比定位，
 * rAF 逐帧只改 left/top 与镜头 translate3d，不重建 DOM。
 * 纯逻辑复用 battle-core；存储键：bookplay_battle_progress_v1 / bookplay_battle_collection_v1。
 */
(function () {
  const Core = window.BookPlayBattleCore;

  const params = new URLSearchParams(window.location.search);
  const EP = Math.max(1, Number(params.get("ep")) || 1);
  const DEBUG = params.get("debug") === "1";
  const FROM_BATTLE = params.get("from") === "battle";

  const KEY_PROGRESS = "bookplay_battle_progress_v1";
  const KEY_COLLECTION = "bookplay_battle_collection_v1";

  const WORLD = 3;                 // 世界 = 3×3 个视口
  const HERO_SPEED = 0.92;         // 视口单位/秒
  const MONSTER_WANDER = 0.22;
  const MONSTER_CHASE = 0.5;
  const AGGRO_DIST = 0.55;
  const KEEP_DIST = 0.17;
  const ATTACK_DIST = 0.075;
  const ATTACK_CD = 1800;
  const HERO_INVULN = 900;
  const ORB_PICKUP = 0.11;
  const SHOT_SPEED = 1.75;
  const SHOT_ARM = 0.12;
  const SHOT_HIT = 0.07;
  const SHOT_TTL = 2.2;
  const INTERACT_DIST = 0.14;

  const THEME_ZH = {
    "flower-fruit-mountain": "花果山",
    "water-curtain-cave": "水帘洞",
    "three-star-cave": "斜月三星洞",
    "water-dirty-cave": "水脏洞",
    "dragon-palace": "龙宫",
    "underworld": "幽冥界",
  };
  const WAVE_REGIONS = [1, 7];     // 波次区域（3×3 编号：1=上中，7=下中）
  const HERO_REGION = 4;           // 出生区域（正中）
  const BOSS_REGION = 5;           // Boss 区（右中）
  const SLOT_MONSTERS = [[0.3, 0.35], [0.72, 0.3], [0.55, 0.68], [0.28, 0.72]];
  const SLOT_ORBS = [[0.2, 0.52], [0.5, 0.2], [0.82, 0.5], [0.5, 0.82]];

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
    supports: $("game-supports"),
    hintcard: $("game-hintcard"),
    joystick: $("game-joystick"),
    stick: $("game-stick"),
    dialogue: $("game-dialogue"),
    dialogueFace: $("game-dialogue-face"),
    dialogueName: $("game-dialogue-name"),
    dialogueEn: $("game-dialogue-en"),
    dialogueZh: $("game-dialogue-zh"),
    dialogueChoices: $("game-dialogue-choices"),
    dialogueNext: $("game-dialogue-next"),
    bossgate: $("game-bossgate"),
    pause: $("game-pause"),
    gate: $("game-gate"),
    toast: $("game-toast"),
  };

  const state = {
    level: null,
    sprites: {},
    taunts: {},
    phase: "loading",
    locked: false,
    paused: false,
    ignoreHidden: false,
    vw: window.innerWidth,
    vh: window.innerHeight,
    hero: { x: 1.5, y: 1.5, dir: "south", el: null, img: null, invulnUntil: 0 },
    camera: { x: 0, y: 0 },
    monsters: [],
    orbs: [],
    shots: [],
    npcs: [],
    bossSpot: null,
    waveIndex: 0,
    killed: 0,
    stars: 0,
    shield: 3,
    combo: { streak: 0 },
    wrongWords: {},
    carried: null,          // {zh, el?} 手里的中文词球
    items: { peach: 0, fan: 0 },
    npcBonus: false,
    introAutoPlayed: false,
    bossGateOpen: false,
    bossReady: false,
    bossNear: false,
    intent: { x: 0, y: 0 },
    held: new Set(),
    lastTs: 0,
    raf: 0,
  };

  /* ---------- 基础工具 ---------- */

  function readStore(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "{}") || {};
    } catch (_) {
      return {};
    }
  }

  function writeStore(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) { /* 存不下就只保留本次体验 */ }
  }

  function persistProgress(extra) {
    const progress = readStore(KEY_PROGRESS);
    const rec = Object.assign(progress[EP] || {}, extra || {});
    rec.wrongWords = state.wrongWords;
    rec.updatedAt = new Date().toISOString();
    progress[EP] = rec;
    writeStore(KEY_PROGRESS, progress);
  }

  let audioEl = null;
  function speakTerm(text) {
    if (!text) return;
    try {
      audioEl = audioEl || new Audio();
      audioEl.src = "/api/tts?voice=en&text=" + encodeURIComponent(text);
      audioEl.currentTime = 0;
      audioEl.play().catch(() => {});
    } catch (_) { /* 无 TTS 环境静默 */ }
  }

  function fetchJSON(url) {
    return fetch(url, { cache: "no-store" }).then((res) => (res.ok ? res.json() : null));
  }

  function assetUrl(path) {
    return path ? "../" + String(path).replace(/^\.\.\//, "") : "";
  }

  function showToast(text, ms) {
    els.toast.textContent = text;
    els.toast.hidden = false;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      els.toast.hidden = true;
    }, ms || 1800);
  }

  function spriteSrc(spriteId) {
    const entry = state.sprites[spriteId];
    return entry && entry.gif ? assetUrl(entry.gif) : "";
  }

  function gifForDir(spriteId, dir) {
    const entry = state.sprites[spriteId];
    if (entry && entry.walkGifs && entry.walkGifs[dir]) return assetUrl(entry.walkGifs[dir]);
    return spriteSrc(spriteId);
  }

  function makeImg(spriteId, dir, fallbackText) {
    const img = document.createElement("img");
    const src = (dir ? gifForDir(spriteId, dir) : spriteSrc(spriteId)) || "";
    if (src) img.src = src;
    img.alt = "";
    img.decoding = "async";
    img.addEventListener("error", () => {
      const ph = document.createElement("div");
      ph.className = "battle-sprite-placeholder";
      ph.textContent = (fallbackText || "妖").slice(0, 1);
      img.replaceWith(ph);
    }, { once: true });
    return img;
  }

  function regionOrigin(region) {
    return { x: region % 3, y: Math.floor(region / 3) };
  }

  function regionPoint(region, rx, ry) {
    const origin = regionOrigin(region);
    return {
      x: Math.min(WORLD - 0.02, Math.max(0.02, origin.x + rx)),
      y: Math.min(WORLD - 0.02, Math.max(0.02, origin.y + ry)),
    };
  }

  function clampWorld(x, y) {
    return {
      x: Math.min(WORLD - 0.03, Math.max(0.03, x)),
      y: Math.min(WORLD - 0.03, Math.max(0.03, y)),
    };
  }

  function placeAt(el, x, y) {
    el.style.left = `${(x / WORLD * 100).toFixed(3)}%`;
    el.style.top = `${(y / WORLD * 100).toFixed(3)}%`;
  }

  function updateCamera() {
    state.camera.x = Math.min(WORLD - 1, Math.max(0, state.hero.x - 0.5));
    state.camera.y = Math.min(WORLD - 1, Math.max(0, state.hero.y - 0.5));
    els.world.style.transform = `translate3d(${(-state.camera.x * state.vw).toFixed(1)}px, ${(-state.camera.y * state.vh).toFixed(1)}px, 0)`;
  }

  /* ---------- 实体构建 ---------- */

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
    const spawn = regionPoint(HERO_REGION, 0.5, 0.58);
    state.hero.x = spawn.x;
    state.hero.y = spawn.y;
    placeAt(heroEl, state.hero.x, state.hero.y);

    const region = WAVE_REGIONS[0];
    const waveMonsters = [];
    state.level.waves.forEach((wave, waveIndex) => {
      Core.buildWaveQuestions(state.level, waveIndex, state.wrongWords).forEach((m) => {
        waveMonsters.push(Object.assign({ waveIndex }, m));
      });
    });
    state.monsters = waveMonsters.map((m, idx) => {
      const monster = Object.assign({}, m, {
        el: null, x: 0, y: 0, tx: 0, ty: 0, alive: true,
        idleUntil: 0, fleeUntil: 0, attackCd: 0, waveIndex: m.waveIndex,
      });
      const el = document.createElement("button");
      el.type = "button";
      el.className = "game-entity is-monster";
      el.setAttribute("aria-label", `${m.term}`);
      el.appendChild(makeImg(m.sprite || "imp", "south", m.zh));
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
      return monster;
    });
    spawnWave(0, true);

    state.npcs = (map.npcSpots || []).map((spot, idx) => {
      // intro NPC 在出生区，quiz NPC 在第二波区域
      const region = spot.role === "intro" ? HERO_REGION : (WAVE_REGIONS[1] ?? HERO_REGION);
      const pos = regionPoint(region, 0.5 + (idx % 2 ? 0.16 : -0.18), 0.62);
      const npc = { role: spot.role, sprite: spot.sprite, nameZh: spot.nameZh || "", x: pos.x, y: pos.y, el: null, done: false };
      const el = document.createElement("button");
      el.type = "button";
      el.className = "game-entity is-npc";
      el.setAttribute("aria-label", `和${npc.nameZh || npc.role}对话`);
      el.appendChild(makeImg(npc.sprite, "south", npc.nameZh));
      const speech = document.createElement("span");
      speech.className = "game-speech";
      speech.textContent = "💬";
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
    const bossPos = regionPoint(BOSS_REGION, 0.5, 0.5);
    const bossEl = document.createElement("button");
    bossEl.type = "button";
    bossEl.className = "game-entity is-bossspot";
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

    const theme = (state.level.map && state.level.map.theme) || "";
    const bgUrl = theme && theme !== "generic" ? `../assets/game-backgrounds/${theme}.jpg` : "";
    if (bgUrl) {
      els.backdrop.style.backgroundImage = `url("${bgUrl}")`;
      els.backdrop.addEventListener("error", () => {
        els.backdrop.style.backgroundImage = state.level.background.illustration
          ? `url("${assetUrl(state.level.background.illustration)}")`
          : "";
      }, { once: true });
    } else if (state.level.background.illustration) {
      els.backdrop.style.backgroundImage = `url("${assetUrl(state.level.background.illustration)}")`;
      els.backdrop.style.backgroundSize = "100% 100%";
      els.backdrop.style.backgroundRepeat = "no-repeat";
    }
  }

  /* ---------- 波次 ---------- */

  function spawnWave(waveIndex, silent) {
    state.waveIndex = waveIndex;
    const region = WAVE_REGIONS[Math.min(waveIndex, WAVE_REGIONS.length - 1)];
    const waveMonsters = state.monsters.filter((m) => m.waveIndex === waveIndex);
    waveMonsters.forEach((m, idx) => {
      const slot = SLOT_MONSTERS[idx % SLOT_MONSTERS.length];
      const pos = regionPoint(region, slot[0], slot[1]);
      m.alive = true;
      m.x = pos.x;
      m.y = pos.y;
      m.tx = pos.x;
      m.ty = pos.y;
      m.attackCd = 0;
      m.el.style.display = "";
      m.el.classList.remove("is-dead");
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
      el.textContent = m.zh;
      el.setAttribute("aria-label", `捡起词球 ${m.zh}`);
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        walkTo(orb.x, orb.y);
      });
      els.projectiles.appendChild(el);
      orb.el = el;
      const pos = regionPoint(region, slot[0], slot[1]);
      orb.x = pos.x;
      orb.y = pos.y;
      placeAt(el, orb.x, orb.y);
      state.orbs.push(orb);
    });
    if (!silent) {
      const theme = (state.level.map && state.level.map.theme) || "";
      showBanner(`第 ${waveIndex + 1} 波`, THEME_ZH[theme] || state.level.title.en);
      window.BookPlayAudio?.sfx("start");
    }
    updateHud();
  }

  function orbEl(orb) {
    return orb && orb.el;
  }

  function walkTo(x, y) {
    const p = clampWorld(x, y);
    state.hero.tx = p.x;
    state.hero.ty = p.y;
  }

  function aliveMonsters() {
    return state.monsters.filter((m) => m.alive);
  }

  function currentWaveAlive() {
    return state.monsters.filter((m) => m.alive && m.waveIndex === state.waveIndex);
  }

  /* ---------- 主角移动 ---------- */

  function setHeroDir(dir) {
    if (state.hero.dir === dir) return;
    state.hero.dir = dir;
    const src = gifForDir(state.level.cast.hero.id, dir);
    if (src) state.hero.img.src = src;
  }

  function moveHeroBy(dx, dy, dt) {
    const step = (dt / 1000) * HERO_SPEED;
    const magnitude = Math.hypot(dx, dy) || 1;
    const next = clampWorld(
      state.hero.x + (dx / magnitude) * step,
      state.hero.y + (dy / magnitude) * step,
    );
    setHeroDir(Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? "west" : "east") : (dy < 0 ? "north" : "south"));
    state.hero.x = next.x;
    state.hero.y = next.y;
  }

  function updateHero(dt) {
    let ix = state.intent.x;
    let iy = state.intent.y;
    state.held.forEach((key) => {
      if (key === "ArrowLeft" || key === "a") ix -= 1;
      if (key === "ArrowRight" || key === "d") ix += 1;
      if (key === "ArrowUp" || key === "w") iy -= 1;
      if (key === "ArrowDown" || key === "s") iy += 1;
    });
    if (ix || iy) {
      state.hero.tx = null;
      state.hero.ty = null;
      moveHeroBy(ix, iy, dt);
    } else if (state.hero.tx != null) {
      const dx = state.hero.tx - state.hero.x;
      const dy = state.hero.ty - state.hero.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.03) {
        state.hero.tx = null;
        state.hero.ty = null;
      } else {
        moveHeroBy(dx, dy, dt);
      }
    }
    placeAt(state.hero.el, state.hero.x, state.hero.y);
  }

  /* ---------- 小怪 AI（游荡/追击/撞击，对照 word-memory-map） ---------- */

  function updateMonsters(dt, now) {
    const hero = state.hero;
    state.monsters.forEach((m) => {
      if (!m.alive) return;
      let speed = MONSTER_WANDER;
      let gx = m.tx;
      let gy = m.ty;
      const heroDist = Math.hypot(hero.x - m.x, hero.y - m.y);
      if (heroDist < AGGRO_DIST && now >= m.fleeUntil) {
        // 追击但保持距离
        speed = MONSTER_CHASE;
        if (heroDist > KEEP_DIST) {
          gx = hero.x;
          gy = hero.y;
        } else {
          gx = m.x;
          gy = m.y;
        }
        if (heroDist <= ATTACK_DIST && now >= m.attackCd && now >= hero.invulnUntil) {
          monsterAttack(m);
          m.attackCd = now + ATTACK_CD;
        }
      } else {
        if (now < m.fleeUntil) {
          speed = MONSTER_CHASE * 1.5;
          const away = clampWorld(m.x - (hero.x - m.x), m.y - (hero.y - m.y));
          gx = away.x;
          gy = away.y;
        } else if (heroDist < AGGRO_DIST) {
          gx = m.x;
          gy = m.y;
        }
      }
      const dx = gx - m.x;
      const dy = gy - m.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.012) {
        const step = Math.min(dist, (dt / 1000) * speed);
        m.x += (dx / dist) * step;
        m.y += (dy / dist) * step;
      } else if (!m.fleeUntil || now >= m.fleeUntil) {
        if (!m.idleUntil) {
          m.idleUntil = now + 1200 + Math.random() * 900;
        } else if (now >= m.idleUntil) {
          m.idleUntil = 0;
          const origin = regionOrigin(WAVE_REGIONS[Math.min(m.waveIndex, WAVE_REGIONS.length - 1)]);
          const spot = clampWorld(
            origin.x + 0.15 + Math.random() * 0.7,
            origin.y + 0.15 + Math.random() * 0.7,
          );
          m.tx = spot.x;
          m.ty = spot.y;
        }
      }
      placeAt(m.el, m.x, m.y);
    });
  }

  function monsterAttack(monster) {
    state.shield = Math.max(0, state.shield - 1);
    state.combo.streak = 0;
    window.BookPlayAudio?.sfx("shield");
    const hero = state.hero;
    const away = clampWorld(hero.x - (monster.x - hero.x) * 1.6, hero.y - (monster.y - hero.y) * 1.6);
    hero.x = away.x;
    hero.y = away.y;
    hero.invulnUntil = performance.now() + HERO_INVULN;
    updateHud();
    if (state.shield <= 0) {
      showToast("护盾碎了！小妖重新列阵，别灰心 💪", 2000);
      state.shield = 3;
      respawnCurrentWave();
    } else {
      showToast("被小妖撞了一下！捡词球反击 ⚔️", 1500);
    }
  }

  function respawnCurrentWave() {
    const waveMonsters = state.monsters.filter((m) => m.waveIndex === state.waveIndex && !m.alive);
    waveMonsters.forEach((m, idx) => {
      const region = WAVE_REGIONS[Math.min(m.waveIndex, WAVE_REGIONS.length - 1)];
      const slot = SLOT_MONSTERS[idx % SLOT_MONSTERS.length];
      const pos = regionPoint(region, slot[0], slot[1]);
      m.alive = true;
      m.x = pos.x;
      m.y = pos.y;
      m.el.style.display = "";
      m.el.classList.remove("is-dead");
      placeAt(m.el, m.x, m.y);
    });
    updateHud();
  }

  /* ---------- 词球：拾取 / 投掷 / 命中 ---------- */

  function updateOrbs() {
    if (state.carried) return;
    state.orbs.forEach((orb) => {
      if (orb.el && orb.el.style.display !== "none") {
        const d = Math.hypot(state.hero.x - orb.x, state.hero.y - orb.y);
        if (d < ORB_PICKUP) pickUp(orb);
      }
    });
  }

  function pickUp(orb) {
    state.carried = { zh: orb.zh };
    orb.el.style.display = "none";
    window.BookPlayAudio?.sfx("start");
    updateHud();
  }

  function dropOrbAt(x, y) {
    const orb = state.orbs.find((o) => state.carried && o.zh === state.carried.zh && o.el.style.display === "none");
    const pos = clampWorld(x, y);
    if (orb) {
      orb.x = pos.x;
      orb.y = pos.y;
      orb.el.style.display = "";
      placeAt(orb.el, orb.x, orb.y);
    }
    state.carried = null;
    updateHud();
  }

  function onMonsterClick(monster) {
    if (state.locked || !monster.alive) return;
    if (!state.carried) {
      showToast("先走到中文词球上捡起一颗！", 1600);
      return;
    }
    throwOrb(monster);
  }

  function throwOrb(monster) {
    // 投掷不锁世界：小怪照常追击/游荡，追踪弹逐帧更新（对照 word-memory-map）
    window.BookPlayAudio?.sfx("attack");
    const shot = {
      zh: state.carried.zh,
      target: monster,
      x: state.hero.x,
      y: state.hero.y - 0.04,
      age: 0,
      el: document.createElement("span"),
      trailTimer: 0,
    };
    shot.el.className = "game-shot";
    shot.el.textContent = shot.zh;
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
        const dist = Math.hypot(dx, dy) || 1;
        const step = (dt / 1000) * SHOT_SPEED;
        shot.x += (dx / dist) * step;
        shot.y += (dy / dist) * step;
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
      state.stars += 1;
      state.killed += 1;
      killMonster(monster);
      spawnBurst(monster);
      maybeDrop(monster);
      showToast(`记住它：${monster.term} · ${monster.zh}`, 1700);
      if (verdict.comboReady) {
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
      persistProgress();
      advanceWaveIfNeeded();
    } else {
      window.BookPlayAudio?.sfx("retry");
      state.wrongWords[monster.term] = (state.wrongWords[monster.term] || 0) + 1;
      persistProgress();
      state.combo.streak = 0;
      monster.fleeUntil = performance.now() + 2400;
      monster.el.classList.add("is-wrong");
      window.setTimeout(() => monster.el.classList.remove("is-wrong"), 900);
      dropOrbAt(shot.x, shot.y);
      showToast("词球弹回来了！词牌对不上，再找找 ⚠️", 1700);
    }
    updateHud();
  }

  function settleMissedShot(shot) {
    dropOrbAt(shot.x, shot.y);
    removeShot(shot);
    showToast("词球落地了，走过去捡起来再扔", 1500);
  }

  function killMonster(monster) {
    monster.alive = false;
    monster.el.classList.add("is-dead");
    window.setTimeout(() => {
      monster.el.style.display = "none";
    }, 600);
  }

  function spawnBurst(monster) {
    for (let i = 0; i < 6; i += 1) {
      const star = document.createElement("span");
      star.className = "game-star";
      star.textContent = "⭐";
      placeAt(star, monster.x, monster.y);
      star.style.setProperty("--dx", `${(Math.random() - 0.5) * 130}px`);
      star.style.setProperty("--dy", `${-40 - Math.random() * 70}px`);
      els.particles.appendChild(star);
      window.setTimeout(() => star.remove(), 800);
    }
  }

  function maybeDrop(monster) {
    if (Math.random() > 0.35) return;
    const type = Math.random() < 0.6 ? "peach" : "fan";
    if (type === "peach") {
      if (state.shield < 3) {
        state.shield = Math.min(3, state.shield + 1);
        window.BookPlayAudio?.sfx("reward");
        showToast("捡到蟠桃！护盾 +1 🍑", 1500);
        updateHud();
        return;
      }
    }
    state.items[type] += 1;
    window.BookPlayAudio?.sfx("reward");
    showToast(type === "fan" ? "捡到芭蕉扇！点右上方横扫小妖 🪭" : "蟠桃收进支援栏，盾碎了再吃 🍑", 1800);
    renderSupports();
  }

  function renderSupports() {
    els.supports.textContent = "";
    const defs = [
      { type: "peach", icon: "🍑", label: "吃蟠桃回护盾" },
      { type: "fan", icon: "🪭", label: "芭蕉扇横扫本波" },
    ];
    defs.forEach((def) => {
      const count = state.items[def.type];
      if (!count) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = def.icon;
      btn.dataset.count = String(count);
      btn.setAttribute("aria-label", def.label);
      btn.tabIndex = 0;
      btn.addEventListener("click", () => useSupport(def.type));
      els.supports.appendChild(btn);
    });
  }

  function useSupport(type) {
    if (state.locked || !state.items[type]) return;
    if (type === "peach") {
      state.items.peach -= 1;
      state.shield = Math.min(3, state.shield + 1);
      window.BookPlayAudio?.sfx("reward");
      showToast("蟠桃下肚，护盾 +1 🍑", 1400);
    } else {
      state.items.fan -= 1;
      const rest = currentWaveAlive();
      rest.forEach((m) => {
        state.killed += 1;
        state.stars += 1;
        killMonster(m);
        spawnBurst(m);
      });
      window.BookPlayAudio?.sfx("reward");
      showToast("芭蕉扇一挥，本波小妖全灭！🪭", 1700);
      advanceWaveIfNeeded();
    }
    renderSupports();
    updateHud();
  }

  function advanceWaveIfNeeded() {
    updateHud();
    if (currentWaveAlive().length) return;
    const next = state.waveIndex + 1;
    if (state.monsters.some((m) => m.waveIndex === next)) {
      window.setTimeout(() => spawnWave(next), 700);
    } else if (!state.bossReady) {
      state.bossReady = true;
      state.bossSpot.el.classList.add("is-ready");
      showBanner("所有小妖肃清", `去挑战 ${state.level.cast.boss.nameZh}！`);
      window.BookPlayAudio?.sfx("reward");
      showToast("去右边找 Boss 决战吧！⚔️", 2600);
    }
  }

  /* ---------- NPC 对话（扁平游标 + choice 行） ---------- */

  function quizNpcWord() {
    const wrongSorted = Object.entries(state.wrongWords)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    const term = wrongSorted.length ? wrongSorted[0][0] : (state.level.previewWords[0] || {}).term;
    return state.level.previewWords.find((w) => w.term === term) || state.level.previewWords[0] || null;
  }

  function buildNpcLines(npc) {
    if (npc.role === "intro") {
      return state.level.intro.map((line) => ({
        type: "dialogue",
        textEn: line.textEn,
        textZh: line.textZh,
      }));
    }
    const tauntArr = state.taunts[npc.sprite] || [];
    const taunt = tauntArr[0] || { en: "Let's practice one word!", zh: "来练一个词吧！" };
    const word = quizNpcWord();
    return [
      { type: "dialogue", textEn: taunt.en, textZh: taunt.zh },
      { type: "choice", word },
    ];
  }

  function openDialogue(npc) {
    if (state.locked || !npc) return;
    if (npc.role === "quiz" && npc.done) {
      showToast(`${npc.nameZh || "NPC"}：你已经拿到我的词卡啦，去打 Boss 吧！`, 1800);
      return;
    }
    state.locked = true;
    state.dlg = { npc, lines: buildNpcLines(npc), idx: 0, retried: false };
    els.dialogue.hidden = false;
    renderDialogueLine();
  }

  function renderDialogueLine() {
    const dlg = state.dlg;
    const line = dlg.lines[dlg.idx];
    els.dialogueName.textContent = dlg.npc.nameZh || "NPC";
    const src = spriteSrc(dlg.npc.sprite);
    if (src) {
      els.dialogueFace.src = src;
      els.dialogueFace.style.display = "";
    } else {
      els.dialogueFace.style.display = "none";
    }
    els.dialogueChoices.textContent = "";
    els.dialogueNext.hidden = false;
    if (line.type === "dialogue") {
      els.dialogueEn.textContent = line.textEn;
      els.dialogueZh.textContent = line.textZh || "";
      if (dlg.npc.role === "intro") speakTerm(line.textEn);
      els.dialogueNext.textContent = dlg.idx + 1 >= dlg.lines.length ? "出发！⚔️" : "继续 ▼";
    } else {
      const word = line.word || state.level.previewWords[0];
      els.dialogueEn.textContent = word.term + (word.ipa ? `  ${word.ipa}` : "");
      els.dialogueZh.textContent = "它的意思是？";
      speakTerm(word.term);
      els.dialogueNext.hidden = true;
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
  }

  function resolveNpcChoice(orb, word, btn) {
    const dlg = state.dlg;
    const verdict = Core.judgeHit(orb, { term: word.term, zh: word.zh }, { streak: 0 });
    const feedback = document.createElement("div");
    feedback.className = "game-feedback";
    if (verdict.correct) {
      [...els.dialogueChoices.children].forEach((choice) => {
        if (choice.tagName === "BUTTON") choice.disabled = true;
        if (choice.textContent === word.zh) choice.classList.add("is-right");
      });
      window.BookPlayAudio?.sfx("correct");
      speakTerm(word.term);
      if (!dlg.npc.done) {
        dlg.npc.done = true;
        state.npcBonus = true;
        state.stars += 2;
        persistProgress({ npcBonus: true, npcDone: true });
        window.BookPlayAudio?.sfx("reward");
        const speech = dlg.npc.el && dlg.npc.el.querySelector(".game-speech");
        if (speech) speech.textContent = "⭐";
        feedback.textContent = "答对啦！奖励词卡 + ⭐⭐";
      } else {
        feedback.textContent = "答对啦！";
      }
      els.dialogueChoices.appendChild(feedback);
      els.dialogueNext.hidden = false;
      els.dialogueNext.textContent = "继续 ▼";
    } else if (!dlg.retried) {
      dlg.retried = true;
      btn.disabled = true;
      btn.classList.add("is-wrong");
      window.BookPlayAudio?.sfx("retry");
      feedback.textContent = `再想一想～提示：${word.zh}（还可再试一次）`;
      els.dialogueChoices.appendChild(feedback);
    } else {
      btn.disabled = true;
      btn.classList.add("is-wrong");
      [...els.dialogueChoices.children].forEach((choice) => {
        if (choice.textContent === word.zh) choice.classList.add("is-right");
      });
      feedback.textContent = `正确答案是「${word.zh}」，跟着读一遍：${word.term}！`;
      els.dialogueChoices.appendChild(feedback);
      els.dialogueNext.hidden = false;
      els.dialogueNext.textContent = "继续 ▼";
    }
    updateHud();
  }

  function advanceDialogue() {
    const dlg = state.dlg;
    if (!dlg || els.dialogueNext.hidden) return;
    dlg.idx += 1;
    if (dlg.idx >= dlg.lines.length) {
      state.dlg = null;
      els.dialogue.hidden = true;
      state.locked = false;
      return;
    }
    renderDialogueLine();
  }

  /* ---------- Boss 门 ---------- */

  function openBossGate() {
    if (state.locked) return;
    state.locked = true;
    const boss = state.level.cast.boss;
    els.bossgate.textContent = "";
    const title = document.createElement("h2");
    title.className = "battle-panel-title";
    title.textContent = `⚔️ 挑战 ${boss.nameZh}？`;
    const text = document.createElement("p");
    const remaining = aliveMonsters().length;
    text.textContent = remaining
      ? `还有 ${remaining} 只小妖没打完，也可以直接挑战！Boss 会优先考你的错词。`
      : "小妖全清了！Boss 血条上的单词就是你的错词优先。";
    const go = document.createElement("button");
    go.type = "button";
    go.className = "game-primary";
    go.tabIndex = 0;
    go.textContent = "开战！";
    go.addEventListener("click", () => {
      const wrong = Object.keys(state.wrongWords).filter((term) => state.wrongWords[term] > 0).join(",");
      window.location.href = `battle.html?ep=${EP}&skip=intro,preview,waves&from=game${wrong ? `&wrong=${encodeURIComponent(wrong)}` : ""}`;
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
    els.carried.textContent = state.carried ? state.carried.zh : "空手";
    els.combo.textContent = String(state.combo.streak);
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
    const monster = alive[Math.floor(Math.random() * alive.length)];
    const word = state.level.previewWords.find((w) => w.term === monster.term) || monster;
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
    zh.textContent = `${word.zh}（头上顶着这个词的就是目标）`;
    body.append(term, zh);
    const hear = document.createElement("button");
    hear.type = "button";
    hear.textContent = "♪";
    hear.setAttribute("aria-label", `朗读 ${word.term}`);
    hear.tabIndex = 0;
    hear.addEventListener("click", () => speakTerm(word.term));
    els.hintcard.append(body, hear);
    els.hintcard.hidden = false;
    speakTerm(word.term);
  }

  function showGate(message) {
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
    back.textContent = "回地图";
    back.addEventListener("click", () => {
      window.location.href = "map.html";
    });
    els.gate.append(title, text, back);
    els.gate.hidden = false;
  }

  /* ---------- 输入 ---------- */

  function nearestEntity() {
    let best = null;
    let bestDist = INTERACT_DIST;
    const check = (x, y) => Math.hypot(state.hero.x - x, state.hero.y - y);
    state.monsters.forEach((m) => {
      if (!m.alive) return;
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
    els.scene.addEventListener("click", () => { /* 世界点击交给实体；空白处不移动（摇杆/方向键负责） */ });

    els.hint.addEventListener("click", toggleHintCard);
    els.exit.addEventListener("click", togglePause);
    $("game-resume").addEventListener("click", togglePause);
    $("game-restart").addEventListener("click", () => window.location.reload());
    $("game-map").addEventListener("click", () => {
      window.location.href = "map.html";
    });
    els.dialogueNext.addEventListener("click", advanceDialogue);

    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") {
        togglePause();
        return;
      }
      if (state.paused) return;
      if (ev.key === "Enter" || ev.key === " ") {
        if (state.locked) return;
        ev.preventDefault();
        const near = nearestEntity();
        if (near && near.kind === "monster" && state.carried) throwOrb(near.ref);
        else if (near && near.kind === "monster") showToast("先捡一颗中文词球！", 1400);
        if (near && near.kind === "npc") openDialogue(near.ref);
        if (near && near.kind === "boss") openBossGate();
        return;
      }
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d"].includes(ev.key)) {
        ev.preventDefault();
        state.held.add(ev.key);
      }
    });
    document.addEventListener("keyup", (ev) => {
      state.held.delete(ev.key);
    });

    const joy = els.joystick;
    function setStick(x, y) {
      els.stick.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
    }
    joy.addEventListener("pointerdown", (ev) => {
      joy.setPointerCapture(ev.pointerId);
      joy.dataset.active = "1";
    });
    joy.addEventListener("pointermove", (ev) => {
      if (!joy.dataset.active) return;
      const rect = joy.getBoundingClientRect();
      let dx = ev.clientX - (rect.left + rect.width / 2);
      let dy = ev.clientY - (rect.top + rect.height / 2);
      const dist = Math.hypot(dx, dy);
      const max = rect.width / 2 - 10;
      if (dist > max) {
        dx = (dx / dist) * max;
        dy = (dy / dist) * max;
      }
      setStick(dx, dy);
      state.intent.x = dx / max;
      state.intent.y = dy / max;
    });
    function release() {
      delete joy.dataset.active;
      setStick(0, 0);
      state.intent.x = 0;
      state.intent.y = 0;
    }
    joy.addEventListener("pointerup", release);
    joy.addEventListener("pointercancel", release);

    window.addEventListener("resize", () => {
      state.vw = window.innerWidth;
      state.vh = window.innerHeight;
      updateCamera();
    });
  }

  function togglePause() {
    if (state.phase !== "explore") return;
    state.paused = !state.paused;
    els.pause.hidden = !state.paused;
  }

  /* ---------- 主循环 ---------- */

  function step(now) {
    const dt = Math.min(48, now - (state.lastTs || now));
    state.lastTs = now;
    if (state.phase !== "explore") return;
    if (state.paused || state.locked) return;
    if (document.hidden && !state.ignoreHidden) {
      state.lastTs = now;
      return;
    }
    updateHero(dt);
    updateOrbs();          // 先判定拾取：避免小怪撞击的击退把主角推离词球
    updateMonsters(dt, now);
    updateShots(dt, now);
    updateProximity(now);
    updateCamera();
  }

  function frame(ts) {
    step(ts);
    state.raf = window.requestAnimationFrame(frame);
  }

  function updateProximity(now) {
    if (state.bossSpot) {
      const d = Math.hypot(state.hero.x - state.bossSpot.x, state.hero.y - state.bossSpot.y);
      const near = d < INTERACT_DIST;
      if (near && !state.bossGateOpen && !state.bossNear) openBossGate();
      state.bossNear = near;
    }
    if (!FROM_BATTLE && !state.introAutoPlayed) {
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
    ]).then(([rawLevel, registry, taunts]) => {
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
      state.sprites = Core.loadSprites(registry || null, level.spriteIds);
      state.taunts = taunts && typeof taunts === "object" ? taunts : {};
      const progress = readStore(KEY_PROGRESS);
      const prev = progress[EP] || {};
      Object.entries(prev.wrongWords || {}).forEach(([term, count]) => {
        state.wrongWords[term] = count;
      });
      state.npcBonus = Boolean(prev.npcBonus);
      buildEntities();
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
      showBanner("出发！", `${state.level.title.en} · ${THEME_ZH[(state.level.map || {}).theme] || ""}`);
      if (FROM_BATTLE) showToast("战斗归来！继续探险吧 🗺️", 2000);
      else showToast("走过中文词球捡起来，点头顶有对应英文的小妖！", 4200);
    });
  }

  boot();
}());
