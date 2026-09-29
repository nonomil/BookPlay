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
  assert.match(html, /mission-ico/, "任务提醒图标化（点了才读问题）");
  assert.match(html, /边看边想/, "任务提醒短标题");
  assert.match(html, /YOUR JOURNEY/, "参考稿的旅程步骤条");
});

test("study.js：01 看故事 = 原生精读播放器（元素重组，非整页 iframe）", () => {
  const js = read("study.js");
  const html = read("study.html");
  // 数据与元素：句级时间轴 + 插图翻页（Storybook 阅读器形式）+ 单词音频索引
  assert.match(js, /dialogue_stories\/ep\$\{ep\}\.json/);
  assert.match(js, /audio_start/);
  assert.match(js, /adv_audio\/ep\$\{ep\}\/index\.json/, "单词音频索引");
  // 可动的绘本：左页视频（句级 seek），右页文字列
  assert.match(html, /class="watch-spread"/, "视频+文字对开布局");
  assert.match(html, /<video id="watch-video" playsinline preload="metadata"><\/video>/);
  assert.match(js, /video\.currentTime = Number\(n\.audio_start\)/, "句级 seek");
  assert.match(js, /is-turning/, "翻页动画（reduced-motion 降级）");
  assert.match(js, /watch-word/);
  assert.match(js, /watch-vocab-card/, "每句词卡（vocab 数据）");
  // 完成信号：课堂只允许两种写 —— study_shell（看故事/练一练完成）与
  // adv_progress（理解挑战 ≥70% 后按 lesson.js 同格式解锁大地图）
  assert.match(js, /bookplay_study_shell/);
  const stores = [...js.matchAll(/localStorage\.setItem\("([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(new Set(stores),
    new Set(["bookplay_study_shell", "bookplay_adv_progress", "bookplay_jttw_episode_rewards_v1"]),
    "课堂只允许写：步骤完成标记（study_shell）、大地图解锁（adv_progress）、贴纸册（jttw_episode_rewards，与知识巩固同册）");
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
  assert.match(js, /hosts\.forEach\(\(id, k\) => \{ \$\(id\)\.hidden = k !== i; \}\);/);
});

test("练一练题型：成长型坡度，大班/低年级都能玩", () => {
  const js = read("study.js");
  const html = read("study.html");
  // 坡度：听音选词卡（游戏性开场）-> 听音选义 -> 看词选义 -> 听句选画（压轴）
  assert.match(js, /kind: "audio-word", term: v\.term, audio: wordAudio\[normalize\(v\.term\)\]/);
  assert.match(js, /prompt: "听发音，选出你听到的单词"/, "听音选词卡：考单词识别，不考中文阅读");
  assert.match(js, /kind: "audio-zh"/, "听音选义：孩子认识中文字");
  assert.match(js, /kind: "word"/, "看词选义");
  assert.match(js, /kind: "scene"/, "听句选画");
  assert.match(js, /choice-row word-tile/, "英文词卡大按钮");
  // 步骤指引开口说（大班不识字也能跟）
  assert.match(js, /function speakText\(text, lang\)/);
  assert.match(js, /speechSynthesis/);
  assert.match(js, /say: "看动画啦！[^"]*"/);
  assert.match(js, /speakText\(say, "zh-CN"\)/, "步骤指引语音播报");
  // 每步自动播报一次
  assert.match(js, /state\.spokenSteps\.add\(i\)/);
});

test("审查修复：词卡点得动、挑战可重试、学完重进落在完成态", () => {
  const js = read("study.js");
  const html = read("study.html");
  // wordAudio 与 renderQuestion 同作用域（曾有 ReferenceError：词卡点击无响应）
  assert.match(js, /let wordAudio = \{\}; \/\/ 词卡点击发声要用，必须与 renderQuestion 同作用域/);
  const ensureBody = js.slice(js.indexOf("const PracticeEngine"), js.indexOf("const CheckEngine"));
  assert.equal((ensureBody.match(/let wordAudio/g) || []).length, 1, "PracticeEngine 内只声明一次模块级 wordAudio");
  // 理解挑战失败可重试
  assert.match(html, /id="check-retry"[^>]*hidden/, "重试按钮存在且默认隐藏");
  assert.match(js, /retry\.hidden = passed/);
  assert.match(js, /reset\(\);/);
  // 全完成的集重进：落在最后一步 + ALL DONE，不从头 STEP 1
  assert.match(js, /const allDone = doneFlags\.every\(Boolean\);/);
  assert.match(js, /current = allDone \? steps\.length - 1 :/);
  assert.match(js, /if \(allDone\) refreshDone/);
  // 排序成功后锁定画板
  assert.match(js, /if \(data\.solved\) return;/);
});

test("奖励层：进度条 / 完成演出 / 贴纸仪式（复用知识巩固贴纸册）", () => {
  const html = read("study.html");
  const js = read("study.js");
  const css = read("study.css");
  // 顶部进度条
  assert.match(html, /id="study-progress"/);
  assert.match(js, /function renderProgress\(flags\)/);
  assert.match(css, /\.study-progress-seg\.is-done/);
  // 完成演出：星星/浮字/音效，尊重 prefers-reduced-motion
  assert.match(html, /id="study-fx"/);
  assert.match(js, /const StudyFX/);
  assert.match(js, /prefers-reduced-motion: reduce/);
  assert.match(js, /StudyFX\.stepDone\(i\)/, "新完成的步骤触发演出");
  assert.match(js, /BookPlayAudio\?\.sfx\("correct"\)/);
  // 贴纸仪式：复用知识巩固贴纸册（幂等），不另立账本
  assert.match(html, /id="study-sticker-overlay"/);
  assert.match(js, /const StudyRewards/);
  assert.match(js, /data\/rewards\/jttw\.json/);
  assert.match(js, /grantEpisodeSticker/);
  assert.match(js, /bookplay_jttw_episode_rewards_v1/);
  assert.match(js, /rec\.rewardShown = true/, "仪式只演出一次");
  assert.match(css, /\.study-sticker-overlay/);
  assert.match(css, /backdrop-filter|prefers-reduced-motion/);
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
