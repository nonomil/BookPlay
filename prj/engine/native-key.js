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
    108: "start",
    109: "select",
  };
  const DEADZONE = 0.08;
  const queue = [];
  const listeners = [];
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
    return (chipHint && pocket) || (pocket && sawKey);
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
    return ev;
  }

  function nativeAxis(raw) {
    const sticks = applyAxis(raw);
    emit("axis", { ...raw, ...sticks });
    return sticks;
  }

  function applyDeviceProfile(next) {
    profile = next || {};
    root.BookPlayDeviceProfile = profile;
    return suggestHandheld(profile, queue[0]);
  }

  root.BookPlayNativeKey = nativeKey;
  root.BookPlayNativeAxis = nativeAxis;
  root.BookPlayApplyDeviceProfile = applyDeviceProfile;
  root.BookPlayNativeKeys = {
    classifyKey,
    formatKey,
    applyAxis,
    suggestHandheld,
    recent() { return queue.slice(); },
    on(fn) { listeners.push(fn); },
  };

  if (profile) applyDeviceProfile(profile);
}(typeof globalThis !== "undefined" ? globalThis : window));
