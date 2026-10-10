"use strict";

/* 星际探查页面。任务板点亮后才能飞下一站。不改降妖记扔球。 */
(function () {
  const core = window.BookPlayScoutOrbit;
  const stage = document.getElementById("scout-stage");
  const starLine = document.getElementById("scout-stars");
  const params = new URLSearchParams(window.location.search);
  let questions = [];
  let index = 0;
  let answers = {};
  let earned = 0;
  let locked = false;

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function paintStars() {
    if (!starLine) return;
    const total = core.starTotal(core.load(window.localStorage));
    starLine.textContent = `任务星 ${total}`;
  }

  function starRow(count) {
    const filled = Math.max(0, Math.min(5, Number(count) || 0));
    return `${"★".repeat(filled)}${"☆".repeat(5 - filled)}`;
  }

  function crewHtml() {
    return `<div class="crew" aria-hidden="true">
      <svg viewBox="0 0 64 64"><circle cx="32" cy="24" r="12" fill="#f4f7fb"/><rect x="22" y="38" width="20" height="16" rx="6" fill="#2ec4b6"/></svg>
      <svg viewBox="0 0 64 64"><polygon points="32,8 52,22 52,46 32,58 12,46 12,22" fill="#ffd166"/><rect x="26" y="28" width="12" height="8" fill="#1b3a4b"/></svg>
    </div>`;
  }

  function showMap() {
    paintStars();
    const progress = core.load(window.localStorage);
    const cards = core.BOOKS.map((book) => {
      const rec = progress.books[book.id];
      const open = core.isOpen(progress, book.id);
      const passed = !!(rec && rec.quizPassed);
      const stars = rec ? rec.bestStars : 0;
      const action = !open ? core.COPY.locked : (passed ? core.COPY.again : core.COPY.launch);
      return `<li><button type="button" class="planet${passed ? " is-lit" : ""}" data-book="${escapeHtml(book.id)}"${open ? "" : " disabled"}>
        <span class="planet-orb motif-${escapeHtml(book.motif)}"></span>
        <span class="planet-name">${escapeHtml(book.name)}</span>
        <span class="planet-en">${escapeHtml(book.en)}</span>
        <span class="planet-mission">${escapeHtml(book.mission)}</span>
        <span class="planet-go" aria-label="任务星 ${stars} / 5">${starRow(stars)}</span>
        <span class="planet-go">${escapeHtml(action)}</span>
      </button></li>`;
    }).join("");
    stage.innerHTML = `<p class="scout-lead">用英语把舱里的事做完。做对得到任务星，星点亮了才能飞下一站。</p><ol class="orbit-path">${cards}</ol>`;
    stage.querySelectorAll(".planet").forEach((button) => {
      button.addEventListener("click", () => startBook(button.getAttribute("data-book")));
    });
  }

  function startBook(bookId) {
    const progress = core.load(window.localStorage);
    if (!core.isOpen(progress, bookId)) {
      showMap();
      return;
    }
    questions = core.buildMission(bookId, { seed: Date.now() % 100000 });
    index = 0;
    answers = {};
    earned = 0;
    locked = false;
    if (!questions.length) {
      stage.innerHTML = `<p class="scout-lead">这站的舱务还没备好。</p><button type="button" class="cabin-next" id="cabin-back">回任务板</button>`;
      document.getElementById("cabin-back").addEventListener("click", showMap);
      return;
    }
    renderBeat();
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
      audio.addEventListener("error", () => { trySpeech().then(resolve); }, { once: true });
      audio.play().then(() => resolve(true)).catch(() => { trySpeech().then(resolve); });
    });
  }

  function choiceButton(question, choice, choiceIndex) {
    if (question.kind === "listen-picture") {
      const meta = question.choiceMeta[choiceIndex] || {};
      return `<button type="button" class="cabin-choice listen-tile" data-choice="${choiceIndex}"><b>${escapeHtml(meta.glyph || "词")}</b><small>${escapeHtml(meta.zh || "")}</small></button>`;
    }
    if (question.kind === "picture-word") {
      return `<button type="button" class="cabin-choice is-picture" data-choice="${choiceIndex}">${escapeHtml(choice)}</button>`;
    }
    return `<button type="button" class="cabin-choice" data-choice="${choiceIndex}">${escapeHtml(String(choice).toUpperCase())}</button>`;
  }

  function renderBeat() {
    const question = questions[index];
    locked = false;
    const sign = question.kind === "picture-word"
      ? `<p class="cabin-sign">${escapeHtml(question.glyph)}<small style="display:block;font-size:1rem;letter-spacing:0">${escapeHtml(question.zh)}</small></p>`
      : "";
    const panel = question.kind === "fill-letter"
      ? `<p class="cabin-panel">${escapeHtml(question.display)}</p>`
      : "";
    const actions = question.choices.map((choice, choiceIndex) => choiceButton(question, choice, choiceIndex)).join("");
    stage.innerHTML = `<section class="cabin">
      <div class="cabin-hud">
        <button type="button" id="cabin-back">任务板</button>
        <p class="cabin-step">${escapeHtml(question.bookName)} · 舱务 ${index + 1} / ${questions.length}</p>
        <p class="cabin-live" id="cabin-live">★ ${earned}</p>
      </div>
      <div class="cabin-window" id="cabin-window">
        ${crewHtml()}
        <p class="cabin-situation">${escapeHtml(question.situation)}</p>
        ${sign}${panel}
      </div>
      <p class="cabin-speech" id="cabin-speech">${escapeHtml(question.prompt_zh)}</p>
      <div class="cabin-actions">${actions}</div>
    </section>`;
    document.getElementById("cabin-back").addEventListener("click", showMap);
    stage.querySelectorAll(".cabin-choice").forEach((button) => {
      button.addEventListener("click", () => choose(Number(button.getAttribute("data-choice"))));
    });
    if (question.kind === "listen-picture") {
      speak(question.speak || question.term).then((ok) => {
        const speech = document.getElementById("cabin-speech");
        if (!ok && !locked && speech && questions[index] === question) {
          speech.textContent = `${question.situation}。${core.COPY.listenFallback} ${question.term}`;
        }
      });
    }
  }

  function choose(choiceIndex) {
    if (locked) return;
    const question = questions[index];
    if (!question || !Number.isInteger(choiceIndex)) return;
    locked = true;
    answers[question.id] = choiceIndex;
    const correct = choiceIndex === question.answer;
    if (correct) earned += 1;
    const windowEl = document.getElementById("cabin-window");
    const speech = document.getElementById("cabin-speech");
    const live = document.getElementById("cabin-live");
    if (windowEl) windowEl.classList.add(correct ? "is-ok" : "is-miss");
    if (speech) speech.textContent = core.encouragement(correct, question.term, question.situation);
    if (live) {
      live.textContent = `★ ${earned}`;
      live.classList.toggle("star-pop", correct);
    }
    const actions = stage.querySelector(".cabin-actions");
    if (actions) {
      const label = index + 1 >= questions.length ? "看任务星" : "下一件舱务";
      actions.innerHTML = `<button type="button" class="cabin-next" id="cabin-next">${label}</button>`;
      document.getElementById("cabin-next").addEventListener("click", advance);
    }
  }

  function advance() {
    if (index + 1 >= questions.length) {
      finish();
      return;
    }
    index += 1;
    renderBeat();
  }

  function finish() {
    const bookId = questions[0].bookId;
    const result = core.score(questions, answers);
    const saved = core.remember(window.localStorage, bookId, result);
    paintStars();
    const nextId = result.passed ? core.nextBookId(bookId) : null;
    const review = result.wrong_terms && result.wrong_terms.length
      ? `下次还能再认：${result.wrong_terms.join("、")}。`
      : "";
    const heading = result.passed ? "星点亮了" : "还差一点点";
    const copy = !result.passed ? core.COPY.fail : (nextId ? core.COPY.pass : core.COPY.passLast);
    const nextButton = nextId
      ? `<button type="button" class="cabin-next" id="scout-next">${escapeHtml(core.COPY.next)}</button>`
      : "";
    stage.innerHTML = `<section class="result-card">
      <p class="result-stars" aria-label="这一趟 ${result.correct} 颗任务星">${starRow(result.correct)}</p>
      <h2>${heading}</h2>
      <p>${escapeHtml(copy)}</p>
      <p>${result.correct} / ${result.total} 件舱务接上了。${escapeHtml(review)}</p>
      <p>这站最好 ${saved.books[bookId].bestStars} 颗任务星。</p>
      <div class="result-actions">
        ${nextButton}
        <button type="button" class="cabin-next" id="scout-retry">${escapeHtml(core.COPY.again)}</button>
        <button type="button" class="cabin-link" id="scout-map">${escapeHtml(core.COPY.back)}</button>
      </div>
    </section>`;
    const next = document.getElementById("scout-next");
    if (next) next.addEventListener("click", () => startBook(nextId));
    document.getElementById("scout-retry").addEventListener("click", () => startBook(bookId));
    document.getElementById("scout-map").addEventListener("click", showMap);
  }

  paintStars();
  const requested = params.get("book");
  if (requested && core.isOpen(core.load(window.localStorage), requested)) startBook(requested);
  else showMap();
})();
