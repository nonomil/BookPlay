# 降妖记 · 一年级西游游戏设计（2026-09-15）

> **给其他 AI / 评审的现行玩法合同。**  
> 不新开引擎、不拷街机砍人盘。一年级「先学后玩」的西游记游戏 = 本项目 `game.html` + `battle.html`。  
> 09-08 底盘仍有效；**本文件夹覆盖 playVerb、冻词、弱词键、掌机、商业 ROM 取舍。**

权威链：

```text
本文件夹（2026-09-15）  ← 玩法叠加、一年级口径、ROM 禁区、已实现切片
  ↑ 覆盖冲突项
docs/plans/2026-09-08-降妖记完整游戏设计/  ← 产品定位、捡投内核、美术/音频契约
docs/handoff/009_降妖记一年级西游游戏设计评审_20260915/  ← 接手入口
```

## 一句话

7 岁听过动画片的孩子：读完本集英语绘本 → 巩固 → 在大地图上当孙悟空，用刚学的词降妖。出手可以简单（扔球/跟打/听环/葫芦改瞄），对话可以 RPG（NPC/Boss）。不是《西游释厄传》，不是黑神话。

## 建议阅读顺序（评审）

| 顺序 | 文件 | 回答什么 |
|---|---|---|
| 1 | 本 README | 边界、已实现、禁区 |
| 2 | [01-产品定位与一年级口径](01-产品定位与一年级口径.md) | 给谁、恶搞是什么、学完才能玩 |
| 3 | [02-现成西游游戏取舍](02-现成西游游戏取舍.md) | 街机/MD/PS1/黑神话为什么不用 |
| 4 | [03-核心循环与playVerb](03-核心循环与playVerb.md) | 默认扔球 + 分集动词 |
| 5 | [04-学习调度冻词弱词](04-学习调度冻词弱词.md) | 10 词、弱词 2/3/30%、不会 |
| 6 | [05-Boss抢答](05-Boss抢答.md) | 10 秒、对手也会答 |
| 7 | [06-参考项目偷什么](06-参考项目偷什么.md) | StudyCode / Game 仓对照 |
| 8 | [07-掌机与发布](07-掌机与发布.md) | X35S Port、K 盘 |
| 9 | [08-禁区与口径冲突](08-禁区与口径冲突.md) | 和 09-08 哪里打架 |
| 10 | [09-验收与评审清单](09-验收与评审清单.md) | 什么叫通过、评审勾选 |
| 11 | [10-决策记录](10-决策记录.md) | 拍板 |
| 12 | [图解-整局与playVerb](图解-整局与playVerb.md) | 流程图 |

## 已实现（代码，不是愿望）

| 切片 | 挂哪 | 证据 |
|---|---|---|
| 默认 tag-shoot：捡中文球扔配对英文小妖 | 全图 | `game.js` `throwOrb` + `game-core.wordTagHits` |
| listen-rings | ep2 `playVerb` | `prj/data/game/levels/ep2.json`；走入匹配光环 |
| type-lock | c02 / ep8 | `ep8.json`；未跟打完不飞；6 键条 |
| gourd-seek | ep40 | `ep40.json`；整集改瞄，不耗葫芦次数 |
| Boss 10s 抢答 | `battle.html` Boss 回合 | `battle-core.js` `RACE_MS = 10000` |
| 冻本集最多 10 词 | 开局 `freezeLevel` | `game-core.js` `SESSION_CARD_LIMIT = 10` |
| 弱词 2/3/30%、assisted、skipped | 地图+战斗 | `recordWeakAnswer`；键 `bookplay_weak_v1` |
| 形近干扰 | NPC/Boss 四选一 | `battle-core.formSimilarity` |
| 「不会」不算错 | NPC 选择 / Boss `#battle-skip` | 不写 `wrongWords` |
| 空手预习 | 点小妖 | `previewMonsterWord` |
| 课堂回路 | `from=lesson` | 回 `lesson.html?ep=` |
| 掌机 Port | 本机已打 | `D:\WorkPlace\X35S\htmljs-to-x35s\build\bookplay` |

定向测试（本会话冻词后）：`game-core` + `battle-core` + `game-page` + `battle-page` **126/126**。全仓 `npm test` 曾到 **520**（抢答落地后、冻词前）；冻词后未再跑全仓。

## 明确不做

- 街机《西游释厄传》拷回卡  
- 代下商业 ROM（PS1/MD）  
- 黑神话、Hero is Back 当一年级主游戏  
- Phaser / Godot / 新 `game-*.html` 引擎  
- 独立 RPG、宠物岛、横版跑酷  
- 改 ROCKNIX `disk=`、e2fsck STORAGE、写 J:  
- 游戏失败改 lesson `passed`

## 下一刀（评审若通过再做）

1. **命中金箍棒敲一下**（攻击 GIF 已有）：满足「简单砍杀手感」，仍先认词再出手。  
2. 真机 X35S 打开 `bookplay` 走 ep1 整局。  
3. 全仓 `npm test` 回基线。

不要从 ROM 另开一条西游产品线。
