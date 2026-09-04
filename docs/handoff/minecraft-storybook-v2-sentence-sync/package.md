# Minecraft 分级绘本 V2｜revision 9 交接包

## 唯一目标

revision 8 已把 Codex 定稿的 GPT 背景接入真实 Minecraft 全屏 quiz。本轮唯一目标是更新 `storybook.html` 的 CSS 查询参数，确保浏览器不再复用 `?v=png1` 的旧样式。

## 真实消费者

`prj/engine/storybook.html?series=minecraft&book=1` → `prj/engine/storybook.css` → `prj/assets/minecraft/ui/quiz-bg-v2.webp`。

## 输入与首件

- 只读输入：`docs/generated/minecraft-storybook/quiz-background/final/quiz-bg-v2.webp`
- 首件：`storybook.html` 使用新缓存戳且测试锁定；Codex 重载后 computed backgroundImage 为 radial-gradient 在 url 之前。

## 执行边界

完整合同见任务卡 revision 9。只写 `storybook.html`、最小路由测试与任务结果。禁止改 CSS 内容、JS、JSON、音频、图片或产品行为。
