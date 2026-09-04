"use strict";

const WB_KEY = "bookplay_wordbook";
const PROG_KEY = "bookplay_adv_progress";

const $ = (id) => document.getElementById(id);
const grid = $("grid");
const status = $("status");
const search = $("search");
const panel = $("wordbook-panel");

let catalog = { episodes: [] };
const params = new URLSearchParams(location.search);
const series = params.get("series") === "minecraft" ? "minecraft"
  : params.get("series") === "mikey-jj" ? "mikey-jj"
  : "jttw";
const config = series === "minecraft" ? {
  catalogUrl: "/data/storybooks-minecraft/catalog.json",
  titleZh: "《我的世界》分级读物",
  titleEn: "Minecraft Young Readers",
  subtitle: "跨页画面保留，英文字幕与词义在右侧",
  cover: "../assets/minecraft/escape-from-the-nether/cover.webp",
  unit: "本",
} : series === "mikey-jj" ? {
  catalogUrl: "../data/storybooks-mikey-jj/catalog.json",
  titleZh: "Mikey & JJ 英文冒险",
  titleEn: "Mikey & JJ English Adventures",
  subtitle: "看漫画 · 听原声 · 一句一句学",
  cover: "../assets/mikey-jj/zombie-school-adventure/pages/p01.webp",
  unit: "本",
} : {
  catalogUrl: "/data/storybooks/catalog.json",
  titleZh: "西游记",
  titleEn: "Journey to the West",
  subtitle: "每天一小集，句子开口说",
  cover: "../assets/covers/journey-west-cover.png",
  unit: "集",
};

function progressMap() {
  try { return JSON.parse(localStorage.getItem(PROG_KEY) || "{}"); } catch (_) { return {}; }
}

function wordbook() {
  try { return JSON.parse(localStorage.getItem(WB_KEY) || "[]"); } catch (_) { return []; }
}

function renderWordbook() {
  const items = wordbook();
  if (panel.classList.contains("hidden")) return;
  if (!items.length) {
    panel.innerHTML = "<p>还没有收藏生词。打开一集，点击高亮词即可加入。</p>";
    return;
  }
  panel.innerHTML = `<h3>生词本（${items.length}）</h3><ul>${
    items.map((w) => `<li><b>${w.term}</b> — ${w.zh}</li>`).join("")
  }</ul>`;
}

function render(filter = "") {
  const q = filter.trim().toLowerCase();
  const prog = progressMap();
  const items = catalog.episodes.filter((ep) => {
    const itemId = ep.book || ep.episode;
    const hay = `${itemId} ${ep.title.en} ${ep.title.zh}`.toLowerCase();
    return !q || hay.includes(q);
  });
  grid.innerHTML = items.map((ep) => {
    const itemId = ep.book || ep.episode;
    const progressKey = series === "minecraft" ? `minecraft:${itemId}` : series === "mikey-jj" ? `mikey-jj:${itemId}` : itemId;
    const p = prog[progressKey] || {};
    const seen = p.page || p.node || 0;
    const done = p.done ? "已学完" : (seen ? `读到第 ${seen} 页` : "未开始");
    const href = series === "minecraft"
      ? `storybook.html?series=minecraft&book=${itemId}&ui=unified-v3`
      : series === "mikey-jj"
        ? `storybook.html?series=mikey-jj&book=${itemId}&ui=unified-v3`
        : `wala.html?ep=${itemId}`;
    const listenHref = series === "jttw"
      ? `wala.html?ep=${itemId}&mode=listen&loops=2&visual=audio&subtitle=enzh`
      : "";
    return `<article class="card">
      <a class="card-main" href="${href}">
        <img src="../${ep.cover || ""}" alt="">
        <div class="meta">
          <div class="ep">第 ${itemId} ${config.unit}</div>
          <div class="name">${ep.title.en || ""}</div>
          ${ep.title.zh ? `<div class="name-zh">${ep.title.zh}</div>` : ""}
          <div class="prog">${done}</div>
        </div>
      </a>
      ${listenHref ? `<div class="card-actions"><a class="card-listen" href="${listenHref}" title="隐藏画面，只听本集字幕与声音">🎧 磨耳朵</a></div>` : ""}
    </article>`;
  }).join("");
  grid.querySelectorAll(".card-listen").forEach((link) => {
    link.addEventListener("click", (event) => event.stopPropagation());
  });
  status.textContent = `共 ${catalog.count || items.length} ${config.unit}，当前显示 ${items.length} ${config.unit}`;
}

async function main() {
  document.title = `豆豆龙英语 · ${config.titleZh}`;
  $("series-title-zh").textContent = config.titleZh;
  $("series-title-en").textContent = config.titleEn;
  $("series-subtitle").textContent = config.subtitle;
  $("series-cover").src = config.cover;
  search.placeholder = `搜索${config.unit}数或标题…`;
  if (series === "minecraft") {
    $("reader-link").href = "storybook.html?series=minecraft&book=1&ui=unified-v3";
    $("dialogue-link").classList.add("hidden");
    $("collection-link").href = "collection-assets-preview.html?series=minecraft";
    $("collection-link").hidden = false;
  } else if (series === "mikey-jj") {
    $("reader-link").href = "storybook.html?series=mikey-jj&book=1&ui=unified-v3";
    $("dialogue-link").classList.add("hidden");
    $("collection-link").href = "collection-assets-preview.html?series=mikey-jj";
    $("collection-link").hidden = false;
  }
  try {
    const r = await fetch(config.catalogUrl, { cache: "no-store" });
    if (!r.ok) {
      status.textContent = `目录加载失败（${r.status}）。请用 启动服务.bat 打开，不要用 python -m http.server。`;
      return;
    }
    catalog = await r.json();
    render();
  } catch (err) {
    status.textContent = "目录连不上。请关掉多余的 8810 窗口，再双击 启动服务.bat。";
    return;
  }
  search.addEventListener("input", () => render(search.value));
  $("btn-wordbook").addEventListener("click", () => {
    panel.classList.toggle("hidden");
    renderWordbook();
  });
}

main();
