"use strict";

/* 降妖记战斗反馈演出（事件消费器，零耦合）：
 * 监听 window "game-fx" CustomEvent（detail: {kind, x, y, term, zh, combo}），
 * 渲染浮字/粒子/红晕等演出；本文件被移除后游戏照常运行（只是没有演出）。
 * 粒子上限 40；prefers-reduced-motion 时全部降级为静态文字。
 */
(function () {
  let particles = 0;

  function reducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function spawnStar(x, y) {
    const layer = document.getElementById("game-particles");
    if (!layer || particles >= 40) return;
    particles += 1;
    const star = document.createElement("span");
    star.className = "game-star";
    star.textContent = "⭐";
    star.style.left = x + "px";
    star.style.top = y + "px";
    star.style.setProperty("--dx", (Math.random() - 0.5) * 130 + "px");
    star.style.setProperty("--dy", -40 - Math.random() * 70 + "px");
    layer.appendChild(star);
    window.setTimeout(() => { particles -= 1; star.remove(); }, 800);
  }

  function floatText(x, y, text, cls) {
    // 视口坐标 + body 层：不受世界 transform 影响
    const el = document.createElement("span");
    el.className = "game-float " + (cls || "");
    el.textContent = text;
    el.style.left = x + "px";
    el.style.top = y + "px";
    document.body.appendChild(el);
    window.setTimeout(() => el.remove(), 1100);
  }

  function vignette() {
    const root = document.getElementById("game-root");
    if (!root || root.querySelector(".game-vignette")) return;
    const v = document.createElement("div");
    v.className = "game-vignette";
    root.appendChild(v);
    window.setTimeout(() => v.remove(), 320);
  }

  document.addEventListener("game-fx", (ev) => {
    const d = ev.detail || {};
    const layer = document.getElementById("game-particles");
    const x = d.x != null ? d.x : window.innerWidth / 2;
    const y = d.y != null ? d.y : window.innerHeight / 2;
    if (d.kind === "hit") {
      floatText(x, y - 30, `${d.term || ""} · ${d.zh || ""}`, "is-good");
      if (!reducedMotion()) { spawnStar(x, y); spawnStar(x - 20, y - 10); spawnStar(x + 20, y - 10); }
      window.BookPlayAudio?.sfx("correct");
    } else if (d.kind === "miss") {
      floatText(x, y - 30, "？", "is-miss");
      window.BookPlayAudio?.sfx("retry");
    } else if (d.kind === "combo") {
      floatText(x, y - 60, `连击 ×${d.combo}！`, "is-combo");
      window.BookPlayAudio?.sfx("reward");
    } else if (d.kind === "hero-hurt") {
      vignette();
      window.BookPlayAudio?.sfx("shield");
    } else if (d.kind === "pickup") {
      floatText(x, y - 20, "🎐 " + (d.zh || "词球"), "is-good");
    }
  });

  window.BookPlayGameFeedback = { spawnStar, floatText, vignette };
}());
