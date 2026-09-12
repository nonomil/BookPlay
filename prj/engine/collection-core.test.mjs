import test from "node:test";
import assert from "node:assert/strict";
import core from "./collection-core.js";

const dex = {
  schema_version: 1,
  elements: ["water", "fire", "forest", "earth", "light"],
  dex: [
    { id: "monkey-minor", nameZh: "小猴子", element: "forest", tier: 1,
      words: ["monkey", "rock"], sprite: "monkey-minor",
      habitat: ["flower-fruit-mountain"],
      catchQuiz: { kind: "meaning-choice", count: 2 },
      evolution: null },
    { id: "chaosdemon-minion", nameZh: "水妖", element: "water", tier: 1,
      words: ["demon", "chaos"], sprite: "chaosdemon-minion",
      habitat: ["water-dirty-cave"],
      catchQuiz: { kind: "meaning-choice", count: 2 },
      evolution: { to: "chaosdemon", requireWords: 2, requireStars: 3 } },
    { id: "chaosdemon", nameZh: "混世魔王", element: "water", tier: 2,
      words: ["furious"], sprite: "chaosdemon",
      habitat: ["water-dirty-cave"],
      catchQuiz: { kind: "meaning-choice", count: 3 },
      evolution: null },
  ],
};

test("unlockable：绑定词全部掌握才可捕捉，大小写不敏感", () => {
  assert.deepEqual(core.unlockable(dex, ["monkey", "rock"]), ["monkey-minor"]);
  assert.deepEqual(core.unlockable(dex, ["Monkey", "ROCK"]), ["monkey-minor"]);
  assert.deepEqual(core.unlockable(dex, ["monkey"]), [], "只掌握一半不可捕捉");
  assert.deepEqual(core.unlockable(dex, ["monkey", "rock", "demon", "chaos", "furious"]),
    ["monkey-minor", "chaosdemon-minion", "chaosdemon"]);
  assert.deepEqual(core.unlockable(null, ["monkey"]), []);
});

test("register：幂等登记 + 星星只升不降", () => {
  const a = core.register(null, "monkey-minor", { stars: 2 });
  assert.deepEqual(a.caught, ["monkey-minor"]);
  const b = core.register(a, "monkey-minor", { stars: 1 });
  assert.equal(b.stars["monkey-minor"], 2, "星星只取最大值");
  assert.equal(b.caught.length, 1, "重复登记不追加");
  const c = core.register(b, "chaosdemon", {});
  assert.deepEqual(c.caught, ["monkey-minor", "chaosdemon"]);
});

test("markSeen：seen 独立累积", () => {
  const s = core.markSeen(core.markSeen(null, "imp"), "imp");
  assert.deepEqual(s.seen, ["imp"]);
});

test("evolutionReady：需已捕捉 + 词数与星星双阈值", () => {
  const mastered = ["demon", "chaos"];
  const notCaught = core.evolutionReady(dex, null, mastered);
  assert.equal((notCaught.find((e) => e.from === "chaosdemon-minion") || { ready: false }).ready, false, "未捕捉不进进化候选");
  const caught = core.register(null, "chaosdemon-minion", { stars: 3 });
  const ready = core.evolutionReady(dex, caught, mastered);
  const e = ready.find((x) => x.from === "chaosdemon-minion");
  assert.equal(e.ready, true);
  assert.equal(e.to, "chaosdemon");
  const shortStars = core.register(null, "chaosdemon-minion", { stars: 1 });
  const e2 = core.evolutionReady(dex, shortStars, mastered).find((x) => x.from === "chaosdemon-minion");
  assert.equal(e2.ready, false);
  assert.deepEqual(e2.missing, { words: 0, stars: 2 });
});

test("completion：caught/seen/ratio", () => {
  const st = core.register(core.markSeen(null, "chaosdemon"), "monkey-minor", { stars: 1 });
  const c = core.completion(dex, st);
  assert.equal(c.total, 3);
  assert.equal(c.caught, 1);
  assert.equal(c.seen, 2);
  assert.ok(Math.abs(c.ratio - 1 / 3) < 1e-9);
  assert.equal(core.completion(null, null).total, 0);
});

test("isCaught 与坏输入容错", () => {
  const st = core.register(null, "imp", {});
  assert.equal(core.isCaught(st, "imp"), true);
  assert.equal(core.isCaught(st, "chaosdemon"), false);
  assert.equal(core.isCaught(null, "imp"), false);
  assert.deepEqual(core.evolutionReady(null, null, []), []);
  assert.equal(core.findEntry(dex, "monkey-minor").nameZh, "小猴子");
  assert.equal(core.findEntry(dex, "nope"), null);
});
