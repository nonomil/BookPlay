"use strict";

/* 降妖记输入适配器：键盘 + 虚拟摇杆统一产出归一化移动意图（幅值 ≤1，摇杆带死区）。
 * - pointer 唯一归属：同一时刻只认一个 pointerId，up/cancel/lostpointercapture 全清理；
 * - 弹层分权：blocked() 为真（对话/暂停/门卡）时意图清零、动作不上报，焦点/点击不受影响；
 * - 与 tv-remote 兼容：tv-remote 负责焦点导航与 OK/返回语义，方向键移动由本适配器处理。
 * 纯行为无状态副作用；死区公式与 game-core.applyDeadZone 一致。
 */
(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BookPlayGameInput = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const MOVE_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d"];

  function applyDeadZone(value, dead) {
    const v = Number(value) || 0;
    const d = Math.max(0, Math.min(0.9, Number(dead) || 0));
    const a = Math.abs(v);
    if (a <= d) return 0;
    return (v < 0 ? -1 : 1) * ((a - d) / (1 - d));
  }

  function create(options) {
    const opts = options || {};
    const deadZone = Math.max(0, Math.min(0.9, opts.deadZone != null ? Number(opts.deadZone) : 0.14));
    const blocked = opts.blocked || function () { return false; };
    const onIntent = opts.onIntent || function () {};
    const onAction = opts.onAction || function () {};
    const onPause = opts.onPause || function () {};
    const onType = opts.onType || function () {};
    const typingMode = opts.typingMode || function () { return false; };
    const joystick = opts.joystick || null;
    const stick = opts.stick || null;
    const hostWindow = (typeof globalThis !== "undefined" && globalThis.window) || null;

    const held = new Set();
    let activePointer = null;
    let destroyed = false;

    function emitHeld() {
      if (destroyed) return;
      if (blocked()) {
        onIntent(0, 0);
        return;
      }
      let ix = 0;
      let iy = 0;
      held.forEach((key) => {
        if (key === "ArrowLeft" || key === "a") ix -= 1;
        if (key === "ArrowRight" || key === "d") ix += 1;
        if (key === "ArrowUp" || key === "w") iy -= 1;
        if (key === "ArrowDown" || key === "s") iy += 1;
      });
      onIntent(ix, iy);
    }

    function emitAnalog(ix, iy) {
      if (destroyed) return;
      if (blocked()) {
        onIntent(0, 0);
        return;
      }
      const mag = Math.hypot(ix, iy);
      if (!mag) {
        onIntent(0, 0);
        return;
      }
      const scale = applyDeadZone(mag, deadZone) / mag;
      onIntent(ix * scale, iy * scale);
    }

    function onKeyDown(ev) {
      if (destroyed) return;
      if (ev.key === "Escape") {
        onPause();
        return;
      }
      if (typingMode() && !blocked() && (ev.key === "Backspace" || (ev.key.length === 1 && /[a-zA-Z]/.test(ev.key)))) {
        ev.preventDefault();
        onType(ev.key);
        return;
      }
      if (ev.key === "Enter" || ev.key === " ") {
        if (blocked()) return;
        ev.preventDefault();
        onAction();
        return;
      }
      if (MOVE_KEYS.includes(ev.key)) {
        ev.preventDefault();
        // A key can remain held when a dialogue/pause layer opens (for
        // example, the user taps an NPC while still holding ArrowRight).
        // Clear both keyboard and joystick ownership immediately instead of
        // merely emitting a zero intent; otherwise closing the layer resumes
        // the stale direction without a new gesture.
        if (blocked()) {
          clearInput();
          return;
        }
        held.add(ev.key);
        emitHeld();
      }
    }

    function onKeyUp(ev) {
      if (destroyed) return;
      if (held.delete(ev.key)) emitHeld();
    }

    function setStick(x, y) {
      if (stick) stick.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
    }

    function onJoyDown(ev) {
      if (destroyed || activePointer != null) return;
      activePointer = ev.pointerId;
      if (joystick.setPointerCapture) {
        try { joystick.setPointerCapture(ev.pointerId); } catch (_) { /* 已捕获则忽略 */ }
      }
      onJoyMove(ev);
    }

    function onJoyMove(ev) {
      if (destroyed || activePointer == null || ev.pointerId !== activePointer) return;
      const rect = joystick.getBoundingClientRect();
      let dx = ev.clientX - (rect.left + rect.width / 2);
      let dy = ev.clientY - (rect.top + rect.height / 2);
      const dist = Math.hypot(dx, dy);
      const max = Math.max(1, rect.width / 2 - 10);
      if (dist > max) {
        dx = (dx / dist) * max;
        dy = (dy / dist) * max;
      }
      setStick(dx, dy);
      emitAnalog(dx / max, dy / max);
    }

    function onJoyRelease(ev) {
      if (destroyed || activePointer == null) return;
      if (ev.type !== "lostpointercapture" && ev.pointerId !== activePointer) return;
      clearInput();
    }

    function clearInput() {
      const pointerId = activePointer;
      activePointer = null;
      held.clear();
      if (joystick && pointerId != null && joystick.releasePointerCapture) {
        try { joystick.releasePointerCapture(pointerId); } catch (_) { /* 已失去捕获则忽略 */ }
      }
      setStick(0, 0);
      emitAnalog(0, 0);
    }

    function onWindowReset() {
      clearInput();
    }

    function onVisibilityChange() {
      if (document.hidden) clearInput();
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    if (joystick) {
      joystick.addEventListener("pointerdown", onJoyDown);
      joystick.addEventListener("pointermove", onJoyMove);
      joystick.addEventListener("pointerup", onJoyRelease);
      joystick.addEventListener("pointercancel", onJoyRelease);
      joystick.addEventListener("lostpointercapture", onJoyRelease);
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    if (hostWindow) {
      hostWindow.addEventListener("blur", onWindowReset);
      hostWindow.addEventListener("pagehide", onWindowReset);
    }

    return {
      getIntent: () => ({ x: 0, y: 0, held: Array.from(held) }),
      setBlocked: (b) => {
        if (b) {
          clearInput();
        }
      },
      destroy: () => {
        clearInput();
        destroyed = true;
        document.removeEventListener("keydown", onKeyDown);
        document.removeEventListener("keyup", onKeyUp);
        document.removeEventListener("visibilitychange", onVisibilityChange);
        if (joystick) {
          joystick.removeEventListener("pointerdown", onJoyDown);
          joystick.removeEventListener("pointermove", onJoyMove);
          joystick.removeEventListener("pointerup", onJoyRelease);
          joystick.removeEventListener("pointercancel", onJoyRelease);
          joystick.removeEventListener("lostpointercapture", onJoyRelease);
        }
        if (hostWindow) {
          hostWindow.removeEventListener("blur", onWindowReset);
          hostWindow.removeEventListener("pagehide", onWindowReset);
        }
      },
    };
  }

  return { create, applyDeadZone, MOVE_KEYS };
});
