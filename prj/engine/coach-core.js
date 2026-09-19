"use strict";

/* 学习教练 · 诊断路由纯逻辑（P4，吸收初章书 Demo 家长四问的最后一问：「下一步练什么」）。
 * 输入全部来自本机数据：步日志聚合（step-log-core.summarize 的 rows）、lesson 会话（含 P2 首答）、
 * 词级统计、进度。输出：推荐路径 + 薄弱环节 + 可点的下一动作 + 诊断依据（透明可解释）。
 * 规则即第一性排序：先补「断了的学习闭环」（测验未过→看故事卡住），再补「缺失的环节」（巩固/输出），
 * 最后才谈「继续前进」。 */
(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BookPlayCoach = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const LISTEN_HREF = (n, loops) => `wala.html?ep=${n}&mode=listen&loops=${loops || 2}&visual=audio&subtitle=enzh`;
  const READ_HREF = (n) => `wala.html?ep=${n}`;

  function rowsOf(summary) {
    return (summary && Array.isArray(summary.rows)) ? summary.rows : [];
  }

  function watchStats(rows) {
    const stats = { listenFinish: 0, readFinish: 0, listenStuck: 0, readStuck: 0 };
    for (const row of rows) {
      const watch = row.steps && row.steps.watch;
      if (!watch) continue;
      const path = row.path || "read";
      if (watch.finish > 0) stats[`${path}Finish`] += 1;
      else if (watch.enter > 0) stats[`${path}Stuck`] += 1;
    }
    return stats;
  }

  /* 路径表现必须按「事件流」统计：summarize 按集聚合，同一集两条路径会并成一行，
   * 直接用 rows 会把「ep3 听了一半 + 读了一半」记成单路径。 */
  function watchStatsFromLog(log) {
    const enter = { listen: 0, read: 0 };
    const finish = { listen: 0, read: 0 };
    for (const e of Array.isArray(log) ? log : []) {
      if (!e || e.step !== "watch") continue;
      const path = e.path === "listen" ? "listen" : "read";
      if (e.event === "enter") enter[path] += 1;
      else if (e.event === "finish") finish[path] += 1;
    }
    return {
      listenFinish: finish.listen,
      readFinish: finish.read,
      listenStuck: Math.max(0, enter.listen - finish.listen),
      readStuck: Math.max(0, enter.read - finish.read),
    };
  }

  function maxWatchEp(rows) {
    let best = 0;
    for (const row of rows) {
      if (row.steps && row.steps.watch && row.ep > best) best = row.ep;
    }
    return best;
  }

  function hasOutputFinish(rows) {
    return rows.some((row) => row.steps && row.steps.output && row.steps.output.finish > 0);
  }

  function topWeakTerms(vstat, minWrong, limit) {
    const source = vstat && typeof vstat === "object" ? vstat : {};
    return Object.keys(source)
      .map((term) => ({ term, wrong: source[term].wrong || 0 }))
      .filter((item) => item.wrong >= minWrong)
      .sort((a, b) => b.wrong - a.wrong)
      .slice(0, limit || 3);
  }

  function verdict(input) {
    const data = input && typeof input === "object" ? input : {};
    const rows = rowsOf(data.summary);
    const signals = [];
    const weakTerms = topWeakTerms(data.vstat, 3, 3);

    // 无任何近期活动：从上次进度的下一集听力入章（听力是最低的台阶）
    if (!rows.length) {
      const progressed = data.progress && typeof data.progress === "object" ? data.progress : {};
      const maxEp = Object.keys(progressed).reduce((acc, key) => Math.max(acc, parseInt(key, 10) || 0), 0);
      const next = maxEp + 1;
      signals.push(`最近 7 天没有学习记录${maxEp ? `，进度在第 ${maxEp} 集` : ""}`);
      return {
        headline: `从第 ${next} 集的听力入章开始，每天 15 分钟就好`,
        path: "listen",
        weakStep: null,
        nextAction: { label: `👂 听力入章 · 第 ${next} 集`, href: LISTEN_HREF(next) },
        weakTerms,
        signals,
      };
    }

    const watch = watchStatsFromLog(data.log);
    const outEp = maxWatchEp(rows);

    // 1) 最近的巩固测验没过：闭环断在这里，先修它
    const checkRows = rows.filter((row) => row.steps && row.steps.check);
    const lastCheck = checkRows.length ? checkRows[checkRows.length - 1] : null;
    if (lastCheck && lastCheck.steps.check.ok === false) {
      signals.push(`第 ${lastCheck.ep} 集巩固未通过${lastCheck.steps.check.score ? `（${lastCheck.steps.check.score}）` : ""}`);
      if (weakTerms.length) signals.push(`「${weakTerms[0].term}」已错 ${weakTerms[0].wrong} 次`);
      return {
        headline: `先复习第 ${lastCheck.ep} 集的错题，再挑战一次就能过`,
        path: null,
        weakStep: "check",
        nextAction: { label: `📝 复习错题 · 第 ${lastCheck.ep} 集`, href: `lesson.html?ep=${lastCheck.ep}&retry=1` },
        weakTerms,
        signals,
      };
    }

    // 2) 阅读看一半成习惯、听力能听完：承认差异，换听力入章
    if (watch.readStuck >= 2 && watch.listenFinish >= 1) {
      signals.push(`阅读入章 ${watch.readStuck} 次看一半停下，听力完整听完 ${watch.listenFinish} 次`);
      return {
        headline: "现阶段用听力入章更顺：先听见，再读进去",
        path: "listen",
        weakStep: "watch",
        nextAction: { label: `👂 听力入章 · 第 ${outEp} 集`, href: LISTEN_HREF(outEp) },
        weakTerms,
        signals,
      };
    }

    // 3) 听力也总卡住（且阅读没走通）：不是孩子不专心，是负担超了；降为 1 遍 + 陪听
    if (watch.listenStuck >= 2 && watch.readFinish === 0) {
      signals.push(`听力入章 ${watch.listenStuck} 次没听完`);
      return {
        headline: "把听力降到 1 遍、陪孩子一起听，听完就是赢",
        path: "listen",
        weakStep: "watch",
        nextAction: { label: `👂 轻松听 1 遍 · 第 ${outEp} 集`, href: LISTEN_HREF(outEp, 1) },
        weakTerms,
        signals,
      };
    }

    // 3.5) 阅读连着卡住、但听力从没试过：换条路上手更省力
    if (watch.readStuck >= 2 && watch.listenFinish === 0 && watch.listenStuck === 0) {
      signals.push(`阅读入章 ${watch.readStuck} 次看一半停下，还没试过听力入章`);
      return {
        headline: "换个姿势试试：先听一遍故事，再回去读就轻了",
        path: "listen",
        weakStep: "watch",
        nextAction: { label: `👂 听力入章 · 第 ${outEp} 集`, href: LISTEN_HREF(outEp) },
        weakTerms,
        signals,
      };
    }

    // 4) 看完了故事但没做本集巩固：闭环缺一环
    const watchedRow = rows.filter((row) => row.steps && row.steps.watch && row.steps.watch.finish > 0)
      .sort((a, b) => b.last - a.last)[0];
    if (watchedRow && (!watchedRow.steps.check || watchedRow.steps.check.finish === 0)) {
      signals.push(`第 ${watchedRow.ep} 集故事看完了，还没做巩固测验`);
      return {
        headline: `先做第 ${watchedRow.ep} 集的小测验，通过才解锁下一集`,
        path: null,
        weakStep: "check",
        nextAction: { label: `📝 本集巩固 · 第 ${watchedRow.ep} 集`, href: `lesson.html?ep=${watchedRow.ep}` },
        weakTerms,
        signals,
      };
    }

    // 5) 学是学了，从没开过口：输出是理解唯一的显影剂
    if (!hasOutputFinish(rows)) {
      const retellEp = watchedRow ? watchedRow.ep : outEp;
      signals.push("这段时间没有任何配音/复述记录");
      return {
        headline: "试一次看图复述——能讲出来，才是真的会了",
        path: null,
        weakStep: "output",
        nextAction: { label: `🎤 看图复述 · 第 ${retellEp} 集`, href: `retell.html?ep=${retellEp}` },
        weakTerms,
        signals,
      };
    }

    // 6) 健康推进：按两条路径的完成率推荐，继续下一集
    const path = watch.listenFinish >= watch.readFinish ? "listen" : "read";
    const progressed = data.progress && typeof data.progress === "object" ? data.progress : {};
    const maxDone = Object.keys(progressed).reduce((acc, key) => (
      progressed[key] && progressed[key].done ? Math.max(acc, parseInt(key, 10) || 0) : acc
    ), 0);
    const next = Math.max(maxWatchEp(rows), maxDone) + 1;
    signals.push(`听力完整 ${watch.listenFinish} 次 / 阅读完整 ${watch.readFinish} 次`);
    if (weakTerms.length) signals.push(`「${weakTerms[0].term}」已错 ${weakTerms[0].wrong} 次，降妖记里会再遇到`);
    const stuckTotal = watch.listenStuck + watch.readStuck;
    const lead = stuckTotal > 0 ? `有 ${stuckTotal} 次看/听了一半——换${path === "listen" ? "听力" : "阅读"}入章继续第 ${next} 集` : `走得很稳！下一步用${path === "listen" ? "听力" : "阅读"}入章继续第 ${next} 集`;
    return {
      headline: lead,
      path,
      weakStep: null,
      nextAction: {
        label: `${path === "listen" ? "👂 听力" : "📖 阅读"}入章 · 第 ${next} 集`,
        href: path === "listen" ? LISTEN_HREF(next) : READ_HREF(next),
      },
      weakTerms,
      signals,
    };
  }

  return { verdict, watchStats, watchStatsFromLog, topWeakTerms };
});
