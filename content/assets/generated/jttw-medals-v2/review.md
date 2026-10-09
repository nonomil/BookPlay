# JTTW medals v2 · generation review

## Intended delivery

- 19 枚西游勋章，4×5 GPT 图标表（第 20 格为备用，不接入运行时）。
- 模型：gpt-image-2；后端：CliproxAPI；背景：纯 #00ff00，再去背为 RGBA PNG。
- 发布目录：transparent/；应用只读取语义化 PNG，不读取 prompt、raw response 或 split 中间文件。

## Attempts

| Attempt | Request | Result |
| --- | --- | --- |
| 1 | asset-sheet, 1536×1536, 300s × 3 | Cliprox read timeout，未产生图片 |
| 2 | asset-sheet, 1024×1024, 900s × 1 | Cliprox read timeout，未产生图片 |
| 3 | asset-sheet, 1536×1536, 900s × 1 | 成功；返回 1254×1254 图集，去绿后自动切出 20 格 |

第 3 次生成已将 20 个切图逐张按语义命名，其中 19 枚接入运行时，`spare-cloud-star.png` 仅作为备用素材保留。每张发布图均为 RGBA PNG，四角透明，`green_visible_pct=0`、`green_edge_pct=0`；对应 JSON 质量报告与 `batch-manifest.json` 一并保留在 `transparent/`。前端仍保留图片加载失败时的 glyph 回退，避免单个资源损坏阻塞勋章墙。

## Browser delivery contract

- 所有 19 枚卡片始终可见；未解锁只显示锁标识与目标进度，不提供直接解锁按钮。
- 点击任意卡片（包括未解锁）打开详情弹窗：大图、解锁状态、中文解释、获得条件、日期和动态预览文案。
- 动态采用 CSS 浮动/高光预览；`prefers-reduced-motion` 时自动停用动画。
