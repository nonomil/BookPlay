import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, name), "utf8");

function assertFarmWordAudioContract(js) {
  assert.match(js, /function speakFarmWord\(/);
  assert.match(js, /BookPlayGameAudio/);
  assert.match(js, /dbg\.audio/);
  assert.match(js, /hasAttribute\("data-handheld"\)/);
  assert.match(js, /if \(handheldOffline\(\)\) return;/);
  assert.doesNotMatch(js, /new Audio\(\s*["'`]\/api\/tts/);
  const audioIdx = js.indexOf("BookPlayGameAudio");
  const handheldIdx = js.indexOf('hasAttribute("data-handheld")');
  const ttsIdx = js.indexOf("/api/tts");
  assert.ok(audioIdx >= 0 && handheldIdx >= 0, "farm word play must prefer GameAudio and gate handheld");
  assert.ok(ttsIdx < 0 || (audioIdx < ttsIdx && handheldIdx < ttsIdx), "desktop TTS fallback must come after GameAudio and handheld skip");
}

test("farm-ui：词田读词优先 GameAudio / state.audio，handheld 不直打 /api/tts", () => {
  assertFarmWordAudioContract(read("farm-ui.js"));
});

test("Android farm-ui 副本遵守同一读词音频契约", () => {
  const androidJs = readFileSync(
    join(here, "..", "..", "android", "app", "src", "main", "assets", "engine", "farm-ui.js"),
    "utf8",
  );
  assertFarmWordAudioContract(androidJs);
});
