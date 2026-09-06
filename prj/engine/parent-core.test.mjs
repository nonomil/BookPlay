import { test } from 'node:test';
import assert from 'node:assert/strict';
import core from './parent-core.js';

function fakeBook() {
  return {
    episode: 1,
    script_lexicon: {
      mountain: { pos: 'n.', zh: '山' },
      rock: { pos: 'n.', zh: '岩石' },
      monkey: { pos: 'n.', zh: '猴子' },
      moon: { pos: 'n.', zh: '月亮' },
      river: { pos: 'n.', zh: '河' },
      jump: { pos: 'v.', zh: '跳' },
    },
    patterns: [
      { pattern: 'A rock had sat on top of a mountain.', term: 'mountain', zh: '山' },
    ],
    nodes: [
      {
        node_id: 'n001',
        text_en: 'A rock had sat on top of a mountain.',
        text_zh: '山巅有块岩石。',
        illustration: 'assets/adv_frames/ep1/f1.jpg',
        audio_start: 11,
        audio_end: 22,
        vocab: [{ term: 'rock', pos: 'n.', zh: '岩石' }],
        page_words: [{ term: 'rock', zh: '岩石' }],
      },
      {
        node_id: 'n002',
        text_en: 'The monkey jumped over the moon.',
        illustration: 'assets/adv_frames/ep1/f2.jpg',
        vocab: [{ term: 'monkey', pos: 'n.', zh: '猴子' }],
        page_words: [{ term: 'monkey', zh: '猴子' }],
      },
      {
        node_id: 'n003',
        text_en: 'A river runs to the sea.',
        illustration: 'assets/adv_frames/ep1/f3.jpg',
        vocab: [
          { term: 'river', pos: 'n.', zh: '河' },
          { term: 'trouble', pos: 'n.', zh: '麻烦' },
        ],
        page_words: [{ term: 'river', zh: '河' }],
      },
    ],
  };
}

test('空输入返回空数组，不抛异常', () => {
  assert.deepEqual(core.buildParentCards(null), []);
  assert.deepEqual(core.buildParentCards({}), []);
});

test('题型与顺序：看图识字在前、看图拼词次之、读句选图最后', () => {
  const cards = core.buildParentCards(fakeBook());
  assert.deepEqual(cards.map((c) => c.type), ['picture', 'picture', 'picture', 'picture', 'spell', 'readMatch', 'readMatch', 'readMatch']);
});

test('看图识字：单词名词 + 出现在本节点台词 + 帧路径对应节点', () => {
  const cards = core.buildParentCards(fakeBook());
  const pictures = cards.filter((c) => c.type === 'picture');
  assert.deepEqual(pictures.map((c) => c.term), ['rock', 'mountain', 'monkey', 'moon']);
  assert.equal(pictures[0].frame, 'assets/adv_video_frames/ep1/n001.jpg');
  assert.equal(pictures[0].zh, '岩石');
  assert.equal(pictures.some((c) => c.term === 'trouble'), false, '停用词表挡住抽象词');
  assert.equal(pictures.some((c) => c.term === 'jump'), false, '动词不可指图');
});

test('看图拼词：≥4 字母、不与指图卡重复、字母轮转后不等于原词', () => {
  const cards = core.buildParentCards(fakeBook());
  const spells = cards.filter((c) => c.type === 'spell');
  assert.deepEqual(spells.map((c) => c.term), ['river']);
  for (const spell of spells) {
    assert.equal(spell.letters.join(''), spell.term.toLowerCase().slice(1) + spell.term[0]);
    assert.notEqual(spell.letters.join(''), spell.term.toLowerCase());
  }
});

test('读句选图：4-10 词短句、正确帧在首位、三张帧互不相同', () => {
  const cards = core.buildParentCards(fakeBook());
  const matches = cards.filter((c) => c.type === 'readMatch');
  assert.equal(matches.length, 3);
  for (const card of matches) {
    assert.equal(card.options.length, 3);
    assert.equal(card.options[0], card.frame);
    assert.equal(new Set(card.options).size, 3);
    assert.ok(card.sentence.length > 0);
  }
});

test('数量上限：指图 3、拼词 2、读句 3', () => {
  const cards = core.buildParentCards(fakeBook());
  assert.equal(cards.filter((c) => c.type === 'picture').length <= core.MAX_PICTURE_CARDS, true);
  assert.equal(cards.filter((c) => c.type === 'spell').length <= core.MAX_SPELL_CARDS, true);
  assert.equal(cards.filter((c) => c.type === 'readMatch').length <= core.MAX_READMATCH_CARDS, true);
});

test('确定性：同一本书两次构建结果完全一致', () => {
  assert.deepEqual(JSON.stringify(core.buildParentCards(fakeBook())), JSON.stringify(core.buildParentCards(fakeBook())));
});

test('家长问句模板可读', () => {
  const cards = core.buildParentCards(fakeBook());
  assert.match(cards.find((c) => c.type === 'picture').question, /指给爸爸妈妈看/);
  assert.match(cards.find((c) => c.type === 'spell').question, /字母/);
  assert.match(cards.find((c) => c.type === 'readMatch').question, /画面/);
});

test('framePath：集号与节点名拼接，非法字符转下划线', () => {
  assert.equal(core.framePath(1, 'n001'), 'assets/adv_video_frames/ep1/n001.jpg');
  assert.equal(core.framePath(3, 'p a/1'), 'assets/adv_video_frames/ep3/p_a_1.jpg');
});
