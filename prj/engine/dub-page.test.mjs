import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, name), 'utf8');

test('dub.html：按顺序引入核心模块与页面脚本', () => {
  const html = read('dub.html');
  const scripts = [...html.matchAll(/<script[^>]*\ssrc="([^"?]+)(?:\?[^"]*)?"/g)]
    .map((m) => m[1].replace(/^\.\//, ''))
    .filter((src) => src !== 'native-key.js' && src !== 'handheld-controls.js' && src !== 'content-gate.js');
  const expected = ['tv-remote.js', 'storage.js', 'step-log-core.js', 'step-log.js', 'dub-core.js', 'dub-store.js', 'dub-recorder.js', 'dub.js'];
  assert.deepEqual(scripts, expected);
});

test('dub.html：录音初始隐藏、状态区可播报、放映厅与星级齐备', () => {
  const html = read('dub.html');
  assert.match(html, /id="dub-rec"[^>]*hidden/);
  assert.match(html, /id="dub-status"[^>]*aria-live="polite"/);
  assert.match(html, /id="dub-notice"[^>]*aria-live="polite"/);
  assert.match(html, /id="dub-theater"/);
  assert.match(html, /id="dub-stars"/);
  for (const id of ['dub-hear', 'dub-play', 'dub-save', 'dub-delete', 'dub-withvideo', 'dub-video', 'dub-tvideo']) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
});

test('dub.js：只使用合同内的存储键与受控 DOM API', () => {
  const js = read('dub.js');
  assert.doesNotMatch(js, /\beval\s*\(|new Function\s*\(|document\.write/);
  for (const key of ['bookplay_dub_v1', 'bookplay_dub_reward_v1']) {
    assert.ok(js.includes(key) || read('dub-core.js').includes(key), key);
  }
  assert.match(js, /Core\.DUB_INDEX_KEY/);
  assert.match(js, /Core\.DUB_REWARD_KEY/);
  assert.match(js, /Core\.dubKey|dubKey\(/);
  assert.match(js, /firstSaveReward/);
});

test('dub.js：无麦克风与内存回退路径都有降级提示', () => {
  const js = read('dub.js');
  assert.match(js, /不支持录音/);
  assert.match(js, /仅本次有效|关闭页面就没有啦/);
  assert.match(js, /存储空间不够/);
});

test('dub.js：多系列支持（西游记 C01~C02 / 我的世界 / Mikey & JJ）', () => {
  const js = read('dub.js');
  assert.match(js, /series.*minecraft|"mikey-jj"/);
  assert.match(js, /storybooks-minecraft/);
  assert.match(js, /storybooks-mikey-jj/);
  assert.match(js, /normalizeDubBook/);
  assert.match(js, /sentenceAudios/, '听原声需优先句级音频');
  assert.match(js, /storybook\.html\?series=/, '返回播放器需支持绘本播放器');
});

test('dub-core 暴露的存储合同常量与方案一致', () => {
  const core = read('dub-core.js');
  assert.match(core, /bookplay_dub_v1/);
  assert.match(core, /bookplay_dub_reward_v1/);
  assert.match(core, /bookplay_dub_audio_v1/);
});
