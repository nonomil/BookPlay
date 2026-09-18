"use strict";

/* 词田与商店浮层（自包含，运行时注入 HUD，不改 game.js/game.html 逻辑层）。
 * 依赖：schedule-core / economy-core / farm-core / battle-core(词球组卷) +
 * window.BookPlayGameDebug（level/monster 状态只读）。
 * 存储：bookplay_farm_v1 {schedule, gold, plots}；教育联动：收获=词卡、枯萎=词进错词。 */
(function () {
  const Schedule = window.BookPlayScheduleCore;
  const Economy = window.BookPlayEconomyCore;
  const Farm = window.BookPlayFarmCore;
  const Battle = window.BookPlayBattleCore;
  if (!Schedule || !Economy || !Farm || !Battle) return;

  const KEY_FARM = "bookplay_farm_v1";
  const GOLD_PER_STAR = 5;
  const WATER_ENERGY = 1;
  const SEED_GOLD = null; // 种子免费 v1（词必须来自本集词表=先学后种）

  let farmJson = null;
  let economyJson = null;
  let state = null;
  let els = null;
  let farmAudio = null;

  function readStore(key) {
    try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (_) { return null; }
  }
  function writeStore(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  function fetchJSON(url) {
    return fetch(url, { cache: "no-store" }).then((res) => (res.ok ? res.json() : null));
  }

  function debugState() {
    return window.BookPlayGameDebug || null;
  }

  function handheldOffline() {
    try {
      return document.documentElement.hasAttribute("data-handheld");
    } catch (_) {
      return false;
    }
  }

  function resolveFarmAudio() {
    const dbg = debugState();
    if (dbg && dbg.audio && typeof dbg.audio.play === "function") return dbg.audio;
    if (farmAudio) return farmAudio;
    if (window.BookPlayGameAudio && typeof window.BookPlayGameAudio.createGameAudio === "function") {
      farmAudio = window.BookPlayGameAudio.createGameAudio({});
      return farmAudio;
    }
    return null;
  }

  function speakFarmWord(text) {
    const term = String(text || "").trim();
    if (!term) return;
    const audio = resolveFarmAudio();
    if (audio) {
      try { return audio.play({ ref: `word:${term}:en`, text: term, lang: "en-US" }); }
      catch (_) { return; }
    }
    if (handheldOffline()) return;
    try {
      const el = new Audio();
      window.BookPlayAudio?.watchMedia(el);
      el.src = "/api/tts?voice=en&text=" + encodeURIComponent(term);
      el.currentTime = 0;
      el.play().catch(() => {});
    } catch (_) { /* 无 TTS 环境静默 */ }
  }

  function today() {
    return Schedule.toLocalDateString(new Date());
  }

  function loadFarm() {
    const saved = readStore(KEY_FARM) || {};
    const sched = Schedule.rollover(saved.schedule, today(), 0);
    if (sched.newDay && sched.state.day > 1) {
      const result = Farm.witherCheck({ plots: saved.plots || [] }, today(), farmJson);
      saved.plots = result.state.plots;
      result.withered.forEach((w) => queueWrongWord(w.word));
    }
    state = {
      schedule: sched.state,
      gold: Math.max(0, Number(saved.gold) || 0),
      plots: Farm.normalize({ plots: saved.plots }, farmJson).plots,
      countedStars: Math.max(0, Number(saved.countedStars) || 0),
    };
    syncGoldFromStars();
    saveFarm();
  }

  function saveFarm() {
    writeStore(KEY_FARM, {
      schedule: state.schedule,
      gold: state.gold,
      plots: state.plots,
      countedStars: state.countedStars,
    });
  }

  /* 星星变现：每颗新获得的星 +5 金币（战斗/答题的自然产出） */
  function syncGoldFromStars() {
    const dbg = debugState();
    if (!dbg) return;
    const stars = Math.max(0, Number(dbg.stars) || 0);
    if (stars > state.countedStars) {
      state.gold += (stars - state.countedStars) * GOLD_PER_STAR;
      state.countedStars = stars;
    }
  }

  function queueWrongWord(term) {
    if (!term) return;
    const dbg = debugState();
    if (dbg && dbg.wrongWords) dbg.wrongWords[term] = (dbg.wrongWords[term] || 0) + 1;
  }

  /* ---------- UI 注入 ---------- */

  function inject() {
    const hud = document.querySelector(".game-hud");
    if (!hud) return;
    const goldPill = document.createElement("div");
    goldPill.className = "game-pill";
    goldPill.setAttribute("aria-label", "金币");
    goldPill.innerHTML = "🪙 <strong id=\"farm-gold\">0</strong>";
    const farmBtn = document.createElement("button");
    farmBtn.type = "button";
    farmBtn.className = "game-hudbtn";
    farmBtn.id = "farm-open";
    farmBtn.tabIndex = 0;
    farmBtn.textContent = "🌱 词田";
    const shopBtn = document.createElement("button");
    shopBtn.type = "button";
    shopBtn.className = "game-hudbtn";
    shopBtn.id = "shop-open";
    shopBtn.tabIndex = 0;
    shopBtn.textContent = "🏪 商店";
    hud.insertBefore(goldPill, hud.querySelector(".game-exit"));
    hud.insertBefore(farmBtn, hud.querySelector(".game-exit"));
    hud.insertBefore(shopBtn, hud.querySelector(".game-exit"));

    const root = document.getElementById("game-root") || document.body;
    els = { panel: document.createElement("section") };
    els.panel.className = "game-panel farm-panel";
    els.panel.id = "farm-panel";
    els.panel.hidden = true;
    root.appendChild(els.panel);

    farmBtn.addEventListener("click", () => openPanel("farm"));
    shopBtn.addEventListener("click", () => openPanel("shop"));
  }

  function openPanel(kind) {
    syncGoldFromStars();
    renderPanel(kind);
    els.panel.hidden = false;
    saveFarm();
    updateGold();
  }

  function closePanel() {
    els.panel.hidden = true;
    saveFarm();
  }

  function updateGold() {
    const el = document.getElementById("farm-gold");
    if (el) el.textContent = String(state.gold);
  }

  function renderPanel(kind) {
    const p = els.panel;
    p.textContent = "";
    const title = document.createElement("h2");
    title.className = "battle-panel-title";
    title.textContent = kind === "farm"
      ? `🌱 词田 · 第${state.schedule.day}天 · ⚡${state.schedule.energy}/${state.schedule.energyMax}`
      : `🏪 商店 · 🪙${state.gold}`;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "battle-secondary";
    close.tabIndex = 0;
    close.textContent = "关闭";
    close.addEventListener("click", closePanel);
    p.append(title, close);
    if (kind === "farm") renderFarm(p);
    else renderShop(p);
  }

  /* ---------- 词田 ---------- */

  function renderFarm(panel) {
    const grid = document.createElement("div");
    grid.className = "farm-grid";
    state.plots.forEach((plot) => {
      const cell = document.createElement("div");
      cell.className = "farm-plot is-" + plot.state;
      const tileMap = { empty: "tile-01-empty", planted: plot.progress >= 1 ? "tile-05-growing" : "tile-03-seeded", grown: "tile-06-ripe" };
      const tile = tileMap[plot.state] || "tile-01-empty";
      cell.style.backgroundImage = `url("../assets/game-farm/${tile}.png")`;
      cell.style.backgroundSize = "cover";
      cell.style.backgroundPosition = "center";
      const label = document.createElement("span");
      label.className = "farm-plot-word";
      if (plot.state === "empty") label.textContent = "空地 · 点此种词";
      else if (plot.state === "planted") label.textContent = `${plot.word} · 浇水(${plot.progress})`;
      else if (plot.state === "grown") label.textContent = `${plot.word} · 可收获！`;
      cell.appendChild(label);
      const action = document.createElement("button");
      action.type = "button";
      action.className = "farm-plot-action";
      action.tabIndex = 0;
      if (plot.state === "empty") {
        action.textContent = "🌱 种";
        action.addEventListener("click", () => seedFlow(plot.id));
      } else if (plot.state === "planted") {
        action.textContent = "💧 浇水";
        action.addEventListener("click", () => waterFlow(plot.id));
      } else {
        action.textContent = "🧺 收获";
        action.addEventListener("click", () => harvestFlow(plot.id));
      }
      cell.appendChild(action);
      grid.appendChild(cell);
    });
    panel.appendChild(grid);
    const hint = document.createElement("p");
    hint.className = "farm-hint";
    hint.textContent = "种=选一个本集词；浇水=答对它的意思；成熟收词卡+金币；忘照料会枯萎。";
    panel.appendChild(hint);
  }

  function seedFlow(plotId) {
    const dbg = debugState();
    const words = (dbg && dbg.level && dbg.level.previewWords) || [];
    if (!words.length) { showToast("先进入一集的地图才有词可种"); return; }
    renderSeedPicker(words, plotId);
  }

  function renderSeedPicker(words, plotId) {
    const p = els.panel;
    p.textContent = "";
    const title = document.createElement("h2");
    title.className = "battle-panel-title";
    title.textContent = "选一个词种下（先点♪听一遍）";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "battle-secondary";
    close.tabIndex = 0;
    close.textContent = "返回";
    close.addEventListener("click", () => { openPanel("farm"); });
    p.append(title, close);
    const grid = document.createElement("div");
    grid.className = "farm-grid";
    words.forEach((word) => {
      const cell = document.createElement("div");
      cell.className = "farm-plot is-planted";
      const speak = document.createElement("button");
      speak.type = "button";
      speak.className = "farm-word-speak";
      speak.tabIndex = 0;
      speak.textContent = `♪ ${word.term}`;
      speak.addEventListener("click", () => {
        speakFarmWord(word.term);
      });
      const pick = document.createElement("button");
      pick.type = "button";
      pick.className = "farm-plot-action";
      pick.tabIndex = 0;
      pick.textContent = "种下";
      pick.addEventListener("click", () => {
        const r = Farm.seed(state, plotId, word.term, today());
        if (r.ok) { saveFarm(); openPanel("farm"); }
      });
      cell.append(speak, pick);
      grid.appendChild(cell);
    });
    p.appendChild(grid);
  }

  function waterFlow(plotId) {
    // 体力只预检不预扣：答对才算复习成功才扣（答错不惩罚体力，儿童友好）
    if (state.schedule.energy < WATER_ENERGY) { showToast("体力不足，明天再来浇 ⚡"); return; }
    const plot = Farm.normalize({ plots: state.plots }, farmJson).plots.find((x) => x.id === plotId);
    const word = plot ? plot.word : null;
    const dbg = debugState();
    const pool = (dbg && dbg.level && dbg.level.previewWords) || [];
    const question = pool.find((w) => w.term === word) || { term: word, zh: word };
    const seedNum = (state.schedule.day * 1000) + plotId.charCodeAt(1) * 7;
    const set = Battle.buildOrbSet({ term: question.term, zh: question.zh }, pool, seedNum);
    renderQuiz({
      prompt: `「${question.term}」的意思是？`,
      orbs: set.orbs.map((o) => o.zh),
      correct: question.zh,
      onAnswer: (correct) => {
        if (!correct) {
          queueWrongWord(question.term);
          showToast("答错了，查查字典再来浇 💧");
        } else {
          const spend = Schedule.spend(state.schedule, WATER_ENERGY); // 答对才扣体力
          state.schedule = spend.state;
          const r = Farm.water(state, plotId, today(), farmJson);
          showToast(r.ok ? (r.grown ? "成熟了！🧺" : "浇水成功 💧") : "今天已经浇过了");
        }
        saveFarm();
        openPanel("farm");
      },
    });
  }

  function harvestFlow(plotId) {
    const r = Farm.harvest(state, plotId, farmJson);
    if (!r.ok) { showToast("还不能收获"); return; }
    state.gold += r.rewards.gold;
    showToast(`收获「${r.rewards.word}」词卡 +🪙${r.rewards.gold}`);
    saveFarm();
    openPanel("farm");
  }

  /* ---------- 商店 ---------- */

  function renderShop(panel) {
    const table = Economy.items(economyJson);
    const grid = document.createElement("div");
    grid.className = "farm-grid is-shop";
    Object.entries(table).forEach(([id, entry]) => {
      const cell = document.createElement("div");
      cell.className = "farm-plot is-shop-item";
      const label = document.createElement("span");
      label.className = "farm-plot-word";
      label.textContent = `${entry.label || id} · 🪙${entry.buy}`;
      cell.appendChild(label);
      const buy = document.createElement("button");
      buy.type = "button";
      buy.className = "farm-plot-action";
      buy.tabIndex = 0;
      buy.textContent = "购买";
      buy.addEventListener("click", () => {
        const price = Economy.price(economyJson, id, "buy");
        const result = Economy.pay(state.gold, price);
        if (!result.ok) { showToast("金币不足 🪙"); return; }
        state.gold = result.gold;
        const dbg = debugState();
        if (dbg && dbg.items && typeof dbg.items[id] === "number") {
          dbg.items[id] += 1; // 直接进战斗道具栏（丢怪/使用由 game 页承担）
        }
        saveFarm();
        updateGold();
        showToast(`买到 ${entry.label || id} ×1`);
        renderShop(panel);
      });
      cell.appendChild(buy);
      grid.appendChild(cell);
    });
    panel.appendChild(grid);
    const hint = document.createElement("p");
    hint.className = "farm-hint";
    hint.textContent = "金币来源：战斗星星（1⭐=5🪙）与词田收获。道具买完在右上支援栏使用。";
    panel.appendChild(hint);
  }

  /* ---------- 浇水答题 ---------- */

  function renderQuiz(quiz) {
    const p = els.panel;
    p.textContent = "";
    const title = document.createElement("h2");
    title.className = "battle-panel-title";
    title.textContent = quiz.prompt;
    const grid = document.createElement("div");
    grid.className = "farm-quiz";
    quiz.orbs.forEach((zh) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.tabIndex = 0;
      btn.textContent = zh;
      btn.addEventListener("click", () => quiz.onAnswer(zh === quiz.correct));
      grid.appendChild(btn);
    });
    p.append(title, grid);
  }

  function showToast(text) {
    let toast = document.getElementById("game-toast");
    if (toast) {
      toast.textContent = text;
      toast.hidden = false;
      window.clearTimeout(showToast.t);
      showToast.t = window.setTimeout(() => { toast.hidden = true; }, 1800);
      return;
    }
    showToast.t = window.setTimeout(() => {}, 0);
  }

  function boot() {
    if (!document.querySelector(".game-hud")) return;
    Promise.all([
      fetchJSON("../data/game/farm.json"),
      fetchJSON("../data/game/economy.json"),
    ]).then(([farm, economy]) => {
      farmJson = farm || {};
      economyJson = economy || {};
      loadFarm();
      inject();
      updateGold();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
}());
