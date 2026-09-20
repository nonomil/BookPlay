(function exposeStudyState(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BookPlayStudyState = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function studyStateFactory() {
  "use strict";

  const STEPS_TOTAL = 5;

  function readJson(storage, key) {
    try {
      const parsed = JSON.parse((storage.getItem(key) || "{}"));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function epKey3(ep) {
    return `ep${String(ep).padStart(3, "0")}`;
  }

  /**
   * 精读五步完成信号，全部复用既有存储（本模块只读）：
   * 01 看故事 = wala/lesson 的 bookplay_adv_progress 或绘本 bookplay_story_progress
   * 02 学方法 = 绘本读到第 2 页以后
   * 03 练一练 = bookplay_lesson_word_study_v1[epNNN].done（lesson-words 写入）
   * 04 理解挑战 = bookplay_adv_progress[ep].done（lesson 70% 阈值写入）
   * 05 说出故事 = bookplay_dub_v1[epNNN] 有已保存的配音
   */
  function readStepDone(ep, storage) {
    const store = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    if (!store || typeof store.getItem !== "function") return [false, false, false, false, false];
    const adv = readJson(store, "bookplay_adv_progress")[ep] || {};
    const story = readJson(store, "bookplay_story_progress")[ep] || {};
    const wordStudy = readJson(store, "bookplay_lesson_word_study_v1")[epKey3(ep)] || {};
    const dubIndex = readJson(store, "bookplay_dub_v1")[epKey3(ep)] || {};
    const shell = readJson(store, "bookplay_study_shell")[ep] || {};
    return [
      Boolean(shell.watch || adv.node > 0 || adv.done || story.page >= 1),
      Boolean(shell.method || story.page > 1),
      Boolean(shell.practice || wordStudy.done),
      Boolean(adv.done),
      Boolean(shell.output) || Object.keys(dubIndex).length > 0,
    ];
  }

  /** 当前应学习的步骤（0-based）；全部完成返回 STEPS_TOTAL。 */
  function firstUndoneStep(ep, storage) {
    const flags = readStepDone(ep, storage);
    const idx = flags.findIndex((flag) => !flag);
    return idx === -1 ? STEPS_TOTAL : idx;
  }

  return { STEPS_TOTAL, readStepDone, firstUndoneStep };
}));
