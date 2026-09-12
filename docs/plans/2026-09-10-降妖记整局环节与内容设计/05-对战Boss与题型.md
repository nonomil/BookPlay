# 05 对战 Boss 与题型

像素世界 **没有** 这一环。降妖记的大战站跳出大地图，进 `battle.html`，打完再回来。

细表不重复抄：

- 循环与 UI 缺口：[`../2026-09-10-降妖记对战丰富与Boss能力/00-总方案.md`](../2026-09-10-降妖记对战丰富与Boss能力/00-总方案.md)
- 18 个 Boss 技能：[`../2026-09-10-降妖记对战丰富与Boss能力/01-Boss能力资产表.md`](../2026-09-10-降妖记对战丰富与Boss能力/01-Boss能力资产表.md)
- 运行时草稿：`content/game/boss-kits.json`

## 在整局里的位置

```
game.html 大战站亮起
    → battle.html?ep=N&skip=intro,preview,waves&from=game&wrong=错词
    → 打赢 mapStage=complete
    → game.html?ep=N&from=battle（完成态可逛）
```

从地图进来：**跳过**战斗页自己的预习闪卡和小怪波。错词优先进 Boss 词格。

禁止结算「下一集」直进 `battle.html?ep=N+1`。

## 孩子怎么打（设计口径）

答题就是出招。不要「先选技能再选答案」。

- 答对：悟空默认金箍棒，扣 1 格 Boss；连对 3 用棒影必杀
- 答错 / 跟打超时：Boss 进攻技能，扣我方血（3 心）
- 护体：回合间隙可点一次，抵下一次伤害
- 我方见底：本场重开，地图击杀保留
- 血条：双方都画在底部；题和选项在上方（UI 尚未按此改完）

## 题型（同一 battle 状态机）

| id | 孩子看到 | 来源 |
|---|---|---|
| `zh-choice` | 大号英文，点中文 | 本集词 |
| `en-choice` | 大号中文，点英文 | 本集词 / Boss 词 |
| `listen-choice` | 听读音，点中文或图 | 本集词 + 静态音 |
| `typing` | 跟打英文，倒计时 | 地图已有 `typingStep`；对战页尚未接 |
| `official` | 巩固官方题 | `official_quiz` / lesson card |

每场轮换，不要整场一种题。typing-defense 只借「限时跟打」这一种题，不上独立塔防引擎。

## 数据

- Boss 是谁：`content/game/cast.json` `bossByEp`（18 个 id 多集复用）
- 词：本集 `previewWords` / `boss.hpWords`，约 4 格
- 套件：`boss-kits.json` 与 01 表同步；特效图多数未生

## 现状 vs 本包

| 设计 | 代码现状 |
|---|---|
| 题在上、双方血条在下 | 仍偏旧战斗台：词球点选、Boss 血条、答错扣盾 emoji |
| 答错播 Boss 进攻动画 | 有突进/后仰，无套件化技能 FX；`boss-kits.json` 引擎 **0 引用** |
| 题型轮换 | 以点选为主；无 `listen-choice` / 对战页 `typing` |
| 从地图进跳过预习波和关底测验 | **已落地** `skip=intro,preview,waves,quiz` |
| 结算下一集进大地图 | **已落地** `game.html?ep=N+1` |

实施顺序见 [07](07-落地顺序与验收.md) 与 09-10 `00-总方案` 切片。
