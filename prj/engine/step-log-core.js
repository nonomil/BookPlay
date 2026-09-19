"use strict";

/* 学习步日志 · 纯逻辑核心（P0 学习诊断，见 docs/plans/2026-09-19-入章双路径学习闭环）。
 * 回答家长四问中的「孩子卡在哪一步」：每集、哪条路径（listen 听力 / read 阅读）、
 * 走到哪一步（watch 看故事 → practice 练单词 → check 巩固测验 → output 配音输出，drill 本辑巩固）、
 * 是完成还是中途退出。只记录事实，不给评价；建议由 suggest() 的固定规则生成。
 * 事件形态：{ t, day, ep, path?, step, event: enter|finish|quit, ok?, score?, cid? }
 */
(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BookPlayStepLogCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const KEY = "bookplay_step_log_v1";
  const STEPS = new Set(["watch", "practice", "check", "output", "drill"]);
  const EVENTS = new Set(["enter", "finish", "quit"]);
  const PATHS = new Set(["listen", "read"]);
  const STEP_ORDER = ["watch", "practice", "check", "output", "drill"];
  const DAY_MS = 24 * 60 * 60 * 1000;
  const DEFAULT_CAP = 400;

  function dayKey(ms) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function normalizeEvent(raw, nowMs) {
    if (!raw || typeof raw !== "object") return null;
    const step = String(raw.step || "");
    const event = String(raw.event || "");
    if (!STEPS.has(step) || !EVENTS.has(event)) return null;
    const t = Number.isFinite(nowMs) ? nowMs : Date.now();
    const out = {
      t,
      day: dayKey(t),
      ep: Math.max(0, Number.parseInt(raw.ep, 10) || 0),
      step,
      event,
    };
    if (PATHS.has(raw.path)) out.path = raw.path;
    if (typeof raw.ok === "boolean") out.ok = raw.ok;
    if (raw.score != null && String(raw.score).length) out.score = String(raw.score).slice(0, 12);
    if (raw.cid) out.cid = String(raw.cid).slice(0, 8);
    // kind：同一步骤内的细分（如 output 的 dub / retell），诊断路由 P4 消费
    if (raw.kind) out.kind = String(raw.kind).slice(0, 8);
    return out;
  }

  function appendEvent(log, raw, nowMs, cap) {
    const limit = Number.isFinite(cap) && cap > 0 ? cap : DEFAULT_CAP;
    const evt = normalizeEvent(raw, nowMs);
    if (!evt) return Array.isArray(log) ? log.slice() : [];
    const next = (Array.isArray(log) ? log : []).concat(evt);
    return next.length > limit ? next.slice(next.length - limit) : next;
  }

  /* 近 days 天的轨迹，按集（或按辑）聚成行：
   * row = { ep, cid?, path?, steps: { watch: {enter,finish,quit,ok?,score?}, ... }, last, stuckAt }
   * stuckAt = 按流程顺序第一个「进了但没等到 finish」的步骤。 */
  function summarize(log, options) {
    const opts = options || {};
    const now = Number.isFinite(opts.now) ? opts.now : Date.now();
    const days = Number.isFinite(opts.days) && opts.days > 0 ? opts.days : 7;
    const from = now - days * DAY_MS;
    const list = (Array.isArray(log) ? log : []).filter((e) => e && e.t >= from && e.t <= now + DAY_MS);
    const activeDays = new Set();
    const slots = new Map();
    for (const e of list) {
      activeDays.add(e.day || dayKey(e.t));
      const key = e.step === "drill" ? `drill:${e.cid || "?"}` : `${e.step}:${e.ep}`;
      const slot = slots.get(key) || {
        key, step: e.step, ep: e.ep || 0, cid: e.cid || null, path: null,
        enter: 0, finish: 0, quit: 0, ok: null, score: null, last: e.t,
      };
      if (PATHS.has(e.path)) slot.path = e.path;
      if (e.event === "enter") slot.enter += 1;
      else if (e.event === "finish") slot.finish += 1;
      else if (e.event === "quit") slot.quit += 1;
      if (typeof e.ok === "boolean") slot.ok = e.ok;
      if (e.score) slot.score = e.score;
      slot.last = Math.max(slot.last, e.t);
      slots.set(key, slot);
    }
    const rows = new Map();
    for (const slot of slots.values()) {
      const rowKey = slot.step === "drill" ? `drill:${slot.cid}` : `ep:${slot.ep}`;
      const row = rows.get(rowKey) || { key: rowKey, ep: slot.ep, cid: slot.cid, path: slot.path, steps: {}, last: slot.last };
      if (slot.step !== "drill" && !row.path && slot.path) row.path = slot.path;
      row.steps[slot.step] = slot;
      row.last = Math.max(row.last, slot.last);
      rows.set(rowKey, row);
    }
    const out = [...rows.values()].sort((a, b) => a.last - b.last).map((row) => {
      let stuckAt = null;
      for (const step of STEP_ORDER) {
        const s = row.steps[step];
        if (s && s.enter > 0 && s.finish === 0) { stuckAt = step; break; }
      }
      return Object.assign(row, { stuckAt });
    });
    return { days, activeDays: [...activeDays].sort(), eventCount: list.length, rows: out, from, now };
  }

  /* 错词 Top N：直接吃 bookplay_adv_vocab_stat 的 {term:{seen,right,wrong}}。 */
  function topWrongTerms(vstat, limit) {
    const source = vstat && typeof vstat === "object" ? vstat : {};
    const n = Number.isFinite(limit) && limit > 0 ? limit : 5;
    return Object.keys(source)
      .map((term) => ({ term: String(term), wrong: source[term].wrong || 0, right: source[term].right || 0, seen: source[term].seen || 0 }))
      .filter((item) => item.wrong > 0)
      .sort((a, b) => b.wrong - a.wrong || a.term.localeCompare(b.term))
      .slice(0, n);
  }

  /* 下一步建议（固定规则，P0 先写死 5 条；P4 换成 coach-core 的数据驱动版）。 */
  function suggest(summary, ctx) {
    const c = ctx && typeof ctx === "object" ? ctx : {};
    const rows = (summary && summary.rows) || [];
    const out = [];
    if (!rows.length) {
      out.push({ icon: "🌱", text: "最近还没有学习记录。从地图选一集，先用「听力入章」看 15 分钟——不用每个词都听懂，能抓住谁、在哪里、发生了什么就很棒。" });
      return out;
    }
    const watchStuck = rows.filter((r) => r.steps.watch && r.steps.watch.enter > 0 && r.steps.watch.finish === 0);
    if (watchStuck.length >= 2) {
      out.push({ icon: "👂", text: `有 ${watchStuck.length} 集故事看到一半停下了。建议换「听力入章」（无字幕、连播 2 遍）：不暂停、不查词，先跟上故事主线。` });
    }
    const checkFail = rows.find((r) => r.steps.check && r.steps.check.ok === false);
    if (checkFail) {
      out.push({ icon: "📝", text: `第 ${checkFail.ep} 集巩固测验还没通过${checkFail.steps.check.score ? `（${checkFail.steps.check.score}）` : ""}。先「复习错题」再挑战一次，通过后就解锁下一集。` });
    }
    const weak = topWrongTerms(c.vstat, 1)[0];
    if (weak && weak.wrong >= 3) {
      out.push({ icon: "🎯", text: `「${weak.term}」已经错了 ${weak.wrong} 次。它还会在降妖记里出现，出手前先想一想它的意思。` });
    }
    const watchedAny = rows.some((r) => r.steps.watch && r.steps.watch.finish > 0);
    const outputAny = rows.some((r) => r.steps.output);
    if (watchedAny && !outputAny) {
      out.push({ icon: "🎤", text: "看了故事还没开过口。去趣配音录一句试试——能用自己的声音讲出来，才是真的会了。" });
    }
    if (rows.every((r) => !r.stuckAt) && !(checkFail && rows.some((r) => r.steps.check))) {
      const eps = rows.map((r) => r.ep).filter((n) => n > 0);
      const nextEp = eps.length ? Math.max(...eps) + 1 : 1;
      out.push({ icon: "🌟", text: `这段时间走得很稳！下一站是第 ${nextEp} 集，继续每天一点点。` });
    }
    if (!out.length) out.push({ icon: "💪", text: "继续加油，一步一步来，故事会越来越清楚。" });
    return out.slice(0, 4);
  }

  const STEP_LABELS = Object.freeze({ watch: "看故事", practice: "练单词", check: "巩固测验", output: "配音输出", drill: "本辑巩固" });
  const STEP_ICONS = Object.freeze({ watch: "🎬", practice: "🔤", check: "📝", output: "🎤", drill: "★" });

  return { KEY, STEPS, EVENTS, PATHS, STEP_ORDER, STEP_LABELS, STEP_ICONS, DEFAULT_CAP, dayKey, normalizeEvent, appendEvent, summarize, topWrongTerms, suggest };
});
