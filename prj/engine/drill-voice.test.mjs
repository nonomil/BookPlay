import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(root, 'drill.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'drill.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'drill.css'), 'utf8');

test('整辑页面在 drill.js 前加载统一语音模块', () => {
  const media = html.indexOf('media.js');
  const core = html.indexOf('voice-core.js');
  const voice = html.indexOf('voice.js');
  const drill = html.indexOf('drill.js');
  assert.ok(media >= 0);
  assert.ok(core > media);
  assert.ok(voice > core);
  assert.ok(drill > voice);
});

test('单词题提供可选跟读和可访问状态', () => {
  assert.match(js, /WalaVoice/);
  assert.match(js, /voice-practice/);
  assert.match(js, /听示范/);
  assert.match(js, /再试一次/);
  assert.match(js, /跳过/);
  assert.match(js, /aria-live/);
  assert.match(css, /voice-practice/);
});

test('语音失败不参与巩固通关判定', () => {
  assert.match(js, /finishCheck\(/);
  assert.match(js, /d\[cid\] = \{ done: true/);
  assert.doesNotMatch(js, /voice.*finishCheck|finishCheck.*voice/i);
});

test('巩固音频合并 quiz 索引并使用持久 Audio 元素', () => {
  assert.match(js, /quiz_en_index\.json/);
  assert.match(js, /quiz_zh_index\.json/);
  assert.match(js, /const drillAudio = .*new Audio\(\)/);
  assert.doesNotMatch(js, /new Audio\(url\)/);
  assert.match(js, /drillAudio\.src = source/);
  assert.match(js, /drillAudio\.pause\(\)/);
  assert.match(js, /Object\.assign\(\{\}, se \|\| \{\}, qe \|\| \{\}\)/);
});

test('静态音频播放失败后回退到 TTS', () => {
  const playText = js.slice(js.indexOf('async function playText'), js.indexOf('function voiceMessage'));
  assert.match(playText, /catch[\s\S]*if \(!clip\)\s*return/);
  assert.match(playText, /ttsUrl\(t, lang\)/);
  assert.match(playText, /await drillAudio\.play\(\)/g);
});

test('单词题喇叭读目标词而非例句', () => {
  assert.match(js, /playText\(w\.term\)/);
  assert.doesNotMatch(js, /playText\(w\.example\)/);
});

test('剧情测验题干和中英文选项均提供朗读按钮', () => {
  assert.match(js, /quizDisplay/);
  assert.match(js, /opt-speak/);
  assert.match(js, /playText\(display\.choicesEn\[index\]\)/);
  assert.match(js, /playText\(display\.promptZh,\s*["']zh-CN["']\)/);
  assert.match(js, /playText\(display\.choicesZh\[index\],\s*["']zh-CN["']\)/);
  const quizRender = js.slice(js.indexOf('function renderQuiz()'), js.indexOf('function quizAnswer('));
  assert.match(js, /q-hint-box/);
  assert.doesNotMatch(quizRender, /<span class="opt-zh">/);
});
