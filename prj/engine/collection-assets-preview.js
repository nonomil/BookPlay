(function () {
  "use strict";

  const params = new URLSearchParams(location.search);
  const seriesId = params.get("series") === "minecraft" ? "minecraft" : "mikey-jj";
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
  const assetUrl = (value) => value ? `../${String(value).replace(/^\.\//, "")}` : "";
  const fallback = (glyph) => `<span aria-hidden="true" style="font-size:2.5rem">${esc(glyph || "✦")}</span>`;

  function image(value, glyph) {
    const src = assetUrl(value);
    return src ? `<img src="${esc(src)}" alt="" loading="lazy" onerror="this.hidden=true">` : fallback(glyph);
  }

  function actionCards(character) {
    return Object.entries(character.actions || {}).map(([action, path]) => `<div class="action-cell">${image(path, "🙂")}<span>${esc(action)}</span></div>`).join("");
  }

  function renderAssets(target, items, kind) {
    const node = $(target);
    if (!items.length) { node.innerHTML = '<p class="empty-note">这一栏会在对应书目证据完成后开放。</p>'; return; }
    node.innerHTML = items.map((item) => `<article class="asset-card"><div class="asset-art">${image(item.asset, item.glyph)}</div><div class="asset-copy"><h3>${esc(item.title_zh || item.name_zh || item.id)}</h3><small lang="en">${esc(item.title_en || item.name_en || "Story keepsake")}</small>${kind === "badge" ? `<small>${esc(item.condition?.type === "complete" ? "系列完成" : item.condition?.type === "collection" ? "完成主题收集" : "完成首集")}</small>` : ""}</div></article>`).join("");
  }

  async function main() {
    const [collectionsResponse, rewardsResponse] = await Promise.all([
      fetch("../data/storybook-collections/catalog.json", { cache: "no-store" }),
      fetch("../data/rewards/storybooks.json", { cache: "no-store" }),
    ]);
    if (!collectionsResponse.ok || !rewardsResponse.ok) throw new Error("collection data unavailable");
    const collections = await collectionsResponse.json();
    const rewards = await rewardsResponse.json();
    const series = collections.series?.[seriesId] || {};
    const reward = rewards.storybooks?.[seriesId] || {};
    $("series-title").textContent = series.title_zh || "伙伴与收藏";
    $("series-subtitle").textContent = `${series.title_en || "Story companions"} · 角色、贴纸、勋章和房间道具`;
    $("back-link").href = `shelf.html?series=${encodeURIComponent(seriesId)}`;
    $("characters").innerHTML = (series.characters || []).map((character) => `<article class="character-card"><h3>${esc(character.name_zh || character.name_en || character.id)}</h3><span class="character-role">${esc(character.role_zh || "故事伙伴")}</span><div class="action-grid">${actionCards(character)}</div></article>`).join("") || '<p class="empty-note">暂无角色资产。</p>';
    const motifs = (reward.sticker_themes || []).flatMap((theme) => theme.motifs || []);
    renderAssets("stickers", motifs, "sticker");
    renderAssets("badges", reward.badges || series.badges || [], "badge");
    const items = Object.values(reward.episodes || {}).flatMap((episode) => episode.items || []);
    renderAssets("items", items, "item");
    $("status").textContent = "素材预览 · 图片只负责视觉，名称和说明由页面文字渲染";
  }

  main().catch(() => { $("status").textContent = "收藏目录暂时无法加载，请使用 启动服务.bat 打开。"; });
}());
