"use strict";

(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BookPlayEpisodeReward = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function episodeRewardFactory() {
  const SCHEMA_VERSION = 1;

  const clone = (value) => JSON.parse(JSON.stringify(value || {}));

  function episodeKey(episode) {
    return String(Number.parseInt(episode, 10) || 0);
  }

  function normalizeState(state) {
    const value = clone(state);
    value.schema_version = SCHEMA_VERSION;
    value.progress = value.progress && typeof value.progress === "object" ? value.progress : {};
    value.progress.episodes = value.progress.episodes && typeof value.progress.episodes === "object"
      ? value.progress.episodes : {};
    value.inventory = value.inventory && typeof value.inventory === "object" ? value.inventory : {};
    value.stickers = value.stickers && typeof value.stickers === "object" ? value.stickers : {};
    value.rooms = value.rooms && typeof value.rooms === "object" ? value.rooms : {};
    value.daily = value.daily && typeof value.daily === "object" ? value.daily : {};
    value.sp = Number.isFinite(Number(value.sp)) ? Math.max(0, Number(value.sp)) : 0;
    value.daily.date = value.daily.date || null;
    value.daily.drops = Number.isFinite(Number(value.daily.drops)) ? Math.max(0, Number(value.daily.drops)) : 0;
    return value;
  }

  function syncDay(state, date) {
    const value = state;
    const day = String(date || "");
    if (day && value.daily.date !== day) {
      value.daily.date = day;
      value.daily.drops = 0;
    }
    return value;
  }

  function episodeConfig(catalog, episode) {
    const source = catalog && catalog.episodes;
    if (!source || typeof source !== "object") return null;
    return source[episodeKey(episode)] || source[Number(episode)] || null;
  }

  function itemConfig(catalog, episode, itemId) {
    const config = episodeConfig(catalog, episode);
    const items = Array.isArray(config && config.items) ? config.items : [];
    return items.find((item) => String(item && item.id) === String(itemId)) || null;
  }

  // Return a safe, read-only view of the story provenance attached to a
  // reward item.  Reward granting never depends on this optional metadata;
  // it is used by the UI and the offline asset-generation pipeline only.
  function storyBinding(catalog, episode, itemId) {
    const item = itemConfig(catalog, episode, itemId);
    const binding = item && item.story_binding;
    if (!binding || typeof binding !== "object") return null;
    const pages = Array.isArray(binding.storybook_pages)
      ? binding.storybook_pages.map((value) => Number.parseInt(value, 10)).filter((value) => Number.isInteger(value) && value > 0)
      : [];
    const scenes = Array.isArray(binding.scene_ids)
      ? binding.scene_ids.map((value) => String(value || "").trim()).filter(Boolean)
      : [];
    const terms = Array.isArray(binding.trigger_terms)
      ? binding.trigger_terms.map((value) => String(value || "").trim()).filter(Boolean)
      : [];
    const video = binding.video && typeof binding.video === "object" ? binding.video : null;
    const start = video ? Number(video.start_sec) : NaN;
    const end = video ? Number(video.end_sec) : NaN;
    const range = Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start
      ? { start_sec: start, end_sec: end }
      : null;
    const labelZh = String(binding.source_label_zh || "").trim();
    const labelEn = String(binding.source_label_en || "").trim();
    const promptId = String(binding.asset_prompt_id || "").trim();
    if (!pages.length && !scenes.length && !terms.length && !range && !labelZh && !labelEn && !promptId) return null;
    return {
      item_id: String(item.id),
      episode: Number.parseInt(episode, 10) || 0,
      storybook_pages: pages,
      scene_ids: scenes,
      video: range,
      trigger_terms: terms,
      source_label_zh: labelZh,
      source_label_en: labelEn,
      asset_prompt_id: promptId,
    };
  }

  function dailyCap(catalog) {
    const cap = Number(catalog && catalog.daily_drop_cap);
    return Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : 2;
  }

  function stickerCount(catalog) {
    const count = Number(catalog && catalog.sticker_count);
    return Number.isFinite(count) && count > 0 ? Math.floor(count) : 108;
  }

  function stickerThemes(catalog) {
    const themes = Array.isArray(catalog && catalog.sticker_themes)
      ? catalog.sticker_themes.filter((theme) => theme && typeof theme === "object")
      : [];
    return themes.length ? themes : [{
      chapter: 1,
      from: 1,
      to: stickerCount(catalog),
      title_zh: "西游旅程",
      title_en: "Journey West",
      motifs: [{ id: "journey", title_zh: "取经路", title_en: "Journey Trail", glyph: "✨" }],
    }];
  }

  function storyUnit(catalog) {
    return catalog && (catalog.series === "minecraft" || catalog.series === "mikey-jj")
      ? { zh: "本", en: "book" }
      : { zh: "集", en: "episode" };
  }

  function episodeSticker(catalog, episode) {
    const number = Number.parseInt(episode, 10);
    if (!Number.isInteger(number) || number < 1 || number > stickerCount(catalog)) return null;
    const themes = stickerThemes(catalog);
    const theme = themes.find((entry) => {
      const from = Number(entry.from);
      const to = Number(entry.to);
      return Number.isFinite(from) && Number.isFinite(to) && number >= from && number <= to;
    }) || themes[Math.min(themes.length - 1, Math.max(0, Math.floor((number - 1) / Math.max(1, Math.ceil(stickerCount(catalog) / themes.length)))))] || themes[0];
    const motifs = Array.isArray(theme.motifs) && theme.motifs.length ? theme.motifs : [{ id: "journey", title_zh: "旅程", title_en: "Journey", glyph: "✨" }];
    const from = Number.isFinite(Number(theme.from)) ? Number(theme.from) : 1;
    const index = Math.abs(number - from) % motifs.length;
    // A chapter may provide a per-episode override when a rotating motif would
    // detach the reward from the actual story beat (for example, EP1's stream
    // and waterfall are different moments, not the same generic icon).
    const overrides = theme.episode_overrides && typeof theme.episode_overrides === "object"
      ? theme.episode_overrides : {};
    const override = overrides[String(number)] && typeof overrides[String(number)] === "object"
      ? overrides[String(number)] : null;
    const motif = override ? { ...(motifs[index] || motifs[0]), ...override } : (motifs[index] || motifs[0]);
    const idPart = String(number).padStart(3, "0");
    const motifId = String(motif.id || `motif-${index + 1}`).replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
    const storyImageTemplate = String(catalog && catalog.story_image_template || "").trim();
    const storyImage = storyImageTemplate
      ? storyImageTemplate.replace(/\{episode\}/g, idPart)
      : null;
    const unit = storyUnit(catalog);
    return {
      id: `sticker.ep${idPart}`,
      episode: number,
      chapter: Number(theme.chapter) || null,
      category: "sticker",
      title_zh: `${motif.title_zh || theme.title_zh || "故事元素"}贴纸`,
      title_en: `${motif.title_en || theme.title_en || "Story Motif"} Sticker`,
      caption_zh: motif.caption_zh || `第 ${number} ${unit.zh}留下的${motif.title_zh || "故事元素"}${motif.source_label_zh ? `（${motif.source_label_zh}）` : ""}，像一枚可以贴在故事册上的小冰箱贴。`,
      caption_en: motif.caption_en || `A ${motif.title_en || "story motif"} sticker from ${unit.en} ${number}${motif.source_label_en ? ` (${motif.source_label_en})` : ""}.`,
      glyph: motif.glyph || "✨",
      shape: motif.shape || theme.shape || ["circle", "cloud", "diamond", "star"][number % 4],
      tone: motif.tone || theme.tone || ["jade", "sky", "gold", "rose"][number % 4],
      story_element_type: motif.type || "sticker",
      display_mode: "sticker-book",
      fridge_magnet: true,
      asset: String(motif.asset || "").trim() || null,
      // The story-frame thumbnail is the visual truth anchor. Generated
      // motif art remains available as a transparent keepsake, but the UI can
      // always show the exact episode scene when a prompt drifts from the plot.
      story_image: storyImage,
      motif_id: motifId,
      source_episode: number,
      story_binding: motif.story_binding && typeof motif.story_binding === "object"
        ? clone(motif.story_binding) : null,
      source_label_zh: String(motif.source_label_zh || theme.source_label_zh || "").trim(),
      source_label_en: String(motif.source_label_en || theme.source_label_en || "").trim(),
    };
  }

  function listEpisodeStickers(catalog) {
    const stickers = [];
    for (let episode = 1; episode <= stickerCount(catalog); episode += 1) {
      const item = episodeSticker(catalog, episode);
      if (item) stickers.push(item);
    }
    return stickers;
  }

  function grantEpisodeSticker(state, options = {}) {
    const value = normalizeState(state);
    if (!options.completed) return { state: value, granted: false, reason: "not_completed" };
    const item = episodeSticker(options.catalog, options.episode);
    if (!item) return { state: value, granted: false, reason: "invalid_episode" };
    const key = episodeKey(options.episode);
    const progress = value.progress.episodes[key] && typeof value.progress.episodes[key] === "object"
      ? value.progress.episodes[key] : {};
    value.progress.episodes[key] = progress;
    if (progress.sticker_granted || value.stickers[item.id]?.owned) {
      progress.sticker_granted = true;
      progress.sticker_id = item.id;
      return { state: value, granted: false, reason: "already_granted", item: clone(item) };
    }
    const acquiredAt = options.acquiredAt || new Date().toISOString();
    value.stickers[item.id] = {
      owned: true,
      source_episode: item.episode,
      acquired_at: acquiredAt,
    };
    progress.sticker_granted = true;
    progress.sticker_id = item.id;
    progress.sticker_granted_at = acquiredAt;
    return { state: value, granted: true, reason: "granted", item: clone(item) };
  }

  function stickerItems(state, catalog) {
    const value = normalizeState(state);
    return listEpisodeStickers(catalog).map((item) => ({
      ...item,
      owned: Boolean(value.stickers[item.id]?.owned),
      acquired_at: value.stickers[item.id]?.acquired_at || null,
    }));
  }

  function prepareDrop(options = {}) {
    const value = syncDay(normalizeState(options.state), options.date);
    const key = episodeKey(options.episode);
    const config = episodeConfig(options.catalog, options.episode);
    const progress = value.progress.episodes[key] && typeof value.progress.episodes[key] === "object"
      ? value.progress.episodes[key] : {};
    value.progress.episodes[key] = progress;

    if (!options.passed) return { state: value, offered: false, items: [], reason: "not_passed" };
    if (progress.drop_granted) return { state: value, offered: false, items: [], reason: "already_granted" };
    if (value.daily.drops >= dailyCap(options.catalog)) {
      return { state: value, offered: false, items: [], reason: "daily_cap" };
    }

    const items = Array.isArray(config && config.items) ? config.items : [];
    const candidates = items.filter((item) => item && item.id && !value.inventory[item.id]?.owned).slice(0, 3);
    if (!candidates.length) return { state: value, offered: false, items: [], reason: "collection_exhausted" };
    return {
      state: value,
      offered: true,
      items: clone(candidates),
      reason: "eligible",
      episode: Number(options.episode),
    };
  }

  function grantChoice(state, options = {}) {
    const value = syncDay(normalizeState(state), options.date);
    const key = episodeKey(options.episode);
    const config = episodeConfig(options.catalog, options.episode);
    const progress = value.progress.episodes[key] && typeof value.progress.episodes[key] === "object"
      ? value.progress.episodes[key] : {};
    value.progress.episodes[key] = progress;
    const item = itemConfig(options.catalog, options.episode, options.itemId);
    if (!item) return { state: value, granted: false, reason: "invalid_item" };
    if (progress.drop_granted) return { state: value, granted: false, reason: "already_granted" };
    if (value.daily.drops >= dailyCap(options.catalog)) {
      return { state: value, granted: false, reason: "daily_cap" };
    }
    if (value.inventory[item.id]?.owned) return { state: value, granted: false, reason: "already_owned" };

    const roomId = item.room || (config && config.room) || "room.huaguo";
    const room = value.rooms[roomId] && typeof value.rooms[roomId] === "object"
      ? value.rooms[roomId] : { placements: [] };
    room.placements = Array.isArray(room.placements) ? room.placements : [];
    const placement = {
      item_id: item.id,
      slot: item.slot || (options.catalog.rooms?.[roomId] || {}).default_slot || "shelf",
    };
    if (!room.placements.some((entry) => entry && entry.item_id === item.id)) room.placements.push(placement);
    value.rooms[roomId] = room;
    value.inventory[item.id] = {
      owned: true,
      source_episode: Number(options.episode),
      acquired_at: options.acquiredAt || new Date().toISOString(),
    };
    progress.drop_granted = true;
    progress.drop_item_id = item.id;
    progress.drop_granted_at = options.acquiredAt || new Date().toISOString();
    value.daily.drops += 1;
    return { state: value, granted: true, reason: "granted", item: clone(item), room_id: roomId, placement };
  }

  function roomItems(state, catalog, roomId = "room.huaguo") {
    const value = normalizeState(state);
    const placements = value.rooms[roomId]?.placements || [];
    const byId = new Map();
    Object.values(catalog?.episodes || {}).forEach((episode) => {
      (episode.items || []).forEach((item) => byId.set(item.id, item));
    });
    return placements.map((placement) => ({ ...placement, item: clone(byId.get(placement.item_id) || null) }));
  }

  // Generic storybook completion marker.  The browser still mirrors SP to the
  // shared ``bookplay_sp`` storage key, while this pure helper makes first-pass
  // idempotency testable without a DOM or localStorage implementation.
  function grantCompletion(state, { episode, passed = false, score = 0, spAmount = 10, date } = {}) {
    const value = syncDay(normalizeState(state), date);
    const key = episodeKey(episode);
    const progress = value.progress.episodes[key] && typeof value.progress.episodes[key] === "object"
      ? value.progress.episodes[key] : {};
    value.progress.episodes[key] = progress;
    progress.quiz_score = Math.max(Number(progress.quiz_score) || 0, Math.max(0, Math.min(1, Number(score) || 0)));
    if (!passed) return { state: value, granted: false, reason: "not_passed", sp_awarded: 0 };
    if (progress.completion_granted || progress.sp_granted) {
      progress.completion_granted = true;
      return { state: value, granted: false, reason: "already_granted", sp_awarded: 0 };
    }
    const amount = Math.max(0, Number(spAmount) || 0);
    value.sp += amount;
    progress.completion_granted = true;
    progress.sp_granted = true;
    progress.completed_at = date || new Date().toISOString();
    return { state: value, granted: true, reason: "granted", sp_awarded: amount };
  }

  return {
    SCHEMA_VERSION,
    normalizeState,
    storyBinding,
    episodeSticker,
    listEpisodeStickers,
    grantEpisodeSticker,
    stickerItems,
    prepareDrop,
    grantChoice,
    grantCompletion,
    roomItems,
  };
});
