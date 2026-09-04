# Minecraft 与 Mikey & JJ 绘本播放器统一化：执行批次 2

日期：2026-09-02  
范围：内容质量、真实词级对齐、回归修复（V3 仍为候选入口）

## 本批次已交付

### 1. Minecraft OCR 清理

新增 [clean_minecraft_text.py](../../prj/tools/clean_minecraft_text.py)，只允许替换已对照页面审核的固定伪字符，不做模糊猜测。已同步修复书籍与 sidecar 中的 `RA`、`7277`、`JQ`、`bottom I`、`j journey`、`H` 等 13 个文本位置；句子数量和稳定 ID 不变。

### 2. Minecraft 翻译审核队列

新增 [minecraft_translation_review.py](../../prj/tools/minecraft_translation_review.py)，支持 `export / validate / import`：

- 英文、ID、音频和词表为不可变字段；
- 翻译必须逐句填写，状态必须为 `reviewed`/`approved`；
- `TODO`、`待翻译`、`重点词`、HTML 和空译文会 fail-closed；
- 已生成 5 本书的审核文件：`docs/generated/minecraft/translation-review/book1.json` 至 `book5.json`。

批次 3 已完成 5 本书逐句中文译文：`367/367` 句通过 `export → validate → import`，并在每条记录写入审阅范围说明。第 3 本（无原音）已严格 `apply`；第 1、2、4、5 本使用显式 `--allow-audio-without-words` 合入译文和已有可信词边界，缺口仍保留为空，不伪造时间。

### 3. Minecraft 真实词级对齐

新增 [minecraft_word_alignment.py](../../prj/tools/minecraft_word_alignment.py)：

- 每本有声书先用本机缓存 `faster-whisper base.en` 做一次整本 ASR；
- 只有 authored token 与 ASR token 完整匹配、边界单调且位于真实 clip 内时才写 `words[]`；
- 连字符词只在 ASR 连续 token 拼接后与原词完全一致时合并；
- 句尾噪声、ASR 插入、删除、低置信专名和 clip 截断均保留待复核，不使用比例估算。

已写入的可信词级时间：

| 书 | 句数 | 有声句 | 已对齐 | 待复核 |
|---|---:|---:|---:|---:|
| 1 | 76 | 76 | 72 | 4 |
| 2 | 85 | 85 | 62 | 23 |
| 3 | 61 | 0 | 0 | 61（无原音） |
| 4 | 72 | 71 | 55 | 16 |
| 5 | 73 | 73 | 63 | 10 |
| 合计 | 367 | 305 | 252 | 53 |

第 2 本书原先有大量 clip 在句尾提前结束；本批次已从母音频重切 46 个，剩余 23 个因 ASR 删除/串句仍不能安全自动修复，继续保留待复核。

### 3.1 批次 3：中文内容已合入

新增 [seed_minecraft_translation_batch.py](../../prj/tools/seed_minecraft_translation_batch.py)，保存可审查的逐句中文批次（Book 1–5），并在写入前校验记录数量、ID 顺序和占位词。当前 sidecar 与书籍数据覆盖如下：

| 书 | 句数 | 中文 | 有声句 | 有词级时间 | 缺词级时间 |
|---|---:|---:|---:|---:|---:|
| 1 | 76 | 76 | 76 | 72 | 4 |
| 2 | 85 | 85 | 85 | 62 | 23 |
| 3 | 61 | 61 | 0 | 0 | 0（无原音） |
| 4 | 72 | 72 | 71 | 55 | 16 |
| 5 | 73 | 73 | 73 | 63 | 10 |
| 合计 | 367 | 367 | 305 | 252 | 53 |

本批次的验证命令：

```powershell
python -X utf8 prj/tools/minecraft_translation_review.py validate --book N --queue docs/generated/minecraft/translation-review/bookN.json
python -X utf8 prj/tools/minecraft_sentence_pipeline.py validate --book N --require-zh
python -X utf8 scripts/validate_audio_book.py --book-json prj/data/storybooks-minecraft/bookN.json --annotations prj/data/storybooks-minecraft/sentence-annotations-bookN.json --require-zh
```

五本书均已通过上述非强制词级验证；开启 `--require-words-when-audio` 仍会只报告 53 个明确缺口，作为下一批音频重切/复核清单。

### 3.2 播放器消费真实词级边界

此前播放器在 Minecraft 句子播放时始终按整句时长平均推进高亮，已改为通过 `BookPlayStorybookUI.wordHighlightIndex`：当 `words[]` 完整覆盖当前句时使用真实 `start_ms/end_ms`；缺少或不完整时才回退到比例高亮。新增单元测试覆盖真实边界、播放结束和不完整 timing 三种情况，避免把估算误报为精确同步。

### 3.3 Book 2 句子 clip 修复

新增 [repair_minecraft_clips.py](../../prj/tools/repair_minecraft_clips.py)，按音频切分合同从不可变母音频重新截取带前后缓冲的 `sentences-repaired/`，不覆盖原 clip。Book 2 本批次成功修复 46 个句子（词级覆盖 `16/85 → 62/85`），新文件位于运行时使用的 `prj/assets/minecraft/mobs-in-the-overworld/sentences-repaired/`，并已通过 85/85 ffmpeg 解码检查；剩余 23 句因 ASR 删除/串句保留待复核。

### 4. Mikey & JJ glossary 清理

新增 [mikey_glossary_quality.py](../../prj/tools/mikey_glossary_quality.py)。受影响的 7 本书共 97 条 `重点词`/`ˈwɜːd` 占位已替换为真实 IPA、词性和中文释义；未知占位会被报告而不会猜测。现在数据目录中不再存在这些占位值（目录说明中的“重点词”文字为产品描述，不是 glossary 数据）。

### 5. 回归修复

Wala 播放器完成态箭头本来是 `<button>`，却写入无效 `href`，导致 UI 合同测试失败。已改为只设置可访问标签，由既有 `next()` 路由统一进入知识巩固。`npm test` 现为 **160/160 通过**（本批次新增真实词边界测试）。

## 验证命令与结果

```powershell
npm test
# 160 passed

python -X utf8 -m pytest `
  prj/tests/test_minecraft_sentence_enrichment.py `
  prj/tests/test_validate_audio_book.py `
  prj/tests/test_minecraft_storybook_pipeline.py `
  prj/tests/test_mikey_glossary_quality.py `
  prj/tests/test_minecraft_word_alignment.py `
  prj/tests/test_minecraft_translation_review.py `
  prj/tests/test_clean_minecraft_text.py -q
# 28 passed
```

## 仍然阻塞的正式 promotion 条件

1. 367 句中文已完成 Codex 逐句审核并导入；如需上线前母语审校，可在现有 review queue 上继续复核，不会覆盖英文或时间字段；
2. 53 个句子需要重切 clip 或逐句复核，不能用估算时间填充；
3. 完成内容后再跑严格 `validate_audio_book.py --require-zh --require-words-when-audio --ffmpeg`；
4. 用户确认 1115×864 等桌面尺寸的 V3 视觉方向后，才把 `ui=unified-v3` 提升为默认，legacy 继续保留回滚。
