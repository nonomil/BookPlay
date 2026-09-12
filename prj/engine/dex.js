"use strict";

/* 妖怪图鉴页网关：读 ../data/game/dex.json + localStorage bookplay_dex_v1，
 * 渲染网格卡与详情。纯展示：捕捉/进化的写入在 battle 侧完成。
 * 逻辑复用 BookPlayCollectionCore（completion/isCaught）。 */
(function () {
  const Core = window.BookPlayCollectionCore;
  const KEY_DEX = "bookplay_dex_v1";
  const ELEMENT_ZH = { water: "水", fire: "火", forest: "森", earth: "土", light: "光" };
  const HABITAT_ZH = {
    "flower-fruit-mountain": "花果山", "water-curtain-cave": "水帘洞",
    "three-star-cave": "三星洞", "water-dirty-cave": "水脏洞",
    "dragon-palace": "龙宫", "underworld": "幽冥界", "generic": "各地",
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    grid: $("dex-grid"),
    progress: $("dex-progress"),
    detail: $("dex-detail"),
    toast: $("dex-toast"),
  };

  function collectMastery() {
    const mastered = new Set();
    try {
      const store = JSON.parse(localStorage.getItem("bookplay_adv_vocab_stat") || "{}") || {};
      const visit = (node) => {
        if (!node || typeof node !== "object") return;
        if (Array.isArray(node.mastered_terms)) node.mastered_terms.forEach((t) => t && mastered.add(String(t).toLowerCase()));
        Object.values(node).forEach(visit);
      };
      visit(store);
    } catch (_) {}
    return mastered;
  }

  function readDexState() {
    try {
      return JSON.parse(localStorage.getItem(KEY_DEX) || "{}") || {};
    } catch (_) {
      return {};
    }
  }

  function fetchJSON(url) {
    return fetch(url, { cache: "no-store" }).then((res) => (res.ok ? res.json() : null));
  }

  function spriteSrc(entry) {
    const gif = entry.sprite ? `../assets/game-sprites/${entry.sprite}/${entry.sprite}-south-walk-action.gif` : "";
    return gif;
  }

  function showToast(text) {
    els.toast.textContent = text;
    els.toast.hidden = false;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => { els.toast.hidden = true; }, 1600);
  }

  function renderGrid(dexJson, dexState) {
    els.grid.textContent = "";
    window.__dexAll = Array.isArray(dexJson && dexJson.dex) ? dexJson.dex : [];
    const list = (dexJson && Array.isArray(dexJson.dex) ? dexJson.dex : []);
    list.forEach((entry) => {
      const caught = Core.isCaught(dexState, entry.id);
      const seen = (dexState.seen || []).includes(entry.id);
      const card = document.createElement("button");
      card.type = "button";
      card.className = "dex-card " + (caught ? "is-caught" : seen ? "is-seen" : "is-locked");
      card.tabIndex = 0;
      card.setAttribute("aria-label", `${caught ? entry.nameZh : seen ? "曾见过" : "未解锁"}：${caught || seen ? entry.nameZh : "???"}`);
      const fig = document.createElement("span");
      fig.className = "dex-card-fig";
      const img = document.createElement("img");
      img.src = spriteSrc(entry);
      img.alt = "";
      img.decoding = "async";
      img.loading = "lazy";
      img.addEventListener("error", () => {
        const ph = document.createElement("div");
        ph.className = "battle-sprite-placeholder";
        ph.textContent = caught || seen ? (entry.nameZh || "妖").slice(0, 1) : "?";
        img.replaceWith(ph);
      }, { once: true });
      fig.appendChild(img);
      if (caught) {
        const stars = document.createElement("span");
        stars.className = "dex-card-stars";
        stars.textContent = "⭐".repeat(Math.min(3, Number((dexState.stars || {})[entry.id]) || 1));
        fig.appendChild(stars);
      }
      const element = document.createElement("span");
      element.className = "dex-card-element";
      element.textContent = caught || seen ? (ELEMENT_ZH[entry.element] || entry.element || "") : "?";
      fig.appendChild(element);
      const name = document.createElement("span");
      name.className = "dex-card-name" + (caught || seen ? "" : " dex-card-locked-name");
      name.textContent = caught || seen ? entry.nameZh : "？？？";
      card.append(fig, name);
      card.addEventListener("click", () => openDetail(entry, caught, seen, dexState));
      els.grid.appendChild(card);
    });
  }

  function frameFor(entry, caught, dexState) {
    if (!caught) return "";
    const stars = Number((dexState.stars || {})[entry.id]) || 0;
    if (stars >= 3 || entry.tier >= 3) return "jade";
    if (entry.tier === 2) return "gold";
    if (stars >= 2) return "silver";
    return "bronze";
  }

  function evolutionLine(entry, caught) {
    const evo = entry.evolution;
    if (!evo) return "";
    const all = (window.__dexAll || []).find((x) => x.id === evo.to);
    const toName = (all && all.nameZh) || evo.to;
    const wrap = document.createElement("p");
    wrap.className = "dex-detail-evo";
    wrap.textContent = `进化链：${entry.nameZh} → ${toName}（再掌握 ${evo.requireWords} 词 · 收集 ⭐${evo.requireStars}）`;
    return wrap;
  }

  function evolveCeremony(entry, dexState) {
    const Dex = window.BookPlayCollectionCore;
    const toId = entry.evolution.to;
    const evolved = (window.__dexAll || []).find((x) => x.id === toId);
    if (!evolved) { showToast("进化形态数据缺失"); return; }
    const d = els.detail;
    d.textContent = "";
    d.hidden = false;
    const stage = document.createElement("div");
    stage.className = "dex-ceremony";
    const flash = document.createElement("div");
    flash.className = "dex-ceremony-flash";
    const img = document.createElement("img");
    img.className = "dex-ceremony-img";
    img.src = spriteSrc(entry);
    img.alt = "";
    const text = document.createElement("p");
    text.className = "dex-ceremony-text";
    text.textContent = `${entry.nameZh} 正在进化……`;
    stage.append(flash, img, text);
    d.appendChild(stage);
    window.BookPlayAudio?.sfx("reward");
    window.setTimeout(() => {
      // 登记进化形态（继承星星），保留原形态
      const nextState = Dex.register(dexState, toId, { stars: Math.max(2, Number((dexState.stars || {})[entry.id]) || 0) });
      try { localStorage.setItem(KEY_DEX, JSON.stringify(nextState)); } catch (_) {}
      text.textContent = `进化成了 ${evolved.nameZh}！`;
      img.src = spriteSrc(evolved);
      img.className = "dex-ceremony-img is-evolved";
      window.BookPlayAudio?.sfx("complete");
      const stars = document.createElement("p");
      stars.className = "dex-ceremony-text";
      stars.textContent = "⭐ ⭐ ⭐";
      stage.appendChild(stars);
      const close = document.createElement("button");
      close.type = "button";
      close.className = "dex-detail-close";
      close.tabIndex = 0;
      close.textContent = "太棒了！";
      close.addEventListener("click", () => {
        d.hidden = true;
        boot(); // 重渲网格（新形态点亮）
      });
      d.appendChild(close);
    }, 1600);
  }

  function openDetail(entry, caught, seen, dexState) {
    const d = els.detail;
    d.textContent = "";
    const card = document.createElement("div");
    card.className = "dex-detail-card";
    const frame = frameFor(entry, caught, dexState);
    if (frame) {
      const frameImg = document.createElement("img");
      frameImg.className = "dex-detail-frame";
      frameImg.src = `../assets/game-cards/frame-${frame}.png`;
      frameImg.alt = "";
      frameImg.addEventListener("error", () => frameImg.remove());
      card.appendChild(frameImg);
    }
    const img = document.createElement("img");
    img.src = spriteSrc(entry);
    img.alt = "";
    img.addEventListener("error", () => img.remove());
    const name = document.createElement("h2");
    name.className = "dex-detail-name";
    name.textContent = caught || seen ? entry.nameZh : "？？？";
    const meta = document.createElement("div");
    meta.className = "dex-detail-meta";
    const bits = [];
    if (caught) bits.push("已捕捉 ✓");
    else if (seen) bits.push("曾遇见");
    else bits.push("未解锁");
    bits.push(`属性 ${ELEMENT_ZH[entry.element] || entry.element || "?"}`);
    (entry.habitat || []).slice(0, 2).forEach((h) => bits.push(HABITAT_ZH[h] || h));
    if (caught && (dexState.stars || {})[entry.id]) bits.push(`⭐ ${dexState.stars[entry.id]}`);
    bits.forEach((b) => {
      const span = document.createElement("span");
      span.textContent = b;
      meta.appendChild(span);
    });
    const evo = evolutionLine(entry, caught);
    if (evo) card.appendChild(evo);
    if (caught && entry.evolution) {
      const mastered = collectMastery();
      const gained = (entry.words || []).filter((w) => mastered.has(String(w).toLowerCase())).length;
      const stars = Number((dexState.stars || {})[entry.id]) || 0;
      const ready = gained >= (entry.evolution.requireWords || 0) && stars >= (entry.evolution.requireStars || 0);
      if (ready) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "dex-evolve-btn";
        btn.tabIndex = 0;
        btn.textContent = "✨ 进化！";
        btn.addEventListener("click", () => evolveCeremony(entry, dexState));
        card.appendChild(btn);
      } else {
        const need = document.createElement("p");
        need.className = "dex-detail-evo";
        need.textContent = `进化进度：词 ${Math.min(gained, entry.evolution.requireWords)}/${entry.evolution.requireWords} · ⭐${stars}/${entry.evolution.requireStars}`;
        card.appendChild(need);
      }
    }
    const words = document.createElement("div");
    words.className = "dex-detail-words";
    (entry.words || []).forEach((w) => {
      const span = document.createElement("span");
      span.textContent = w;
      words.appendChild(span);
    });
    const close = document.createElement("button");
    close.type = "button";
    close.className = "dex-detail-close";
    close.tabIndex = 0;
    close.textContent = "关闭";
    close.addEventListener("click", () => { d.hidden = true; });
    card.append(img, name, meta, words, close);
    d.appendChild(card);
    d.hidden = false;
  }

  function boot() {
    Promise.all([
      fetchJSON("../data/game/dex.json"),
      Promise.resolve(readDexState()),
    ]).then(([dexJson, dexState]) => {
      if (!dexJson) {
        els.grid.textContent = "";
        const empty = document.createElement("p");
        empty.textContent = "图鉴数据还没装上，先导入最新数据包。";
        els.grid.appendChild(empty);
        return;
      }
      renderGrid(dexJson, dexState);
      const c = Core.completion(dexJson, dexState);
      els.progress.textContent = `${c.caught} / ${c.total}`;
    });
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && !els.detail.hidden) els.detail.hidden = true;
    });
    els.detail.addEventListener("click", (ev) => {
      if (ev.target === els.detail) els.detail.hidden = true;
    });
  }

  boot();
}());
