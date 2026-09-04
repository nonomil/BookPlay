# Mikey & JJ 视频音频、句子切分与重点词点读报告

日期：2026-09-02  
范围：`书籍资料库/Mikey & JJ 英文冒险/MikeyJJ Audio Books`  13 个 MP4

## 结论

10 个能与已入库绘本严格同名匹配的 MP4 已用锁定 ffmpeg 提取为项目来源 MP3，并依据各书现有的真实 `start_ms/end_ms` 标注重新生成句子 clip。播放器继续消费 `assets/mikey-jj/<slug>/sentences/*.mp3`，因此无需改变前端路径；每本书的 `sources` 同时记录了原始视频和项目来源音频。

10 本书的 glossary 已进一步生成 222 个去重英文重点词音频，以及 224 个按中文释义去重的中文音频（同一英文词的不同语境释义分别保留）。两种声音均使用 Edge TTS 预生成（英文 `en-US-JennyNeural`、中文 `zh-CN-XiaoxiaoNeural`），播放器点读时按“英文 → 中文”播放，静态文件失败才回退 `/api/tts`。

可复用入口：

```powershell
python -X utf8 prj/tools/mikey_jj_audio_import.py run
```

这个命令不会写入或覆盖资料库源 MP4；它只写 `prj/data/storybooks-mikey-jj/source-audio/`、句子 clip 和音频清单。

重点词音频入口：

```powershell
python -X utf8 prj/tools/mikey_jj_vocab_audio.py
```

已有音频只需重建清单时使用 `--index-only`；该模式不会访问 Edge TTS。

## 产物与数量

| Book | slug | 真实音频时长（ms） | 书中句子 | 可播放 clip |
|---:|---|---:|---:|---:|
| 1 | zombie-school-adventure | 146090 | 64 | 64 |
| 2 | water-house-adventure | 130820 | 54 | 54 |
| 3 | penguin-adventure | 147790 | 65 | 65 |
| 5 | tornado-adventure | 159410 | 34 | 34 |
| 6 | godzilla-adventure | 153790 | 48 | 47 |
| 7 | piglin-adventure | 155020 | 36 | 36 |
| 8 | burger-shop-adventure | 140810 | 46 | 46 |
| 9 | scary-cat-adventure | 117340 | 30 | 30 |
| 10 | cruise-ship-adventure | 154780 | 39 | 39 |
| 11 | noob-to-king-adventure | 147260 | 42 | 42 |
| **合计** |  |  | **458** | **457** |

清单文件：`prj/data/storybooks-mikey-jj/audio-manifest.json`。其中每本记录源视频 SHA-256、派生 MP3 SHA-256、时长、预期句数和实际 clip 数量。派生 MP3 与资料库已有的同名 MP3 SHA-256 全部一致，说明这次只是把正确的来源链补齐，并没有改变声音内容。

重点词清单与音频：`prj/assets/mikey-jj/vocab/index.json`、`prj/assets/mikey-jj/vocab/en/*.mp3`、`prj/assets/mikey-jj/vocab/zh/*.mp3`。清单同时提供 `terms`（英文词）和 `definitions`（中文释义）双索引，路径使用运行时可直接消费的 `assets/...`（不包含本机 `prj/` 前缀）。

重点词可在句子字幕、句中金色词、右侧 Key words 卡片、章末复习卡和气泡词按钮点击；中文释义继续写入生词本。

## 严格映射边界

仅处理以下 10 个完全同名项：Zombie School、Water House、Penguin、Tornado、Godzilla、Piglin、Burger Shop、Scary Cat、Cruise Ship、Noob to King。

以下 3 个本地视频没有同名可发布绘本，已写入清单的 `unmatched_local_videos`，没有与 Slime Jail 或其他书猜配：

- `Baby Creeper Adventure.mp4`
- `Slime King Adventure.mp4`
- `Warden Adventure.mp4`

## 例外与后续

- `b6-p09-s01`（Godzilla 第 9 页）是画面爆炸拟声，书籍 JSON 明确为 `audio: null`。切分器不会为它保留 MP3；该句的文字、中文、speaker、bubble 和单词数据仍保留。它是 48 个标注句中的唯一不可播放句。
- 现有若干书的一个气泡包含多个终止标点（例如 `b5`、`b7`、`b9`）。本轮不按字符猜切，也不伪造新时间边界；批量校验时只对这些已存在的视觉气泡使用记录过的 compound exemption。下一轮如要把它们继续拆成更细的播放单位，需要逐页核对画面气泡和真实停顿。

## 验证证据

1. `mikey_jj_sentence_pipeline.py slice`：10 本全部成功，输出数量与表格一致。
2. 技能验证器（`storybook-audio-splitting/scripts/validate_audio_book.py`）：books 1、2、3、5、7、8、9、10、11 在记录 compound exemption 后均 `VALIDATION_OK`；book 6 仅因上述 `audio:null` 句保留预期缺口。
3. 锁定 ffmpeg 解码：457/457 个句子 MP3、446/446 个重点词 MP3 退出码为 0。
4. `npm.cmd test`：164/164 通过（包含词音频双索引与播放器 fallback 合同）。
5. 前端数据引用未改变到临时目录；book1、book2 以及其他 8 本仍从 `assets/mikey-jj/<slug>/sentences/` 加载句子音频，词级高亮和点读逻辑继续使用原有 `words` 数据，并优先加载 `assets/mikey-jj/vocab/index.json` 的 Edge TTS 词音频。
6. 8810 服务抽样：绘本入口、词音频清单、英文 `late.mp3` 和中文释义音频均返回 HTTP 200；Godzilla `b6-p09-s01` 的拟声 clip 按预期返回 404。
