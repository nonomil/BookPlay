import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { fileURLToPath } from "node:url";

function loadNativeKey() {
  const source = readFileSync(new URL("./native-key.js", import.meta.url), "utf8");
  const events = [];
  const document = {
    dispatchEvent(event) {
      events.push(event);
    },
  };
  const root = { document };
  const context = createContext({
    document,
    globalThis: root,
    CustomEvent: class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init && init.detail;
      }
    },
  });
  runInContext(source, context);
  return { api: root.BookPlayNativeKeys, nativeKey: root.BookPlayNativeKey, apply: root.BookPlayApplyDeviceProfile, events };
}

test("native key bridge records down/up codes for the handheld probe", () => {
  const { api, nativeKey } = loadNativeKey();
  nativeKey({ keyCode: 23, scanCode: 304, action: 0, repeat: 0, name: "KEYCODE_DPAD_CENTER" });
  nativeKey({ keyCode: 23, scanCode: 304, action: 1, repeat: 0, name: "KEYCODE_DPAD_CENTER" });
  const recent = api.recent();
  assert.equal(recent[0].action, 1);
  assert.equal(recent[1].keyCode, 23);
  assert.equal(recent[1].scanCode, 304);
  assert.match(api.formatKey(recent[1]), /down keyCode=23 scanCode=304/);
});

test("pocket RK3566 plus a physical key suggests handheld control mode", () => {
  const { api, apply, nativeKey } = loadNativeKey();
  nativeKey({ keyCode: 21, scanCode: 105, action: 0, name: "KEYCODE_DPAD_LEFT" });
  assert.equal(apply({ hardware: "rk3566", board: "rk3566_box", widthPx: 640, heightPx: 480 }), true);
  assert.equal(api.suggestHandheld({ hardware: "qcom", board: "taro", widthPx: 1920, heightPx: 1200 }), false);
});

test("classifies dpad, ABXY, start/select, and left/right sticks", () => {
  const { api } = loadNativeKey();
  assert.equal(api.classifyKey({ keyCode: 19 }).role, "up");
  assert.equal(api.classifyKey({ keyCode: 20 }).role, "down");
  assert.equal(api.classifyKey({ keyCode: 21 }).role, "left");
  assert.equal(api.classifyKey({ keyCode: 22 }).role, "right");
  assert.equal(api.classifyKey({ keyCode: 96 }).role, "A");
  assert.equal(api.classifyKey({ keyCode: 97 }).role, "B");
  assert.equal(api.classifyKey({ keyCode: 99 }).role, "X");
  assert.equal(api.classifyKey({ keyCode: 100 }).role, "Y");
  assert.equal(api.classifyKey({ keyCode: 108 }).role, "start");
  assert.equal(api.classifyKey({ keyCode: 109 }).role, "select");
  const sticks = api.applyAxis({ lx: 0.82, ly: -0.04, rx: 0.01, ry: -0.91 });
  assert.equal(sticks.left.x, 0.82);
  assert.equal(sticks.left.y, 0);
  assert.equal(sticks.right.x, 0);
  assert.ok(sticks.right.y < -0.8);
});

