import { test } from 'node:test';
import assert from 'node:assert/strict';
import core from './voice-core.js';

test('单词跟读：忽略大小写和标点后精确命中', () => {
  const result = core.matchReference('Monkey', ' monkey! ');
  assert.equal(result.kind, 'match');
  assert.equal(result.accepted, true);
  assert.equal(result.coverage, 1);
  assert.equal(result.scores, null);
});

test('短词不使用编辑距离或宽松别名', () => {
  const result = core.matchReference('tree', 'three');
  assert.equal(result.kind, 'mismatch');
  assert.equal(result.accepted, false);
});

test('句子跟读区分完整命中和部分命中', () => {
  const complete = core.matchReference('The monkey jumped.', 'the monkey jumped');
  const partial = core.matchReference('The monkey jumped.', 'the monkey');
  assert.equal(complete.kind, 'match');
  assert.equal(complete.accepted, true);
  assert.equal(partial.kind, 'partial');
  assert.equal(partial.accepted, false);
  assert.equal(partial.missing.join(' '), 'jumped');
});

test('空识别结果是 no-speech，不伪造分数', () => {
  const result = core.normalizeResult({ text: '' }, {
    referenceText: 'hello',
    mode: 'read_word',
    provider: 'asr',
  });
  assert.equal(result.kind, 'no-speech');
  assert.equal(result.accepted, false);
  assert.equal(result.transcript, '');
  assert.equal(result.scores, null);
});

test('反馈把“识别命中”和“发音评分”分开', () => {
  const result = core.normalizeResult({ text: 'hello' }, { referenceText: 'hello' });
  const feedback = core.feedbackFor(result);
  assert.match(feedback.message, /听到了目标词|清楚/);
  assert.equal(feedback.showScore, false);
});

test('错误状态统一为可供页面消费的合同', () => {
  const result = core.errorResult('permission-denied', { referenceText: 'hello' });
  assert.equal(result.kind, 'permission-denied');
  assert.equal(result.accepted, false);
  assert.equal(result.provider, 'none');
  assert.equal(result.scores, null);
});
