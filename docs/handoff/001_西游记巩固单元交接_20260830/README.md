---
handoff_id: 001
title: 西游记巩固单元交接
date: 2026-08-30
type: 普通任务交接
completeness: 完整
next_owner: Codex
project: G:\Game\BookPlay书戏
---

# 001 · 西游记巩固单元（drill）交接

## 当前目标

把「每辑末尾的巩固单元」从**能渲染**推到**能通关、通关后真解锁下一辑**。该闭环已于 2026-08-31 完成真实浏览器验收；是否打新 APK 仍由用户单独决定。

## 已完成边界（都经过独立验证，不是自述）

| 项 | 状态 | 证据 |
| --- | --- | --- |
| 13 辑合辑定义 `collections.json` | ✅ 已验证 | `test_collections.py` exit 0；覆盖 1–108 精确、无重叠、每辑 ≤12 集 |
| 地图页 `map.html/js/css` | ✅ 已验证 | 13 页横向滑动、解锁规则、锁定 toast，两种场景回归通过 |
| 13 个精简巩固包 `drill/c01..c13.json` | ✅ 已验证 | `test_drill_packs.py` exit 0；42–102KB、无 `nodes`/`script_gloss` |
| `drill.html/js/css` 三题型 | ✅ 已验证 | c01 真实完成 12 单词、6 句型、21 测验；写入 `bookplay_drill.c01.done=true`，回地图后 EP8 解锁、EP9 仍锁 |
| 「知识回顾」「错题回顾」 | ✅ 已验证 | 8 张词卡、4 秒门槛、英文发音入口；错词答对后 `wrong` 清零；不参与通关门禁 |
| 每集知识巩固 | ✅ 已验证 | 108 集 × 9 档配置审计通过；共 6912 个运行时题目，无题量不足或非法评分题 |
| 13 张合辑背景 + splash | ✅ 已验证 | 13 张归一化为 1600×900；manifest 有来源/哈希；地图读到 c01–c13 背景，进场动画已实现 |
| 升级豁免迁移 `grandfatherDrills()` | ✅ 已验证 | 造 1–13 集 done → c01/c02 自动记为巩固通过、第 14 集可点 |
| 解锁链两处崩溃 | ✅ 已修并验证 | 见 `技术分析/根因分析.md` |

## 当前剩余边界

1. 353 道标为 `needs_review` 的题仍安全排除在评分之外；缺少可靠答案证据，禁止猜答案。
2. `lesson.html` 的教师形象目前沿用 narrator 立绘，豆豆龙专用教师立绘仍是独立媒体资产任务。
3. 尚未重打 APK / 正式数据包。通关闭环硬门槛已经解除，但打包属于单独发布动作，未获明确指令前不执行。
4. `wala.js` 的存储、媒体、学习计划、测验拆分属于后续代码重构，见 `docs/plans/2026-08-31-每集知识巩固与分级难度.md` 及后续拆分计划。

## 建议阅读顺序

1. 本文件
2. `背景上下文/关键发现.md` ← 三条会改变做法的事实
3. `行动项/下一步行动.md` ← 接手后第一步
4. `技术分析/根因分析.md` ← 已修的两处崩溃，同类坑还可能有
5. `测试分析报告.md` ← 哪些验过、哪些没验
6. 需要全貌时再看 `docs/plans/2026-08-30-西游记地图首页-design.md`

## 禁区（不要碰）

- **不要改解锁公式**：`colUnlocked` / `epUnlocked` / `drillDone` 的语义已定并验证过，只改签名不改语义
- **不要重新切分 13 辑**：`collections.json` 的 `from`/`to` 是最终结论，用户已确认
- **不要把巩固改成非门禁**：用户明确选了「必做 + 升级豁免」，已否决「不当门禁」和「全部回头补做」两个方案
- **不要在前端 fetch 12 个 ep json**：整辑全量 2.8MB，已改为预生成 59KB 精简包
- 打 APK / 正式数据包前必须重新跑全量回归，并由用户明确启动发布阶段
- `wala.js` 允许在测试保护下做等价模块化拆分，但不得改变进度、媒体、解锁和评分语义
- 不要重跑 `restore_en_mixed_zh.py` 之外的批量数据脚本

## 接手确认协议

动手前先复述：① 当前目标 ② 你要做的第一件事 ③ 你打算改哪些文件 ④ 你认为的验收标准。等用户确认后再改代码。

## 回溯入口

- **本会话 transcript**：`C:\Users\No'mi'l\.cursor\projects\g-Game-BookPlay\agent-transcripts\c7f45829-1997-4630-9d73-a9f31afc3350\c7f45829-1997-4630-9d73-a9f31afc3350.jsonl`
  **禁止整读**（MB 级）。用 `rg -n -m 30 关键词` 定位后 `offset/limit ≤80` 读关键段。
- **DSH 任务卡**（两个切片的完整约束与返回）：
  - `.agent-control/tasks/jttw-map-home-01/{task.md,recent-context.md,result.json}`
  - `.agent-control/tasks/jttw-drill-01/{task.md,recent-context.md}`

## 优先级链

交接包建立上下文 → DSH 任务卡确认精确约束 → 冲突或不明时定向查 transcript（grep + offset，禁止整读）。

## 下一跳建议

当前下一跳：在全量回归保护下逐步拆分 `wala.js` 的存储、媒体、学习计划和测验职责；每一步保持旧页面加载顺序与 localStorage 契约不变。媒体文件继续留在 Git 之外。
