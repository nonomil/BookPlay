import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(dir, "map.html"), "utf8");
const js = fs.readFileSync(path.join(dir, "map.js"), "utf8");
const css = fs.readFileSync(path.join(dir, "map.css"), "utf8");

test("splash wiring is complete before map initialization calls it", () => {
  assert.match(js, /function\s+splash\s*\(\)/, "map.js must define splash()");
  assert.match(js, /\bsplash\(\);/, "map initialization must invoke splash()");
  assert.equal(html.includes('id="map-splash"'), true, "map.html must provide splash DOM");
});

test("map assets use matching positive cache versions", () => {
  const cssVersion = html.match(/href="map\.css\?v=(\d+)"/)?.[1];
  const jsVersion = html.match(/src="map\.js\?v=(\d+)"/)?.[1];
  assert.ok(cssVersion, "map.css must have a numeric cache version");
  assert.ok(jsVersion, "map.js must have a numeric cache version");
  assert.equal(jsVersion, cssVersion, "map CSS and JS cache versions must advance together");
  assert.ok(Number(jsVersion) > 0, "map cache version must be positive");
});

test("collection page presents a multi-episode title, range, and story summary", () => {
  // 2026-09-12 全屏改版：辑信息行并入集详情弹层，页头整行移除
  assert.doesNotMatch(js, /class="page-head"/, "page header row is fully removed for the full-bleed map");
  assert.doesNotMatch(js, /class="page-range"/, "range pill removed with the header");
  assert.match(js, /function openEpisodeDetail/, "episode detail overlay carries the title context now");
  assert.doesNotMatch(js, /function\s+stripHTML/, "tiny duplicate episode-number strip must be removed");
});

test("episode cards put the episode number in the readable title and expose pronunciation", () => {
  assert.match(js, /class="episode-title"/, "episode card needs a primary readable title");
  assert.match(js, /class="episode-number"/, "episode number needs its own readable title line");
  assert.match(js, /class="episode-name"/, "story name must remain visible beside or below the number");
  assert.match(js, /第\$\{n\}\$\{SERIES\.unit\}/, "episode number must be part of the episode title");
  // 2026-09-12 用户要求移除卡片喇叭按钮
  assert.doesNotMatch(js, /class="node-speak"/, "speaker button removed from cards by user request");
  assert.match(css, /\.episode-title\s*\{[^}]*font-size:\s*clamp\(0\.78rem/s,
    "episode titles must remain visibly larger than the removed tiny pips");
});

test("entering or switching a collection schedules its narration", () => {
  assert.match(js, /MAP_AUDIO_URL/, "map must load its pre-generated Edge-TTS manifest");
  assert.match(js, /mapAudio\.collections/, "collection narration must prefer generated audio");
  assert.match(js, /mapAudio\.episodes/, "episode pronunciation must prefer generated audio");
  assert.match(js, /new Audio\(/, "map must play generated audio files");
  assert.match(js, /function\s+speakCollection\s*\(/, "map needs collection narration behavior");
  assert.match(js, /scheduleCollectionNarration\(initialIndex\(\)\)/,
    "initial collection must narrate automatically");
  assert.match(js, /scheduleCollectionNarration\(i\)/,
    "newly visible collections must narrate after navigation");
});

test("short landscape maps switch from the zigzag to a readable compact route", () => {
  assert.match(js, /route\.classList\.add\("compact"/, "short routes need a compact layout mode");
  assert.match(css, /\.route\.compact\s*\{/, "compact routes need an explicit grid layout");
});

test("desktop route is an open three-row S polyline with round dashed markers", () => {
  assert.match(js, /function zigzagPoints/, "desktop geometry must be an open zigzag");
  assert.match(js, /function zigzagPath/, "the visible route must be a polyline/path");
  assert.doesNotMatch(js, /function ringGeom|function ringPoint|function ringPath/,
    "closed ring geometry must not remain as a desktop consumer");
  assert.doesNotMatch(js, /zigzagPath[\s\S]{0,220}\bZ\b/,
    "the zigzag path helper must not close with Z");
  assert.match(js, /n <= 3 \? 1 : n <= 6 \? 2 : 3/,
    "collections grow into at most three S-shaped rows");
  assert.match(js, /laneFor\(count, c, !ltr\)/,
    "even rows run left-to-right and odd rows reverse into an S");
  assert.match(js, /const laneCount = Math\.max\(2, maxCount \* 2\)/,
    "adjacent rows use interleaved lanes for diagonal connectors");
  assert.match(js, /const nodeHeight = nodes\.reduce\([\s\S]{0,180}offsetHeight/,
    "row spacing must account for the rendered card height");
  assert.match(js, /const denseRows = nodeWidth > 0 && requiredSpanX > spanX/,
    "narrow routes need a width-aware dense-row fallback");
  assert.match(js, /const targetSpanY = Math\.max\(requestedSpanY, minSpanY\)/,
    "legacy top/bottom insets must not compress rows below the card height");
  assert.match(js, /const verticalBias = spanY > requestedSpanY[\s\S]*Math\.min\(20/,
    "expanded three-row routes should keep a small safe gap below the page header");
  assert.match(css, /\.route-line \.rl-out[\s\S]*stroke-dasharray:\s*1\.2 15/,
    "the outer track must read as round dotted segments");
  assert.match(css, /\.route-line \.rl-in[\s\S]*stroke-dasharray:\s*0\.2 16/,
    "the inner track must keep a round dotted/bead look");
  assert.match(css, /stroke-linecap:\s*round/, "dashed route ends must stay round-capped");
});

test("progress companion binds to current or last done node and respects reduced motion", () => {
  assert.match(js, /className = "route-companion"/, "the route needs a companion marker");
  assert.match(js, /aria-label", "当前进度伙伴"/, "companion marker needs an accessible name");
  assert.match(js, /el\.classList\.contains\("current"\)/,
    "companion prefers the first current node");
  assert.match(js, /el\.classList\.contains\("done"\)/,
    "companion falls back to the last done node");
  assert.match(js, /return lastDone >= 0 \? lastDone : 0/,
    "empty progress parks the companion on the first node");
  assert.match(css, /\.route-companion\s*\{[^}]*transition:\s*left 0\.55s ease, top 0\.55s ease/s,
    "progress changes should slide the companion along the route");
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*\.route-companion\s*\{[^}]*transition:\s*none/s,
    "reduced motion must disable companion travel");
  assert.match(js, /route\.dataset\.unlocked !== "true"/,
    "locked collections should not show a misleading progress companion");
  assert.doesNotMatch(js, /route-companion[\s\S]{0,400}[😀-🙏🌀-🗿🚀-🧿]/u,
    "companion artwork must not use emoji as the UI icon");
});

test("Minecraft 路线保留 Byte 入口并隔离勋章存档", () => {
  assert.match(js, /SERIES_ID === "minecraft"\s*\?\s*"\/data\/achievements\/minecraft\.json"/);
  assert.match(js, /SERIES_ID === "minecraft"\s*\?\s*"\/data\/companions\/block-buddy\.json"/);
  assert.match(js, /const ACHIEVEMENTS_STORAGE_KEY = SERIES_ID === "minecraft"/);
  assert.match(js, /const supportsCompanion = SERIES_ID === "jttw" \|\| SERIES_ID === "minecraft"/);
  assert.match(js, /companion\.html\?series=\$\{SERIES_ID\}/);
  assert.match(js, /route-companion-avatar/);
  assert.match(css, /\.route-companion-avatar/);
});

test("Minecraft 地图的用户可见文案必须按绘本单位生成", () => {
  assert.doesNotMatch(html, /完成一集，点亮第一枚/,
    "静态 splash 文案不能把 Minecraft 绘本写成西游集数");
  assert.match(js, /splash-medal-empty[\s\S]{0,260}(?:一本|本)/,
    "splash 空状态需要由系列单位生成");
  assert.match(js, /SERIES\.unit[\s\S]{0,160}先学完上/,
    "锁定提示需要读取 Minecraft 的‘本’单位");
});

test("route companion is enlarged and parked outside the active cover", () => {
  assert.match(css, /\.route-companion\s*\{[^}]*width:\s*72px[^}]*height:\s*96px/s,
    "the desktop companion should be visibly larger than the old 36x48 marker");
  assert.match(css, /\.route-companion\s*\{[^}]*aspect-ratio:\s*3\s*\/\s*4[^}]*transform:\s*translate\(-50%,\s*-50%\)/s,
    "the enlarged sprite must preserve its fixed portrait ratio");
  assert.match(js, /function\s+companionPlacement\s*\(/,
    "companion placement should be computed independently from the card center");
  assert.match(js, /(?:dataset\.placement|setAttribute\("data-placement")\s*[=,]\s*target\.placement/,
    "the chosen outside-card side should remain inspectable for responsive layouts");
  assert.match(js, /selfOverlap\s*\*\s*1000[\s\S]*neighborOverlap\s*\*\s*100/,
    "placement scoring must reject positions that cover a card");
  assert.match(js, /name:\s*"below-forward"[\s\S]*forwardOffset/,
    "the companion should bias its stop toward the next dotted-route segment");
  assert.match(js, /mark,\s*forwardDirection,\s*points\?\.\[i\]\s*\|\|\s*null/,
    "regular route placement should receive the active dotted-line anchor");
  assert.match(js, /bottom:\s*candidate\.line\s*\?\s*cy\s*:\s*cy\s*\+\s*mh\s*\/\s*2/,
    "non-line companion candidates must use their full portrait height");
  assert.match(css, /\.route-companion\[data-placement\^="line-"\][\s\S]*transform:\s*translate\(-50%,\s*-100%\)/,
    "line-anchored companions must use a stable foot-anchor transform");
  assert.match(js, /const LINE_COMPANION_GAP = 6/,
    "line companions should sit closer to the title side of the card");
  assert.match(js, /cx: nodeBox\.right \+ mw \/ 2 \+ LINE_COMPANION_GAP/,
    "east line stops should keep a small gap outside the card");
  assert.match(js, /Math\.max\(Number\(lineAnchor\.y\), coverBottom\) \+ LINE_COMPANION_FOOT_OFFSET/,
    "line stops should place the companion feet on the dotted route");
  assert.match(css, /--node-lift:\s*clamp\(14px,\s*3\.5vh,\s*28px\)/,
    "regular cards should rise enough to expose a visible walking lane");
  assert.match(css, /\.route\.compact\s+\.node\s*\{[^}]*--node-lift:\s*0px/s,
    "compact grid cards must not inherit the desktop lift");
  assert.match(css, /\.route\.compact\s+\.route-companion\s*\{[^}]*width:\s*54px[^}]*height:\s*72px/s,
    "compact routes should use a smaller but still proportional companion");
});

test("JTTW route companion uses the generated fixed-ratio walk atlas", () => {
  assert.match(js, /routeCompanionSpriteUrl[\s\S]{0,320}wukong-walk-atlas\.png/,
    "the JTTW map must point at the generated Wukong four-direction atlas");
  assert.match(js, /ROUTE_COMPANION_SPRITE_URL = routeCompanionSpriteUrl\(\)/,
    "the sprite URL must go through the per-series resolver");
  assert.match(js, /mikey-jj-route-companion\/transparent\/mikey-walk-atlas\.png/,
    "the Mikey & JJ map must point at its own walk atlas");
  assert.match(js, /routeCompanionSpriteReady/,
    "sprite must be probed before use so a missing atlas falls back to the placeholder");
  assert.match(js, /route-companion-sprite/,
    "companion markup must opt into the animated sprite class");
  assert.match(css, /\.route-companion-sprite\s*\{[\s\S]*background-size:\s*800% 400%[\s\S]*animation:\s*route-companion-walk 0\.96s steps\(8, end\)/,
    "the sprite must reserve eight frames across four direction rows");
  assert.match(css, /\.route-companion-sprite\s*\{[\s\S]*animation-play-state:\s*running/,
    "a parked companion should keep looping its in-place walk cycle");
  assert.match(css, /@keyframes route-companion-walk[\s\S]*background-position-x:\s*100%/,
    "the route companion must advance across all sprite frames");
  assert.match(css, /prefers-reduced-motion:[\s\S]*\.route-companion-sprite\s*\{[^}]*animation:\s*none/s,
    "reduced-motion users must receive a stable first frame");
  assert.match(css, /\.route-companion\s*\{[^}]*background:\s*transparent[^}]*filter:\s*drop-shadow/s,
    "the companion should show only the transparent character without a halo panel");
});

test("JTTW route companion atlas supports four walking directions", () => {
  assert.match(js, /wukong-walk-atlas\.png/,
    "the JTTW map must use the four-direction atlas");
  assert.match(js, /function\s+companionDirection\s*\(/,
    "direction selection should be isolated and testable");
  assert.match(js, /data-direction/,
    "the companion element must expose its active direction");
  assert.match(js, /Math\.abs\(dx\)[\s\S]*Math\.abs\(dy\)/,
    "direction selection must compare the route segment axes");
  assert.match(css, /background-size:\s*800% 400%/,
    "the atlas must reserve eight frames across four direction rows");
  assert.match(css, /data-direction="south"/,
    "south/down movement needs a front-facing row");
  assert.match(css, /data-direction="north"/,
    "north/up movement needs a back-facing row");
  assert.match(css, /background-position-y:\s*33\.333%/,
    "direction rows must map to stable atlas offsets");
  assert.match(css, /@keyframes route-companion-walk[\s\S]*background-position-x:\s*100%/,
    "directional rows must still advance through all eight walk frames");
});

test("hovering a route card steers the companion without changing progress", () => {
  assert.match(js, /function\s+bindCompanionHover\s*\(/,
    "each route needs explicit companion hover wiring");
  assert.match(js, /pointerenter/, "card hover must be handled with pointerenter");
  assert.match(js, /pointerleave/, "leaving a card must restore the progress companion");
  assert.match(js, /function\s+setCompanionHoverTarget\s*\(/,
    "hover targets should be isolated from progress placement");
  assert.match(js, /data-hovering/, "the active hover state must remain inspectable");
  assert.match(js, /hoverDirection[\s\S]{0,220}west[\s\S]{0,220}east/,
    "left and right cards must choose opposing walking directions");
  assert.match(js, /bindCompanionHover\(route\)/,
    "route hover wiring must be installed when pages are built");
});

test("the map companion can keep an in-place walk cycle when reduced motion is enabled", () => {
  assert.match(js, /route-motion-enabled/,
    "the map's explicitly requested game animation needs an opt-in class");
  assert.match(css, /\.route-companion-sprite\.route-motion-enabled\s*\{[\s\S]*animation:\s*route-companion-walk 1\.8s steps\(7, end\)/,
    "the opt-in class must keep the companion walking in place");
  assert.match(css, /prefers-reduced-motion:[\s\S]*\.route-companion-sprite\.route-motion-enabled\s*\{[\s\S]*animation:\s*route-companion-walk 1\.8s steps\(7, end\)/,
    "the explicit companion game animation must win over reduced-motion's global sprite reset");
});

test("hover travel advances in sprite-sized steps at a slower walking pace", () => {
  assert.match(css, /\.route-companion\.route-motion-enabled\s*\{[\s\S]*transition:\s*left 1\.8s steps\(7, end\), top 1\.8s steps\(7, end\)/,
    "hover travel should step along the route instead of appearing as a smooth slide");
  assert.match(css, /\.route-companion-sprite\.route-motion-enabled\s*\{[\s\S]*animation:\s*route-companion-walk 1\.8s steps\(7, end\)/,
    "the eight generated walk frames should match the slower travel cadence");
});

test("the enabled atlas uses seven intervals for eight exact frame cells", () => {
  assert.match(css, /\.route-companion-sprite\.route-motion-enabled\s*\{[\s\S]*background-size:\s*800% 400%|background-size:\s*800% 400%[\s\S]*\.route-companion-sprite\.route-motion-enabled/,
    "the opt-in sprite must continue to address the full 8x4 atlas");
  assert.match(css, /\.route-companion-sprite\.route-motion-enabled\s*\{[\s\S]*steps\(7, end\)/,
    "seven intervals are required to land on all eight background-position cells");
});

test("initial companion placement still suppresses travel transition", () => {
  assert.match(css, /\.route-companion\.no-motion\s*\{[^}]*transition:\s*none\s*!important/,
    "first layout should not animate the companion in from the default corner");
  assert.match(css, /prefers-reduced-motion:[\s\S]*\.route-companion\.no-motion\s*\{[^}]*transition:\s*none\s*!important/,
    "the no-motion bootstrap state must also win in reduced-motion TV styles");
});

test("repeated pointer and focus entry does not change the active hover direction", () => {
  assert.match(js, /function\s+setCompanionHoverTarget\s*\(route,\s*index,\s*force\s*=\s*false\)/,
    "hover placement needs an explicit force flag for resize-only recalculation");
  assert.match(js, /!force[\s\S]{0,180}hoverNodeIndex/,
    "a second enter on the same card must keep its original direction");
  assert.match(js, /setCompanionHoverTarget\(route,\s*route\._companionHoverIndex,\s*true\)/,
    "layout redraws must be the only forced hover recalculation");
});

test("hovering the progress card keeps its saved forward-facing direction", () => {
  assert.match(js, /data-base-direction/,
    "the companion must retain its progress direction separately from hover direction");
  assert.match(js, /baseDirection[\s\S]{0,220}mark\.dataset\.nodeIndex/,
    "a hover on the current progress card should use the saved base direction");
});

test("西游记选关开放所有集，用完成/未完成贴纸代替锁", () => {
  assert.match(js, /const OPEN_SELECT = SERIES_ID === "jttw"/);
  assert.match(js, /if \(OPEN_SELECT\) return true/);
  assert.match(js, /node-sticker/);
  assert.match(js, /collectionIdForEp/);
  assert.match(js, /game-stickers\/\$\{/);
  assert.match(js, /bookplay_battle_progress_v1/);
  assert.match(css, /\.node-sticker\.is-done img/);
  assert.match(css, /\.node-sticker\.is-todo img/);
  assert.match(js, /drillDone\(c\)/, "巩固关仍按辑锁定");
});

test("episode image cards stay colorful, prominent, and attractive when locked", () => {
  assert.doesNotMatch(css, /\.node\.locked[^{]*\{[^}]*grayscale\(/s, "locked covers must keep their story colors");
  assert.doesNotMatch(css, /\.node\.locked \.node-cover img\s*\{[^}]*grayscale\(/s, "locked cover images must not be grayed out");
  assert.match(css, /\.node\.locked \.node-cover img\s*\{[^}]*saturate\(0\.95\)[^}]*brightness\(0\.92\)/s,
    "locked covers may use only a light colorful treatment");
  assert.match(js, /w \* 0\.27/, "large screens should allow wider image cards（2026-09-12 全屏改版再放大）");
  assert.match(css, /\.route\.compact \.node-cover\s*\{[^}]*display:\s*block/s,
    "compact landscape cards must keep their cover image visible");
  assert.match(css, /\.route\.compact \.node-text\s*\{[^}]*position:\s*absolute/s,
    "compact card titles must overlay the image instead of replacing it");
  assert.doesNotMatch(js, /nodes\.length <= 8 \? 4 : 5/,
    "card width must not shrink merely because a collection has more episodes");
  assert.match(js, /const compactColumns = 4/,
    "every compact collection should keep four wide card columns");
  assert.match(js, /row % 2 === 0 \? offset \+ 1 : compactColumns - offset/,
    "compact cards should reverse every other row into a three-row snake route");
  assert.match(css, /repeat\(var\(--compact-cols, 4\), minmax\(0, 1fr\)\)/,
    "compact grids must retain the same wide column count for long collections");
  assert.match(css, /padding:\s*0\.15rem 2\.4rem 0\.3rem/,
    "compact cards should use more of the available width");
  assert.match(js, /nodes\.length > compactColumns \* 3/,
    "the largest collection should keep its episode cards within three rows");
  assert.match(css, /\.route\.compact\.compact-max \.node\.drill\s*\{[^}]*position:\s*absolute/s,
    "only the drill shortcut may move into the side gutter when twelve episodes fill three rows");
  assert.match(js, /compactMax && el\.classList\.contains\("drill"\)[\s\S]*?removeProperty\("grid-row"\)[\s\S]*?removeProperty\("grid-column"\)/,
    "the gutter drill must drop its inherited grid area so absolute offsets use the whole route");
});

test("JTTW map analogizes world+node contract without importing pixel-world copy", () => {
  assert.match(html, /id="map-worlds"/, "map.html must host the collection world strip");
  assert.match(js, /function\s+collectionWorld\s*\(/, "collections are the world adapter");
  assert.match(js, /function\s+worldNodeAnchors\s*\(/, "authored node positions become route anchors");
  assert.match(js, /function\s+buildWorldStrip\s*\(/, "jttw must render a world selector");
  assert.match(js, /classList\.add\("map-terminal"\)/, "jttw body opts into the terminal stage");
  assert.match(js, /terminal-stage/, "each collection page needs a stage overlay");
  assert.match(js, /route-stage-image/, "the stage uses the collection background");
  assert.match(js, /data-node-world/, "episode nodes must expose their world id");
  assert.match(js, /data-node-id/, "episode nodes must expose a node id");
  assert.match(js, /x > 1 \|\| y > 1/, "pixel-world 0-100 positions convert to 0-1 anchors");
  assert.match(css, /body\.map-terminal \.terminal-stage/, "terminal stage styles stay jttw-scoped");
  assert.match(css, /aspect-ratio:\s*16\s*\/\s*9/, "the world stage is 16:9");
  assert.doesNotMatch(js, /星港科技区|森林回声区|方块地下城|sci-fi|pixel-worlds/,
    "do not import forest/starport/block copy or ids");
  assert.doesNotMatch(html, /星港科技区|森林回声区|方块地下城/,
    "the map shell must stay Journey to the West");
});

test("regular map cards use a large standalone cover with three floating title lines", () => {
  assert.match(css, /\.node\s*\{[^}]*overflow:\s*visible[^}]*background:\s*transparent[^}]*border:\s*0/s,
    "the node shell must not form a dark card around the cover and title");
  assert.match(css, /\.node-cover\s*\{[^}]*border:[^}]*box-shadow:/s,
    "the visual card border and shadow should belong to the large cover only");
  assert.match(css, /\.node-text\s*\{[^}]*background:\s*transparent/s,
    "title copy should float below the image without a black panel");
  assert.match(css, /\.episode-title\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/s,
    "episode number and Chinese title must occupy separate lines");
  assert.match(css, /\.episode-number::after\s*\{\s*content:\s*""/,
    "the old inline dot separator must be removed");
  assert.match(css, /\.episode-en\s*\{[^}]*display:\s*block/s,
    "the English title must remain as the third line");
  assert.match(css, /@media \(min-width: 901px\) and \(min-height: 500px\)[\s\S]*\.route\s*\{\s*min-height:\s*620px/s,
    "desktop routes keep enough vertical space for large cards in three rows");
});
