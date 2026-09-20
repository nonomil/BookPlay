import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const here = new URL(".", import.meta.url);
const read = (name) => fs.readFileSync(new URL(name, here), "utf8");

test("study.html：纸感课堂外壳按序加载样式与控制器", () => {
  const html = read("study.html");
  const cssAt = html.indexOf("study.css");
  const jsAt = html.indexOf("study.js");
  assert.ok(cssAt > 0 && cssAt > html.indexOf("style.css"), "纸感皮肤在基础样式之后");
  assert.ok(jsAt > cssAt);
  assert.match(html, /id="study-rail"/);
  // 五步原生宿主（参考稿 img_3/4/5/11/7 各对应一屏）
  for (const id of ["watch-player", "method-player", "practice-player", "check-player", "output-player"]) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} 原生步骤区`);
  }
  assert.doesNotMatch(html, /iframe|step-frame-holder|step-pop/, "课堂内不再有整页 iframe 与全屏兜底链接");
  assert.ok(html.indexOf("study-state.js") < jsAt, "共享五步信号模块先于控制器加载");
  assert.match(html, /A LITTLE MISSION/, "看故事任务提醒");
  assert.match(html, /YOUR JOURNEY/, "参考稿的旅程步骤条");
});

test("study.js：01 看故事 = 原生精读播放器（元素重组，非整页 iframe）", () => {
  const js = read("study.js");
  const html = read("study.html");
  // 数据与元素：句级时间轴 + 视频原生元素 + 单词音频索引
  assert.match(js, /dialogue_stories\/ep\$\{ep\}\.json/);
  assert.match(js, /audio_start/);
  assert.match(js, /adv_audio\/ep\$\{ep\}\/index\.json/, "单词音频索引");
  assert.match(html, /<video id="watch-video" playsinline preload="metadata"><\/video>/);
  assert.match(js, /watch-word/);
  assert.match(js, /watch-vocab-card/, "每句词卡（vocab 数据）");
  // 完成信号：课堂只允许两种写 —— study_shell（看故事/练一练完成）与
  // adv_progress（理解挑战 ≥70% 后按 lesson.js 同格式解锁大地图）
  assert.match(js, /bookplay_study_shell/);
  const stores = [...js.matchAll(/localStorage\.setItem\("([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(new Set(stores), new Set(["bookplay_study_shell", "bookplay_adv_progress"]),
    "课堂只允许写 study_shell（看故事/练一练）与 adv_progress（解锁）两种存储");
  // 五步全原生宿主
  assert.match(js, /const hosts = \["watch-player", "method-player", "practice-player", "check-player", "output-player"\];/);
  assert.doesNotMatch(js, /ensureFrame|step-frame-holder|embedSrc/, "不再有整页 iframe 内嵌");
  // 02 学方法：learn 词卡（ipa/释义/短语）+ 句型 patterns + 单词音频，读完点亮
  assert.match(js, /const MethodEngine/);
  assert.match(js, /v\.mode === "learn"/);
  assert.match(js, /v\.ipa/);
  assert.match(js, /book\.patterns/);
  assert.match(js, /rec\.method = true/);
  // 05 说出故事：四图排序（节点插图 + 句级音频提示），排对点亮
  assert.match(js, /const OutputEngine/);
  assert.match(js, /order-card/);
  assert.match(js, /n\.illustration/);
  assert.match(js, /rec\.output = true/);
  assert.match(js, /dub\.html\?ep=\$\{ep\}/, "排对后引导去配音");
  // 回到课堂时刷新灯；当前步 = 第一个未完成步骤；回看门
  assert.match(js, /window\.addEventListener\("focus", \(\) => refreshDone\(\)\)/);
  assert.match(js, /doneFlags\.findIndex\(\(flag\) => !flag\)/);
  assert.match(js, /wala\.html\?ep=\$\{ep\}&pass=story/);
  // 步骤切换：五步全原生宿主
  assert.match(js, /const native = Boolean\(hosts\[i\]\);/);
});

test("wala：无任何内嵌残留，精学字幕仍在画面下方（原生播放器同范式）", () => {
  const walaCss = read("wala.css");
  const walaJs = read("wala.js");
  assert.doesNotMatch(walaCss, /body\.embed/);
  assert.doesNotMatch(walaCss, /\.w-embed-/);
  assert.doesNotMatch(walaJs, /embedMode/);
  assert.doesNotMatch(walaJs, /bookplay:study-step-done/);
  // 精学遍 dock 出画面（study-dock），课堂原生播放器沿用同一句级交互范式
  assert.match(walaCss, /#wala-player\.study-dock \.w-stage\s*\{[^}]*flex-direction:\s*column/s);
});

test("wala：显式 pass 进场时锁定路径，藏掉剧情/精学切换钮", () => {
  const html = read("wala.html");
  const js = read("wala.js");
  assert.match(html, /id="w-pass-toggle"/, "剧情精学切换钮有稳定 id");
  assert.match(js, /const lockPass = Boolean\(params\.get\("pass"\) \|\| params\.get\("passMode"\) \|\| params\.get\("mode"\) === "study"\)/);
  assert.match(js, /function applyPassLock\(\)/);
  assert.match(js, /el\.passToggle\.classList\.toggle\("hidden", lockPass\)/);
  assert.match(js, /applyPassLock\(\);\s*\n\s*syncPassButtons\(\);/, "启动时与路径同步");
});
