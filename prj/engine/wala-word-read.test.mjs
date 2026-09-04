import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, name), 'utf8');

test('wala.html：语音模块在 wala.js 前按核心到网关顺序引入并更新版本', () => {
  const html = read('wala.html');
  const scripts = [...html.matchAll(/<script src="([^"?]+)(?:\?[^"`]*)?"><\/script>/g)].map((m) => m[1]);
  const coreIndex = scripts.indexOf('voice-core.js');
  const voiceIndex = scripts.indexOf('voice.js');
  const walaIndex = scripts.indexOf('wala.js');
  assert.ok(coreIndex >= 0 && voiceIndex >= 0 && walaIndex >= 0);
  assert.ok(coreIndex < voiceIndex && voiceIndex < walaIndex);
  assert.match(html, /voice-core\.js\?v=1/);
  assert.match(html, /voice\.js\?v=1/);
  assert.match(html, /wala\.js\?v=72/);
  assert.match(html, /wala\.css\?v=56/);
});

test('wala.js：只有麦克风可用时才插入跟读按钮，并使用统一语音反馈', () => {
  const js = read('wala.js');
  assert.match(js, /voicePort\s*=\s*window\.WalaVoice/);
  assert.match(js, /voicePort[\s\S]*?capabilities\(\)/);
  assert.match(js, /capabilities[\s\S]*?\.mic/);
  assert.match(js, /micReady[\s\S]*?vread/);
  assert.match(js, /WalaVoiceCore\.feedbackFor/);
  assert.match(js, /aria-live="polite"|setAttribute\("aria-live",\s*"polite"\)/);
});

test('wala.js：跟读入口只存在于 learn 卡且包含三次防挫败与忙碌锁', () => {
  const js = read('wala.js');
  assert.match(js, /card\.mode\s*===\s*"learn"[\s\S]*?bindWordRead/);
  assert.match(js, /className\s*=\s*"vread"/);
  assert.match(js, /readAttempts|read-attempts/);
  assert.match(js, /3/);
  assert.match(js, /readBusy|read-busy/);
  assert.match(js, /setTimeout[\s\S]*?2000/);
});

test('wala.js：跟读不落盘、不使用动态代码执行', () => {
  const js = read('wala.js');
  assert.doesNotMatch(js, /\blocalStorage\.setItem\s*\(/);
  assert.doesNotMatch(js, /\beval\s*\(|new Function\s*\(/);
});
