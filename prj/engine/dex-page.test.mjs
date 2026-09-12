import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, name), 'utf8');

test('dex.html：按顺序引入 app-audio / tv-remote / collection-core / dex.js', () => {
  const html = read('dex.html');
  const scripts = [...html.matchAll(/<script src="([^"?]+)(?:\?[^"]*)?"><\/script>/g)].map((m) => m[1]);
  assert.deepEqual(scripts, ['app-audio.js', 'tv-remote.js', 'collection-core.js', 'dex.js']);
  assert.match(html, /href=["']tv\.css(?:\?[^"']*)?["']/i);
  assert.match(html, /id="dex-grid"/);
  assert.match(html, /id="dex-progress"/);
  assert.match(html, /id="dex-detail"/);
});

test('dex.js：只读 bookplay_dex_v1，复用 collection-core，无危险 API', () => {
  const js = read('dex.js');
  const keys = [...js.matchAll(/bookplay_[a-z_0-9]+/g)].map((m) => m[0]);
  assert.deepEqual([...new Set(keys)], ['bookplay_dex_v1'], '图鉴页只读图鉴键');
  assert.match(js, /BookPlayCollectionCore/);
  assert.match(js, /Core\.completion/);
  assert.doesNotMatch(js, /\beval\s*\(|new Function\s*\(|document\.write/);
  assert.doesNotMatch(js, /localStorage\.setItem/, '纯展示页不写存档');
});

test('dex.css：命中高度与 reduced motion', () => {
  const css = read('dex.css');
  assert.match(css, /min-height:\s*48px/);
  assert.match(css, /prefers-reduced-motion/);
});
