# BookPlay 书戏 · 西游记有声绘本

个人使用。`data/` 里的 PDF + MP3 直接做成 108 集翻页绘本。

> 当前仓库结构与优化路线见根目录 `README.md` 和 `docs/项目架构与优化路线.md`。本文保留产品功能说明，命令统一从仓库根目录执行。

## 一分钟打开

```
双击根目录 启动服务.bat
```

浏览器会打开 `engine/home.html`，三个入口：

- **绘本书架**：108 集翻页有声绘本（原版书页+整集朗读+点词生词本+章末题）
- **对话冒险**：107 集"剧照+叙述+词卡"闯关（第2-108集，详见下文）
- **对话模式（石猴）**：手工精修的第1集分支 demo

## 对话冒险模式（adventure.html）

流水线把 PDF 旁白自动转成可玩的对话冒险（已全量生成 2-108 集）：

```
PDF 旁白 ──2句/页拆分──> 叙述节点（配视频剧照，整集MP3按页切片跟读）
        └─按词库抽词──> 词卡（节奏预计算：第1次出现=学习 → 第2次=测试选含义 → 第3次+=复习选单词）
                        测试/复习的干扰项自动取自本集词池；词/选项全部可点击发音
章末测验：storybook 流水线的每集自动出题；进度自动存档
```

```
python prj/tools/pipeline_dialogue_story.py --episode 2 --frames   # 单集（含抽帧）
python prj/tools/pipeline_dialogue_story.py --all --frames         # 全量 2-108
```

词库在 `prj/tools/storybook_learning.py` 的 WORD_ZH（扩充后重跑流水线即生效）；
学习统计在 localStorage `bookplay_adv_vocab_stat`（后续可做生词复习循环）。

### 双模式朗读（EN / EN+中）

阅读器顶栏全局切换（localStorage 记忆），旁白与词卡通用：

- **EN**：只读英文。单词发音**优先原音截取**——从每集整集 MP3 按"词在页文本中的
  字符位置占比"估算时间点裁 2.4s 片段（响度归一），无片段回退浏览器 TTS
- **EN+中**：英文读完后接中文。中文一律 **edge-tts 女声（晓晓）** 预合成（按释义文本
  全局去重），无片段回退浏览器中文 TTS
- 旁白英文走整集 MP3 的页切片原声；中文对照需正文翻译（GLM 接入后可补）

```
python prj/tools/make_word_audio.py            # 全量：单词原音 + 中文释义合成
python prj/tools/make_word_audio.py --episode 2
python prj/tools/make_word_audio.py --zh-only
```

产物：`content/assets/adv_audio/ep{N}/*.mp3`（+index.json 清单）、`content/assets/adv_audio/zh/*.mp3`（+zh_index.json）。

## 重新生成全部 108 集

从仓库根目录执行：

```
python prj/tools/pipeline_lf_episode.py --all
python prj/tools/validate_storybooks.py
```

单集：`python prj/tools/pipeline_lf_episode.py --episode 1`

## 测试

```
python -m pytest prj/tests -q
```

## 对话模式的自绘美术（gpt-image-2）

绘本用原版书页；对话分支 demo（标题页进入）用自绘资产，已替换为 AI 生成图：

- `content/assets/gen/characters/*.png` 两角色×3表情（透明底，绿幕生成后去背+边缘去绿）
- `content/assets/gen/backgrounds/background_sc01.png` 花果山背景

重新生成/扩展（绘本奖励/测验视觉资产）：

```
python -X utf8 prj/tools/generate_storybook_visual_assets.py --series minecraft --episode 1 --provider cliprox
python -X utf8 prj/tools/generate_storybook_visual_assets.py --series mikey-jj --episode 1 --provider cliprox
python -X utf8 prj/tools/prepare_storybook_visual_assets.py --series minecraft --episode 1  # 无密钥时的明确 fallback
python prj/tools/make_placeholder_art.py                     # SVG 占位（备用）
python prj/tools/validate_data.py                            # 校验资产路径与剧情数据
```

正式绘本生图只使用 `gpt-image-workflow/scripts/bee_image_workflow.py`，Cliprox 通过固定 CA 直连并读取当前进程的 `CLIPROX_API_KEY`；不读取 Markdown/auth 文件、不使用本机 10808 代理。缺少密钥时正式入口会在写文件前停止，播放器继续使用 manifest 标记的 fallback；正式资产已存在时需显式加 `--force` 才会重生成。
注意：LF 素材仅限本机个人使用；若将来要公开分发，绘本模式整体切换回自绘/公版路线。


## 对话模式剧照工作流（LF 视频截图）

```
视频(1280x720, 底部104px硬字幕)
  → ffmpeg 抽帧 crop 掉字幕带 (crop=1280:616)
  → 目检挑选 → 语义命名 (content/assets/lf_ep1/frames/*.jpg|png)
  → 对话节点 illustration 字段指向帧文件
  → 引擎按节点切换剧照（scene.show_portraits=false 时隐藏立绘）
```

- 帧来源：第1集(ep1)覆盖出世→跳瀑；洞内/石碣/拜王取自第2集(ep2)
- 通关小测：`story_outline.json` 章节 `quiz` 数组（q/choices/answer）
- 重新抽帧：调整 `prj/tools/` 下 ffmpeg 命令的时间点即可（见本节命令模板）

## 瓦拉风格冒险地图（wala.html，推荐入口）

参考瓦拉英语（AI 情境课程）的交互形态重组的旗舰界面，三大屏：

1. **冒险地图**：108 集封面节点 zigzag 路径，✓ 完成徽章 + 当前关"继续▶"，顶栏 SP 积分
2. **场景播放器**：剧照 + 字幕气泡（说话人头像/🔊/双语）+ 自动播放中/手动 + 词卡三模式（学习→测试→复习）+ 句子排序题（点词块组句）+ 章末测验；答对 +10 SP
3. **知识回顾**：单词表 / 句型卡 / 错题重做 三栏（错题来自 localStorage 统计）

### 资产工作流（图片 / 文字 / 语音 / 题目）

| 资产 | 来源 | 产物 | 用途 |
|---|---|---|---|
| 图片 | 视频标题卡(108) + 剧情抽帧(4/集) + 官方封面 | `content/assets/covers/` `content/assets/adv_frames/` | 地图节点、场景大图 |
| 文字 | PDF 旁白 → 拆句/词库抽词 | `content/dialogue_stories/ep*.json` | 字幕、词卡、排序题、句型卡 |
| 语音 | 整集MP3页切片 + 词原音截取 + edge-tts中文 | `content/assets/adv_audio/` | 旁白原声、单词原音、中文女声 |
| 题目 | 词卡节奏预计算 + 自动出题 + 对错统计 | JSON 内 vocab/puzzle/quiz/错题 | 场景内嵌题、章末测、错题本、SP |

```
python prj/tools/pipeline_dialogue_story.py --all --frames   # 文字+题目+图片帧
python prj/tools/make_word_audio.py                          # 语音（原音截取+中文合成）
```
