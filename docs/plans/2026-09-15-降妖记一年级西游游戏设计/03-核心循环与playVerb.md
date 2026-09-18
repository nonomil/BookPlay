# 03 核心循环与 playVerb

## 默认通关（不可替换）

```text
走近中文词球捡起（同时只持 1）
  → 点头顶英文小妖扔出
    → 中文配对则命中爆碎
    → 不配对则弹回
```

实现：`prj/engine/game.js` `pickUp` / `throwOrb`；判定 `game-core.js` `wordTagHits` / `chooseThrowTarget`。  
点谁飞谁；**只有**葫芦次数或 `gourd-seek` 才改瞄配对怪。

失败：无 Game Over。盾碎重置本波。学习 `passed` 不动。

## playVerb =「这一集怎么出手」

不是新引擎。关卡 JSON 字段 `playVerb`（或 `verb`），未知回落 `tag-shoot`。

```javascript
// game-core.js PLAY_VERBS
tag-shoot | listen-rings | type-lock | gourd-seek
```

`resolvePlayVerb(rawLevel)` 在 `game.js` 开局赋值 `state.playVerb`。

| 动词 | 挂载 | 玩家做什么 | 核心函数 |
|---|---|---|---|
| tag-shoot | 默认 | 捡中文 → 扔配对英文 | `wordTagHits` |
| listen-rings | ep2 | 听英文，走进发光词环；扔球仍可用 | `listenRingHits` / `chooseListenRing` / `listenRingWalkHit` |
| type-lock | c02 / ep8 | 捡球后必须跟打完英文才飞 | `throwLocked` / `typingStep` / `typePadLetters` |
| gourd-seek | ep40 | 整集自动改瞄配对小妖 | `seekAutoAim` → `chooseThrowTarget(..., auto=true)` |

掌机 type-lock：底部 6 键，**下一字母必在键里**（曾有旋转把首字母挤出 6 键的 bug，已修）。

## 空手预习

空手点小妖 / 靠近确认：出词卡（英+中+朗读），**不扔**。持球后再点才 `throwOrb`。  
母本：`G:\StudyCode\小游戏项目\games\word-memory-map` 的 `previewTargetWord`。

## 建议未做：金箍棒敲击

命中时播已有 `attackGifs` + 短震动/打击字。仍先认词。不要做成无匹配的 A 键连斩。

## 分集节奏（按情节，不是整本合辑盖章）

默认省略 `playVerb` = `tag-shoot`（捡中文球扔配对英文）。

| 动词 | 集 | 为什么跟内容有关 |
|---|---|---|
| listen-rings | 2 水帘洞、7 幽冥、16 被骗、20 黑熊精、32/34/36 白骨精骗术、58 禅定比试、73 真假美猴王、86 金铃 | 听声、辨真假、黑暗里听 |
| type-lock | 4 密咒、8 天庭差事、13 真经、42 孙空悟（假名）、57 猜谜、106 问难 | 要写出名字/咒语/答案 |
| gourd-seek | 29 袖里乾坤、31 净瓶、40 紫金葫芦、45 井中宝、52 净瓶化海 | 法宝自己找目标 |
| fan-blow | 24 黄风怪、25 风术、77 芭蕉扇、96 风雾 | 朝面朝方向扇，只吹中锥里配对英文 |
| fire-ward | 50 三昧真火、79 火焰山、85 火烟沙 | 贴脸太近锁扔，退开再砸 |
| tag-shoot | 其余（含 1 出世、9 蟠桃园、11 大闹天宫、49 红孩儿） | 本章就是打/摘/闯 |

补挂已有动词：3/12/63 跟打（学艺、打赌、问佛）；15/74 听环（饮茶、顺风耳）；22/46/62 葫芦（怪丹、千丸、鱼篮）。

不在表里的集不要硬加动词。以后新动词（芭蕉扇吹、三昧真火躲）也按情节挂一集，不整章覆盖。
