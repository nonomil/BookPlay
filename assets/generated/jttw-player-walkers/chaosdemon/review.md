# 混世魔王四向动作资产验收

- 角色：混世魔王（Demon of Chaos），第一章小怪/对话角色
- 方向顺序：east、south、west、north
- 每个方向：8 帧，前 4 帧为原地走路，后 4 帧为云纹棍练习动作
- 单帧：384×512；总图集：3072×2048（8 列×4 行）
- 帧时长：150 ms；south 行另导出为 `chaosdemon-walk.gif`
- 原始分镜：各方向 `2d/directions/<direction>/chaosdemon-<direction>-walk-action-sheet.png`，保留对应提示词与接口响应记录
- 透明处理：`transparent-image-generator` 的 chroma-key（#00ff00），透明发布图和 GIF 已复制到 `content/assets/generated/jttw-player-walkers/chaosdemon/`

## 验收证据

- 四张原始分镜均为 1536×1024；四个透明报告均为 RGBA、四角透明、`green_visible_pct=0.0`、`edge_visible_pixels=0`
- 32 个运行时帧均为 384×512，方向行与动作帧顺序写入全局 `manifest.json`
- 四个方向 GIF 均为 384×512、8 帧、150 ms，运行时副本与透明源文件 SHA-256 一致
- 东向已追加方向门禁提示词，确保 8 个单元全部为右侧面；南向为正面，西向为左侧面，北向为背面

## 已知限制

生图模型偶尔会在云纹棍挥动帧添加轻微绿色速度线或装饰色；这些像素在最终透明质量报告中已被 chroma-key 清除。动作资产仍保留原始 2D 分镜，便于后续按具体玩法重新绘制或生成攻击特效。
