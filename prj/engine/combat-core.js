"use strict";

/* combat-core v2：大世界回合制对战纯逻辑核心（P1-2，B 算法层新成员，v3 起所有对战玩法共用）。
 * 无 DOM / 无存储 / 无网络；rng 可注入（确定性测试与模拟）。浏览器网关与捕捉流程见 P1-4。
 * 与 battle-core.judgeHit 共存：野生快速战仍走 v1 判定，本模块服务 Boss / 图鉴妖怪回合制对战。
 *
 * 回合模型（玩家先手）：resolveTurn（玩家选招 + 答题）→ 敌方未倒下则 enemyTurn（效用 AI）→ 回合 +1。
 * 答案正确性即命中：hit = Boolean(answer)；mult = 招式威力 × 属性克制 × 连击加成；
 * dmg = max(1, round(BASE_DAMAGE × mult))；事件日志是唯一表现数据源，UI 按返回增量播动画。
 *
 * API：
 *   createBattle({ player, enemy, elements, moves, rng, seed, id,
 *                  energyStart=3, energyMax=6, energyRegen=1 })
 *     → battle{ id, turn=1, log[], player, enemy, elements, moves, rng, config,
 *               energy{player,enemy}, cooldowns{player,enemy}, combo{player}, stats{playerHits},
 *               over, winner }
 *       player/enemy: { id, nameZh?, element?, hp, maxHp? }（hp>0 必填，maxHp 缺省回填 hp，element 缺省视为中立）；
 *       elements/moves: content/game/elements.json|moves.json 原样对象或其内层 map；
 *       rng 缺省时用 mulberry32(seed)。
 *   availableMoves(battle, side) → 已过滤（冷却清零且体力足够）的招式拷贝数组；side ∈ {"player","enemy"}。
 *   resolveTurn(battle, moveId, answer) → 本次新增事件[]；answer 真值=答对=命中；
 *     招式不可用/未知时发 invalid 事件（reason: cooldown|energy|unknown）且状态不变；终局后返回 []。
 *   enemyTurn(battle) → 本次新增事件[]；效用 = 预期伤害×克制 + 击杀奖励 + 治疗需求 − 冷却惩罚，
 *     平分时用 battle.rng 打破；敌方行动恒命中（学习判定只在玩家侧）；结束回合 turn+1。
 *   elementMultiplier(elements, atkElement, defElement) → strongMult(1.3) | weakMult(0.75) | 1。
 *   catchChance(hpRatio, mastery) → clamp((1−hpRatio)×0.85 + mastery×0.15, 0.05, 0.95)。
 *   result(battle) → null（进行中）| { win, expGain = hits×10 + win?25, catchable, events(日志快照) }。
 *     catchable：非玩家胜 且 敌方存活且 hp/maxHp < 0.3（P1-4 词球投掷前置）。
 *
 * 事件 schema：{ actor, side, move, hit, mult, dmg, hp, faint, catch }（catch 预留 P1-4 捕捉事件，恒 null）；
 * 可选附加：heal（按伤害比例回复量）、invalid+reason（无效行动）。冷却模型：使用后 cdLeft=cooldown+1，
 * 每个己方回合结束 −1（cd1=隔 1 个己方回合，cd0=恒可用）；体力：使用扣 energyCost，己方回合结束 +energyRegen（封顶 energyMax）。
 */
(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BookPlayCombatCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function combatCoreFactory() {
  const BASE_DAMAGE = 10;
  const COMBO_STEP = 0.1;
  const COMBO_CAP = 1.5;
  const KILL_BONUS = 30;
  const HEAL_WEIGHT = 2;
  const COOLDOWN_PENALTY = 0.5;
  const CATCH_HP_RATIO = 0.3;
  const CATCH_BASE = 0.85;
  const CATCH_MASTERY = 0.15;
  const CATCH_MIN = 0.05;
  const CATCH_MAX = 0.95;
  const EXP_PER_HIT = 10;
  const WIN_BONUS = 25;
  const ENERGY_START = 3;
  const ENERGY_MAX = 6;
  const ENERGY_REGEN = 1;

  function num(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function clamp01(value) {
    return Math.min(1, Math.max(0, num(value, 0)));
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function next() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + 0x7e268b2f + (t << 4)) | 0;
      t = (t ^ (t >>> 15)) >>> 0;
      t = Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normalizeElements(raw) {
    const src = raw && typeof raw === "object"
      ? (raw.elements && typeof raw.elements === "object" ? raw.elements : raw)
      : {};
    const table = {};
    Object.keys(src).forEach((key) => {
      const entry = src[key];
      if (!entry || typeof entry !== "object") return;
      table[key] = { strong: String(entry.strong || ""), weak: String(entry.weak || "") };
    });
    return {
      table,
      strongMult: num(raw && raw.strongMult, 1.3),
      weakMult: num(raw && raw.weakMult, 0.75),
    };
  }

  function normalizeMoves(raw) {
    const src = raw && typeof raw === "object"
      ? (raw.moves && typeof raw.moves === "object" ? raw.moves : raw)
      : {};
    const list = [];
    Object.keys(src).forEach((key) => {
      const entry = src[key];
      if (!entry || typeof entry !== "object") return;
      const id = String(entry.id || key);
      list.push({
        id,
        label: String(entry.label || id),
        quizKind: String(entry.quizKind || "meaning-choice"),
        power: Math.max(0, num(entry.power, 1)),
        cooldown: Math.max(0, Math.floor(num(entry.cooldown, 0))),
        energyCost: Math.max(0, Math.floor(num(entry.energyCost, 0))),
        heal: entry.heal != null ? Math.max(0, num(entry.heal, 0)) : 0,
      });
    });
    return list;
  }

  function normalizeFighter(raw, fallbackId) {
    if (!raw || typeof raw !== "object") throw new Error(`combat-core: ${fallbackId} fighter required`);
    const hp = Math.floor(num(raw.hp, 0));
    if (hp <= 0) throw new Error(`combat-core: ${fallbackId}.hp must be > 0`);
    return {
      id: String(raw.id || fallbackId),
      nameZh: String(raw.nameZh || raw.id || fallbackId),
      element: raw.element ? String(raw.element) : null,
      hp,
      maxHp: Math.max(hp, Math.floor(num(raw.maxHp, hp))),
    };
  }

  function elementMultiplier(elements, atk, def) {
    const cfg = elements && elements.table ? elements : normalizeElements(elements);
    const row = atk ? cfg.table[String(atk)] : null;
    if (!row || !def) return 1;
    if (row.strong === String(def)) return cfg.strongMult;
    if (row.weak === String(def)) return cfg.weakMult;
    return 1;
  }

  function createBattle(input) {
    const opts = input || {};
    const player = normalizeFighter(opts.player, "player");
    const enemy = normalizeFighter(opts.enemy, "enemy");
    const config = {
      energyStart: Math.max(0, Math.floor(num(opts.energyStart, ENERGY_START))),
      energyMax: Math.max(1, Math.floor(num(opts.energyMax, ENERGY_MAX))),
      energyRegen: Math.max(0, Math.floor(num(opts.energyRegen, ENERGY_REGEN))),
    };
    const startEnergy = Math.min(config.energyMax, config.energyStart);
    return {
      id: String(opts.id || "battle"),
      turn: 1,
      log: [],
      player,
      enemy,
      elements: normalizeElements(opts.elements),
      moves: normalizeMoves(opts.moves),
      rng: typeof opts.rng === "function" ? opts.rng : mulberry32((opts.seed >>> 0) || 1),
      config,
      energy: { player: startEnergy, enemy: startEnergy },
      cooldowns: { player: {}, enemy: {} },
      combo: { player: 0 },
      stats: { playerHits: 0 },
      over: false,
      winner: null,
    };
  }

  function availableMoves(battle, side) {
    if (!battle || (side !== "player" && side !== "enemy") || battle.over) return [];
    const cds = battle.cooldowns[side];
    const energy = battle.energy[side];
    return battle.moves
      .filter((move) => !(cds[move.id] > 0) && energy >= move.energyCost)
      .map((move) => Object.assign({}, move));
  }

  function makeEvent(actorId, side, moveId, targetHp) {
    return { actor: actorId, side, move: moveId, hit: false, mult: 0, dmg: 0, hp: targetHp, faint: false, catch: null };
  }

  function tickSide(battle, side) {
    const cds = battle.cooldowns[side];
    Object.keys(cds).forEach((id) => {
      if (cds[id] > 0) cds[id] -= 1;
    });
    battle.energy[side] = Math.min(battle.config.energyMax, battle.energy[side] + battle.config.energyRegen);
  }

  function spendMove(battle, side, move) {
    battle.energy[side] -= move.energyCost;
    battle.cooldowns[side][move.id] = move.cooldown + 1;
  }

  function applyHeal(self, move, dmg, event) {
    if (!(move.heal > 0) || dmg <= 0) return;
    const heal = Math.min(self.maxHp - self.hp, Math.round(dmg * move.heal));
    if (heal > 0) {
      self.hp += heal;
      event.heal = heal;
    }
  }

  function resolveTurn(battle, moveId, answer) {
    if (!battle || battle.over) return [];
    const self = battle.player;
    const target = battle.enemy;
    const move = availableMoves(battle, "player").find((entry) => entry.id === moveId) || null;
    if (!move) {
      const cdLeft = battle.cooldowns.player[moveId];
      const reason = cdLeft > 0 ? "cooldown" : (battle.moves.some((entry) => entry.id === moveId) ? "energy" : "unknown");
      const event = makeEvent(self.id, "player", String(moveId || ""), target.hp);
      event.invalid = true;
      event.reason = reason;
      battle.log.push(event);
      return [event];
    }
    spendMove(battle, "player", move);
    const event = makeEvent(self.id, "player", move.id, 0);
    if (Boolean(answer)) {
      battle.combo.player += 1;
      battle.stats.playerHits += 1;
      const elMult = elementMultiplier(battle.elements, self.element, target.element);
      const comboMult = Math.min(COMBO_CAP, 1 + COMBO_STEP * (battle.combo.player - 1));
      const mult = move.power * elMult * comboMult;
      const dmg = Math.max(1, Math.round(BASE_DAMAGE * mult));
      target.hp = Math.max(0, target.hp - dmg);
      event.hit = true;
      event.mult = mult;
      event.dmg = dmg;
      event.hp = target.hp;
      applyHeal(self, move, dmg, event);
      if (target.hp === 0) {
        event.faint = true;
        battle.over = true;
        battle.winner = "player";
      }
    } else {
      battle.combo.player = 0;
      event.hp = target.hp;
    }
    tickSide(battle, "player");
    battle.log.push(event);
    return [event];
  }

  function scoreAiMove(battle, move, elMult) {
    const self = battle.enemy;
    const target = battle.player;
    const expected = BASE_DAMAGE * move.power * elMult;
    let score = expected;
    if (expected >= target.hp) score += KILL_BONUS;
    if (move.heal > 0) score += HEAL_WEIGHT * move.heal * BASE_DAMAGE * (1 - self.hp / self.maxHp);
    return score - move.cooldown * COOLDOWN_PENALTY;
  }

  function pickAiMove(battle, moves) {
    const elMult = elementMultiplier(battle.elements, battle.enemy.element, battle.player.element);
    let best = [];
    let bestScore = -Infinity;
    for (const move of moves) {
      const score = scoreAiMove(battle, move, elMult);
      if (score > bestScore + 1e-9) {
        bestScore = score;
        best = [move];
      } else if (score >= bestScore - 1e-9) {
        best.push(move);
      }
    }
    if (best.length === 1) return best[0];
    return best[Math.floor(battle.rng() * best.length)] || best[0];
  }

  function enemyTurn(battle) {
    if (!battle || battle.over) return [];
    const self = battle.enemy;
    const target = battle.player;
    const moves = availableMoves(battle, "enemy");
    if (!moves.length) {
      const event = makeEvent(self.id, "enemy", null, target.hp);
      event.invalid = true;
      event.reason = "no-moves";
      battle.log.push(event);
      return [event];
    }
    const move = pickAiMove(battle, moves);
    spendMove(battle, "enemy", move);
    const elMult = elementMultiplier(battle.elements, self.element, target.element);
    const mult = move.power * elMult;
    const dmg = Math.max(1, Math.round(BASE_DAMAGE * mult));
    target.hp = Math.max(0, target.hp - dmg);
    const event = makeEvent(self.id, "enemy", move.id, target.hp);
    event.hit = true;
    event.mult = mult;
    event.dmg = dmg;
    applyHeal(self, move, dmg, event);
    if (target.hp === 0) {
      event.faint = true;
      battle.over = true;
      battle.winner = "enemy";
    }
    tickSide(battle, "enemy");
    battle.turn += 1;
    battle.log.push(event);
    return [event];
  }

  function catchChance(hpRatio, mastery) {
    const chance = (1 - clamp01(hpRatio)) * CATCH_BASE + clamp01(mastery) * CATCH_MASTERY;
    return Math.min(CATCH_MAX, Math.max(CATCH_MIN, chance));
  }

  function result(battle) {
    if (!battle || !battle.over) return null;
    const win = battle.winner === "player";
    const catchable = !win
      && battle.enemy.hp > 0
      && battle.enemy.hp / battle.enemy.maxHp < CATCH_HP_RATIO;
    return {
      win,
      expGain: battle.stats.playerHits * EXP_PER_HIT + (win ? WIN_BONUS : 0),
      catchable,
      events: battle.log.slice(),
    };
  }

  return {
    createBattle,
    availableMoves,
    resolveTurn,
    enemyTurn,
    elementMultiplier,
    catchChance,
    result,
  };
});
