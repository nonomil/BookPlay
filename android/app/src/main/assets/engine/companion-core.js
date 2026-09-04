"use strict";

(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BookPlayCompanion = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function companionFactory() {
  const RULE_VERSION = 1;
  const DEFAULT_COSMETICS = [
    { id: "cloud-reins", days: 7 },
    { id: "journey-bell", days: 15 },
    { id: "cloud-saddlecloth", days: 30 },
  ];

  const copy = (value) => JSON.parse(JSON.stringify(value || {}));
  const isDone = (progress, episode) => Boolean(progress?.[String(episode)]?.done);
  const doneCount = (progress) => Object.entries(progress || {})
    .filter(([key, value]) => /^\d+$/.test(key) && value?.done)
    .length;
  const collectionDone = (collection, progress) => {
    if (!collection) return false;
    for (let episode = collection.from; episode <= collection.to; episode += 1) {
      if (!isDone(progress, episode)) return false;
    }
    return true;
  };
  const drillDone = (drills, id) => Boolean(drills?.[id]?.done);
  const collectionComplete = (collection, progress, drills) => (
    collectionDone(collection, progress) && drillDone(drills, collection.id)
  );

  function conditionProgress(condition, collections, progress, drills) {
    const completed = doneCount(progress);
    if (condition.type === "episodes") {
      return { current: Math.min(completed, condition.count), target: condition.count };
    }
    if (condition.type === "episode") {
      return { current: isDone(progress, condition.episode) ? 1 : 0, target: 1 };
    }
    if (condition.type === "collection") {
      const collection = collections.find((item) => item.id === condition.collection_id);
      if (!collection) return { current: 0, target: 2 };
      return {
        current: (collectionDone(collection, progress) ? 1 : 0)
          + (drillDone(drills, collection.id) ? 1 : 0),
        target: 2,
      };
    }
    if (condition.type === "complete") {
      const passed = collections.filter((item) => collectionComplete(item, progress, drills)).length;
      return { current: Math.min(completed, 108) + passed, target: 108 + collections.length };
    }
    return { current: 0, target: 1 };
  }

  function conditionMet(condition, collections, progress, drills) {
    if (!condition) return false;
    if (condition.type === "episodes") return doneCount(progress) >= condition.count;
    if (condition.type === "episode") return isDone(progress, condition.episode);
    if (condition.type === "collection") {
      const collection = collections.find((item) => item.id === condition.collection_id);
      return collectionComplete(collection, progress, drills);
    }
    if (condition.type === "complete") {
      return doneCount(progress) >= 108
        && collections.length === 13
        && collections.every((item) => collectionComplete(item, progress, drills));
    }
    return condition.type === "initial";
  }

  function evaluateAchievements(options) {
    const catalog = options.catalog?.achievements || [];
    const collections = options.collections || [];
    const progress = options.progress || {};
    const drills = options.drills || {};
    const receipts = copy(options.receipts);
    const now = Number(options.now) || Date.now();
    const newlyUnlocked = [];

    catalog.forEach((item) => {
      if (!receipts[item.id] && conditionMet(item.condition, collections, progress, drills)) {
        receipts[item.id] = {
          at: now,
          seen: false,
          rule_version: RULE_VERSION,
          source: "derived-from-progress",
        };
        newlyUnlocked.push(item);
      }
    });

    const earned = catalog.filter((item) => receipts[item.id]).map((item) => ({
      ...item,
      receipt: receipts[item.id],
    }));
    const nextTargets = catalog.filter((item) => !receipts[item.id]).map((item) => ({
      ...item,
      progress: conditionProgress(item.condition, collections, progress, drills),
    })).sort((a, b) => {
      const ar = a.progress.current / a.progress.target;
      const br = b.progress.current / b.progress.target;
      return br - ar;
    });

    return { receipts, earned, newlyUnlocked, nextTargets };
  }

  function deriveCompanionStage(options) {
    const stages = options.catalog?.stages || [];
    const collections = options.collections || [];
    const progress = options.progress || {};
    const drills = options.drills || {};
    let current = stages[0] || null;
    stages.forEach((stage) => {
      if (conditionMet(stage.condition, collections, progress, drills)) current = stage;
    });
    return current;
  }

  function normalizeState(state, options = {}) {
    const value = copy(state);
    value.schema_version = 1;
    // State is shared by the companion pages, but storage keys are series
    // scoped. Keep an explicit identity so an old JTTW default can never be
    // stamped onto Byte's Minecraft save during migration.
    const companionId = String(options.companionId || value.companion || "white-dragon-horse");
    value.companion = companionId;
    value.care = value.care && typeof value.care === "object" ? value.care : {};
    value.care.days = Array.from(new Set((value.care.days || []).filter(Boolean))).sort();
    value.learning_days = Array.from(new Set((value.learning_days || []).filter(Boolean))).sort();
    value.unlocked_cosmetics = Array.from(new Set(value.unlocked_cosmetics || []));
    value.equipped_cosmetic = value.equipped_cosmetic || null;
    return value;
  }

  function markLearningDay(state, day) {
    const value = normalizeState(state);
    if (day && !value.learning_days.includes(day)) {
      value.learning_days.push(day);
      value.learning_days.sort();
    }
    return value;
  }

  function recordCare(state, options) {
    const value = normalizeState(state);
    const day = String(options.day || "");
    const action = String(options.action || "rest");
    value.care.last_action = action;
    value.care.last_day = day || value.care.last_day || null;
    let stamped = false;
    if (day && value.learning_days.includes(day) && !value.care.days.includes(day)) {
      value.care.days.push(day);
      value.care.days.sort();
      stamped = true;
    }
    const cosmeticCatalog = options.cosmetics || DEFAULT_COSMETICS;
    cosmeticCatalog.forEach((item) => {
      if (value.care.days.length >= item.days && !value.unlocked_cosmetics.includes(item.id)) {
        value.unlocked_cosmetics.push(item.id);
      }
    });
    return { state: value, stamped };
  }

  return {
    RULE_VERSION,
    conditionMet,
    conditionProgress,
    evaluateAchievements,
    deriveCompanionStage,
    normalizeState,
    markLearningDay,
    recordCare,
  };
});
