import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => fs.readFileSync(path.join(dir, name), "utf8");

test("map exposes a permanent companion entry and a splash growth corner", () => {
  const html = read("map.html");
  const js = read("map.js");
  const css = read("map.css");
  assert.match(html, /id="companion-entry"/);
  assert.match(html, /companion\.html\?series=jttw/);
  assert.match(html, /id="splash-companion"/);
  assert.match(js, /renderCompanionSummary/);
  assert.match(css, /#splash-companion/);
});

test("the inn has companion care controls, travel journal, and collection links", () => {
  const html = read("companion.html");
  const js = read("companion.js");
  const css = read("companion.css");
  for (const id of ["companion-stage", "care-actions", "travel-journal", "room-scene"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /href="medals\.html\?series=jttw"/);
  assert.match(html, /href="stickers\.html\?series=jttw"/);
  assert.match(html, /href="room\.html\?series=jttw"/);
  assert.match(html, /class="inn-nav-art"/);
  assert.doesNotMatch(html, /id="medal-wall"/);
  assert.doesNotMatch(html, /id="sticker-book-grid"/);
  for (const action of ["feed", "groom", "play", "rest"]) {
    assert.match(html, new RegExp(`data-care="${action}"`));
  }
  assert.match(js, /evaluateAchievements/);
  assert.match(js, /recordCare/);
  assert.match(js, /stageArtCandidates/);
  assert.match(js, /\.svg/);
  assert.match(js, /CHAPTER_VISUALS/);
  assert.match(js, /pattern-/);
  assert.match(css, /\.shape-diamond/);
  assert.match(css, /\.pattern-clouds/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.inn-nav-art/);
  assert.match(css, /\.room-detail-only/);
  assert.match(html, /companion\.css\?v=15/);
  assert.match(html, /companion\.js\?v=15/);
});

test("successful companion loading can actually hide the retry error panel", () => {
  const css = read("companion.css");
  assert.match(css, /\.companion-error\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/i);
  assert.match(css, /\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/i);
});

test("companion page loads the shared logic before its controller", () => {
  const html = read("companion.html");
  assert.ok(html.indexOf("companion-core.js") >= 0);
  assert.ok(html.indexOf("companion.js") > html.indexOf("companion-core.js"));
});

test("medal wall leads with a recent-earned strip of at most 3 medals and an empty state", () => {
  const html = read("medals.html");
  const js = read("companion.js");
  const css = read("companion.css");
  assert.match(html, /id="recent-medals"/);
  assert.match(html, /id="recent-strip"/);
  assert.match(html, /id="recent-empty"/);
  assert.match(js, /recentMedals/);
  assert.match(js, /receipt\??\.at/);
  assert.match(js, /slice\(\s*0\s*,\s*3\s*\)/);
  assert.match(js, /recent-empty/);
  assert.match(css, /\.recent-medals/);
  assert.match(css, /\.recent-empty/);
});

test("medal wall filters all / earned / chapter / journey with a live count in memory only", () => {
  const html = read("medals.html");
  const js = read("companion.js");
  const css = read("companion.css");
  for (const filter of ["all", "earned", "chapter", "journey"]) {
    assert.match(html, new RegExp(`data-medal-filter="${filter}"`));
  }
  assert.match(html, /aria-pressed/);
  assert.match(html, /id="medal-filter-count"/);
  assert.match(js, /medalFilter/);
  assert.match(js, /kind === "chapter"/);
  assert.match(js, /kind === "journey"/);
  assert.doesNotMatch(js, /localStorage\.[a-z]+Item\([^)]*filter/i);
  assert.match(css, /\.medal-filter/);
  assert.match(css, /aria-pressed/);
});

test("every medal card carries a kind marker and an accessible status label", () => {
  const js = read("companion.js");
  assert.match(js, /data-kind=/);
  assert.match(js, /aria-label=/);
});

test("a prominent next-target card with art and progress sits between filters and the wall", () => {
  const html = read("medals.html");
  const js = read("companion.js");
  const css = read("companion.css");
  assert.match(html, /id="next-target-card"/);
  assert.match(js, /nextTargets\[0\]/);
  assert.match(js, /next-target-card/);
  assert.match(css, /\.next-target-card/);
});

test("勋章墙有首屏快捷入口，并排在长贴纸册之前", () => {
  const html = read("companion.html");
  assert.match(html, /id="medal-shortcut"[^>]+href="medals\.html\?series=jttw"/);
  assert.match(html, /id="companion-medal-link"[^>]+href="medals\.html\?series=jttw"/);
});

test("驿站拆成伙伴页、勋章页、贴纸页和小屋详情页，伙伴页不再承载长列表", () => {
  const companion = read("companion.html");
  const medals = read("medals.html");
  const stickers = read("stickers.html");
  const room = read("room.html");
  assert.match(companion, /href="medals\.html\?series=jttw"/);
  assert.match(companion, /href="stickers\.html\?series=jttw"/);
  assert.doesNotMatch(companion, /id="medal-wall"/);
  assert.doesNotMatch(companion, /id="sticker-book-grid"/);
  assert.match(medals, /id="medal-wall"/);
  assert.match(medals, /href="companion\.html\?series=jttw"/);
  assert.match(stickers, /id="sticker-chapter-grid"/);
  assert.match(stickers, /href="companion\.html\?series=jttw"/);
  assert.match(room, /id="room-scene"/);
  assert.match(room, /href="companion\.html\?series=jttw"/);
});

test("历史勋章和贴纸锚点会兼容跳转到拆分后的页面", () => {
  const js = read("companion.js");
  assert.match(js, /function redirectLegacyCollectionHash\(\)/);
  assert.match(js, /hash\.includes\("sticker"\).*stickers\.html/s);
  assert.match(js, /hash\.includes\("medal"\).*medals\.html/s);
  assert.match(js, /window\.location\.replace\(`\$\{target\}\$\{query\}`\)/);
});

test("花果山房间有固定玩具架、轻装饰入口和可跳过互动", () => {
  const html = read("room.html");
  const js = read("companion.js");
  const css = read("companion.css");
  assert.match(html, /id="toy-rack"/);
  assert.match(html, /id="toy-rack-items"/);
  assert.match(html, /轻装饰/);
  assert.match(js, /data-room-interaction/);
  assert.match(js, /可跳过/);
  assert.match(js, /toy-rack-items/);
  assert.match(css, /\.toy-rack/);
  assert.match(css, /\.room-item\.rack/);
});

test("故事贴纸册先展示十三个图片篇章入口而不是108格库存筛选", () => {
  const html = read("stickers.html");
  const js = read("companion.js");
  const css = read("companion.css");
  for (const id of ["sticker-book", "sticker-chapter-grid", "sticker-chapter-view", "sticker-book-count"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(html, /id="sticker-book-filter"/);
  assert.match(html, /id="chapter-map-back"/);
  assert.match(js, /stickerItems/);
  assert.match(js, /URLSearchParams/);
  assert.match(js, /data-sticker-chapter/);
  assert.match(js, /sticker-chapter-grid/);
  assert.match(js, /sticker-chapter-cover/);
  assert.match(js, /stickerStoryCover/);
  assert.match(js, /theme\.detail_asset/);
  assert.match(js, /storybooks\/catalog\.json/);
  assert.match(js, /decorateStickerItem/);
  assert.match(css, /\.sticker-chapter-grid/);
  assert.match(css, /\.sticker-chapter-card/);
  assert.match(css, /body\.stickers-page \.sticker-chapter-card/);
});

test("篇章详情图多字少，已解锁与未解锁贴纸都能打开全屏详情", () => {
  const html = read("stickers.html");
  const js = read("companion.js");
  const css = read("companion.css");
  for (const id of ["chapter-scene", "chapter-sticker-grid", "chapter-prev", "chapter-next"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(js, /sticker-art-image/);
  assert.match(js, /story_image/);
  assert.match(css, /story-scene-image/);
  assert.match(js, /item\.asset/);
  assert.match(js, /已获得/);
  assert.match(js, /data-sticker-id/);
  assert.match(js, /data-sticker-owned/);
  assert.match(js, /openSticker/);
  assert.match(js, /sticker-dialog-description/);
  assert.match(js, /source_label_zh/);
  assert.doesNotMatch(js, /if \(!item \|\| !item\.owned\) return/);
  assert.match(html, /id="sticker-dialog"/);
  assert.match(html, /id="sticker-dialog-title"/);
  assert.match(html, /id="sticker-dialog-description"/);
  assert.match(css, /\.chapter-scene/);
  assert.match(css, /\.chapter-sticker-grid/);
  assert.match(css, /\.sticker-card/);
  assert.match(css, /#sticker-dialog/);
  assert.match(css, /min\(92vh/);
});

test("小白龙在花果山房间里回应故事纪念品", () => {
  const html = read("room.html");
  const js = read("companion.js");
  const css = read("companion.css");
  assert.match(html, /id="room-companion"/);
  assert.match(html, /id="room-companion-image"/);
  assert.match(html, /id="room-reaction"/);
  assert.match(js, /room-companion/);
  assert.match(js, /reaction-/);
  assert.match(js, /data-room-interaction/);
  assert.match(css, /\.room-companion/);
  assert.match(css, /\.room-reaction/);
  assert.match(css, /prefers-reduced-motion/);
});

test("巩固完成时自动收下一张本关贴纸，且大件三选一仍单独显示", () => {
  const js = read("lesson.js");
  const css = read("lesson.css");
  assert.match(js, /grantEpisodeSticker/);
  assert.match(js, /episode-sticker-reward/);
  assert.match(js, /stickers\.html\?series=jttw/);
  assert.match(css, /\.episode-sticker-reward/);
});

test("巩固完成卡片优先显示本关贴纸 PNG，加载失败才回退 glyph", () => {
  const js = read("lesson.js");
  const renderSticker = js.match(/function renderEpisodeSticker\(item\) \{([\s\S]*?)\n\}\n\nfunction launchRewardConfetti/);
  assert.ok(renderSticker, "renderEpisodeSticker should remain a standalone renderer");
  assert.match(renderSticker[1], /item\.asset/);
  assert.match(renderSticker[1], /episode-sticker-art-image/);
  assert.match(renderSticker[1], /onerror=/);
  assert.match(renderSticker[1], /episode-sticker-glyph-fallback/);
});

test("勋章卡全部可见但只读，使用 GPT 图片并标出未解锁状态", () => {
  const js = read("companion.js");
  const css = read("companion.css");
  const art = js.match(/function medalArtMarkup\(item\) \{([\s\S]*?)\n\}/);
  assert.ok(art, "medalArtMarkup should remain a standalone renderer");
  assert.match(art[1], /item\.asset/);
  assert.match(art[1], /medal-art-image/);
  assert.match(art[1], /medal-art-glyph-fallback/);
  assert.match(js, /medal-lock/);
  assert.match(js, /aria-haspopup="dialog"/);
  assert.match(css, /\.medal-card\.future/);
  assert.match(css, /\.medal-lock/);
});

test("点击任意勋章打开大图、解释与动态预览，且减少动效可关闭动画", () => {
  const html = read("medals.html");
  const js = read("companion.js");
  const css = read("companion.css");
  for (const id of ["dialog-status", "dialog-description", "dialog-motion"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(js, /dialog-status/);
  assert.match(js, /dialog-description/);
  assert.match(js, /dialog-motion/);
  assert.match(css, /medal-dialog-float/);
  assert.match(css, /prefers-reduced-motion/);
});

test("Minecraft 贴纸页使用 series 命名空间与两本绘本数据", () => {
  const js = read("companion.js");
  assert.match(js, /SERIES_ID.*minecraft/);
  assert.match(js, /storybooks-minecraft\/catalog\.json/);
  assert.match(js, /rewards\/storybooks\.json/);
  assert.match(js, /bookplay_storybook_rewards_v1/);
  assert.match(js, /room\.minecraft/);
  assert.match(js, /minecraft-story-scenes-v1/);
  assert.match(js, /STICKER_UNIT/);
});

test("Minecraft 收藏页使用页面上下文计数并避免空状态重复占位", () => {
  const html = read("medals.html");
  const js = read("companion.js");
  const css = read("companion.css");
  assert.match(html, /id="top-medal-count"/);
  assert.match(js, /medals-page/,
    "top capsule must know the current collection page");
  assert.match(js, /3.*勋章|勋章.*3/,
    "Minecraft medal context must expose three medals");
  assert.match(js, /recent-empty[\s\S]{0,180}hidden|recent-medals[\s\S]{0,180}hidden/,
    "empty recent medals should not take a full first-screen block");
  assert.match(css, /body\.minecraft-page[\s\S]{0,300}(?:next-target-card|recent-medals)/,
    "Minecraft can compact duplicate target/recent sections without changing JTTW");
});

test("Minecraft 伙伴页的三个分区卡片改用 Minecraft 资产而不是西游默认图", () => {
  const js = read("companion.js");
  assert.match(js, /minecraft\/rewards\/badges\/first-block\.png/);
  assert.match(js, /minecraft\/rewards\/badges\/block-expedition-complete\.png/);
  assert.match(js, /minecraft\/rewards\/stickers\/golden-helmet\.png/);
  assert.match(js, /minecraft\/rewards\/stickers\/nether-portal-shard\.png/);
  assert.match(js, /assets\/collections\/mc01\.jpg/);
});

test("Minecraft companion state keeps its own companion id", () => {
  const js = read("companion-core.js");
  assert.doesNotMatch(js, /value\.companion\s*=\s*"white-dragon-horse"/,
    "shared state normalization must not stamp Minecraft as the white dragon horse");
  assert.match(js, /companionId|minecraft-byte|preserve/i,
    "normalization needs an explicit series-safe companion identity");
});
