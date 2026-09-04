import test from "node:test";
import assert from "node:assert/strict";
import core from "./lesson-core.js";

function scene(id, index, overrides = {}) {
  return {
    node_id: id,
    text_en: `Scene ${index} sentence.`,
    text_zh: `场景 ${index}`,
    illustration: `assets/adv_frames/ep1/f${index}.jpg`,
    audio_start: index * 10,
    audio_end: index * 10 + 3,
    ...overrides,
  };
}

function book(nodes) {
  return { episode: 1, audio: "assets/lf_ep1/audio_ep1.mp3", nodes };
}

test("听音识景：默认一题，选项为同集不重复插图且结果稳定", () => {
  const source = book([scene("n1", 1), scene("n2", 2), scene("n3", 3), scene("n4", 4)]);
  const first = core.buildListenPictureQuestions(source, { choiceCount: 4 });
  const second = core.buildListenPictureQuestions(source, { choiceCount: 4 });

  assert.equal(first.length, 1);
  assert.deepEqual(first, second);
  const question = first[0];
  assert.equal(question.kind, "listen_picture");
  assert.equal(typeof question.textEn, "string");
  assert.equal(question.options.length, 4);
  assert.equal(new Set(question.options).size, 4);
  assert.equal(new Set(question.options.map((nodeId) => source.nodes.find((node) => node.node_id === nodeId).illustration)).size, 4);
  assert.ok(question.options.includes(question.correctNode));
  assert.deepEqual(question.audio, { from: question.audio.from, to: question.audio.to });
  assert.equal(question.ttsFallback, false);
  assert.ok(question.options.every((nodeId) => source.nodes.some((node) => node.node_id === nodeId)));
});

test("听音识景：题量最多三题，低幼两图，缺插图或缺台词节点不入题", () => {
  const source = book([
    scene("n1", 1),
    scene("n2", 2),
    scene("n3", 3),
    scene("n4", 4),
    scene("bad-image", 5, { illustration: "" }),
    scene("bad-text", 6, { text_en: "" }),
  ]);
  const questions = core.buildListenPictureQuestions(source, { count: 99, choiceCount: 2 });

  assert.equal(questions.length, 3);
  questions.forEach((question) => {
    assert.equal(question.options.length, 2);
    assert.ok(!question.options.includes("bad-image"));
    assert.ok(!question.options.includes("bad-text"));
  });
});

test("听音识景：缺切片时间仍保留看图题并标记 TTS 回退", () => {
  const source = book([
    scene("n1", 1, { audio_start: null, audio_end: null }),
    scene("n2", 2),
  ]);
  const questions = core.buildListenPictureQuestions(source, { count: 1, choiceCount: 2 });

  assert.equal(questions.length, 1);
  assert.equal(questions[0].ttsFallback, true);
  assert.equal(questions[0].audio, null);
  assert.equal(questions[0].textEn, "Scene 1 sentence.");
});

test("听音识景：空书或只有一张插图时不生成题目", () => {
  assert.deepEqual(core.buildListenPictureQuestions(null), []);
  assert.deepEqual(core.buildListenPictureQuestions({ nodes: [] }), []);
  assert.deepEqual(core.buildListenPictureQuestions(book([scene("n1", 1)])), []);
});
