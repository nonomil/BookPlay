import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, name), 'utf8');

test('parent-report.html：按顺序引入步日志与报告脚本', () => {
  const html = read('parent-report.html');
  const scripts = [...html.matchAll(/<script[^>]*\ssrc="([^"?]+)(?:\?[^"]*)?"/g)]
    .map((m) => m[1].replace(/^\.\//, ''))
    .filter((src) => src !== 'native-key.js' && src !== 'handheld-controls.js' && src !== 'content-gate.js');
  assert.deepEqual(scripts, ['tv-remote.js', 'step-log-core.js', 'step-log.js', 'parent-report.js']);
});

test('parent-report.html：四大板块齐备且有隐私说明', () => {
  const html = read('parent-report.html');
  assert.match(html, /数据只保存在这台设备上/);
  for (const id of ['report-overview', 'report-rows', 'report-weak', 'report-suggest']) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
  assert.match(html, /href="map\.html"/, '返回地图入口');
});

test('parent-report.js：只读本机 bookplay 键，使用纯逻辑核心，无危险 API', () => {
  const js = read('parent-report.js');
  const keys = [...js.matchAll(/bookplay_[a-z_0-9]+/g)].map((m) => m[0]);
  assert.deepEqual([...new Set(keys)], ['bookplay_adv_progress', 'bookplay_adv_vocab_stat'], '报告只读进度与词统计');
  assert.match(js, /window\.BookPlayStepLogCore/);
  assert.match(js, /Core\.summarize\(/);
  assert.match(js, /Core\.KEY/);
  assert.doesNotMatch(js, /\beval\s*\(|new Function\s*\(|document\.write|fetch\(/, '报告页不发网络请求');
});

test('step-log 埋点不阻塞主流程：wala/lesson/dub/drill 均为 try 静默调用', () => {
  const wala = read('wala.js');
  assert.match(wala, /window\.BookPlayStepLog/);
  assert.match(wala, /step: "watch"/);
  assert.match(wala, /pagehide[\s\S]{0,200}logWatchStep\("quit"\)/, 'wala 中途退出记 quit');

  const lesson = read('lesson.js');
  assert.match(lesson, /window\.BookPlayStepLog/);
  assert.match(lesson, /logLessonStep\("practice"/, 'lesson.js 记录 practice 步');
  assert.match(lesson, /logLessonStep\("check"/, 'lesson.js 记录 check 步');

  const dub = read('dub.js');
  assert.match(dub, /window\.BookPlayStepLog/);
  assert.match(dub, /step: "output"/);

  const drill = read('drill.js');
  assert.match(drill, /window\.BookPlayStepLog/);
  assert.match(drill, /step: "drill"/);
});

test('parent-report 与 step-log 已入 APK 引擎白名单', () => {
  const pack = readFileSync(join(here, '..', 'tools', 'pack_android.py'), 'utf8');
  for (const name of ['step-log-core.js', 'step-log.js', 'parent-report.html', 'parent-report.js']) {
    assert.ok(pack.includes(`"${name}"`), `${name} 必须在 pack_android.py ENGINE_FILES`);
  }
});
