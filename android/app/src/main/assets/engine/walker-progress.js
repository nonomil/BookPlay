"use strict";

/* 进度小人组件：走路小人从左到右表示做题进度。
 * WalaWalkerProgress.mount(container, { gif, nameZh, labelEl? })
 *   - 在 container 里渲染小车道（进度条轨道 + 走路 GIF + 计数）；
 *   - labelEl 可选：外部已有进度文案元素（如 lesson 的 #lesson-progress）时
 *     放进小车道，并用 MutationObserver 监听其文字变化自动移动小人；
 *   - 返回 { setProgress(done, total) } 供无外部文案的页面直接驱动。
 * 小人 GIF 常驻走路动画，位置按进度从左到右移动；轨道带已走部分填充。
 */
(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WalaWalkerProgress = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function walkerProgressFactory() {
  function mount(container, options) {
    const opts = options || {};
    if (!container) return null;
    const lane = document.createElement("div");
    lane.className = "walker-lane";
    const path = document.createElement("div");
    path.className = "walker-path";
    const sprite = document.createElement("img");
    sprite.className = "walker-sprite";
    sprite.alt = opts.nameZh ? `${opts.nameZh} 走路小人` : "进度小人";
    if (opts.gif) sprite.src = opts.gif;
    const count = document.createElement("span");
    count.className = "walker-count";
    count.textContent = "";
    lane.append(path, sprite, count);

    let labelEl = opts.labelEl || null;
    let labelOwned = false;
    if (!labelEl) {
      labelEl = document.createElement("span");
      labelEl.className = "walker-count-text";
      labelOwned = true;
      lane.append(labelEl);
    } else {
      lane.append(labelEl);
    }

    container.textContent = "";
    container.append(lane);

    function setProgress(done, total) {
      const t = Math.max(1, Math.round(Number(total) || 1));
      const d = Math.max(0, Math.min(t, Math.round(Number(done) || 0)));
      const ratio = d / t;
      const percent = 4 + ratio * 90; // 4% 起步，96% 封顶，留出小人半宽
      sprite.style.left = `${percent.toFixed(1)}%`;
      lane.style.setProperty("--walker-fill", `${(ratio * 100).toFixed(1)}%`);
      if (labelOwned) count.textContent = `${d} / ${t}`;
    }

    if (labelEl) {
      const observer = new MutationObserver(() => {
        const match = /(\d+)\s*\/\s*(\d+)/.exec(labelEl.textContent || "");
        if (match) setProgress(Number(match[1]), Number(match[2]));
        else if (/已完成|完成/.test(labelEl.textContent || "")) setProgress(1, 1);
      });
      observer.observe(labelEl, { childList: true, characterData: true, subtree: true });
    }

    return { setProgress, lane };
  }

  return { mount };
});
