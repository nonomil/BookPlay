"use strict";

/* 降妖记战斗页浏览器网关：阶段机（剧情→预习→小怪波→Boss→测验→结算）、
 * 渲染与输入（触屏 + tv-remote D-pad）、进度存储。
 * 纯逻辑在 battle-core.js，关卡数据由 build_game_levels.py 派生（../data/game/levels）。
 * 存储键合同：bookplay_battle_progress_v1 / bookplay_battle_collection_v1。
 */
(function () {
  const Core = window.BookPlayBattleCore;
  const Game = window.BookPlayGameCore;
  const Quiz = window.BookPlayEpisodeVocabQuiz;

  const params = new URLSearchParams(window.location.search);
  const EP = Math.max(1, Number(params.get("ep")) || 1);
  const SKIP = new Set((params.get("skip") || "").split(",").filter(Boolean));
  const FROM_GAME = params.get("from") === "game";
  const URL_WRONG = (params.get("wrong") || "").split(",").filter(Boolean);

  const KEY_PROGRESS = "bookplay_battle_progress_v1";
  const KEY_COLLECTION = "bookplay_battle_collection_v1";

  const $ = (id) => document.getElementById(id);
  const els = {
    backdrop: $("battle-backdrop"),
    hero: $("battle-hero"),
    monsters: $("battle-monsters"),
    projectiles: $("battle-projectiles"),
    shields: $("battle-shields"),
    progress: $("battle-progress"),
    combo: $("battle-combo"),
    defend: $("battle-defend"),
    exit: $("battle-exit"),
    prompt: $("battle-prompt"),
    promptKicker: $("battle-prompt-kicker"),
    promptMain: $("battle-prompt-main"),
    promptSub: $("battle-prompt-sub"),
    listen: $("battle-listen"),
    turn: $("battle-turn"),
    hpDock: $("battle-hp-dock"),
    heroHpName: $("battle-hero-hp-name"),
    heroHpFill: $("battle-hero-hp-fill"),
    skillBanner: $("battle-skill-banner"),
    bossbar: $("battle-bossbar"),
    bossName: $("battle-boss-name"),
    bossHp: $("battle-boss-hp"),
    bossHpFill: $("battle-boss-hp-fill"),
    battleLog: $("battle-log"),
    dialogue: $("battle-dialogue"),
    dialogueFace: $("battle-dialogue-face"),
    dialogueEn: $("battle-dialogue-en"),
    dialogueZh: $("battle-dialogue-zh"),
    dialogueReplay: $("battle-dialogue-replay"),
    dialogueNext: $("battle-dialogue-next"),
    preview: $("battle-preview"),
    previewCards: $("battle-preview-cards"),
    previewStart: $("battle-preview-start"),
    orbs: $("battle-orbs"),
    quiz: $("battle-quiz"),
    result: $("battle-result"),
    pause: $("battle-pause"),
    gate: $("battle-gate"),
    toast: $("battle-toast"),
  };

  const state = {
    level: null,
    sprites: {},
    taunts: {},
    audio: null,
    audioIndex: {},
    dialogueLine: null,
    phase: "loading",
    waveIndex: 0,
    questions: [],
    questionIdx: 0,
    shield: 3,
    combo: { streak: 0 },
    wrongWords: {},
    killed: 0,
    bossIdx: 0,
    roundId: 0,
    roundLocked: false,
    quizItems: [],
    quizIdx: 0,
    answers: {},
    quizPassed: false,
    finished: false,
    battleLog: [],
    kit: null,
    defendLeft: 1,
    defendArmed: false,
    bossRound: null,
    typing: null,
    typingTimer: 0,
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

  let audioEl = null;
  function speakTerm(text) {
    if (!text) return;
    if (state.audio) {
      const term = String(text).trim();
      return state.audio.play({ ref: `word:${term}:en`, text: term, lang: "en-US" });
    }
    try {
      audioEl = audioEl || new Audio();
      window.BookPlayAudio?.watchMedia(audioEl);
      audioEl.src = "/api/tts?voice=en&text=" + encodeURIComponent(text);
      audioEl.currentTime = 0;
      audioEl.play().catch(() => {});
    } catch (_) { /* 无 TTS 环境静默 */ }
  }

  function speakDialogue(line) {
    if (!line) return;
    if (state.audio) {
      const textEn = String(line.textEn || "").trim();
      const textZh = String(line.textZh || "").trim();
      const ref = line.audioRef || `dialogue:${line.id || `ep${EP}-story-intro-${introIdx + 1}`}:en`;
      return state.audio.play({
        ref,
        text: textEn || textZh,
        lang: textEn ? "en-US" : "zh-CN",
      });
    }
    return speakTerm(line.textEn || line.textZh);
  }

  function stopAudio(reason) {
    state.audio?.stop(reason);
    if (audioEl) {
      try { audioEl.pause(); } catch (_) { /* platform boundary */ }
    }
  }

  function replayDialogue() {
    const line = state.dialogueLine;
    if (!line) return;
    const expectedRef = line.audioRef || `dialogue:${line.id || `ep${EP}-story-intro-${introIdx + 1}`}:en`;
    const last = state.audio?.getState?.().lastRequest;
    const lastRef = typeof last === "string" ? last : last && (last.ref || last.audioRef || last.id);
    if (state.audio && lastRef === expectedRef) state.audio.replay();
    else speakDialogue(line);
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

  function spriteNode(spriteId, fallbackText) {
    const entry = state.sprites[spriteId];
    const src = entry && entry.gif
      ? assetUrl(entry.gif)
      : entry && entry.walk && entry.walk.south && entry.walk.south[0]
        ? assetUrl(entry.walk.south[0])
        : entry && typeof entry === "object" && entry.source === "walker-fallback"
          ? assetUrl(entry.gif)
          : "";
    if (!src) {
      const ph = document.createElement("div");
      ph.className = "battle-sprite-placeholder";
      ph.textContent = fallbackText || "妖";
      return ph;
    }
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    img.decoding = "async";
    img.addEventListener("error", () => {
      const ph = document.createElement("div");
      ph.className = "battle-sprite-placeholder";
      ph.textContent = fallbackText || "妖";
      img.replaceWith(ph);
    });
    return img;
  }

  function showPanel(name) {
    [els.dialogue, els.preview, els.quiz, els.result, els.pause].forEach((el) => {
      el.hidden = el !== name;
    });
  }

  function updateHud() {
    els.shields.textContent = "♥".repeat(state.shield) + "♡".repeat(Math.max(0, 3 - state.shield));
    if (els.heroHpFill) els.heroHpFill.style.width = `${(state.shield / 3) * 100}%`;
    const total = state.level
      ? state.level.waves.reduce((sum, wave) => sum + wave.monsters.length, 0) + state.level.boss.hpWords.length
      : 0;
    els.progress.textContent = `${state.killed} / ${total}`;
    els.combo.textContent = `连击 ${state.combo.streak}`;
    if (els.defend) els.defend.disabled = !state.defendLeft && !state.defendArmed;
  }

  function showSkillBanner(name) {
    if (!els.skillBanner || !name) return;
    els.skillBanner.hidden = false;
    els.skillBanner.textContent = name;
    window.setTimeout(() => {
      if (els.skillBanner.textContent === name) els.skillBanner.hidden = true;
    }, 900);
  }

  function flashClass(el, className, ms) {
    if (!el) return;
    el.classList.add(className);
    window.setTimeout(() => el.classList.remove(className), ms || 450);
  }

  function showSkillFx(skill, atEl, side) {
    if (!skill || !atEl) return;
    showSkillBanner(skill.nameZh);
    const candidates = Core.resolveSkillFx(skill, side || "hero", state.kit && state.kit.genericFx);
    if (!candidates.length) return;
    const img = document.createElement("img");
    img.className = "battle-skill-fx";
    img.alt = "";
    let idx = 0;
    const tryNext = () => {
      if (idx >= candidates.length) {
        img.remove();
        return;
      }
      img.src = assetUrl(candidates[idx]);
      idx += 1;
    };
    img.addEventListener("error", tryNext);
    const rect = atEl.getBoundingClientRect();
    img.style.left = `${rect.left + rect.width / 2}px`;
    img.style.top = `${rect.top + rect.height / 2}px`;
    els.projectiles.appendChild(img);
    tryNext();
    window.setTimeout(() => img.remove(), 900);
  }

  function armDefend() {
    if (state.phase !== "boss") return;
    const next = Core.applyDefend({ defendLeft: state.defendLeft, defendArmed: state.defendArmed });
    if (!next.ok) {
      showToast(state.defendArmed ? "护体已经亮着" : "这场护体用过了", 1400);
      return;
    }
    state.defendLeft = next.defendLeft;
    state.defendArmed = next.defendArmed;
    els.hero.classList.add("is-guard");
    const defend = state.kit && state.kit.hero && state.kit.hero.skills && state.kit.hero.skills.defend;
    showSkillFx(defend, els.hero, "hero");
    updateHud();
  }

  /* ---------- 阶段：开场剧情 ---------- */

  let introIdx = 0;
  function showIntro() {
    state.phase = "intro";
    const lines = state.level.intro;
    if (SKIP.has("intro") || !lines.length) {
      showPreview();
      return;
    }
    showPanel(els.dialogue);
    renderIntroLine();
  }

  function renderIntroLine() {
    const line = state.level.intro[introIdx];
    state.dialogueLine = line;
    els.dialogueEn.textContent = line.textEn;
    els.dialogueZh.textContent = line.textZh || "";
    if (line.illustration) {
      els.dialogueFace.src = assetUrl(line.illustration);
      els.dialogueFace.style.display = "";
      els.dialogueFace.addEventListener("error", () => {
        els.dialogueFace.style.display = "none";
      }, { once: true });
    } else {
      els.dialogueFace.style.display = "none";
    }
    if (els.dialogueReplay) els.dialogueReplay.hidden = !(line.textEn || line.textZh);
    speakDialogue(line);
    els.dialogueNext.textContent = introIdx + 1 >= state.level.intro.length ? "开始预习 ▶" : "继续 ▶";
  }

  function onIntroNext() {
    stopAudio("next");
    introIdx += 1;
    if (introIdx >= state.level.intro.length) {
      showPreview();
      return;
    }
    renderIntroLine();
  }

  /* ---------- 阶段：战前预习 ---------- */

  function showPreview() {
    stopAudio("next");
    state.phase = "preview";
    if (SKIP.has("preview")) {
      startWave(0);
      return;
    }
    showPanel(els.preview);
    els.previewCards.textContent = "";
    state.level.previewWords.forEach((word) => {
      const card = document.createElement("div");
      card.className = "battle-word-card";
      if (word.illustration) {
        const img = document.createElement("img");
        img.src = assetUrl(word.illustration);
        img.alt = "";
        img.decoding = "async";
        img.addEventListener("error", () => img.remove());
        card.appendChild(img);
      }
      const term = document.createElement("span");
      term.className = "battle-word-term";
      term.textContent = word.term;
      const ipa = document.createElement("span");
      ipa.className = "battle-word-ipa";
      ipa.textContent = word.ipa || " ";
      const zh = document.createElement("span");
      zh.className = "battle-word-zh";
      zh.textContent = word.zh;
      const hear = document.createElement("button");
      hear.type = "button";
      hear.textContent = "♪";
      hear.setAttribute("aria-label", `朗读 ${word.term}`);
      hear.tabIndex = 0;
      hear.addEventListener("click", () => speakTerm(word.term));
      card.append(term, ipa, zh, hear);
      els.previewCards.appendChild(card);
    });
  }

  /* ---------- 阶段：小怪波 ---------- */

  function startWave(waveIndex) {
    stopAudio("next");
    if (SKIP.has("waves")) {
      startBoss();
      return;
    }
    window.BookPlayAudio?.sfx("start");
    state.phase = "wave";
    state.roundLocked = false;
    state.roundId += 1;
    state.waveIndex = waveIndex;
    state.questions = Core.buildWaveQuestions(state.level, waveIndex, state.wrongWords);
    state.questionIdx = 0;
    showPanel(null);
    renderMonsters();
    spawnOrbs();
  }

  function renderMonsters() {
    els.monsters.textContent = "";
    state.questions.forEach((monster, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "battle-monster";
      btn.dataset.idx = String(idx);
      btn.tabIndex = idx === state.questionIdx ? 0 : -1;
      btn.setAttribute("aria-label", `${monster.term}`);
      btn.appendChild(spriteNode(monster.sprite, monster.zh));
      const label = document.createElement("span");
      label.className = "battle-monster-word";
      label.textContent = monster.term;
      btn.appendChild(label);
      btn.addEventListener("click", () => speakTerm(monster.term));
      els.monsters.appendChild(btn);
    });
    focusCurrentMonster();
  }

  function currentMonster() {
    return state.questions[state.questionIdx] || null;
  }

  function focusCurrentMonster() {
    [...els.monsters.children].forEach((child, idx) => {
      const active = idx === state.questionIdx;
      child.setAttribute("aria-current", active ? "true" : "false");
      child.tabIndex = active ? 0 : -1;
    });
  }

  function spawnOrbs() {
    const monster = currentMonster();
    els.orbs.textContent = "";
    if (!monster) return;
    const seed = state.level.seedBase + state.waveIndex * 100 + state.questionIdx * 7;
    const set = Core.buildOrbSet(monster, state.level.previewWords, seed);
    set.orbs.forEach((orb) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "battle-orb";
      btn.textContent = orb.zh;
      btn.tabIndex = 0;
      btn.addEventListener("click", () => throwOrb(orb, btn));
      els.orbs.appendChild(btn);
    });
  }

  function throwOrb(orb, orbBtn) {
    if (state.phase !== "wave" && state.phase !== "boss") return;
    if (state.roundLocked) return;
    const monster = currentMonster();
    if (!monster || orbBtn.classList.contains("is-spent")) return;
    orbBtn.classList.add("is-spent");
    state.roundLocked = true;
    const roundId = ++state.roundId;
    flyProjectile(orbBtn, els.monsters.children[state.questionIdx], () => {
      if (roundId !== state.roundId) return;
      resolveHit(orb, monster, orbBtn);
    });
  }

  function flyProjectile(fromEl, toEl, onArrive) {
    window.BookPlayAudio?.sfx("attack");
    const shot = document.createElement("span");
    shot.className = "battle-projectile";
    shot.textContent = "✦";
    const fromRect = fromEl.getBoundingClientRect();
    const toRect = (toEl || els.hero).getBoundingClientRect();
    shot.style.left = `${fromRect.left + fromRect.width / 2}px`;
    shot.style.top = `${fromRect.top}px`;
    els.projectiles.appendChild(shot);
    window.requestAnimationFrame(() => {
      shot.style.transform = `translate(${toRect.left + toRect.width / 2 - (fromRect.left + fromRect.width / 2)}px, ${toRect.top - fromRect.top}px) scale(0.6)`;
      shot.style.opacity = "0.4";
    });
    window.setTimeout(() => {
      shot.remove();
      if (onArrive) onArrive();
    }, 460);
  }

  function resolveHit(orb, monster, orbBtn) {
    state.roundLocked = false;
    const verdict = Core.judgeHit(orb, monster, state.combo);
    if (!verdict.correct) window.BookPlayAudio?.sfx("shield");
    const monsterEl = els.monsters.children[state.questionIdx];
    if (verdict.correct) {
      speakTerm(monster.term);
      state.killed += 1;
      if (monsterEl) monsterEl.classList.add("is-dead");
      state.questionIdx += 1;
      if (verdict.comboReady && state.questionIdx < state.questions.length) {
        showToast("棒影连击！连击清场！⚡", 1500);
        for (let i = state.questionIdx; i < state.questions.length; i += 1) {
          const swept = els.monsters.children[i];
          if (swept) {
            swept.classList.add("is-dead");
            const rect = swept.getBoundingClientRect();
            const pop = document.createElement("span");
            pop.className = "battle-dmgpop";
            pop.textContent = `−1  ${state.questions[i].term}`;
            pop.style.left = `${rect.left + rect.width / 2}px`;
            pop.style.top = `${rect.top}px`;
            els.projectiles.appendChild(pop);
            window.setTimeout(() => pop.remove(), 950);
          }
          state.killed += 1;
        }
        state.questionIdx = state.questions.length;
      }
      updateHud();
      if (state.questionIdx >= state.questions.length) {
        window.setTimeout(nextStage, 700);
      } else {
        focusCurrentMonster();
        spawnOrbs();
      }
    } else {
      state.wrongWords[monster.term] = (state.wrongWords[monster.term] || 0) + 1;
      state.shield = Math.max(0, state.shield - 1);
      state.combo.streak = 0;
      if (monsterEl) {
        monsterEl.classList.add("is-hurt");
        window.setTimeout(() => monsterEl.classList.remove("is-hurt"), 300);
      }
      updateHud();
      if (state.shield <= 0) {
        showToast("护盾碎了！小妖重新列阵，别灰心 💪", 2000);
        state.shield = 3;
        window.setTimeout(() => startWave(state.waveIndex), 900);
      } else {
        spawnOrbs();
      }
    }
  }

  function nextStage() {
    if (state.waveIndex + 1 < state.level.waves.length) {
      startWave(state.waveIndex + 1);
    } else {
      startBoss();
    }
  }

  function pushBattleLog(text) {
    state.battleLog = Game.pushBattleLog(state.battleLog, text, 3);
    if (!els.battleLog) return;
    els.battleLog.hidden = false;
    els.battleLog.textContent = "";
    state.battleLog.forEach((line) => {
      const item = document.createElement("li");
      item.textContent = line;
      els.battleLog.appendChild(item);
    });
  }

  function syncBossHpBar() {
    const total = (state.level.boss.hpWords || []).length;
    const idx = state.bossIdx;
    if (els.bossHpFill) {
      els.bossHpFill.style.width = `${Game.bossHpRatio(idx, total) * 100}%`;
    }
    [...els.bossHp.querySelectorAll("span:not(.battle-boss-hp-fill)")].forEach((seg, i) => {
      seg.classList.toggle("is-lost", i < idx);
    });
  }

  /* ---------- 阶段：Boss 战（反向出题） ---------- */

  function startBoss() {
    stopAudio("next");
    state.phase = "boss";
    state.roundLocked = false;
    state.roundId += 1;
    state.bossIdx = 0;
    state.battleLog = [];
    if (els.battleLog) {
      els.battleLog.textContent = "";
      els.battleLog.hidden = true;
    }
    const root = $("battle-root");
    if (root) root.classList.add("is-boss-stage");
    if (els.prompt) els.prompt.hidden = false;
    if (els.hpDock) els.hpDock.hidden = false;
    if (els.defend) els.defend.hidden = false;
    if (els.turn) {
      els.turn.hidden = false;
      els.turn.textContent = "悟空回合";
    }
    if (els.heroHpName) els.heroHpName.textContent = (state.kit && state.kit.hero && state.kit.hero.nameZh) || "孙悟空";
    const boss = state.level.cast.boss;
    state.level.boss.hpWords = Core.reorderBossWords(state.level, state.wrongWords);
    els.bossName.textContent = boss.nameZh;
    els.bossbar.hidden = false;
    els.monsters.textContent = "";
    const bossBtn = document.createElement("div");
    bossBtn.className = "battle-monster";
    bossBtn.id = "battle-boss";
    bossBtn.setAttribute("aria-current", "true");
    bossBtn.appendChild(spriteNode(boss.sprite, boss.nameZh));
    const label = document.createElement("span");
    label.className = "battle-monster-word";
    label.textContent = boss.nameZh;
    bossBtn.appendChild(label);
    els.monsters.appendChild(bossBtn);
    [...els.bossHp.querySelectorAll("span:not(.battle-boss-hp-fill)")].forEach((seg) => seg.remove());
    state.level.boss.hpWords.forEach(() => {
      const seg = document.createElement("span");
      els.bossHp.appendChild(seg);
    });
    syncBossHpBar();
    renderBossOrbs();
  }

  function keyboardOk() {
    try {
      return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    } catch (_) {
      return true;
    }
  }

  function clearTyping() {
    if (state.typingTimer) {
      window.clearTimeout(state.typingTimer);
      state.typingTimer = 0;
    }
    state.typing = null;
    document.removeEventListener("keydown", onTypingKey);
  }

  function paintTyping() {
    const track = $("battle-typing-track");
    if (!track || !state.typing) return;
    const goal = state.typing.goal || "";
    const typed = state.typing.typed || "";
    const wrong = state.typing.wrong || "";
    track.innerHTML = `<span class="is-ok">${typed}</span><span class="is-bad">${wrong}</span><span class="is-rest">${goal.slice(typed.length)}</span>`;
  }

  function finishTyping(status) {
    if (state.phase !== "boss" || !state.bossRound || state.bossRound.kind !== "typing") return;
    const goal = state.bossRound.typingTarget || "";
    const ok = status === "ok";
    clearTyping();
    const host = els.orbs;
    throwBossOrb({ zh: ok ? goal : "" }, host);
  }

  function onTypingKey(event) {
    if (state.phase !== "boss" || !state.typing || state.roundLocked) return;
    if (event.key === "Tab") return;
    const next = Game.typingStep(state.typing, event.key, state.typing.goal, true);
    if (next.status === "ignored") return;
    event.preventDefault();
    state.typing.typed = next.typed;
    state.typing.wrong = next.wrong;
    paintTyping();
    if (next.status === "complete") finishTyping("ok");
  }

  function renderTypingRound(round) {
    els.orbs.textContent = "";
    const wrap = document.createElement("div");
    wrap.className = "battle-typing";
    wrap.innerHTML = `<p class="battle-typing-track" id="battle-typing-track"></p><p class="battle-typing-hint">键盘输入英文</p>`;
    els.orbs.appendChild(wrap);
    state.typing = { typed: "", wrong: "", goal: round.typingTarget || "" };
    paintTyping();
    document.addEventListener("keydown", onTypingKey);
    state.typingTimer = window.setTimeout(() => finishTyping("timeout"), round.timeoutMs || 12000);
  }

  function renderBossOrbs() {
    const hpWords = state.level.boss.hpWords;
    const current = hpWords[state.bossIdx];
    els.orbs.textContent = "";
    clearTyping();
    if (els.listen) els.listen.hidden = true;
    if (!current) return;
    els.bossName.textContent = state.level.cast.boss.nameZh;
    const total = hpWords.length || 1;
    const prefer = state.kit && state.kit.boss && state.kit.boss.special && state.kit.boss.special.preferQuestion;
    const built = Core.buildBossRound(state.level, current, state.bossIdx, {
      seed: state.level.seedBase + 900 + state.bossIdx * 13,
      preferQuestion: prefer,
      lastSlot: state.bossIdx === total - 1,
      hpRatio: Game.bossHpRatio(state.bossIdx, total),
      canType: keyboardOk(),
      canListen: state.ttsOk !== false,
    });
    state.bossRound = built;
    if (els.promptMain) els.promptMain.textContent = built.promptMain || current.zh;
    if (els.promptSub) els.promptSub.textContent = built.promptSub || "";
    if (els.promptKicker) els.promptKicker.textContent = built.promptKicker || "";
    syncBossHpBar();
    if (built.listen && els.listen) {
      els.listen.hidden = false;
      speakTerm(built.playTerm);
    }
    if (built.kind === "typing") {
      renderTypingRound(built);
      return;
    }
    (built.orbs || []).forEach((orb) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "battle-orb";
      btn.textContent = orb.zh;
      btn.tabIndex = 0;
      btn.addEventListener("click", () => throwBossOrb(orb, btn));
      els.orbs.appendChild(btn);
    });
  }

  function throwBossOrb(orb, orbBtn) {
    if (state.phase !== "boss" || state.roundLocked || orbBtn.classList.contains("is-spent")) return;
    orbBtn.classList.add("is-spent");
    state.roundLocked = true;
    const roundId = ++state.roundId;
    const hpWords = state.level.boss.hpWords;
    const hpWord = hpWords[state.bossIdx];
    const answerZh = (state.bossRound && state.bossRound.answerZh) || hpWord.term;
    const verdict = Core.judgeHit(orb, { term: hpWord.term, zh: answerZh }, state.combo);
    const bossEl = $("battle-boss");
    const fromEl = verdict.correct ? els.hero : (bossEl || orbBtn);
    const toEl = verdict.correct ? bossEl : els.hero;
    flyProjectile(fromEl, toEl, () => {
      if (roundId !== state.roundId) return;
      state.roundLocked = false;
      if (verdict.correct) {
        const skill = Core.pickHeroSkill(state.kit, state.combo);
        state.killed += 1;
        state.bossIdx += 1;
        updateHud();
        speakTerm(hpWord.term);
        if (els.turn) els.turn.textContent = "出招！";
        flashClass(els.hero, "is-lunge", 420);
        showSkillFx(skill, bossEl, "hero");
        if (state.bossIdx >= hpWords.length) {
          state.roundLocked = true;
          window.BookPlayAudio?.sfx("reward");
          syncBossHpBar();
          pushBattleLog(`${skill.nameZh} · 打中 ${hpWord.term}`);
          showToast(`${state.level.cast.boss.nameZh} 被打败了！妖怪卡到手 🎴`, 2200);
          window.setTimeout(() => {
            if (shouldSkipEndQuiz()) {
              state.quizPassed = true;
              showResult();
            } else {
              startQuiz();
            }
          }, 1600);
        } else {
          pushBattleLog(`${skill.nameZh} · 打中 ${hpWord.term}`);
          try {
            window.setTimeout(() => {
              if (!bossEl) return;
              flashClass(bossEl, "is-recoil", 450);
              const rect = bossEl.getBoundingClientRect();
              const impact = document.createElement("span");
              impact.className = "game-battle-impact";
              impact.style.left = `${rect.left + rect.width / 2}px`;
              impact.style.top = `${rect.top + rect.height / 2}px`;
              els.projectiles.appendChild(impact);
              window.setTimeout(() => impact.remove(), 550);
              const pop = document.createElement("span");
              pop.className = "battle-dmgpop";
              pop.textContent = `−1  ${hpWord.term}`;
              pop.style.left = `${rect.left + rect.width / 2}px`;
              pop.style.top = `${rect.top}px`;
              els.projectiles.appendChild(pop);
              window.setTimeout(() => pop.remove(), 950);
            }, 120);
            showTaunt();
          } catch (_) { /* 特效失败不阻塞推进 */ }
          if (els.turn) els.turn.textContent = "悟空回合";
          renderBossOrbs();
        }
      } else {
        window.BookPlayAudio?.sfx("shield");
        const total = hpWords.length || 1;
        const hpRatio = Game.bossHpRatio(state.bossIdx, total);
        const skill = Core.pickBossSkill(state.kit, { shieldLeft: state.shield, hpRatio });
        const hit = Core.applyIncomingHit({ shield: state.shield, defendArmed: state.defendArmed });
        state.defendArmed = hit.defendArmed;
        state.shield = hit.shield;
        els.hero.classList.remove("is-guard");
        pushBattleLog(hit.blocked ? `护体挡住 ${skill.nameZh}` : `${skill.nameZh} · 打偏 ${hpWord.term}`);
        state.wrongWords[hpWord.term] = (state.wrongWords[hpWord.term] || 0) + 1;
        updateHud();
        if (els.turn) els.turn.textContent = "妖怪回合";
        flashClass(bossEl, "is-lunge-left", 420);
        showSkillFx(skill, els.hero, "boss");
        if (!hit.blocked) flashClass(els.hero, "is-recoil", 450);
        else showToast("护体金光挡住了！", 1400);
        window.setTimeout(() => { if (els.turn) els.turn.textContent = "悟空回合"; }, 700);
        if (state.shield <= 0) {
          showToast("悟空撑不住了，再来一次！", 2000);
          window.setTimeout(() => {
            state.shield = 3;
            state.defendLeft = Number(state.kit && state.kit.hero && state.kit.hero.skills && state.kit.hero.skills.defend && state.kit.hero.skills.defend.usesPerBattle) || 1;
            state.defendArmed = false;
            if (els.defend) els.defend.disabled = false;
            startBoss();
          }, 900);
          return;
        }
        renderBossOrbs();
      }
    });
  }

  function showTaunt() {
    const ref = state.level.boss.taunts[state.bossIdx % Math.max(1, state.level.boss.taunts.length)];
    if (!ref) return;
    const role = state.taunts[ref.split(".")[0]];
    const idx = Number(ref.split(".")[1]) - 1;
    const line = Array.isArray(role) ? role[idx] : null;
    if (line) showToast(`${line.en}  ${line.zh}`, 2200);
  }

  /* ---------- 阶段：关底测验 ---------- */

  function shouldSkipEndQuiz() {
    return FROM_GAME || SKIP.has("quiz");
  }

  function startQuiz() {
    stopAudio("next");
    state.phase = "quiz";
    state.roundLocked = false;
    state.roundId += 1;
    els.bossbar.hidden = true;
    if (shouldSkipEndQuiz()) {
      state.quizPassed = true;
      showResult();
      return;
    }
    fetchJSON(`../data/storybooks/ep${EP}.json`).then((book) => {
      const questions = book && Array.isArray(book.quiz) ? book.quiz : [];
      if (!questions.length) {
        state.quizPassed = state.shield >= 2;
        showResult();
        return;
      }
      state.quizItems = Quiz.buildEpisodeQuiz(questions, {
        grade: 1,
        intensity: "light",
        seed: `battle-${EP}`,
        targetTerms: state.level.previewWords.map((w) => w.term),
      });
      state.quizIdx = 0;
      state.answers = {};
      showPanel(els.quiz);
      renderQuizQuestion();
    });
  }

  function renderQuizQuestion() {
    const item = state.quizItems[state.quizIdx];
    if (!item) {
      finishQuiz();
      return;
    }
    const display = Quiz.quizDisplay(item);
    els.quiz.textContent = "";
    const title = document.createElement("h2");
    title.className = "battle-panel-title";
    title.textContent = `最后一关！(${state.quizIdx + 1}/${state.quizItems.length})`;
    const prompt = document.createElement("p");
    prompt.style.fontSize = "clamp(16px, 2.6vw, 24px)";
    prompt.textContent = display.promptEn || display.promptZh || "Choose the right one!";
    const promptZh = document.createElement("p");
    promptZh.style.opacity = "0.8";
    promptZh.textContent = display.promptZh && display.promptEn ? display.promptZh : "";
    const grid = document.createElement("div");
    grid.className = "battle-quiz-choices";
    display.choicesEn.forEach((choice, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "battle-quiz-choice";
      btn.tabIndex = 0;
      btn.textContent = choice;
      if (display.choicesZh && display.choicesZh[idx]) {
        btn.textContent += ` · ${display.choicesZh[idx]}`;
      }
      btn.addEventListener("click", () => {
        window.BookPlayAudio?.sfx(idx === item.answer ? "correct" : "retry");
        state.answers[item.id] = idx;
        state.quizIdx += 1;
        renderQuizQuestion();
      });
      grid.appendChild(btn);
    });
    els.quiz.append(title, prompt, promptZh, grid);
  }

  function finishQuiz() {
    const score = Quiz.scoreEpisodeQuiz(state.quizItems, state.answers);
    state.quizPassed = Boolean(score.passed);
    (score.wrong_terms || []).forEach((term) => {
      state.wrongWords[term] = (state.wrongWords[term] || 0) + 1;
    });
    showResult();
  }

  /* ---------- 阶段：结算 ---------- */

  function showResult() {
    stopAudio("complete");
    window.BookPlayAudio?.sfx("complete");
    state.phase = "result";
    state.finished = true;
    els.orbs.textContent = "";
    els.monsters.textContent = "";
    els.bossbar.hidden = true;
    if (els.prompt) els.prompt.hidden = true;
    if (els.hpDock) els.hpDock.hidden = true;
    if (els.defend) els.defend.hidden = true;
    if (els.turn) els.turn.hidden = true;
    if (els.listen) els.listen.hidden = true;
    clearTyping();
    const rootEl = $("battle-root");
    if (rootEl) rootEl.classList.remove("is-boss-stage");
    const run = Core.settleRun({
      cleared: true,
      shieldLeft: state.shield,
      quizPassed: state.quizPassed,
      wrongWords: state.wrongWords,
    });

    const boss = state.level.cast.boss;
    els.result.textContent = "";
    const kicker = document.createElement("span");
    kicker.className = "battle-panel-title";
    kicker.textContent = `${state.level.title.en} · 战斗胜利！`;
    const stars = document.createElement("div");
    stars.className = "battle-stars";
    stars.textContent = "⭐".repeat(run.stars) + "☆".repeat(3 - run.stars);
    const card = document.createElement("div");
    card.className = "battle-card-drop";
    card.appendChild(spriteNode(boss.sprite, boss.nameZh));
    const cardName = document.createElement("div");
    cardName.textContent = `妖怪卡 · ${boss.nameZh}`;
    card.appendChild(cardName);
    // 图鉴登记（P1-6）：Boss 战胜利 = 捕捉入图鉴；小怪标记"曾遇见"
    let dexBadgeText = "";
    try {
      if (window.BookPlayCollectionCore && state.dexJson) {
        const Dex = window.BookPlayCollectionCore;
        const dexStateRaw = readStore("bookplay_dex_v1");
        const firstCatch = !Dex.isCaught(dexStateRaw, boss.id);
        let dexState = Dex.register(dexStateRaw, boss.id, { stars: run.stars });
        state.level.cast.minors.forEach((m) => {
          if (m && m.sprite) dexState = Dex.markSeen(dexState, m.sprite);
        });
        writeStore("bookplay_dex_v1", dexState);
        dexBadgeText = firstCatch ? `🎉 首次捕捉 · 已入图鉴` : "已入图鉴 · ⭐+1";
        const dexBadge = document.createElement("div");
        dexBadge.className = "battle-dex-badge";
        dexBadge.textContent = dexBadgeText;
        card.appendChild(dexBadge);
        const dexLink = document.createElement("a");
        dexLink.className = "battle-dex-link";
        dexLink.href = "dex.html?series=jttw";
        dexLink.tabIndex = 0;
        dexLink.textContent = "📖 打开图鉴";
        card.appendChild(dexLink);
      }
    } catch (_) { /* 图鉴登记失败不阻塞结算 */ }
    const wrongTitle = document.createElement("p");
    const wrongList = document.createElement("div");
    wrongList.className = "battle-wrong-words";
    const wrongTerms = Object.keys(run.wrongWords);
    wrongTitle.textContent = wrongTerms.length ? "下次优先复习这些词：" : "全部答对，太棒了！🎉";
    wrongTerms.forEach((term) => {
      const chip = document.createElement("span");
      chip.textContent = `${term} ×${run.wrongWords[term]}`;
      wrongList.appendChild(chip);
    });
    const again = document.createElement("button");
    again.type = "button";
    again.className = "battle-primary";
    again.tabIndex = 0;
    again.textContent = "再来一次";
    again.addEventListener("click", () => window.location.reload());
    const next = document.createElement("button");
    next.type = "button";
    next.className = "battle-secondary";
    next.tabIndex = 0;
    next.textContent = "下一集 ▶";
    next.addEventListener("click", () => {
      window.location.href = FROM_GAME ? `game.html?ep=${EP + 1}` : "map.html";
    });
    const back = document.createElement("button");
    back.type = "button";
    back.className = "battle-secondary";
    back.tabIndex = 0;
    back.textContent = FROM_GAME ? "回地图继续探险 🗺️" : "回绘本地图";
    back.addEventListener("click", () => {
      window.location.href = mapUrl();
    });
    els.result.append(kicker, stars, card, wrongTitle, wrongList, again, next, back);
    showPanel(els.result);

    const progress = readStore(KEY_PROGRESS);
    const prev = progress[EP] || {};
    progress[EP] = Object.assign({}, prev, {
      stars: Math.max(Number(prev.stars) || 0, run.stars),
      clears: (Number(prev.clears) || 0) + 1,
      wrongWords: run.wrongWords,
      mapStage: FROM_GAME ? "complete" : prev.mapStage,
      updatedAt: new Date().toISOString(),
    });
    writeStore(KEY_PROGRESS, progress);
    const collection = readStore(KEY_COLLECTION);
    if (!collection[boss.id]) {
      collection[boss.id] = { cardLevel: state.level.collection, firstClearAt: new Date().toISOString() };
      writeStore(KEY_COLLECTION, collection);
    }
  }

  /* ---------- 暂停与门禁 ---------- */

  function mapUrl() {
    return FROM_GAME ? `game.html?ep=${EP}&from=battle` : "map.html";
  }

  function bindChrome() {
    const resumePanel = () => {
      window.BookPlayAudio?.resume("battle-pause");
      showPanel(({intro:els.dialogue,preview:els.preview,quiz:els.quiz,result:els.result})[state.phase] || null);
    };
    els.exit.addEventListener("click", () => {
      if (!els.pause.hidden) {resumePanel();return;}
      stopAudio("pause");
      window.BookPlayAudio?.suspend("battle-pause");
      showPanel(els.pause);
    });
    $("battle-resume").addEventListener("click", () => {
      resumePanel();
    });
    $("battle-restart").addEventListener("click", () => { stopAudio("navigation"); window.location.reload(); });
    $("battle-map").addEventListener("click", () => {
      stopAudio("navigation");
      window.location.href = mapUrl();
    });
    if (els.defend) els.defend.addEventListener("click", armDefend);
    if (els.listen) els.listen.addEventListener("click", () => {
      if (state.bossRound && state.bossRound.playTerm) speakTerm(state.bossRound.playTerm);
    });
  }

  function showGate(message) {
    stopAudio("navigation");
    els.gate.textContent = "";
    const title = document.createElement("h2");
    title.className = "battle-panel-title";
    title.textContent = "还没准备好";
    const text = document.createElement("p");
    text.textContent = message;
    const back = document.createElement("button");
    back.type = "button";
    back.className = "battle-primary";
    back.tabIndex = 0;
    back.textContent = "回地图";
    back.addEventListener("click", () => {
      window.location.href = mapUrl();
    });
    els.gate.append(title, text, back);
    els.gate.hidden = false;
    els.monsters.textContent = "";
    els.orbs.textContent = "";
  }

  function renderHero() {
    els.hero.textContent = "";
    els.hero.appendChild(spriteNode(state.level.cast.hero.id, "悟"));
    els.backdrop.style.backgroundImage = state.level.background.illustration
      ? `url("${assetUrl(state.level.background.illustration)}")`
      : "";
    els.backdrop.addEventListener("error", () => {
      els.backdrop.style.backgroundImage = "";
    });
  }

  async function checkTts() {
    try {
      const res = await fetch("/api/tts?voice=en&text=ok", { method: "GET" });
      return res.ok;
    } catch (_) {
      return false;
    }
  }

  function boot() {
    bindChrome();
    checkTts().then((ok) => { state.ttsOk = ok; });
    Promise.all([
      fetchJSON(`../data/game/levels/ep${EP}.json`),
      fetchJSON("../data/game/sprites.json").catch(() => null),
      fetchJSON("../data/game/taunts.json").catch(() => ({})),
      fetchJSON(`../data/game/audio/ep${EP}.json`).catch(() => ({})),
      fetchJSON("../data/game/boss-kits.json").catch(() => null),
      fetchJSON("../data/game/dex.json").catch(() => null),
    ]).then(([rawLevel, registry, taunts, audioIndex, kits, dexJson]) => {
      if (!rawLevel) {
        showGate(`第 ${EP} 集的关卡还没解锁，先去读一读这一集的故事吧！`);
        return;
      }
      const level = Core.buildLevel(rawLevel);
      if (!level) {
        showGate("这一集的关卡数据不完整，请重新生成数据包。");
        return;
      }
      state.level = level;
      state.kit = Core.resolveBossKit(kits, level.cast && level.cast.boss && level.cast.boss.id);
      state.dexJson = dexJson || null;
      state.defendLeft = Number(state.kit.hero && state.kit.hero.skills && state.kit.hero.skills.defend && state.kit.hero.skills.defend.usesPerBattle) || 1;
      state.defendArmed = false;
      state.sprites = Core.loadSprites(registry || null, level.spriteIds);
      state.taunts = taunts && typeof taunts === "object" ? taunts : {};
      state.audioIndex = audioIndex && typeof audioIndex === "object" ? audioIndex : {};
      if (window.BookPlayGameAudio) {
        state.audio = window.BookPlayGameAudio.createGameAudio({
          episode: EP,
          audioIndex: state.audioIndex,
          onState: (status) => {
            if (els.dialogue) els.dialogue.dataset.audioState = status;
          },
        });
      }
      const progress = readStore(KEY_PROGRESS);
      const prevWrong = progress[EP] && progress[EP].wrongWords ? progress[EP].wrongWords : {};
      Object.entries(prevWrong).forEach(([term, count]) => {
        state.wrongWords[term] = count;
      });
      URL_WRONG.forEach((term) => {
        if (term) state.wrongWords[term] = state.wrongWords[term] || 1;
      });
      renderHero();
      updateHud();
      showIntro();
    });
  }

  els.dialogueNext.addEventListener("click", onIntroNext);
  els.dialogueReplay?.addEventListener("click", replayDialogue);
  els.previewStart.addEventListener("click", () => startWave(0));
  window.addEventListener("pagehide", () => stopAudio("navigation"));
  document.addEventListener("visibilitychange", () => { if (document.hidden) stopAudio("navigation"); });
  boot();
}());
