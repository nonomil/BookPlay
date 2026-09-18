/* Native handheld keys: Android shell injects keyCode + stick axes. */
(function (root) {
  "use strict";

  const KEY_ROLES = {
    19: "up",
    20: "down",
    21: "left",
    22: "right",
    96: "A",
    97: "B",
    99: "X",
    100: "Y",
    102: "L1",
    103: "R1",
    104: "L2",
    105: "R2",
    108: "start",
    109: "select",
  };
  const ROLE_KEYS = {
    up: { key: "ArrowUp", code: "ArrowUp" },
    down: { key: "ArrowDown", code: "ArrowDown" },
    left: { key: "ArrowLeft", code: "ArrowLeft" },
    right: { key: "ArrowRight", code: "ArrowRight" },
    A: { key: "F1", code: "F1" },
    B: { key: "F2", code: "F2" },
    X: { key: "F3", code: "F3" },
    Y: { key: "F4", code: "F4" },
    L1: { key: "F5", code: "F5" },
    R1: { key: "F6", code: "F6" },
    L2: { key: "F7", code: "F7" },
    R2: { key: "F8", code: "F8" },
    select: { key: "F9", code: "F9" },
    start: { key: "F10", code: "F10" },
  };
  const AXIS_KEYS = {
    KeyW: { key: "w", code: "KeyW", on: function (stick) { return stick.y < -0.45; } },
    KeyS: { key: "s", code: "KeyS", on: function (stick) { return stick.y > 0.45; } },
    KeyA: { key: "a", code: "KeyA", on: function (stick) { return stick.x < -0.45; } },
    KeyD: { key: "d", code: "KeyD", on: function (stick) { return stick.x > 0.45; } },
  };
  const DEADZONE = 0.08;
  const DEDUP_MS = 80;
  const queue = [];
  const listeners = [];
  const trustedAt = Object.create(null);
  const axisHeld = Object.create(null);
  const roleHeld = Object.create(null);
  let profile = root.BookPlayDeviceProfile || null;

  function deadzone(value) {
    const number = Number(value) || 0;
    return Math.abs(number) < DEADZONE ? 0 : number;
  }

  function normalize(raw) {
    if (raw == null) return null;
    if (typeof raw === "number") {
      return { keyCode: raw, scanCode: 0, action: 0, repeat: 0, source: 0, name: "" };
    }
    return {
      keyCode: Number(raw.keyCode) || 0,
      scanCode: Number(raw.scanCode) || 0,
      action: Number(raw.action) || 0,
      repeat: Number(raw.repeat) || 0,
      source: Number(raw.source) || 0,
      name: String(raw.name || ""),
    };
  }

  function classifyKey(raw) {
    const ev = normalize(raw) || { keyCode: 0 };
    return {
      role: KEY_ROLES[ev.keyCode] || "unknown",
      keyCode: ev.keyCode,
      scanCode: ev.scanCode,
    };
  }

  function formatKey(raw) {
    const ev = normalize(raw) || { keyCode: 0, scanCode: 0, action: 0, name: "" };
    const phase = ev.action === 1 ? "up" : "down";
    const role = KEY_ROLES[ev.keyCode];
    const label = role ? ` ${role}` : "";
    return `${phase} keyCode=${ev.keyCode} scanCode=${ev.scanCode}${label} ${ev.name}`.trim();
  }

  function applyAxis(raw) {
    const src = raw || {};
    return {
      left: { x: deadzone(src.lx), y: deadzone(src.ly) },
      right: { x: deadzone(src.rx), y: deadzone(src.ry) },
    };
  }

  function pocketViewport() {
    const width = Number(root.innerWidth) || 0;
    const height = Number(root.innerHeight) || 0;
    if (!width || !height) return false;
    return Math.min(width, height) <= 800 && Math.max(width, height) <= 960;
  }

  function suggestHandheld(nextProfile, lastKey) {
    const info = nextProfile || profile || {};
    const hardware = String(info.hardware || "").toLowerCase();
    const board = String(info.board || "").toLowerCase();
    const width = Number(info.widthPx) || 0;
    const height = Number(info.heightPx) || 0;
    const shortSide = Math.min(width, height) || 0;
    const chipHint = /rk3566/.test(hardware + " " + board);
    const pocket = shortSide > 0 && shortSide <= 800;
    const sawKey = Boolean(lastKey && (lastKey.keyCode || lastKey.scanCode));
    return (chipHint && pocket) || (pocket && sawKey) || pocketViewport();
  }

  function markHandheld(on) {
    const html = root.document && root.document.documentElement;
    if (!html || typeof html.setAttribute !== "function") return;
    if (on) html.setAttribute("data-handheld", "1");
    else html.removeAttribute("data-handheld");
  }

  function recentlyTrusted(code) {
    const at = trustedAt[code];
    return Boolean(at && Date.now() - at < DEDUP_MS);
  }

  function fireKey(mapped, down, force) {
    if (!mapped || typeof KeyboardEvent !== "function" || !root.document || typeof root.document.dispatchEvent !== "function") {
      return false;
    }
    if (!force && recentlyTrusted(mapped.code)) return false;
    const event = new KeyboardEvent(down ? "keydown" : "keyup", {
      key: mapped.key,
      code: mapped.code,
      bubbles: true,
      cancelable: true,
    });
    try {
      Object.defineProperty(event, "x35sTest", { value: true });
    } catch (_) {
      event.x35sTest = true;
    }
    root.document.dispatchEvent(event);
    return true;
  }

  function emit(kind, detail) {
    queue.unshift(detail);
    if (queue.length > 40) queue.length = 40;
    for (const fn of listeners) fn(kind, detail);
    if (root.document && typeof root.document.dispatchEvent === "function") {
      root.document.dispatchEvent(new CustomEvent("bookplay-native-key", { detail: { kind, ...detail } }));
    }
  }

  function nativeKey(raw) {
    const ev = normalize(raw);
    if (!ev) return null;
    emit("key", ev);
    const role = KEY_ROLES[ev.keyCode];
    if (role) {
      const down = ev.action !== 1;
      if (down) roleHeld[role] = true;
      else delete roleHeld[role];
      fireKey(ROLE_KEYS[role], down);
    }
    markHandheld(suggestHandheld(profile, ev));
    return ev;
  }

  function nativeAxis(raw) {
    const sticks = applyAxis(raw);
    emit("axis", { ...raw, ...sticks });
    Object.keys(AXIS_KEYS).forEach((code) => {
      const mapped = AXIS_KEYS[code];
      const want = mapped.on(sticks.left);
      if (want === Boolean(axisHeld[code])) return;
      axisHeld[code] = want;
      fireKey(mapped, want);
    });
    return sticks;
  }

  function releaseHeld() {
    Object.keys(AXIS_KEYS).forEach((code) => {
      if (!axisHeld[code]) return;
      axisHeld[code] = false;
      fireKey(AXIS_KEYS[code], false, true);
    });
    Object.keys(roleHeld).forEach((role) => {
      if (!roleHeld[role]) return;
      delete roleHeld[role];
      fireKey(ROLE_KEYS[role], false, true);
    });
  }

  function applyDeviceProfile(next) {
    profile = next || {};
    root.BookPlayDeviceProfile = profile;
    const handheld = suggestHandheld(profile, queue[0]);
    markHandheld(handheld);
    return handheld;
  }

  root.BookPlayNativeKey = nativeKey;
  root.BookPlayNativeAxis = nativeAxis;
  root.BookPlayApplyDeviceProfile = applyDeviceProfile;
  root.BookPlayNativeKeys = {
    classifyKey,
    formatKey,
    applyAxis,
    suggestHandheld,
    roleKeys: ROLE_KEYS,
    release: releaseHeld,
    recent() { return queue.slice(); },
    on(fn) { listeners.push(fn); },
  };

  if (root.addEventListener) {
    root.addEventListener("keydown", function (event) {
      if (event && event.isTrusted && event.code) trustedAt[event.code] = Date.now();
    }, true);
    root.addEventListener("blur", releaseHeld);
    root.addEventListener("pagehide", releaseHeld);
  }
  if (root.document && typeof root.document.addEventListener === "function") {
    root.document.addEventListener("visibilitychange", function () {
      if (root.document.hidden) releaseHeld();
    });
  }

  if (profile) applyDeviceProfile(profile);
  else if (pocketViewport()) markHandheld(true);
})(typeof window !== "undefined" ? window : globalThis);
