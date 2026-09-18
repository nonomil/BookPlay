# 降妖记生图额度包（2026-09-15）

> 额度将尽时：**只补 HUD 道具图标和命中特效**。禁止重画已齐四向角色、禁止重画 ep1–54 背景。

## 一致性协议

1. 所有新图共用 `prompts/00-style-lock.txt` 整段前缀。  
2. **角色**：只 `image_edit` 现有 `wukong-south-idle.png` 等，禁止新 `image_gen`。  
3. **图标套**：先出蟠桃托盘图标，其余五件用 `image_edit` 只换主体。  
4. **特效**：同一品红键控底 `#FF00FF`，不要棋盘格、不要烧字。  
5. 成品进 `prj/data/assets/generated/jttw-hud-fx-v1/`，源文件+prompt 留本夹 `source/`。

## 目录

```
art-kit/
  README.md
  prompts/
    00-style-lock.txt
    01-support-icons.md
    02-hit-fx.md
  source/anchors/     现有悟空/蟠桃/命中图（只引用路径，不复制大图）
  manifest.json       生成后填写
```

锚点（勿覆盖）：

- 角色：`prj/data/assets/generated/jttw-player-walkers/wukong/directions/wukong-south-idle.png`
- 道具风格：`prj/data/assets/game-pickups/peach.png`（青底，新 HUD 图标改品红键控）
- 命中：`prj/data/assets/game-fx/generic/hit-boss.png`

## 本轮要出的文件（引擎能立刻用）

| 文件 | 用途 |
|---|---|
| `support-peach.png` | 托盘蟠桃 |
| `support-fan.png` | 芭蕉扇 |
| `support-gourd.png` | 紫金葫芦 |
| `support-cloud.png` | 筋斗云 |
| `support-mantra.png` | 紧箍咒念珠 |
| `support-staff.png` | 金箍棒 |
| `fx-staff-bonk.png` | 认对后敲击 |
| `fx-listen-ring.png` | 听环 |
| `fx-star-burst.png` | 掉星 |
| `fx-target-arrow.png` | 目标小妖箭头 |
| `fx-combo-sweep.png` | 连击横扫 |
| `fx-shield-flash.png` | 护盾闪 |
