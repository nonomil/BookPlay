"use strict";

/* 家长报告页：聚合本机数据回答家长四问——走了哪条路、卡在哪、学得怎样、下一步练什么。
 * 只读 localStorage（bookplay_* 键），无网络请求、无判分；渲染失败静默保留空态。 */
(function parentReport() {
  const Core = window.BookPlayStepLogCore;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s)
    .replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || fallback);
      return value && typeof value === "object" ? value : {};
    } catch (_) {
      return {};
    }
  }

  function readLog() {
    try {
      const value = JSON.parse(localStorage.getItem(Core.KEY) || "[]");
      return Array.isArray(value) ? value : [];
    } catch (_) {
      return [];
    }
  }

  function renderOverview(summary, progress) {
    const eps = Object.keys(progress)
      .map((key) => ({ ep: Number.parseInt(key, 10) || 0, at: progress[key].at || 0, done: Boolean(progress[key].done) }))
      .filter((item) => item.ep > 0);
    const maxEp = eps.reduce((acc, item) => Math.max(acc, item.ep), 0);
    const doneCount = eps.filter((item) => item.done).length;
    $("report-overview").innerHTML = `
      <div><b>${summary.activeDays.length}</b><span>本周活跃天数</span></div>
      <div><b>${maxEp ? `第 ${maxEp} 集` : "—"}</b><span>最近学到的位置</span></div>
      <div><b>${doneCount || "—"}</b><span>累计完成集数</span></div>`;
  }

  function stepChip(step, slot) {
    const label = `${Core.STEP_ICONS[step] || ""}${Core.STEP_LABELS[step] || step}`;
    if (!slot) return "";
    if (slot.finish > 0) {
      let extra = "";
      if (step === "check") extra = slot.ok === false ? " ✗" : ` ✓${slot.score ? ` ${slot.score}` : ""}`;
      else if (step === "drill" && slot.ok === false) extra = " ✗";
      const cls = step === "check" && slot.ok === false ? "fail" : "done";
      return `<span class="chip ${cls}">${esc(label)}${esc(extra)}</span>`;
    }
    return `<span class="chip ${slot.quit > 0 ? "fail" : "half"}">${esc(label)}·未完成</span>`;
  }

  function renderRows(summary) {
    const host = $("report-rows");
    const rows = summary.rows;
    if (!rows.length) {
      host.innerHTML = `<p class="empty">最近 7 天还没有学习记录。</p>`;
      return;
    }
    host.innerHTML = rows.map((row) => {
      const title = row.step && row.cid && !row.ep ? `本辑巩固 ${esc(row.cid)}` : `第 ${row.ep} 集`;
      const pathBadge = row.path === "listen" ? `<span class="badge">👂 听力入章</span>`
        : row.path === "read" ? `<span class="badge">📖 阅读入章</span>` : "";
      const stuckBadge = row.stuckAt ? `<span class="badge stuck">卡在「${esc(Core.STEP_LABELS[row.stuckAt])}」</span>` : "";
      const lastSlot = Object.keys(row.steps).map((key) => row.steps[key]).sort((a, b) => b.last - a.last)[0];
      const day = lastSlot ? Core.dayKey(lastSlot.last) : "";
      const chips = Core.STEP_ORDER.map((step) => stepChip(step, row.steps[step])).filter(Boolean).join("");
      return `<div class="row">
        <div class="row-head"><span>${title}</span>${pathBadge}${stuckBadge}<span class="badge day">${esc(day)}</span></div>
        <div class="chips">${chips}</div>
      </div>`;
    }).join("");
  }

  function renderWeak(vstat) {
    const host = $("report-weak");
    const top = Core.topWrongTerms(vstat, 5);
    if (!top.length) {
      host.innerHTML = `<li><span class="empty">暂无错词记录，继续保持！</span></li>`;
      return;
    }
    host.innerHTML = top.map((item) => `<li>
      <span class="en">${esc(item.term)}</span>
      <span class="stat">错 ${item.wrong} 次 · 对 ${item.right} 次</span>
    </li>`).join("");
  }

  function renderSuggest(summary, vstat) {
    const tips = Core.suggest(summary, { vstat });
    $("report-suggest").innerHTML = tips.map((tip) => `
      <div class="tip"><span class="icon">${esc(tip.icon)}</span><span>${esc(tip.text)}</span></div>`).join("");
  }

  try {
    const summary = Core.summarize(readLog(), { days: 7 });
    renderOverview(summary, readJson("bookplay_adv_progress", "{}"));
    renderRows(summary);
    renderWeak(readJson("bookplay_adv_vocab_stat", "{}"));
    renderSuggest(summary, readJson("bookplay_adv_vocab_stat", "{}"));
  } catch (_) { /* 报告失败不打扰孩子 */ }
})();
