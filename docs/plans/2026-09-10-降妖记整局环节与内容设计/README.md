# 2026-09-10 降妖记整局环节与内容设计

> **增量方案，不新开引擎。** 玩法禁区仍以 [`../2026-09-08-降妖记完整游戏设计/README.md`](../2026-09-08-降妖记完整游戏设计/README.md) 为准。  
> 对战 UI / Boss 技能细表见 [`../2026-09-10-降妖记对战丰富与Boss能力/README.md`](../2026-09-10-降妖记对战丰富与Boss能力/README.md)。  
> 本包回答：孩子从选关到结算经过哪些环节、背景分几层、像素世界 JSON 怎么映射成西游内容。

## 一句话

降妖记仍是「读完 → 巩固 → 用本集词去玩」。像素世界的三世界 × 20 关只借 **格式**（世界、节点、一关一场对话、中间一次互动），文案、图标、坐标、侦探关一律不搬。

## 参考包是什么（只对照，不进口）

路径：`G:\StudyCode\宠物积分系统\data\story-packs\05-pixel-worlds-story\`

| 参考件 | 数量 | 借什么 | 不借什么 |
|---|---|---|---|
| `manifest.json` `worlds[]` | 3 世界（另有 detective 20 关 bonus） | 合辑=世界、集=节点、`position/icon/title` | 星港/森林/方块标题、tone、20 点手绘坐标 |
| `app/explore-terminal/` | 1 个首页原型 | 世界卡 + 16:9 舞台 + 覆盖节点 | 侧栏宠物环、侦探入口、三槽 CSS |
| `levels/sf-01.json`～`sf-20.json` | 20 | 一关 JSON：`scenes[].lines[]` | 「看见信号 / 月尘脚印」文案 |
| `levels/forest-XX.json` | 20 | 同上结构 | 脚印、传信藤、萤火溪 |
| `levels/block-XX.json` | 20 | 同上结构 | 方块村、矿车 |
| `levels/detective-XX.json` | 20 | **整包忽略** | 第四世界、侦探小游戏 |

单关形态（三世界同构）：**1 场 × 11 行**，中间 1 次 `activity`（2 个无对错按钮）。`choice` 不在像素 `levels/` 里，只在 `dialogue-story-template`。

## 阅读顺序

| 顺序 | 文件 | 回答什么 |
|---|---|---|
| 1 | 本 README | 边界、映射总表、已落地 |
| 2 | [00-总方案与环节](00-总方案与环节.md) | 孩子怎么走完一局 |
| 3 | [01-选关世界与节点](01-选关世界与节点.md) | map.html 合辑舞台 |
| 4 | [02-关卡内三站](02-关卡内三站.md) | 小妖 / 问答 / 大战 |
| 5 | [03-剧情数据合同](03-剧情数据合同.md) | levels JSON → npcDialogue |
| 6 | [04-背景与舞台](04-背景与舞台.md) | 三层背景、现有图 |
| 7 | [05-对战Boss与题型](05-对战Boss与题型.md) | battle.html 在环节里的位置 |
| 8 | [06-内容生产与集数](06-内容生产与集数.md) | 一集要产什么、从哪抄真源 |
| 9 | [07-落地顺序与验收](07-落地顺序与验收.md) | 切片、测试、禁区 |
| 10 | [08-擂台与可复用套件](08-擂台与可复用套件.md) | 星露谷=世界、宝可梦=擂台、生图接入 |
| 11 | [09-全关卡复用工作流](09-全关卡复用工作流.md) | 后面每一集只跑生成器，不复制引擎 |
| 12 | [10-流程一套资产按集换](10-流程一套资产按集换.md) | 玩法流程锁定，角色地图词按集换 |

## 总映射

| 像素世界 | 降妖记 | 真源 |
|---|---|---|
| `worlds[].id`（sci-fi/forest/block） | `collections[].id`（c01…） | `content/dialogue_stories/collections.json` |
| `nodes[]`（20 站） | 该辑 `from`–`to` 的集 | 同上 + `catalog.json` |
| `levels/{id}.json` | `content/game/levels/epN.json` | 生成器 `prj/tools/build_game_levels.py` |
| 11 句 galgame | intro 2 句 + quiz 1 句 1 题 | `dialogue_stories/epN.json`；手写增强 `content/game/dialogues/epN.json` |
| `activity` 六种小游戏 | **不建**。互动拍 = 捡投 / NPC 一题 / Boss 答题 | 现有 `game.js` + `battle.js` |
| `rewards.growthPoints` | 已有星星 / `npcBonus` | 两存储键，不加第三套积分 |

## 三种做法（已选 C）

| 方案 | 内容 | 结论 |
|---|---|---|
| A. 进口三世界 80 关当第二游戏 | 新首页、新存档、森林台词 | **否决**。09-08 已砍世界 tab |
| B. 每集改成 11 句立绘剧 + 六种 activity | 丢掉捡投主循环 | **否决**。主循环永远是大地图捡投 |
| C. 合辑当世界、集当节点；关内仍三站 | 只借 JSON 形状和选关外观 | **采用**。map 终端已按此落地 |

## 已落地（浏览器，非真机）

- 选关：合辑世界卡 + 16:9 舞台 + 百分比节点（`map.js?v=57`）
- 关内：捡投、散开追击、每集投掷道具、三站 HUD、霜玻璃对话、NPC 选项与 feedback
- 进 Boss：`battle.html?…&skip=intro,preview,waves,quiz&from=game`；结算「下一集」进 `game.html?ep=N+1`（不直进 battle）
- 数据：`ep1.json`–`ep54.json` 已烘焙；手写对白目前 **仅 ep1、ep5**（ep1 手写 quiz 仍无 `options`，会盖掉生成器的官方题）
- 存储：只 `bookplay_battle_progress_v1` / `bookplay_battle_collection_v1`

09-08 写过、代码仍不同的：完成态 `showCompletedRun()` **锁死重打**（设计曾说可逛）；ep1 `map.walkable.h` 仍偏窄横廊。新文以代码为准，不抄 09-07 的 3×3 / 居中跟随。

## 明确不做

- 星港 / 森林 / 方块 / 侦探文案与图
- 为 c08 生成大地图点位或新主题图（除非用户点名）
- 每集 11 句 galgame、`goto` 分支树、成长积分
- 把 scan/collect/route/repair/care/build 做成六套小游戏
- 新游戏存档键、Phaser、真机通过声称
