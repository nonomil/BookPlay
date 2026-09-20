(function exposeStorybookRoute(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BookPlayStorybookRoute = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function storybookRouteFactory() {
  "use strict";

  function resolveStorybookTheme(params, series) {
    const raw = (params.get("theme") || "").trim().toLowerCase();
    if (raw === "paper" || raw === "classic") return raw;
    // The Journey to the West reader reads like a picture book, so it defaults
    // to the paper skin; the comic series keep their learning-console skins.
    return series === "jttw" ? "paper" : "classic";
  }

  function resolveStorybookRequest(search) {
    const params = new URLSearchParams(search || "");
    const uiVariant = params.get("ui") === "unified-v3" ? "unified-v3" : "legacy";
    const series = params.get("series") === "minecraft" ? "minecraft"
      : params.get("series") === "mikey-jj" ? "mikey-jj"
      : "jttw";
    const theme = resolveStorybookTheme(params, series);
    const rawId = series === "minecraft" || series === "mikey-jj" ? params.get("book") : params.get("ep");
    const id = Math.max(1, parseInt(rawId || "1", 10) || 1);
    const rawChapter = params.get("chapter");
    const chapter = rawChapter ? Math.max(1, parseInt(rawChapter, 10) || 1) : null;
    if (series === "minecraft") {
      return {
        series,
        id,
        uiVariant,
        theme,
        ...(chapter ? { chapter } : {}),
        progressKey: `${series}:${id}`,
        dataUrl: `../data/storybooks-minecraft/book${id}.json`,
        shelfUrl: "map.html?series=minecraft",
      };
    }
    if (series === "mikey-jj") {
      return {
        series,
        id,
        uiVariant,
        theme,
        ...(chapter ? { chapter } : {}),
        progressKey: `${series}:${id}`,
        dataUrl: `../data/storybooks-mikey-jj/book${id}.json`,
        shelfUrl: "map.html?series=mikey-jj",
      };
    }
    return {
      series,
      id,
      uiVariant,
      theme,
      progressKey: `${series}:${id}`,
      dataUrl: `../data/storybooks/ep${id}.json`,
      shelfUrl: "shelf.html",
    };
  }

  return { resolveStorybookRequest, resolveStorybookTheme };
}));
