# 儿童配乐提示词与风格访谈

这份参考用于在 `assets/generated/music-demo/prompts.json` 中形成可复现的规格。ACE-Step 的音乐描述通常用英文更稳定；歌词可按目标语言写中文或英文。`language`、`lyrics` 的结构要与项目脚本保持一致。

## 询问模板

信息不全时用一条短消息询问下面字段，已在对话中给出的字段不要重复问：

```text
这首音乐用在哪个页面和环节？想要 BGM 还是主题曲？
希望轻柔、明亮、冒险或安静学习，速度偏慢/中速/欢快？
要哪些乐器（例如笛子、木琴、钢琴、琵琶、尤克里里、8-bit）？
要纯音乐、童声、女声还是合唱？歌词语言、目标时长、是否循环？
有没有必须保留的句子、原曲、视频或已经确认的版本？
```

儿童默认风格：旋律容易跟唱，句子短，副歌适度重复，动态平滑，音色圆润；少用密集歌词、尖锐高频、恐怖音效和强烈低频。主题曲要明确写出“clear child-friendly vocal”“sparse short phrases”“gentle ending”等限制；如果用户要哼唱或无词段，明确标注，不能把哼唱误报成完整歌词。

## Prompt 结构

按这个顺序组合 caption，必要字段才写：

```text
original [instrumental/song] for [age and scene].
[mood and story image].
[lead melody and instruments].
[rhythm and dynamics].
[vocal/lyrics constraint].
[ending, loop, tempo, key, mix constraint].
```

避免只堆风格标签。至少说明主旋律由什么乐器承担、音乐要给孩子怎样的动作或情绪、结尾如何收束，以及是否需要人声。

## 项目格式

在 `prompts.json` 中使用如下结构，保留原有键名并为新版本创建新键名：

```json
{
  "new-track": {
    "title": "页面或故事中的名称",
    "duration": 45,
    "bpm": 88,
    "key": "D major",
    "language": "unknown",
    "prompt": "Original gentle instrumental ... no vocals, 88 BPM, D major.",
    "lyrics": "[Instrumental]"
  }
}
```

纯音乐在项目本地脚本中使用 `"[Instrumental]"`，这样脚本会设置 instrumental；走通用 HTTP 命令时则不要传歌词字段。主题曲填写真正的歌词并设置 `language`，不要用 `[Instrumental]` 占位。

## 当前项目的风格基线

- **首页**：温暖、好奇、轻快；木琴或 marimba、尤克里里、拨弦、轻手鼓；简短旋律，纯音乐。
- **西游记**：轻柔抒情、儿童易跟唱、笛子/琵琶/木吉他；歌词少，核心意象是“向前走”“好朋友就在身边”“勇敢的心亮晶晶”。当前用户确认的录屏原版必须直接复用，不要用这个基线重新生成来替换它。
- **我的世界**：温暖探索、柔和 8-bit 拨弦与木琴、空气感笛子或吉他；不刺耳，结尾有满足感，纯音乐。

## 主题曲歌词检查

生成前人工读一遍歌词：是否适合 5–9 岁孩子，是否有过长句或连续信息，是否有自然的重复副歌，是否留出器乐间奏和尾声。生成后以实际试听判断人声、咬字、哼唱比例和收尾；自动转写只能作为辅助证据，不能证明“唱全了”。
