import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { defaults, load, autoMode, quizSelector } = require("./handheld-controls.js");

test("bookplay autoMode treats battle as game until a quiz overlay is visible", () => {
  assert.equal(autoMode("/engine/game.html", false), "game");
  assert.equal(autoMode("/engine/adventure.html", false), "game");
  assert.equal(autoMode("/engine/battle.html", false), "game");
  assert.equal(autoMode("/engine/battle.html", true), "quiz");
  assert.equal(autoMode("/engine/wala.html", false), "quiz");
  assert.equal(autoMode("/engine/home.html", false), "learn");
  assert.equal(autoMode("/engine/map.html", false), "learn");
});

test("bookplay default F-keys split learn vs game scenes", () => {
  const learn = defaults("bookplay", "learn");
  const game = defaults("bookplay", "game");
  assert.equal(learn.F1, "confirm");
  assert.equal(learn.F2, "cancel");
  assert.equal(learn.F3, "left");
  assert.equal(learn.F4, "right");
  assert.equal(game.F1, "attack");
  assert.equal(game.F3, "interact");
  assert.equal(game.F4, "pause");
});

test("quiz overlay selector includes battle and wala choice buttons", () => {
  assert.match(quizSelector, /#battle-quiz button/);
  assert.match(quizSelector, /\.battle-quiz-choice/);
  assert.match(quizSelector, /#battle-gate button/);
  assert.match(quizSelector, /\.w-quiz-choice/);
});

test("saved mappings keep only known actions", () => {
  const mapped = load("bookplay", JSON.stringify({ F1: "jump", F2: "cancel" }), "learn");
  assert.equal(mapped.F1, "confirm");
  assert.equal(mapped.F2, "cancel");
});

test("handheld.css：640×480 HUD 压缩 game/battle 顶栏且命中 44px", () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(join(dir, "handheld.css"), "utf8");
  assert.match(css, /html\[data-handheld\] \.game-hud/);
  assert.match(css, /html\[data-handheld\] \.battle-hud/);
  assert.match(css, /flex-wrap:\s*nowrap/);
  assert.match(css, /html\[data-handheld\] \.game-hudbtn/);
  assert.match(css, /min-height:\s*44px/);
});

test("bookplay 方向桥：合成 Arrow 放行，WASD 按目标键去重，右摇杆不模拟鼠标", () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const js = readFileSync(join(dir, "handheld-controls.js"), "utf8");
  assert.match(js, /e\.x35sTest && \/\^\(Key\[WASD\]\|Arrow/);
  assert.match(js, /app==='bookplay' && mode==='game' && !fromStick\) return/);
  assert.match(js, /app==='bookplay' && mode!=='game'\) \|\| \(app==='blocklegend'/);
  assert.doesNotMatch(js, /mode==='quiz'\|\|\/\^\(Up\|Down\)/);
  assert.match(js, /movement\[latch\]/);
  assert.match(js, /app!=='bookplay'&&isLook/);
  assert.match(js, /\(x\|\|y\)&&app!=='bookplay'/);
  assert.doesNotMatch(js, /app==='bookplay'\)w\.scrollBy/);
  assert.match(js, /function playable/);
  assert.match(js, /function focusDefault/);
  assert.match(js, /data-open-handheld/);
  assert.match(js, /map-splash/);
});

test("home.css：480 高横屏压住封面，书架不用 fixed 背景", () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(join(dir, "home.css"), "utf8");
  assert.match(css, /max-height:\s*520px/);
  assert.match(css, /\.home-hero \.hero-art/);
  assert.match(css, /max-height:\s*28vh/);
  assert.match(css, /\.card img \{ height:\s*96px/);
  assert.match(css, /background-attachment:\s*scroll/);
  assert.doesNotMatch(css, /background-attachment:\s*fixed/);
});

test("engine HTML entries ship native-key, handheld-controls, and handheld.css", () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const pages = readdirSync(dir).filter((name) => name.endsWith(".html"));
  assert.ok(pages.length >= 20);
  // 2026-09-21 定位收窄：掌机层只服务游戏与看视频（wala/game），
  // 精读课堂（study.html）是桌面/TV 学习场景，不再加载掌机层。
  const HANDHELD_FREE = new Set(["study.html"]);
  for (const name of pages) {
    const html = readFileSync(join(dir, name), "utf8");
    assert.match(html, /native-key\.js/, name);
    if (HANDHELD_FREE.has(name)) {
      assert.doesNotMatch(html, /handheld-controls\.js/, `${name} 不加载掌机控制层`);
      assert.doesNotMatch(html, /handheld\.css/, `${name} 不加载掌机布局层`);
      continue;
    }
    assert.match(html, /handheld-controls\.js/, name);
    assert.match(html, /handheld\.css/, name);
  }
});

test("掌机按键不常驻浮层，只从设置入口打开", () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const js = readFileSync(join(dir, "handheld-controls.js"), "utf8");
  assert.doesNotMatch(js, /d\.body\.appendChild\(opener\)/, "不要把掌机按键钉在每个页面上");
  assert.match(js, /data-open-handheld/, "设置里的按钮通过 data-open-handheld 打开面板");
  assert.match(js, /X35SControls=\{open:/);

  const home = readFileSync(join(dir, "home.html"), "utf8");
  const map = readFileSync(join(dir, "map.html"), "utf8");
  const wala = readFileSync(join(dir, "wala.html"), "utf8");
  const game = readFileSync(join(dir, "game.html"), "utf8");
  const battle = readFileSync(join(dir, "battle.html"), "utf8");
  for (const [name, html] of [["home", home], ["map", map], ["wala", wala], ["game", game], ["battle", battle]]) {
    assert.match(html, /data-open-handheld/, `${name} 设置里要有掌机入口`);
  }
  assert.match(home, /<p class="subtitle">每天一小集，句子开口说<\/p>/, "首页副标题不再裸挂按键探测");
  assert.match(home, /class="app-settings library-settings"/, "按键探测收进首页设置");
});
