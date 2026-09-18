import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, name), 'utf8');

test('parent.html：按顺序引入 tv-remote / parent-core / parent.js 并加载 tv 样式', () => {
  const html = read('parent.html');
  const scripts = [...html.matchAll(/<script[^>]*\ssrc="([^"?]+)(?:\?[^"]*)?"/g)]
    .map((m) => m[1].replace(/^\.\//, ''))
    .filter((src) => src !== 'native-key.js' && src !== 'handheld-controls.js' && src !== 'content-gate.js');
  assert.deepEqual(scripts, ['tv-remote.js', 'walker-cast.js', 'walker-progress.js', 'parent-core.js', 'parent.js']);
  assert.match(html, /href=["']tv\.css(?:\?[^"']*)?["']/i, 'parent.html must load tv.css');
  assert.match(html, /href=["']handheld\.css(?:\?[^"']*)?["']/i);
});

test('parent.html：家长须知三句话与核心控件齐备', () => {
  const html = read('parent.html');
  assert.match(html, /照着卡片上的中文问就行/);
  assert.match(html, /指图也算回应/);
  assert.match(html, /把练习当互动，不是当考试/);
  for (const id of ['parent-question', 'parent-prompt', 'parent-slots', 'parent-illustration', 'parent-star', 'parent-prev', 'parent-next', 'parent-walker', 'parent-status', 'parent-hear']) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
  assert.match(html, /id="parent-status"[^>]*aria-live="polite"/);
});

test('parent.js：只使用 bookplay_parent_card_v1，无危险 API', () => {
  const js = read('parent.js');
  const keys = [...js.matchAll(/bookplay_[a-z_0-9]+/g)].map((m) => m[0]);
  assert.deepEqual([...new Set(keys)], ['bookplay_parent_card_v1']);
  assert.doesNotMatch(js, /\beval\s*\(|new Function\s*\(|document\.write/);
  assert.match(js, /window\.WalaParentCore/);
  assert.match(js, /Core\.buildParentCards\(/);
  assert.doesNotMatch(js, /addSP/, '亲子卡不发 SP');
});

test('parent-core：不产生判定或奖励语义', () => {
  const core = read('parent-core.js');
  assert.doesNotMatch(core, /bookplay_/);
  assert.doesNotMatch(core, /\b(score|scoring|reward|points)\b/i, '核心逻辑只产出问句与素材');
});
