# 任务：V2-T2 game 大地图探索页

项目根目录：`G:\Game\BookPlay书戏`（原生 JS + Capacitor，触屏 + 电视 D-pad 双适配）。

## 第一步：先读

1. 方案（严格按此实现）：`docs/plans/2026-09-06-西游记降妖记-大地图探索版/01-玩法设计-大地图.md`、`04-工程实现-game页.md`
2. 复用代码（必读）：`prj/engine/battle.js`（boot/门禁/HUD/存储/精灵解析写法直接照搬风格）、`prj/engine/battle-core.js`（buildWaveQuestions/buildOrbSet/judgeHit/loadSprites）、`prj/engine/battle-page.test.mjs`（静态合同风格）、`prj/engine/tv-remote.js`
3. 数据：`content/game/levels/ep5.json`（含 v2 map 字段）、`content/game/maps.json`

## 要做什么（TDD：先写 game-page.test.mjs 静态合同）

1. `prj/engine/game.html`：按序引 `tv.css`、`tv-remote.js`、`battle-core.js`、`game.js?v=1`、`game.css?v=1`；骨架：场景层（backdrop/walkzone/entities/projectile）、HUD（护盾/进度/目标条/暂停）、收集栏、快卡弹层、Boss 确认卡、暂停面板、门禁卡。
2. `prj/engine/game.css`：全屏场景 + 实体绝对定位（left/top 百分比）；虚拟摇杆（左下 96px 圆盘，触屏才显示）；≥64px 命中与 tv 焦点环；`prefers-reduced-motion` 关闭游走/飞行动画；小屏与 TV 横屏两档。
3. `prj/engine/game.js`（IIFE，`?ep=N`）：
   - boot 照搬 battle.js：fetch level（404 → 门禁"先去读故事"）、maps.json、sprites.json、taunts.json；读上局 wrongWords；
   - 探索主循环：归一化坐标 + rAF；触屏点击地面 = 主角自动走到该点（walk GIF 按 dx/dy 主方向切 south/west/east/north，到位切 idle=walk 第 1 帧）；虚拟摇杆拖动方向连续移动；D-pad 按住移动；
   - 小怪：3-5 只按 monsterSpawns 摆放，头顶英文单词气泡（≥44px 可点区），可行走区内随机游走（3-5s 换目标点，CSS transition）；词表来自 core.buildWaveQuestions(level, waveIdx, wrongWords)（两波池合并顺序分配）；
   - 目标条：显示当前目标中文 + ♪ TTS（`/api/tts?voice=en&text=`）；点击**目标怪** → 金箍棒飞行（0.45s translate+rotate，reduced-motion 降级）→ 命中弹中文 3 选 1 快卡（buildOrbSet 干扰同集词）→ 对 = judgeHit 记连击 + 爆碎特效（scale+fade+星星粒子）+ 掉词卡进收集栏 + 金箍棒飞回；错 = 护盾-1 + 怪变红加速；护盾 0 → 小怪重置 + 温和提示；
   - 连击 3 → 横扫特效清场上剩余小怪（复用 v1 comboReady 语义）；
   - 非目标怪点击：轻提示"先找【目标中文】的妖怪！"不扣盾；
   - 全清 → 目标条变"去挑战 Boss！"+ Boss 区高亮；
   - 暂停面板 + 门禁卡照搬 v1；
   - 存储只碰 `bookplay_battle_progress_v1`（本阶段写 wrongWords/tempStars，结算仍由 battle 页完成，字段向后兼容）。
4. `node --test prj/engine/game-page.test.mjs`：script/link 顺序与版本参数、tv 资源、存储键集合、无 eval/内联 onclick、css 含 64px 与 reduced-motion、使用 BookPlayBattleCore 各函数。

## 硬性约束

- 原生 IIFE + `"use strict"`；零第三方库；不改既有文件（battle.js/battle-core.js 只复用不改）；rAF 循环在 document.hidden 时暂停。
- 单位统一归一化坐标（0-1），窗口 resize 重算。

## 完成标准

新旧测试全绿；浏览器 `game.html?ep=5` 实测：点地移动四向正确、点怪飞棒快卡爆碎、错词扣盾、全清后 Boss 区高亮、`?debug=1` 显示可行走区描边；小结记录手感参数（移速/游走间隔）。
