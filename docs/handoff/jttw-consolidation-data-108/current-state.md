# 当前状态

- Revision 3 已生成并验收 `content/lesson_guides/ep001..ep108/`：108 个 reader、108 个 lesson、540 道官方题、216 个精读半册、5975 张卡。
- 数据测试最终为 68 项，Codex 独立运行全部通过；`validate_quiz_answers.py --all` 通过。
- 官方测试 PDF：131 页、108 集、540 题，文本层可提取，无显式答案页。
- `content/dialogue_stories/ep1..108.json` 已有 540 道官方题和中译；答案分布 A/B/C = 456/32/52，需重建证据。
- 带标注精读 PDF：216 份；1-10 已验证文本层能提取 IPA、释义、来源页和中英台词。
- 文档已加入 `docs/plans/2026-08-30-108集知识巩固数据资产.md` 与 T08/T09。
- Revision 4 已完成课件资产：108 receipt、108 嵌图 Markdown、2073 张主课件 WebP（162,697,572 字节），11 集教师 text/notes、108 集字幕元数据；lesson.json 全部保持不变。42/61/97 主课件固定 3.3 目录版本。
- 最新独立验证：74 项测试通过；2073 张 WebP 全量解码/哈希审计零错误；`data/` 与 `content/` 均被 Git 忽略。
