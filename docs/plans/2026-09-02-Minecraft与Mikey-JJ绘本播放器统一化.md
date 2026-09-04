# Minecraft 与 Mikey & JJ 绘本播放器统一化实施计划

> **给 Claude:** 必需子技能：使用 superpowers:executing-plans 来逐任务实施此计划。

**目标：** 在不遮挡原漫画、不伪造翻译/定位/时间数据的前提下，落地统一的剧情/精学播放器、系列画布、逐词点读和全屏巩固流程。

**架构：** 继续使用 `storybook.html` 作为共享消费者，以 `storybook-ui.js` 提供纯函数和能力判断，以 `storybook-v3.css` 隔离候选视觉。Minecraft 保持完整跨页；Mikey & JJ 保持完整漫画页并用真实 bubble 坐标做透明定位器；所有默认切换必须经过 `ui=unified-v3` 预览和用户视觉验收。

**技术栈：** 原生 HTML/CSS/JavaScript、JSON、HTMLAudioElement、本地 TTS、Node `node:test`、Python pytest、ffmpeg、Capacitor。

---

## 执行入口

- 详细方案：[`../2026-09-02-Minecraft与Mikey-JJ绘本播放器统一设计方案.md`](../2026-09-02-Minecraft与Mikey-JJ绘本播放器统一设计方案.md)
- 总览与依赖：[`2026-09-02-Minecraft与Mikey-JJ绘本播放器统一化/00-总览.md`](2026-09-02-Minecraft与Mikey-JJ绘本播放器统一化/00-总览.md)
- 任务目录：[`2026-09-02-Minecraft与Mikey-JJ绘本播放器统一化/tasks/README.md`](2026-09-02-Minecraft与Mikey-JJ绘本播放器统一化/tasks/README.md)

## 任务顺序

1. 基线合同与 v3 预览开关。
2. 统一骨架与剧情/精学模式。
3. 学习栏与逐词点读竞态修复。
4. Minecraft 完整跨页、367 句中文与音频对齐数据。
5. Mikey 说话人与原气泡透明定位。
6. 全屏重点词复习、小测与结果页。
7. 手机、平板、桌面、TV 和 Android 回归。
8. 真实消费者验收；用户确认后 promotion，保留 legacy 回滚。

## 统一验收

```powershell
node --check prj/engine/storybook-ui.js
node --check prj/engine/storybook-practice.js
node --check prj/engine/storybook.js
node --test prj/engine/storybook-ui.test.mjs prj/engine/storybook-practice.test.mjs prj/engine/storybook-route.test.mjs prj/engine/tv-ui.test.mjs
python -m pytest prj/tests/test_minecraft_sentence_enrichment.py prj/tests/test_minecraft_storybook_pipeline.py prj/tests/test_mikey_jj_sentence_pipeline.py prj/tests/test_storybook_text.py prj/tests/test_storybook_learning.py -q
npm test
npm run android:prepare
```

这些命令包含计划将创建的新文件；在对应任务完成前出现“文件不存在”属于预期，不得把它误报为当前回归失败。

