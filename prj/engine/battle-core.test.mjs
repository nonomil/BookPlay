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

test("pickBossRoundKind：无 TTS（canListen=false）时听音轮降级为看词选义", () => {
  const cycleHasListen = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => core.pickBossRoundKind(i, { canType: true, canListen: false }));
  assert.ok(cycleHasListen.every((k) => k !== "listen-choice"), "canListen=false 不得出现 listen-choice");
  const withListen = [0, 1, 2, 3].map((i) => core.pickBossRoundKind(i, { canType: true, canListen: true }));
  assert.ok(withListen.includes("listen-choice"), "canListen=true 时保留听音轮");
});

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

test("buildLevel 透传可审核的 NPC 对话字段（含 sourceNodeId/audioRef）", () => {
  const level = core.buildLevel(Object.assign(miniLevel(), {
    npcDialogue: {
      quiz: {
        id: "ep5-quiz",
        lines: [{ id: "q1", sourceNodeId: "n004", speaker: "gibbon", textEn: "A demon attacked us.", textZh: "有个恶魔袭击了我们。", audioRef: "sent_en:A demon attacked us." }],
        options: [
          { id: "a", textEn: "yes", textZh: "是", correct: true, feedback: "答对了！" },
          { id: "b", textEn: "no", textZh: "否", correct: false },
        ],
        lessonCardId: "ep005-official-quiz-001",
      },
    },
  }));
  assert.equal(level.npcDialogue.quiz.id, "ep5-quiz");
  assert.equal(level.npcDialogue.quiz.lines[0].sourceNodeId, "n004");
  assert.equal(level.npcDialogue.quiz.lines[0].audioRef, "sent_en:A demon attacked us.");
  assert.equal(level.npcDialogue.quiz.options.length, 2);
  assert.equal(level.npcDialogue.quiz.options[0].correct, true);
  assert.equal(level.npcDialogue.quiz.options[0].feedback, "答对了！");
  assert.equal(level.npcDialogue.quiz.lessonCardId, "ep005-official-quiz-001");
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

test("reorderBossWords 把地图阶段出现但不在原 Boss 池的错词补进复习", () => {
  const level = core.buildLevel(miniLevel());
  const words = core.reorderBossWords(level, { demon: 2, revenge: 1 });
  assert.deepEqual(words.map((word) => word.term), ["revenge", "meal", "gloomy", "amazement", "subject", "demon"]);
});

test("buildWaveQuestions 越界返回空数组", () => {
  const level = core.buildLevel(miniLevel());
  assert.deepEqual(core.buildWaveQuestions(level, 9, {}), []);
});

test("formSimilarity：形近词相似度高于无关词", () => {
  assert.ok(core.formSimilarity("demon", "lemon") > core.formSimilarity("demon", "zzzzzz"));
  assert.ok(core.formSimilarity("山", "出") >= 0);
  assert.equal(core.formSimilarity("", "x"), 0);
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

test("resolveBossKit 读出悟空招式和混世魔王进攻", () => {
  const kit = core.resolveBossKit({
    hero: { id: "wukong", nameZh: "孙悟空", skills: { attack: { id: "staff", nameZh: "金箍棒" }, special: { id: "staff-combo", nameZh: "棒影连击", needCombo: 3 } } },
    bosses: { chaosdemon: { nameZh: "混世魔王", attack: { id: "mace", nameZh: "狼牙棒" }, special: { id: "mud-wave", nameZh: "浊浪" } } },
  }, "chaosdemon");
  assert.equal(kit.hero.skills.attack.nameZh, "金箍棒");
  assert.equal(kit.boss.attack.nameZh, "狼牙棒");
  const fallback = core.resolveBossKit(null, "missing");
  assert.equal(fallback.hero.id, "wukong");
  assert.ok(fallback.boss.attack.nameZh);
});

test("pickHeroSkill 连对 3 切棒影连击", () => {
  const kit = core.resolveBossKit({
    hero: { skills: { attack: { id: "staff", nameZh: "金箍棒" }, special: { id: "staff-combo", nameZh: "棒影连击", needCombo: 3 } } },
  }, "x");
  assert.equal(core.pickHeroSkill(kit, { streak: 1 }).id, "staff");
  assert.equal(core.pickHeroSkill(kit, { streak: 3 }).id, "staff-combo");
});

test("Boss 词格按 en/zh/listen/typing 轮换，不能打的跟打退回英文点选", () => {
  assert.equal(core.pickBossRoundKind(0, { canType: true }), "en-choice");
  assert.equal(core.pickBossRoundKind(1, { canType: true }), "zh-choice");
  assert.equal(core.pickBossRoundKind(2, { canType: true, canListen: true }), "listen-choice");
  assert.equal(core.pickBossRoundKind(2, { canType: true }), "en-choice", "缺省（未声明 TTS）视为无 TTS 降级");
  assert.equal(core.pickBossRoundKind(2, { canType: true, canListen: false }), "en-choice", "无 TTS 听音降级（2026-09-12 补丁）");
  assert.equal(core.pickBossRoundKind(3, { canType: true }), "typing");
  assert.equal(core.pickBossRoundKind(3, { canType: false }), "en-choice");
  assert.equal(core.pickBossRoundKind(3, { canType: true, canListen: true, lastSlot: true, preferQuestion: "listen-choice" }), "listen-choice", "显式点名听音仍需 TTS 可用");
  assert.equal(core.pickBossRoundKind(3, { canType: true, lastSlot: true, preferQuestion: "listen-choice" }), "en-choice", "点名听音但无 TTS → 降级");
  assert.equal(core.pickBossRoundKind(3, { canType: true, lastSlot: true, hasOfficial: true }), "official");
  assert.equal(core.pickBossRoundKind(1, { preferQuestion: "official", lastSlot: true, hasOfficial: false }), "zh-choice");
});

test("buildBossRound 四种题共用 answerZh，跟打只收字母", () => {
  const level = {
    previewWords: [
      { term: "nearby", zh: "在附近" },
      { term: "captain", zh: "将领" },
      { term: "emperor", zh: "皇帝" },
      { term: "monkey", zh: "猴子" },
    ],
    boss: { hpWords: [{ term: "nearby", zh: "在附近" }, { term: "captain", zh: "将领" }] },
    waves: [],
    npcDialogue: null,
  };
  const en = core.buildBossRound(level, { term: "nearby", zh: "在附近" }, 0, { seed: 1, canType: true });
  assert.equal(en.kind, "en-choice");
  assert.equal(en.answerZh, "nearby");
  assert.equal(en.orbs.filter((o) => o.correct).length, 1);
  const zh = core.buildBossRound(level, { term: "nearby", zh: "在附近" }, 1, { seed: 2, canType: true });
  assert.equal(zh.kind, "zh-choice");
  assert.equal(zh.answerZh, "在附近");
  const listen = core.buildBossRound(level, { term: "nearby", zh: "在附近" }, 2, { seed: 3, canType: true, canListen: true });
  assert.equal(listen.kind, "listen-choice");
  assert.equal(listen.listen, true);
  const typing = core.buildBossRound(level, { term: "nearby", zh: "在附近" }, 3, { seed: 4, canType: true });
  assert.equal(typing.kind, "typing");
  assert.equal(typing.typingTarget, "nearby");
  assert.equal(core.lettersOnly("near-by!"), "nearby");
  const withOfficial = {
    ...level,
    npcDialogue: {
      quiz: {
        question: { textEn: "what did monkey come out of?", textZh: "猴子是从什么出来的？" },
        options: [
          { textEn: "a rock", textZh: "一块石头", correct: true },
          { textEn: "a tree", textZh: "一棵树", correct: false },
        ],
      },
    },
  };
  const official = core.buildBossRound(withOfficial, { term: "sight", zh: "景色" }, 3, {
    seed: 9, canType: true, lastSlot: true,
  });
  assert.equal(official.kind, "official");
  assert.equal(official.answerZh, "一块石头");
});

test("resolveSkillFx 先用套件路径，缺图回退 generic", () => {
  const generic = {
    hitPlayer: "assets/game-fx/generic/hit-player.png",
    hitBoss: "assets/game-fx/generic/hit-boss.png",
    shock: "assets/game-fx/generic/shock.png",
  };
  const peach = core.resolveSkillFx(
    { id: "peach-throw", nameZh: "扔桃", fx: "assets/game-fx/monkey-minor/attack.png" },
    "boss",
    generic,
  );
  assert.deepEqual(peach, [
    "assets/game-fx/monkey-minor/attack.png",
    "assets/game-fx/generic/hit-player.png",
  ]);
  const mace = core.resolveSkillFx(
    { id: "mace", nameZh: "狼牙棒", fx: "assets/game-fx/chaosdemon/attack.png" },
    "boss",
    generic,
  );
  assert.equal(mace[0], "assets/game-fx/chaosdemon/attack.png");
  assert.notEqual(peach[0], mace[0]);
  const missing = core.resolveSkillFx(
    { id: "whisk", nameZh: "拂尘", fx: "assets/game-fx/subodhi-disciple/attack.png" },
    "boss",
    generic,
  );
  assert.deepEqual(missing, [
    "assets/game-fx/subodhi-disciple/attack.png",
    "assets/game-fx/generic/hit-player.png",
  ]);
  const staff = core.resolveSkillFx(
    { id: "staff", nameZh: "金箍棒", fx: "assets/game-fx/wukong/attack.png" },
    "hero",
    generic,
  );
  assert.deepEqual(staff, [
    "assets/game-fx/wukong/attack.png",
    "assets/game-fx/generic/hit-boss.png",
  ]);
  const noFx = core.resolveSkillFx({ id: "strike", nameZh: "扑打" }, "boss", generic);
  assert.deepEqual(noFx, ["assets/game-fx/generic/hit-player.png"]);
  const emptyPack = core.resolveSkillFx({ fx: "gone.png" }, "hero", null);
  assert.equal(emptyPack[0], "gone.png");
  assert.equal(emptyPack[1], "assets/game-fx/generic/hit-boss.png");
});

test("护体挡一次伤害，未护体扣一格血", () => {
  const armed = core.applyDefend({ defendLeft: 1, defendArmed: false });
  assert.equal(armed.ok, true);
  assert.equal(armed.defendLeft, 0);
  const blocked = core.applyIncomingHit({ shield: 3, defendArmed: true });
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.shield, 3);
  const hit = core.applyIncomingHit({ shield: 3, defendArmed: false });
  assert.equal(hit.blocked, false);
  assert.equal(hit.shield, 2);
});

test("Boss 抢答：10 秒窗、越往后妖怪越快越准，玩家同时点优先", () => {
  assert.equal(core.RACE_MS, 10000);
  assert.equal(core.rivalThinkMs(0, 8, 0), 6000);
  assert.equal(core.rivalThinkMs(0, 8, 1), 9000);
  assert.equal(core.rivalThinkMs(7, 8, 0), 2600);
  assert.equal(core.rivalThinkMs(7, 8, 1), 4200);
  assert.equal(core.rivalAccuracy(0, 8), 0.7);
  assert.equal(core.rivalAccuracy(7, 8), 0.92);
  assert.equal(typeof core.rivalHits(1, 1), "boolean");
  assert.equal(core.rivalHits(1, 1), true);
  assert.equal(core.rivalHits(1, 0), false);
  assert.equal(core.resolveRaceEvent({ now: 1000, deadlineAt: 10000, rivalAt: 7000, playerAt: null }), "pending");
  assert.equal(core.resolveRaceEvent({ now: 8000, deadlineAt: 10000, rivalAt: 7000, playerAt: 7500 }), "rival");
  assert.equal(core.resolveRaceEvent({ now: 8000, deadlineAt: 10000, rivalAt: 7000, playerAt: 6500 }), "player");
  assert.equal(core.resolveRaceEvent({ now: 7000, deadlineAt: 10000, rivalAt: 7000, playerAt: 7000 }), "player");
  assert.equal(core.resolveRaceEvent({ now: 11000, deadlineAt: 10000, rivalAt: 12000, playerAt: null }), "timeout");
});
