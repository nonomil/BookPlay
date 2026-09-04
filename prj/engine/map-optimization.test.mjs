import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => fs.readFileSync(path.join(dir, name), "utf8");

test("map exposes one page-level continue action for the current learning state", () => {
  const html = read("map.html");
  const js = read("map.js");
  const css = read("map.css");
  assert.match(html, /id="map-track"/);
  assert.match(js, /page-primary-action/);
  assert.match(js, /verb\s*=\s*nextEpisode/);
  assert.match(js, /去完成本辑巩固/);
  assert.match(css, /\.page-primary-action/);
});

test("splash companion card exposes recent earned medals beside the cover", () => {
  const html = read("map.html");
  const js = read("map.js");
  const css = read("map.css");
  assert.match(html, /id="splash-companion-medals"/);
  assert.match(html, /id="splash-medal-strip"/);
  assert.match(html, /id="splash-medal-empty"/);
  assert.match(js, /function renderSplashMedals/);
  assert.match(js, /slice\(0, 3\)/);
  assert.match(js, /splashMedalShape/);
  assert.match(css, /\.splash-medal\.shape-diamond/);
  assert.match(css, /\.splash-medal-empty/);
});

test("map initial position stays on an unlocked drill before showing the next locked collection", () => {
  const js = read("map.js");
  assert.match(js, /colUnlocked\(c,\s*cols\[i\s*-\s*1\]/);
  assert.match(js, /if\s*\(SERIES\.hasDrill[\s\S]{0,80}!drillDone\(c\)\)\s*return i/);
  assert.match(js, /if\s*\(!colDone\(c\)\)\s*return i/);
});

test("episode progress records a learning day only after real progress", () => {
  const js = read("adventure.js");
  assert.match(js, /function localDay/);
  assert.match(js, /\.day\s*=\s*localDay\(\)/);
  assert.match(js, /idx\s*>\s*0|done/);
  assert.match(js, /previous\.done/);
});

test("companion exposes a retryable loading failure state", () => {
  const html = read("companion.html");
  const js = read("companion.js");
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /id="companion-retry"/);
  assert.match(js, /companion-retry/);
  assert.match(js, /retry/);
});

test("reduced motion disables map bobbing and smooth scrolling", () => {
  const css = read("map.css");
  const js = read("map.js");
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /\.node-tip[^{]*\{[^}]*animation:\s*none\s*!important/s);
  assert.match(css, /#map-track[^}]*scroll-behavior:\s*auto/s);
  assert.match(css, /\.route-companion\s*\{[^}]*transition:\s*none/s);
  assert.match(js, /data-unlocked=\"\$\{isUnlocked \? \"true\" : \"false\"\}\"/);
});
