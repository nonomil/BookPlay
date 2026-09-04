(function exposeStorybookRoute(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BookPlayStorybookRoute = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function storybookRouteFactory() {
  "use strict";

  function resolveStorybookRequest(search) {
    const params = new URLSearchParams(search || "");
    const uiVariant = params.get("ui") === "unified-v3" ? "unified-v3" : "legacy";
    const series = params.get("series") === "minecraft" ? "minecraft"
      : params.get("series") === "mikey-jj" ? "mikey-jj"
      : "jttw";
    const rawId = series === "minecraft" || series === "mikey-jj" ? params.get("book") : params.get("ep");
    const id = Math.max(1, parseInt(rawId || "1", 10) || 1);
    if (series === "minecraft") {
      return {
        series,
        id,
        uiVariant,
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
        progressKey: `${series}:${id}`,
        dataUrl: `../data/storybooks-mikey-jj/book${id}.json`,
        shelfUrl: "map.html?series=mikey-jj",
      };
    }
    return {
      series,
      id,
      uiVariant,
      progressKey: `${series}:${id}`,
      dataUrl: `../data/storybooks/ep${id}.json`,
      shelfUrl: "shelf.html",
    };
  }

  return { resolveStorybookRequest };
}));
