import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => fs.readFileSync(path.join(dir, name), "utf8");
const shelf = read("shelf.js");
const home = read("home.js");
const map = read("map.js");
const wala = read("wala.js");
const html = read("wala.html");
const css = read("wala.css");

test("episode shelves expose a separate pure-listening entry without hijacking study links", () => {
  for (const source of [shelf, home]) {
    assert.match(source, /mode=listen/, "episode cards need a listen-mode URL");
    assert.match(source, /visual=audio/, "listen entry must request the audio-only visual");
    assert.match(source, /磨耳朵/, "listen entry needs a visible label");
    assert.match(source, /stopPropagation|preventDefault/, "listen entry must not bubble into the main card link");
  }
});

test("the Journey route map exposes the same independent listening action", () => {
  assert.match(map, /mode=listen/);
  assert.match(map, /visual=audio/);
  assert.match(map, /node-listen|磨耳朵/);
  assert.match(map, /stopPropagation|preventDefault/);
});

test("audio-only listen mode never loads or displays episode video art", () => {
  assert.match(wala, /audioOnlyListen/);
  assert.match(wala, /visual.*audio|audio.*visual/);
  assert.match(wala, /if\s*\(listenMode\s*&&\s*audioOnlyListen\)/);
  assert.match(wala, /edgeItems\(n\.text_en,\s*["']en-US["']\)/);
  assert.match(wala, /if\s*\(!audioOnlyListen(?:Query)?\)\s*(?:\{[\s\S]*?\}|await\s+ensureVideo\(\))/);
  assert.match(html, /纯听力模式/);
  assert.match(css, /\.w-frame\.audio-only/);
  assert.match(css, /\.w-frame\.audio-only[^}]*::before|\.w-frame\.audio-only\s*>\s*img[\s\S]*display:\s*none/);
  assert.match(css, /journey-west-cover\.png/, "audio-only screen should reuse the Journey cover background");
});

test("audio-only listen mode keeps annotated captions and side vocabulary aids", () => {
  assert.match(wala, /const term = termAt\(node,\s*tok\.text\)/, "listening captions should keep vocabulary term marks");
  assert.match(wala, /const gloss = annotOn \? glossOf\(bare,\s*node\) : ""/, "listening captions should keep optional gloss annotations");
  assert.match(wala, /const audioOnlyAids = listenMode && audioOnlyListen/, "audio-only mode should opt into learning-aid visibility");
  assert.match(wala, /if\s*\(listenMode && !audioOnlyListen\)\s*\{[\s\S]*cards\.classList\.add\("hidden"\)/, "only non-visual listening should hide side cards");
});

console.log("PASS listen entry contracts");
