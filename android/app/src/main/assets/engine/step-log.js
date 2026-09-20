"use strict";

/* 学习步日志 · 落盘封装。页面只调 BookPlayStepLog.log({...})：
 * 一切失败静默——诊断永远不能挡住学习本身。键 bookplay_step_log_v1，全部留在本机。 */
(function expose(root, factory) {
  const api = factory(root && root.localStorage, root && root.BookPlayStepLogCore);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BookPlayStepLog = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (ls, core) {
  function readLog() {
    if (!ls || !core) return [];
    try {
      const value = JSON.parse(ls.getItem(core.KEY) || "[]");
      return Array.isArray(value) ? value : [];
    } catch (_) {
      return [];
    }
  }

  function writeLog(list) {
    if (!ls || !core) return;
    try {
      ls.setItem(core.KEY, JSON.stringify(list));
    } catch (_) { /* 存储满/隐私模式：静默放弃 */ }
  }

  function log(raw) {
    if (!core || !raw) return false;
    const evt = core.normalizeEvent(raw, Date.now());
    if (!evt) return false;
    writeLog(core.appendEvent(readLog(), evt, evt.t));
    return true;
  }

  function read() {
    return readLog();
  }

  return { log, read };
});
