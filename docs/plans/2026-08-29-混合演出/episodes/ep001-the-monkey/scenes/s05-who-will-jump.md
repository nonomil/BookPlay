# s05 · 谁敢一跳 / Who will jump

- 集：第 1 集 The Monkey
- **模式：`hybrid`**
- 绘本页：p11
- 头像：gibbon（p11 中心大猿裁切）
- 场上角色：gibbon, troop
- 场景板：p11 去字当场景板
- 交互：必选：I would try / I would stay back。未选不能进下一句。

## 为何是这种模式

剧情拐点。绘本 p11 群猴挤在一起，立绘走不了路，但适合「场景板+对话头像+选择」。视频按句切开，选完再进下一幕。

## 句级分镜（时间初值按页内字数加权，全部待校准）

| 拍 | 页 | MP3 起 | MP3 止 | 英文 |
|---|---:|---:|---:|---|
| b01 | 11 | 277.13 | 278.85 | said one monkey. |
| b02 | 11 | 278.85 | 282.17 | “Me too,” said a second monkey. |
| b03 | 11 | 282.17 | 285.92 | “But nobody could jump through it.” |
| b04 | 11 | 285.92 | 294.4 | “Whoever can jump through and come back alive will be our king,” said a gibbon. |
| b05 | 11 | 294.4 | 297.83 | “Is anyone brave enough to try?” |
| b06 | 11 | 297.83 | 302.87 | All the monkeys and apes looked at one another. |
| b07 | 11 | 302.87 | 305.34 | They shook their heads. |
| b08 | 11 | 305.34 | 309.95 | “I’m not going to try,” said a tall monkey. |

## 视频拆分

- 源视频：`data/Journey to the West西游记 中英双字幕版108集视频/西游记英文版【中英字幕】01.mp4`
- 源音频：`demo/assets/lf_ep1/audio_ep1.mp3`（约 340s）
- 输出：`demo/assets/lf_ep1/beats/s05-bXX.mp4`（须 ffmpeg；未装则用页图 + MP3 seek）
- 校准：听整集 MP3，按句改 start/end；视频对不齐就冻帧。
