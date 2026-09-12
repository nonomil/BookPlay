import test from "node:test";
import assert from "node:assert/strict";
import input from "./game-input.js";

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) {
      const list = listeners.get(type) || [];
      list.push(fn);
      listeners.set(type, list);
    },
    removeEventListener(type, fn) {
      const list = listeners.get(type) || [];
      listeners.set(type, list.filter((item) => item !== fn));
    },
    dispatch(type, event = {}) {
      (listeners.get(type) || []).slice().forEach((fn) => fn({ type, ...event }));
    },
  };
}

function fakeJoystick() {
  const target = eventTarget();
  return Object.assign(target, {
    captured: [],
    released: [],
    setPointerCapture(pointerId) { this.captured.push(pointerId); },
    releasePointerCapture(pointerId) { this.released.push(pointerId); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; },
  });
}

function withInputDom(run) {
  const previousDocument = global.document;
  const previousWindow = global.window;
  const document = eventTarget();
  const window = eventTarget();
  document.hidden = false;
  global.document = document;
  global.window = window;
  try {
    return run({ document, window });
  } finally {
    global.document = previousDocument;
    global.window = previousWindow;
  }
}

test("game-input：持球跟打时字母键不移动，交给 onType", () => withInputDom(({ document }) => {
  const typed = [];
  const intents = [];
  input.create({
    typingMode: () => true,
    onType: (key) => typed.push(key),
    onIntent: (x, y) => intents.push([x, y]),
  });
  document.dispatch("keydown", { key: "j", preventDefault() {} });
  document.dispatch("keydown", { key: "Backspace", preventDefault() {} });
  assert.deepEqual(typed, ["j", "Backspace"]);
  assert.equal(intents.length, 0);
}));

test("game-input：摇杆按下当帧产出幅度并只接受活动 pointer", () => withInputDom(({ document }) => {
  const joystick = fakeJoystick();
  const intents = [];
  input.create({ joystick, onIntent: (x, y) => intents.push([x, y]) });
  joystick.dispatch("pointerdown", { pointerId: 11, clientX: 100, clientY: 50 });
  assert.ok(intents.at(-1)[0] > 0, "pointerdown 应立即开始向右移动");
  joystick.dispatch("pointermove", { pointerId: 12, clientX: 0, clientY: 50 });
  assert.ok(intents.at(-1)[0] > 0, "第二根手指不得劫持摇杆");
  joystick.dispatch("pointerup", { pointerId: 11 });
  assert.deepEqual(intents.at(-1), [0, 0], "释放活动 pointer 应停止移动");
  assert.deepEqual(joystick.captured, [11]);
  void document;
}));

test("game-input：blur/pagehide/hidden 清除活动 pointer，恢复需重新按下", () => withInputDom(({ document, window }) => {
  const joystick = fakeJoystick();
  const intents = [];
  input.create({ joystick, onIntent: (x, y) => intents.push([x, y]) });
  joystick.dispatch("pointerdown", { pointerId: 3, clientX: 100, clientY: 50 });
  assert.ok(intents.at(-1)[0] > 0);

  window.dispatch("blur");
  assert.deepEqual(intents.at(-1), [0, 0], "blur 应立即清零");
  joystick.dispatch("pointermove", { pointerId: 3, clientX: 0, clientY: 50 });
  assert.deepEqual(intents.at(-1), [0, 0], "blur 后旧 pointer 不得恢复移动");

  joystick.dispatch("pointerdown", { pointerId: 4, clientX: 100, clientY: 50 });
  document.hidden = true;
  document.dispatch("visibilitychange");
  assert.deepEqual(intents.at(-1), [0, 0], "隐藏页面应立即清零");
  joystick.dispatch("pointermove", { pointerId: 4, clientX: 0, clientY: 50 });
  assert.deepEqual(intents.at(-1), [0, 0], "隐藏后旧 pointer 不得恢复移动");

  document.hidden = false;
  joystick.dispatch("pointerdown", { pointerId: 5, clientX: 100, clientY: 50 });
  window.dispatch("pagehide");
  assert.deepEqual(intents.at(-1), [0, 0], "pagehide 应清除活动 pointer");
}));

test("game-input：弹层打开期间清空已按住的方向，关闭后不会自动续走", () => withInputDom(({ document }) => {
  const joystick = fakeJoystick();
  const intents = [];
  let isBlocked = false;
  const api = input.create({
    joystick,
    blocked: () => isBlocked,
    onIntent: (x, y) => intents.push([x, y]),
  });
  document.dispatch("keydown", { key: "ArrowRight", preventDefault() {} });
  assert.deepEqual(api.getIntent().held, ["ArrowRight"]);
  isBlocked = true;
  document.dispatch("keydown", { key: "ArrowUp", preventDefault() {} });
  assert.deepEqual(api.getIntent().held, [], "blocked 时旧方向也应被清空");
  isBlocked = false;
  document.dispatch("keyup", { key: "ArrowRight" });
  assert.deepEqual(intents.at(-1), [0, 0]);
}));
