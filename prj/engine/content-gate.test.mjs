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
