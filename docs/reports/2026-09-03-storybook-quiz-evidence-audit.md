# 绘本题目—知识点证据审计（2026-09-03）

## 结论

题目数据现在已通过严格证据合同审计：每道发布题都有稳定 ID、题型和真实源句/场景；词汇题还有显式 `term`。播放器可以据此把错题回放到对应学习证据，不再需要从题干猜词。

## 命令与结果

```powershell
python prj/tools/validate_storybook_quiz_evidence.py `
  --root prj/data/storybooks-mikey-jj prj/data/storybooks-minecraft `
  --report docs/reports/2026-09-03-storybook-quiz-evidence-audit.json
```

当前结果：

| 指标 | 数值 |
|---|---:|
| 内容包 | 15 本 |
| 题目 | 72 道 |
| 已通过证据合同 | 72 道（全部 15 本内容包） |
| 待迁移题目 | 0 道 |
| 当前结构问题 | 0 个 |

本轮已补齐 Mikey & JJ Book 8–11 的 20 道模板题，全部改为基于真实剧情句的 comprehension/meaning-choice 题；不再保留“关键挑战/好读者应该怎么做”等无法回放的泛化题。

机器报告见同目录的 `2026-09-03-storybook-quiz-evidence-audit.json`。在报告未归零前，不能把全部书籍标记为“题目与学习点已对齐”。

## 已迁移样本

### Minecraft Book 1

- `river` → `mc-b1-p11-s06`
- `leaped` → `mc-b1-p05-s01`
- `escaped` → `mc-b1-p10-s04`
- `hair` → `mc-b1-p12-s02`
- `light` → `mc-b1-p04-s02`

其中 `river/light/escaped/hair` 原来只在页面级 glossary，现已补入实际句子 glossary，学习卡可以显示对应词。

### Mikey & JJ Book 1

- `detention` → `b1-p01-s03`
- 直升机逃脱 → `b1-p02-s04`
- 科学老师留下 TNT 和药水 → `b1-p04-s03`
- 脚印通向左门 → `b1-p06-s03`
- healing magic 伤害僵尸 → `b1-p04-s07`

词汇题使用 `term`；剧情题使用 `concept_id`，不把剧情理解题伪装成词汇题。

### Book 2

- Minecraft：`leaped`、`light`、`bear`、`alongside`、`cave` 均绑定到对应句子。
- Mikey & JJ：洪水开端、木筏、鸟偷晚餐、电击鲨鱼、幸存结局均使用 `concept_id` 和一个或多个 `source_sentence_ids`。

### Book 3

- Minecraft：`swung`、`fight`、`cave`、`returned` 均绑定到对应句子。
- Mikey & JJ：企鹅妈妈、鲜鱼、人体大炮、激光枪、企鹅家庭团聚均使用真实剧情句和 `concept_id`。

### Book 4–5

- Minecraft Book 4：`battle`、`swung`、`protect` 均绑定到对应句子。
- Minecraft Book 5：`dangerous`、`eyes`、`together`、`journey`、`mountain` 均绑定到对应句子，并补齐页面级词汇的句级归属。
- Mikey & JJ Book 5：将“关键挑战/谁解决问题/结局”等泛化题改为龙卷风、地堡和食物储备等真实剧情题；唯一词汇题 `tornado` 绑定到 `b5-p01-s01`。

## 播放器变化

`storybook.js` 和 `episode-vocab-quiz.js` 现在会保留作者写入的 `concept_id`、`source_sentence_ids`、`scene_id`。已有作者证据时，不再因为题干包含某个重点词而自动补 `term`；旧题仍保留兼容显示，等待迁移完成。

## 已完成与下一批次

1. Mikey & JJ Book 6–11 已逐题绑定真实剧情；Book 8–11 的题目不再使用模板干扰项。
2. `study-replay-queue.js` 新增 `replayQueueForQuestions()`，错题回放按 `source_sentence_id(s)` / `scene_id` 定位；有证据但找不到场景时不再退回整条队列。
3. `storybook-practice.js` 保留 `source_sentence_ids`、`scene_id`、`concept_id`，确保练习状态不会丢失回放证据。
4. 下一步将 validator 接入发布/打包命令，并为真实浏览器链路补“答错 → 对应小节 → 只重做错题”的验收。
