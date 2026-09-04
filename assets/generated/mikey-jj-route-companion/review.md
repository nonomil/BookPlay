# Mikey & JJ route companion review

- 造型：红色连帽衫、蓝色牛仔裤、紫色运动鞋的方块漫画男孩。
- 动作：east/south/north 三向生成八帧行走，west 使用 east 镜像。
- 画布：每帧固定 384×512，脚底线由合成脚本校准到 y=466。
- 透明：三张方向图均经 chroma-key 去背；四角透明，绿色可见像素为 0%。
- 运行：地图使用 `content/assets/generated/mikey-jj-route-companion/transparent/mikey-walk-atlas.png`，CSS 保持 800%×400% 精灵表比例。
