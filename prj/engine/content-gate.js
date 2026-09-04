/* Offline starter-bundle gate shared by map, storybook and Wala pages. */
(function (root) {
  "use strict";
  let manifestPromise;
  let overlay;

  const style = document.createElement("style");
  style.textContent = `.content-gate-overlay{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:18px;background:rgba(17,14,29,.68);backdrop-filter:blur(5px)}.content-gate-card{position:relative;width:min(430px,92vw);padding:28px 24px 22px;border:1px solid rgba(255,255,255,.28);border-radius:24px;background:linear-gradient(145deg,#fffaf0,#f4e6c9);color:#33251d;box-shadow:0 24px 70px rgba(0,0,0,.35);text-align:center}.content-gate-card h2{margin:4px 0 10px;font-size:1.35rem}.content-gate-card p{margin:8px 0 16px;line-height:1.55;color:#5f4b3c}.content-gate-icon{font-size:2.5rem}.content-gate-close{position:absolute;right:10px;top:8px;border:0;background:transparent;font-size:1.8rem;color:#765f4a;cursor:pointer}.content-gate-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:10px}.content-gate-actions button{border:0;border-radius:999px;padding:10px 15px;font-weight:700;cursor:pointer}.content-gate-import{background:#6652d9;color:#fff}.content-gate-folder{background:#e3d2ae;color:#4a3624}.content-gate-status{min-height:1.4em!important;margin-bottom:0!important;font-size:.9rem}`;
  document.head && document.head.appendChild(style);

  function loadManifest() {
    if (!manifestPromise) {
      manifestPromise = fetch("../data/content-manifest.json", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null);
    }
    return manifestPromise;
  }

  function label(series, id) {
    if (series === "minecraft") return `Minecraft 第 ${id} 本`;
    if (series === "mikey-jj") return `Mikey & JJ 第 ${id} 本`;
    return `西游记第 ${id} 集`;
  }

  function plugin() {
    return root.Capacitor && root.Capacitor.Plugins && root.Capacitor.Plugins.DataPack;
  }

  function close() {
    if (overlay) overlay.remove();
    overlay = null;
  }

  function showImportPrompt(options) {
    const series = options?.series || "jttw";
    const id = Number(options?.id || 1);
    close();
    overlay = document.createElement("div");
    overlay.className = "content-gate-overlay";
    overlay.innerHTML = `
      <div class="content-gate-card" role="dialog" aria-modal="true" aria-labelledby="content-gate-title">
        <button class="content-gate-close" type="button" aria-label="关闭">×</button>
        <div class="content-gate-icon" aria-hidden="true">🗺️</div>
        <h2 id="content-gate-title">${label(series, id)}还未导入</h2>
        <p>安装包先放了首发体验。继续下一关时，请导入对应的阶段数据包。</p>
        <div class="content-gate-actions">
          <button class="content-gate-import" type="button">选择数据包 ZIP</button>
          <button class="content-gate-folder" type="button">选择已解压文件夹</button>
        </div>
        <p class="content-gate-status" aria-live="polite"></p>
      </div>`;
    document.body.appendChild(overlay);
    const status = overlay.querySelector(".content-gate-status");
    overlay.querySelector(".content-gate-close").addEventListener("click", close);
    overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
    const choose = async (method, waiting) => {
      const pack = plugin();
      if (!pack || typeof pack[method] !== "function") {
        status.textContent = "请在 APK 中选择数据包；桌面端请用启动服务.bat。";
        return;
      }
      status.textContent = waiting;
      try {
        const result = await pack[method]();
        if (result && result.ready) {
          status.textContent = "导入成功，正在打开…";
          setTimeout(() => location.reload(), 180);
        } else {
          status.textContent = result?.message || "没有找到可用内容。";
        }
      } catch (error) {
        status.textContent = String(error?.message || error || "导入失败");
      }
    };
    overlay.querySelector(".content-gate-import").addEventListener("click", () => choose("pickZip", "打开系统文件选择…"));
    overlay.querySelector(".content-gate-folder").addEventListener("click", () => choose("pickFolder", "打开系统文件夹选择…"));
    overlay.querySelector(".content-gate-import").focus();
    return overlay;
  }

  async function isUnavailable(series, id) {
    const manifest = await loadManifest();
    if (!manifest || !["apk-builtin-starter", "apk-builtin-jttw-only"].includes(manifest.kind)) return false;
    const item = manifest.available?.[series] || {};
    const key = series === "jttw" ? "episodes" : "books";
    return !Array.isArray(item[key]) || !item[key].map(Number).includes(Number(id));
  }

  // Intercept route cards before the browser leaves the map.  This keeps the
  // user on the current screen when a catalog entry is intentionally only a
  // placeholder in the starter APK, instead of flashing a blank reader page.
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    const anchor = event.target.closest?.("a[href]");
    if (!anchor) return;
    let url;
    try { url = new URL(anchor.href, location.href); } catch (_) { return; }
    const name = url.pathname.split("/").pop();
    let series = null;
    let id = null;
    if (name === "storybook.html") {
      series = url.searchParams.get("series") || "jttw";
      id = url.searchParams.get(series === "jttw" ? "ep" : "book");
    } else if (name === "wala.html" || name === "adventure.html") {
      series = "jttw";
      id = url.searchParams.get("ep");
    }
    if (!series || !id || !/^\d+$/.test(id)) return;
    event.preventDefault();
    isUnavailable(series, Number(id)).then((missing) => {
      if (missing) showImportPrompt({ series, id: Number(id) });
      else location.href = url.href;
    });
  }, true);

  root.BookPlayContentGate = { loadManifest, isUnavailable, showImportPrompt, close };
}(typeof globalThis !== "undefined" ? globalThis : window));
