import { test } from 'node:test';
import assert from 'node:assert/strict';
import core from './parent-core.js';

function fakeBook() {
  return {
    patterns: [
      { pattern: 'A rock had sat on top of a mountain.', term: 'mountain', zh: '山' },
      { pattern: '数据里没有这句话。', term: 'ghost', zh: '鬼' },
      { pattern: '', term: 'empty', zh: '空' },
    ],
    nodes: [
      {
        node_id: 'n001',
        text_en: 'From the beginning of time, a rock had sat on top of a mountain.',
        text_zh: '山巅有块岩石。',
        illustration: 'assets/adv_frames/ep1/f1.jpg',
        audio_start: 11,
        audio_end: 22,
        vocab: [
          { term: 'mountain', zh: '山' },
          { term: 'rock', zh: '岩石' },
          { term: 'ghost', zh: '鬼' },
        ],
        page_words: [
          { term: 'mountain', zh: '山' },
          { term: 'rock', zh: '岩石' },
        ],
      },
      {
        node_id: 'n002',
        text_en: 'The monkey jumped.',
        illustration: 'assets/adv_frames/ep1/f2.jpg',
        vocab: [
          { term: 'monkey', zh: '猴子' },
          { term: 'jump', zh: '跳' },
        ],
        page_words: [{ term: 'monkey', zh: '猴子' }],
      },
      { node_id: 'n003', text_en: 'no picture here', vocab: [{ term: 'shadow', zh: '影子' }], page_words: [{ term: 'shadow', zh: '影子' }] },
    ],
  };
}

test('空输入返回空数组，不抛异常', () => {
  assert.deepEqual(core.buildParentCards(null), []);
  assert.deepEqual(core.buildParentCards({}), []);
  assert.deepEqual(core.buildParentCards({ nodes: [], patterns: [] }), []);
});

test('句型卡在前：命中节点带插图与切片，未命中降级为无图无音频', () => {
  const cards = core.buildParentCards(fakeBook());
  assert.equal(cards[0].type, 'pattern');
  assert.equal(cards[0].textEn, 'A rock had sat on top of a mountain.');
  assert.equal(cards[0].illustration, 'assets/adv_frames/ep1/f1.jpg');
  assert.deepEqual(cards[0].audio, { from: 11, to: 22 });
  assert.equal(cards[0].textZh, '山巅有块岩石。');
  // 未命中的句型卡仍生成，但无图无音频
  const missed = cards.find((c) => c.type === 'pattern' && c.term === 'ghost');
  assert.ok(missed, '未命中句型卡应保留');
  assert.equal(missed.illustration, '');
  assert.equal(missed.audio, null);
  // 空 pattern 被剔除
  assert.equal(cards.some((c) => c.term === 'empty'), false);
});

test('指图卡：词必须在该节点 page_words 且节点有插图，同词去重', () => {
  const cards = core.buildParentCards(fakeBook());
  const pictures = cards.filter((c) => c.type === 'picture');
  assert.deepEqual(pictures.map((c) => c.term), ['mountain', 'rock', 'monkey']);
  assert.ok(pictures.every((c) => c.illustration));
  assert.equal(pictures.some((c) => c.term === 'ghost'), false, 'ghost 不在 page_words，被剔除');
  assert.equal(pictures.some((c) => c.term === 'shadow'), false, '无插图节点被跳过');
  assert.match(pictures[0].question, /山/);
  assert.match(pictures[0].question, /mountain/);
});

test('指图卡数量钳制 ≤10', () => {
  const nodes = [];
  for (let i = 0; i < 12; i += 1) {
    nodes.push({
      node_id: `n${i}`,
      text_en: `sentence ${i}`,
      illustration: `frames/f${i}.jpg`,
      vocab: [{ term: `word${i}`, zh: `词${i}` }],
      page_words: [{ term: `word${i}`, zh: `词${i}` }],
    });
  }
  const cards = core.buildParentCards({ nodes, patterns: [] });
  assert.equal(cards.filter((c) => c.type === 'picture').length, 10);
});

test('确定性：同一本书两次构建结果完全一致', () => {
  assert.deepEqual(JSON.stringify(core.buildParentCards(fakeBook())), JSON.stringify(core.buildParentCards(fakeBook())));
});

test('家长问句模板集中且可读', () => {
  const cards = core.buildParentCards(fakeBook());
  const pattern = cards[0];
  assert.match(pattern.question, /家长问/);
  const picture = cards.find((c) => c.type === 'picture');
  assert.match(picture.question, /指给爸爸妈妈看/);
});
