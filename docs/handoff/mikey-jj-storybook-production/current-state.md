# Current state

- Zombie School 已进入正式消费者：10 页、52 句、52 个真实句音频、重点词三层卡和 5 道全屏测验均已形成候选。
- Codex 已独立重跑 36/36 路由测试，并抽样解码首/中/末句音频；正式 URL 返回 200。
- REPAIR r3 已关闭桌面端缺口：1280×720 为 `topbar.bottom=66px`、`sb-page.top=80px`、`page.bottom=704px`。
- Codex 独立复核发现移动端仍被同一绝对定位顶栏覆盖：390×844 为 `topbar.bottom=113.5625px`、`sb-page.top=5.515625px`，覆盖约 108px。
- 原漫画和正式副本哈希一致；裁切来自 CSS 布局，不来自图片处理。
- REPAIR r4 已让移动顶栏回到文档流，但漫画底部仍超出 stage/panel 边界约 31px。
- Codex 视觉探针证明只需移动 stage `min-height:auto`，可让 panel 在漫画完整结束后开始并保留 9.594px 间距。
- REPAIR r5 的属性值正确但被后置共用 56vh 规则覆盖，正式几何未改变；DSH 返回 BLOCKED_CASCADE。
- REPAIR r6 只提升现有 Mikey 移动 stage 选择器特异性，禁止 !important 和重复规则；保留桌面 r3 与移动 r4。
- 修复后还需独立复核 1280×720、390×844、逐句音频切换和全屏测验交互；完成前保持候选状态。
- DSH 实例固定 `5131`，owner 固定 `session-b573307a-f6b5-457f-9497-4a097d032669`，模型 `opencode-go/deepseek-v4-flash`，权限 `danger-full-access`。
