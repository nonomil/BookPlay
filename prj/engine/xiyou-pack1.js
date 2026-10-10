"use strict";

/* 西游包1浏览器网关：任务卡 → 同屏 1 妖 → 选词打小收服 → 任务星 / 再来一趟。
 * 纯逻辑在 xiyou-pack1-core.js。不启动捡球投掷主循环。
 */
(function () {
  const Core = window.BookPlayXiyouPack1Core;
  const Battle = window.BookPlayBattleCore;
  const Game = window.BookPlayGameCore;
  const Util = window.BookPlayGameCommon;
  if (!Core || !Util) return;

  const KEY_PROGRESS = "bookplay_battle_progress_v1";
  const KEY_COLLECTION = "bookplay_battle_collection_v1";
  const KEY_WEAK = "bookplay_weak_v1";

  const $ = (id) => document.getElementById(id);

  function floatText(text, good, at) {
    const el = document.createElement("span");
    el.className = "pack1-float " + (good ? "is-good" : "is-miss");
    el.textContent = text;
    const x = at ? at.x : window.innerWidth * 0.72;
    const y = at ? at.y : window.innerHeight * 0.34;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    document.body.appendChild(el);
    window.setTimeout(() => el.remove(), 1000);
  }

  function demonPoint() {
    const demon = $("pack1-demon");
    if (!demon) return null;
    const rect = demon.getBoundingClientRect();
    return { x: rect.left + rect.width * 0.45, y: rect.top + rect.height * 0.35 };
  }

  function spriteNode(sprites, spriteId, fallback) {
    const entry = sprites && sprites[spriteId];
    const src = entry && entry.gif
      ? Util.assetUrl(entry.gif)
      : entry && entry.walk && entry.walk.south && entry.walk.south[0]
        ? Util.assetUrl(entry.walk.south[0])
        : "";
    if (!src) {
      const ph = document.createElement("div");
      ph.className = "pack1-ph";
      ph.textContent = fallback || "妖";
      return ph;
    }
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    img.decoding = "async";
    img.addEventListener("error", () => {
      const ph = document.createElement("div");
      ph.className = "pack1-ph";
      ph.textContent = fallback || "妖";
      img.replaceWith(ph);
    });
    return img;
  }

  function start(ctx) {
    const ep = Number(ctx && ctx.ep) || 1;
    const level = ctx && ctx.level;
    const sprites = (ctx && ctx.sprites) || {};
    const leaveUrl = (ctx && ctx.leaveUrl) || "map.html";
    const speakTerm = ctx && ctx.speakTerm;
    const persistWeak = ctx && ctx.persistWeak;
    const readStore = ctx && ctx.readStore || Util.readStore;
    const writeStore = ctx && ctx.writeStore || Util.writeStore;
    const weakState = (ctx && ctx.weakState) || { weakWords: {} };

    const root = $("game-root");
    if (root) root.classList.add("is-pack1");
    const sceneHud = {
      stars: $("game-stars"),
      progress: $("game-progress"),
      shields: $("game-shields"),
    };

    const quest = Core.questCard(ep);
    const run = Core.buildRun(level);
    let seed = ((Number(level && level.seedBase) || ep) * 17) >>> 0;
    let locked = false;

    function hud() {
      if (sceneHud.stars) sceneHud.stars.textContent = String(run.starsHud || 0);
      const total = run.minions.length + run.bossWords.length;
      const done = run.captured + run.bossIndex;
      if (sceneHud.progress) sceneHud.progress.textContent = `${Math.min(done, total)} / ${total}`;
      if (sceneHud.shields) {
        sceneHud.shields.textContent = "🛡️".repeat(run.lives) + "⬜".repeat(Math.max(0, run.livesMax - run.lives));
      }
    }

    function show(id) {
      ["pack1-quest", "pack1-arena", "pack1-result"].forEach((name) => {
        const el = $(name);
        if (el) el.hidden = name !== id;
      });
    }

    function renderDemon() {
      const box = $("pack1-demon");
      if (!box) return;
      const word = Core.currentWord(run);
      box.textContent = "";
      box.classList.remove("is-hurt", "is-hit");
      const hits = word && word.hitsLeft != null ? word.hitsLeft : 1;
      box.classList.toggle("is-small", run.phase === "arena" && hits === 1 && hits > 0);
      box.classList.toggle("is-tiny", run.phase === "boss");
      const hp = document.createElement("div");
      hp.className = "pack1-hp";
      hp.id = "pack1-hp";
      hp.setAttribute("aria-label", "妖怪血条");
      const fill = document.createElement("span");
      fill.className = "pack1-hp-fill";
      fill.id = "pack1-hp-fill";
      const view = Core.hpView(run);
      fill.style.width = `${Math.round(view.ratio * 100)}%`;
      hp.appendChild(fill);
      const bubble = document.createElement("p");
      bubble.className = "pack1-bubble";
      bubble.id = "pack1-bubble";
      const line = document.createElement("span");
      line.textContent = Core.demonLine(run);
      bubble.appendChild(line);
      if (word && word.kind === "picture-choice" && word.illustration) {
        const pic = document.createElement("img");
        pic.className = "pack1-pic";
        pic.src = Util.assetUrl(word.illustration);
        pic.alt = "";
        bubble.appendChild(pic);
      }
      const sprite = (word && word.sprite) || run.boss.sprite || "monkey-minor";
      box.append(bubble, hp, spriteNode(sprites, sprite, "妖"));
    }

    function renderShouts() {
      const prompt = Core.currentPrompt(run, seed);
      const sheet = $("pack1-prompt");
      const choices = $("pack1-choices");
      if (sheet) {
        sheet.hidden = true;
        sheet.textContent = "";
      }
      if (!prompt || !choices) return;
      if (prompt.listen && speakTerm) speakTerm(prompt.term, "en");
      choices.textContent = "";
      prompt.choices.forEach((choice) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "pack1-choice";
        btn.textContent = choice.en;
        btn.tabIndex = 0;
        btn.addEventListener("click", () => onChoose(choice.en, btn));
        choices.appendChild(btn);
      });
      const skip = document.createElement("button");
      skip.type = "button";
      skip.className = "pack1-skip";
      skip.id = "pack1-skip";
      skip.textContent = "不会";
      skip.tabIndex = 0;
      skip.addEventListener("click", onSkip);
      choices.appendChild(skip);
    }

    function paintArena() {
      show("pack1-arena");
      const hero = $("pack1-hero");
      if (hero && !hero.dataset.ready) {
        hero.appendChild(spriteNode(sprites, run.hero.id || "wukong", "悟"));
        hero.dataset.ready = "1";
      }
      renderDemon();
      renderShouts();
      hud();
    }

    function rememberWeak(term, result) {
      if (!Game || !term) return;
      weakState.weakWords = Game.recordWeakAnswer(weakState.weakWords, term, result);
      if (typeof persistWeak === "function") persistWeak();
      else {
        const all = readStore(KEY_WEAK);
        all[String(ep)] = weakState.weakWords;
        writeStore(KEY_WEAK, all);
      }
    }

    function persist(settle) {
      const progress = readStore(KEY_PROGRESS);
      const prev = progress[ep] || progress[String(ep)] || {};
      progress[ep] = Core.progressPatch(prev, settle, { captured: run.captured });
      writeStore(KEY_PROGRESS, progress);
      if (settle && settle.passed) {
        const collection = readStore(KEY_COLLECTION);
        writeStore(KEY_COLLECTION, Core.collectionPatch(collection, run.boss.id, level && level.collection));
      }
    }

    function showResult() {
      const prev = (readStore(KEY_PROGRESS)[ep] || {});
      const settle = Core.settlePack1(run, prev, Battle && Battle.settleRun);
      persist(settle);
      show("pack1-result");
      const box = $("pack1-result");
      box.className = "pack1-layer";
      box.textContent = "";
      const card = document.createElement("div");
      card.className = "pack1-result";
      const title = document.createElement("h2");
      const stars = document.createElement("div");
      stars.className = "pack1-stars";
      const copy = document.createElement("p");
      const again = document.createElement("button");
      again.type = "button";
      again.className = "game-primary";
      again.tabIndex = 0;
      if (settle.passed) {
        title.textContent = settle.awardFirstStar ? "收服成功 · 任务星" : "又收服了一趟";
        stars.textContent = settle.awardFirstStar ? "⭐".repeat(settle.stars) : "再打不另发首次星";
        copy.textContent = "师徒继续赶路。英语已经用在这一击里了。";
        again.textContent = "再来一趟";
      } else {
        title.textContent = "还没收服";
        stars.textContent = "";
        copy.textContent = "不发首次通关星，也不推进下一关。再念一回名号！";
        again.textContent = "再来一趟";
      }
      again.addEventListener("click", () => window.location.reload());
      const back = document.createElement("button");
      back.type = "button";
      back.className = "battle-secondary";
      back.tabIndex = 0;
      back.textContent = (ctx && ctx.fromLesson) ? "回课堂" : "回地图";
      back.addEventListener("click", () => {
        window.location.href = leaveUrl;
      });
      card.append(title, stars, copy, again, back);
      box.appendChild(card);
      hud();
    }

    function playStrike(verdict, btn) {
      const demon = $("pack1-demon");
      const hero = $("pack1-hero");
      const at = demonPoint();
      const struck = verdict.correct && !verdict.skipped;
      floatText(verdict.floatText, struck, at);
      if (struck) {
        window.BookPlayAudio?.sfx("attack");
        window.BookPlayAudio?.sfx("correct");
        if (demon) demon.classList.add("is-hit");
        if (hero) hero.classList.add("is-lunge");
        const stage = document.querySelector(".pack1-stage");
        if (stage) {
          const slash = document.createElement("span");
          slash.className = "pack1-slash is-on";
          slash.setAttribute("aria-hidden", "true");
          stage.appendChild(slash);
          window.setTimeout(() => slash.remove(), 480);
        }
        const fill = $("pack1-hp-fill");
        const max = Math.max(1, Number(verdict.hpMax) || 1);
        const left = Math.max(0, Number(verdict.hpLeft) || 0);
        if (fill) fill.style.width = `${Math.round((left / max) * 100)}%`;
        if (at && window.BookPlayGameFeedback && window.BookPlayGameFeedback.spawnStar) {
          window.BookPlayGameFeedback.spawnStar(at.x, at.y);
          window.BookPlayGameFeedback.spawnStar(at.x - 22, at.y - 16);
        }
      } else {
        window.BookPlayAudio?.sfx("retry");
        if (demon) demon.classList.add("is-hurt");
        if (btn) btn.classList.add("is-wrong");
        const bubble = $("pack1-bubble");
        if (bubble) {
          const line = bubble.querySelector("span") || bubble;
          line.textContent = `${verdict.floatText}。再喊一次！`;
        }
      }
      hud();
    }

    function afterVerdict(verdict, btn) {
      playStrike(verdict, btn);
      window.setTimeout(() => {
        locked = false;
        if (run.finished) showResult();
        else {
          seed = (seed + 31) >>> 0;
          paintArena();
        }
      }, verdict.correct ? 720 : 640);
    }

    function onChoose(en, btn) {
      if (locked || run.finished) return;
      locked = true;
      const word = Core.currentWord(run);
      const verdict = Core.applyChoice(run, en);
      if (word) rememberWeak(word.term, { correct: Boolean(verdict.correct) });
      afterVerdict(verdict, btn);
    }

    function onSkip() {
      if (locked || run.finished) return;
      locked = true;
      const word = Core.currentWord(run);
      const verdict = Core.applySkip(run);
      if (word) {
        rememberWeak(word.term, { correct: false });
        rememberWeak(word.term, { correct: false });
      }
      afterVerdict(verdict);
    }

    function bindQuest() {
      const host = $("pack1-quest");
      if (!host) return;
      host.textContent = "";
      host.className = "pack1-layer";
      const card = document.createElement("div");
      card.className = "pack1-quest";
      const kicker = document.createElement("span");
      kicker.className = "pack1-kicker";
      kicker.textContent = `${quest.placeZh} · 第 ${ep} 集`;
      const title = document.createElement("h2");
      title.textContent = quest.verbZh;
      const en = document.createElement("p");
      en.className = "pack1-en";
      en.textContent = quest.verbEn;
      const story = document.createElement("p");
      story.textContent = quest.story;
      const go = document.createElement("button");
      go.type = "button";
      go.className = "pack1-verb";
      go.id = "pack1-verb";
      go.tabIndex = 0;
      go.textContent = quest.button;
      go.addEventListener("click", () => {
        Core.enterArena(run);
        paintArena();
      });
      card.append(kicker, title, en, story, go);
      host.appendChild(card);
    }

    const heroBox = $("pack1-hero");
    if (heroBox) heroBox.textContent = "";
    bindQuest();
    show("pack1-quest");
    hud();
    window.BookPlayXiyouPack1Run = run;
  }

  window.BookPlayXiyouPack1 = {
    isDefaultPath: Core.isDefaultPath,
    start,
    PLAY_FIRST_EXPERIMENT: Core.PLAY_FIRST_EXPERIMENT,
  };
}());
