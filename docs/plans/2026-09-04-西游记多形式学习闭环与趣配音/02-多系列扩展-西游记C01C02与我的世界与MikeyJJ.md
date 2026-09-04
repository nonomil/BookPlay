# 趣配音多系列扩展：西游记 C01~C02 + 我的世界 + Mikey & JJ

> 需求：趣配音从"仅西游记"扩展到实际投放范围——西游记 C01~C02 阶段包（第 1-14 集），以及《我的世界》分级读物、Mikey & JJ 两套绘本（尤其 Mikey & JJ）。

## 1. 关键事实（调研结论）

| 系列 | 数据 | 场景单元 | 时间轴 | 原声 | 视频 |
|---|---|---|---|---|---|
| 西游记 (jttw) | `prj/data/dialogue_stories/ep{N}.json` | nodes（node_id/text_en/zh/illustration） | `audio_start/end` 秒 | 整集 MP3 `assets/lf_ep*`（**阶段包剔除**）+ 视频自带原声 | ✅ `assets/video/ep{N}.mp4`（包内含） |
| 我的世界 (minecraft) | `prj/data/storybooks-minecraft/book{N}.json`（5 本） | pages（image/text_en/sentences） | 页级 `start_sec/end_sec`（**book1 页级时间与句级不一致，不可信**）；句级 `sentences[].start_sec/end_sec` | **逐句 MP3** `sentences/*.mp3` + 整集 `audio.mp3` | ❌ |
| Mikey & JJ (mikey-jj) | `prj/data/storybooks-mikey-jj/book{N}.json`（10 本） | pages + sentences（**带 zh + speaker + 逐句 MP3 + 词级时间**） | 页级/句级 `start_ms/end_ms` 毫秒 | **逐句 MP3** + 整集 audio | ❌ |

- C01=西游记第 1-7 集、C02=第 8-14 集（`dialogue_stories/collections.json` 共 13 合辑）；引擎按集运行，趣配音天然覆盖包内所有集；唯一缺口是包内没有 `assets/lf_ep*` 整集 MP3 → 听原声需回退视频原声。
- 两套绘本的播放器是 `storybook.html?series=minecraft|mikey-jj&book=N&ui=unified-v3`（`storybook-route.js`），书架/地图入口在 `shelf.js`/`map.js?series=`。

## 2. 设计与实现

### dub-core（纯逻辑）

- `bookKey(series, id)`：`ep1 / mc1 / mj1`——西游记键格式与旧存档完全兼容（`dubKey("ep1","n001") === "ep1:n001"`），已配的配音不丢。
- 新增 `normalizeDubBook(series, raw)` → 统一书结构 `{key, series, title, audio, video, scenes:[{nodeId, speaker, textEn, textZh, illustration, from, to, sentenceAudios[]}]}`：
  - jttw 走原 nodes 路径；MC/MJ 走 pages 路径（毫秒归一为秒）；
  - **句级时间优先于页级时间**（修复 MC book1 页级时间漂移）；两者皆无才剔除；
  - `textZh`：MJ 由逐句 `zh` 拼接（天然中英对照提示词）；MC 无中文置空；
  - `speaker`：MJ 取首句 speaker.label（如 "JJ"）。
- `upsertDubMeta / firstSaveReward / dubCoverage` 改为按 bookKey 字符串存取（每本书独立 +5SP 幂等）。

### dub.js（工坊）

- URL 兼容旧参数：`?ep=N`（jttw）/ `?series=minecraft&book=N` / `?series=mikey-jj&book=N`。
- **听原声回退链**：句级 MP3 顺序播（MC/MJ，最准）→ 整集音频切片（jttw 开发环境）→ 视频原声切片（jttw 阶段包，视频即原声）→ TTS（最后回退）。
- 放映厅：MC/MJ 无视频 → 插图幻灯片模式；未配音页放原声（句音频→切片），已配音页放童声；结尾逻辑不变。
- 返回链接按系列：jttw → `wala.html?ep=N`，绘本 → `storybook.html?series=…&book=…&ui=unified-v3`；默认书架 `map.html?series=…`。
- 画面伴录仅在有视频时出现（jttw）；MC/MJ 是插图配音（"对着图配"）。

### 入口

- `storybook.html/js`：顶栏"目录"旁新增 `🎙 配音` 按钮（`btn-dub`），按 series/id 生成深链；jttw 旧阅读器同样可用。

## 3. 边界与说明

- 西游记 C01~C02 无需改打包脚本：dub 页面/逻辑在 engine 目录自动随包；包内听原声走视频原声回退。
- MC/MJ 的"视频配自己的声音"降级为"插图+童声"（无视频素材）；如未来要视频级体验，需另配视频资源或做动画幻灯片（P3）。
- 每本书奖励独立（mj1 配完 +5SP，mj2 再 +5SP）。
