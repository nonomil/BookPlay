"use strict";

(function exposeCompletionCard(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BookPlayCompletionCard = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function completionCardFactory() {
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

  function clampPercent(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 0;
  }

  function isFirstPass(progress, passed) {
    if (!passed) return false;
    const completion = progress && typeof progress.completion === "object" ? progress.completion : {};
    return !(completion.card_shown || completion.sp_granted || completion.sticker_granted || completion.room_item_granted || completion.reward_granted);
  }

  function selectAsset(manifest, kind) {
    const assets = Array.isArray(manifest && manifest.assets) ? manifest.assets : [];
    const wanted = assets.find((asset) => asset && (asset.kind === kind || asset.id === kind) && asset.runtime_path);
    return wanted ? wanted.runtime_path : null;
  }

  function buildCompletionCard(options = {}) {
    const summary = options.summary && typeof options.summary === "object" ? options.summary : {};
    const targetTerms = uniqueTerms(options.targetTerms);
    const learnedTerms = uniqueTerms(options.learnedTerms);
    const masteredTerms = uniqueTerms(options.masteredTerms);
    const wrongTerms = uniqueTerms(options.wrongTerms);
    const percent = clampPercent(summary.percent != null ? summary.percent : (summary.total ? (Number(summary.correct || 0) / Number(summary.total)) * 100 : 0));
    const passed = summary.passed != null ? Boolean(summary.passed) : percent >= 70;
    const newTerms = uniqueTerms(options.newTerms || learnedTerms.filter((term) => !masteredTerms.includes(term)));
    return {
      schema_version: 1,
      series: String(options.series || "storybook"),
      episode: String(options.episode || "1"),
      title_en: String(options.titleEn || options.title_en || "Story complete"),
      title_zh: String(options.titleZh || options.title_zh || "本集完成"),
      total: Math.max(0, Number(summary.total) || 0),
      correct: Math.max(0, Number(summary.correct) || 0),
      percent,
      passed,
      learned_count: learnedTerms.length,
      mastered_count: masteredTerms.length,
      target_count: targetTerms.length || Math.max(learnedTerms.length, masteredTerms.length),
      learned_terms: learnedTerms,
      mastered_terms: masteredTerms,
      wrong_terms: wrongTerms,
      new_terms: newTerms,
      first_pass: isFirstPass(options.progress, passed),
      reward: options.reward || null,
      asset: selectAsset(options.assetManifest, "completion-card-bg") || selectAsset(options.assetManifest, "completion_background"),
      next_href: String(options.nextHref || ""),
      retry_href: String(options.retryHref || ""),
    };
  }

  return { normalizeTerm, uniqueTerms, clampPercent, isFirstPass, buildCompletionCard };
});
