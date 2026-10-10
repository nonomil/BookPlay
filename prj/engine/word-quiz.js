"use strict";

/* 洞中认词页面。只读本集词表（没有就用花果山短词），不改扔球战斗。 */
(function () {
  const core = window.BookPlayWordQuiz;
  const params = new URLSearchParams(window.location.search);
  const episode = Math.max(1, Math.min(108, Number.parseInt(params.get("ep"), 10) || 1));
  const fromGame = params.get("from") === "game";
  const stage = document.getElementById("quiz-stage");
  const sourceLine = document.getElementById("quiz-source");
  const savedLine = document.getElementById("quiz-saved");
  const back = document.getElementById("quiz-back");
  if (back) back.href = fromGame ? `game.html?ep=${episode}` : "map.html";

  let questions = [];
  let index = 0;
  let answers = {};
  let locked = false;

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function paintSaved() {
    if (!savedLine) return;
    const progress = core.load(window.localStorage);
    const rec = progress.episodes[String(episode)];
    if (!rec || !rec.plays) {
      savedLine.textContent = "这一集还没考过";
      return;
    }
    const mark = rec.quizPassed ? "上次记住了" : "上次还没过";
    savedLine.textContent = `考过 ${rec.plays} 次 · 最好 ${rec.bestCorrect} 题 · ${mark}`;
  }

  function assetSrc(path) {
    const text = String(path || "");
    if (!text) return "";
    if (/^(https?:|data:|\/)/.test(text)) return text;
    return `../${text.replace(/^\.\.\//, "")}`;
  }

  function wordArt(path) {
    return /\/words\//.test(String(path || ""));
  }

  function pictureHtml(meta) {
    const label = escapeHtml((meta && (meta.zh || meta.glyph)) || "词");
    const image = wordArt(meta && meta.image) ? assetSrc(meta.image) : "";
    if (!image) return `<span class="quiz-glyph" aria-hidden="true">${label}</span>`;
    return `<img src="${escapeHtml(image)}" alt="" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="quiz-glyph" hidden>${label}</span>`;
  }

  function speak(term) {
    const text = String(term || "");
    if (!text) return Promise.resolve(false);
    const trySpeech = () => new Promise((resolve) => {
      if (!window.speechSynthesis) {
        resolve(false);
        return;
      }
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "en-US";
        utterance.onerror = () => resolve(false);
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
        resolve(true);
      } catch (_) {
        resolve(false);
      }
    });
    return new Promise((resolve) => {
      let audio;
      try {
        audio = new Audio(`/api/tts?voice=en&text=${encodeURIComponent(text)}`);
      } catch (_) {
        trySpeech().then(resolve);
        return;
      }
      const fail = () => { trySpeech().then(resolve); };
      audio.addEventListener("error", fail, { once: true });
      const played = audio.play();
      if (played && typeof played.then === "function") played.then(() => resolve(true)).catch(fail);
      else fail();
    });
  }

  function renderQuestion() {
    const question = questions[index];
    if (!question) return;
    locked = false;
    const heard = question.kind === "listen-picture";
    const picture = question.kind === "picture-word";
    const meta = question.choiceMeta || [];
    const choices = question.choices.map((choice, choiceIndex) => {
      const item = meta[choiceIndex] || { term: choice, glyph: choice };
      if (heard) {
        return `<button type="button" class="quiz-choice is-picture" data-index="${choiceIndex}">${pictureHtml(item)}<span class="sr-only">画面 ${choiceIndex + 1}</span></button>`;
      }
      return `<button type="button" class="quiz-choice" data-index="${choiceIndex}">${escapeHtml(choice)}</button>`;
    }).join("");
    const lead = picture
      ? `<div class="quiz-picture">${pictureHtml({ image: question.image, glyph: question.glyph, zh: question.zh })}</div>`
      : "";
    const display = question.kind === "fill-letter"
      ? `<p class="quiz-display" lang="en">${escapeHtml(question.display)}</p>`
      : "";
    stage.innerHTML = `<article class="quiz-card">
      <p class="quiz-prompt">${escapeHtml(question.prompt_zh)}</p>
      <p class="quiz-source">${index + 1} / ${questions.length}</p>
      ${lead}
      ${display}
      <p class="quiz-fallback" id="quiz-fallback" hidden></p>
      ${heard ? `<button type="button" class="quiz-hear" id="quiz-hear">再听一遍</button>` : ""}
      <div class="quiz-choices${heard ? " is-pictures" : ""}">${choices}</div>
      <p class="quiz-feedback" id="quiz-feedback"></p>
    </article>`;
    stage.querySelectorAll(".quiz-choice").forEach((button) => {
      button.addEventListener("click", () => pick(question, Number(button.dataset.index), button));
    });
    const hear = document.getElementById("quiz-hear");
    const play = () => speak(question.speak || question.term).then((ok) => {
      if (ok) return;
      const fallback = document.getElementById("quiz-fallback");
      if (!fallback) return;
      fallback.hidden = false;
      fallback.textContent = `${core.COPY.listenFallback} ${question.term}`;
    });
    if (hear) hear.addEventListener("click", play);
    if (heard) play();
  }

  function pick(question, choiceIndex, button) {
    if (locked) return;
    locked = true;
    const correct = choiceIndex === question.answer;
    answers[question.id] = choiceIndex;
    stage.querySelectorAll(".quiz-choice").forEach((item) => {
      item.disabled = true;
      const itemIndex = Number(item.dataset.index);
      if (itemIndex === question.answer) item.classList.add("is-correct");
      if (item === button && !correct) item.classList.add("is-wrong");
    });
    const feedback = document.getElementById("quiz-feedback");
    if (feedback) feedback.textContent = core.encouragement(correct, question.kind);
    const next = document.createElement("button");
    next.type = "button";
    next.className = "quiz-next";
    next.textContent = index + 1 >= questions.length ? "看结果" : "下一题";
    next.addEventListener("click", () => {
      index += 1;
      if (index >= questions.length) finish();
      else renderQuestion();
    });
    stage.querySelector(".quiz-card").appendChild(next);
    next.focus();
  }

  function finish() {
    const result = core.score(questions, answers);
    core.remember(window.localStorage, episode, result);
    paintSaved();
    const title = result.passed ? "记住了" : "还没记住";
    const copy = result.passed ? core.COPY.pass : core.COPY.fail;
    stage.innerHTML = `<article class="quiz-card quiz-result">
      <h2>${title}</h2>
      <p>答对 ${result.correct} / ${result.total}（${result.percent}%）。</p>
      <p>${escapeHtml(copy)}</p>
      <button type="button" class="quiz-retry" id="quiz-retry">${escapeHtml(core.COPY.retry)}</button>
    </article>`;
    document.getElementById("quiz-retry").addEventListener("click", () => start(questions));
  }

  function start(list) {
    questions = list;
    index = 0;
    answers = {};
    renderQuestion();
  }

  async function main() {
    paintSaved();
    let pack = { words: core.STARTER_WORDS.slice(), source: "starter" };
    try {
      const response = await fetch(`../data/game/levels/ep${episode}.json`, { cache: "no-store" });
      if (response.ok) {
        const level = await response.json();
        const words = core.wordsFromLevel(level);
        if (words.length >= 3) pack = { words, source: "episode" };
      }
    } catch (_) { /* 没有关卡就用花果山短词 */ }
    const session = core.buildSession(pack.words, { seed: episode, episode });
    if (sourceLine) {
      sourceLine.textContent = pack.source === "episode"
        ? `用第 ${episode} 集里的词来认。扔球打小妖还是原来的玩法。`
        : "这一集的地图不在身边，先认花果山的几个短词。";
    }
    if (!session.length) {
      stage.innerHTML = `<article class="quiz-card"><p>词不够，暂时不能考。</p></article>`;
      return;
    }
    start(session);
  }

  main();
})();
