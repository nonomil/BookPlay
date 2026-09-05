import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, name), 'utf8');

test('battle.html：按顺序引入 tv-remote / quiz / battle-core / battle.js 并加载 tv 样式', () => {
  const html = read('battle.html');
  const scripts = [...html.matchAll(/<script src="([^"?]+)(?:\?[^"]*)?"><\/script>/g)].map((m) => m[1]);
  assert.deepEqual(scripts, ['app-audio.js', 'tv-remote.js', 'episode-vocab-quiz.js', 'battle-core.js', 'battle.js']);
  assert.match(html, /href=["']tv\.css(?:\?[^"']*)?["']/i, 'battle.html must load tv.css');
  assert.match(html, /href=["']battle\.css(?:\?[^"']*)?["']/i);
});

test('battle.html：六阶段骨架与核心控件齐备', () => {
  const html = read('battle.html');
  for (const id of [
    'battle-backdrop', 'battle-hero', 'battle-monsters', 'battle-projectiles',
    'battle-shields', 'battle-progress', 'battle-combo', 'battle-exit',
    'battle-bossbar', 'battle-dialogue', 'battle-preview', 'battle-orbs',
    'battle-quiz', 'battle-result', 'battle-pause', 'battle-gate', 'battle-toast',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
});

test('battle.js：只使用两个 battle 存储键，无危险 API', () => {
  const js = read('battle.js');
  const keys = [...js.matchAll(/bookplay_[a-z_0-9]+/g)].map((m) => m[0]);
  assert.deepEqual([...new Set(keys)], ['bookplay_battle_progress_v1', 'bookplay_battle_collection_v1']);
  assert.doesNotMatch(js, /\beval\s*\(|new Function\s*\(|document\.write/);
});

test('battle.js：复用 battle-core 与 vocab quiz 模块', () => {
  const js = read('battle.js');
  for (const fn of ['buildLevel', 'buildWaveQuestions', 'buildOrbSet', 'judgeHit', 'settleRun', 'loadSprites']) {
    assert.match(js, new RegExp(`\\.${fn}\\(`), fn);
  }
  assert.match(js, /BookPlayEpisodeVocabQuiz/);
  assert.match(js, /buildEpisodeQuiz/);
});

test('battle-core：保持纯逻辑（无 DOM / 无存储）', () => {
  const js = read('battle-core.js');
  assert.doesNotMatch(js, /localStorage|document\./);
  assert.doesNotMatch(js, /bookplay_/);
});

test('battle.css：命中高度不低于 64px 且尊重 reduced motion', () => {
  const css = read('battle.css');
  assert.match(css, /min-height\s*:\s*64px/);
  assert.match(css, /prefers-reduced-motion/);
});

test('battle.html：无内联事件处理器', () => {
  const html = read('battle.html');
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
});
