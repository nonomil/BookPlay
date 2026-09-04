# s01 · 石破天惊 / The rock splits

- 集：第 1 集 The Monkey
- **模式：`clip`**
- 绘本页：p3
- 头像：narrator
- 场上角色：无
- 场景板：绘本 p03 山石，或视频开场山景
- 交互：无选择。可点词 magic / split open。

## 为何是这种模式

画面是山与仙石，没有可独立行走的角色。用句级视频（或页图+整句音频）推进，旁白头像即可。

## 句级分镜（时间初值按页内字数加权，全部待校准）

| 拍 | 页 | MP3 起 | MP3 止 | 英文 |
|---|---:|---:|---:|---|
| b01 | 3 | 0.0 | 7.42 | From the beginning of time, a rock had sat high on top of a mountain. |
| b02 | 3 | 7.42 | 15.16 | The sun, the moon, Heaven, and Earth all worked their magic on the rock. |
| b03 | 3 | 15.16 | 18.17 | One day the rock split open. |
| b04 | 3 | 18.17 | 20.32 | Inside was a monkey. |
| b05 | 3 | 20.32 | 23.97 | The monkey stood up and stretched. |
| b06 | 3 | 23.97 | 28.59 | Suddenly powerful light shot from his eyes. |
| b07 | 3 | 28.59 | 34.83 | For a moment the light reached the Cloud Palace in Heaven. |

## 视频拆分

- 源视频：`data/Journey to the West西游记 中英双字幕版108集视频/西游记英文版【中英字幕】01.mp4`
- 源音频：`demo/assets/lf_ep1/audio_ep1.mp3`（约 340s）
- 输出：`demo/assets/lf_ep1/beats/s01-bXX.mp4`（须 ffmpeg；未装则用页图 + MP3 seek）
- 校准：听整集 MP3，按句改 start/end；视频对不齐就冻帧。
