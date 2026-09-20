import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import core from "./game-core.js";

const here = dirname(fileURLToPath(import.meta.url));

test("resolvePickup：按集换投掷道具，缺表回退仙桃", () => {
  const table = JSON.parse(readFileSync(join(here, "..", "..", "content", "game", "pickups.json"), "utf8"));
  const ep1 = core.resolvePickup(table, 1);
  const ep2 = core.resolvePickup(table, 2);
  assert.equal(ep1.id, "peach");
  assert.equal(ep1.nameZh, "仙桃");
  assert.match(ep1.image, /peach\.png/);
  assert.equal(ep2.id, "waterfall-pearl");
  assert.equal(ep2.nameZh, "水帘珠");
  assert.notEqual(ep1.id, ep2.id);
  const missing = core.resolvePickup(null, 99);
  assert.equal(missing.id, "peach");
  const contentRoot = join(here, "..", "..", "content");
  for (let ep = 1; ep <= 54; ep += 1) {
    const item = core.resolvePickup(table, ep);
    assert.ok(item.id, `ep${ep} pickup id`);
    assert.ok(table.items[item.id], `ep${ep} maps to a catalog item`);
    assert.ok(existsSync(join(contentRoot, item.image)), `ep${ep} image ${item.image}`);
  }
  const cast = JSON.parse(readFileSync(join(contentRoot, "game", "cast.json"), "utf8"));
  for (let ep = 1; ep <= 54; ep += 1) {
    const minors = cast.minorsByEp[String(ep)];
    assert.ok(Array.isArray(minors) && minors.length, `ep${ep} minorsByEp`);
  }
});

test("game-core：保持纯逻辑（无 DOM / 无存储 / 无 battle 以外的存档键）", () => {
  const js = readFileSync(join(here, "game-core.js"), "utf8");
  assert.doesNotMatch(js, /localStorage|document\./);
  assert.doesNotMatch(js, /bookplay_/);
});

test("wordTagHits / chooseThrowTarget：点谁飞谁，葫芦才改瞄配对怪", () => {
  const a = { zh: "山", alive: true, id: "a" };
  const b = { zh: "水", alive: true, id: "b" };
  assert.equal(core.wordTagHits("山", "山"), true);
  assert.equal(core.wordTagHits("山", "水"), false);
  assert.equal(core.wordTagHits("", "山"), false);
  const clicked = core.chooseThrowTarget(b, a, false);
  assert.equal(clicked.target, b);
  assert.equal(clicked.auto, false);
  const gourd = core.chooseThrowTarget(b, a, true);
  assert.equal(gourd.target, a);
  assert.equal(gourd.auto, true);
  const typed = core.chooseThrowTarget(null, a, false);
  assert.equal(typed.target, a);
});

test("listen-rings playVerb：听音对准词环，走入匹配才收集", () => {
  assert.equal(core.resolvePlayVerb(null), "tag-shoot");
  assert.equal(core.resolvePlayVerb({}), "tag-shoot");
  assert.equal(core.resolvePlayVerb({ playVerb: "listen-rings" }), "listen-rings");
  assert.equal(core.resolvePlayVerb({ verb: "listen-rings" }), "listen-rings");
  assert.equal(core.resolvePlayVerb({ playVerb: "type-lock" }), "type-lock");
  assert.equal(core.resolvePlayVerb({ playVerb: "gourd-seek" }), "gourd-seek");
  assert.equal(core.resolvePlayVerb({ playVerb: "tag-shoot" }), "tag-shoot");
  assert.equal(core.resolvePlayVerb({ playVerb: "parkour" }), "tag-shoot");
  assert.equal(core.resolvePlayVerb({ verb: "" }), "tag-shoot");

  assert.equal(core.listenRingHits("", "apple"), false);
  assert.equal(core.listenRingHits("apple", ""), false);
  assert.equal(core.listenRingHits("  ", "apple"), false);
  assert.equal(core.listenRingHits("apple", "pear"), false);
  assert.equal(core.listenRingHits("Apple", "apple"), true);
  assert.equal(core.listenRingHits("  apple  ", "APPLE"), true);

  const rings = [
    { term: "apple", collected: true, alive: true },
    { term: "pear", collected: false, alive: false },
    { term: "banana", collected: false },
    { term: "apple", collected: false, alive: true },
  ];
  assert.equal(core.chooseListenRing(rings, "Apple"), rings[3]);
  assert.equal(core.chooseListenRing(rings, "pear"), null);
  assert.equal(core.chooseListenRing(rings, "banana"), rings[2]);
  assert.equal(core.chooseListenRing(rings, "orange"), null);

  const hero = { x: 10, y: 10 };
  assert.equal(core.listenRingWalkHit(hero, { x: 10, y: 46 }, 36), true);
  assert.equal(core.listenRingWalkHit(hero, { x: 10, y: 47 }, 36), false);
  assert.equal(core.listenRingWalkHit(hero, { x: 10, y: 46 }), true);
  assert.equal(core.listenRingWalkHit(null, { x: 10, y: 10 }), false);
  assert.equal(core.listenRingWalkHit(hero, null), false);

  const match = core.chooseListenRing(rings, "apple");
  assert.ok(match && core.listenRingHits("apple", match.term) && core.listenRingWalkHit(hero, { x: 12, y: 10 }));
  const miss = core.chooseListenRing(rings, "pear");
  assert.equal(miss, null);

  assert.equal(core.armListenSpoken(null, "  Apple  "), "Apple");
  assert.equal(core.armListenSpoken("old", "   "), "");
  assert.equal(core.armListenSpoken("old", ""), "");
});

test("typingStep：跟打本集英文，忽略大小写，错键不吞正确前缀", () => {
  let cur = { typed: "", wrong: "" };
  cur = core.typingStep(cur, "j", "journey", true);
  assert.equal(cur.status, "ok");
  cur = core.typingStep(cur, "X", "journey", true);
  assert.equal(cur.status, "wrong");
  assert.equal(cur.typed, "j");
  cur = core.typingStep(cur, "Backspace", "journey", true);
  assert.equal(cur.wrong, "");
  cur = core.typingStep(cur, "o", "journey", true);
  assert.equal(cur.typed, "jo");
  "urney".split("").forEach((ch) => {
    cur = core.typingStep(cur, ch, "journey", true);
  });
  assert.equal(cur.status, "complete");
  assert.equal(core.typingTarget("Jade Emperor"), "JadeEmperor");
});

test("冻本集 10 词：错词/弱词优先，最多 10 张，applyFrozenLevel 改波次", () => {
  const cards = [];
  for (let i = 1; i <= 14; i += 1) {
    cards.push({ term: `w${i}`, zh: `词${i}` });
  }
  const frozen = core.freezeSessionCards(cards, {
    maxCards: 10,
    wrongWords: { w12: 3, w3: 1 },
    weakWords: { w11: { wrong: 2, streak: 0 } },
    unit: 0.1,
  });
  assert.equal(frozen.length, 10);
  assert.equal(frozen[0].term, "w12");
  assert.ok(frozen.some((card) => card.term === "w11"));
  assert.equal(new Set(frozen.map((card) => card.term)).size, 10);
  const small = core.freezeSessionCards(cards.slice(0, 4), { maxCards: 10 });
  assert.equal(small.length, 4);
  const level = {
    previewWords: cards,
    waves: [
      { monsters: [{ term: "a", zh: "甲", sprite: "imp" }, { term: "b", zh: "乙", sprite: "imp" }] },
      { monsters: [{ term: "c", zh: "丙", sprite: "imp" }, { term: "d", zh: "丁", sprite: "imp" }] },
    ],
    boss: { hpWords: [{ term: "a", zh: "甲" }, { term: "b", zh: "乙" }, { term: "c", zh: "丙" }, { term: "d", zh: "丁" }], taunts: [] },
  };
  const applied = core.applyFrozenLevel(level, frozen);
  assert.equal(applied.sessionCards.length, 10);
  assert.equal(applied.previewWords.length, 10);
  const waveTerms = applied.waves.flatMap((wave) => wave.monsters.map((m) => m.term));
  assert.equal(waveTerms.length, 10);
  assert.equal(applied.boss.hpWords.length, 4);
  assert.equal(applied.wordIndex[frozen[0].term.toLowerCase()], frozen[0].zh);
});

test("弱词：错≥2 进本，独立连对 3 出本，skipped 不动，assisted 不计连对", () => {
  let weak = {};
  weak = core.recordWeakAnswer(weak, "Apple", { correct: false });
  assert.equal(core.isWeakTerm(weak.apple), false);
  weak = core.recordWeakAnswer(weak, "apple", { correct: false });
  assert.equal(core.isWeakTerm(weak.apple), true);
  assert.equal(weak.apple.wrong, 2);
  const skipped = core.recordWeakAnswer(weak, "apple", { skipped: true });
  assert.equal(skipped.apple.wrong, 2);
  weak = core.recordWeakAnswer(weak, "apple", { correct: true, assisted: true });
  assert.equal(weak.apple.streak, 0);
  assert.equal(core.isWeakTerm(weak.apple), true);
  weak = core.recordWeakAnswer(weak, "apple", { correct: true });
  weak = core.recordWeakAnswer(weak, "apple", { correct: true });
  weak = core.recordWeakAnswer(weak, "apple", { correct: true });
  assert.equal(core.isWeakTerm(weak.apple), false);
  assert.equal(weak.apple.wrong, 0);
});

test("type-lock：未跟打完锁投掷；跟打条含下一个字母", () => {
  assert.equal(core.throwLocked("tag-shoot", { typed: "" }, "job"), false);
  assert.equal(core.throwLocked("type-lock", { typed: "" }, "job"), true);
  assert.equal(core.throwLocked("type-lock", { typed: "jo" }, "job"), true);
  assert.equal(core.throwLocked("type-lock", { typed: "job" }, "job"), false);
  assert.equal(core.typingComplete({ typed: "job" }, "job"), true);
  assert.equal(core.typingComplete({ typed: "" }, ""), true);
  const pad = core.typePadLetters({ typed: "" }, "job");
  assert.equal(pad.length, 6);
  assert.equal(new Set(pad).size, 6);
  assert.ok(pad.includes("J"));
  const next = core.typePadLetters({ typed: "j" }, "job");
  assert.ok(next.includes("O"));
  const long = core.typePadLetters({ typed: "" }, "complaint");
  assert.ok(long.includes("C"));
  assert.equal(long.length, 6);
});

test("fire-ward：贴脸太近锁投掷，退开才能扔", () => {
  assert.equal(core.resolvePlayVerb({ playVerb: "fire-ward" }), "fire-ward");
  const hero = { x: 0.5, y: 0.5 };
  const near = { x: 0.55, y: 0.5 };
  const far = { x: 0.9, y: 0.5 };
  assert.equal(core.fireTooClose("tag-shoot", hero, near), false);
  assert.equal(core.fireTooClose("fire-ward", hero, near), true);
  assert.equal(core.fireTooClose("fire-ward", hero, far), false);
});

test("fan-blow：只改瞄朝向锥里的配对小妖", () => {
  assert.equal(core.resolvePlayVerb({ playVerb: "fan-blow" }), "fan-blow");
  const hero = { x: 0.2, y: 0.5 };
  const front = { x: 0.8, y: 0.5, zh: "风", alive: true };
  const back = { x: 0.05, y: 0.5, zh: "风", alive: true };
  const side = { x: 0.2, y: 0.9, zh: "火", alive: true };
  assert.equal(core.inFacingCone(hero, front, "east"), true);
  assert.equal(core.inFacingCone(hero, back, "east"), false);
  const aimed = core.chooseFanTarget(hero, [front, back, side], "风", "east");
  assert.equal(aimed, front);
  const none = core.chooseFanTarget(hero, [back, side], "风", "east");
  assert.equal(none, null);
  const seek = core.seekAutoAim("fan-blow", { autoAimShots: 2 });
  assert.equal(seek.armed, true);
  assert.equal(seek.buffs.autoAimShots, 2);
});

test("gourd-seek：整集改瞄，不消耗葫芦次数", () => {
  const seek = core.seekAutoAim("gourd-seek", { autoAimShots: 2 });
  assert.equal(seek.armed, true);
  assert.equal(seek.consumed, false);
  assert.equal(seek.buffs.autoAimShots, 2);
  const gourd = core.seekAutoAim("tag-shoot", { autoAimShots: 2 });
  assert.equal(gourd.armed, true);
  assert.equal(gourd.consumed, true);
  assert.equal(gourd.buffs.autoAimShots, 1);
  const empty = core.seekAutoAim("type-lock", { autoAimShots: 0 });
  assert.equal(empty.armed, false);
  const clicked = { zh: "水", alive: true };
  const matched = { zh: "山", alive: true };
  const aimed = core.chooseThrowTarget(clicked, matched, seek.armed);
  assert.equal(aimed.target, matched);
  assert.equal(aimed.auto, true);
});

test("WORLD_TILES：4×4 大世界，区域编号不写死 3", () => {
  assert.equal(core.WORLD_TILES, 4);
  assert.deepEqual(core.regionOrigin(4, 0), { x: 0, y: 0 });
  assert.deepEqual(core.regionOrigin(4, 5), { x: 1, y: 1 });
  assert.deepEqual(core.regionOrigin(4, 15), { x: 3, y: 3 });
  assert.deepEqual(core.regionOrigin(3, 7), { x: 1, y: 2 });
});

test("regionPoint：格内坐标统一换算成 0..1 世界坐标，不会把小怪夹到地图边缘", () => {
  assert.deepEqual(core.regionPoint(4, 5, 0.5, 0.5), { x: 0.375, y: 0.375 });
  assert.deepEqual(core.regionPoint(4, 6, 0.2, 0.8), { x: 0.55, y: 0.45 });
  const edge = core.regionPoint(4, 15, 2, -1);
  assert.ok(edge.x < 1 && edge.x > 0.99, `x=${edge.x}`);
  assert.ok(edge.y > 0.75 && edge.y < 0.76, `y=${edge.y}`);
});

test("facingFromIntent：主轴定四向，斜向不另开方向", () => {
  assert.equal(core.facingFromIntent(-1, 0), "west");
  assert.equal(core.facingFromIntent(1, 0), "east");
  assert.equal(core.facingFromIntent(0, -1), "north");
  assert.equal(core.facingFromIntent(0, 1), "south");
  assert.equal(core.facingFromIntent(1, 0.5), "east");
  assert.equal(core.facingFromIntent(0.5, 1), "south");
  assert.equal(core.facingFromIntent(0, 0), null);
});

test("movementSpeeds：主角保持儿童走速，小怪追击明显更慢", () => {
  assert.deepEqual(core.MOVEMENT_SPEEDS, {
    hero: 0.38,
    monsterWander: 0.04,
    monsterChase: 0.07,
  });
  assert.ok(core.MOVEMENT_SPEEDS.hero >= 0.3 && core.MOVEMENT_SPEEDS.hero <= 0.5, "主角约 2.5s 走完一屏（儿童从容节奏）");
  assert.ok(core.MOVEMENT_SPEEDS.monsterChase < core.MOVEMENT_SPEEDS.hero * 0.55, "追击不超过主角一半多，孩子能风筝");
  assert.ok(core.MOVEMENT_SPEEDS.monsterWander < core.MOVEMENT_SPEEDS.monsterChase);
});

test("monsterIntent / canStartMelee：远游近追，接触才挥招", () => {
  assert.equal(core.monsterIntent(0.8, 0.42, false), "wander");
  assert.equal(core.monsterIntent(0.2, 0.42, false), "chase");
  assert.equal(core.monsterIntent(0.2, 0.42, true), "flee");
  assert.equal(core.canStartMelee(1000, 0.05, 0.07, 0, 0, false), true);
  assert.equal(core.canStartMelee(1000, 0.2, 0.07, 0, 0, false), false);
  assert.equal(core.canStartMelee(1000, 0.05, 0.07, 1500, 0, false), false);
  assert.equal(core.canStartMelee(1000, 0.05, 0.07, 0, 0, true), false);
  assert.ok(core.MONSTER_AI.windupMs >= 300);
});

test("PACK：同一套占位规则，追击槽位互不重叠", () => {
  assert.equal(core.PACK.chaseRadius, 0.05);
  assert.ok(core.PACK.separation >= 0.03);
  const hero = { x: 0.3, y: 0.4 };
  const from = { x: 0.45, y: 0.4 };
  const slots = [0, 1, 2, 3].map((i) => core.chaseAnchor(hero, from, i, 4, core.PACK.chaseRadius));
  for (let i = 0; i < slots.length; i += 1) {
    for (let j = i + 1; j < slots.length; j += 1) {
      const d = Math.hypot(slots[i].x - slots[j].x, slots[i].y - slots[j].y);
      assert.ok(d >= core.PACK.separation * 0.85, `slot ${i} vs ${j} = ${d}`);
    }
  }
});

test("packSeparation / spreadPack：重叠小怪会被推开", () => {
  const a = { x: 0.4, y: 0.4 };
  const b = { x: 0.4, y: 0.4 };
  const push = core.packSeparation(a, [a, b], 0.04);
  assert.ok(Math.hypot(push.x, push.y) > 0.2);
  const spread = core.spreadPack(
    [{ x: 0.4, y: 0.4 }, { x: 0.401, y: 0.4 }, { x: 0.4, y: 0.401 }, { x: 0.402, y: 0.399 }],
    0.038,
  );
  for (let i = 0; i < spread.length; i += 1) {
    for (let j = i + 1; j < spread.length; j += 1) {
      const d = Math.hypot(spread[i].x - spread[j].x, spread[i].y - spread[j].y);
      assert.ok(d >= 0.036, `spread ${i} vs ${j} = ${d}`);
    }
  }
});

test("directionFromDelta：小怪按运动主轴切换四向，停下保持最后方向", () => {
  assert.equal(core.directionFromDelta(-1, 0, "south"), "west");
  assert.equal(core.directionFromDelta(1, 0, "south"), "east");
  assert.equal(core.directionFromDelta(0, -1, "south"), "north");
  assert.equal(core.directionFromDelta(0, 1, "north"), "south");
  assert.equal(core.directionFromDelta(0.2, 0.1, "north"), "east");
  assert.equal(core.directionFromDelta(0, 0, "west"), "west");
  assert.equal(core.directionFromDelta(0, 0, null), "south");
});

test("moveStep：斜向 hypot 归一，速度不加快", () => {
  const cardinal = core.moveStep(1, 0, 1, 1);
  const diagonal = core.moveStep(1, 1, 1, 1);
  assert.equal(cardinal.dx, 1);
  assert.ok(Math.abs(Math.hypot(diagonal.dx, diagonal.dy) - 1) < 1e-9);
  assert.equal(diagonal.facing, "east");
  assert.equal(core.moveStep(0, 0, 1, 1).moving, false);
});

test("moveStep：模拟量保幅——轻推慢走、满推全速（T01）", () => {
  const light = core.moveStep(0.2, 0, 1, 1);
  assert.equal(light.dx, 0.2, "轻推 0.2 应走 0.2 而非全速");
  const tiny = core.moveStep(0.05, 0, 1, 1);
  assert.equal(tiny.dx, 0.05);
  const fullDiag = core.moveStep(1, 1, 1, 1);
  assert.ok(Math.abs(Math.hypot(fullDiag.dx, fullDiag.dy) - 1) < 1e-9, "满推斜向仍归一");
  const halfDiag = core.moveStep(0.5, 0.5, 1, 1);
  assert.ok(Math.abs(Math.hypot(halfDiag.dx, halfDiag.dy) - Math.min(1, Math.hypot(0.5, 0.5))) < 1e-9, "半推斜向幅度=min(1,|intent|)");
});

test("moveStepViewport：非方形视口横竖与斜向保持相同屏幕速度", () => {
  const viewport = { width: 1280, height: 720 };
  const horizontal = core.moveStepViewport(1, 0, 1, 1, viewport);
  const vertical = core.moveStepViewport(0, 1, 1, 1, viewport);
  const diagonal = core.moveStepViewport(1, 1, 1, 1, viewport);
  const horizontalPx = Math.hypot(horizontal.dx * viewport.width, horizontal.dy * viewport.height);
  const verticalPx = Math.hypot(vertical.dx * viewport.width, vertical.dy * viewport.height);
  const diagonalPx = Math.hypot(diagonal.dx * viewport.width, diagonal.dy * viewport.height);
  assert.ok(Math.abs(horizontalPx - verticalPx) < 1e-9, "横竖移动不应因视口比例变速");
  assert.ok(Math.abs(diagonalPx - horizontalPx) < 1e-9, "斜向移动不应比主轴更快");
  assert.ok(vertical.dy > vertical.dx + 0.5, "竖向世界坐标应补偿横竖视口比例");
});

test("normalizeMap：格坐标 → 0..1 归一化地图坐标", () => {
  assert.deepEqual(core.normalizeMap({ x: 0, y: 0 }, 4), { x: 0, y: 0 });
  assert.deepEqual(core.normalizeMap({ x: 2, y: 4 }, 4), { x: 0.5, y: 1 });
  assert.deepEqual(core.normalizeMap({ x: -1, y: 9 }, 4), { x: 0, y: 1 }, "越界钳制");
});

test("worldToScreen / screenToWorld：回环恒等且镜头参与平移（T01）", () => {
  const vp = { width: 1280, height: 720 };
  const cam = { x: 0.5, y: 0.25 };
  const p = { x: 0.6, y: 0.4 };
  const s = core.worldToScreen(p, cam, vp, 4);
  assert.ok(Math.abs(s.x - (0.6 - 0.5) * 1280 * 4) < 1e-9);
  assert.ok(Math.abs(s.y - (0.4 - 0.25) * 720 * 4) < 1e-9);
  const back = core.screenToWorld(s.x, s.y, cam, vp, 4);
  assert.ok(Math.abs(back.x - p.x) < 1e-9 && Math.abs(back.y - p.y) < 1e-9, "world→screen→world 回环");
});

test("edgeCameraStep：中央区镜头不动（T01）", () => {
  const cam = { x: 0.5, y: 0.5 };
  // world=4：视口占 0.25，margin 0.18×0.25=0.045；视口中心=cam+0.125 ∈ 死区
  const next = core.edgeCameraStep(cam, { x: 0.625, y: 0.575 }, 4, 0.048, { margin: 0.18 });
  assert.ok(Math.abs(next.x - cam.x) < 1e-9, "横向镜头不动");
  assert.ok(Math.abs(next.y - cam.y) < 1e-9, "纵向镜头不动");
});

test("centerCameraAtFocus：出生点先落在视口中央，不一启动就贴边跟随（T01）", () => {
  const camera = core.centerCameraAtFocus({ x: 0.375, y: 0.395 }, 4);
  assert.ok(Math.abs(camera.x - 0.25) < 1e-9);
  assert.ok(Math.abs(camera.y - 0.27) < 1e-9);
  const edge = core.centerCameraAtFocus({ x: 0.02, y: 0.98 }, 4);
  assert.deepEqual(edge, { x: 0, y: 0.75 }, "世界边界处仍需钳制镜头");
});

test("edgeCameraStep：边缘平滑跟随、指数收敛、硬钳制（T01）", () => {
  // 焦点 0.9 未顶到地图右缘：目标=0.9−(0.25−0.045)=0.695，指数收敛到位
  let cam = { x: 0, y: 0 };
  for (let i = 0; i < 60; i += 1) {
    cam = core.edgeCameraStep(cam, { x: 0.9, y: 0.9 }, 4, 0.048, { margin: 0.18, tau: 0.12 });
  }
  assert.ok(Math.abs(cam.x - 0.695) < 0.01, `镜头贴边跟随 x=${cam.x}`);
  // 焦点顶到地图右缘 0.99：镜头钳制在 maxCam=0.75，不越界
  cam = { x: 0, y: 0 };
  for (let i = 0; i < 60; i += 1) {
    cam = core.edgeCameraStep(cam, { x: 0.99, y: 0.99 }, 4, 0.048, { margin: 0.18, tau: 0.12 });
  }
  assert.ok(Math.abs(cam.x - (1 - 0.25)) < 1e-9 && Math.abs(cam.y - (1 - 0.25)) < 1e-9, `maxCam 钳制 x=${cam.x}`);
  // 平滑：焦点在视口内但越出死区带时，单步只走一部分（硬跟随仅在出视口时触发）
  const one = core.edgeCameraStep({ x: 0.5, y: 0.5 }, { x: 0.74, y: 0.74 }, 4, 0.048, { margin: 0.18, tau: 0.12 });
  assert.ok(one.x > 0.5 && one.x < one.targetX, "指数平滑：单步只走一部分");
});

test("edgeCameraStep：世界边界内 focus 恒在视口内；静止后收敛进死区带（扫描不变量）", () => {
  let cam = { x: 0, y: 0 };
  const vf = 0.25, margin = 0.045, maxCam = 0.75;
  for (let i = 0; i <= 40; i += 1) {
    const f = { x: i / 40, y: 1 - i / 40 };
    // 移动瞬间：主角必须立即在视口内（硬安全边界）
    cam = core.edgeCameraStep(cam, f, 4, 0.048, { margin: 0.18 });
    assert.ok(f.x >= cam.x - 1e-6 && f.x <= cam.x + vf + 1e-6, `x 越出视口 f=${f.x} cam=${cam.x}`);
    assert.ok(f.y >= cam.y - 1e-6 && f.y <= cam.y + vf + 1e-6, `y 越出视口 f=${f.y} cam=${cam.y}`);
    // 焦点静止后：镜头收敛，主角回到死区带内（或镜头钳制在世界边界）
    for (let s = 0; s < 80; s += 1) {
      cam = core.edgeCameraStep(cam, f, 4, 0.048, { margin: 0.18, tau: 0.12 });
    }
    const atEdgeX = cam.x <= 1e-6 || cam.x >= maxCam - 1e-6;
    if (!atEdgeX) {
      assert.ok(f.x >= cam.x + margin - 1e-3 && f.x <= cam.x + vf - margin + 1e-3, `收敛后 x 越出死区带 f=${f.x} cam=${cam.x}`);
    }
  }
});

test("applyDeadZone：小幅清零、越界重映射保满幅（T02）", () => {
  assert.equal(core.applyDeadZone(0.05, 0.12), 0);
  assert.ok(Math.abs(core.applyDeadZone(0.5, 0.12) - 0.4318) < 1e-3);
  assert.equal(core.applyDeadZone(1, 0.12), 1, "满推仍满幅");
  assert.equal(core.applyDeadZone(-1, 0.12), -1, "负向满幅");
});

test("六种支援道具：拾取计数、使用效果、蟠桃挡伤、金箍棒补盾", () => {
  assert.deepEqual(core.SUPPORT_IDS, ["peach", "fan", "gourd", "cloud", "mantra", "staff"]);
  let items = core.emptyItems();
  core.SUPPORT_IDS.forEach((id) => {
    items = core.addItem(items, id);
    assert.equal(items[id], 1);
  });
  assert.equal(core.nextDropType(1), "peach");
  assert.equal(core.nextDropType(6), "staff");
  assert.equal(core.nextDropType(7), "peach");

  const fan = core.applySupportUse(items, core.emptyBuffs(), "fan", 1000, 2);
  assert.equal(fan.used, true);
  assert.equal(fan.items.fan, 0);
  assert.equal(fan.buffs.slowUntil, 1000 + core.SLOW_MS);
  assert.ok(core.monsterSpeed(1, fan.buffs, 1001) < 1);
  assert.equal(core.monsterSpeed(1, fan.buffs, fan.buffs.slowUntil + 1), 1);

  const peachHit = core.absorbHit({ peach: 1 }, 3);
  assert.equal(peachHit.absorbed, true);
  assert.equal(peachHit.shield, 3);
  assert.equal(peachHit.items.peach, 0);
  const rawHit = core.absorbHit({ peach: 0 }, 3);
  assert.equal(rawHit.absorbed, false);
  assert.equal(rawHit.shield, 2);

  const staff = core.onCorrectHit({ comboShield: 1 }, 2);
  assert.equal(staff.shield, 3);
  assert.equal(staff.buffs.comboShield, 0);

  const gourd = core.consumeAutoAim({ autoAimShots: 2 });
  assert.equal(gourd.armed, true);
  assert.equal(gourd.buffs.autoAimShots, 1);
  assert.equal(core.hintLetter("mountain"), "M");
});

test("地图流程：第一波 → NPC 小Boss → 第二波 → 大Boss", () => {
  assert.equal(core.shouldAutoIntro(false, false), true);
  assert.equal(core.shouldAutoIntro(true, false), false);
  assert.equal(core.shouldAutoIntro(false, true), false);
  assert.equal(core.canTalkQuizNpc(false), false);
  assert.equal(core.canTalkQuizNpc(true), true);
  assert.equal(core.nextMapStage(0, 2, false), "npc");
  assert.equal(core.nextMapStage(0, 2, true), "next-wave");
  assert.equal(core.nextMapStage(1, 2, true), "boss");
  assert.equal(core.canOpenBoss(0, true), true);
  assert.equal(core.canOpenBoss(1, true), false);
  assert.equal(core.canOpenBoss(0, false), false);
  assert.equal(core.canAdvanceDialogue({ type: "choice" }, false), false);
  assert.equal(core.canAdvanceDialogue({ type: "choice" }, true), true);
  assert.equal(core.canAdvanceDialogue({ type: "dialogue" }, false), true);
});

test("地图完成后不应再次开启 Boss 门", () => {
  assert.equal(core.isMapRunComplete("complete"), true);
  assert.equal(core.isMapRunComplete("boss"), false);
  assert.equal(core.isMapRunComplete("wave2"), false);
});

test("Boss 血条比例与战报最多 3 条", () => {
  assert.equal(core.bossHpRatio(0, 4), 1);
  assert.equal(core.bossHpRatio(2, 4), 0.5);
  assert.equal(core.bossHpRatio(4, 4), 0);
  const log = core.pushBattleLog(["a", "b", "c"], "d", 3);
  assert.deepEqual(log, ["b", "c", "d"]);
});
