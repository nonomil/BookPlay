import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const queue = require(fileURLToPath(new URL("./study-replay-queue.js", import.meta.url)));

const book = {
  pages: [
    {
      page_no: 1,
      image: "assets/p01.webp",
      sentences: [
        { id: "p01-s01", text_en: "Run!", start_ms: 100, end_ms: 900, glossary: [{ term: "run", zh: "跑" }] },
        { id: "p01-s02", text_en: "We are late.", start_ms: 950, end_ms: 1900, glossary: [] },
        { id: "p01-s03", text_en: "Find the key.", start_ms: 2000, end_ms: 3100, glossary: [{ term: "key", zh: "钥匙" }] },
      ],
    },
    { page_no: 2, image: "assets/p02.webp", text_en: "A quiet page.", start_sec: 4, end_sec: 8, glossary: [] },
  ],
};

test("deriveScenes groups ordered sentence nodes and preserves evidence", () => {
  const scenes = queue.deriveScenes(book, { maxNodes: 2 });
  assert.equal(scenes.length, 2);
  assert.deepEqual(scenes[0].sentence_ids, ["p01-s01", "p01-s02"]);
  assert.deepEqual(scenes[0].target_terms, ["run"]);
  assert.equal(scenes[0].page_no, 1);
  assert.equal(scenes[0].image, "assets/p01.webp");
  assert.equal(scenes[0].start_ms, 100);
  assert.equal(scenes[0].end_ms, 1900);
  assert.deepEqual(scenes[1].sentence_ids, ["p01-s03", "p02"]);
});

test("buildReplayQueue 只保留目标词 scene、去重并保持原顺序", () => {
  const scenes = queue.deriveScenes(book, { maxNodes: 2 });
  const replay = queue.buildReplayQueue(scenes);
  assert.deepEqual(replay.map((scene) => scene.id), ["scene-p01-s01-p01-s02", "scene-p01-s03-p02"]);
});

test("scenePlaybackPlan 优先视频，否则回退页面定格和句子音频", () => {
  const videoPlan = queue.scenePlaybackPlan({ id: "s1", image: "p.png", video: { src: "v.mp4", start_ms: 10, end_ms: 200 } });
  assert.deepEqual(videoPlan, { kind: "video", src: "v.mp4", start_ms: 10, end_ms: 200 });
  const stillPlan = queue.scenePlaybackPlan({ id: "s2", image: "p.png", audio: ["s1.mp3"], start_ms: 10, end_ms: 200 });
  assert.deepEqual(stillPlan, { kind: "still", image: "p.png", audio: ["s1.mp3"], start_ms: 10, end_ms: 200 });
});

test("queue navigation skips completed or skipped scene and is safe when empty", () => {
  const scenes = queue.buildReplayQueue(queue.deriveScenes(book, { maxNodes: 2 }));
  assert.equal(queue.nextPendingScene(scenes, { completed_scene_ids: [scenes[0].id] }).id, scenes[1].id);
  assert.equal(queue.nextPendingScene(scenes, { completed_scene_ids: scenes.map((s) => s.id) }), null);
  assert.equal(queue.nextPendingScene([], {}), null);
});

test("replayQueueForQuestions follows authored sentence and scene evidence", () => {
  const scenes = [
    { id: "scene-a", sentence_ids: ["s1", "s2"], target_terms: ["river"] },
    { id: "scene-b", sentence_ids: ["s3"], target_terms: ["portal"] },
    { id: "scene-c", sentence_ids: ["s4"], target_terms: ["king"] },
  ];
  const focused = queue.replayQueueForQuestions(scenes, [
    { id: "q1", type: "comprehension", source_sentence_ids: ["s3"] },
    { id: "q2", type: "comprehension", scene_id: "scene-c" },
  ]);
  assert.deepEqual(focused.map((scene) => scene.id), ["scene-b", "scene-c"]);
  assert.deepEqual(queue.replayQueueForQuestions(scenes, [{ id: "q3", type: "comprehension", source_sentence_id: "missing" }]), []);
});
