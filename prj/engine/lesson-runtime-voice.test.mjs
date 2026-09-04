import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(root, 'lesson.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'lesson.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'lesson.css'), 'utf8');
const tvCss = fs.readFileSync(path.join(root, 'tv.css'), 'utf8');

test('每集页面在 lesson.js 前加载 voice-core 与 voice', () => {
  const core = html.indexOf('voice-core.js');
  const voice = html.indexOf('voice.js');
  const lesson = html.indexOf('lesson.js');
  assert.ok(core >= 0);
  assert.ok(voice > core);
  assert.ok(lesson > voice);
});

test('每集页面提供可选跟读控件和可读状态', () => {
  assert.match(js, /WalaVoice/);
  assert.match(js, /voice-practice/);
  assert.match(js, /听示范/);
  assert.match(js, /再试一次/);
  assert.match(js, /跳过/);
  assert.match(js, /aria-live="polite"/);
  assert.match(css, /voice-practice/);
});

test('跟读只提供有限练习，不改变题目完成链路', () => {
  assert.match(js, /voiceOffered/);
  assert.match(js, /voiceOffered\s*=\s*true/);
  assert.match(js, /voiceStt/);
  assert.match(js, /finishLesson\(/);
});

test('Edge-TTS fallback is scoped to the failed clip instead of replaying the whole bilingual sequence', () => {
  assert.match(js, /function fallbackSpeakItem\(item, token, trigger\)/);
  assert.match(js, /const fallback = await fallbackSpeakItem\(item, token, trigger\)/);
  assert.doesNotMatch(js, /const fallback = fallbackSpeakSequence\(normalized, token, trigger\)/);
});

test('all lesson speakers remain square under the TV global minimum height', () => {
  assert.match(css, /\.audio-button\s*\{[^}]*aspect-ratio:\s*1\s*\/\s*1/);
  assert.match(tvCss, /body\.lesson-body\s+:is\(\.audio-button,[\s\S]*aspect-ratio:\s*1\s*\/\s*1/);
});

test('大屏测验选项喇叭保持正圆，不被电视按钮最小高度拉伸', () => {
  const choiceAudioRule = css.match(/\.choice-row\s*>\s*\.audio-button\s*\{([^}]*)\}/);
  assert.ok(choiceAudioRule, '应存在测验选项喇叭的专属样式');
  assert.match(choiceAudioRule[1], /width:\s*46px/);
  assert.match(choiceAudioRule[1], /height:\s*46px/);
  assert.match(choiceAudioRule[1], /min-height:\s*46px/);
  assert.match(choiceAudioRule[1], /aspect-ratio:\s*1\s*\/\s*1/);
  assert.match(choiceAudioRule[1], /flex:\s*0\s*0\s*46px/);
});

test('测验页只承载题目，单词学习页独立承载词卡并进入测验', () => {
  assert.doesNotMatch(html, /id="lesson-story"/);
  assert.match(tvCss, /body\.lesson-body\s+\.question-card\s*\{[^}]*min-height:\s*0/);
  assert.match(tvCss, /body\.lesson-body\s+\.choice-button\s*\{[^}]*min-height:\s*(?:5[0-9]|60)px/);

  const wordsPath = path.join(root, 'lesson-words.html');
  assert.equal(fs.existsSync(wordsPath), true, '应提供独立的单词学习页');
  if (!fs.existsSync(wordsPath)) return;
  const wordsHtml = fs.readFileSync(wordsPath, 'utf8');
  assert.match(wordsHtml, /lesson-words-body/);
  assert.match(wordsHtml, /lesson-word-review/);
  assert.match(wordsHtml, /进入.*测验/);
  assert.match(js, /wordsMode|lessonWordsMode/);
});
