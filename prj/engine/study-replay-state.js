"use strict";

(function exposeStudyReplayState(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else if (root) root.BookPlayStudyReplayState = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function studyReplayStateFactory() {
  const REWARD_FLAGS = ["card_shown", "confetti_shown", "sp_granted", "sticker_granted", "room_item_granted"];

  function clone(value) {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeTerm(value) {
    return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
  }

  function uniqueTerms(values) {
    const seen = new Set();
    return (Array.isArray(values) ? values : []).map(normalizeTerm).filter((term) => {
      if (!term || seen.has(term)) return false;
      seen.add(term);
      return true;
    });
  }

  function uniqueIds(values) {
    const seen = new Set();
    return (Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter((id) => {
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  function allowedSet(contract, key) {
    const values = key === "terms" ? contract && contract.targetTerms : contract && contract.sceneIds;
    return new Set((Array.isArray(values) ? values : []).map((value) => key === "terms" ? normalizeTerm(value) : String(value)));
  }

  function filterAllowed(values, contract, key) {
    const allowed = allowedSet(contract, key);
    if (!allowed.size) return [];
    const source = key === "terms" ? uniqueTerms(values) : uniqueIds(values);
    return source.filter((value) => allowed.has(value));
  }

  function normalizeQuiz(previous) {
    const source = previous && typeof previous === "object" ? previous : {};
    const oldPractice = source.practice && typeof source.practice === "object" ? source.practice : {};
    const attempts = Math.max(0, Number(source.attempts ?? oldPractice.attempts) || 0);
    const directScore = Number(source.best_score ?? source.bestScore);
    const oldTotal = Number(oldPractice.total);
    const oldCorrect = Number(oldPractice.best_correct);
    const migratedScore = oldTotal > 0 && Number.isFinite(oldCorrect) ? oldCorrect / oldTotal : 0;
    const score = Number.isFinite(directScore) ? directScore : migratedScore;
    return {
      attempts,
      best_score: Math.max(0, Math.min(1, Number.isFinite(score) ? score : 0)),
      passed: Boolean(source.passed || (oldPractice.passed === true) || migratedScore >= 0.7),
      last_wrong_terms: uniqueTerms(source.last_wrong_terms || source.wrong_terms || oldPractice.last_wrong_ids || []),
    };
  }

  function normalizeEpisodeState(input, contract = {}) {
    const source = input && typeof input === "object" ? clone(input) : {};
    const previousReplay = source.study_replay && typeof source.study_replay === "object" ? source.study_replay : {};
    const previousVocab = source.vocab && typeof source.vocab === "object" ? source.vocab : {};
    const contractTerms = uniqueTerms(contract.targetTerms || []);
    const targetTerms = contractTerms.length ? contractTerms : uniqueTerms(previousVocab.target_terms);
    const normalized = {
      ...source,
      ...(contract.series ? { series: String(contract.series) } : {}),
      ...(contract.episode != null ? { episode: String(contract.episode) } : {}),
      study_replay: {
        ...previousReplay,
        queue_scene_ids: filterAllowed(previousReplay.queue_scene_ids, contract, "scenes"),
        completed_scene_ids: filterAllowed(previousReplay.completed_scene_ids, contract, "scenes"),
        skipped_scene_ids: filterAllowed(previousReplay.skipped_scene_ids, contract, "scenes"),
        learned_terms: filterAllowed(previousReplay.learned_terms, { targetTerms }, "terms"),
        completed: Boolean(previousReplay.completed),
      },
      vocab: {
        ...previousVocab,
        target_terms: targetTerms,
        seen_terms: filterAllowed(previousVocab.seen_terms, { targetTerms }, "terms"),
        mastered_terms: filterAllowed(previousVocab.mastered_terms, { targetTerms }, "terms"),
        wrong_terms: filterAllowed(previousVocab.wrong_terms, { targetTerms }, "terms"),
      },
      quiz: normalizeQuiz(source.quiz || source),
      completion: {
        ...(source.completion && typeof source.completion === "object" ? source.completion : {}),
        card_shown: Boolean(source.completion && source.completion.card_shown),
        confetti_shown: Boolean(source.completion && source.completion.confetti_shown),
        sp_granted: Boolean(source.completion && source.completion.sp_granted),
        sticker_granted: Boolean(source.completion && source.completion.sticker_granted),
        room_item_granted: Boolean(source.completion && source.completion.room_item_granted),
        reward_item_id: source.completion && source.completion.reward_item_id
          ? String(source.completion.reward_item_id) : null,
      },
    };
    return normalized;
  }

  function setReplayQueue(state, sceneIds, contract = {}) {
    const next = normalizeEpisodeState(state, contract);
    next.study_replay.queue_scene_ids = filterAllowed(sceneIds, contract, "scenes");
    next.study_replay.completed_scene_ids = next.study_replay.completed_scene_ids
      .filter((id) => next.study_replay.queue_scene_ids.includes(id));
    next.study_replay.skipped_scene_ids = next.study_replay.skipped_scene_ids
      .filter((id) => next.study_replay.queue_scene_ids.includes(id));
    return next;
  }

  function markEpisodeComplete(state, contract = {}) {
    const next = normalizeEpisodeState(state, contract);
    next.done = true;
    next.episode_complete = true;
    return next;
  }

  function markSceneComplete(state, sceneId, contract = {}) {
    const next = normalizeEpisodeState(state, contract);
    const id = String(sceneId || "");
    if (!allowedSet(contract, "scenes").has(id)) return next;
    if (!next.study_replay.completed_scene_ids.includes(id)) next.study_replay.completed_scene_ids.push(id);
    next.study_replay.skipped_scene_ids = next.study_replay.skipped_scene_ids.filter((value) => value !== id);
    if (next.study_replay.queue_scene_ids.length > 0
      && next.study_replay.queue_scene_ids.every((value) => next.study_replay.completed_scene_ids.includes(value)
        || next.study_replay.skipped_scene_ids.includes(value))) {
      next.study_replay.completed = true;
    }
    return next;
  }

  function markSceneSkipped(state, sceneId, contract = {}) {
    const next = normalizeEpisodeState(state, contract);
    const id = String(sceneId || "");
    if (!allowedSet(contract, "scenes").has(id)) return next;
    if (!next.study_replay.skipped_scene_ids.includes(id)) next.study_replay.skipped_scene_ids.push(id);
    next.study_replay.completed_scene_ids = next.study_replay.completed_scene_ids.filter((value) => value !== id);
    return next;
  }

  function markTermSeen(state, term, contract = {}) {
    const next = normalizeEpisodeState(state, contract);
    const key = normalizeTerm(term);
    if (!allowedSet(contract, "terms").has(key)) return next;
    if (!next.vocab.seen_terms.includes(key)) next.vocab.seen_terms.push(key);
    if (!next.study_replay.learned_terms.includes(key)) next.study_replay.learned_terms.push(key);
    return next;
  }

  function recordQuizTerm(state, term, correct, contract = {}) {
    const next = normalizeEpisodeState(state, contract);
    const key = normalizeTerm(term);
    if (!allowedSet(contract, "terms").has(key)) return next;
    if (!next.vocab.seen_terms.includes(key)) next.vocab.seen_terms.push(key);
    if (correct) {
      if (!next.vocab.mastered_terms.includes(key)) next.vocab.mastered_terms.push(key);
      next.vocab.wrong_terms = next.vocab.wrong_terms.filter((value) => value !== key);
    } else if (!next.vocab.mastered_terms.includes(key) && !next.vocab.wrong_terms.includes(key)) {
      next.vocab.wrong_terms.push(key);
    }
    return next;
  }

  function recordQuiz(state, result = {}, contract = {}) {
    const next = normalizeEpisodeState(state, contract);
    const score = Math.max(0, Math.min(1, Number(result.score) || 0));
    next.quiz.attempts += 1;
    next.quiz.best_score = Math.max(next.quiz.best_score, score);
    next.quiz.passed = next.quiz.passed || Boolean(result.passed);
    next.quiz.last_wrong_terms = filterAllowed(result.wrongTerms, { targetTerms: next.vocab.target_terms }, "terms");
    return next;
  }

  function markReward(state, flag, value = true, contract = {}) {
    const next = normalizeEpisodeState(state, contract);
    if (!REWARD_FLAGS.includes(flag)) return next;
    next.completion[flag] = Boolean(value);
    return next;
  }

  return {
    REWARD_FLAGS,
    normalizeTerm,
    normalizeEpisodeState,
    setReplayQueue,
    markEpisodeComplete,
    markSceneComplete,
    markSceneSkipped,
    markTermSeen,
    recordQuizTerm,
    recordQuiz,
    markReward,
  };
}));
