# BookPlay 音乐项目地图

路径均相对于 `G:\Game\BookPlay书戏`；在 PowerShell 中对含中文的路径使用引号，读取或写入已有文件时优先使用 `-LiteralPath`。

## 资产分层

| 位置 | 用途 | 约定 |
| --- | --- | --- |
| `assets/generated/music-demo/` | ACE-Step 源 WAV、试听候选、`prompts.json`、request、events、receipt、证据 | 可保留多个 take；不能把历史候选当成确认版本 |
| `content/assets/music-demo/` | `/assets/music-demo/` 的网页试听副本 | 运行 `music-demo.html` 前同步合格的试听 MP3 |
| `content/assets/music/` | 正式运行 BGM/主题曲 | 文件名语义化；由 `manifest.json` 登记来源和 SHA-256 |
| `content/assets/sfx/` | 正式短音效 WAV | 由 `manifest.json` 的 `sfx` 登记；不使用 ACE-Step 代替 |
| `prj/engine/music-demo.html` | 三首样例的试听页 | 页面自己的 `<audio>` 互斥；首次播放需要用户手势 |
| `prj/engine/app-audio.js` | 首页、地图、战斗、答题共用播放管理器 | 负责场景音乐、朗读避让、SFX、跨标签页唯一占用 |
| `content/assets/music/manifest.json` | 正式音乐和 SFX 索引 | `music.*.file`、`source`、`sha256` 必须互相对应 |

## 当前已确认音乐

| 场景 | 正式文件 | 生成源/试听源 | 备注 |
| --- | --- | --- | --- |
| 首页 | `content/assets/music/home.mp3` | `assets/generated/music-demo/home-ace.mp3` | 温暖轻快、30 秒 |
| 西游记地图和小游戏 | `content/assets/music/jttw.mp3` | `assets/generated/music-demo/journey-confirmed-original.mp3` | 55 秒；宣传录屏核对原版 |
| 我的世界地图和小游戏 | `content/assets/music/minecraft.mp3` | `assets/generated/music-demo/blocks-ace.mp3` | 方块探索配乐、35 秒 |

`journey-ace-v2.mp3`、`journey-soft-ace-v3.mp3`、`journey-a-then-b*.mp3` 是历史试作或剪辑候选。用户已确认原版后，不能自动切换到这些文件。

## 生成脚本

- `scripts/generate_music_local.py`：读取 `assets/generated/music-demo/prompts.json`，在本机 CUDA 上调用 `D:/AI/ACE-Step-1.5`，输出 WAV 和 receipt。新增键名即可生成新 take：

  ```powershell
  & "D:/AI/acestep-venv/Scripts/python.exe" -X utf8 "scripts/generate_music_local.py" <track-key> --take <take-label>
  ```

  `--thinking` 才加载 1.7B 音乐规划 LM；8GB 显卡保持 batch 1 和 CPU offload。脚本会拒绝 CUDA 不可用的环境。

- `scripts/prepare_music_demo.py`：把当前选中的 WAV 统一响度并编码为 48 kHz、192 kbps MP3，复制到 `content/assets/music-demo/`。脚本中的 `SELECTED` 只覆盖当前三首样例；新曲应沿用同样的 FFmpeg 滤镜并单独记录验证结果。
- `scripts/build_app_audio.py`：复制批准的三首音乐到 `content/assets/music/`，生成确定性本地合成的 `content/assets/sfx/*.wav` 和 manifest。修改前确认不会覆盖用户刚选的候选。
- `scripts/assemble_journey_theme.py`：仅用于明确授权的 A→B 剪辑；它不是新的 ACE-Step 生成，不能替代已确认的原版。
- `scripts/generate_music_demo.py`：旧的官方 Hugging Face Space 队列路线；只有用户明确接受远程服务时才使用，保留 request 和 events。

## 本机 ACE-Step

- 源码：`D:/AI/ACE-Step-1.5`
- Python：`D:/AI/acestep-venv/Scripts/python.exe`
- checkpoints：`D:/AI/ACE-Step-1.5/checkpoints`
- 已验证硬件：RTX 5060 Laptop 8GB
- 预设：`acestep-v15-turbo`、8 steps、seed 记录在 receipt、CUDA、CPU offload、离线权重

本地直连不需要先启动 HTTP 服务。若采用 API，先 `GET /health`，再 `POST /release_task`，随后 `POST /query_result` 轮询，成功后通过 `/v1/audio?path=...` 下载；服务端临时文件必须及时复制到项目资产。

## 网页和服务

静态服务是 `prj/tools/serve.py`，它把 `/engine/` 映射到 `prj/engine/`，把 `/assets/` 映射到 `content/assets/`，并支持音频 Range：

```powershell
& "D:/AI/acestep-venv/Scripts/python.exe" -X utf8 "prj/tools/serve.py" --port 8810
```

试听地址：`http://127.0.0.1:8810/engine/music-demo.html`。正式页面的关键入口：

- `http://127.0.0.1:8810/engine/home.html`
- `http://127.0.0.1:8810/engine/map.html`（西游记）
- `http://127.0.0.1:8810/engine/map.html?series=minecraft`
- `http://127.0.0.1:8810/engine/battle.html`、`game.html`、`lesson.html`、`storybook.html`

`home.html` 使用 `data-audio-scene="home"`；`map.html` 使用 `data-audio-scene="series"`，由 `series` 查询参数选择 `jttw` 或 `minecraft`。新场景要同时修改 `TRACKS`、页面属性、资源 manifest 和 Android 打包清单。

## 播放和离线打包验收

`app-audio.js` 的 `BookPlayAudio.getState()` 可观察 `scene`、`src`、`paused`、`foreground` 和 `ownsPlayback`。朗读媒体先 `watchMedia`，介绍期间 BGM 降音或静音；跨标签页通过 `bookplay_audio_owner_v1` 保证只有一个页面播放。

资源测试：

```powershell
python -m pytest -q prj/tools/test_app_audio_assets.py
```

涉及 Android 或新资源目录时，另运行相应的 `npm test` 和打包测试；正式资源入口由 `prj/tools/pack_datapack.py`、`prj/tools/pack_android.py` 的 `assets/music`、`assets/sfx` 清单携带。
