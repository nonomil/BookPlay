import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const words = require(fileURLToPath(new URL("./word-token-audio.js", import.meta.url)));

test("tokenizeCaptionWords 保留空格并清理标点", () => {
  assert.deepEqual(words.tokenizeCaptionWords("Run, Mikey! It's stuck."), [
    { type: "word", text: "Run," },
    { type: "space", text: " " },
    { type: "word", text: "Mikey!" },
    { type: "space", text: " " },
    { type: "word", text: "It's" },
    { type: "space", text: " " },
    { type: "word", text: "stuck." },
  ]);
  assert.equal(words.cleanWord("“It's!”"), "It's");
  assert.equal(words.cleanWord("..."), "");
});

test("resolveWordAudio 按静态音频、句子 seek、TTS 顺序选择", () => {
  assert.deepEqual(words.resolveWordAudio({
    term: "run",
    lang: "en-US",
    staticUrl: "../assets/run.mp3",
    sentenceUrl: "../assets/s01.mp3",
    timing: { start_ms: 120, end_ms: 480 },
    ttsUrl: "/api/tts?text=run",
  }), { kind: "static", url: "../assets/run.mp3" });
  assert.deepEqual(words.resolveWordAudio({
    term: "run",
    lang: "en-US",
    sentenceUrl: "../assets/s01.mp3",
    timing: { start_ms: 120, end_ms: 480 },
    ttsUrl: "/api/tts?text=run",
  }), { kind: "seek", url: "../assets/s01.mp3", start_ms: 120, end_ms: 480 });
  assert.deepEqual(words.resolveWordAudio({ term: "run", ttsUrl: "/api/tts?text=run" }), { kind: "tts", url: "/api/tts?text=run" });
  assert.equal(words.resolveWordAudio({ term: "run" }), null);
});
