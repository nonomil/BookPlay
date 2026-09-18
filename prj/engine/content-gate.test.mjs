import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { fileURLToPath } from "node:url";

function loadGate(fetchImpl) {
  const source = readFileSync(new URL("./content-gate.js", import.meta.url), "utf8");
  const document = {
    createElement() {
      return { textContent: "" };
    },
    head: { appendChild() {} },
    addEventListener() {},
  };
  const root = { document };
  const context = createContext({
    document,
    fetch: fetchImpl,
    globalThis: root,
    URL,
  });
  runInContext(source, context);
  return root.BookPlayContentGate;
}

function jsonResponse(payload, ok = true) {
  return Promise.resolve({
    ok,
    json: async () => payload,
  });
}

test("click targets cover lesson, game, dub, parent and collection drill", () => {
  const gate = loadGate(() => jsonResponse(null, false));
  const game = gate.targetFromUrl("game.html?ep=8");
  assert.equal(game.series, "jttw");
  assert.equal(game.id, 8);
  assert.match(String(game.href), /game\.html\?ep=8/);
  assert.equal(gate.targetFromUrl("lesson.html?ep=2").id, 2);
  assert.equal(gate.targetFromUrl("dub.html?ep=3").id, 3);
  assert.equal(gate.targetFromUrl("parent.html?ep=1").id, 1);
  assert.equal(gate.targetFromUrl("drill.html?c=c02").id, 8);
  assert.equal(gate.targetFromUrl("drill.html?ep=3"), null);
  assert.equal(gate.targetFromUrl("shelf.html"), null);
});

test("map episode cards (data-detail) skip the gate so the detail layer can open", () => {
  const js = readFileSync(new URL("./content-gate.js", import.meta.url), "utf8");
  assert.match(js, /anchor\.hasAttribute\("data-detail"\)/, "带 data-detail 的地图卡片交给地图自己的详情弹层");
  assert.match(
    js,
    /if \(!anchor \|\| anchor\.hasAttribute\("data-detail"\)\) return;/,
    "详情层内部链接（无 data-detail）仍然走内容门",
  );
});

test("starter manifest keeps first titles of all three lines open", async () => {
  const gate = loadGate((url) => {
    if (String(url).endsWith("content-manifest.json")) {
      return jsonResponse({
        kind: "apk-builtin-starter",
        available: {
          jttw: { episodes: [1] },
          minecraft: { books: [1] },
          "mikey-jj": { books: [1] },
        },
      });
    }
    return jsonResponse(null, false);
  });
  assert.equal(await gate.isUnavailable("jttw", 1), false);
  assert.equal(await gate.isUnavailable("minecraft", 1), false);
  assert.equal(await gate.isUnavailable("mikey-jj", 1), false);
  assert.equal(await gate.isUnavailable("jttw", 2), true);
  assert.equal(await gate.isUnavailable("minecraft", 2), true);
});

test("imported payload unlocks a later title even if starter list omitted it", async () => {
  const gate = loadGate((url) => {
    const href = String(url);
    if (href.endsWith("content-manifest.json")) {
      return jsonResponse({
        kind: "apk-builtin-starter",
        available: { jttw: { episodes: [1] } },
      });
    }
    if (href.endsWith("storybooks-minecraft/book1.json")) {
      return jsonResponse({ id: 1 });
    }
    return jsonResponse(null, false);
  });
  assert.equal(await gate.isUnavailable("minecraft", 1), false);
  assert.equal(await gate.isUnavailable("minecraft", 2), true);
});
