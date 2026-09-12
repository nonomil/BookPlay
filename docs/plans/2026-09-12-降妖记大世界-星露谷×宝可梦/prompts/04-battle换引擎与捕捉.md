# 任务：P1-3+6 battle 换引擎与捕捉流程

项目根目录：`G:\Game\BookPlay书戏`。前置：combat-core v2 与 dex.json 已落地。先读：`04-可复用算法库.md`、`03-玩法系统架构.md` §2.2-2.3。

## 要做什么
1. **battle.html 换引擎（UI 不变）**：Boss 战接 combat-core（选招 UI=四题型按钮，答对出招走事件日志增量动画——复用既有三段式打击感 CSS）；野生小怪快速战保持 v1 词球判定。错词照旧落 `bookplay_battle_progress_v1`。
2. **捕捉流程**：野生怪/Boss HP<30% 显示"NECTAR 词球捕捉"→ 答对 catchQuiz.count 题 → catchChance(hpRatio, mastery) 判定 → 成功写 `bookplay_dex_v1`（collection-core.register）+ 图鉴点亮提示。
3. **经验与进化提示**：战斗胜利按答对数给怪经验（存 dex_v1）；达 evolution 阈值时结算页提示"可进化"。
4. **图鉴页 dex.html**：网格卡（未解锁剪影）+ 详情复用 episode-detail 样式 + 完成度；入口=大世界 HUD 图鉴按钮；tv.css/tv-remote 合同 + `dex-page.test.mjs`。

## 硬性约束
不动 v1 波次玩法；新存储键仅 `bookplay_dex_v1`；动画 `prefers-reduced-motion` 降级。

## 完成标准
`npm test` 全绿；E2E：Boss v2 对战一场 + 捕捉一只入图鉴 + 图鉴页可见；复利检查：事件日志动画管线进入 B 层（后续所有对战复用）。
