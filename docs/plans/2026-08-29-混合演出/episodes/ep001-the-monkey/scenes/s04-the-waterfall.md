# s04 · 寻源至瀑 / The waterfall

- 集：第 1 集 The Monkey
- **模式：`clip`**
- 绘本页：p9, p10
- 头像：narrator
- 场上角色：troop
- 场景板：瀑布；可从 p10 去字当场景板
- 交互：点词 enormous / waterfall。

## 为何是这种模式

主视觉是瀑布与山路。可把最后一拍做成 hybrid：瀑布静帧当场景，群猴贴纸轻微摆动。

## 句级分镜（时间初值按页内字数加权，全部待校准）

| 拍 | 页 | MP3 起 | MP3 止 | 英文 |
|---|---:|---:|---:|---|
| b01 | 9 | 210.86 | 211.5 | ocean. |
| b02 | 9 | 211.5 | 216.41 | But does anyone know where the stream begins?” |
| b03 | 9 | 216.41 | 222.07 | They all looked at one another and shook their heads. |
| b04 | 9 | 222.07 | 227.62 | “We have nothing to do today,” the monkey continued. |
| b05 | 9 | 227.62 | 237.98 | “Why don’t we follow the stream to find its source?” “That sounds like fun,” said another monkey. |
| b06 | 10 | 237.98 | 241.42 | “Let’s go!” said a third monkey. |
| b07 | 10 | 241.42 | 244.97 | Everyone jumped out of the water. |
| b08 | 10 | 244.97 | 251.21 | They ran alongside the stream and swung from tree to tree. |
| b09 | 10 | 251.21 | 256.69 | They jumped over rocks and climbed up steep cliffs. |
| b10 | 10 | 256.69 | 265.84 | Higher and higher they went up the mountain until they reached an enormous waterfall. |
| b11 | 10 | 265.84 | 267.99 | Mist filled the air. |
| b12 | 10 | 267.99 | 272.83 | The water crashed down, roaring like thunder. |
| b13 | 10 | 272.83 | 277.13 | “I wonder what’s behind that waterfall,” |

## 视频拆分

- 源视频：`data/Journey to the West西游记 中英双字幕版108集视频/西游记英文版【中英字幕】01.mp4`
- 源音频：`demo/assets/lf_ep1/audio_ep1.mp3`（约 340s）
- 输出：`demo/assets/lf_ep1/beats/s04-bXX.mp4`（须 ffmpeg；未装则用页图 + MP3 seek）
- 校准：听整集 MP3，按句改 start/end；视频对不齐就冻帧。
