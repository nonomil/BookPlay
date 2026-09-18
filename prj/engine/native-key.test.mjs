import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { fileURLToPath } from "node:url";

function loadNativeKey(options = {}) {
  const source = readFileSync(new URL("./native-key.js", import.meta.url), "utf8");
  const events = [];
  const html = {
    attrs: {},
    setAttribute(name, value) { this.attrs[name] = value; },
    removeAttribute(name) { delete this.attrs[name]; },
    getAttribute(name) { return this.attrs[name]; },
  };
  const listeners = {};
  const document = {
    documentElement: html,
    hidden: false,
    dispatchEvent(event) {
      events.push(event);
    },
    addEventListener(type, fn) {
      (listeners["doc:" + type] || (listeners["doc:" + type] = [])).push(fn);
    },
  };
  const root = {
    document,
    innerWidth: options.innerWidth || 1280,
    innerHeight: options.innerHeight || 720,
    addEventListener(type, fn) {
      (listeners[type] || (listeners[type] = [])).push(fn);
    },
  };
  const context = createContext({
    document,
    globalThis: root,
    KeyboardEvent: class KeyboardEvent {
      constructor(type, init) {
        this.type = type;
        this.key = init && init.key;
        this.code = init && init.code;
        this.bubbles = Boolean(init && init.bubbles);
        this.cancelable = Boolean(init && init.cancelable);
        this.isTrusted = false;
      }
    },
    CustomEvent: class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init && init.detail;
      }
    },
  });
  runInContext(source, context);
  return {
    api: root.BookPlayNativeKeys,
    nativeKey: root.BookPlayNativeKey,
    nativeAxis: root.BookPlayNativeAxis,
    apply: root.BookPlayApplyDeviceProfile,
    events,
    html,
    listeners,
  };
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
  assert.equal(api.classifyKey({ keyCode: 102 }).role, "L1");
});

test("native A/B/X/Y synthesize F1-F4 KeyboardEvents that handheld-controls accepts", () => {
  const { nativeKey, events } = loadNativeKey();
  nativeKey({ keyCode: 96, action: 0, name: "KEYCODE_BUTTON_A" });
  const keydown = events.find((event) => event.type === "keydown" && event.code === "F1");
  assert.equal(keydown.key, "F1");
  assert.equal(keydown.x35sTest, true);
});

test("left stick synthesizes WASD and right stick does not emit pointer events", () => {
  const { nativeAxis, events } = loadNativeKey();
  nativeAxis({ lx: -0.9, ly: -0.9, rx: 0.95, ry: -0.95 });
  const codes = events.filter((event) => event.type === "keydown").map((event) => event.code);
  assert.ok(codes.includes("KeyA"));
  assert.ok(codes.includes("KeyW"));
  assert.equal(events.some((event) => /pointer|mouse/i.test(event.type || "")), false);
});

test("rk3566 640x480 profile marks html[data-handheld]", () => {
  const { apply, html } = loadNativeKey();
  assert.equal(apply({ hardware: "rk3566", board: "rk3566_box", widthPx: 640, heightPx: 480 }), true);
  assert.equal(html.getAttribute("data-handheld"), "1");
});

test("left stick latches release on blur so the next packet can re-fire", () => {
  const { nativeAxis, events, listeners, api } = loadNativeKey();
  nativeAxis({ lx: -0.9, ly: 0, rx: 0, ry: 0 });
  assert.ok(events.some((event) => event.type === "keydown" && event.code === "KeyA"));
  nativeAxis({ lx: -0.9, ly: 0, rx: 0, ry: 0 });
  const downs = events.filter((event) => event.type === "keydown" && event.code === "KeyA");
  assert.equal(downs.length, 1);
  for (const fn of listeners.blur || []) fn();
  assert.ok(events.some((event) => event.type === "keyup" && event.code === "KeyA"));
  nativeAxis({ lx: -0.9, ly: 0, rx: 0, ry: 0 });
  assert.equal(events.filter((event) => event.type === "keydown" && event.code === "KeyA").length, 2);
  api.release();
});

test("blur 释放仍按下的 D-pad / F1–F10，不只抬左摇杆", () => {
  const { nativeKey, events, listeners } = loadNativeKey();
  nativeKey({ keyCode: 21, action: 0, name: "KEYCODE_DPAD_LEFT" });
  nativeKey({ keyCode: 96, action: 0, name: "KEYCODE_BUTTON_A" });
  assert.ok(events.some((event) => event.type === "keydown" && event.code === "ArrowLeft"));
  assert.ok(events.some((event) => event.type === "keydown" && event.code === "F1"));
  for (const fn of listeners.blur || []) fn();
  assert.ok(events.some((event) => event.type === "keyup" && event.code === "ArrowLeft"));
  assert.ok(events.some((event) => event.type === "keyup" && event.code === "F1"));
});

