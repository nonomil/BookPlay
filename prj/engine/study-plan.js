"use strict";

(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WalaStudyPlan = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function studyPlanFactory() {
  function scoreWord(word, frequency) {
    const term = word.term || "";
    const zh = word.zh || "";
    const messy = /[，,（(]/.test(zh) ? 1 : 0;
    return (frequency || 0) * 2 - term.split(/\s+/).length - messy - term.length / 6;
  }

  function sideCardLimit(level) {
    if (level === "lite") return 1;
    if (level === "max") return 6;
    return 4;
  }

  // Inline recall should reinforce the story without turning every sentence
  // into a stop sign.  The authored quiz_after nodes are preferred because
  // they already mark meaningful scene boundaries; sparse episodes are filled
  // with evenly spaced listen nodes so the same contract works for older
  // packs too.
  function inlineCheckpointLimit(level) {
    if (level === "lite") return 1;
    if (level === "max") return 4;
    return 3;
  }

  function pickEvenly(values, count) {
    const source = [...new Set(values)].sort((a, b) => a - b);
    if (!source.length || count <= 0) return [];
    if (count >= source.length) return source;
    if (count === 1) return [source[Math.floor((source.length - 1) / 2)]];
    const picked = [];
    for (let i = 0; i < count; i += 1) {
      // Rounding keeps the middle checkpoint in the middle of an even-sized
      // candidate list.  Flooring can select two adjacent authored anchors
      // when four questions are reduced to three.
      const position = Math.round(i * (source.length - 1) / (count - 1));
      picked.push(source[position]);
    }
    return [...new Set(picked)];
  }

  function closestAvailable(candidates, target, picked, minGap) {
    const ordered = [...candidates].sort((a, b) => {
      const distance = Math.abs(a - target) - Math.abs(b - target);
      return distance || a - b;
    });
    return ordered.find((index) => !picked.some((other) => Math.abs(index - other) < minGap));
  }

  function pickStoryCheckpoints(listenIndexes, authored, count) {
    const all = [...new Set(listenIndexes)].sort((a, b) => a - b);
    const authoredSource = [...new Set(authored)].sort((a, b) => a - b);
    const targets = pickEvenly(all, count);
    // Two adjacent stops feel like an interruption rather than spaced recall.
    // Keep at least one listen node between stops whenever the story is long
    // enough; very short stories relax this constraint to preserve the count.
    const minGap = all.length >= count * 2 ? 2 : 1;
    const picked = [];
    targets.forEach((target) => {
      const authoredPick = closestAvailable(authoredSource, target, picked, minGap);
      const next = authoredPick == null
        ? closestAvailable(all, target, picked, minGap)
        : authoredPick;
      if (next != null) picked.push(next);
    });
    // If spacing made a target unavailable, fill from the remaining story
    // nodes before relaxing the gap for unusually short episodes.
    for (const candidate of all) {
      if (picked.length >= count) break;
      if (!picked.includes(candidate) && !picked.some((other) => Math.abs(candidate - other) < minGap)) {
        picked.push(candidate);
      }
    }
    for (const candidate of all) {
      if (picked.length >= count) break;
      if (!picked.includes(candidate)) picked.push(candidate);
    }
    return [...new Set(picked)].sort((a, b) => a - b).slice(0, count);
  }

  function buildCheckpointPlan(options = {}) {
    if (options.enabled === false) return { indexes: [], total: 0, byIndex: {} };
    const nodes = Array.isArray(options.nodes) ? options.nodes : [];
    const isListenNode = typeof options.isListenNode === "function"
      ? options.isListenNode
      : (node) => Boolean(node && node.type === "narration" && String(node.text_en || "").trim());
    const listenIndexes = nodes
      .map((node, index) => (isListenNode(node) ? index : -1))
      .filter((index) => index >= 0);
    const limit = inlineCheckpointLimit(options.learnLevel);
    if (!listenIndexes.length || limit <= 0) return { indexes: [], total: 0, byIndex: {} };

    const authored = [...new Set(options.quizIndexes || [])]
      .map((value) => Number(value))
      .filter((index) => listenIndexes.includes(index));
    const picked = pickStoryCheckpoints(listenIndexes, authored, Math.min(limit, listenIndexes.length));
    const authoredSet = new Set(authored);
    const byIndex = {};
    picked.forEach((index, offset) => {
      byIndex[index] = {
        index,
        ordinal: offset + 1,
        total: picked.length,
        source: authoredSet.has(index) ? "quiz_after" : "review",
      };
    });
    return { indexes: picked, total: picked.length, byIndex };
  }

  function buildWordCardPlan(options) {
    const nodes = options.nodes || [];
    const officialWords = options.officialWords || [];
    const isListenNode = options.isListenNode;
    const officialInSentence = options.officialInSentence;
    const bareWord = options.bareWord;
    const learnLevel = options.learnLevel || "std";
    const firstSeenNode = {};
    nodes.forEach((node, index) => {
      if (!isListenNode(node) || node.learn_example) return;
      officialInSentence(node.text_en || "").forEach((word) => {
        const key = bareWord(word.term);
        if (key && firstSeenNode[key] == null) firstSeenNode[key] = index;
      });
    });
    const frequency = {};
    nodes.forEach((node) => {
      officialInSentence(node.text_en || "").forEach((word) => {
        const key = bareWord(word.term);
        frequency[key] = (frequency[key] || 0) + 1;
      });
    });
    const firstsAt = (index) => officialInSentence((nodes[index] || {}).text_en || "")
      .filter((word) => firstSeenNode[bareWord(word.term)] === index);
    const wordCardPlan = {};
    if (learnLevel === "lite") {
      const candidates = officialWords.map((word) => ({
        word,
        index: firstSeenNode[bareWord(word.term)],
        score: scoreWord(word, frequency[bareWord(word.term)] || 0),
      })).filter((item) => item.index != null);
      candidates.sort((a, b) => b.score - a.score);
      const listenIndexes = nodes.map((_, index) => index)
        .filter((index) => isListenNode(nodes[index]) && !nodes[index].learn_example);
      const gap = Math.max(1, Math.floor(listenIndexes.length / 6));
      const usedNodes = new Set();
      for (let group = 0; group < 6; group++) {
        const low = listenIndexes[Math.min(listenIndexes.length - 1, group * gap)] || 0;
        const high = listenIndexes[Math.min(listenIndexes.length, (group + 1) * gap)] || nodes.length;
        let picked = candidates.find((item) => item.index >= low && item.index < high && !usedNodes.has(item.index));
        if (!picked) picked = candidates.find((item) => !usedNodes.has(item.index));
        if (!picked) break;
        usedNodes.add(picked.index);
        wordCardPlan[picked.index] = [picked.word.term];
      }
    } else if (learnLevel === "max") {
      nodes.forEach((_, index) => {
        const firsts = firstsAt(index);
        if (firsts.length) wordCardPlan[index] = firsts.map((word) => word.term);
      });
    } else {
      nodes.forEach((_, index) => {
        const firsts = firstsAt(index);
        if (!firsts.length) return;
        firsts.sort((a, b) => scoreWord(b, frequency[bareWord(b.term)] || 0) - scoreWord(a, frequency[bareWord(a.term)] || 0));
        wordCardPlan[index] = [firsts[0].term];
      });
    }
    return { firstSeenNode, wordCardPlan };
  }

  function collectBagThrough(options) {
    const nodes = options.nodes || [];
    const seen = new Set();
    const words = [];
    for (let index = 0; index <= options.endIndex; index++) {
      const node = nodes[index];
      if (!node || !options.isListenNode(node)) continue;
      options.officialInSentence(node.text_en || "").forEach((word) => {
        const key = options.bareWord(word.term);
        if (!key || seen.has(key)) return;
        seen.add(key);
        words.push(word);
      });
    }
    return words;
  }

  function isUnmastered(stats, term, normalizedTerm) {
    const value = (stats || {})[term] || (stats || {})[normalizedTerm] || {};
    return !value.right || (value.wrong || 0) > value.right;
  }

  return {
    scoreWord,
    sideCardLimit,
    inlineCheckpointLimit,
    buildCheckpointPlan,
    buildWordCardPlan,
    collectBagThrough,
    isUnmastered,
  };
});
