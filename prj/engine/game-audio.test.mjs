import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { createGameAudio } = createRequire(import.meta.url)("./game-audio.js");

class FakeMedia extends EventTarget {
  constructor() {
    super();
    this.src = "";
    this.currentTime = 0;
    this.paused = true;
    this.ended = false;
    this.playCalls = 0;
    this.rejectPlay = false;
    this.resolvePlay = null;
  }

  play() {
    this.playCalls += 1;
    if (this.rejectPlay) return Promise.reject(new Error("decode"));
    if (this.resolvePlay) return new Promise((resolve) => { this._resolvePlay = resolve; });
    this.paused = false;
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  }
}

test("game-audio：明确引用优先静态索引并发出 loading→playing→ended", async () => {
  const media = new FakeMedia();
  const states = [];
  const audio = createGameAudio({
    episode: 1,
    media,
    audioIndex: { entries: { "sent_en:Hello": { src: "assets/game-audio/hello.mp3", text: "Hello", lang: "en-US" } } },
    onState: (state) => states.push(state),
  });
  assert.equal(await audio.play("sent_en:Hello"), true);
  assert.equal(media.src, "../assets/game-audio/hello.mp3");
  assert.deepEqual(states.slice(0, 2), ["loading", "playing"]);
  media.ended = true;
  media.dispatchEvent(new Event("ended"));
  assert.equal(states.at(-1), "ended");
  audio.dispose();
});

test("game-audio：重听复用上一引用，stop 后迟到 play 不得恢复播放", async () => {
  const media = new FakeMedia();
  let states = [];
  const audio = createGameAudio({
    episode: 5,
    media,
    audioIndex: { entries: { "word:demon:en": { src: "assets/adv_audio/demon.mp3", text: "demon", lang: "en-US" } } },
    onState: (state) => states.push(state),
  });
  await audio.play({ ref: "word:demon:en" });
  assert.equal(await audio.replay(), true);
  media.resolvePlay = true;
  const pending = audio.play("word:demon:en");
  audio.stop("navigation");
  media._resolvePlay?.();
  assert.equal(await pending, false);
  assert.equal(states.at(-1), "idle");
  audio.dispose();
});

test("game-audio：静态缺失时走可审计 TTS 回退，播放失败标记 unavailable", async () => {
  const media = new FakeMedia();
  const seen = [];
  const audio = createGameAudio({ episode: 1, media, audioIndex: { entries: {} }, onState: (state, meta) => seen.push({ state, meta }) });
  assert.equal(await audio.play({ text: "unindexed", lang: "en-US" }), true);
  assert.match(media.src, /\/api\/tts\?voice=en/);
  media.rejectPlay = true;
  assert.equal(await audio.play({ text: "broken", lang: "en-US" }), false);
  assert.equal(seen.at(-1).state, "unavailable");
  audio.dispose();
});

test("game-audio：allowTts=false 时静态缺失不请求 /api/tts", async () => {
  const media = new FakeMedia();
  const seen = [];
  const audio = createGameAudio({
    episode: 1,
    media,
    allowTts: false,
    audioIndex: { entries: {} },
    onState: (state, meta) => seen.push({ state, meta }),
  });
  assert.equal(await audio.play({ text: "unindexed", lang: "en-US" }), false);
  assert.equal(media.src, "");
  assert.equal(seen.at(-1).state, "unavailable");
  assert.equal(seen.at(-1).meta.reason, "offline-no-static");
  audio.dispose();
});

test("game-audio：对白保留原始 audioRef 时仍按文本命中已发布静态片段", async () => {
  const media = new FakeMedia();
  const audio = createGameAudio({
    media,
    audioIndex: {
      entries: {
        "dialogue:ep1-map-intro-1:en": {
          text: "One day the rock split open.",
          lang: "en-US",
          src: "assets/adv_audio/sent_en/f7bd5bebf237.mp3",
        },
      },
    },
  });
  await audio.play({
    ref: "sent_en:One day the rock split open.",
    text: "One day the rock split open.",
    lang: "en-US",
  });
  assert.equal(media.src, "../assets/adv_audio/sent_en/f7bd5bebf237.mp3");
  audio.dispose();
});
