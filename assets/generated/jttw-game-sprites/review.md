# jttw-game-sprites 质检小结（c01 六小角色）

生成：2026-09-05/06，三个并行代理执行；provider cliprox / gpt-image-2。
全部角色 4 行 × 8 列分镜（行=方向，列 1-4 走路 + 5-8 持械动作），32 帧齐全、四向 walk+action GIF 齐全、alpha 报告齐全。

| 角色 | 目录 | 尝试 | 关键处理 |
|---|---|---|---|
| monkey-minor 小猴子 | c01/ep01 | 1 次 | 假棋盘格背景 → checkerboard 移除；帧 238×238 |
| subodhi-disciple 道童 | c01/ep03 | 1 次 | 模型第 2/3 行朝向对调，按实际语义重命名（manifest 记录映射） |
| chaosdemon-minion 水妖 | c01/ep05 | 2 次 | 棋盘格移除 + 跨格碎片连通域清理；帧 192×256 |
| dragonking-soldier 虾兵 | c01/ep06 | 2 次（拒绝 1） | 第 2 版网格错位已拒绝并保留存档；用第 1 版 |
| underworld-clerk 阴差 | c01/ep07 | 1 次 | 白色眼高光小孔边界连通性修复，镂空保留 |
| imp 小妖 | c01/shared | 1 次 | 同 checkerboard 流程 |

共性说明：provider 忽略 1536x1024 请求、实际返回 1774x887（各 manifest 如实记录）；提示词"transparent background"导致模型绘制假透明棋盘格，统一走 checkerboard 移除管线兜底。
运行时同步：四向 GIF（每角色 4 个）已拷贝至 content/assets/game-sprites/<id>/（prj/assets 为 junction 自动可见），并注册进 content/game/sprites.json。32 帧 PNG 留本工作区，v2 大地图需要帧级动画时再入包。
