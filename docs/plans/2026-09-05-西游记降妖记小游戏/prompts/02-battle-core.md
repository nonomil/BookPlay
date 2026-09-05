# 任务：T2 battle-core——战斗纯逻辑模块（TDD）

项目根目录：`G:\Game\BookPlay书戏`（儿童英语绘本播放器，原生 JS，零第三方运行时依赖）。

## 第一步：先读这些（不要跳过）

1. 方案（严格按此实现，不要扩大范围）：`docs/plans/2026-09-05-西游记降妖记小游戏/04-战斗页工程实现.md` §2
2. 玩法规则（星星/连击/错词）：`docs/plans/2026-09-05-西游记降妖记小游戏/01-玩法设计.md` §3-4-6
3. 关卡 schema 与样例数据：`docs/plans/2026-09-05-西游记降妖记小游戏/02-关卡数据与词库管道.md` + `content/game/levels/ep1.json`（T1 产物；若不存在先用方案里 JSONC 样例做夹具）
4. 模块与测试风格范例：`prj/engine/walker-cast.js`（IIFE 双暴露）、`prj/engine/episode-vocab-quiz.js` + `prj/engine/lesson-core.test.mjs`（node:test 风格）

## 要做什么（TDD：先写失败测试再实现）

1. 新建 `prj/engine/battle-core.js`，暴露 `window.BookPlayBattleCore` + `module.exports`，API 与语义：
   - `buildLevel(raw, options)`：schema 校验（schema_version/ep/waves/boss.hpWords），缺字段降级不抛异常；产运行时结构（词索引、sprite id 列表）。
   - `buildWaveQuestions(level, waveIndex, wrongWords)`：错词按出现次数降序插队到波首；波内顺序确定性。
   - `buildOrbSet(question, allWords, seed)`：1 正确 zh + 2 干扰（优先同集词的 zh，去重、长度相近优先），seed 派生确定性洗牌，两次调用同结果。
   - `judgeHit(orb, monster, comboState)`：term 匹配判定；返回 `{correct, combo}`，连对 3 记 `comboReady`。
   - `settleRun(runState)`：按 01 文档 §6 星星规则输出 `{stars 1-3, wrongWords{term:count}, cleared}`。
   - `loadSprites(registryJson, castList)`：解析 `content/game/sprites.json` 注册表；缺 id/缺帧回退 `assets/generated/jttw-player-walkers/<id>/<id>-walk.gif`，再缺回退 `null`（调用方画占位）。
2. 新建 `prj/engine/battle-core.test.mjs` 覆盖：正常构建、确定性（同输入两次深比较相等）、错词插队、干扰项去重与不足 2 个时降级、judge 对/错与连击、settle 三档星星边界、空/坏 level 降级、sprites 回退链。夹具用 ep1 关卡 JSON 的**内联迷你副本**（测试不得依赖磁盘数据文件）。
3. 跑 `node --test prj/engine/battle-core.test.mjs` 全绿。

## 硬性约束

- 原生 IIFE + `"use strict"`；无 DOM/无 fetch/无 localStorage（那是 battle.js 的事）。
- 不改 `prj/engine/` 任何既有文件。
- 完成后 `node --check prj/engine/battle-core.js` 通过。

## 完成标准

新测试全绿且既有 `npm test` 不受影响（若全量跑失败，确认失败项与本次改动无关并说明）；执行小结列出 API 签名与测试数。
