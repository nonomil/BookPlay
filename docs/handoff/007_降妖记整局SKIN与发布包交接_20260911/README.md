---
title: 降妖记整局SKIN与发布包交接
seq: "007"
created_at: 2026-09-11
status: verified
confidence: high
handoff_from: Grok Build 当前会话
handoff_to: ZCODE
handoff_type: 普通任务交接
---

# 降妖记整局 SKIN 与发布包交接

> 2026-09-11。本包把「一局玩法 + 1–54 换皮 + 首发 APK」交给 ZCODE。开箱 APK 只有第 1 集；2–54 的游戏图、关卡、特效走**一份**导入数据包，不要再维护多份阶段 ZIP。

## 现状一句话

浏览器里 1–54 的 FLOW 已锁死、SKIN 已换到具名小怪/Boss 与四向走路；`v1.0.15` 三端 debug APK 已打出，内置树 `episodes:[1]`。接手第一步：读本 README 与 `行动项/下一步行动.md`，向用户复述「APK=第1集 / 数据包=1–54 一份大文件」后，再决定是否装机或补数据包。

## 必含字段（接手确认用）

- **完整度模式**：完整（给外部 ZCODE，关键结论内嵌）
- **禁区**（不碰的口径 / 路线 / 已否决方案）：
  - 不换引擎、不上 Phaser、不新建游戏页
  - 不声称真机通过
  - 不把 2–54 关塞进 APK 内置树（`jttw-only` 只留 ep1）
  - 不生成 c08 / ep55+ 地图，除非用户点名
  - 不从宠物积分像素世界包抄森林/科幻/方块/侦探文案
  - 存储只许两键：`bookplay_battle_progress_v1`、`bookplay_battle_collection_v1`
  - 显示名：猪八戒（不是猪刚鬣）、沙僧（不是流沙河妖）
  - 不要再开视频生成（额度/429）；走路用静帧 GIF
- **接手确认协议**：先总结复述 → 用户确认 → 才动手。三层冲突停下问用户。
- **当前会话 transcript 路径**：`C:\Users\No'mi'l\.grok\sessions\G%3A%5CGame%5CBookPlay%E4%B9%A6%E6%88%8F\01a08433-06d4-7970-bee6-34dd0b036072\`（含 `compaction/`）。禁止整读，按需搜索关键词 + 限行。
- **凝蜕状态指向**：本仓库无 `.claude/state/session-progress.md`、无 `.claude/memory/recent-decisions.md`（已查，文件不存在）。以本交接包 + transcript 为准。
- **优先级链**：交接包 → 凝蜕（缺失）→ transcript；冲突停下问用户。

## 当前目标与完成边界

目标：巩固课后进入降妖记，同一 FLOW（逛地图 → 捡词球 → 砸小怪 → NPC → Boss），每集只换 SKIN；发布时 APK 轻、数据包重。

### 已完成（有命令/文件/截图）

- 大地图：`prj/engine/game.js` + `game-core.js` + `game-input.js` + `game-audio.js`；一屏图 `worldTiles:1`；PACK 占位 + 分离；镜头跟摇杆。
- 1–54 选关解锁、`cast.json` 小怪族/NPC/Boss 对齐剧情。
- 后期 11 家小怪南向 + 东/西/北向 walk GIF；9 个具名 Boss 南向 walk GIF。
- 具名 Boss 自己的技能 FX；悟空 `hint.png`（火眼金睛）。
- 连击 toast：`棒影连击！连击清场！`（`prj/engine/battle.js`）。
- 人参果 pickup 为象牙色果实，不是娃娃。
- APK：`release/v1.0.15/apk/` 三端各约 121.3 MB，versionName `1.0.15`，versionCode `20`。内置 `apk-builtin-jttw-only`，`episodes:[1]`，无 `heaven-soldier` 目录。

### 未完成（不得写成已通过）

- 真机安装、触屏、TV、摇杆未测。
- 2–54 靠导入 `release/v1.0.15/datapack/西游记数据包-1.0.15.zip`（1974.5 MB，19101 条目，已含 ep54 关卡与后期精灵 GIF）。导入后的选关/真机仍未测。
- 手写对白仍基本只有 ep1/ep5。
- 听写/跟读 TV 未做。
- Boss 四向仍复用南向 GIF。
- 全仓 `npm test` 本会话未重跑（只跑了定向契约/战斗/内置打包测试）。

## 关键指标摘要

| 指标 | 范围 | 基线 | 当前 | 口径 | 来源 |
|------|------|------|------|------|------|
| 运行时契约 | `test_game_runtime_contract.py` | 本会话 | 21 passed | 2026-09-11 本机 pytest | 本会话命令 |
| 战斗 Node | `battle-core.test.mjs` + `battle-page.test.mjs` | — | 36 pass / 0 fail | `node --test` | 本会话 |
| 内置打包契约 | `test_pack_android_builtin.py` | 6 | 7 passed | 含 hint.png / walk-01.png 入 COMMON_FILES | 本会话 |
| APK | jttw-only 三端 | 1.0.14 / code 19（006） | **1.0.15 / code 20**，各 121.3 MB | Gradle `assemble*Debug` 成功 | `release/v1.0.15/apk/` |
| 内置树 | `assets/data/content-manifest.json` | ep1 | kind=`apk-builtin-jttw-only`，files=1089，`jttw.episodes=[1]` | pack_android `--builtin-profile jttw-only` | 本会话 |
| 游戏精灵体积 | `content/assets/game-sprites` | — | 169 文件 / 22.2 MB | Python 目录合计 | 本会话 |
| 游戏特效体积 | `content/assets/game-fx` | — | 94 文件 / 91.5 MB | 同上 | 本会话 |
| 全集视频 | `content/assets/video` | — | 108 文件 / 2717.3 MB | 同上；1–54 约一半进数据包 | 本会话 |

## 建议阅读顺序

1. 本 README
2. [`背景上下文/关键发现.md`](背景上下文/关键发现.md)
3. [`行动项/下一步行动.md`](行动项/下一步行动.md)
4. [`技术分析/解决方案.md`](技术分析/解决方案.md)（地图/游戏/打包怎么接）
5. [`测试分析报告.md`](测试分析报告.md)
6. 旧包仅作背景：[006](../006_降妖记后续游戏优化接手_20260908/README.md) 的世界边长 4×4 已被一屏图口径覆盖，见本包「口径说明」

## 下一跳建议

- **建议接手者**：ZCODE
- **建议先做**：确认 `release/西游记数据包-1.0.15.zip` 已写完并拷进 `release/v1.0.15/datapack/`；有设备则装 mobile APK，进第 1 集打怪。
- **建议先看工件**：
  1. `prj/engine/game.js` / `game-core.js` / `map.js`
  2. `content/game/cast.json`、`sprites.json`、`maps.json`
  3. `prj/tools/pack_android.py`、`pack_datapack.py`

## 结论标注

- ✅ APK 内置只有第 1 集（manifest + 无 heaven-soldier）
- ✅ 1–54 游戏 SKIN 在 `content/`，不在 builtin APK
- ✅ 后续只维护一份数据包（c01–c07 / ep1–54 + 游戏资源整树）
- 🔲 真机、整局、数据包导入未测
- ❌ Phaser / 新页 / c08 / 多份阶段包并行维护
- ⚠️ 006 写「世界边长 4」；当前一屏关是 `worldTiles:1`。以 `content/game/maps.json` 为准
