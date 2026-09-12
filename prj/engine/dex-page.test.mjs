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
  assert.deepEqual([...new Set(keys)], ['bookplay_dex_v1', 'bookplay_adv_vocab_stat'], '图鉴页读图鉴键与掌握度（只读，不写）');
  assert.doesNotMatch(js, /localStorage\.setItem\([^)]*adv_vocab/, '掌握度库只读');
  assert.match(js, /BookPlayCollectionCore/);
  assert.match(js, /Core\.completion/);
  assert.doesNotMatch(js, /\beval\s*\(|new Function\s*\(|document\.write/);
  // 2026-09-12 进化演出：允许写 bookplay_dex_v1（经 KEY_DEX 常量），禁止字面量键直写
  assert.match(js, /localStorage\.setItem\(KEY_DEX/);
  assert.doesNotMatch(js, /localStorage\.setItem\(['"]/,'只允许经 KEY_DEX 写图鉴存档');
});

test('dex.css：命中高度与 reduced motion', () => {
  const css = read('dex.css');
  assert.match(css, /min-height:\s*48px/);
  assert.match(css, /prefers-reduced-motion/);
});
