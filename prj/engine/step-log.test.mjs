import { test } from 'node:test';
import assert from 'node:assert/strict';
import Core from './step-log-core.js';

const NOW = Date.UTC(2026, 8, 19, 12, 0, 0); // 2026-09-19 12:00 UTC，day 断言走 dayKey() 本地格式
const DAY = 24 * 60 * 60 * 1000;

test('normalizeEvent：合法事件补齐字段，非法 step/event 丢弃', () => {
  const evt = Core.normalizeEvent({ ep: 3, path: 'listen', step: 'watch', event: 'enter' }, NOW);
  assert.equal(evt.ep, 3);
  assert.equal(evt.path, 'listen');
  assert.equal(evt.day, Core.dayKey(NOW));
  assert.equal(evt.t, NOW);
  assert.equal(Core.normalizeEvent({ step: 'dancing', event: 'enter' }, NOW), null);
  assert.equal(Core.normalizeEvent({ step: 'watch', event: 'exploded' }, NOW), null);
  assert.equal(Core.normalizeEvent(null, NOW), null);
  assert.equal(Core.normalizeEvent({ ep: 'abc', step: 'check', event: 'finish', ok: 'yes' }, NOW).ep, 0, '非法 ep 归 0');
  const noBool = Core.normalizeEvent({ ep: 1, step: 'check', event: 'finish', ok: 'yes', score: '3/5' }, NOW);
  assert.equal(noBool.ok, undefined, 'ok 只认布尔');
  assert.equal(noBool.score, '3/5');
});

test('appendEvent：环形上限裁剪，非法事件不影响原日志', () => {
  let log = [];
  for (let i = 0; i < 10; i += 1) log = Core.appendEvent(log, { ep: i, step: 'watch', event: 'enter' }, NOW + i, 4);
  assert.equal(log.length, 4);
  assert.equal(log[0].ep, 6, '保留最新 4 条');
  assert.deepEqual(Core.appendEvent(log, { step: 'nope', event: 'enter' }, NOW), log);
  assert.deepEqual(Core.appendEvent(null, { ep: 1, step: 'watch', event: 'enter' }, NOW).length, 1);
});

test('summarize：按集聚合、卡点取流程中第一个未完成步、窗口外事件剔除', () => {
  const log = [
    { t: NOW - 9 * DAY, day: Core.dayKey(NOW - 9 * DAY), ep: 1, path: 'read', step: 'watch', event: 'finish' }, // 窗口外
    { t: NOW - 2 * DAY, day: Core.dayKey(NOW - 2 * DAY), ep: 1, path: 'read', step: 'watch', event: 'enter' },
    { t: NOW - 2 * DAY + 60000, day: Core.dayKey(NOW - 2 * DAY), ep: 1, path: 'read', step: 'watch', event: 'finish' },
    { t: NOW - 2 * DAY + 120000, day: Core.dayKey(NOW - 2 * DAY), ep: 1, step: 'practice', event: 'enter' },
    { t: NOW - 2 * DAY + 180000, day: Core.dayKey(NOW - 2 * DAY), ep: 1, step: 'practice', event: 'quit' },
    { t: NOW - DAY, day: Core.dayKey(NOW - DAY), ep: 2, path: 'listen', step: 'watch', event: 'enter' },
    { t: NOW - 3600000, day: Core.dayKey(NOW - 3600000), ep: 3, path: 'listen', step: 'watch', event: 'enter' },
    { t: NOW - 3500000, day: Core.dayKey(NOW - 3600000), ep: 3, path: 'listen', step: 'watch', event: 'finish' },
    { t: NOW - 3400000, day: Core.dayKey(NOW - 3600000), ep: 3, step: 'check', event: 'enter' },
    { t: NOW - 3300000, day: Core.dayKey(NOW - 3600000), ep: 3, step: 'check', event: 'finish', ok: true, score: '4/5' },
  ];
  const s = Core.summarize(log, { now: NOW, days: 7 });
  assert.equal(s.eventCount, 9, '窗口外事件不计入');
  assert.deepEqual(s.activeDays, [Core.dayKey(NOW - 2 * DAY), Core.dayKey(NOW - DAY), Core.dayKey(NOW - 3600000)].sort());
  const row1 = s.rows.find((r) => r.ep === 1);
  assert.equal(row1.stuckAt, 'practice', '练单词进了一步但退出 → 卡在这');
  assert.equal(row1.path, 'read');
  const row2 = s.rows.find((r) => r.ep === 2);
  assert.equal(row2.stuckAt, 'watch', '只 enter 没 finish → 看故事未完成');
  const row3 = s.rows.find((r) => r.ep === 3);
  assert.equal(row3.stuckAt, null);
  assert.equal(row3.path, 'listen', '路径取自该集任何一步');
  assert.equal(row3.steps.check.ok, true);
  assert.equal(row3.steps.check.score, '4/5');
});

test('summarize：本辑巩固按 cid 独立成行', () => {
  const log = [
    { t: NOW - 1000, day: Core.dayKey(NOW), ep: 0, cid: 'c01', step: 'drill', event: 'enter' },
    { t: NOW - 500, day: Core.dayKey(NOW), ep: 0, cid: 'c01', step: 'drill', event: 'finish', ok: true },
  ];
  const s = Core.summarize(log, { now: NOW });
  assert.equal(s.rows.length, 1);
  assert.equal(s.rows[0].cid, 'c01');
  assert.equal(s.rows[0].stuckAt, null);
});

test('topWrongTerms：按错次降序，只含有错记录的词', () => {
  const vstat = { rock: { seen: 5, right: 3, wrong: 2 }, split: { seen: 6, right: 0, wrong: 4 }, gibbon: { seen: 2, right: 2, wrong: 0 } };
  const top = Core.topWrongTerms(vstat, 2);
  assert.deepEqual(top.map((t) => t.term), ['split', 'rock']);
  assert.deepEqual(Core.topWrongTerms(null, 5), []);
});

test('suggest：五条规则各自触发，最多输出 4 条', () => {
  const empty = Core.suggest(Core.summarize([], { now: NOW }), {});
  assert.equal(empty.length, 1);
  assert.match(empty[0].text, /还没有学习记录/);

  const stuck = Core.suggest(Core.summarize([
    { t: NOW, day: Core.dayKey(NOW), ep: 4, path: 'read', step: 'watch', event: 'enter' },
    { t: NOW, day: Core.dayKey(NOW), ep: 4, path: 'read', step: 'watch', event: 'quit' },
    { t: NOW, day: Core.dayKey(NOW), ep: 5, path: 'read', step: 'watch', event: 'enter' },
    { t: NOW, day: Core.dayKey(NOW), ep: 5, path: 'read', step: 'watch', event: 'quit' },
  ], { now: NOW }), {});
  assert.ok(stuck.some((s) => s.text.includes('听力入章')), '连续两集看一半 → 建议听力路径');

  const ctx = { vstat: { waterfall: { seen: 5, right: 1, wrong: 3 } } };
  const mixed = Core.suggest(Core.summarize([
    { t: NOW, day: Core.dayKey(NOW), ep: 2, path: 'read', step: 'watch', event: 'enter' },
    { t: NOW, day: Core.dayKey(NOW), ep: 2, path: 'read', step: 'watch', event: 'finish' },
    { t: NOW, day: Core.dayKey(NOW), ep: 2, step: 'check', event: 'enter' },
    { t: NOW, day: Core.dayKey(NOW), ep: 2, step: 'check', event: 'finish', ok: false, score: '2/5' },
  ], { now: NOW }), ctx);
  assert.ok(mixed.some((s) => s.text.includes('第 2 集巩固测验')), '测验未通过 → 复习错题建议');
  assert.ok(mixed.some((s) => s.text.includes('waterfall')), '错词≥3 → 点名词提醒');
  assert.ok(mixed.some((s) => s.text.includes('趣配音')), '有完成没输出 → 鼓励配音');
  assert.ok(mixed.length <= 4);

  const good = Core.suggest(Core.summarize([
    { t: NOW, day: Core.dayKey(NOW), ep: 7, path: 'listen', step: 'watch', event: 'enter' },
    { t: NOW, day: Core.dayKey(NOW), ep: 7, path: 'listen', step: 'watch', event: 'finish' },
    { t: NOW, day: Core.dayKey(NOW), ep: 7, step: 'practice', event: 'enter' },
    { t: NOW, day: Core.dayKey(NOW), ep: 7, step: 'practice', event: 'finish' },
  ], { now: NOW }), {});
  assert.ok(good.some((s) => s.text.includes('第 8 集')), '全绿 → 表扬并指向下一集');
});

test('suggest：check 未通过时即便无卡点也不出全绿表扬', () => {
  const out = Core.suggest(Core.summarize([
    { t: NOW, day: Core.dayKey(NOW), ep: 3, path: 'read', step: 'watch', event: 'enter' },
    { t: NOW, day: Core.dayKey(NOW), ep: 3, path: 'read', step: 'watch', event: 'finish' },
    { t: NOW, day: Core.dayKey(NOW), ep: 3, step: 'check', event: 'enter' },
    { t: NOW, day: Core.dayKey(NOW), ep: 3, step: 'check', event: 'finish', ok: false },
  ], { now: NOW }), {});
  assert.ok(!out.some((s) => s.icon === '🌟'), '有未通过测验不给全绿表扬');
});
