"use strict";

/* 降妖记·页面共享工具（game.js 与 battle.js 的同款函数收敛为一份）。
 * 本模块只收"两个页面逐字节相同且无页面状态闭包"的纯函数；
 * 依赖页面 state/els/audioEl 的重复（speakTerm/speakDialogue/persistWeak/
 * freezeLevel/showToast）留在各自页面，收敛见 docs/plans/2026-09-30-游戏部分重构/00-方案.md 切片 1b。
 * 无 DOM 写操作 / 无自有存储键（键由调用方传入）。 */
(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BookPlayGameCommon = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function gameCommonFactory() {
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

  function handheldOffline() {
    try {
      return document.documentElement.hasAttribute("data-handheld");
    } catch (_) {
      return false;
    }
  }

  function fetchJSON(url) {
    return fetch(url, { cache: "no-store" }).then((res) => (res.ok ? res.json() : null));
  }

  function assetUrl(path) {
    return path ? "../" + String(path).replace(/^\.\.\//, "") : "";
  }

  function catalogCards(level) {
    const cards = [];
    const push = (row) => {
      if (!row || !row.term || !row.zh) return;
      cards.push(row);
    };
    (level && level.previewWords || []).forEach(push);
    ((level && level.waves) || []).forEach((wave) => (wave.monsters || []).forEach(push));
    (((level && level.boss) || {}).hpWords || []).forEach(push);
    return cards;
  }

  /* ---- 切片 1b：闭包耦合工具的工厂 ----
   * 页面在原定义点用 makeXxx(...) 绑定同名局部量，调用点零改动。
   * makeSpeakTerm 的 getEl/setEl 必须接到页面级 audioEl（与 stopAudio 共享同一句柄，
   * 否则 TTS 停不掉）；统一后 play 的 text 统一为 trim 过的词（原 battle 行为，game 原为原文，
   * 差异仅尾部空白）。 */

  function makeWeakPersister({ key, state, ep }) {
    return function persistWeak() {
      const all = readStore(key);
      all[String(ep)] = state.weakWords;
      writeStore(key, all);
    };
  }

  function makeFreezeLevel({ core, state, ep }) {
    return function freezeLevel(level, wrongWords) {
      const frozen = core.freezeSessionCards(catalogCards(level), {
        maxCards: core.SESSION_CARD_LIMIT,
        wrongWords: wrongWords || {},
        weakWords: state.weakWords,
        now: Date.now(),
        unit: ((Number(level && level.seedBase) || ep) % 1000) / 1000,
      });
      return core.applyFrozenLevel(level, frozen);
    };
  }

  function makeToast(toastEl) {
    const showToast = (text, ms) => {
      toastEl.textContent = text;
      toastEl.hidden = false;
      window.clearTimeout(showToast.timer);
      showToast.timer = window.setTimeout(() => {
        toastEl.hidden = true;
      }, ms || 1800);
    };
    return showToast;
  }

  function makeSpeakTerm({ getAudio, getEl, setEl }) {
    return function speakTerm(text, lang) {
      if (!text) return;
      const audio = getAudio();
      if (audio) {
        const language = lang === "zh" ? "zh-CN" : "en-US";
        const term = String(text).trim();
        const ref = `word:${term}:${lang === "zh" ? "zh" : "en"}`;
        return audio.play({ ref, text: term, lang: language });
      }
      if (handheldOffline()) return;
      try {
        let el = getEl();
        if (!el) {
          setEl(new Audio());
          el = getEl();
        }
        window.BookPlayAudio?.watchMedia(el);
        const voice = lang === "zh" ? "zh" : "en";
        el.src = "/api/tts?voice=" + voice + "&text=" + encodeURIComponent(text);
        el.currentTime = 0;
        el.play().catch(() => {});
      } catch (_) { /* 无 TTS 环境静默 */ }
    };
  }

  return {
    readStore, writeStore, handheldOffline, fetchJSON, assetUrl, catalogCards,
    makeWeakPersister, makeFreezeLevel, makeToast, makeSpeakTerm,
  };
});
