import assert from "node:assert/strict";
import test from "node:test";

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const plan = require("./study-plan.js");

const listenNodes = (count) => Array.from({ length: count }, (_, index) => ({
  node_id: `n${String(index + 1).padStart(3, "0")}`,
  type: "narration",
  text_en: `Sentence ${index + 1}`,
}));
const isListenNode = (node) => node && node.type === "narration" && node.text_en;

test("standard study keeps at most three spaced authored checkpoints", () => {
  const nodes = listenNodes(24);
  const result = plan.buildCheckpointPlan({
    nodes,
    isListenNode,
    quizIndexes: [3, 8, 13, 18, 22],
    learnLevel: "std",
  });

  assert.deepEqual(result.indexes, [3, 13, 22]);
  assert.equal(result.total, 3);
  assert.deepEqual(result.byIndex[13], { index: 13, ordinal: 2, total: 3, source: "quiz_after" });
});

test("checkpoint selection does not duplicate an authored node and fills a sparse episode", () => {
  const nodes = listenNodes(12);
  const result = plan.buildCheckpointPlan({
    nodes,
    isListenNode,
    quizIndexes: [2],
    learnLevel: "max",
  });

  assert.equal(result.indexes.length, 4);
  assert.equal(new Set(result.indexes).size, result.indexes.length);
  assert.ok(result.indexes.includes(2));
  assert.equal(result.byIndex[2].source, "quiz_after");
  assert.equal(result.byIndex[2].total, 4);
  assert.deepEqual(result.indexes, result.indexes.slice().sort((a, b) => a - b));
});

test("checkpoint selection avoids consecutive scene stops when authored quizzes cluster", () => {
  const nodes = listenNodes(20);
  const result = plan.buildCheckpointPlan({
    nodes,
    isListenNode,
    quizIndexes: [4, 5, 6],
    learnLevel: "std",
  });

  assert.equal(result.indexes.length, 3);
  assert.ok(result.indexes.every((index, offset) => offset === 0 || index - result.indexes[offset - 1] >= 2));
});

test("lite study still offers one low-burden recall checkpoint", () => {
  const nodes = listenNodes(18);
  const result = plan.buildCheckpointPlan({
    nodes,
    isListenNode,
    quizIndexes: [4, 10, 16],
    learnLevel: "lite",
  });

  assert.equal(result.indexes.length, 1);
  assert.equal(result.byIndex[result.indexes[0]].ordinal, 1);
  assert.equal(result.byIndex[result.indexes[0]].total, 1);
});

test("story mode can disable inline checkpoints without changing authored data", () => {
  const nodes = listenNodes(8);
  const result = plan.buildCheckpointPlan({
    nodes,
    isListenNode,
    quizIndexes: [2, 6],
    learnLevel: "lite",
    enabled: false,
  });

  assert.deepEqual(result, { indexes: [], total: 0, byIndex: {} });
});
