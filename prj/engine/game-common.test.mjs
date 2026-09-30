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

/* ---- 切片 1b：工厂 ---- */

test("makeWeakPersister：按集写 weakWords，跨集累加不覆盖", () => {
  const store = new Map();
  withLocalStorage({ getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) }, () => {
    const stateA = { weakWords: ["w1"] };
    core.makeWeakPersister({ key: "bookplay_weak_v1", state: stateA, ep: 3 })();
    core.makeWeakPersister({ key: "bookplay_weak_v1", state: { weakWords: ["w2"] }, ep: 4 })();
    assert.deepEqual(JSON.parse(store.get("bookplay_weak_v1")), { "3": ["w1"], "4": ["w2"] });
  });
});

test("makeFreezeLevel：接通 core 冻结管线（卡片汇总/上限/弱词/unit 派生）", () => {
  const calls = [];
  const fakeCore = {
    SESSION_CARD_LIMIT: 10,
    freezeSessionCards: (cards, opts) => {
      calls.push({ cards, opts });
      return [{ term: "frozen" }];
    },
    applyFrozenLevel: (level, frozen) => ({ level, frozen }),
  };
  const state = { weakWords: { cat: { n: 1 } } };
  const freezeLevel = core.makeFreezeLevel({ core: fakeCore, state, ep: 7 });
  const level = { seedBase: 123, previewWords: [{ term: "a", zh: "甲" }] };
  const out = freezeLevel(level, { dog: { n: 2 } });
  assert.deepEqual(out, { level, frozen: [{ term: "frozen" }] }, "原关卡对象透传给 applyFrozenLevel");
  assert.deepEqual(calls[0].cards, [{ term: "a", zh: "甲" }]);
  assert.equal(calls[0].opts.maxCards, 10);
  assert.deepEqual(calls[0].opts.wrongWords, { dog: { n: 2 } });
  assert.equal(calls[0].opts.weakWords, state.weakWords, "weakWords 引用自注入 state");
  assert.equal(calls[0].opts.unit, 0.123, "unit=(seedBase%1000)/1000");
  const calls2 = [];
  fakeCore.freezeSessionCards = (c, o) => { calls2.push(o); return []; };
  fakeCore.applyFrozenLevel = (level2) => level2;
  core.makeFreezeLevel({ core: fakeCore, state, ep: 7 })({ seedBase: 0 }, {});
  assert.equal(calls2[0].unit, 0.007, "seedBase 缺失时回落 ep 派生");
});

test("makeToast：立即显示、按 ms 自动隐藏、新 toast 取消旧定时器、默认 1800", () => {
  const timers = [];
  const fakeWindow = {
    setTimeout: (fn, ms) => { timers.push({ fn, ms, cleared: false }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].cleared = true; },
  };
  withWindow(fakeWindow, () => {
    const el = { textContent: "", hidden: true };
    const showToast = core.makeToast(el);
    showToast("你好", 900);
    assert.equal(el.textContent, "你好");
    assert.equal(el.hidden, false);
    assert.equal(timers[0].ms, 900);
    showToast("第二条");
    assert.equal(timers[0].cleared, true, "前一条的自动隐藏被取消");
    assert.equal(el.textContent, "第二条");
    assert.equal(timers[1].ms, 1800, "缺省 1800ms");
    timers[1].fn();
    assert.equal(el.hidden, true);
  });
});

test("makeSpeakTerm：接音频适配器时 ref/text(trim)/lang 正确，空词不触发", () => {
  const played = [];
  const adapter = { play: (req) => { played.push(req); return true; } };
  const speakTerm = core.makeSpeakTerm({ getAudio: () => adapter, getEl: () => null, setEl: () => {} });
  speakTerm("  Journey  ");
  assert.deepEqual(played[0], { ref: "word:Journey:en", text: "Journey", lang: "en-US" });
  speakTerm("旅行", "zh");
  assert.deepEqual(played[1], { ref: "word:旅行:zh", text: "旅行", lang: "zh-CN" });
  speakTerm("");
  assert.equal(played.length, 2, "空词直接返回");
});

test("makeSpeakTerm：无适配器走 TTS，且复用同一 audioEl 句柄（与 stopAudio 共享，不可新建第二个）", () => {
  const watched = [];
  const created = [];
  class FakeAudio {
    constructor() { this.src = ""; this.currentTime = 0; created.push(this); }
    play() { this.played = (this.played || 0) + 1; return Promise.resolve(); }
    pause() {}
  }
  let heldEl = null;
  withWindow({
    setTimeout: (fn) => 0, clearTimeout: () => {},
    BookPlayAudio: { watchMedia: (el) => watched.push(el) },
  }, () => {
    withFakeDocument({ hasAttribute: () => false }, () => {
      const realAudio = globalThis.Audio;
      globalThis.Audio = FakeAudio;
      try {
        const speakTerm = core.makeSpeakTerm({
          getAudio: () => null,
          getEl: () => heldEl,
          setEl: (v) => { heldEl = v; },
        });
        speakTerm("apple");
        assert.equal(created.length, 1, "首次创建唯一 audioEl");
        assert.equal(heldEl.src, "/api/tts?voice=en&text=apple");
        assert.deepEqual(watched, [heldEl], "watchMedia 接到同一句柄");
        speakTerm("banana");
        assert.equal(created.length, 1, "第二次复用句柄，不新建 Audio");
        assert.equal(heldEl.src, "/api/tts?voice=en&text=banana");
      } finally {
        globalThis.Audio = realAudio;
      }
    });
  });
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

function withWindow(fake, fn) {
  const realWindow = globalThis.window;
  globalThis.window = fake;
  try {
    fn();
  } finally {
    if (realWindow === undefined) delete globalThis.window;
    else globalThis.window = realWindow;
  }
}
