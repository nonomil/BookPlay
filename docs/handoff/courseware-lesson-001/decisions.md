# 已锁定决定

1. 原始 PPTX/PDF 永久只读；不整理、重命名或回写 `data/西游记课件`。
2. 先做 EP1，验收通过后才允许 T06 批处理 108 集。
3. 生成内容位于 `content/lesson_guides/ep001/`，该目录不进入 Git；代码、测试、配置和 docs 可进入 Git。
4. 主页面课件提供课程视觉页，字幕帧课件提供句子定位证据，教师课件提供可编辑教学提示。PDF 不作为 EP1 首选来源。
5. `dialogue_stories/ep1.json` 保持剧情数据职责；课程数据使用独立 `lesson.json`。
6. `lesson.json` 不绑定字幕节点；儿童默认卡统一由 `episode_complete` 触发，并按稳定 `order` 排列。
7. Wala 逐句状态保持原样；最后一句后新增 `EPISODE_COMPLETE → CONSOLIDATION_ENTER → CONSOLIDATION_ACTIVE → CONSOLIDATION_RESULT → EPISODE_END`。
8. 故事遍和精学遍都不在句间插题；完整看完一集后只进入一次知识巩固。播放器既有测验、保存进度和下一句行为不能回归。
9. 豆豆龙使用既有 `content/assets/ui/doudou-loong-icon.png`。初版不要求新生成角色图；未来表情态另立资产任务。
10. 课程页采用儿童教育圆角卡片、44px 最小触控目标、错误不只靠颜色表达、支持 `prefers-reduced-motion`、同一 DOM 响应式布局。
11. DSH 权限固定 `workspace-write`；禁止提交、重置、修改 Git 历史或发布。
12. 当前模型路由错误必须显式解除，不允许 fallback。
