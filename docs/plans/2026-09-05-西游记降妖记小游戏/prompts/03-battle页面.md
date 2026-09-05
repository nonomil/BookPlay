# 任务：T3 battle 战斗页——六阶段单屏遭遇战

项目根目录：`G:\Game\BookPlay书戏`（儿童英语绘本播放器，原生 JS + Capacitor，需同时适配触屏与电视 D-pad）。

## 第一步：先读这些（不要跳过）

1. 方案（严格按此实现，不要扩大范围）：`docs/plans/2026-09-05-西游记降妖记小游戏/04-战斗页工程实现.md` §3-4
2. 玩法与流程细节：`docs/plans/2026-09-05-西游记降妖记小游戏/01-玩法设计.md`
3. 必读现状代码：`prj/engine/adventure.html`+`adventure.js`（?ep=N 读取、词卡渲染、TTS 调用、`../data/dialogue_stories/` 加载回退）、`prj/engine/tv.css` + `tv-remote.js`（合同与焦点管理）、`prj/engine/voice.js`（speak 接口）、`prj/engine/episode-vocab-quiz.js`（关底测验复用方式）、`prj/engine/battle-core.js`（T2 产物）
4. 页面合同测试范例：`prj/engine/parent-page.test.mjs`（静态合同写法）

## 要做什么（TDD：先写 battle-page.test.mjs 静态合同再实现）

1. 新建 `prj/engine/battle.html`：按顺序引入 `tv.css`、`tv-remote.js`、`battle-core.js`、`battle.js?v=1`、`battle.css?v=1`；骨架含：场景层（背景/主角/怪物层/飞行层）、HUD（护盾/进度/连击/退出）、词球栏、对话框、暂停面板、结算卡。
2. 新建 `prj/engine/battle.css`：全屏场景 + 底部词球栏（≥64px 命中高、焦点环用 tv.css 变量）；`prefers-reduced-motion` 关闭飞行/进场动画；小屏（手机竖屏）与 TV 横屏两档布局。
3. 新建 `prj/engine/battle.js`（IIFE，`?ep=N`）：
   - 加载 `../data/game/levels/ep{n}.json`（404 → 提示"本集关卡未解锁，先去读绘本"并提供返回）；
   - 阶段机 intro→preview→wave1→wave2→boss→quiz→result（`&skip=` 调试参数）；
   - intro 对话框（说话人立绘 = sprites 帧、中英双语）；preview 闪卡（词/IPA/中文/插图/TTS，可跳过）；
   - 波次：怪物进场（头顶英文词）、词球栏 3 球、点球→投掷命中判定（core.judgeHit）、错扣护盾、连对 3 清波特效；护盾扣完重置当前波（不死）；
   - boss：血条格 = 词数、反向出题（显示中文捡英文球）、每掉一格血显示 taunt 气泡、倒地掉妖怪卡；
   - quiz：优先内嵌 `BookPlayEpisodeVocabQuiz`（传入本集词）；集成成本过高则回退"去测验"按钮跳 `lesson.html?ep=N`，写明选择的方案；
   - result：星星（core.settleRun）、错词清单、妖怪卡、重玩/下一集按钮；写 `bookplay_battle_progress_v1` / `bookplay_battle_collection_v1`（JSON 读写容错）；
   - 精灵：core.loadSprites 解析 `../data/game/sprites.json`（404 回退 walker GIF、再回退圆形占位底座+文字）；
   - 输入：触屏点击 + D-pad 焦点（词球栏/怪物/HUD 三区移动，OK 确认，返回键开暂停）。
4. `node --test prj/engine/battle-page.test.mjs`：断言 script/link 顺序与版本参数、含 tv 资源、无 eval/内联 onclick、存储键名正确、包含 prefers-reduced-motion 与 64px。

## 硬性约束

- 原生 IIFE + `"use strict"`；零第三方库；不改既有文件（除下述版本 bump）；不动勋章/SP 体系。
- 唯一新存储键：`bookplay_battle_progress_v1`、`bookplay_battle_collection_v1`。
- 无网络请求（全部本地数据）；图片 onerror 降级不破版。

## 完成标准

新旧测试全绿；`node --check` 全部新 js；浏览器开 `battle.html?ep=1` 手动走通六阶段（截图或文字记录各阶段要点）。
