---
name: bookplay-music-pipeline
description: 在 BookPlay书戏 项目中，把儿童 BGM、主题曲或变奏从需求访谈、ACE-Step 本机 GPU 生成、音频验收、网页试听到正式资源接入和离线打包完整落地；当用户要生成、修改、试听或接入首页、地图、绘本、小游戏音乐时使用。短音效走项目现有 SFX 路线，不把 ACE-Step 当作音效模型。
---

# BookPlay 音乐流水线

把一次音乐请求做成可试听、可复现、可接入的项目资产。先读 [references/repo-map.md](references/repo-map.md) 了解本仓库的真实路径和命令；需要写提示词或歌词时再读 [references/prompt-guide.md](references/prompt-guide.md)。

## 先判断工作类型

- **复用已确认版本**：直接使用已有文件和证据，不重新生成。当前西游主题曲的锁定版本是 `assets/generated/music-demo/journey-confirmed-original.mp3`，不能被 v2、soft、A→B 拼接版替换。
- **生成 BGM**：纯音乐，给首页、地图、小游戏或菜单使用。提示词必须写 `instrumental`/`no vocals`，纯音乐不写歌词。
- **生成主题曲**：需要人声时使用短、易唱、适合儿童的歌词；保留 `[Intro]`、`[Verse]`、`[Chorus]`、`[Outro]` 等段落标记。
- **变奏或重做**：使用新的稳定键名和 `--take` 标签，旁存新 WAV、MP3、receipt 和请求 JSON；不要覆盖用户已确认的音频。
- **短音效 SFX**：答题、攻击、护盾、奖励等使用 `scripts/build_app_audio.py` 的确定性本地合成或专用音效来源；ACE-Step 不适合短 UI 音效。

## 信息不足时的询问

已有明确偏好时直接沿用，不重复询问。否则在生成前用一条简短问题收集缺失项：

1. 用途和页面：BGM、主题曲、开场短版、变奏还是 SFX；是否需要循环。
2. 情绪和速度：例如轻柔抒情、明亮探索、勇敢冒险；大致 BPM 或快慢。
3. 配器：例如笛子、木琴、钢琴、尤克里里、琵琶、8-bit；是否避开刺耳音色。
4. 人声：纯音乐、童声、女声或合唱；语言、歌词数量和是否需要清晰咬字。
5. 时长、画面和参考：目标秒数、故事/地图场景、是否有用户确认的原曲或视频。

对儿童内容的默认值是旋律简单、音量柔和、留有呼吸、歌词少而重复、避免惊吓和强烈低频。用户说“第一次”“原版”“就用这个”等词时，把对应文件视为来源真相，先查证再编辑。

## 固定工作流

### 1. 检查项目和生成环境

在仓库根目录执行 `git status --short`，保留其他会话的改动，不执行 reset、clean 或覆盖式复制。确认以下路径存在：

- `D:/AI/ACE-Step-1.5`：ACE-Step 源码和 checkpoints。
- `D:/AI/acestep-venv/Scripts/python.exe`：项目已验证的独立 Python 环境。
- `assets/generated/music-demo/`：生成源、提示词、请求、receipt、试听候选和证据。
- `content/assets/music/`、`content/assets/sfx/`：正式运行资源。
- `prj/engine/music-demo.html`、`prj/engine/app-audio.js`：网页试听和共用播放管理器。

优先使用本机 CUDA。可用下列命令确认 GPU，不要静默退回 CPU：

```powershell
& "D:/AI/acestep-venv/Scripts/python.exe" -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else '')"
```

本机 8GB 显卡使用 `acestep-v15-turbo`、8 steps、batch 1、CPU offload。若本地环境不可用，说明具体缺失；只有用户选择远程/API 路线时才改用 API，并记录端点和鉴权情况。

### 2. 固化提示词和请求

在 `assets/generated/music-demo/prompts.json` 中新增稳定键名，保留已有条目。每个条目至少包含：`title`、`duration`、`bpm`、`key`、`language`、`prompt`、`lyrics`。提示词写清场景、年龄、情绪、主旋律、配器、动态、结束方式和人声约束；主题曲歌词保持短句和重复副歌。

生成前把最终 prompt、歌词、目标时长、BPM、调性、seed 和输出命名写入可追溯文件。已有项目提示词可作为风格基线，但不要把历史试作自动当成用户认可版本。

### 3. 用本机 ACE-Step 生成

`generate_music_local.py` 会从 `prompts.json` 读取键名，在 CUDA 上生成 WAV，并写出 receipt。对已有或新增键名运行：

```powershell
& "D:/AI/acestep-venv/Scripts/python.exe" -X utf8 "scripts/generate_music_local.py" <track-key> --take <take-label>
```

需要 1.7B 规划 LM 时显式加 `--thinking`，8GB 显存保持 CPU offload；纯音乐不要加它。等待进程真正结束，检查 `assets/generated/music-demo/<track-key>-<take-label>.wav` 和对应 `*-receipt.json`，从 receipt 读取 model、GPU、seed、参数、耗时和错误，而不是凭终端片段猜测成功。

若使用已部署的 ACE-Step HTTP API，遵循 `health → release_task → query_result` 轮询 → `/v1/audio` 下载顺序；轮询直到成功、失败或超时，保存 task id、原始结果和下载路径。API 细节见现有 `ace-step-music` 技能的 `references/api-notes.md`，不要把服务端临时路径当作项目资产。

### 4. 验收和发布试听版本

生成后先做离线检查，再做浏览器检查：

- 文件能解码，扩展名与实际格式一致；WAV 为双声道、有限采样值，时长在目标误差内，峰值不削波。
- 试听 MP3 按项目惯例使用 48 kHz、192 kbps、`loudnorm=I=-18:TP=-2:LRA=9`，并加很短的淡入淡出；不要声称它是无缝循环，除非首尾实际听过。
- 已有三首样例可运行 `python -X utf8 scripts/prepare_music_demo.py`；新曲沿用相同编码/响度规则并保存验证 JSON。不要覆盖 `journey-confirmed-original`。
- 合格试听文件放回 `assets/generated/music-demo/`，需要网页试听时同步到 `content/assets/music-demo/`，同时保留来源和 hash。

### 5. 启动服务并等待真实播放状态

使用项目服务提供 Range 音频：

```powershell
& "D:/AI/acestep-venv/Scripts/python.exe" -X utf8 "prj/tools/serve.py" --port 8810
```

打开 `http://127.0.0.1:8810/engine/music-demo.html`。浏览器自动播放受限时，先等待页面加载完成，再由用户点击播放或点击页面解锁音频；验证 `loadedmetadata`、`playing` 和 `currentTime` 在推进，不用固定 sleep 代替状态等待。试听页的三首音频应一次只播放一首，隐藏标签页应暂停。

接入页面后至少检查：首页 `home.html`、西游 `map.html`/`battle.html`、我的世界 `map.html?series=minecraft` 和实际小游戏/答题页。用 `BookPlayAudio.getState()` 检查 `scene`、`src`、`paused`、`foreground`、`ownsPlayback`；地图介绍朗读时应让出或压低 BGM，朗读结束后恢复。跨标签页只允许一个页面持有 `bookplay_audio_owner_v1`，新页面接管后旧页面必须暂停并显示“另一页播放”。

### 6. 接入正式资源和离线包

用户确认试听版本后，复制到 `content/assets/music/` 的语义化文件名，更新 `content/assets/music/manifest.json` 的 `source`、`file`、`sha256` 和必要的生成元数据。现有页面通过 `prj/engine/app-audio.js` 的 `TRACKS` 和 `<body data-audio-scene>` 选择 `home`、`jttw`、`minecraft`；新增场景才修改映射，并同步 `app-audio.css/js` 到 Android 引擎。

短音效登记在 `manifest.json` 的 `sfx` 下，并在消费者已接受的动作分支调用 `BookPlayAudio.sfx(name)`；朗读媒体要用 `watchMedia`，游戏暂停用 `suspend`/`resume`。不要让音效盖住儿童朗读，也不要在纯评分函数里偷偷播放。

正式资源必须进入离线包。先运行资源/打包测试，再按需要执行 `python -X utf8 prj/tools/pack_android.py --builtin` 或项目已有的移动端构建命令；确认 `assets/music`、`assets/sfx`、manifest 和页面脚本都在产物中。新增目录若未被 `pack_datapack.py`/`pack_android.py` 的清单覆盖，先补清单再打包。

## 完成时返回

报告以下可复核信息：音乐类型和用途、最终 prompt/歌词、模型/GPU/seed、生成源和正式文件绝对路径、试听 URL、页面场景、时长/格式/响度/hash 验证、运行的测试，以及仍需用户试听决定的候选版本。若停在前置条件或验收门，指出准确路径、命令和下一步，不把未播放或未下载的结果说成已完成。

## 必须停止的情况

遇到 CUDA/模型缺失、API 不可达、任务失败或超时、音频无法解码、时长/响度不合格、用户确认版本身份不清、浏览器没有真实 `playing`、两个页面同时播放或测试失败时暂停发布。保留中间证据并报告原因；不要猜歌词、覆盖确认原曲、把历史拼接版冒充原版，或用固定等待时间掩盖播放失败。
