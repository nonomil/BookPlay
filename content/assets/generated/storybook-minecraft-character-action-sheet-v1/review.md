# Minecraft Book 1 pilot 视觉验收

## 结果

- 生成：`2d/minecraft-character-action-sheet-v1.png`，1536×1024，Cliprox `gpt-image-2`。
- 按 3×3 网格拆分为 9 个语义动作；运行时副本位于 `prj/assets/generated/storybooks/minecraft/characters/`。
- 9/9 输出均为 RGBA、四角透明；`transparent/**.report.json` 的 `green_visible_pct` 与 `green_edge_pct` 均为 0。
- Steve 蓝衫、Alex 橙发绿衣、Byte 蓝项圈在样板中保持稳定；三者与宝箱的完成构图适合完成卡。

## 限制与后续

- 当前是静态动作样板，CSS 位移/缩放即可用于播放反馈；连续动作暂不生成 sprite 帧。
- 生成图更接近儿童像素漫画而非游戏官方截图；不会在页面中加入官方 UI 或可读文字。
- 接入 `storybook.js` 前需完成浏览器截图和 96px 缩略图检查；本轮只完成资产质量门，不改变现有播放器行为。
