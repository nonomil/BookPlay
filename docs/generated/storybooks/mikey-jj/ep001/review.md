# Mikey & JJ EP1 复习背景验收

## 资产

- 文件：`review-background.png`
- 用途：全屏“知识回顾 / 先复习，再挑战”阶段的背景。
- 生成：Cliprox `gpt-image-2`，请求尺寸 `1536x1024`，实际尺寸 `1536x1024`。
- 发布路径：`prj/assets/generated/storybooks/mikey-jj/ep001/review-background.png`

## 视觉检查

- Mikey 与 JJ 分置画面左右边缘，中央保留大面积低细节区域。
- 中央区域可叠加标题、进度条、词卡与操作按钮，不与角色脸部或关键道具冲突。
- 图片不含可读文字、数字、Logo、水印或对话气泡。
- RGB PNG，比例 1.5，满足横版播放器的最低 1.4 比例要求。

## 页面接入

- `storybook.js` 从 EP1 视觉清单读取 `review-background`，写入 `#sb-panel` 的 CSS 变量。
- `storybook-v3.css` 在 `sb-review-full` 状态应用背景、纸张卡片、进度条、响应式网格和键盘焦点样式。
- `storybook.html` 的 V3 样式缓存版本已升级为 `v=2`。

## 验证证据

- 清单校验：`{"valid": true, "assets": 6}`。
- 浏览器预览已确认背景成功加载，词卡、进度条与底部操作行均可见。
- 全量引擎测试：195 passed，0 failed。
