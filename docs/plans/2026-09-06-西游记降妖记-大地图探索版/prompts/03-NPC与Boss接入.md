# 任务：V2-T3 NPC 对话与 Boss 对战接入

项目根目录：`G:\Game\BookPlay书戏`。前置：V2-T2 game 页已落地。

## 第一步：先读

1. 方案：`docs/plans/2026-09-06-西游记降妖记-大地图探索版/03-NPC对话与对战.md`
2. 现状代码：`prj/engine/game.js`（V2-T2 产物）、`prj/engine/battle.js`（SKIP 集合、boot 错词读入、结算返回按钮）、`prj/engine/battle-core.js`、`content/game/taunts.json`、`content/dialogue_stories/ep5.json` 的 intro 来源 nodes

## 要做什么（TDD：core 新逻辑先写测试）

1. `battle-core.js` 新增 `reorderBossWords(level, wrongWords)`：Boss hpWords 错词插队（同 buildWaveQuestions 语义），返回新数组不改原对象；`battle-core.test.mjs` 补测试（错词插队、无错词原序、坏输入原序）。
2. `battle.js` 三处小改（保持向后兼容）：
   - `SKIP` 支持 `waves`：boot 后若 `SKIP.has("waves")` 直接 `startBoss()`；
   - boot 读 URL `&wrong=a,b` 并入错词表；Boss 战开始时 `level.boss.hpWords = Core.reorderBossWords(level, state.wrongWords)`；
   - 结算页"回地图"按钮：URL 带 `from=battle` 时文案/目标改为 `game.html?ep=N`（避免死循环跳转）。
3. `game.js` NPC 交互：
   - 点击 NPC → 对话框（复用 `.battle-dialogue` 样式类，立绘 = sprites 帧）：intro 型播 `level.intro` 原文（▶ 继续）；quiz 型先播 `taunts.json[role]` 一条再弹 1 题（题面英文+IPA+♪，3 个中文选项用 buildOrbSet 同源干扰）；
   - 答对：`npcBonus=true`、奖励词卡弹出 1.5s、NPC 头顶变 ⭐；答错：展示正确答案可重答一次；奖励每集只发一次（progress `npcDone`）；
   - 开场：`?from=battle` 不自动触发 intro NPC 对话，否则主角第一次靠近（距离阈值）自动弹一次；
   - Boss 区：走近弹确认卡「⚔️ 挑战 <Boss 名>？」→ `battle.html?ep=N&skip=intro,preview&wrong=<本局错词>`；小怪未清完也可挑战。
4. 更新 `game-page.test.mjs` / `battle-page.test.mjs` 涉及断言（若有），`npm test` 全绿。

## 硬性约束

- battle.js 改动仅限上述三处，不动 v1 六阶段主流程；存储仍只两个键。
- NPC 台词全部本地数据；quiz 型 NPC 出题每集固定 1 题（确定性：词取 previewWords[0] 或错词首）。

## 完成标准

`npm test` 全绿；浏览器实测 ep5 闭环：地图击怪 3 只 → NPC 答题得 bonus → 进 Boss（错词插队生效）→ 结算回地图不重复开场；小结列出 dialogue 出现的全部台词来源。
