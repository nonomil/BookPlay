"use strict";

/* 看图复述 · 纯逻辑核心（P3 OUTPUT 环节，吸收初章书 Demo 的「四图排序 + 看图说故事」）。
 * 每集的 4 张插画按「首次出现顺序」就是故事顺序——运行时从 dialogue_stories 派生，
 * 不新增任何逐集手写内容。 */
(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BookPlayRetellCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const MAX_SCENES = 4;
  const MIN_SCENES = 2;

  function isListenNode(node) {
    return Boolean(node && node.type === "narration" && String(node.text_en || "").trim() && node.illustration);
  }

  /* 从本集节点派生复述场景：唯一插画按首次出现排序，
   * 每个场景带上代表句（首个节点）与可听提示句（最长一句，音频按句索引）。 */
  function buildRetellScenes(nodes, options) {
    const opts = options || {};
    const limit = Number.isFinite(opts.limit) && opts.limit > 0 ? opts.limit : MAX_SCENES;
    const list = Array.isArray(nodes) ? nodes : [];
    const byIllust = new Map();
    for (const node of list) {
      if (!isListenNode(node)) continue;
      const illust = String(node.illustration);
      if (!byIllust.has(illust)) byIllust.set(illust, []);
      byIllust.get(illust).push(node);
    }
    const scenes = [];
    for (const [illustration, group] of byIllust) {
      const ordered = group.slice().sort((a, b) => String(a.node_id).localeCompare(String(b.node_id)));
      const hint = ordered.reduce((best, node) => (
        String(node.text_en || "").length > String(best.text_en || "").length ? node : best
      ), ordered[0]);
      scenes.push({
        illustration,
        nodeIds: ordered.map((node) => String(node.node_id)),
        hintEn: String(hint.text_en || ""),
        hintZh: String(hint.text_zh || ""),
        hintAudio: opts.sentEnIndex ? opts.sentEnIndex[hint.text_en] || null : null,
      });
      if (scenes.length >= limit) break;
    }
    return scenes;
  }

  function retellable(scenes) {
    return Array.isArray(scenes) && scenes.length >= MIN_SCENES;
  }

  /* 确定性洗牌：rng 缺省用 Math.random（孩子看到随机），测试可注入固定 rng。 */
  function shuffledOrder(count, rng) {
    const random = typeof rng === "function" ? rng : Math.random;
    const order = Array.from({ length: count }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    // 不给「看起来已排好」的初始局（≥3 张时才可能出现）
    if (count >= 3 && order.every((value, index) => value === index)) {
      [order[0], order[1]] = [order[1], order[0]];
    }
    return order;
  }

  /* 孩子把图点进槽位后判序：返回第一个放错的位置（全对为 -1）。
   * 只看 placement[slot] = 场景序号。 */
  function checkOrder(placement) {
    const list = Array.isArray(placement) ? placement : [];
    for (let slot = 0; slot < list.length; slot += 1) {
      if (list[slot] !== slot) return slot;
    }
    return list.length ? -1 : 0;
  }

  function retellCoverage(meta, scenes) {
    const done = Array.isArray(scenes) ? scenes.reduce((sum, _, index) => (
      sum + (meta && meta.takes && meta.takes[String(index)] ? 1 : 0)
    ), 0) : 0;
    return { done, total: Array.isArray(scenes) ? scenes.length : 0, complete: Array.isArray(scenes) && scenes.length > 0 && done === scenes.length };
  }

  return { MAX_SCENES, MIN_SCENES, isListenNode, buildRetellScenes, retellable, shuffledOrder, checkOrder, retellCoverage };
});
