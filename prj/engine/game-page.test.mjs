import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, name), 'utf8');

test('game.html：按顺序引入 app-audio / tv-remote / battle-core / game.js 并加载 tv 与 battle 样式', () => {
  const html = read('game.html');
  const scripts = [...html.matchAll(/<script src="([^"?]+)(?:\?[^"]*)?"><\/script>/g)].map((m) => m[1]);
  assert.deepEqual(scripts, ['app-audio.js', 'tv-remote.js', 'battle-core.js', 'game.js']);
  assert.match(html, /href=["']tv\.css(?:\?[^"']*)?["']/i, 'game.html must load tv.css');
  assert.match(html, /href=["']app-audio\.css(?:\?[^"']*)?["']/i, '音效模块样式');
  assert.match(html, /href=["']battle\.css(?:\?[^"']*)?["']/i, '复用 battle 的对话框与 toast 样式');
  assert.match(html, /href=["']game\.css(?:\?[^"']*)?["']/i);
});

test('game.html：场景/HUD/对话框/快卡/Boss 门/暂停/门禁控件齐备', () => {
  const html = read('game.html');
  for (const id of [
    'game-backdrop', 'game-walkzone', 'game-entities', 'game-projectiles', 'game-particles',
    'game-shields', 'game-progress', 'game-target-zh', 'game-target-speak', 'game-exit',
    'game-tray', 'game-joystick', 'game-dialogue', 'game-dialogue-face', 'game-dialogue-name',
    'game-dialogue-en', 'game-dialogue-zh', 'game-dialogue-choices', 'game-dialogue-next',
    'game-quickquiz', 'game-bossgate', 'game-pause', 'game-gate', 'game-toast',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
});

test('game.js：只使用两个 battle 存储键，无危险 API', () => {
  const js = read('game.js');
  const keys = [...js.matchAll(/bookplay_[a-z_0-9]+/g)].map((m) => m[0]);
  assert.deepEqual([...new Set(keys)], ['bookplay_battle_progress_v1', 'bookplay_battle_collection_v1']);
  assert.doesNotMatch(js, /\beval\s*\(|new Function\s*\(|document\.write/);
});

test('game.js：复用 battle-core 的出题/判定/精灵解析', () => {
  const js = read('game.js');
  for (const fn of ['buildLevel', 'buildWaveQuestions', 'buildOrbSet', 'judgeHit', 'loadSprites']) {
    assert.match(js, new RegExp(`\\.${fn}\\(`), fn);
  }
  assert.match(js, /BookPlayBattleCore/);
});

test('game.css：命中高度不低于 64px 且尊重 reduced motion', () => {
  const css = read('game.css');
  assert.match(css, /min-height\s*:\s*64px/);
  assert.match(css, /prefers-reduced-motion/);
});

test('game.html：无内联事件处理器', () => {
  const html = read('game.html');
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
});
