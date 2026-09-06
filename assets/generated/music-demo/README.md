# 豆豆龙音乐样例 · 2026-09-06

> 当前主版本：`journey-confirmed-original.mp3`（55 秒）。根据用户提供的 `docs/宣传/GPT-6 + ACE-Step配乐.mp4` 做连续波形匹配，确认录屏中播放的是 `journey-ace.wav`。录屏从原曲约 5.982 秒开始，前约 38 秒为该曲，随后切换到 `blocks-ace.wav`。确认版本为原始文件直接复制，未拼接或重新生成。此前各试作、组合均为历史备份，不能代替此版本。证据：`confirmed-original-evidence.json` 和 `reference-video/waveform-matching.json`。


已在本机 RTX 5060 Laptop 8GB 上完成 ACE-Step 1.5 音乐生成。试听页为 `/engine/music-demo.html`，由项目现有 Range 服务提供，默认 `http://127.0.0.1:8810/engine/music-demo.html`。

## 选用音频

| 文件 | 时长 | 用途 | 实际生成方式 |
|---|---:|---|---|
| `home-ace.mp3` | 30 秒 | 首页、选书配乐 | Turbo，DiT only |
| `home-opening-10s.mp3` | 10 秒 | 进入首页的开场短版 | 从首页配乐剪辑，含淡出 |
| `journey-ace.mp3` | 55 秒 | 首次生成原始录音 A，用户目标版本仍待辨认 | Turbo，DiT only |
| `journey-soft-ace-v3.mp3` | 45 秒 | 少词轻柔试作《云朵陪你慢慢走》 | Turbo，DiT only，84 BPM |
| `blocks-ace.mp3` | 35 秒 | 方块世界探索配乐 | Turbo，DiT only |

上述文件为真实 ACE-Step 输出。早期 `*-sketch.wav` 是独立的程序合成旋律草稿，不是模型输出，也未在最终试听页采用。用户反馈第一版更抒情，第二版文字太多、不适合小朋友。此前曾将 `journey-ace.wav` 认定为用户喜欢的第一版，但用户随后否认，因此该认定撤回；第二版文件留存但从主试听中移出。第三版是独立新试作，不覆盖第一版，歌词从 114 个汉字减少到 35 个汉字（六句），目标速度从 108 降至 84 BPM。用户偏好以旋律舒展和儿童易跟唱为准，不能用自动转写的完整度代替好听程度。

`prompts.json` 保存为本项目撰写的提示词与歌词，没有输入参考歌曲音频。当前是音乐样例，未修改正式首页播放行为。

## 本地环境

- 官方源码：`D:/AI/ACE-Step-1.5`，提交 `ca1e85fe9430179831e6bc6be790c332190a3866`。
- 独立 Python：`D:/AI/acestep-venv/Scripts/python.exe`。
- 模型：`D:/AI/ACE-Step-1.5/checkpoints`，从 ACE-Step 官方 ModelScope 仓库下载；含 Turbo、VAE、Qwen3 Embedding 0.6B、音乐 LM 1.7B。
- GPU 运行库从现有 `D:/PythonEnvs/tts-voxcpm` 复制到新环境，未修改原环境：PyTorch `2.12.0.dev20260408+cu128`。该版本不是官方 pyproject 的 Windows 固定版本，但已经实际通过本机推理。
- 其余依赖在新环境独立安装。完整包清单：`D:/AI/acestep-installed-packages.txt`。
- `local-install-receipt.json` 保存路径、源码提交和权重 SHA-256。
- 推理设定：CUDA、BF16、batch 1、8 steps、seed 20260906、CPU offload、无编译、无量化；脚本开启离线模式。第二版人声的 LM 同样分阶段加载到 GPU。

## 再生成

在项目根目录的 PowerShell 中运行：

```powershell
& D:/AI/acestep-venv/Scripts/python.exe -X utf8 scripts/generate_music_local.py home blocks
& D:/AI/acestep-venv/Scripts/python.exe -X utf8 scripts/generate_music_local.py journey
& D:/AI/acestep-venv/Scripts/python.exe -X utf8 scripts/generate_music_local.py journey-soft --take ace-v3
python -X utf8 scripts/prepare_music_demo.py
```

最后一步使用系统 Python 中已有的 NumPy、SoundFile、imageio-ffmpeg，把选中结果转为 MP3，并复制到真实运行时资源目录 `content/assets/music-demo/`。项目的 `/assets/` 实际映射到该 `content/assets/`，不是仓库根目录 `assets/`。

## 验证与限制

- 三首源 WAV 均为 48 kHz、双声道，时长分别 30、55、35 秒；样本值有限，源峰值约 -1 dBFS。
- 试听 MP3 为 192 kbps，使用 FFmpeg loudnorm（目标 -18 LUFS、-2 dBTP），首尾加短淡入淡出；这不是无缝循环素材。
- 第一轮：首页生成约 17 秒，方块配乐约 7 秒；第二版人声约 44 秒，均不含安装与初始化。第二版实测 PyTorch 峰值分配约 4.93 GiB，不等于整机所有进程的显存总占用。
- `*-receipt.json` 保存生成成功状态、参数和显存数据；`selected-audio-validation.json` 保存最终音频验证。
- 本地 Whisper small 自动转写第二版识别出两段主歌及两遍副歌；个别同音字识别不准，不能当作逐字发音的人工验收。`journey-v2-transcript.json` 仅作辅助证据。
- 首页/地图建议在孩子首次点击后低音量播放，提供开关；进入英语朗读、测验或跟读时淡出停播，避免掩盖学习内容。

## 官方资料

- https://github.com/ace-step/ACE-Step-1.5
- https://github.com/ace-step/ACE-Step-1.5/blob/main/docs/en/INFERENCE.md
- https://github.com/ace-step/ACE-Step-1.5/blob/main/docs/en/API.md
- https://modelscope.cn/models/ACE-Step/Ace-Step1.5

最初尝试的官方 Hugging Face 免费演示任务被 ZeroGPU 中止，随后配额耗尽；此限制与最终本地生成无关。

第三版的自动转写以哼唱为主，仅识别出结尾部分短句；页面将六句词稿标为未逐句演唱。它是独立的轻柔哼唱候选，不因识词量少而替换或否定用户喜欢的第一版。

## 版本辨认修正

用户进一步说明目标是“开头童声唱一句向前走”，且否认当前认定的第一版。不能再把生成顺序等同于用户指的版本。已核对三份人声 WAV 与 raw 备份 SHA-256 完全一致，未发生覆盖。首次和第二次原始录音在约 18 秒处都识别到“向前走”；分别截取 18–32 秒为 original-a-forward-excerpt.mp3 和 original-b-forward-excerpt.mp3 供用户按音色辨认。这两份仅截取、编码，未生成或变调变速。尚未确认哪一份匹配用户记忆。

## 用户确认后的 A → B 组合版

用户确认上述 A、B 两段并要求先 A 再过渡到 B。已生成 journey-a-then-b.mp3 / .wav，29.15 秒；从 A 原始录音取 18–37.8 秒完整乐句，再接 B 的 18.6–28.6 秒，以 0.65 秒交叉淡化在成品第 19.15 秒开始衔接。保留原音色与速度，统一响度，未重新生成人声。页面将此版设为主试听。剪辑范围、源文件 SHA-256 与音频检查在 journey-a-then-b-edit.json。重做命令：python -X utf8 scripts/assemble_journey_theme.py。

## 完整收尾版

用户反馈 29 秒组合缺少尾声，已另存 journey-a-then-b-complete.mp3 / .wav，43.7 秒。在 A→B 后追加 B 原录音 39.8–55 秒的最后副歌及自然器乐收尾，交叉淡化 0.65 秒，尾端轻淡出 1.5 秒；沿用原声，不增加新的长篇歌词。29 秒版保留。重做：python -X utf8 scripts/assemble_journey_theme.py --with-outro。
