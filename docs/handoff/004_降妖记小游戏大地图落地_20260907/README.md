---
title: 降妖记小游戏大地图落地
seq: 004
created_at: 2026-09-07
handoff_from: ZCode 主会话（GLM）
handoff_to: CC 新会话 / Codex / 子代理 / 人工
status: active
---

## 现状一句话

西游记降妖记小游戏两代全落地并合入 main：v1 单屏战斗页（battle.html，剧情→预习→波次→Boss→测验→结算）+ v2 word-memory-map 忠实移植大地图（game.html，3×3 平铺世界/镜头跟随/八方向行走/小怪追击撞击 AI/地面中文词球捡起投掷/蟠桃芭蕉扇支援道具/区域波次横幅）；NPC 剧情答题与 Boss 对战两环节闭环；`npm test` **347/347 全绿**；产物 v1.0.9（versionCode 14）三端 APK + 西游记数据包-0.2.1-c01.zip（545MB）已校验，仓库工作区清零。

## 接手警告

- **测试基线现为 347**（只增不减）。并行会话仍在活跃开发（音频系统 app-audio、地图/课件页迭代、pack 脚本新参数），动手前先 `git status` + `npm test` 确认基线。
- **打包三条白名单是本项目最大陷阱**，新增游戏数据必须三处同步：
  1. 阶段数据包（`--collections c01`）走**引用闭包 + `COMMON_FILES` 逐文件清单**（`pack_datapack.py`）——不吃 INCLUDE_DIRS；
  2. APK 内置数据树走 `pack_android.py` 的 `DATA_DIRS`（仅非 builtin 的 pack_data 模式）与 `pack_builtin` 显式添加（经 `_build_stage_pack` → COMMON_FILES 生效）；
  3. APK 引擎文件走 `pack_android.py` 的 **`ENGINE_FILES` 白名单**（battle*/game*/tv*/episode-vocab-quiz 已加，新页面记得补）。
  引用闭包扫描不到"按固定路径 fetch 的 JSON"（game/levels、sprites.json、taunts.json），漏配 = 数据静默缺失。
- **`content/` 整体在 .gitignore**：`content/game/`（cast/taunts/maps/sprites.json + levels）是 `git add -f` 强制纳入的手写源数据，**勿删勿移**；`content/assets/game-sprites`、`content/assets/game-backgrounds` 同为 -f 纳入的运行时资产。
- **存储键只有两个**：`bookplay_battle_progress_v1`（含 wrongWords/npcBonus/npcDone，向后兼容字段）、`bookplay_battle_collection_v1`（妖怪图鉴）。新增字段必须可选且向后兼容。
- **大地图 rAF 会被后台标签/部分电视 WebView 节流到≈0**：已有 320ms 看门狗兜底 + `window.BookPlayGameDebug.step` 泵帧测试钩子，勿删（E2E 靠它）。
- 生图 SOP：provider（cliprox/gpt-image-2）常无视 1536x1024（返回 1774x887 等）且"transparent background"提示词会画出假透明棋盘格——小角色用 checkerboard 移除管线兜底，**场景背景图提示词直接写实心场景**；runner 路径用显式 `C:/Users/No'mi'l/...`（bash `$HOME` 展开会坏）。

## 关键指标摘要

| 指标 | 范围 | 基线 | 当前 | 口径 | 来源 |
|------|------|------|------|------|------|
| 单元测试 | 全仓 `npm test` | 337（合入前） | **347 pass / 0 fail** | node --test | 2026-09-07 多次运行 |
| 游戏数据 | c01 阶段包 | 无 | ep1-7 关卡 JSON×7 + sprites/cast/taunts/maps | zip 解包实测 | 西游记数据包-0.2.1-c01.zip |
| 游戏资产 | 运行时 | 0 | 四向小怪 GIF×24 + 主题背景 JPG×6（1.5MB+2.6MB） | zip 解包实测 | 同上 |
| APK | 三端 | v1.0.4/code9（无游戏页） | **v1.0.9/code14**（94M×3，engine 含 battle/game，data 含 ep1 关卡+背景） | gradle 产物 release/ | build-apks.mjs |
| 大地图玩法 | game.html?ep=5 | — | 拾取/投掷/击杀/弹回/撞击扣盾/Boss 门 E2E 全过 | 浏览器实测 + Debug.step 泵帧 | 本次会话 |
| 主题背景生图 | gpt-image-2 | 无 | 6/6 张（1280×720 JPG，俯视 3/4 视角） | 目检 + manifest | `assets/generated/jttw-game-sprites/backgrounds/` |

## 下一跳建议

- **建议接手者**：人工（真机验证 P0）→ CC 新会话（P1/P2 特性）
- **建议先调用的 skill**：无强制；P1/P2 提示词待补写（行动项里已列规格）
- **建议先看的工件**：
  1. `docs/plans/2026-09-06-西游记降妖记-大地图探索版/00-总览.md`（v2 方案与状态，含 §6 参考项目借鉴映射）
  2. `docs/reports/2026-09-06-降妖记大地图探索版验收.md` + `docs/reports/2026-09-06-降妖记c01小游戏验收.md`（已验证/真机待验清单）
  3. `docs/plans/2026-09-05-西游记降妖记小游戏/`（v1 方案与提示词，含生图 SOP）

## 文件阅读顺序

1. 本 README
2. 背景上下文/问题背景.md（需求三阶段演进）
3. 背景上下文/关键发现.md（已验证结论与数据事实）
4. 技术分析/解决方案.md（双页架构 + 数据管道 + 三白名单接线）
5. 行动项/下一步行动.md（接手后做什么）
6. 图解/游戏流程架构.md（mermaid 闭环图）

## 结论标注

- ✅ 已验证：v1/v2 两页浏览器 E2E 全链路（拾取→投掷→击杀→弹回→撞击→Boss 跳转→结算返回）；347 测试全绿；数据包/APK 内容解包实测；6 小角色+6 背景 GPT 生图质检通过
- 🔲 待验证：真机 D-pad"移动/焦点"手感、触屏摇杆、数据包导入链路（setup.html）、App 隐后台 rAF 表现
- ❌ 已否决：点击式攻击（被词球捡投取代）；打字游戏原样移植（物理键盘绑定，7 岁触屏/遥控不成立）
- ⚠️ 口径冲突：无未决冲突

## 交接类型

- `普通任务交接`

## 必含字段（接手确认用）

- **完整度模式**：完整（跨会话交付，关键结论/数字/接线点内嵌）
- **禁区**（不碰的口径 / 路线 / 已否决方案）：不改 `content/` 既有数据；不动 `bookplay_adv_*` 等既有存档键；不把"点击式快卡答题"加回大地图（已按用户要求移植词球捡投）；不重画已生成的四向资产
- **接手确认协议**：先总结复述 → 用户确认 → 才动手（见 `handoff-next-session.md` §2）
- **当前会话 transcript 路径**：`.claude/backups/{session-id}.jsonl`（终极兜底，禁止整读，按需 grep + offset/limit；本会话关键词建议 grep "降妖记"、"word-memory-map"、"WAVE_REGIONS"）
- **凝蜕状态指向**：`.claude/state/session-progress.md`（只读前 80 行）+ `.claude/memory/recent-decisions.md`（读最近 10-15 条）
- **优先级链**：交接包 → 凝蜕 → transcript；任两层冲突 → 停下问用户
