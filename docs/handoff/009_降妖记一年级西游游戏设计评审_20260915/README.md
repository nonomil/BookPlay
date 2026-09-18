---
title: 降妖记一年级西游游戏设计评审
seq: 009
created_at: 2026-09-15
handoff_from: Grok Build 本会话
handoff_to: 其他 AI 评审 / 新会话
status: active
handoff_type: 普通任务交接
---

# 009 降妖记一年级西游游戏设计评审

## 现状一句话

一年级要的「先学后玩的西游记游戏」就是降妖记；playVerb / 冻 10 词 / Boss 抢答已进代码。评审请读设计文件夹，不要去卡上恢复释厄传。下一步若通过：命中金箍棒敲击 + 真机 Port，不要新引擎。

## 必含字段（接手确认用）

- **完整度模式**：完整（设计合同内嵌；长代码只引路径）
- **禁区**：不恢复西游释厄传；不代下 ROM；不改 disk=；不新开 Phaser/Godot；游戏失败不改 `passed`；默认通关仍是捡中文球扔配对英文小妖
- **接手确认协议**：先总结复述需求+结论+方案+禁区 → 用户说方向对 → 才改代码
- **当前会话 transcript 路径**：`C:\Users\No'mi'l\.grok\sessions\G%3A%5CGame%5CBookPlay%E4%B9%A6%E6%88%8F\01a09f80-1c23-7c62-91d6-3cbd8424cc5c\chat_history.jsonl`（禁止整读，grep + offset）
- **凝蜕状态指向**：本环境无 `.claude/state/session-progress.md`；以本包 + 设计文件夹为准。Grok 会话目录见上
- **优先级链**：交接包 → 设计文件夹 2026-09-15 → transcript；冲突停下问用户

## 接手警告

- **不要直接相信**：09-08 README 的「全仓 408 pass」、游戏「只许两键」
- **必须先核对**：`PLAY_VERBS` 四值；`SESSION_CARD_LIMIT=10`；`bookplay_weak_v1`；K: 当前可能未挂载

## 关键指标摘要

| 指标 | 范围 | 基线 | 当前 | 口径 | 来源 |
|---|---|---|---|---|---|
| 定向测试 | game/battle core+page | 冻词前 121 | **126/126** | node --test 四文件 | 本会话命令输出 |
| 全仓 npm test | 引擎套件 | 09-08 写 408；本会话抢答后 520 | 🔲 冻词后未重跑 | 不得把 408 当现在 | 09-08 README vs 本会话 |
| 冻词 | ep1 浏览器 | — | 10 张 / 10 小妖 | BookPlayGameDebug | Tabbit 2026-09-15 |
| Port 体积 | build/bookplay | 旧包 ~99MB 仅引擎 | ~425MB 含 sprites | robocopy SIZE_MB | 本会话 |
| K: 在位 | PC | 拷入时 True | 后一次查询 **无 K:** | Get-PSDrive | 本会话 |

## 文件阅读顺序

1. 本 README  
2. `docs/plans/2026-09-15-降妖记一年级西游游戏设计/README.md`  
3. 背景上下文/关键发现.md  
4. 行动项/下一步行动.md  

## 关键产物路径

| 类型 | 路径 |
|---|---|
| 设计合同 | `docs/plans/2026-09-15-降妖记一年级西游游戏设计/` |
| 底盘设计 | `docs/plans/2026-09-08-降妖记完整游戏设计/` |
| 逻辑 | `prj/engine/game-core.js` `battle-core.js` |
| 网关 | `prj/engine/game.js` `battle.js` |
| 关卡动词 | `prj/data/game/levels/ep2.json` `ep8.json` `ep40.json` |
| Port | `D:\WorkPlace\X35S\htmljs-to-x35s\build\bookplay` |

## 下一跳建议

- **建议接手者**：评审 AI 或新会话  
- **建议先做**：按设计文件夹 09 清单勾选；通过后做命中敲击，不要拷 ROM  
- **建议先看**：`docs/plans/2026-09-15-降妖记一年级西游游戏设计/README.md`

## 结论标注

- ✅ 主游戏是降妖记，不是释厄传  
- ✅ playVerb / 冻 10 / 抢答 / 弱词 / 不会 已在代码  
- 🔲 全仓测试、X35S 真机、金箍棒敲击手感  
- ❌ 恢复街机砍人、代下 PS1/MD、黑神话  
- ⚠️ 两键 vs `bookplay_weak_v1`；408 vs 520/126  

## 交接类型

普通任务交接（设计评审）
