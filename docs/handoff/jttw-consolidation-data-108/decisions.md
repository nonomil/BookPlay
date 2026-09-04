# 已锁定决定

1. 每集只在 `episode_complete` 后进入一次知识巩固。
2. 题库完整保存；年级与强度只筛选本轮展示。
3. 年级段为 `g1_2/g3_4/g5_6`，基准题量 4/7/10；强度为 `light/standard/challenge`。
4. 官方题共 540 道，题面与选项保持源 PDF 原文；旧答案不作为真值。
5. 客观题进入运行卡池前必须有 `answer_evidence`；无证据标记 `needs_review`。
6. 精读 PDF 有文本层，直接解析，不 OCR。
7. 生成数据位于被 Git 忽略的 `content/lesson_guides/`；Git 只跟踪代码、测试和文档。
8. Revision 3 的 EP1–108 quiz/reader/lesson 已通过 Codex 验收；revision 4 只补课件资产和 Markdown，不实现 UI。
9. 42、61、97 集主课件固定使用 `3.3西游记  Journey to the West PPT课件` 目录版本及任务卡登记的 SHA256，不按目录顺序或文件大小改选。
10. 现有 `lesson.json` 是已验收卡池，课件资产提取不得覆盖或改写；字幕 PPT 只建元数据清单，不导出冗余帧。
