import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const { createController } = createRequire(import.meta.url)("./media.js");

class FakeAudio {
  constructor() {
    this.src = "";
    this.playbackRate = 1;
    this.onended = null;
    this.onerror = null;
    this.failPlay = false;
  }

  pause() {}

  play() {
    if (this.failPlay) return Promise.reject(new Error("decode"));
    queueMicrotask(() => { if (this.onended) this.onended(); });
    return Promise.resolve();
  }

  getAttribute(name) {
    return name === "src" ? this.src : null;
  }
}

function makeController(audio, extra = {}) {
  return createController({ audio, ...extra });
}

test("media：桌面默认允许 TTS 回退", async () => {
  const audio = new FakeAudio();
  const media = makeController(audio);
  await media.playSequence([{ tts: "Hello", lang: "en-US" }]);
  assert.match(audio.src, /\/api\/tts\?voice=en/);
});

test("media：allowTts=false 时静态缺失不请求 /api/tts", async () => {
  const audio = new FakeAudio();
  const media = makeController(audio, { allowTts: false });
  await media.playSequence([{ tts: "Hello", lang: "en-US" }]);
  assert.equal(audio.src.includes("/api/tts"), false);
});

test("media：html[data-handheld] 时静态缺失不请求 /api/tts", async () => {
  const previous = globalThis.document;
  globalThis.document = {
    documentElement: {
      hasAttribute(name) { return name === "data-handheld"; },
    },
  };
  try {
    const audio = new FakeAudio();
    const media = makeController(audio);
    await media.playSequence([{ tts: "Hello", lang: "en-US" }]);
    assert.equal(audio.src.includes("/api/tts"), false);
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});

test("media：allowTts=false 时 clip 失败也不回退 /api/tts", async () => {
  const audio = new FakeAudio();
  audio.failPlay = true;
  const media = makeController(audio, { allowTts: false });
  await media.playSequence([{ tts: "Hello", lang: "en-US", clip: "../assets/missing.mp3" }]);
  assert.equal(audio.src, "../assets/missing.mp3");
  assert.equal(audio.src.includes("/api/tts"), false);
});
