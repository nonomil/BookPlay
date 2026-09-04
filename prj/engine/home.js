"use strict";

const WB_KEY = "bookplay_wordbook";
const PROG_KEY = "bookplay_adv_progress";

const $ = (id) => document.getElementById(id);
const grid = $("grid");
const status = $("status");
const search = $("search");
const panel = $("wordbook-panel");

let catalog = { episodes: [] };

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
    const hay = `${ep.episode} ${ep.title.en} ${ep.title.zh}`.toLowerCase();
    return !q || hay.includes(q);
  });
  grid.innerHTML = items.map((ep) => {
    const p = prog[ep.episode] || {};
    const seen = p.node || 0;
    const done = p.done ? "已学完" : (seen ? `冒险到第 ${seen} 句` : "未开始");
    const listenHref = `wala.html?ep=${ep.episode}&mode=listen&loops=2&visual=audio&subtitle=enzh`;
    return `<article class="card">
      <a class="card-main" href="wala.html?ep=${ep.episode}">
        <img src="../${ep.cover || ""}" alt="">
        <div class="meta">
          <div class="ep">第 ${ep.episode} 集</div>
          <div class="name">${ep.title.en}</div>
          <div class="prog">${done}</div>
        </div>
      </a>
      <div class="card-actions"><a class="card-listen" href="${listenHref}" title="隐藏画面，只听本集字幕与声音">🎧 磨耳朵</a></div>
    </article>`;
  }).join("");
  grid.querySelectorAll(".card-listen").forEach((link) => {
    link.addEventListener("click", (event) => event.stopPropagation());
  });
  status.textContent = `共 ${catalog.count || items.length} 集，当前显示 ${items.length} 集`;
}

async function main() {
  const r = await fetch("../data/storybooks/catalog.json", { cache: "no-store" });
  if (!r.ok) {
    status.textContent = "还没有目录。请先运行 python tools/pipeline_lf_episode.py --all";
    return;
  }
  catalog = await r.json();
  render();
  search.addEventListener("input", () => render(search.value));
  $("btn-wordbook").addEventListener("click", () => {
    panel.classList.toggle("hidden");
    renderWordbook();
  });
}

main();
