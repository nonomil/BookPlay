# T04 整集知识巩固状态机

**目标：** 故事遍和精学遍都保持逐句连续播放；最后一句完成后，恰好进入一次本集知识巩固，完成或明确跳过后再显示本集结束/下一集。

**文件：**

- 创建：`prj/engine/lesson-cards.js`
- 创建：`prj/engine/lesson-cards.test.mjs`
- 修改：`prj/engine/wala.html`
- 修改：`prj/engine/wala.js`
- 修改：`prj/engine/wala.css`

**步骤：**

1. 先写纯调度测试：普通句不触发、最后一句只触发一次、lesson 缺失直接走既有结束页。
2. 增加 lesson JSON 可选加载与 `episode_complete` 卡排序。
3. 增加知识巩固 overlay DOM。
4. 接入当前本集结束入口，不接入每句 `afterSentence()` 卡片调度。
5. 防止媒体结束回调和按钮导致双重进入或双重结算。
6. 完成 choice、sequence、free_talk 最小渲染与“稍后巩固”。
7. 完成/跳过后只调用一次既有本集结束流程。
8. 运行所有 Node/Python 测试。

**停止条件：** 任一普通字幕结束后出现巩固页、现有 Wala UI 合同失败、同一集出现两次巩固页，或 lesson 缺失时无法正常结束，立即停止。

