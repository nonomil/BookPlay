# Minecraft 奖励体系第二轮：第二册资产验收

日期：2026-09-04

## 交付

第二册《Mobs in the Overworld》的 3 件故事纪念物已生成、去背、复核并接入运行时：

| 物品 | 故事锚点 | 运行时 PNG |
|---|---|---|
| 小蜂巢装饰 | 第 4 页：发现蜂巢与蜂蜜 | `assets/generated/storybooks/minecraft/rewards/stickers/bee-nest.png` |
| 小熊猫喷嚏贴 | 第 8 页：竹林喷嚏并弹出史莱姆球 | `assets/generated/storybooks/minecraft/rewards/stickers/panda-sneeze.png` |
| Ink 的小马鞍 | 第 13–15 页：Ink 带 Emmy 回家 | `assets/generated/storybooks/minecraft/rewards/stickers/ink-saddle.png` |

生成记录和提示词：`assets/generated/storybooks/minecraft/rewards-v2/manifest.json`、`review.md`。

## 质量与运行时证据

- Cliprox `gpt-image-2` 通过统一 `bee_image_workflow.py` 生成；没有把密钥写入提示词、清单或日志。
- 3 张最终文件均为 RGBA PNG，四角透明，`green_visible_pct=0`、`green_edge_pct=0`。
- 熊猫图对棋盘格去背后白毛有误删风险，额外用 GrabCut 分割并保留 12px 安全边距；人工视觉检查通过。
- `content/rewards/storybooks.json` 与 `prj/data/rewards/storybooks.json` 的 6 件 Minecraft 奖励均有 `room_asset`，不再保留 pending 状态。
- Android 数据包已刷新；`dist/android-data` 中 6 张 PNG 均存在且四角 alpha 为 0。
- 浏览器 `room.html?series=minecraft` 以 3 件已拥有物品抽样，3 张图均请求 200；页面显示 3 件纪念品并能点击互动。

## 回归结果

- `npm test`：288/288 通过。
- `npm run test:content`：23/23 通过。
- Android engine 镜像：10/10 文件一致。
- 全仓 `pytest`：243 通过，另有 2 个与本轮 Minecraft 资产无关的既有失败（`test_drill_review_tabs.py` 的 map 文本编码断言、`test_wala_modules.py` 的 wala.js 体积阈值）。本轮未改动相关模块。
