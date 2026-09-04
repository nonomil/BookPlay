# Minecraft 与 Mikey & JJ 绘本播放器统一化：阶段验收

日期：2026-09-02  
阶段：V3 候选、数据工具链和端侧回归（默认仍为 legacy）

## 已交付

- 统一绘本语义 DOM、剧情/精学模式、整句中文开关、单列重点词卡、全屏复习/小测/错题结果。
- Mikey & JJ 使用真实 speaker 与 bubble 坐标的透明定位器；V3 不复制漫画气泡文字。
- 逐词点读竞态保护：导航代次与词播放代次独立，快速点击不会串播旧中文。
- Minecraft sidecar 标注流水线：`scaffold / validate / apply`；稳定 ID 为 `mc-b<book>-p<page>-s<sentence>`。
- 执行批次 2 已补充 OCR 清理、翻译审核队列和本机 faster-whisper 词级对齐；详见 [执行批次 2](2026-09-02-Minecraft与Mikey-JJ绘本播放器统一化-执行批次2.md)。
- 只读音频验证器：书籍/标注 ID、文本和音频路径、clip 存在性、词级边界与可选 ffmpeg 解码。
- 五本 Minecraft sidecar 已覆盖 367 条句子（305 条有音频、62 条无音频）；当前可信词级时间已写入 204 条有声句，其余 101 条保留待复核。
- Android web assets 已通过 `npm run android:prepare` 与 `npm run android:sync` 更新。

## 自动化证据

```text
npm test
159 passed

python -m pytest prj/tests/test_minecraft_storybook_pipeline.py \
  prj/tests/test_storybook_text.py prj/tests/test_storybook_learning.py \
  prj/tests/test_minecraft_sentence_enrichment.py \
  prj/tests/test_validate_audio_book.py -q
27 passed

python -m pytest prj/tools/test_android_serve.py \
  prj/tools/test_android_variants.py \
  prj/tests/test_minecraft_collections.py -q
8 passed
```

锁定 imageio-ffmpeg 已逐片 decode：book1 76/76、book2 85/85、book4 71/71、book5 73/73；book3 为文本书，无 clip。

## 真实 8810 页面证据

- Minecraft V3：`storybook.html?series=minecraft&book=1&ui=unified-v3`，DOM 有句级字幕、逐词按钮和定位器空 DOM；console error/warning 为 0。
- Mikey V3：`storybook.html?series=mikey-jj&book=6&ui=unified-v3`，缺音频句 `b6-p09-s01` 显示文本/中文/画面音效，原音按钮禁用，不复用上一句 clip；点击重点词时定位器短暂出现，结束后隐藏。
- 390×844、768×1024、1115×864、1440×900、1920×1080 的 `scrollWidth` 均等于 `clientWidth`，没有横向溢出。

## 尚未达到 promotion 的门槛

Minecraft 当前仍有：

- 367/367 句缺少经过复核的整句中文；
- 101/305 个有音频句缺少可信词级时间（204 条已通过本机 ASR 与 clip 边界验证）；
- 不能用自动猜测或比例估算冒充翻译/精确同步，因此 `apply --require-zh --require-words-when-audio` 会 fail-closed。

Mikey & JJ 的 97 条 glossary 占位释义已完成清洗；后续仍需对新增书目执行同一审计工具。

因此 V3 继续通过 `ui=unified-v3` 访问，默认入口和 `ui=legacy` 回滚均不变。只有完成内容补全并获得用户对 1115×864 视觉方向的明确确认后，才执行任务 08 的 promotion。
