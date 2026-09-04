import { test } from 'node:test';
import assert from 'node:assert/strict';
import core from './dub-core.js';

function fakeBook() {
  return {
    episode: 1,
    audio: 'assets/lf_ep1/audio_ep1.mp3',
    video: 'assets/video/ep1.mp4',
    nodes: [
      { node_id: 'n001', speaker: 'narrator', text_en: 'A rock had sat on top of a mountain.', text_zh: '山巅有块岩石。', illustration: 'assets/adv_frames/ep1/f1.jpg', audio_start: 11.0, audio_end: 22.2 },
      { node_id: 'n002', speaker: 'monkey', text_en: 'Hello!', text_zh: '你好！', audio_start: 23.0, audio_end: 24.4 },
      { node_id: 'n003', speaker: 'narrator', text_en: '', text_zh: '无台词', audio_start: 30, audio_end: 32 },
      { node_id: 'n004', speaker: 'narrator', text_en: '没有切片点', text_zh: '', audio_start: null, audio_end: null },
      { node_id: 'n005', speaker: 'narrator', text_en: '倒序切片', text_zh: '', audio_start: 40, audio_end: 39.5 },
    ],
  };
}

test('dubKey：系列书键与节点拼接稳定（西游记键保持旧格式兼容存档）', () => {
  assert.equal(core.bookKey('jttw', 1), 'ep1');
  assert.equal(core.bookKey('minecraft', 2), 'mc2');
  assert.equal(core.bookKey('mikey-jj', 11), 'mj11');
  assert.equal(core.bookKey('未知系列', 3), 'ep3');
  assert.equal(core.dubKey('ep1', 'n001'), 'ep1:n001');
  assert.equal(core.dubKey('mj1', '1'), 'mj1:1');
});

test('buildSceneList：过滤无台词、无切片与倒序切片节点', () => {
  const scenes = core.buildSceneList(fakeBook());
  assert.deepEqual(scenes.map((s) => s.nodeId), ['n001', 'n002']);
  assert.equal(scenes[0].from, 11.0);
  assert.equal(scenes[0].to, 22.2);
  assert.equal(scenes[1].speaker, 'monkey');
  assert.deepEqual(scenes[0].sentenceAudios, []);
});

function mjPage() {
  return {
    page_no: 1,
    image: 'assets/mikey-jj/zombie-school-adventure/pages/p01.webp',
    text_en: 'Run, Mikey! We are late for class!',
    start_ms: 690,
    end_ms: 15090,
    sentences: [
      { text_en: 'Run, Mikey!', zh: '快跑，Mikey！', speaker: { id: 'jj', label: 'JJ' }, start_ms: 690, end_ms: 1790, audio: 'assets/mikey-jj/zombie-school-adventure/sentences/page-01-sentence-01.mp3' },
      { text_en: 'We are late for class!', zh: '我们上课要迟到了！', start_ms: 1800, end_ms: 3200, audio: 'assets/mikey-jj/zombie-school-adventure/sentences/page-01-sentence-02.mp3' },
    ],
  };
}

test('normalizeDubBook：mikey-jj 毫秒页归一为秒场景，句级时间与句音频优先', () => {
  const book = core.normalizeDubBook('mikey-jj', {
    book: 1,
    title: { en: 'Zombie School Adventure', zh: '僵尸学校大冒险' },
    audio: 'assets/mikey-jj/zombie-school-adventure/audio.mp3',
    pages: [mjPage(), { page_no: 2, text_en: '', sentences: [] }],
  });
  assert.equal(book.key, 'mj1');
  assert.equal(book.video, '');
  assert.equal(book.scenes.length, 1);
  const scene = book.scenes[0];
  assert.equal(scene.nodeId, '1');
  assert.equal(scene.speaker, 'JJ');
  assert.equal(scene.from.toFixed(3), '0.690');
  assert.equal(scene.to.toFixed(3), '3.200');
  assert.equal(scene.textZh, '快跑，Mikey！ 我们上课要迟到了！');
  assert.equal(scene.sentenceAudios.length, 2);
});

test('normalizeDubBook：minecraft 页级时间不可靠时以句级时间为准', () => {
  const book = core.normalizeDubBook('minecraft', {
    book: 1,
    title: { en: 'Escape from the Nether!', zh: '逃出下界' },
    audio: 'assets/minecraft/escape-from-the-nether/audio.mp3',
    pages: [{
      page_no: 1,
      image: 'assets/minecraft/escape-from-the-nether/pages/p01.webp',
      text_en: 'Emmy and Birch were ready for adventure!',
      start_sec: 0,
      end_sec: 38.65,
      sentences: [
        { text_en: 'Emmy and Birch were ready!', start_sec: 158.35, end_sec: 165.17, audio: 'assets/minecraft/escape-from-the-nether/sentences/page-01-sentence-01.mp3' },
      ],
    }],
  });
  assert.equal(book.key, 'mc1');
  assert.equal(book.scenes[0].from, 158.35);
  assert.equal(book.scenes[0].to, 165.17);
  assert.equal(book.scenes[0].textZh, '');
  assert.equal(book.scenes[0].sentenceAudios.length, 1);
});

test('normalizeDubBook：无句级时间的页回退页级字段，无时间轴页被剔除', () => {
  const book = core.normalizeDubBook('minecraft', {
    book: 3,
    pages: [
      { page_no: 1, text_en: 'Only page timing.', start_sec: 5, end_sec: 9 },
      { page_no: 2, text_en: 'No timing at all.' },
    ],
  });
  assert.equal(book.key, 'mc3');
  assert.equal(book.scenes.length, 1);
  assert.equal(book.scenes[0].from, 5);
  assert.equal(book.scenes[0].to, 9);
  assert.deepEqual(book.scenes[0].sentenceAudios, []);
});

test('normalizeDubBook：西游记走节点路径并带 bookKey', () => {
  const book = core.normalizeDubBook('jttw', fakeBook());
  assert.equal(book.key, 'ep1');
  assert.equal(book.video, 'assets/video/ep1.mp4');
  assert.deepEqual(book.scenes.map((s) => s.nodeId), ['n001', 'n002']);
});

test('buildSceneList：空书与缺节点返回空数组', () => {
  assert.deepEqual(core.buildSceneList(null), []);
  assert.deepEqual(core.buildSceneList({}), []);
  assert.deepEqual(core.buildSceneList({ nodes: [{}] }), []);
});

test('录音会话：idle→recording→recorded，重复启动被拒绝', () => {
  const session = core.createDubSession({ maxSec: 90 });
  assert.equal(session.snapshot().state, 'idle');
  assert.deepEqual(session.stop(5), { ok: false, reason: 'idle' });
  assert.deepEqual(session.start(), { ok: true });
  assert.equal(session.snapshot().state, 'recording');
  assert.deepEqual(session.start(), { ok: false, reason: 'busy' });
  const stopped = session.stop(6.2);
  assert.equal(stopped.ok, true);
  assert.equal(stopped.sec, 6.2);
  assert.equal(session.snapshot().state, 'recorded');
  assert.equal(session.snapshot().sec, 6.2);
});

test('录音会话：可重录（recorded→recording），太短回到 idle，超长钳到上限', () => {
  const session = core.createDubSession({ maxSec: 10 });
  session.start();
  assert.deepEqual(session.stop(0.2), { ok: false, reason: 'too-short' });
  assert.equal(session.snapshot().state, 'idle');
  session.start();
  assert.equal(session.stop(15.5).sec, 10);
  assert.equal(session.snapshot().state, 'recorded');
  assert.deepEqual(session.start(), { ok: true });
  assert.equal(session.snapshot().state, 'recording');
});

test('录音会话：cancel 任意状态回 idle；非法时长拒绝', () => {
  const session = core.createDubSession({ maxSec: 90 });
  session.start();
  session.cancel();
  assert.equal(session.snapshot().state, 'idle');
  session.start();
  assert.equal(session.stop(Number.NaN).ok, false);
  assert.equal(session.snapshot().state, 'idle');
});

test('normalizeDubMeta：星级钳制 1-3、时长必须为正', () => {
  assert.deepEqual(core.normalizeDubMeta({ stars: 9, durSec: 4.1, createdAt: 1, updatedAt: 2 }),
    { stars: 3, durSec: 4.1, createdAt: 1, updatedAt: 2 });
  assert.deepEqual(core.normalizeDubMeta({ stars: 0, durSec: 2 }),
    { stars: 1, durSec: 2, createdAt: 0, updatedAt: 0 });
  assert.equal(core.normalizeDubMeta({ durSec: -1 }), null);
  assert.equal(core.normalizeDubMeta({}), null);
  assert.equal(core.normalizeDubMeta(null), null);
});

test('upsertDubMeta：不可变写入，created 保留首次，updated 刷新；非法输入原样返回', () => {
  const index = {};
  const first = core.upsertDubMeta(index, 'ep1', 'n001', { stars: 2, durSec: 3 }, 100);
  assert.equal(first.ep1.n001.stars, 2);
  assert.equal(first.ep1.n001.createdAt, 100);
  assert.equal(first.ep1.n001.updatedAt, 100);
  assert.deepEqual(index, {});
  const second = core.upsertDubMeta(first, 'ep1', 'n001', { stars: 3, durSec: 4 }, 200);
  assert.equal(second.ep1.n001.createdAt, 100);
  assert.equal(second.ep1.n001.updatedAt, 200);
  assert.equal(second.ep1.n001.stars, 3);
  assert.equal(first.ep1.n001.stars, 2);
  assert.equal(core.upsertDubMeta(second, 'ep1', 'n001', { durSec: 0 }, 300), second);
});

test('firstSaveReward：每集首次配音 +5 SP，之后幂等', () => {
  let index = core.upsertDubMeta({}, 'ep1', 'n001', { stars: 1, durSec: 3 }, 1);
  let rewarded = {};
  let reward = core.firstSaveReward(index, rewarded, 'ep1');
  assert.equal(reward.sp, 5);
  assert.equal(reward.rewarded.ep1, true);
  rewarded = reward.rewarded;
  index = core.upsertDubMeta(index, 'ep1', 'n002', { stars: 2, durSec: 4 }, 2);
  reward = core.firstSaveReward(index, rewarded, 'ep1');
  assert.equal(reward.sp, 0);
  assert.equal(core.firstSaveReward({}, {}, 'ep2').sp, 0);
});

test('dubCoverage：完成数与全集完成判定', () => {
  const scenes = core.buildSceneList(fakeBook());
  const index = core.upsertDubMeta({}, 'ep1', 'n001', { stars: 1, durSec: 3 }, 1);
  assert.deepEqual(core.dubCoverage(index, 'ep1', scenes), { done: 1, total: 2, complete: false });
  const full = core.upsertDubMeta(index, 'ep1', 'n002', { stars: 1, durSec: 1 }, 2);
  assert.deepEqual(core.dubCoverage(full, 'ep1', scenes), { done: 2, total: 2, complete: true });
  assert.deepEqual(core.dubCoverage(index, 'ep9', scenes), { done: 0, total: 2, complete: false });
});
