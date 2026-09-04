# 任务 05：Mikey 画布、说话人与气泡定位

**目标：** 在保持完整漫画页的前提下，使用现有真实 speaker/bubble/words 数据标明谁在说话和原气泡位置；取消复制文字的大气泡浮层。

**依赖：** 任务 02、03。

**文件：**

- 修改：`prj/engine/storybook-ui.js`
- 修改：`prj/engine/storybook.js`
- 修改：`prj/engine/storybook-v3.css`
- 修改：`prj/engine/tv.css`
- 测试：`prj/engine/storybook-ui.test.mjs`
- 测试：`prj/engine/storybook-route.test.mjs`
- 测试：`prj/tests/test_mikey_jj_sentence_pipeline.py`
- 只读验证：`prj/data/storybooks-mikey-jj/book*.json`
- 只读验证：`prj/data/storybooks-mikey-jj/speaking-annotations*.json`

## 步骤 1：冻结 Mikey 数据合同

测试确认：

```text
books=10
pages=100
sentences=458
with_zh=458
with_words=458
with_speaker=458
with_bubble=458
with_audio=457
```

已知无音频句：`book6/page9/b6-p09-s01`。

运行：

```powershell
python -m pytest prj/tests/test_mikey_jj_sentence_pipeline.py -q
```

本任务禁止为了 UI 批量重写已验证的 speaker、bubble、words 或句子文本。

## 步骤 2：写 contained rect 几何测试

在 `storybook-ui.test.mjs` 增加：

```js
test("containedRect handles horizontal letterboxing", () => {
  assert.deepEqual(
    ui.containedRect({boxWidth: 1000, boxHeight: 500, naturalWidth: 1000, naturalHeight: 1000}),
    {left: 250, top: 0, width: 500, height: 500}
  );
});

test("containedRect handles vertical letterboxing", () => {
  assert.deepEqual(
    ui.containedRect({boxWidth: 500, boxHeight: 1000, naturalWidth: 1000, naturalHeight: 500}),
    {left: 0, top: 375, width: 500, height: 250}
  );
});

test("projectRelativeBox stays inside contained image", () => {
  const box = ui.projectRelativeBox(
    {left: 100, top: 50, width: 800, height: 600},
    {x: 0.2, y: 0.1, w: 0.25, h: 0.1}
  );
  assert.deepEqual(box, {left: 260, top: 110, width: 200, height: 60});
});
```

再覆盖无 natural size、负数、超出 0..1 的 bubble 输入；函数应返回 null 或经过明确 clamp，不能输出 NaN。

先运行确认当前失败，再实施。

## 步骤 3：写 v3 不复制气泡合同

`storybook-route.test.mjs` 增加断言：

- v3 路径不调用 `renderSpeakingBubble()`。
- v3 `#sb-speaking-bubble` 始终 hidden。
- v3 使用空 `#sb-bubble-locator`，其内容为空。
- locator `aria-hidden="true"`、`pointer-events:none`。
- 句子正文只存在于学习栏 `#sb-text`。

预期先失败，再改实现。

## 步骤 4：实现说话人标签

在 `renderPage()`：

- `sentence.speaker` 存在才显示 `#sb-speaker-chip`。
- 文本使用 `speaker.label`，并映射 `data-speaker`。
- 固定映射：`mikey`、`jj`、`narrator`、`system`。
- 未知 ID 显示 label + 中性色，不猜角色。
- 标签与颜色同时表达身份。

CSS：

- Mikey：红色外框/标签。
- JJ：绿色。
- narrator：黄褐。
- system：灰。
- 对比度不低于 4.5:1。

## 步骤 5：实现透明 locator

新增函数：

```js
function updateBubbleLocator(sentence) {
  const imageRect = pageImg.getBoundingClientRect();
  const contained = BookPlayStorybookUI.containedRect({
    boxLeft: imageRect.left,
    boxTop: imageRect.top,
    boxWidth: imageRect.width,
    boxHeight: imageRect.height,
    naturalWidth: pageImg.naturalWidth,
    naturalHeight: pageImg.naturalHeight,
  });
  const target = BookPlayStorybookUI.projectRelativeBox(contained, sentence.bubble);
  // Convert viewport coordinates to #sb-stage-inner local coordinates.
}
```

定位器：

- 相对 `#sb-stage-inner` 定位。
- 外扩 4–6px，但 clamp 在实际图片矩形内。
- 只写 left/top/width/height 和 `data-speaker`。
- 不写 innerHTML/textContent。
- `pageImg.load`、window resize、ResizeObserver 触发重算。

## 步骤 6：显示/隐藏状态机

显示：

- 句音频 `playing`。
- 词音频 `playing`，且当前句仍是同一 sentence id。

隐藏：

- 手动 pause：立即。
- page/sentence/mode 变化：立即。
- error：立即并显示学习栏错误。
- natural ended：300–500ms 后淡出。

新播放必须取消上次 hide timer；`prefers-reduced-motion` 下取消脉冲和淡入位移。

## 步骤 7：精确词级高亮

Mikey 使用 `sentence.words[index].start_ms/end_ms`：

- 以句级 clip 自身 currentTime 计算，不使用源 MP3 绝对时间。
- active/done/wait 单调推进。
- 点词期间暂停句音频，句内高亮冻结；恢复后继续。
- 句结束清除。
- 不在原漫画气泡中复制逐词高亮。

## 步骤 8：首次授权提示迁移

确认 `NotAllowedError` 后：

- `#sb-reader-notice` 显示真实按钮“点击开始有声阅读”。
- stage 内 `#sb-autoplay-unlock` 在 v3 下 hidden。
- 点击按钮后播放当前句；成功后 story 模式才允许自动下一句。
- 截图中漫画中央不得出现授权按钮。

## 步骤 9：缺音频句降级

针对 `b6-p09-s01` 写/补测试：

- 文本、中文、speaker、bubble、words 数据继续渲染。
- 本句原音按钮 disabled，文案“本句无可信原音”。
- 单词 TTS 可用。
- 不读取上一句 `currentClipSrc`。
- locator 只在单词 TTS 实际播放时出现。

## 步骤 10：视觉与几何抽样

至少抽样：

- book 1 page 1：多个角色、多个气泡。
- book 2 page 1：11 句，验证每句 locator。
- book 6 page 9：缺音频句。
- narrator/system 各一例。
- page 10 最后页：学习栏和下一本入口。

视口：390×844、1115×864、1440×900、1920×1080。

对每句记录 locator 矩形，断言：

```text
locator.left >= contained.left
locator.top >= contained.top
locator.right <= contained.right
locator.bottom <= contained.bottom
```

## 步骤 11：验证

```powershell
node --test prj/engine/storybook-ui.test.mjs
node prj/engine/storybook-route.test.mjs
python -m pytest prj/tests/test_mikey_jj_sentence_pipeline.py -q
node --check prj/engine/storybook.js
```

浏览器 console 无新增 error/warning，图片上不存在复制字幕 DOM。

## 完成证据

- contained/project 单元测试输出。
- 四档视口 locator 边界数据。
- 11 句页面逐句抽样结果。
- 缺音频句 DOM、TTS 和 locator 行为。

## 停止条件

- bubble 坐标与可见原气泡明显冲突。
- object-fit 几何仍输出越界。
- speaker 证据与页面可见角色冲突。
- 修改需要重写已验证 annotation。

## 回滚边界

- 关闭 `hasBubbleLocator` 即可停用定位器，统一学习栏和 speaker 标签继续使用。
- legacy copied bubble 只作为临时回滚，不得在 v3 同时显示。

## 提交检查点

```powershell
git add prj/engine/storybook-ui.js prj/engine/storybook.js prj/engine/storybook-v3.css prj/engine/tv.css prj/engine/storybook-ui.test.mjs prj/engine/storybook-route.test.mjs prj/tests/test_mikey_jj_sentence_pipeline.py
git commit -m "feat: locate mikey speech bubbles without overlays"
```

**初始状态：** 待执行。

## 当前执行记录（2026-09-02）

已落地：

- V3 使用完整漫画页和 contained-image 几何定位器；定位器为空 DOM、`aria-hidden`、`pointer-events:none`，不复制气泡文字。
- speaker chip 仅消费真实 `speaker` 字段，Mikey/JJ/narrator/system 颜色映射保持可读对比度。
- `containedRect`、`projectRelativeBox` 已覆盖横向/纵向留白、非法输入和 clamp 边界。
- 缺音频句 `b6-p09-s01` 保留英文、中文、speaker、bubble、words；播放器清除旧 clip，单词 TTS 不复用上一句音频；V3 定位器只在单词 TTS 实际播放期间显示。
- 新增路由合同测试，`npm test` 全部通过（158 项）。真实 8810 V3 页面 console error/warning 为 0。

**状态：** 已完成（后续新增集数只需提供经过验证的 annotation，不改播放器合同）。
