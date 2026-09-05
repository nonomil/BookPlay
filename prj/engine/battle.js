"use strict";

/* 降妖记战斗页浏览器网关：阶段机（剧情→预习→小怪波→Boss→测验→结算）、
 * 渲染与输入（触屏 + tv-remote D-pad）、进度存储。
 * 纯逻辑在 battle-core.js，关卡数据由 build_game_levels.py 派生（../data/game/levels）。
 * 存储键合同：bookplay_battle_progress_v1 / bookplay_battle_collection_v1。
 */
(function () {
  const Core = window.BookPlayBattleCore;
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
    exit: $("battle-exit"),
    bossbar: $("battle-bossbar"),
    bossName: $("battle-boss-name"),
    bossHp: $("battle-boss-hp"),
    dialogue: $("battle-dialogue"),
    dialogueFace: $("battle-dialogue-face"),
    dialogueEn: $("battle-dialogue-en"),
    dialogueZh: $("battle-dialogue-zh"),
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
    phase: "loading",
    waveIndex: 0,
    questions: [],
    questionIdx: 0,
    shield: 3,
    combo: { streak: 0 },
    wrongWords: {},
    killed: 0,
    bossIdx: 0,
    quizItems: [],
    quizIdx: 0,
    answers: {},
    quizPassed: false,
    finished: false,
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
    try {
      audioEl = audioEl || new Audio();
      window.BookPlayAudio?.watchMedia(audioEl);
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
    els.shields.textContent = "🛡️".repeat(state.shield) + "⬜".repeat(Math.max(0, 3 - state.shield));
    const total = state.level
      ? state.level.waves.reduce((sum, wave) => sum + wave.monsters.length, 0) + state.level.boss.hpWords.length
      : 0;
    els.progress.textContent = `${state.killed} / ${total}`;
    els.combo.textContent = `连击 ${state.combo.streak}`;
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
    els.dialogueNext.textContent = introIdx + 1 >= state.level.intro.length ? "开始预习 ▶" : "继续 ▶";
  }

  function onIntroNext() {
    introIdx += 1;
    if (introIdx >= state.level.intro.length) {
      showPreview();
      return;
    }
    renderIntroLine();
  }

  /* ---------- 阶段：战前预习 ---------- */

  function showPreview() {
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
    if (SKIP.has("waves")) {
      startBoss();
      return;
    }
    window.BookPlayAudio?.sfx("start");
    state.phase = "wave";
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
    const monster = currentMonster();
    if (!monster || orbBtn.classList.contains("is-spent")) return;
    orbBtn.classList.add("is-spent");
    flyProjectile(orbBtn, els.monsters.children[state.questionIdx], () => {
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
    const verdict = Core.judgeHit(orb, monster, state.combo);
    if (!verdict.correct) window.BookPlayAudio?.sfx("shield");
    const monsterEl = els.monsters.children[state.questionIdx];
    if (verdict.correct) {
      speakTerm(monster.term);
      state.killed += 1;
      if (monsterEl) monsterEl.classList.add("is-dead");
      state.questionIdx += 1;
      if (verdict.comboReady && state.questionIdx < state.questions.length) {
        showToast("金箍棒横扫！连击清场！⚡", 1500);
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

  /* ---------- 阶段：Boss 战（反向出题） ---------- */

  function startBoss() {
    state.phase = "boss";
    state.bossIdx = 0;
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
    els.bossHp.textContent = "";
    state.level.boss.hpWords.forEach(() => {
      const seg = document.createElement("span");
      els.bossHp.appendChild(seg);
    });
    renderBossOrbs();
  }

  function renderBossOrbs() {
    const hpWords = state.level.boss.hpWords;
    const current = hpWords[state.bossIdx];
    els.orbs.textContent = "";
    if (!current) return;
    els.bossName.textContent = `${state.level.cast.boss.nameZh} · 击败「${current.zh}」`;
    [...els.bossHp.children].forEach((seg, idx) => {
      seg.classList.toggle("is-lost", idx < state.bossIdx);
    });
    const pool = hpWords.map((w) => ({ term: w.zh, zh: w.term }))
      .concat(state.level.previewWords.map((w) => ({ term: w.zh, zh: w.term })));
    const seed = state.level.seedBase + 900 + state.bossIdx * 13;
    const set = Core.buildOrbSet({ term: current.zh, zh: current.term }, pool, seed);
    set.orbs.forEach((orb) => {
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
    if (state.phase !== "boss" || orbBtn.classList.contains("is-spent")) return;
    orbBtn.classList.add("is-spent");
    const hpWords = state.level.boss.hpWords;
    const hpWord = hpWords[state.bossIdx];
    flyProjectile(orbBtn, $("battle-boss"), () => {
      const verdict = Core.judgeHit(orb, { term: hpWord.term, zh: hpWord.term }, state.combo);
      if (!verdict.correct) window.BookPlayAudio?.sfx("shield");
      if (verdict.correct) {
        state.killed += 1;
        state.bossIdx += 1;
        updateHud();
        if (state.bossIdx >= hpWords.length) {
          window.BookPlayAudio?.sfx("reward");
          els.bossHp.textContent = "";
          [...Array(hpWords.length)].forEach(() => {
            const seg = document.createElement("span");
            seg.classList.add("is-lost");
            els.bossHp.appendChild(seg);
          });
          showToast(`${state.level.cast.boss.nameZh} 被打败了！妖怪卡到手 🎴`, 2200);
          window.setTimeout(startQuiz, 1600);
        } else {
          try {
            const heroEl = els.hero;
            heroEl.classList.add("is-lunge");
            window.setTimeout(() => heroEl.classList.remove("is-lunge"), 420);
            speakTerm(hpWord.term);
            window.setTimeout(() => {
              const bossEl = $("battle-boss");
              if (!bossEl) return;
              bossEl.classList.add("is-recoil");
              window.setTimeout(() => bossEl.classList.remove("is-recoil"), 450);
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
          renderBossOrbs();
        }
      } else {
        state.wrongWords[hpWord.term] = (state.wrongWords[hpWord.term] || 0) + 1;
        state.combo.streak = 0;
        state.shield = Math.max(0, state.shield - 1);
        updateHud();
        if (state.shield <= 0) {
          showToast("护盾碎了！深呼吸，再试一次 💪", 2000);
          state.shield = 3;
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

  function startQuiz() {
    state.phase = "quiz";
    els.bossbar.hidden = true;
    if (SKIP.has("quiz")) {
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
    window.BookPlayAudio?.sfx("complete");
    state.phase = "result";
    state.finished = true;
    els.orbs.textContent = "";
    els.monsters.textContent = "";
    els.bossbar.hidden = true;
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
      window.location.href = `battle.html?ep=${EP + 1}`;
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
    progress[EP] = {
      stars: Math.max(Number(prev.stars) || 0, run.stars),
      clears: (Number(prev.clears) || 0) + 1,
      wrongWords: run.wrongWords,
      updatedAt: new Date().toISOString(),
    };
    writeStore(KEY_PROGRESS, progress);
    const collection = readStore(KEY_COLLECTION);
    if (!collection[boss.id]) {
      collection[boss.id] = { cardLevel: state.level.collection, firstClearAt: new Date().toISOString() };
      writeStore(KEY_COLLECTION, collection);
    }
  }

  /* ---------- 暂停与门禁 ---------- */

  function mapUrl() {
    return FROM_GAME ? `game.html?ep=${EP}` : "map.html";
  }

  function bindChrome() {
    const resumePanel = () => {
      window.BookPlayAudio?.resume("battle-pause");
      showPanel(({intro:els.dialogue,preview:els.preview,quiz:els.quiz,result:els.result})[state.phase] || null);
    };
    els.exit.addEventListener("click", () => {
      if (!els.pause.hidden) {resumePanel();return;}
      window.BookPlayAudio?.suspend("battle-pause");
      showPanel(els.pause);
    });
    $("battle-resume").addEventListener("click", () => {
      resumePanel();
    });
    $("battle-restart").addEventListener("click", () => window.location.reload());
    $("battle-map").addEventListener("click", () => {
      window.location.href = mapUrl();
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

  function boot() {
    bindChrome();
    Promise.all([
      fetchJSON(`../data/game/levels/ep${EP}.json`),
      fetchJSON("../data/game/sprites.json").catch(() => null),
      fetchJSON("../data/game/taunts.json").catch(() => ({})),
    ]).then(([rawLevel, registry, taunts]) => {
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
      state.sprites = Core.loadSprites(registry || null, level.spriteIds);
      state.taunts = taunts && typeof taunts === "object" ? taunts : {};
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
  els.previewStart.addEventListener("click", () => startWave(0));
  boot();
}());
