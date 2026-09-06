"use strict";

/* 亲子互动卡页面（方向 B：纯看图题，与知识巩固题型零重叠）。
 * URL: parent.html?ep=N（西游记 jttw）
 * 题型：看图识字（指图）／看图拼词（字母片）／读句选图（剧照三选一）。
 * 只有鼓励没有判定记录：⭐ 每卡一次，写入 bookplay_parent_card_v1；不发 SP。
 * 进度由 WalaWalkerProgress 小人从左到右呈现（按集选角色）。
 */
(function parentMain() {
  const Core = window.WalaParentCore;
  const STORE_KEY = "bookplay_parent_card_v1";

  const params = new URLSearchParams(location.search);
  const ep = Math.max(1, parseInt(params.get("ep") || "1", 10) || 1);

  const $ = (id) => document.getElementById(id);
  const el = {
    back: $("parent-back"), title: $("parent-title"), starCount: $("parent-star-count"),
    question: $("parent-question"),
    prompt: $("parent-prompt"),
    slots: $("parent-slots"),
    choices: $("parent-choices"),
    illustration: $("parent-illustration"),
    img: $("parent-img"), imgEmpty: $("parent-img-empty"), word: $("parent-word"),
    answer: $("parent-answer"), answerEn: $("parent-answer-en"), answerZh: $("parent-answer-zh"),
    hear: $("parent-hear"), star: $("parent-star"),
    status: $("parent-status"), prev: $("parent-prev"), next: $("parent-next"),
    walker: $("parent-walker"), audio: $("parent-audio"),
  };

  let book = null;
  let cards = [];
  let index = 0;
  let stars = 0;
  let walker = null;
  const starredCards = new Set();
  const solvedCards = new Set();

  function readStore() {
    try {
      const value = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch (_) {
      return {};
    }
  }

  function writeStore(value) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(value)); } catch (_) { /* 存不下就仅本次鼓励 */ }
  }

  function setStatus(message, tone) {
    el.status.textContent = message || "";
    el.status.classList.toggle("ok", tone === "ok");
  }

  function renderStars() {
    el.starCount.textContent = String(stars);
  }

  /* ---------- 媒体 ---------- */

  function playUrl(url) {
    return new Promise((resolve) => {
      el.audio.onended = () => { el.audio.onended = null; resolve(true); };
      el.audio.onerror = () => { el.audio.onended = null; resolve(false); };
      el.audio.src = url;
      el.audio.play().catch(() => resolve(false));
    });
  }

  function speak(text) {
    return playUrl(`/api/tts?voice=en&text=${encodeURIComponent(text)}`);
  }

  /* ---------- 通用渲染 ---------- */

  function setCardImage(card) {
    const candidates = [card.frame, card.illustration].filter(Boolean);
    if (!candidates.length) {
      el.img.onerror = null;
      el.img.hidden = true;
      el.imgEmpty.hidden = false;
      return;
    }
    let i = 0;
    el.img.onerror = () => {
      i += 1;
      if (i < candidates.length) el.img.src = `../${candidates[i]}`;
      else { el.img.onerror = null; el.img.hidden = true; el.imgEmpty.hidden = false; }
    };
    el.img.hidden = false;
    el.imgEmpty.hidden = true;
    el.img.src = `../${candidates[0]}`;
  }

  function hideStage() {
    el.illustration.hidden = true;
    el.img.hidden = true;
    el.imgEmpty.hidden = true;
  }

  function showCard(i) {
    if (i < 0 || i >= cards.length) return;
    try { el.audio.pause(); } catch (_) { /* 未播放则忽略 */ }
    index = i;
    const card = cards[index];
    const solved = solvedCards.has(index);
    el.question.textContent = card.question;

    el.prompt.classList.toggle("hidden", card.type !== "readMatch");
    el.slots.classList.toggle("hidden", card.type !== "spell");
    el.choices.classList.toggle("hidden", false);
    el.word.classList.toggle("hidden", card.type !== "picture");
    el.answer.hidden = true;
    el.hear.hidden = false;

    if (card.type === "picture") {
      el.illustration.hidden = false;
      el.illustration.disabled = false;
      el.illustration.classList.remove("found");
      setCardImage(card);
      el.word.innerHTML = `关键词：<b>${card.term}</b> · ${card.zh}`;
      el.choices.textContent = "";
      if (solved) el.illustration.classList.add("found");
      setStatus(solved ? "这张已经夸过啦，翻下一张吧" : "让孩子指一指，然后点图片听发音");
    } else if (card.type === "spell") {
      el.illustration.hidden = false;
      el.illustration.disabled = true;
      setCardImage(card);
      el.word.innerHTML = `提示：${card.zh} · ${card.term.length} 个字母`;
      renderSpellState(card, solved);
      setStatus(solved ? "拼对啦！翻下一张吧" : "点字母片，拼出画面上的单词");
    } else {
      hideStage();
      el.choices.textContent = "";
      el.word.innerHTML = "";
      el.prompt.textContent = card.sentence;
      renderReadMatchState(card, solved);
      setStatus(solved ? "选对啦！翻下一张吧" : "听家长读完，点出对应的画面");
    }

    el.prev.disabled = index === 0;
    el.next.disabled = index === cards.length - 1;
    el.star.disabled = solved;
    if (walker) walker.setProgress(index + 1, cards.length);
  }

  function shuffle(list) {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /* ---------- 看图识字 ---------- */

  /* ---------- 看图拼词 ---------- */

  function renderSpellState(card, solved) {
    el.slots.textContent = "";
    for (let i = 0; i < card.term.length; i += 1) {
      const slot = document.createElement("span");
      slot.className = "spell-slot";
      slot.addEventListener("click", () => undoLastLetter());
      if (solved) {
        slot.textContent = card.term[i].toUpperCase();
        slot.dataset.letter = card.term[i].toLowerCase();
        slot.classList.add("filled", "correct");
      }
      el.slots.append(slot);
    }
    renderSpellLetters(card, solved);
  }

  function spellPlaced() {
    return [...el.slots.querySelectorAll(".spell-slot")].map((s) => s.dataset.letter).filter(Boolean);
  }

  function renderSpellLetters(card, solved) {
    el.choices.textContent = "";
    const placed = spellPlaced();
    const remaining = {};
    card.letters.forEach((l) => { remaining[l] = (remaining[l] || 0) + 1; });
    placed.forEach((l) => { remaining[l] = (remaining[l] || 0) - 1; });
    shuffle(card.letters).forEach((letter) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "choice-btn letter-chip";
      chip.textContent = letter.toUpperCase();
      chip.dataset.letter = letter;
      if (solved || (remaining[letter] || 0) <= 0) chip.disabled = true;
      else chip.addEventListener("click", () => placeLetter(chip, letter));
      el.choices.append(chip);
    });
  }

  function placeLetter(chip, letter) {
    if (solvedCards.has(index)) return;
    const slot = [...el.slots.querySelectorAll(".spell-slot:not(.filled)")][0];
    if (!slot) return;
    slot.textContent = letter.toUpperCase();
    slot.dataset.letter = letter;
    slot.classList.add("filled");
    chip.disabled = true;
    const slots = [...el.slots.querySelectorAll(".spell-slot")];
    if (slots.every((s) => s.classList.contains("filled"))) checkSpell(card, slots);
  }

  function undoLastLetter() {
    if (solvedCards.has(index)) return;
    const slots = [...el.slots.querySelectorAll(".spell-slot.filled:not(.correct)")];
    if (!slots.length) return;
    const slot = slots[slots.length - 1];
    const letter = (slot.dataset.letter || "").toLowerCase();
    slot.textContent = "";
    delete slot.dataset.letter;
    slot.classList.remove("filled");
    el.choices.querySelectorAll(".choice-btn").forEach((chip) => {
      if ((chip.dataset.letter || "") === letter && chip.disabled) chip.disabled = false;
    });
  }

  function checkSpell(card, slots) {
    const attempt = slots.map((s) => (s.dataset.letter || "")).join("");
    if (attempt === card.term.toLowerCase()) {
      solvedCards.add(index);
      slots.forEach((s) => { s.classList.add("correct"); s.disabled = true; });
      el.choices.querySelectorAll(".choice-btn").forEach((chip) => { chip.disabled = true; });
      el.star.disabled = false;
      setStatus(`拼对啦！${card.zh} 就是 ${card.term}`, "ok");
      speak(card.term);
      starCurrent();
    } else {
      el.slots.classList.add("wrong");
      setTimeout(() => {
        el.slots.classList.remove("wrong");
        slots.forEach((s) => {
          s.textContent = "";
          delete s.dataset.letter;
          s.classList.remove("filled");
        });
        renderSpellLetters(card, false);
      }, 550);
      setStatus("顺序不对，再想一想～ 点格子可以撤销");
    }
  }

  /* ---------- 读句选图 ---------- */

  function renderReadMatchState(card, solved) {
    el.choices.textContent = "";
    shuffle(card.options).forEach((frame) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice-btn frame-option";
      btn.dataset.frame = frame;
      const img = document.createElement("img");
      img.src = `../${frame}`;
      img.alt = "剧照选项";
      btn.append(img);
      if (solved) {
        btn.disabled = true;
        if (frame === card.frame) btn.classList.add("correct");
      } else {
        btn.addEventListener("click", () => onReadMatchChoice(btn, card, frame));
      }
      el.choices.append(btn);
    });
  }

  function onReadMatchChoice(btn, card, frame) {
    if (solvedCards.has(index)) return;
    if (frame === card.frame) {
      solvedCards.add(index);
      el.choices.querySelectorAll(".choice-btn").forEach((node) => {
        node.disabled = true;
        if (node.dataset.frame === card.frame) node.classList.add("correct");
      });
      el.answerEn.textContent = card.sentence;
      el.answerZh.textContent = card.sentenceZh || "";
      el.answer.hidden = false;
      el.star.disabled = false;
      setStatus("选对啦！再跟读一遍这句话吧", "ok");
      speak(card.sentence);
      starCurrent();
    } else {
      btn.classList.add("wrong");
      setTimeout(() => btn.classList.remove("wrong"), 500);
      setStatus("不是这张，再听一遍句子～");
    }
  }

  /* ---------- 通用交互 ---------- */

  el.hear.addEventListener("click", () => {
    const card = cards[index];
    if (!card) return;
    if (card.type === "readMatch") speak(card.sentence);
    else speak(card.term);
  });

  el.illustration.addEventListener("click", () => {
    const card = cards[index];
    if (!card || card.type !== "picture") return;
    el.illustration.classList.add("found");
    setStatus(`这就是 ${card.zh}（${card.term}）`);
    speak(card.term);
  });

  el.star.addEventListener("click", () => {
    if (starredCards.has(index)) return;
    starCurrent();
    setStatus("夸到啦！孩子开口就是胜利 🎉");
  });

  function starCurrent() {
    if (starredCards.has(index)) return;
    starredCards.add(index);
    stars += 1;
    const store = readStore();
    const key = `ep${ep}`;
    store[key] = {
      stars: (store[key] && store[key].stars ? store[key].stars : 0) + 1,
      date: new Date().toISOString().slice(0, 10),
    };
    writeStore(store);
    renderStars();
    el.star.disabled = true;
  }

  el.prev.addEventListener("click", () => showCard(index - 1));
  el.next.addEventListener("click", () => showCard(index + 1));

  /* ---------- 启动 ---------- */

  async function init() {
    el.back.setAttribute("href", "shelf.html");
    el.title.textContent = `亲子时间 · 西游记 第 ${ep} 集`;
    stars = (readStore()[`ep${ep}`] || {}).stars || 0;
    renderStars();
    try {
      book = await fetch(`../data/dialogue_stories/ep${ep}.json`).then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      });
    } catch (_) {
      el.question.textContent = "没有找到这一集，去选集页看看吧";
      return;
    }
    cards = Core.buildParentCards(book);
    if (window.WalaWalkerProgress && window.WalaWalkerCast) {
      const walkerRole = window.WalaWalkerCast.resolve(book);
      walker = window.WalaWalkerProgress.mount(el.walker, {
        gif: `../${walkerRole.gif}`,
        nameZh: walkerRole.nameZh,
      });
    }
    if (!cards.length) {
      el.question.textContent = "这一集暂时没有可用的互动卡";
      el.prev.disabled = true;
      el.next.disabled = true;
      el.star.disabled = true;
      return;
    }
    showCard(0);
  }

  init();
})();
