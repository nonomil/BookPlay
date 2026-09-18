import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, name), 'utf8');

test('wala.html：任务前置卡齐备，三问 + 降焦虑文案 + 点击开始', () => {
  const html = read('wala.html');
  for (const id of ['w-mission', 'w-mission-title', 'w-mission-rule', 'w-mission-start']) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
  assert.match(html, /role="dialog"/, '任务卡是对话框');
  assert.match(html, /Who\?[\s\S]*Where\?[\s\S]*What happened\?/, '三问按顺序出现');
  assert.match(html, /一步一步来，故事会越来越清楚/, '降焦虑结语');
  assert.match(html, /A LITTLE EVERY DAY/);
  assert.match(html, /w-recap/, '听力完成卡带三问回扣');
});

test('wala.js：任务卡按路径切换文案，回扣/复盘不弹卡，点击后才播放', () => {
  const js = read('wala.js');
  assert.match(js, /function showMissionCard\(/);
  assert.match(js, /听力入章 · 小任务/);
  assert.match(js, /阅读入章 · 小任务/);
  assert.match(js, /不暂停 · 不查单词 · 不必听懂每一句/, '听力路径降焦虑规则');
  assert.match(js, /不逐词翻译 · 先跟上故事主线/, '阅读路径规则');
  assert.match(js, /开始听故事|开始读故事/);
  assert.match(js, /if \(reviewContext\) beginPlayback\(\);\s*else showMissionCard\(beginPlayback\);/, '回顾模式跳过任务卡，正常路径先进任务卡');
  assert.match(js, /beginPlayback/, '播放入口收敛为单一回调');
  // 播放（enterListenMode / playCurrentSentence）必须在任务卡回调里，不自动开跑
  const missionBody = js.slice(js.indexOf('function showMissionCard('));
  const bootBody = js.slice(js.indexOf('const beginPlayback'));
  assert.ok(bootBody.includes('enterListenMode') && bootBody.includes('playCurrentSentence'),
    'beginPlayback 内含两条路径的启动');
  assert.ok(missionBody.length > 0);
  // 结尾回扣：剧情遍完成卡带小挑战
  assert.match(js, /小挑战：用自己的话说说，刚才发生了什么/, '剧情遍完成卡回扣输出');
});

test('wala.css：任务卡覆盖播放器且开始按钮命中高度达标', () => {
  const css = read('wala.css');
  assert.match(css, /\.w-mission \{[^}]*position:\s*absolute/, '覆盖在播放器上');
  assert.match(css, /\.w-mission\.hidden \{ display: none; \}/);
  assert.match(css, /\.w-mission-start \{[^}]*min-height:\s*64px/, '开始按钮 ≥64px');
});

test('map.js：听力路径沿用磨耳朵参数（无字幕可视化 + 2 遍）', () => {
  const js = read('map.js');
  assert.match(js, /mode=listen&loops=2&visual=audio&subtitle=enzh/);
});
