import test from "node:test";
import assert from "node:assert/strict";
import core from "./game-common.js";

/* game-common.js 收敛自 game.js / battle.js 的同款纯函数。
 * 这些用例钉住对外行为语义：改实现时只许等价替换（见 2026-09-30-游戏部分重构 方案切片 1）。 */

test("readStore：正常 JSON 读出对象，坏 JSON 与空值回落 {}", () => {
  const store = new Map([["k1", '{"a":1}'], ["k2", "{broken"]]);
  const fakeLocalStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
  };
  withLocalStorage(fakeLocalStorage, () => {
    assert.deepEqual(core.readStore("k1"), { a: 1 });
    assert.deepEqual(core.readStore("k2"), {}, "坏 JSON 回落空对象");
    assert.deepEqual(core.readStore("missing"), {}, "缺失键回落空对象");
    assert.deepEqual(core.readStore("k3"), {}, "getItem 返回 null 回落空对象");
  });
});

test("writeStore：写入 JSON 字符串；存储抛错时静默不崩", () => {
  const store = new Map();
  withLocalStorage({
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
  }, () => {
    core.writeStore("k", { b: 2 });
    assert.equal(store.get("k"), '{"b":2}');
  });
  withLocalStorage({ getItem: () => null, setItem: () => { throw new Error("quota"); } }, () => {
    assert.doesNotThrow(() => core.writeStore("k", { b: 3 }), "存不下只保留本次体验");
  });
});

test("readStore/writeStore：null 数值与数组口径不变（|| {} 兜底语义保留）", () => {
  withLocalStorage({ getItem: () => "null" }, () => {
    assert.deepEqual(core.readStore("k"), {}, '"null" 字面量回落空对象');
  });
  withLocalStorage({ getItem: () => '[1,2]' }, () => {
    assert.deepEqual(core.readStore("k"), [1, 2], "数组原样返回（不强行包对象）");
  });
});

test("handheldOffline：documentElement 带 data-handheld 属性才为 true，异常回落 false", () => {
  withFakeDocument({ hasAttribute: (name) => name === "data-handheld" }, () => {
    assert.equal(core.handheldOffline(), true);
  });
  withFakeDocument({ hasAttribute: () => false }, () => {
    assert.equal(core.handheldOffline(), false);
  });
  withFakeDocument(null, () => {
    assert.equal(core.handheldOffline(), false, "无 document 环境不抛错");
  });
});

test("fetchJSON：ok 返回 json，非 ok 与网络口径为 null（cache: no-store）", async () => {
  const calls = [];
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, opts) => {
      calls.push({ url, opts });
      if (String(url).endsWith("good.json")) {
        return { ok: true, json: async () => ({ hello: 1 }) };
      }
      return { ok: false, json: async () => ({}) };
    };
    assert.deepEqual(await core.fetchJSON("/x/good.json"), { hello: 1 });
    assert.equal(await core.fetchJSON("/x/bad.json"), null);
    assert.ok(calls.every((c) => c.opts && c.opts.cache === "no-store"), "必须禁缓存");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("assetUrl：统一加 ../ 前缀（页面在 /engine/ 下），已有的只剥一层；空值返回空串", () => {
  assert.equal(core.assetUrl("assets/game-sprites/a/a.png"), "../assets/game-sprites/a/a.png");
  assert.equal(core.assetUrl("../data/game/levels/ep1.json"), "../data/game/levels/ep1.json");
  assert.equal(core.assetUrl("../../deep"), "../../deep", "replace 只剥一个前导 ../，整体仍加一层");
  assert.equal(core.assetUrl(""), "");
  assert.equal(core.assetUrl(null), "");
  assert.equal(core.assetUrl(undefined), "");
});

test("catalogCards：previewWords + 波次小妖 + Boss hpWords 汇总，缺 term/zh 的行剔除", () => {
  const level = {
    previewWords: [{ term: "peach", zh: "桃子" }, { zh: "无英文" }, null],
    waves: [
      { monsters: [{ term: "monkey", zh: "猴子" }] },
      { monsters: [{ term: "pig", zh: "猪" }, { term: "nozh" }] },
      {},
    ],
    boss: { hpWords: [{ term: "king", zh: "大王" }] },
  };
  assert.deepEqual(core.catalogCards(level), [
    { term: "peach", zh: "桃子" },
    { term: "monkey", zh: "猴子" },
    { term: "pig", zh: "猪" },
    { term: "king", zh: "大王" },
  ]);
  assert.deepEqual(core.catalogCards(null), [], "无关卡返回空数组");
  assert.deepEqual(core.catalogCards({}), [], "空关卡返回空数组");
});

/* ---- 测试脚手架：最小 localStorage/document 替身（与其他 page 测试同风格，无第三方依赖） ---- */

function withLocalStorage(fake, fn) {
  const real = globalThis.localStorage;
  globalThis.localStorage = fake;
  try {
    fn();
  } finally {
    globalThis.localStorage = real;
  }
}

function withFakeDocument(docElement, fn) {
  const realDocument = globalThis.document;
  globalThis.document = docElement === null ? undefined : { documentElement: docElement };
  try {
    fn();
  } finally {
    globalThis.document = realDocument;
  }
}
