import assert from "node:assert/strict";
import test from "node:test";

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const queue = require("./review-queue.js");

const makeStorage = () => {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) || null,
    setItem: (key, value) => data.set(key, String(value)),
  };
};

test("review queue keeps missed words newest-first and bounded", () => {
  const storage = makeStorage();
  queue.enqueue(storage, { term: "mountain", zh: "山" });
  queue.enqueue(storage, { term: "river", zh: "河流" });
  queue.enqueue(storage, { term: "mountain", zh: "山岳" });

  assert.deepEqual(queue.peek(storage, 2).map((item) => item.term), ["mountain", "river"]);
  assert.equal(queue.peek(storage, 1)[0].zh, "山岳");
  assert.ok(queue.KEY);
});

test("resolving a term removes it without touching the other carryover items", () => {
  const storage = makeStorage();
  queue.enqueue(storage, { term: "mountain", zh: "山" });
  queue.enqueue(storage, { term: "river", zh: "河流" });

  queue.resolve(storage, "mountain");
  assert.deepEqual(queue.list(storage).map((item) => item.term), ["river"]);
});

test("missed words retain sentence evidence for focused relearning", () => {
  const storage = makeStorage();
  queue.enqueue(storage, {
    term: "climb",
    zh: "爬",
    sourceEpisode: 2,
    example: "The monkey can climb.",
    evidence: "Complete the sentence with the missing word.",
  });
  assert.deepEqual(queue.peek(storage, 1)[0], {
    term: "climb",
    zh: "爬",
    sourceEpisode: 2,
    example: "The monkey can climb.",
    evidence: "Complete the sentence with the missing word.",
    at: queue.peek(storage, 1)[0].at,
  });
});
