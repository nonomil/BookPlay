import test from "node:test";
import assert from "node:assert/strict";
import core from "./battle-core.js";

function miniLevel() {
  return {
    schema_version: 1,
    ep: 5,
    title: { en: "The Demon of Chaos", zh: "混世魔王" },
    collection: "c01",
    cast: {
      hero: { id: "wukong", nameZh: "孙悟空" },
      boss: { id: "chaosdemon", nameZh: "混世魔王", mode: "villain", sprite: "chaosdemon" },
      minors: [{ id: "chaosdemon-minion", nameZh: "水妖", sprite: "chaosdemon-minion" }],
    },
    background: { theme: "water-dirty-cave", illustration: "assets/adv_frames/ep5/f1.jpg" },
    intro: [{ speaker: "narrator", textEn: "Hello.", textZh: "你好。", illustration: "a.jpg" }],
    previewWords: [
      { term: "demon", zh: "恶魔", ipa: "ˈdiːmən", illustration: "a.jpg" },
      { term: "chaos", zh: "混乱", ipa: "ˈkeɪɒs", illustration: "b.jpg" },
      { term: "kidnap", zh: "绑架", ipa: "ˈkɪdnæp", illustration: "c.jpg" },
      { term: "furious", zh: "狂怒的", ipa: "ˈfjʊəriəs", illustration: "d.jpg" },
      { term: "handle", zh: "处理", ipa: "ˈhændl", illustration: "e.jpg" },
      { term: "entrance", zh: "入口", ipa: "ˈentrəns", illustration: "f.jpg" },
      { term: "revenge", zh: "报仇", ipa: "rɪˈvendʒ", illustration: "g.jpg" },
      { term: "shriek", zh: "尖叫", ipa: "ʃriːk", illustration: "h.jpg" },
      { term: "meal", zh: "一餐", ipa: "miːl", illustration: "i.jpg" },
      { term: "gloomy", zh: "阴郁的", ipa: "ˈɡluːmi", illustration: "j.jpg" },
      { term: "amazement", zh: "惊奇", ipa: "əˈmeɪzmənt", illustration: "k.jpg" },
      { term: "subject", zh: "臣服者", ipa: "ˈsʌbdʒɪkt", illustration: "l.jpg" },
    ],
    waves: [
      {
        monsters: [
          { term: "demon", zh: "恶魔", sprite: "chaosdemon-minion" },
          { term: "chaos", zh: "混乱", sprite: "chaosdemon-minion" },
          { term: "kidnap", zh: "绑架", sprite: "chaosdemon-minion" },
          { term: "furious", zh: "狂怒的", sprite: "chaosdemon-minion" },
        ],
      },
      {
        monsters: [
          { term: "handle", zh: "处理", sprite: "chaosdemon-minion" },
          { term: "entrance", zh: "入口", sprite: "chaosdemon-minion" },
          { term: "revenge", zh: "报仇", sprite: "chaosdemon-minion" },
          { term: "shriek", zh: "尖叫", sprite: "chaosdemon-minion" },
        ],
      },
    ],
    boss: {
      hpWords: [
        { term: "meal", zh: "一餐" },
        { term: "gloomy", zh: "阴郁的" },
        { term: "amazement", zh: "惊奇" },
        { term: "subject", zh: "臣服者" },
      ],
      taunts: ["chaosdemon.1", "chaosdemon.2"],
    },
    quizUrl: "lesson.html?ep=5",
  };
}

test("buildLevel 生成运行时结构（词索引、帧键、精灵清单）", () => {
  const level = core.buildLevel(miniLevel());
  assert.equal(level.ep, 5);
  assert.equal(level.waves.length, 2);
  assert.equal(level.waves[0].monsters[0].key, "w0-0");
  assert.equal(level.boss.hpWords[0].key, "boss-0");
  assert.equal(level.wordIndex["demon"], "恶魔");
  assert.ok(level.spriteIds.includes("chaosdemon"));
  assert.ok(level.spriteIds.includes("chaosdemon-minion"));
  assert.ok(level.spriteIds.includes("wukong"));
});

test("buildLevel 透传 v2 map 地图层（缺省为 null）", () => {
  const withMap = core.buildLevel(Object.assign(miniLevel(), {
    map: { theme: "water-dirty-cave", walkable: { x: 0.1, y: 0.3, w: 0.8, h: 0.6 }, npcSpots: [{ role: "intro", x: 0.3, y: 0.5 }] },
  }));
  assert.equal(withMap.map.theme, "water-dirty-cave");
  assert.equal(core.buildLevel(miniLevel()).map, null);
});

test("buildLevel 坏输入降级返回 null", () => {
  assert.equal(core.buildLevel(null), null);
  assert.equal(core.buildLevel("x"), null);
  assert.equal(core.buildLevel({ ep: 1 }), null, "缺 waves/boss 应为 null");
  assert.equal(core.buildLevel({ ep: 1, waves: [], boss: { hpWords: [] } }), null);
});

test("buildWaveQuestions 错词按次数插队到波首，其余保持稳定", () => {
  const level = core.buildLevel(miniLevel());
  const questions = core.buildWaveQuestions(level, 1, { revenge: 2, demon: 5 });
  assert.deepEqual(
    questions.map((m) => m.term),
    ["revenge", "handle", "entrance", "shriek"],
  );
});

test("buildWaveQuestions 越界返回空数组", () => {
  const level = core.buildLevel(miniLevel());
  assert.deepEqual(core.buildWaveQuestions(level, 9, {}), []);
});

test("buildOrbSet 返回 3 球且确定性", () => {
  const level = core.buildLevel(miniLevel());
  const all = level.previewWords;
  const a = core.buildOrbSet({ term: "demon", zh: "恶魔" }, all, 12345);
  const b = core.buildOrbSet({ term: "demon", zh: "恶魔" }, all, 12345);
  assert.deepEqual(a, b);
  assert.equal(a.orbs.length, 3);
  assert.equal(a.orbs.filter((o) => o.correct).length, 1);
  const zus = a.orbs.map((o) => o.zh);
  assert.equal(new Set(zus).size, 3, "中文释义不得重复");
});

test("buildOrbSet 词库不足时降级为更少球", () => {
  const result = core.buildOrbSet({ term: "demon", zh: "恶魔" }, [
    { term: "demon", zh: "恶魔" },
    { term: "chaos", zh: "混乱" },
  ], 7);
  assert.ok(result.orbs.length >= 2);
  assert.ok(result.orbs.length < 3 + 1);
});

test("judgeHit 判定与连击状态", () => {
  const combo = { streak: 0 };
  const hit1 = core.judgeHit({ zh: "恶魔" }, { term: "demon", zh: "恶魔" }, combo);
  assert.equal(hit1.correct, true);
  assert.equal(combo.streak, 1);
  assert.equal(hit1.comboReady, false);

  core.judgeHit({ zh: "混乱" }, { term: "demon", zh: "恶魔" }, combo);
  assert.equal(combo.streak, 0, "答错重置连击");

  core.judgeHit({ zh: "恶魔" }, { term: "demon", zh: "恶魔" }, combo);
  core.judgeHit({ zh: "恶魔" }, { term: "demon", zh: "恶魔" }, combo);
  const hit3 = core.judgeHit({ zh: "恶魔" }, { term: "demon", zh: "恶魔" }, combo);
  assert.equal(combo.streak, 3);
  assert.equal(hit3.comboReady, true, "连对 3 触发");
});

test("settleRun 星星三档边界", () => {
  assert.equal(core.settleRun({ cleared: false, shieldLeft: 3, quizPassed: true }).stars, 0);
  assert.equal(core.settleRun({ cleared: true, shieldLeft: 0, quizPassed: false }).stars, 1);
  assert.equal(core.settleRun({ cleared: true, shieldLeft: 2, quizPassed: false }).stars, 2);
  assert.equal(core.settleRun({ cleared: true, shieldLeft: 0, quizPassed: true }).stars, 2);
  const full = core.settleRun({ cleared: true, shieldLeft: 3, quizPassed: true });
  assert.equal(full.stars, 3);
  assert.deepEqual(full.wrongWords, {});
});

test("settleRun 透传错词表", () => {
  const result = core.settleRun({
    cleared: true,
    shieldLeft: 1,
    quizPassed: false,
    wrongWords: { revenge: 2, demon: 1 },
  });
  assert.deepEqual(result.wrongWords, { revenge: 2, demon: 1 });
});

test("loadSprites 注册表缺失时回退 walker GIF 约定路径", () => {
  const sprites = core.loadSprites(null, ["wukong", "chaosdemon-minion"]);
  assert.equal(sprites.wukong.gif, "assets/generated/jttw-player-walkers/wukong/wukong-walk.gif");
  assert.equal(sprites["chaosdemon-minion"].source, "walker-fallback");
});

test("loadSprites 注册表命中直通、未命中回退 null 占位", () => {
  const registry = {
    sprites: {
      "chaosdemon-minion": { walk: { south: ["p1.png"] }, act: {}, gif: {} },
    },
  };
  const sprites = core.loadSprites(registry, ["chaosdemon-minion", "imp"]);
  assert.equal(sprites["chaosdemon-minion"].walk.south[0], "p1.png");
  assert.equal(sprites.imp, null);
});
