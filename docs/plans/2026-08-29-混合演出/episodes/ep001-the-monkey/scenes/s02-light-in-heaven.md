# s02 · 天庭惊光 / Light in Heaven

- 集：第 1 集 The Monkey
- **模式：`clip`**
- 绘本页：p4, p5
- 头像：jade-emperor（页内裁切，脏边可接受）
- 场上角色：jade-emperor, captain
- 场景板：云宫；不做新地图
- 交互：句末可插 1 题：Who is the ruler of Heaven?

## 为何是这种模式

玉帝、将领只出现在绘本/视频里，封面没有干净立绘。群像对话适合句级短片，停在每一句上提问。

## 句级分镜（时间初值按页内字数加权，全部待校准）

| 拍 | 页 | MP3 起 | MP3 止 | 英文 |
|---|---:|---:|---:|---|
| b01 | 4 | 34.83 | 39.35 | The Jade Emperor, ruler of Heaven, sat up. |
| b02 | 4 | 39.35 | 45.59 | He turned to one of his captains, who was standing nearby. |
| b03 | 4 | 45.59 | 51.19 | “Find out what caused that light,” said the emperor. |
| b04 | 4 | 51.19 | 55.27 | “Yes, Your Majesty,” said the captain. |
| b05 | 4 | 55.27 | 59.04 | The captain rushed out of the hall. |
| b06 | 4 | 59.04 | 67.22 | He looked out the southern gate of Heaven and saw the monkey on Earth below. |
| b07 | 4 | 67.22 | 67.54 | The |
| b08 | 5 | 67.54 | 69.16 | light was gone. |
| b09 | 5 | 69.16 | 72.84 | But the captain had magical sight. |
| b10 | 5 | 72.84 | 77.93 | He could see everything that had just happened. |
| b11 | 5 | 77.93 | 81.39 | “Interesting,” said the captain. |
| b12 | 5 | 81.39 | 87.45 | “Well?” said the Jade Emperor when the captain returned. |
| b13 | 5 | 87.45 | 90.05 | “What caused the light?” |
| b14 | 5 | 90.05 | 93.95 | “It was a monkey,” said the captain. |
| b15 | 5 | 93.95 | 97.73 | “A monkey?” asked the Jade Emperor. |
| b16 | 5 | 97.73 | 100.33 | “Yes,” said the captain. |
| b17 | 5 | 100.33 | 101.63 | “He’s on the |

## 视频拆分

- 源视频：`data/Journey to the West西游记 中英双字幕版108集视频/西游记英文版【中英字幕】01.mp4`
- 源音频：`demo/assets/lf_ep1/audio_ep1.mp3`（约 340s）
- 输出：`demo/assets/lf_ep1/beats/s02-bXX.mp4`（须 ffmpeg；未装则用页图 + MP3 seek）
- 校准：听整集 MP3，按句改 start/end；视频对不齐就冻帧。
