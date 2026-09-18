import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, name), 'utf8');

test('map.js：集卡片面不再内嵌磨耳朵/配音/打怪小选项', () => {
  const js = read('map.js');
  assert.doesNotMatch(js, /class="node-actions"/, '卡片面不应再有 node-actions 汇总层');
  assert.doesNotMatch(js, /class="node-listen"/);
  assert.doesNotMatch(js, /class="node-dub"/);
  assert.doesNotMatch(js, /class="node-battle"/);
});

test('map.js：点卡片打开集详情弹层（P1 双路径 + 地图；非 dualPath 回退学习）', () => {
  const js = read('map.js');
  assert.match(js, /function openEpisodeDetail/);
  assert.match(js, /data-detail="\$\{n\}"/, 'node-main 携带 data-detail');
  assert.match(js, /dualPath: true/, 'jttw 启用双路径入口');
  assert.match(js, /path-card path-listen/, '听力入章大卡');
  assert.match(js, /path-card path-read/, '阅读入章大卡');
  assert.match(js, /episode-detail-resume/, '显示「继续上次学习」进度行');
  assert.match(js, /episode-detail-mode[^>]*>地图/);
  assert.match(js, /game\.html\?ep=\$\{n\}/, '地图入口指向大地图 game.html');
  assert.doesNotMatch(js, /▶ 进入故事/, '不再把学习写成默认主按钮');
  assert.doesNotMatch(js, /⚔️ 打怪/, '打怪改叫地图，和三种玩法并列');
  assert.match(js, /episode-detail-option[^>]*>配音/);
  assert.match(js, /本辑巩固/);
  assert.match(js, /drill\.html\?c=\$\{collection\.id\}/);
  assert.match(js, /function closeEpisodeDetail/);
  assert.match(js, /ev\.target === detailEl/, '点遮罩关闭');
  assert.match(js, /walkCompanionTo\(route, index, show\)/, '伙伴走到卡片后弹出三入口，不直接进学习');
  assert.match(js, /openEpisodeDetail\(n\)/);
  assert.doesNotMatch(js, /window\.location\.href = link\.href/, '点卡片不再默认跳进 wala 学习');
});

test('map.js：选关卡片放大（cap 0.27 / CARD_MIN 120，2026-09-12 全屏改版）', () => {
  const js = read('map.js');
  assert.match(js, /w \* 0\.27/);
  assert.match(js, /CARD_MIN = 120/);
});

test('map.js：全屏改版移除顶栏/合辑条/辑信息行/卡片喇叭', () => {
  const js = read('map.js');
  assert.doesNotMatch(js, /class="node-speak"/, '卡片喇叭按钮已移除');
  assert.doesNotMatch(js, /class="page-head"/, '辑信息行已移除');
  assert.doesNotMatch(js, /page-primary-action/, '页级主按钮已移除');
  const html = read('map.html');
  assert.doesNotMatch(html, /id="map-top"/, '顶栏已移除');
  assert.match(html, /id="map-audio-float"/, '音频控件浮层保留');
});

test('map.css：详情弹层样式齐备且命中高度达标', () => {
  const css = read('map.css');
  assert.match(css, /\.episode-detail \{/);
  assert.match(css, /\.episode-detail-card \{/);
  assert.match(css, /\.episode-detail-mode,/);
  assert.match(css, /min-height:\s*68px/, '主按钮 ≥64px');
  assert.match(css, /min-height:\s*64px/, '选项按钮 ≥64px');
});
