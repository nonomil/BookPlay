"use strict";

/* 降妖记·大地图探索页：单屏主题地图 + 主角四方向行走（点地直达/摇杆/D-pad）+
 * 小怪头顶英文词游荡 + 点目标怪飞金箍棒 + 命中后中文 3 选 1 快卡 +
 * NPC 剧情对话与答题奖励 + Boss 区跳转 battle.html 对战。
 * 移动内核借鉴 word-memory-map：rAF 逐帧更新既有 DOM 的 left/top，不重建节点。
 * 对话结构借鉴 pixel-story-engine：扁平游标 + 逐句推进 + choice 行反馈。
 * 纯逻辑复用 battle-core.js；存储键合同：bookplay_battle_progress_v1 / bookplay_battle_collection_v1。
 */
(function () {
  const Core = window.BookPlayBattleCore;

  const params = new URLSearchParams(window.location.search);
  const EP = Math.max(1, Number(params.get("ep")) || 1);
  const DEBUG = params.get("debug") === "1";
  const FROM_BATTLE = params.get("from") === "battle";

  const KEY_PROGRESS = "bookplay_battle_progress_v1";
  const KEY_COLLECTION = "bookplay_battle_collection_v1";

  const HERO_SPEED = 0.16;        // 归一化单位/秒
  const MONSTER_SPEED = 0.028;
  const MONSTER_IDLE_MS = 1400;
  const INTERACT_DIST = 0.13;
  const STAFF_MS = 450;

  const FALLBACK_LAYOUT = {
    walkable: { x: 0.05, y: 0.30, w: 0.90, h: 0.60 },
    heroSpawn: { x: 0.10, y: 0.62 },
    monsterSpawns: [
      { x: 0.48, y: 0.42 }, { x: 0.66, y: 0.60 }, { x: 0.84, y: 0.44 }, { x: 0.54, y: 0.76 },
    ],
    npcSpots: [
      { role: "intro", x: 0.24, y: 0.56 }, { role: "quiz", x: 0.46, y: 0.74 },
    ],
    bossSpot: { x: 0.90, y: 0.68 },
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    root: $("game-root"),
    scene: $("game-scene"),
    backdrop: $("game-backdrop"),
    walkzone: $("game-walkzone"),
    entities: $("game-entities"),
    projectiles: $("game-projectiles"),
    particles: $("game-particles"),
    shields: $("game-shields"),
    progress: $("game-progress"),
    targetZh: $("game-target-zh"),
    targetSpeak: $("game-target-speak"),
    exit: $("game-exit"),
    tray: $("game-tray"),
    joystick: $("game-joystick"),
    stick: $("game-stick"),
    dialogue: $("game-dialogue"),
    dialogueFace: $("game-dialogue-face"),
    dialogueName: $("game-dialogue-name"),
    dialogueEn: $("game-dialogue-en"),
    dialogueZh: $("game-dialogue-zh"),
    dialogueChoices: $("game-dialogue-choices"),
    dialogueNext: $("game-dialogue-next"),
    quickquiz: $("game-quickquiz"),
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
    ignoreHidden: false, // 测试钩子：后台仍步进（配合 BookPlayGameDebug）
    hero: { x: 0.1, y: 0.62, tx: 0.1, ty: 0.62, dir: "south", el: null, img: null },
    monsters: [],
    npcs: [],
    bossSpot: null,
    shield: 3,
    combo: { streak: 0 },
    wrongWords: {},
    killed: 0,
    loot: [],
    npcBonus: false,
    introAutoPlayed: false,
    bossGateOpen: false,
    bossNear: false,
    intent: { x: 0, y: 0 },
    held: new Set(),
    raf: 0,
    lastTs: 0,
  };

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
    if (entry && entry.gif) return assetUrl(entry.gif);
    if (entry && entry.source === "walker-fallback" && entry.gif) return assetUrl(entry.gif);
    return "";
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

  function clampToWalkable(x, y) {
    const w = (state.level && state.level.map && state.level.map.walkable) || FALLBACK_LAYOUT.walkable;
    return {
      x: Math.min(w.x + w.w, Math.max(w.x, x)),
      y: Math.min(w.y + w.h, Math.max(w.y, y)),
    };
  }

  function placeAt(el, x, y) {
    el.style.left = `${(x * 100).toFixed(2)}%`;
    el.style.top = `${(y * 100).toFixed(2)}%`;
  }

  /* ---------- 实体构建 ---------- */

  function buildEntities() {
    els.entities.textContent = "";
    const map = state.level.map || FALLBACK_LAYOUT;

    const heroEl = document.createElement("div");
    heroEl.className = "game-entity is-hero";
    heroEl.id = "game-hero";
    const heroImg = makeImg(state.level.cast.hero.id, "south", "悟");
    heroEl.appendChild(heroImg);
    els.entities.appendChild(heroEl);
    state.hero.el = heroEl;
    state.hero.img = heroImg;
    state.hero.x = map.heroSpawn ? map.heroSpawn.x : 0.1;
    state.hero.y = map.heroSpawn ? map.heroSpawn.y : 0.62;
    state.hero.tx = state.hero.x;
    state.hero.ty = state.hero.y;
    placeAt(heroEl, state.hero.x, state.hero.y);

    const spawns = (map.monsterSpawns && map.monsterSpawns.length ? map.monsterSpawns : FALLBACK_LAYOUT.monsterSpawns);
    const waveMonsters = [];
    state.level.waves.forEach((wave, waveIndex) => {
      Core.buildWaveQuestions(state.level, waveIndex, state.wrongWords).forEach((m) => {
        waveMonsters.push(m);
      });
    });
    state.monsters = waveMonsters.map((m, idx) => {
      const spot = spawns[idx % spawns.length];
      const pos = clampToWalkable(spot.x + (idx % 2 ? 0.02 : -0.02), spot.y);
      const monster = Object.assign({}, m, {
        el: null, x: pos.x, y: pos.y, tx: pos.x, ty: pos.y,
        idleUntil: 0, alive: true, speedMul: 1, fleeUntil: 0,
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
      placeAt(el, monster.x, monster.y);
      return monster;
    });

    state.npcs = ((map.npcSpots && map.npcSpots.length ? map.npcSpots : FALLBACK_LAYOUT.npcSpots) || []).map((spot) => {
      const npc = { role: spot.role, sprite: spot.sprite, nameZh: spot.nameZh || "", x: spot.x, y: spot.y, el: null, done: false };
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

    if (map.bossSpot) {
      const boss = state.level.cast.boss;
      const el = document.createElement("button");
      el.type = "button";
      el.className = "game-entity is-bossspot";
      el.setAttribute("aria-label", `挑战${boss.nameZh}`);
      const aura = document.createElement("span");
      aura.className = "game-boss-aura";
      aura.textContent = "⚔️";
      el.appendChild(aura);
      el.appendChild(makeImg(boss.sprite, "south", boss.nameZh));
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        openBossGate();
      });
      els.entities.appendChild(el);
      placeAt(el, map.bossSpot.x, map.bossSpot.y);
      state.bossSpot = { x: map.bossSpot.x, y: map.bossSpot.y, el };
    }

    if (DEBUG) {
      els.root.classList.add("debug");
      const w = map.walkable || FALLBACK_LAYOUT.walkable;
      els.walkzone.style.left = `${w.x * 100}%`;
      els.walkzone.style.top = `${w.y * 100}%`;
      els.walkzone.style.width = `${w.w * 100}%`;
      els.walkzone.style.height = `${w.h * 100}%`;
    }
  }

  /* ---------- 移动 ---------- */

  function setHeroDir(dir) {
    if (state.hero.dir === dir) return;
    state.hero.dir = dir;
    const src = gifForDir(state.level.cast.hero.id, dir);
    if (src) state.hero.img.src = src;
  }

  function updateHero(dt) {
    const hero = state.hero;
    let ix = state.intent.x;
    let iy = state.intent.y;
    state.held.forEach((key) => {
      if (key === "ArrowLeft" || key === "a") ix -= 1;
      if (key === "ArrowRight" || key === "d") ix += 1;
      if (key === "ArrowUp" || key === "w") iy -= 1;
      if (key === "ArrowDown" || key === "s") iy += 1;
    });
    if (ix || iy) {
      hero.tx = null;
      hero.ty = null;
      const magnitude = Math.hypot(ix, iy) || 1;
      const step = (dt / 1000) * HERO_SPEED;
      const next = clampToWalkable(
        hero.x + (ix / magnitude) * step,
        hero.y + (iy / magnitude) * step,
      );
      setHeroDir(Math.abs(ix) >= Math.abs(iy) ? (ix < 0 ? "west" : "east") : (iy < 0 ? "north" : "south"));
      hero.x = next.x;
      hero.y = next.y;
    } else if (hero.tx != null) {
      const dx = hero.tx - hero.x;
      const dy = hero.ty - hero.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.012) {
        hero.x = hero.tx;
        hero.y = hero.ty;
        hero.tx = null;
        hero.ty = null;
      } else {
        const step = Math.min(dist, (dt / 1000) * HERO_SPEED);
        setHeroDir(Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? "west" : "east") : (dy < 0 ? "north" : "south"));
        hero.x += (dx / dist) * step;
        hero.y += (dy / dist) * step;
      }
    }
    placeAt(hero.el, hero.x, hero.y);
  }

  function updateMonsters(dt) {
    const now = performance.now();
    state.monsters.forEach((m) => {
      if (!m.alive) return;
      const fleeing = now < m.fleeUntil;
      const speed = MONSTER_SPEED * (fleeing ? 2.6 : 1);
      const dx = m.tx - m.x;
      const dy = m.ty - m.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.01) {
        if (!m.idleUntil) {
          m.idleUntil = now + MONSTER_IDLE_MS;
        } else if (now >= m.idleUntil) {
          m.idleUntil = 0;
          const spot = clampToWalkable(m.x + (Math.random() - 0.5) * 0.12, m.y + (Math.random() - 0.5) * 0.12);
          m.tx = spot.x;
          m.ty = spot.y;
        }
      } else {
        const step = Math.min(dist, (dt / 1000) * speed);
        m.x += (dx / dist) * step;
        m.y += (dy / dist) * step;
      }
      placeAt(m.el, m.x, m.y);
    });
  }

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

  /* ---------- 目标与小怪交互 ---------- */

  function aliveMonsters() {
    return state.monsters.filter((m) => m.alive);
  }

  function currentTarget() {
    return state.monsters.find((m) => m.alive) || null;
  }

  function refreshTarget() {
    const target = currentTarget();
    [...els.entities.querySelectorAll(".game-entity.is-monster")].forEach((el, idx) => {
      const m = state.monsters[idx];
      el.classList.toggle("is-target", Boolean(m && m.alive && target && m === target));
    });
    els.targetZh.textContent = target ? target.zh : "去挑战 Boss！";
    els.targetSpeak.style.visibility = target ? "visible" : "hidden";
  }

  function onMonsterClick(monster) {
    if (state.locked || !monster.alive) return;
    if (currentTarget() !== monster) {
      showToast(`先找「${currentTarget() ? currentTarget().zh : ""}」的小妖！`, 1500);
      return;
    }
    throwStaff(monster);
  }

  function throwStaff(monster) {
    state.locked = true;
    window.BookPlayAudio?.sfx("attack");
    const staff = document.createElement("div");
    staff.className = "game-staff";
    const sceneRect = els.scene.getBoundingClientRect();
    const heroRect = state.hero.el.getBoundingClientRect();
    const monsterRect = monster.el.getBoundingClientRect();
    const sx = heroRect.left + heroRect.width / 2 - sceneRect.left;
    const sy = heroRect.top + heroRect.height / 3 - sceneRect.top;
    const tx = monsterRect.left + monsterRect.width / 2 - sceneRect.left;
    const ty = monsterRect.top + monsterRect.height / 2 - sceneRect.top;
    staff.style.left = `${sx}px`;
    staff.style.top = `${sy}px`;
    els.projectiles.appendChild(staff);
    window.requestAnimationFrame(() => {
      staff.style.transform = `translate(${tx - sx}px, ${ty - sy}px) rotate(560deg)`;
    });
    window.setTimeout(() => {
      staff.style.opacity = "0";
      showQuickQuiz(monster);
    }, STAFF_MS);
  }

  function flyStaffBack() {
    const staff = els.projectiles.querySelector(".game-staff");
    if (!staff) return;
    staff.style.opacity = "1";
    staff.style.transform = "translate(0, 0) rotate(0deg)";
    window.setTimeout(() => staff.remove(), STAFF_MS + 60);
  }

  function showQuickQuiz(monster) {
    const seed = state.level.seedBase + 700 + state.killed * 11;
    const set = Core.buildOrbSet(monster, state.level.previewWords, seed);
    els.quickquiz.textContent = "";
    const term = document.createElement("div");
    term.className = "game-qq-term";
    term.textContent = monster.term;
    const ipa = document.createElement("span");
    ipa.className = "game-qq-ipa";
    ipa.textContent = monster.ipa || "";
    const hint = document.createElement("span");
    hint.className = "game-qq-hint";
    hint.textContent = "它的意思是？";
    const hear = document.createElement("button");
    hear.type = "button";
    hear.textContent = "♪ 再听一遍";
    hear.tabIndex = 0;
    hear.addEventListener("click", () => speakTerm(monster.term));
    const grid = document.createElement("div");
    grid.className = "game-qq-choices";
    set.orbs.forEach((orb) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = orb.zh;
      btn.tabIndex = 0;
      btn.addEventListener("click", () => resolveQuickQuiz(orb, monster, grid));
      grid.appendChild(btn);
    });
    els.quickquiz.append(term, ipa, hint, hear, grid);
    els.quickquiz.hidden = false;
  }

  function resolveQuickQuiz(orb, monster, grid) {
    const verdict = Core.judgeHit(orb, monster, state.combo);
    [...grid.children].forEach((btn) => {
      btn.disabled = true;
      if (btn.textContent === monster.zh) btn.classList.add("is-right");
    });
    if (verdict.correct) {
      window.BookPlayAudio?.sfx("correct");
      speakTerm(monster.term);
      state.killed += 1;
      killMonster(monster, true);
      if (verdict.comboReady) {
        const rest = aliveMonsters().filter((m) => m !== monster);
        rest.forEach((m) => {
          state.killed += 1;
          killMonster(m, false);
        });
        if (rest.length) {
          window.BookPlayAudio?.sfx("reward");
          showToast("金箍棒横扫！连击清场 ⚡", 1600);
        }
      }
      spawnStars(monster);
      addLoot(monster);
    } else {
      window.BookPlayAudio?.sfx("retry");
      state.wrongWords[monster.term] = (state.wrongWords[monster.term] || 0) + 1;
      persistProgress();
      state.combo.streak = 0;
      state.shield = Math.max(0, state.shield - 1);
      window.BookPlayAudio?.sfx("shield");
      monster.fleeUntil = performance.now() + 2600;
      monster.el.classList.add("is-fleeing");
      window.setTimeout(() => monster.el.classList.remove("is-fleeing"), 2600);
      if (state.shield <= 0) {
        showToast("护盾碎了！小妖重新列阵，别灰心 💪", 2000);
        state.shield = 3;
        resetMonsters();
      }
    }
    updateHud();
    refreshTarget();
    window.setTimeout(() => {
      els.quickquiz.hidden = true;
      flyStaffBack();
      state.locked = false;
    }, verdict.correct ? 650 : 1100);
  }

  function killMonster(monster, byPlayer) {
    monster.alive = false;
    monster.el.classList.add("is-dead");
    window.setTimeout(() => {
      monster.el.style.display = "none";
    }, 600);
    if (byPlayer) spawnStars(monster);
  }

  function resetMonsters() {
    const map = state.level.map || FALLBACK_LAYOUT;
    const spawns = (map.monsterSpawns && map.monsterSpawns.length ? map.monsterSpawns : FALLBACK_LAYOUT.monsterSpawns);
    state.monsters.forEach((m, idx) => {
      if (m.alive) return;
      m.alive = true;
      const spot = clampToWalkable(spawns[idx % spawns.length].x, spawns[idx % spawns.length].y);
      m.x = spot.x;
      m.y = spot.y;
      m.tx = spot.x;
      m.ty = spot.y;
      m.el.style.display = "";
      m.el.classList.remove("is-dead");
      placeAt(m.el, m.x, m.y);
    });
    refreshTarget();
  }

  function spawnStars(monster) {
    const sceneRect = els.scene.getBoundingClientRect();
    const rect = monster.el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2 - sceneRect.left;
    const cy = rect.top + rect.height / 2 - sceneRect.top;
    for (let i = 0; i < 6; i += 1) {
      const star = document.createElement("span");
      star.className = "game-star";
      star.textContent = "⭐";
      star.style.left = `${cx}px`;
      star.style.top = `${cy}px`;
      star.style.setProperty("--dx", `${(Math.random() - 0.5) * 130}px`);
      star.style.setProperty("--dy", `${-40 - Math.random() * 70}px`);
      els.particles.appendChild(star);
      window.setTimeout(() => star.remove(), 800);
    }
  }

  function addLoot(monster) {
    state.loot.push(monster.term);
    const chip = document.createElement("span");
    chip.className = "game-loot";
    chip.textContent = `${monster.term} · ${monster.zh}`;
    els.tray.appendChild(chip);
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
    showPanel(els.dialogue);
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
        persistProgress({ npcBonus: true, npcDone: true });
        addLoot(word);
        window.BookPlayAudio?.sfx("reward");
        const speech = dlg.npc.el && dlg.npc.el.querySelector(".game-speech");
        if (speech) speech.textContent = "⭐";
        feedback.textContent = "答对啦！奖励词卡 + ⭐（第三颗星的秘密武器）";
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
      window.BookPlayAudio?.sfx("retry");
      [...els.dialogueChoices.children].forEach((choice) => {
        if (choice.textContent === word.zh) choice.classList.add("is-right");
      });
      feedback.textContent = `正确答案是「${word.zh}」，跟着读一遍：${word.term}！`;
      els.dialogueChoices.appendChild(feedback);
      els.dialogueNext.hidden = false;
      els.dialogueNext.textContent = "继续 ▼";
    }
  }

  function advanceDialogue() {
    const dlg = state.dlg;
    if (!dlg || els.dialogueNext.hidden) return;
    dlg.idx += 1;
    if (dlg.idx >= dlg.lines.length) {
      closeDialogue();
      return;
    }
    renderDialogueLine();
  }

  function closeDialogue() {
    state.dlg = null;
    els.dialogue.hidden = true;
    showPanel(null);
    state.locked = false;
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
      window.location.href = `battle.html?ep=${EP}&skip=intro,preview&from=game${wrong ? `&wrong=${encodeURIComponent(wrong)}` : ""}`;
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

  function updateProximity() {
    if (state.locked) return;
    if (state.bossSpot && !state.bossNear) {
      const d = Math.hypot(state.hero.x - state.bossSpot.x, state.hero.y - state.bossSpot.y);
      if (d < INTERACT_DIST && !state.bossGateOpen) openBossGate();
      state.bossNear = d < INTERACT_DIST * 1.6;
      if (state.bossNear && d >= INTERACT_DIST) state.bossGateOpen = false;
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

  /* ---------- HUD / 面板 ---------- */

  function updateHud() {
    els.shields.textContent = "🛡️".repeat(state.shield) + "⬜".repeat(Math.max(0, 3 - state.shield));
    const total = state.monsters.length + state.level.boss.hpWords.length;
    els.progress.textContent = `${state.killed} / ${total}`;
  }

  function showPanel(name) {
    [els.dialogue, els.quickquiz, els.bossgate, els.pause].forEach((el) => {
      el.hidden = el !== name;
    });
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

  function bindInput() {
    els.scene.addEventListener("click", (ev) => {
      if (state.locked || state.paused) return;
      const rect = els.scene.getBoundingClientRect();
      const point = clampToWalkable((ev.clientX - rect.left) / rect.width, (ev.clientY - rect.top) / rect.height);
      state.hero.tx = point.x;
      state.hero.ty = point.y;
    });

    els.targetSpeak.addEventListener("click", () => {
      const target = currentTarget();
      if (target) speakTerm(target.term);
    });

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
        if (near && near.kind === "monster") onMonsterClick(near.ref);
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
    if (state.paused || state.locked) {
      placeAt(state.hero.el, state.hero.x, state.hero.y);
      return;
    }
    if (document.hidden && !state.ignoreHidden) {
      state.lastTs = now; // 后台时不累积时间，回前台从零起步
      return;
    }
    updateHero(dt);
    updateMonsters(dt);
    updateProximity();
  }

  function frame(ts) {
    step(ts);
    state.raf = window.requestAnimationFrame(frame);
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
      if (level.map && level.map.theme) {
        els.backdrop.style.backgroundImage = `url("../assets/game-backgrounds/${level.map.theme}.jpg"), url("../${level.background.illustration || ""}")`;
      } else if (level.background.illustration) {
        els.backdrop.style.backgroundImage = `url("../${level.background.illustration}")`;
      }
      buildEntities();
      refreshTarget();
      updateHud();
      state.phase = "explore";
      state.lastTs = performance.now();
      state.raf = window.requestAnimationFrame(frame);
      window.BookPlayGameDebug = state; // 只读调试钩子：E2E 与人工排查用
      window.BookPlayGameDebug.step = step;
      // 看门狗：部分电视 WebView / 后台标签会把 rAF 节流到接近 0，这里兜底步进
      window.setInterval(() => {
        if (performance.now() - state.lastTs > 320) step(performance.now());
      }, 320);
      if (FROM_BATTLE) {
        showToast("战斗归来！继续探险吧 🗺️", 2000);
      } else {
        showToast("点击地面移动，找到头顶是「目标中文」的小妖，点它！⚔️", 4200);
      }
    });
  }

  boot();
}());
