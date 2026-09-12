# 任务：P1-2 combat-core v2 回合制对战引擎（可 grok-build 委派）

项目根目录：`G:\Game\BookPlay书戏`。先读：`docs/plans/2026-09-12-降妖记大世界-星露谷×宝可梦/04-可复用算法库.md` §combat-core、`03-玩法系统架构.md` §宝可梦层。

## 要做什么（严格 TDD：先写失败测试）
1. `content/game/elements.json`（water/fire/forest/earth/light 五属性环形克制 1.3/0.75）+ `content/game/moves.json`（音波功=listen-choice、火眼金睛=meaning-choice、照妖镜=context-fill、筋斗云=shadow；power/cooldown/energyCost）。
2. `prj/engine/combat-core.js`：`createBattle/availableMoves/resolveTurn/enemyTurn/result`——事件日志唯一表现数据源；答案正确=命中；mult=威力×克制×连击；捕捉概率函数 `catchChance(hpRatio, mastery)`。
3. 敌方 AI：效用评分（预期伤害×克制+击杀+冷却惩罚），确定性可测（rng 注入）。
4. 测试：克制矩阵/连击/冷却/捕捉概率/100 场模拟无死局（HP 归零必终结）/事件日志增量。
5. 兼容：与 battle-core.judgeHit 共存（野生快速战仍用旧判定），不修改 battle-core。

## 硬性约束（若经 grok-build 委派，写入合同）
写集仅 `prj/engine/combat-core.js/.test.mjs` + `content/game/elements.json/moves.json`；禁止改 battle-core/存储键/打包脚本；验收 = `node --test prj/engine/combat-core.test.mjs` + `npm test` 不低于现场基线。

## 完成标准
单测 ≥14 全绿；全量回归不降；API 文档头注释完整；复利检查：B 算法层新成员，v3 起所有对战玩法共用。
