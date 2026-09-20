import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { COLLECTIONS, coverRange } = require("./play-map.js");
const dir = dirname(fileURLToPath(import.meta.url));

test("play-map 13 辑覆盖 1–108 且不重叠", () => {
  assert.equal(COLLECTIONS.length, 13);
  assert.deepEqual(coverRange(COLLECTIONS), []);
  assert.equal(COLLECTIONS[0].from, 1);
  assert.equal(COLLECTIONS[12].to, 108);
});

test("play-map 页只进 game.html，不进学习页", () => {
  const html = readFileSync(join(dir, "play-map.html"), "utf8");
  const js = readFileSync(join(dir, "play-map.js"), "utf8");
  const css = readFileSync(join(dir, "play-map.css"), "utf8");
  assert.match(html, /handheld-controls\.js/);
  assert.match(html, /data-app="bookplay"/);
  assert.match(js, /game\.html\?ep=/);
  assert.doesNotMatch(js, /wala\.html|study\.html|storybook\.html|drill\.html/);
  assert.match(css, /min-height:\s*44px/);
  assert.doesNotMatch(css, /backdrop-filter:\s*blur/);
  assert.doesNotMatch(css, /transform:\s*scale/);
});
