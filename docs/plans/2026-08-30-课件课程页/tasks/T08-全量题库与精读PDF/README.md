# T08 全量题库与精读 PDF

**状态（2026-08-31）：已完成并独立验证。** 108 集、540 题、216 半册全部结构化；`validate_quiz_answers.py --all` 与完整测试通过。187 道题有机器证据，353 道题按门禁保留为 `needs_review`，没有猜测答案。

**目标：** 将 540 道官方题和 216 份带标注精读 PDF 全量结构化，生成可追溯、可分级的 108 集卡池。

**输入：**

- `data/测试题/08 英文测试题108集全.Journey to the West-quiz.pdf`
- `data/02-西游记精读版台词本/1、带标注版PDF 108集/*.pdf`
- `content/dialogue_stories/ep1.json` 至 `ep108.json`

**输出：**

- `content/lesson_guides/official-quiz-bank.json`
- `content/lesson_guides/epNNN/intensive-reader.json`
- `content/lesson_guides/reports/quiz-answer-review.json`

**硬门禁：**

1. 108 集每集正好 5 道官方题，合计 540 道；题面与选项不得改写。
2. 带标注 PDF 每集上/下成对，合计 216 份；词条必须保留 IPA、释义和来源页。
3. 旧答案不能作为真值；每个可运行答案必须关联本集台词证据。
4. `needs_review` 数据保留，但不得进入默认可判分卡池。
5. 不修改任何原始 PDF、PPTX、视频或图片。
