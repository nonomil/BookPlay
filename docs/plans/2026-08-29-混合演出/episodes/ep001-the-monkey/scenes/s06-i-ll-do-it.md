# s06 · 石猴请战 / I'll do it

- 集：第 1 集 The Monkey
- **模式：`sprite`**
- 绘本页：p12
- 头像：wukong（data/Journey to the west_图片/封面.png 左侧）
- 场上角色：wukong, gibbon
- 场景板：水帘洞入口（p12 或 p10 风格化，不要等距沙海）
- 交互：必选：Go, Monkey! / It looks dangerous。然后章末 5 题。

## 为何是这种模式

封面悟空轮廓干净，适合立绘待机/说话。场景用水帘洞简化板。这是第 1 集唯一优先做可动立绘的一幕。

## 句级分镜（时间初值按页内字数加权，全部待校准）

| 拍 | 页 | MP3 起 | MP3 止 | 英文 |
|---|---:|---:|---:|---|
| b01 | 12 | 309.95 | 313.62 | “Me neither,” said a short monkey. |
| b02 | 12 | 313.62 | 317.17 | A voice called out, “I’ll do it!” |
| b03 | 12 | 317.17 | 323.75 | Everyone moved out of the way as the speaker stepped forward. |
| b04 | 12 | 323.75 | 325.26 | It was Monkey. |
| b05 | 12 | 325.26 | 328.82 | “Are you sure?” asked the gibbon. |
| b06 | 12 | 328.82 | 331.09 | “It looks dangerous.” |
| b07 | 12 | 331.09 | 332.7 | Monkey laughed. |
| b08 | 12 | 332.7 | 335.72 | “I’m not afraid of anything! |
| b09 | 12 | 335.72 | 339.82 | And when I come back, I will be king!” |

## 视频拆分

- 源视频：`data/Journey to the West西游记 中英双字幕版108集视频/西游记英文版【中英字幕】01.mp4`
- 源音频：`demo/assets/lf_ep1/audio_ep1.mp3`（约 340s）
- 输出：`demo/assets/lf_ep1/beats/s06-bXX.mp4`（须 ffmpeg；未装则用页图 + MP3 seek）
- 校准：听整集 MP3，按句改 start/end；视频对不齐就冻帧。
