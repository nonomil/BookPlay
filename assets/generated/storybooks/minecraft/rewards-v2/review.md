# Minecraft 第二册故事纪念物生成复核

日期：2026-09-04

## 复核结论

- `bee-nest.png`：通过。蜂巢、蜂蜜和两只小蜜蜂与第 4 页故事锚点一致。
- `panda-sneeze.png`：通过。小熊猫闭眼喷嚏、竹叶、星星和史莱姆球与第 8 页故事锚点一致；白毛没有被去背误删。
- `ink-saddle.png`：通过。只保留马鞍本体，绿色布垫和金色扣环对应 Ink 回家情节；没有整匹马或人物。

## 质量门

- 3 张发布图均为 RGBA PNG。
- 四角 alpha 均为 0，外圈无可见像素。
- `green_visible_pct=0` 且 `green_edge_pct=0`。
- 发布文件只接入 PNG；WebP 与棋盘格原图保留在生成工作区，不进入运行时目录。

## 运行时路径

`content/rewards/storybooks.json` 与 `prj/data/rewards/storybooks.json` 的第二册 3 条奖励均已填写 `room_asset`，并删除 pending 状态。`prj/assets` 是 `content/assets` 的 junction，Android 数据打包会从同一份运行时资产读取。
