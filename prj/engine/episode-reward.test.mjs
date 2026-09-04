import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const core = require("./episode-reward.js");
const dir = path.dirname(fileURLToPath(import.meta.url));

const catalog = {
  schema_version: 1,
  daily_drop_cap: 2,
  sticker_count: 108,
  sticker_themes: [
    {
      chapter: 1,
      from: 1,
      to: 7,
      title_zh: "石猴出世",
      title_en: "Stone Monkey Beginnings",
      motifs: [
        { id: "stone", title_zh: "仙石", title_en: "Celestial Stone", glyph: "🪨", type: "decor" },
        { id: "peach", title_zh: "仙桃", title_en: "Peach", glyph: "🍑" },
      ],
    },
    {
      chapter: 2,
      from: 8,
      to: 13,
      title_zh: "天宫风云",
      title_en: "Havoc in Heaven",
      motifs: [{ id: "cloud", title_zh: "云朵", title_en: "Cloud", glyph: "☁️" }],
    },
  ],
  rooms: {
    "room.huaguo": { title: "花果山", default_slot: "shelf.left" },
  },
  episodes: {
    "1": {
      room: "room.huaguo",
      items: [
        { id: "item.stone_shard", title_en: "Stone Shard", title_zh: "仙石碎片", slot: "shelf.left" },
        { id: "item.light_bead", title_en: "Heaven Light", title_zh: "天光珠", slot: "shelf.center" },
        { id: "item.peach_pip", title_en: "Peach Pip", title_zh: "桃核", slot: "floor.left" },
      ],
    },
  },
};

test("首次巩固达标提供三个未拥有的剧情物品", () => {
  const result = core.prepareDrop({
    state: {},
    episode: 1,
    passed: true,
    catalog,
    date: "2026-09-01",
  });
  assert.equal(result.offered, true);
  assert.deepEqual(result.items.map((item) => item.id), [
    "item.stone_shard",
    "item.light_bead",
    "item.peach_pip",
  ]);
  assert.equal(result.reason, "eligible");
});

test("通用绘本完成奖励只在首次达标时发 SP，并保留最好分数", () => {
  const first = core.grantCompletion({}, { episode: 1, passed: true, score: 0.8, spAmount: 10, date: "2026-09-01" });
  assert.equal(first.granted, true);
  assert.equal(first.sp_awarded, 10);
  assert.equal(first.state.sp, 10);
  assert.equal(first.state.progress.episodes["1"].sp_granted, true);
  const repeat = core.grantCompletion(first.state, { episode: 1, passed: true, score: 0.9, spAmount: 10, date: "2026-09-02" });
  assert.equal(repeat.granted, false);
  assert.equal(repeat.reason, "already_granted");
  assert.equal(repeat.state.sp, 10);
  assert.equal(repeat.state.progress.episodes["1"].quiz_score, 0.9);
});

test("选中物品后写入 owned、固定房间槽位和幂等掉落标记", () => {
  const offered = core.prepareDrop({
    state: {},
    episode: 1,
    passed: true,
    catalog,
    date: "2026-09-01",
  });
  const first = core.grantChoice(offered.state, {
    episode: 1,
    itemId: "item.light_bead",
    catalog,
    date: "2026-09-01",
    acquiredAt: "2026-09-01T10:00:00.000Z",
  });
  assert.equal(first.granted, true);
  assert.equal(first.state.inventory["item.light_bead"].owned, true);
  assert.deepEqual(first.state.rooms["room.huaguo"].placements, [{
    item_id: "item.light_bead",
    slot: "shelf.center",
  }]);
  assert.equal(first.state.progress.episodes["1"].drop_granted, true);

  const repeat = core.grantChoice(first.state, {
    episode: 1,
    itemId: "item.light_bead",
    catalog,
    date: "2026-09-01",
  });
  assert.equal(repeat.granted, false);
  assert.equal(repeat.reason, "already_granted");
  assert.equal(repeat.state.daily.drops, 1);
  assert.equal(repeat.state.rooms["room.huaguo"].placements.length, 1);
});

test("重复活动不会掉落，达到每日上限后停止提供永久物品", () => {
  const first = core.grantChoice({}, {
    episode: 1,
    itemId: "item.stone_shard",
    catalog,
    date: "2026-09-01",
  });
  const second = core.grantChoice(first.state, {
    episode: 1,
    itemId: "item.light_bead",
    catalog,
    date: "2026-09-01",
  });
  const capped = core.prepareDrop({
    state: second.state,
    episode: 1,
    passed: true,
    catalog,
    date: "2026-09-01",
  });
  assert.equal(capped.offered, false);
  assert.equal(capped.reason, "already_granted");
  assert.equal(capped.state.daily.drops, 1, "同一集第二次选择不能重复计数");

  const nextDay = core.prepareDrop({
    state: second.state,
    episode: 1,
    passed: true,
    catalog,
    date: "2026-09-02",
  });
  assert.equal(nextDay.offered, false);
  assert.equal(nextDay.reason, "already_granted");
});

test("未达标或未知物品不会写入库存", () => {
  const notPassed = core.prepareDrop({ state: {}, episode: 1, passed: false, catalog, date: "2026-09-01" });
  assert.equal(notPassed.offered, false);
  assert.equal(notPassed.reason, "not_passed");
  const invalid = core.grantChoice({}, { episode: 1, itemId: "item.unknown", catalog, date: "2026-09-01" });
  assert.equal(invalid.granted, false);
  assert.equal(invalid.reason, "invalid_item");
  assert.deepEqual(invalid.state.inventory, {});
});

test("每个已完成关卡生成确定性的故事贴纸，且不占房间槽位", () => {
  const sticker = core.episodeSticker(catalog, 1);
  assert.equal(sticker.id, "sticker.ep001");
  assert.equal(sticker.category, "sticker");
  assert.equal(sticker.chapter, 1);
  assert.equal(sticker.title_zh, "仙石贴纸");
  assert.equal(sticker.glyph, "🪨");
  assert.equal(sticker.display_mode, "sticker-book");
  assert.equal(sticker.fridge_magnet, true);
  assert.equal(sticker.story_element_type, "decor");

  const result = core.grantEpisodeSticker({}, {
    episode: 1,
    completed: true,
    catalog,
    date: "2026-09-01",
    acquiredAt: "2026-09-01T10:00:00.000Z",
  });
  assert.equal(result.granted, true);
  assert.equal(result.item.id, "sticker.ep001");
  assert.equal(result.state.stickers["sticker.ep001"].owned, true);
  assert.equal(result.state.progress.episodes["1"].sticker_granted, true);
  assert.deepEqual(result.state.rooms, {});
  assert.equal(result.state.daily.drops, 0, "贴纸不占用大件奖励每日上限");
});

test("同一关重复完成不会重复获得贴纸，未完成也不会提前发放", () => {
  const pending = core.grantEpisodeSticker({}, { episode: 1, completed: false, catalog, date: "2026-09-01" });
  assert.equal(pending.granted, false);
  assert.equal(pending.reason, "not_completed");

  const first = core.grantEpisodeSticker(pending.state, {
    episode: 1,
    completed: true,
    catalog,
    date: "2026-09-01",
  });
  const repeat = core.grantEpisodeSticker(first.state, {
    episode: 1,
    completed: true,
    catalog,
    date: "2026-09-02",
  });
  assert.equal(repeat.granted, false);
  assert.equal(repeat.reason, "already_granted");
  assert.equal(Object.keys(repeat.state.stickers).length, 1);
});

test("旧版奖励存档缺少贴纸字段时安全补齐，并可列出全套贴纸", () => {
  const normalized = core.normalizeState({ progress: { episodes: { "1": { drop_granted: true } } } });
  assert.deepEqual(normalized.stickers, {});
  const stickers = core.listEpisodeStickers(catalog);
  assert.equal(stickers.length, 108);
  assert.equal(stickers.at(-1).id, "sticker.ep108");
});

test("无效关卡不会创建幽灵贴纸进度记录", () => {
  const result = core.grantEpisodeSticker({}, { episode: 999, completed: true, catalog, date: "2026-09-01" });
  assert.equal(result.granted, false);
  assert.equal(result.reason, "invalid_episode");
  assert.deepEqual(result.state.progress.episodes, {});
});

test("P2 目录提供固定玩具架、轻装饰槽位和至少十三件篇章纪念物", () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(dir, "..", "data", "rewards", "jttw.json"), "utf8"));
  const room = catalog.rooms?.["room.huaguo"];
  assert.ok(room?.toy_rack, "花果山房间必须声明固定玩具架");
  assert.ok(Array.isArray(room.toy_rack.slots) && room.toy_rack.slots.length >= 3);
  assert.ok(Array.isArray(room.decor_slots) && room.decor_slots.length >= 3);
  const items = Object.values(catalog.episodes || {}).flatMap((episode) => episode.items || []);
  const keepsakes = items.filter((item) => item.category === "chapter-keepsake");
  assert.ok(keepsakes.length >= 13, `篇章纪念物数量不足：${keepsakes.length}`);
  assert.ok(keepsakes.every((item) => item.interaction?.text_zh && item.interaction?.kind));
  assert.ok(keepsakes.some((item) => item.category === "chapter-keepsake" && item.slot.startsWith("rack.")));
  for (const episode of [13, 23, 31, 39, 48, 54, 63, 71, 79, 91, 99, 108]) {
    assert.ok(catalog.episodes[String(episode)]?.items?.length, `第 ${episode} 集缺少篇章纪念物`);
  }
});

test("大件奖励按故事用途分型，动物武器装备只是收藏主题不改变学习数值", () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(dir, "..", "data", "rewards", "jttw.json"), "utf8"));
  const items = Object.values(catalog.episodes || {}).flatMap((episode) => episode.items || []);
  const types = new Set(items.map((item) => item.reward_type).filter(Boolean));
  for (const type of ["decor", "toy", "animal", "weapon", "gear"]) assert.ok(types.has(type), `缺少 ${type} 类型`);
  assert.ok(items.filter((item) => ["animal", "weapon", "gear"].includes(item.reward_type)).every((item) => item.non_power === true));
});

test("真实奖励目录覆盖 108 关贴纸，并按 13 个篇章提供故事主题", () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(dir, "..", "data", "rewards", "jttw.json"), "utf8"));
  assert.equal(catalog.sticker_count, 108);
  assert.equal(catalog.sticker_themes.length, 13);
  assert.equal(catalog.story_image_template, "assets/generated/jttw-story-scenes-v1/ep{episode}.jpg");
  assert.ok(catalog.sticker_themes.every((theme) => theme.cover_asset && theme.detail_asset), "每个篇章必须有真实故事场景图");
  const stickers = core.listEpisodeStickers(catalog);
  assert.equal(stickers.length, 108);
  assert.equal(stickers[0].chapter, 1);
  assert.equal(stickers[107].chapter, 13);
  assert.ok(new Set(stickers.map((item) => item.story_element_type)).size >= 5);
  assert.equal(stickers[0].asset, "assets/generated/jttw-ep001-story-rewards/transparent/jttw-ep001-stone-shard.png");
  assert.equal(stickers[1].asset, "assets/generated/jttw-ep001-story-rewards/transparent/jttw-ep001-heaven-light.png");
  assert.equal(stickers[3].asset, "assets/generated/jttw-ep001-story-rewards/transparent/jttw-ep001-stream-splash.png");
  assert.equal(stickers[4].asset, "assets/generated/jttw-ep001-story-rewards/transparent/jttw-ep001-waterfall-gate.png");
  assert.equal(stickers[5].asset, "assets/generated/jttw-ep001-story-rewards/transparent/jttw-ep001-brave-ribbon.png");
  assert.equal(stickers[6].asset, "assets/generated/jttw-ep001-story-rewards/transparent/jttw-ep001-water-curtain-token.png");
  assert.equal(stickers.find((item) => item.motif_id === "dragon")?.asset, "assets/generated/jttw-story-stickers-v1/transparent/dragon.png");
  assert.equal(stickers[7].story_image, "assets/generated/jttw-story-scenes-v1/ep008.jpg");
  assert.ok(stickers.every((item) => item.story_image), "每关贴纸都必须绑定故事场景缩略图");
});

test("Minecraft 前两本奖励各自绑定真实故事场景，不循环旧图集", () => {
  const payload = JSON.parse(fs.readFileSync(path.join(dir, "..", "data", "rewards", "storybooks.json"), "utf8"));
  const catalog = payload.storybooks.minecraft;
  assert.equal(catalog.sticker_count, 2);
  assert.equal(catalog.sticker_themes.length, 2);
  assert.equal(catalog.story_image_template, "assets/generated/storybooks/minecraft-story-scenes-v1/book{episode}.jpg");
  const stickers = core.listEpisodeStickers(catalog);
  assert.deepEqual(stickers.map((item) => item.id), ["sticker.ep001", "sticker.ep002"]);
  assert.deepEqual(stickers.map((item) => item.story_image), [
    "assets/generated/storybooks/minecraft-story-scenes-v1/book001.jpg",
    "assets/generated/storybooks/minecraft-story-scenes-v1/book002.jpg",
  ]);
  for (const [episode, config] of Object.entries(catalog.episodes)) {
    assert.equal(config.items.length, 3, `Minecraft 第 ${episode} 本应有 3 件可选纪念物`);
    config.items.forEach((item) => {
      assert.equal(item.non_power, true);
      assert.ok(item.story_binding?.storybook_pages?.length, item.id);
      assert.ok(item.story_binding?.scene_ids?.length, item.id);
      assert.ok(item.story_binding?.trigger_terms?.length, item.id);
      assert.ok(item.asset.includes("minecraft-story-scenes-v1"), item.id);
      assert.ok(fs.existsSync(path.join(dir, "..", "data", item.asset)), item.asset);
    });
  }
});

test("EP1 贴纸覆盖保留故事出处，避免循环图集与剧情错配", () => {
  const rewards = JSON.parse(fs.readFileSync(path.join(dir, "..", "data", "rewards", "jttw.json"), "utf8"));
  const ep1 = core.listEpisodeStickers(rewards).slice(0, 7);
  assert.deepEqual(ep1.map((item) => item.title_zh), [
    "裂开的仙石贴纸", "天光珠贴纸", "桃核贴纸", "小溪水花贴纸", "瀑布门贴纸", "勇气彩带贴纸", "水帘洞信物贴纸",
  ]);
  for (const item of ep1) {
    assert.ok(item.story_binding?.storybook_pages?.length, item.id);
    assert.ok(item.story_binding?.scene_ids?.length, item.id);
    assert.ok(item.source_label_zh, item.id);
  }
});

test("EP1 奖励携带可复核的绘本页、场景、时间轴和重点词绑定", () => {
  const rewards = JSON.parse(fs.readFileSync(path.join(dir, "..", "data", "rewards", "jttw.json"), "utf8"));
  const story = JSON.parse(fs.readFileSync(path.join(dir, "..", "..", "content", "storybooks", "ep1.json"), "utf8"));
  const pages = new Map((story.pages || []).map((page) => [Number(page.page_no), page]));
  const scenes = new Map((story.scenes || []).map((scene) => [String(scene.id), scene]));
  const items = rewards.episodes?.["1"]?.items || [];
  assert.equal(items.length, 3);
  for (const item of items) {
    const binding = core.storyBinding(rewards, 1, item.id);
    assert.ok(binding, `${item.id} 缺少 story_binding`);
    assert.ok(binding.storybook_pages.length > 0);
    assert.ok(binding.scene_ids.length > 0);
    assert.ok(binding.trigger_terms.length > 0);
    assert.ok(binding.video && binding.video.end_sec > binding.video.start_sec);
    for (const pageNo of binding.storybook_pages) assert.ok(pages.has(pageNo), `${item.id} 引用了不存在的绘本页 ${pageNo}`);
    for (const sceneId of binding.scene_ids) assert.ok(scenes.has(sceneId), `${item.id} 引用了不存在的小节 ${sceneId}`);
    const start = binding.video.start_sec;
    const end = binding.video.end_sec;
    assert.ok(start >= 0 && end <= Number(story.audio_duration_sec) + 0.01);
  }
  assert.equal(core.storyBinding(rewards, 1, "item.missing"), null);
  assert.equal(core.storyBinding(rewards, 999, items[0].id), null);
});

test("奖励首次领取触发轻量礼花，并尊重减少动效偏好", () => {
  const lesson = fs.readFileSync(path.join(dir, "lesson.js"), "utf8");
  const css = fs.readFileSync(path.join(dir, "lesson.css"), "utf8");
  assert.match(lesson, /function launchRewardConfetti\(\)/);
  assert.match(lesson, /launchRewardConfetti\(\);/);
  assert.match(css, /\.reward-confetti/);
  assert.match(css, /prefers-reduced-motion/);
});
