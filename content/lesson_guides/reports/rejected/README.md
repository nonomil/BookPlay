# 被拒答案批次

这些文件只保留作审计，不得用于更新题库。

- `large-batch-pass-1/`：一次审核 114–125 道，出现默认全部选择 A 的系统性偏差；EP50 Q1 的说话人上下文未读完整。
- `large-batch-pass-2/`：交叉复核仍以 114–125 道为批次；EP72 Q1 忽略题干的地点限定，错误选择 C。
- 正式结果只允许使用上级目录中的 `assistant-final-epNNN-NNN.json` 12 个小批次文件，并通过 `apply_quiz_assistant_answers.py` 的 353/353 原子校验。
