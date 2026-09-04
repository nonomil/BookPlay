# JTTW route companion review

- 造型：原创可爱版孙悟空风格小人，金箍、红披风、云纹衣和金箍棒保持一致。
- 动作：8 帧向右行走循环；四种步态各重复一次，首尾接触步态相邻，适合路线节点间循环播放。
- 画布：每帧固定 384×512，脚底线在 y≈466；底行已向下校准，避免播放时上下跳动。
- 透明：真实 RGBA alpha；四角 alpha=0；绿色幕布可见像素和边缘残留均为 0%。
- 运行：地图 CSS 以 800% 横向精灵表、`steps(8)` 播放，显示尺寸保持 36×48，宽高比不变。
- 运行时文件：`content/assets/generated/jttw-route-companion/transparent/`。

拒绝的第一版：模型输出了棋盘格背景且底行基线偏高，因此只保留为 `tmp/imagegen/jttw-route-companion/` 调试样本，不进入运行包。
