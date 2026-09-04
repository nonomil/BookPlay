"use strict";

(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WalaStorage = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function storageFactory() {
  const KEYS = Object.freeze({
    MODE: "bookplay_read_mode",
    ANNOT: "bookplay_annot",
    PASS: "bookplay_pass_mode",
    LEVEL: "bookplay_learn_level",
    LESSON_SETTINGS: "bookplay_lesson_settings_v1",
    RATE: "bookplay_play_rate",
    PROG: "bookplay_adv_progress",
    VSTAT: "bookplay_adv_vocab_stat",
    SP: "bookplay_sp",
    AUTOPLAY: "bookplay_autoplay",
    SIDE_CARDS: "bookplay_side_cards",
    STUDY_SESSION: "bookplay_study_session_v1",
    LESSON_SESSION: "bookplay_lesson_session_v2",
  });

  const DEFAULT_LESSON_SETTINGS = Object.freeze({ gradeBand: "g3_4", intensity: "standard" });
  const LEVELS = new Set(["lite", "std", "max"]);
  const GRADES = new Set(["g1_2", "g3_4", "g5_6"]);
  const INTENSITIES = new Set(["light", "standard", "challenge"]);
  const RATES = new Set([0.75, 1, 1.25]);

  function readObject(storage, key) {
    try {
      const value = JSON.parse(storage.getItem(key) || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch (_) {
      return {};
    }
  }

  function normalizeLessonSettings(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
      gradeBand: GRADES.has(source.gradeBand) ? source.gradeBand : DEFAULT_LESSON_SETTINGS.gradeBand,
      intensity: INTENSITIES.has(source.intensity) ? source.intensity : DEFAULT_LESSON_SETTINGS.intensity,
    };
  }

  function normalizePlayRate(value) {
    const rate = parseFloat(value);
    return RATES.has(rate) ? rate : 1;
  }

  function create(storage) {
    if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
      throw new TypeError("WalaStorage.create requires a Storage-compatible object");
    }
    const writeObject = (key, value) => storage.setItem(key, JSON.stringify(value));
    return {
      readMode: () => storage.getItem(KEYS.MODE) === "enzh" ? "enzh" : "en",
      writeMode: (value) => storage.setItem(KEYS.MODE, value === "enzh" ? "enzh" : "en"),
      readAnnot: () => storage.getItem(KEYS.ANNOT) !== "0",
      writeAnnot: (value) => storage.setItem(KEYS.ANNOT, value ? "1" : "0"),
      readPassMode: () => {
        const value = storage.getItem(KEYS.PASS);
        return value === "story" || value === "study" ? value : null;
      },
      writePassMode: (value) => storage.setItem(KEYS.PASS, value === "study" ? "study" : "story"),
      readLearnLevel: () => {
        const value = storage.getItem(KEYS.LEVEL) || "std";
        return LEVELS.has(value) ? value : "std";
      },
      writeLearnLevel: (value) => storage.setItem(KEYS.LEVEL, LEVELS.has(value) ? value : "std"),
      readLessonSettings: () => normalizeLessonSettings(readObject(storage, KEYS.LESSON_SETTINGS)),
      writeLessonSettings: (value) => {
        const normalized = normalizeLessonSettings(value);
        writeObject(KEYS.LESSON_SETTINGS, normalized);
        return normalized;
      },
      readPlayRate: () => normalizePlayRate(storage.getItem(KEYS.RATE) || "1"),
      writePlayRate: (value) => {
        const normalized = normalizePlayRate(value);
        storage.setItem(KEYS.RATE, String(normalized));
        return normalized;
      },
      readProgress: () => readObject(storage, KEYS.PROG),
      writeProgress: (value) => writeObject(KEYS.PROG, value || {}),
      saveEpisodeProgress: (episode, node, total, done) => {
        const value = readObject(storage, KEYS.PROG);
        const now = new Date();
        const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        value[episode] = { node, total, done: Boolean(done), at: now.getTime(), day };
        writeObject(KEYS.PROG, value);
        return value[episode];
      },
      readVocabStats: () => readObject(storage, KEYS.VSTAT),
      writeVocabStats: (value) => writeObject(KEYS.VSTAT, value || {}),
      bumpVocab: (term, right) => {
        const value = readObject(storage, KEYS.VSTAT);
        value[term] = value[term] || { seen: 0, right: 0, wrong: 0 };
        if (right) value[term].right = (value[term].right || 0) + 1;
        else value[term].wrong = (value[term].wrong || 0) + 1;
        writeObject(KEYS.VSTAT, value);
        return value[term];
      },
      markVocabSeen: (term) => {
        const value = readObject(storage, KEYS.VSTAT);
        value[term] = value[term] || { seen: 0, right: 0, wrong: 0 };
        value[term].seen = (value[term].seen || 0) + 1;
        writeObject(KEYS.VSTAT, value);
        return value[term];
      },
      getSP: () => parseInt(storage.getItem(KEYS.SP) || "0", 10) || 0,
      addSP: (amount) => {
        const value = (parseInt(storage.getItem(KEYS.SP) || "0", 10) || 0) + amount;
        storage.setItem(KEYS.SP, String(value));
        return value;
      },
      readAutoPlay: () => storage.getItem(KEYS.AUTOPLAY) === "1",
      writeAutoPlay: (value) => storage.setItem(KEYS.AUTOPLAY, value ? "1" : "0"),
      // Side vocabulary cards are opt-out: existing users keep the current
      // learning aid until they explicitly turn it off in player settings.
      readSideCards: () => storage.getItem(KEYS.SIDE_CARDS) !== "0",
      writeSideCards: (value) => storage.setItem(KEYS.SIDE_CARDS, value ? "1" : "0"),
      readStudySession: () => readObject(storage, KEYS.STUDY_SESSION),
      writeStudySession: (value) => writeObject(KEYS.STUDY_SESSION, value || {}),
      readLessonSessions: () => readObject(storage, KEYS.LESSON_SESSION),
      writeLessonSessions: (value) => writeObject(KEYS.LESSON_SESSION, value || {}),
      saveLessonAttempt: (episode, attempt) => {
        const sessions = readObject(storage, KEYS.LESSON_SESSION);
        const key = String(Number.parseInt(episode, 10) || 0);
        sessions[key] = { ...(sessions[key] || {}), ...(attempt || {}), updatedAt: new Date().toISOString() };
        writeObject(KEYS.LESSON_SESSION, sessions);
        return sessions[key];
      },
    };
  }

  return { KEYS, DEFAULT_LESSON_SETTINGS, normalizeLessonSettings, normalizePlayRate, create };
});
