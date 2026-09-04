import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const card = require(fileURLToPath(new URL("./completion-card.js", import.meta.url)));

test("completion card separates learned and mastered counts and clamps score", () => {
  const result = card.buildCompletionCard({
    series: "minecraft",
    episode: 1,
    summary: { total: 5, correct: 4, percent: 80, passed: true },
    targetTerms: ["Wolf", "ready", "wolf"],
    learnedTerms: ["wolf", "ready"],
    masteredTerms: ["wolf"],
    wrongTerms: ["ready"],
    progress: {},
    assetManifest: { assets: [{ kind: "completion-card-bg", runtime_path: "assets/bg.png" }] },
  });
  assert.equal(result.passed, true);
  assert.equal(result.learned_count, 2);
  assert.equal(result.mastered_count, 1);
  assert.equal(result.target_count, 2);
  assert.equal(result.first_pass, true);
  assert.equal(result.asset, "assets/bg.png");
});

test("already rewarded pass is not first pass; failed attempt never is", () => {
  assert.equal(card.isFirstPass({ completion: { reward_granted: true } }, true), false);
  assert.equal(card.isFirstPass({}, false), false);
});
