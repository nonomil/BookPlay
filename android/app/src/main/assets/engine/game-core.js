"use strict";

/* 降妖记大地图纯逻辑：朝向/步进、六种支援道具、NPC 门控、Boss 血条与战报。
 * 无 DOM / 无存储 / 无网络。浏览器网关见 game.js；命中对错仍走 battle-core.judgeHit。
 */
(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BookPlayGameCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function gameCoreFactory() {
  const WORLD_TILES = 4; // 大世界边长（视口格）。3 太挤，4 方便走一走再打。
  const SUPPORT_IDS = ["peach", "fan", "gourd", "cloud", "mantra", "staff"];
  const SUPPORT_DEFS = {
    peach: { id: "peach", icon: "🍑", label: "蟠桃挡伤", toastPick: "捡到蟠桃！下次被撞会挡一下 🍑", toastUse: "蟠桃下肚，护盾 +1 🍑" },
    fan: { id: "fan", icon: "🪭", label: "芭蕉扇减速", toastPick: "捡到芭蕉扇！点右上可让小妖变慢 🪭", toastUse: "芭蕉扇一挥，小妖慢下来了 🪭" },
    gourd: { id: "gourd", icon: "🏺", label: "紫金葫芦瞄准", toastPick: "捡到紫金葫芦！接下来 2 发自动找对怪 🏺", toastUse: "紫金葫芦：接下来 2 发自动瞄准 🏺" },
    cloud: { id: "cloud", icon: "☁️", label: "筋斗云加速", toastPick: "捡到筋斗云！跑得更快 ☁️", toastUse: "筋斗云！加速 ☁️" },
    mantra: { id: "mantra", icon: "📿", label: "紧箍咒提示", toastPick: "捡到紧箍咒！可提示目标首字母 📿", toastUse: "紧箍咒显灵：看提示 📿" },
    staff: { id: "staff", icon: "🪄", label: "金箍棒补盾", toastPick: "捡到金箍棒！下次打对额外补盾 🪄", toastUse: "金箍棒加持：下次打对补盾 🪄" },
  };
  const SLOW_MS = 9000;
  const SPEED_MS = 4000;
  const AUTO_AIM_SHOTS = 2;
  const SPEED_MULT = 1.28;
  const SLOW_MULT = 0.45;
  // Viewport-tiles per second, then multiplied by NU (1 / WORLD) in game.js.
  // hero 0.15 ≈ 6–7s to cross one 1280px screen in a 4×4 world.
  // 单位 = 视口宽/秒（与地图 worldTiles 无关：1.0 = 一秒走完一屏）。
  // 此前按"全图/秒"定义且关卡 worldTiles 改为 1 后整体慢了 4 倍，用户反馈太慢。
  const MOVEMENT_SPEEDS = Object.freeze({
    hero: 0.6,           // 屏/秒：约 1.7s 横穿一屏（1.0 太冲，0.25 太慢——2026-09-12 定档）
    monsterWander: 0.22,
    monsterChase: 0.45,
  });
  // One pack rule for every episode: chase a unique slot around the hero and
  // push overlapping minions apart. Distances are world-normalized (full map = 1).
  const PACK = Object.freeze({
    chaseRadius: 0.05,
    separation: 0.042,
    spawnGap: 0.038,
  });

  function chaseAnchor(hero, from, index, count, radius) {
    const hx = Number(hero && hero.x) || 0;
    const hy = Number(hero && hero.y) || 0;
    const fx = Number(from && from.x);
    const fy = Number(from && from.y);
    let vx = (Number.isFinite(fx) ? fx : hx + 1) - hx;
    let vy = (Number.isFinite(fy) ? fy : hy) - hy;
    const mag = Math.hypot(vx, vy);
    if (mag < 1e-6) {
      vx = 1;
      vy = 0;
    } else {
      vx /= mag;
      vy /= mag;
    }
    const px = -vy;
    const py = vx;
    const n = Math.max(1, Number(count) || 1);
    const t = n <= 1 ? 0 : (Number(index) || 0) - (n - 1) / 2;
    const r = Math.max(0, Number(radius) || 0);
    return {
      x: hx + vx * r * (1 + Math.abs(t) * 0.42) + px * t * r * 1.2,
      y: hy + vy * r * (1 + Math.abs(t) * 0.42) + py * t * r * 1.2,
    };
  }

  function packSeparation(self, others, minDist) {
    const gap = Math.max(0, Number(minDist) || 0);
    const ox = Number(self && self.x) || 0;
    const oy = Number(self && self.y) || 0;
    let sx = 0;
    let sy = 0;
    (Array.isArray(others) ? others : []).forEach((other, idx) => {
      if (!other || other === self) return;
      let dx = ox - (Number(other.x) || 0);
      let dy = oy - (Number(other.y) || 0);
      let d = Math.hypot(dx, dy);
      if (d >= gap) return;
      if (d < 1e-8) {
        const ang = (idx + 1) * 1.7;
        dx = Math.cos(ang);
        dy = Math.sin(ang);
        d = 1;
      }
      const weight = (gap - d) / gap;
      sx += (dx / d) * weight;
      sy += (dy / d) * weight;
    });
    const mag = Math.hypot(sx, sy);
    if (mag > 1) {
      sx /= mag;
      sy /= mag;
    }
    return { x: sx, y: sy };
  }

  function spreadPack(points, minDist) {
    const next = (Array.isArray(points) ? points : []).map((p) => ({
      x: Number(p && p.x) || 0,
      y: Number(p && p.y) || 0,
    }));
    const gap = Math.max(0, Number(minDist) || 0);
    if (next.length < 2 || !gap) return next;
    for (let pass = 0; pass < 8; pass += 1) {
      for (let i = 0; i < next.length; i += 1) {
        for (let j = i + 1; j < next.length; j += 1) {
          let dx = next[i].x - next[j].x;
          let dy = next[i].y - next[j].y;
          let d = Math.hypot(dx, dy);
          if (d >= gap) continue;
          if (d < 1e-8) {
            dx = 0.65;
            dy = (i - j) * 0.45;
            d = Math.hypot(dx, dy);
          }
          const push = (gap - d) * 0.5;
          const ux = dx / d;
          const uy = dy / d;
          next[i].x += ux * push;
          next[i].y += uy * push;
          next[j].x -= ux * push;
          next[j].y -= uy * push;
        }
      }
    }
    return next;
  }

  function regionOrigin(world, region) {
    const w = Math.max(1, Number(world) || WORLD_TILES);
    const idx = Math.max(0, Number(region) || 0);
    return { x: idx % w, y: Math.floor(idx / w) };
  }

  function regionPoint(world, region, localX, localY, margin) {
    const w = Math.max(1, Number(world) || WORLD_TILES);
    const origin = regionOrigin(w, region);
    const edge = Math.max(0, Math.min(0.45, margin == null ? 0.03 : Number(margin) || 0));
    const lx = Math.max(edge, Math.min(1 - edge, Number(localX) || 0));
    const ly = Math.max(edge, Math.min(1 - edge, Number(localY) || 0));
    return { x: (origin.x + lx) / w, y: (origin.y + ly) / w };
  }

  function facingFromIntent(dx, dy) {
    if (!dx && !dy) return null;
    return Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? "west" : "east") : (dy < 0 ? "north" : "south");
  }

  function directionFromDelta(dx, dy, lastDirection) {
    return facingFromIntent(dx, dy) || lastDirection || "south";
  }

  function moveStep(intentX, intentY, speed, dtSec) {
    const ix = Number(intentX) || 0;
    const iy = Number(intentY) || 0;
    const mag = Math.hypot(ix, iy);
    if (!mag) return { dx: 0, dy: 0, facing: null, moving: false };
    // 模拟量保幅：轻推慢走、满推全速；斜向仍归一（不加速）
    const scale = Math.min(1, mag);
    return {
      dx: (ix / mag) * scale * speed * dtSec,
      dy: (iy / mag) * scale * speed * dtSec,
      facing: facingFromIntent(ix, iy),
      moving: true,
    };
  }

  // Movement is stored in normalized world coordinates, while the rendered
  // world is stretched to the viewport's aspect ratio.  A raw equal dx/dy
  // therefore appears faster horizontally on a 16:9 screen.  Compensate the
  // vertical world delta so cardinal and diagonal movement have the same
  // screen-pixel length without changing the input/facing contract.
  function moveStepViewport(intentX, intentY, speed, dtSec, viewport) {
    const moved = moveStep(intentX, intentY, speed, dtSec);
    const width = Math.max(1, Number(viewport && viewport.width) || 1);
    const height = Math.max(1, Number(viewport && viewport.height) || 1);
    return Object.assign({}, moved, { dy: moved.dy * (width / height) });
  }

  function normalizeMap(point, world) {
    const w = Math.max(1, Number(world) || 1);
    const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0));
    return { x: clamp01((Number(point.x) || 0) / w), y: clamp01((Number(point.y) || 0) / w) };
  }

  function worldToScreen(point, camera, viewport, world) {
    const w = Math.max(1, Number(world) || 1);
    const vpW = Number(viewport && viewport.width) || 0;
    const vpH = Number(viewport && viewport.height) || 0;
    return {
      x: ((Number(point.x) || 0) - (Number(camera.x) || 0)) * vpW * w,
      y: ((Number(point.y) || 0) - (Number(camera.y) || 0)) * vpH * w,
    };
  }

  function screenToWorld(px, py, camera, viewport, world) {
    const w = Math.max(1, Number(world) || 1);
    const vpW = Number(viewport && viewport.width) || 0;
    const vpH = Number(viewport && viewport.height) || 0;
    return {
      x: (Number(camera.x) || 0) + (Number(px) || 0) / (vpW * w || 1),
      y: (Number(camera.y) || 0) + (Number(py) || 0) / (vpH * w || 1),
    };
  }

  function clamp01(v) {
    return Math.min(1, Math.max(0, Number(v) || 0));
  }

  function edgeCameraStep(camera, focus, world, dtSec, opts) {
    // 边缘平滑跟随：主角先在屏幕内移动，越出视口内边距（死区）时镜头才以指数
    // 平滑追到使主角回到死区边缘的位置。camera/focus 均为归一化地图坐标 [0,1]，
    // 视口占地图比例为 1/world。
    const w = Math.max(1, Number(world) || 1);
    const o = opts || {};
    const vf = 1 / w;
    const margin = Math.min(0.45, Math.max(0, o.margin != null ? Number(o.margin) : 0.18)) * vf;
    const tau = Math.max(0.001, Number(o.tau != null ? o.tau : 0.12));
    const snap = Math.max(0, o.snapEps != null ? Number(o.snapEps) : 0.0004);
    const maxCam = Math.max(0, 1 - vf);
    const cam = { x: clamp01(camera && camera.x), y: clamp01(camera && camera.y) };
    const fx = clamp01(focus && focus.x);
    const fy = clamp01(focus && focus.y);
    // 硬安全边界：主角一旦越出视口（传送/回弹/瞬移），镜头立即跳到可见，不走平滑
    if (fx < cam.x || fx > cam.x + vf || fy < cam.y || fy > cam.y + vf) {
      const hx = Math.max(0, Math.min(maxCam, fx < cam.x ? fx : Math.min(fx - vf, maxCam)));
      const hy = Math.max(0, Math.min(maxCam, fy < cam.y ? fy : Math.min(fy - vf, maxCam)));
      return { x: hx, y: hy, targetX: hx, targetY: hy };
    }
    // 死区平滑跟随：主角在视口内边距之间移动时镜头静止，越出内边距才指数平滑推进
    let tx = cam.x;
    let ty = cam.y;
    const lo = margin;
    const hi = vf - margin;
    if (fx < cam.x + lo) tx = fx - lo;
    else if (fx > cam.x + hi) tx = fx - hi;
    if (fy < cam.y + lo) ty = fy - lo;
    else if (fy > cam.y + hi) ty = fy - hi;
    tx = Math.max(0, Math.min(maxCam, tx));
    ty = Math.max(0, Math.min(maxCam, ty));
    const dt = Math.max(0, Number(dtSec) || 0);
    const k = dt ? 1 - Math.exp(-dt / tau) : 0;
    const nx = Math.abs(tx - cam.x) < snap ? tx : cam.x + (tx - cam.x) * k;
    const ny = Math.abs(ty - cam.y) < snap ? ty : cam.y + (ty - cam.y) * k;
    return { x: nx, y: ny, targetX: tx, targetY: ty };
  }

  function centerCameraAtFocus(focus, world) {
    const w = Math.max(1, Number(world) || 1);
    const vf = 1 / w;
    const maxCam = Math.max(0, 1 - vf);
    const fx = clamp01(focus && focus.x);
    const fy = clamp01(focus && focus.y);
    return {
      x: Math.max(0, Math.min(maxCam, fx - vf / 2)),
      y: Math.max(0, Math.min(maxCam, fy - vf / 2)),
    };
  }

  function applyDeadZone(value, dead) {
    const v = Number(value) || 0;
    const d = Math.max(0, Math.min(0.9, Number(dead) || 0));
    const a = Math.abs(v);
    if (a <= d) return 0;
    return (v < 0 ? -1 : 1) * ((a - d) / (1 - d));
  }

  function emptyItems() {
    return { peach: 0, fan: 0, gourd: 0, cloud: 0, mantra: 0, staff: 0 };
  }

  function emptyBuffs() {
    return { slowUntil: 0, speedUntil: 0, autoAimShots: 0, hintCharges: 0, comboShield: 0 };
  }

  function nextDropType(killCount) {
    const n = Math.max(1, Number(killCount) || 1);
    return SUPPORT_IDS[(n - 1) % SUPPORT_IDS.length];
  }

  function addItem(items, id) {
    const next = Object.assign(emptyItems(), items);
    if (!SUPPORT_DEFS[id]) return next;
    next[id] = (next[id] || 0) + 1;
    return next;
  }

  function applySupportUse(items, buffs, id, now, shield) {
    const nextItems = Object.assign(emptyItems(), items);
    const nextBuffs = Object.assign(emptyBuffs(), buffs);
    let nextShield = Math.max(0, Math.min(3, Number(shield) || 0));
    if (!nextItems[id]) {
      return { items: nextItems, buffs: nextBuffs, shield: nextShield, toast: "", effect: null, used: false };
    }
    nextItems[id] -= 1;
    const def = SUPPORT_DEFS[id];
    let effect = id;
    if (id === "peach") {
      nextShield = Math.min(3, nextShield + 1);
      effect = "heal";
    } else if (id === "fan") {
      nextBuffs.slowUntil = Math.max(nextBuffs.slowUntil, now + SLOW_MS);
      effect = "slow";
    } else if (id === "gourd") {
      nextBuffs.autoAimShots += AUTO_AIM_SHOTS;
      effect = "autoAim";
    } else if (id === "cloud") {
      nextBuffs.speedUntil = Math.max(nextBuffs.speedUntil, now + SPEED_MS);
      effect = "speed";
    } else if (id === "mantra") {
      nextBuffs.hintCharges += 1;
      effect = "hint";
    } else if (id === "staff") {
      nextBuffs.comboShield += 1;
      effect = "comboShield";
    }
    return { items: nextItems, buffs: nextBuffs, shield: nextShield, toast: def.toastUse, effect, used: true };
  }

  function absorbHit(items, shield) {
    const nextItems = Object.assign(emptyItems(), items);
    const cur = Math.max(0, Math.min(3, Number(shield) || 0));
    if (nextItems.peach > 0) {
      nextItems.peach -= 1;
      return { items: nextItems, shield: cur, absorbed: true };
    }
    return { items: nextItems, shield: Math.max(0, cur - 1), absorbed: false };
  }

  function onCorrectHit(buffs, shield) {
    const nextBuffs = Object.assign(emptyBuffs(), buffs);
    let nextShield = Math.max(0, Math.min(3, Number(shield) || 0));
    if (nextBuffs.comboShield > 0) {
      nextBuffs.comboShield -= 1;
      nextShield = Math.min(3, nextShield + 1);
    }
    return { buffs: nextBuffs, shield: nextShield };
  }

  function heroSpeed(base, buffs, now) {
    return now < (buffs && buffs.speedUntil || 0) ? base * SPEED_MULT : base;
  }

  function monsterSpeed(base, buffs, now) {
    return now < (buffs && buffs.slowUntil || 0) ? base * SLOW_MULT : base;
  }

  function consumeAutoAim(buffs) {
    const next = Object.assign(emptyBuffs(), buffs);
    const armed = next.autoAimShots > 0;
    if (armed) next.autoAimShots -= 1;
    return { buffs: next, armed };
  }

  function consumeHint(buffs) {
    const next = Object.assign(emptyBuffs(), buffs);
    const armed = next.hintCharges > 0;
    if (armed) next.hintCharges -= 1;
    return { buffs: next, armed };
  }

  function hintLetter(term) {
    const t = String(term || "").trim();
    return t ? t.slice(0, 1).toUpperCase() : "";
  }

  function canTalkQuizNpc(firstWaveCleared) {
    return Boolean(firstWaveCleared);
  }

  function nextMapStage(waveIndex, totalWaves, npcDone) {
    const wave = Math.max(0, Number(waveIndex) || 0);
    const total = Math.max(1, Number(totalWaves) || 1);
    if (wave === 0 && total > 1 && !npcDone) return "npc";
    if (wave + 1 < total) return "next-wave";
    return npcDone || total === 1 ? "boss" : "npc";
  }

  function canOpenBoss(remainingMonsters, npcDone) {
    return Math.max(0, Number(remainingMonsters) || 0) === 0 && Boolean(npcDone);
  }

  function isMapRunComplete(stage) {
    return stage === "complete";
  }

  function shouldAutoIntro(fromBattle, introAutoPlayed) {
    return !fromBattle && !introAutoPlayed;
  }

  function canAdvanceDialogue(line, choiceResolved) {
    if (!line) return false;
    if (line.type === "choice" && !choiceResolved) return false;
    return true;
  }

  function pushBattleLog(log, entry, max) {
    const cap = max || 3;
    const next = (Array.isArray(log) ? log.slice() : []).concat(entry);
    return next.slice(-cap);
  }

  function bossHpRatio(idx, total) {
    const n = Number(total) || 0;
    const i = Math.max(0, Number(idx) || 0);
    if (!n) return 0;
    return Math.max(0, Math.min(1, (n - i) / n));
  }

  function resolvePickup(table, ep) {
    const fallback = { id: "peach", nameZh: "仙桃", emoji: "🍑", image: "" };
    const src = table && typeof table === "object" && !Array.isArray(table) ? table : {};
    const items = src.items && typeof src.items === "object" ? src.items : {};
    const byEp = src.byEp && typeof src.byEp === "object" ? src.byEp : {};
    const pick = byEp[String(Math.max(1, Number(ep) || 1))];
    const epHit = pick && typeof pick === "object" ? pick : {};
    const id = String(epHit.id || (src.default && src.default.id) || fallback.id);
    const item = items[id] && typeof items[id] === "object" ? items[id] : {};
    const base = src.default && typeof src.default === "object" ? src.default : {};
    return {
      id,
      nameZh: String(epHit.nameZh || item.nameZh || base.nameZh || fallback.nameZh),
      emoji: String(epHit.emoji || item.emoji || base.emoji || fallback.emoji),
      image: String(epHit.image || item.image || base.image || fallback.image || ""),
    };
  }

  function typingTarget(term) {
    return String(term || "").replace(/[^a-zA-Z]/g, "");
  }

  function typingStep(session, key, target, ignoreCase) {
    const typed = String(session && session.typed || "");
    const wrong = String(session && session.wrong || "");
    const goal = typingTarget(target);
    if (!goal) return { typed: "", wrong: "", status: "ignored" };
    if (key === "Backspace") {
      if (wrong) return { typed, wrong: "", status: "edit" };
      return { typed: typed.slice(0, -1), wrong: "", status: "edit" };
    }
    if (!key || key.length !== 1 || !/[a-zA-Z]/.test(key)) {
      return { typed, wrong, status: "ignored" };
    }
    const want = goal.charAt(typed.length);
    const same = ignoreCase === false ? key === want : key.toLowerCase() === want.toLowerCase();
    if (same) {
      const nextTyped = typed + want;
      if (nextTyped.length >= goal.length) return { typed: nextTyped, wrong: "", status: "complete" };
      return { typed: nextTyped, wrong: "", status: "ok" };
    }
    return { typed, wrong: key, status: "wrong" };
  }

  return {
    WORLD_TILES,
    SUPPORT_IDS,
    SUPPORT_DEFS,
    SLOW_MS,
    SPEED_MS,
    AUTO_AIM_SHOTS,
    SPEED_MULT,
    SLOW_MULT,
    MOVEMENT_SPEEDS,
    PACK,
    chaseAnchor,
    packSeparation,
    spreadPack,
    regionOrigin,
    regionPoint,
    facingFromIntent,
    directionFromDelta,
    moveStep,
    moveStepViewport,
    normalizeMap,
    worldToScreen,
    screenToWorld,
    edgeCameraStep,
    centerCameraAtFocus,
    applyDeadZone,
    emptyItems,
    emptyBuffs,
    nextDropType,
    addItem,
    applySupportUse,
    absorbHit,
    onCorrectHit,
    heroSpeed,
    monsterSpeed,
    consumeAutoAim,
    consumeHint,
    hintLetter,
    canTalkQuizNpc,
    nextMapStage,
    canOpenBoss,
    isMapRunComplete,
    shouldAutoIntro,
    canAdvanceDialogue,
    pushBattleLog,
    bossHpRatio,
    resolvePickup,
    typingTarget,
    typingStep,
  };
});
