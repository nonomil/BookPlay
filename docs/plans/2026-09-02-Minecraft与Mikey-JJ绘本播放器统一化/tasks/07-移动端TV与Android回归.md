# 任务 07：移动端、TV 与 Android 回归

**目标：** 让统一播放器在手机、平板、桌面和电视上保持同一 DOM 与学习流程，满足触控/遥控器尺寸、无横向溢出和 Android 离线准备要求。

**依赖：** 任务 02–06。

**文件：**

- 修改：`prj/engine/storybook-v3.css`
- 修改：`prj/engine/tv.css`
- 修改：`prj/engine/storybook.html`（仅必要 aria/DOM 顺序修复）
- 修改：`prj/engine/storybook.js`（仅 resize/focus/scroll 修复）
- 修改：`scripts/prepare-mobile.mjs`（只有新文件未被复制时）
- 测试：`prj/engine/tv-ui.test.mjs`
- 测试：`prj/engine/storybook-route.test.mjs`
- 记录：`docs/reports/2026-09-02-Minecraft与Mikey-JJ统一播放器多端验收.md`

## 步骤 1：写响应式静态失败合同

在 `storybook-route.test.mjs` / `tv-ui.test.mjs` 增加断言：

- v3 desktop grid 包含 `clamp(380px, 32vw, 480px)` 或同等明确 rail 宽度。
- `<900px` 切单列，stage 在 panel 之前。
- `<600px` 顶栏允许两行，控制尺寸不低于 44px。
- TV 规则下按钮/role=button 不低于 64px。
- `prefers-reduced-motion` 关闭 locator pulse/大幅过渡。
- locator `pointer-events:none`。
- 不存在 v3 `position:fixed` 大字幕/重点词层覆盖 stage。

运行并确认新增合同先失败。

## 步骤 2：手机布局（320–599px）

实施：

- `.sb-app` 单列，顺序 topbar → stage → panel。
- topbar 分两行：返回+标题；模式+播放+生词本/设置。
- 标题 `min-width:0; overflow:hidden; text-overflow:ellipsis`。
- stage 图片最大高度约 `56svh`，使用 contain。
- panel 正常文档流，无内部固定高度滚动。
- nav 可 `position:sticky; bottom:0`，同时给 panel 添加等高底 padding。
- 重点词单列；长 IPA/例句 `overflow-wrap:anywhere`。
- 每词可点击区域增加上下 padding，不用 fixed width 打碎排版。

浏览器断言：

```js
document.documentElement.scrollWidth <= document.documentElement.clientWidth
```

## 步骤 3：平板布局（600–899px）

- 竖屏继续上下结构。
- 横屏可在容器足够宽时双列，但 rail 不小于 340px。
- stage 不使用固定 `100vh` 导致地址栏抖动，优先 `dvh/svh`。
- 放大图片属于用户主动操作；学习栏不会覆盖图片。

## 步骤 4：桌面布局（900px 以上）

- 900–1279：媒体区 + 340–400px rail。
- 1280–1599：rail `clamp(380px,32vw,480px)`。
- 1600 以上：media 约 70%，rail 不无限扩宽，文本保持 65–75ch 以内。
- panel 需要滚动时只滚 panel；nav 保持可见。
- 不出现 page + panel 同时难以控制的嵌套滚动。

## 步骤 5：TV 与遥控器

在 `tv.css` v3 范围内：

- topbar 安全边距使用现有 `--tv-safe-inline`。
- 控制尺寸使用 `--tv-control-size`。
- 当前英文 `clamp(1.75rem,2.2vw,2.35rem)` 左右；中文不低于 1.25rem。
- rail 保持 28–34vw 或 420–520px；媒体仍能完整显示漫画页。
- focus ring 4px + offset，不被 overflow 截断。

检查 DOM 焦点顺序：

```text
目录 → 剧情/精学 → 播放 → 生词本 → 中文开关
→ 句内词 → 重点词 → 上一句/下一句 → 巩固
```

方向键不得把焦点送进 hidden legacy bubble 或 locator。

## 步骤 6：图片、重排与定位器

- `<img>` 明确 width/height 或 aspect-ratio 占位，避免加载后跳动。
- page load、ResizeObserver、orientation change 后重算 Mikey locator。
- 重算使用 requestAnimationFrame 合并，避免 resize 风暴。
- locator 计算失败时隐藏，不留在旧位置。
- 退出全屏/旋转后学习栏和 nav 可见。

## 步骤 7：无障碍检查

- 所有图片有包含书名/页码的 alt。
- icon-only button 有中文 aria-label。
- active 模式使用 `aria-pressed`。
- quiz 对话层有可理解标题与焦点返回。
- feedback error 通过 aria-live 宣告；逐词 active 不反复宣告。
- 对比度抽样：Minecraft 暖白/深绿、Mikey 黑/奶油、按钮 active/disabled。

## 步骤 8：Android 准备合同

运行：

```powershell
npm run android:prepare
```

确认 `dist/engine` 包含：

- `storybook.html`
- `storybook.js`
- `storybook-ui.js`
- `storybook-practice.js`
- `storybook.css`
- `storybook-v3.css`
- `tv.css`
- 现有 media/route 脚本

如果 `prepare-mobile.mjs` 已复制整个 engine，则只加测试，不改脚本。不要把 `书籍资料库` 原始 PDF/MP3 打入 APK。

## 步骤 9：五档视口真实验收

| 视口 | Minecraft | Mikey | 重点 |
|---|---|---|---|
| 390×844 | book1/page2、book3 | book1/page1 | 无横溢出、44px、图上栏下 |
| 768×1024 | book1/page8 | book2/page1 | 8/11 句导航、翻译和卡片 |
| 1115×864 | 当前用户窗口 | book1/page1 | 视觉主验收、rail 宽度 |
| 1440×900 | book4 缺句 | book6 缺句 | 双列、缺音频降级 |
| 1920×1080 | book1 | book2/page1 | 64px、遥控焦点、可读字号 |

每档记录：URL、viewport、scrollWidth/clientWidth、stage/panel/nav rect、locator rect（Mikey）、console error/warning。

## 步骤 10：自动化验证

```powershell
node --test prj/engine/tv-ui.test.mjs prj/engine/storybook-ui.test.mjs prj/engine/storybook-practice.test.mjs
node prj/engine/storybook-route.test.mjs
npm run android:prepare
```

将真实浏览器数据写入指定 report，不只贴截图。

## 完成证据

- 五档视口表格与截图/DOM rect。
- `scrollWidth <= clientWidth` 全通过。
- TV 焦点路径和最小尺寸。
- Android 输出文件清单和命令退出码。

## 回滚边界

- 平台 CSS 可按 breakpoint 独立回滚；不回滚核心点读/数据。
- locator 在某视口失败时按 capability 临时禁用，不恢复复制气泡浮窗。

## 提交检查点

```powershell
git add prj/engine/storybook-v3.css prj/engine/tv.css prj/engine/storybook.html prj/engine/storybook.js scripts/prepare-mobile.mjs prj/engine/tv-ui.test.mjs prj/engine/storybook-route.test.mjs docs/reports/2026-09-02-Minecraft与Mikey-JJ统一播放器多端验收.md
git commit -m "fix: harden unified storybook layouts across devices"
```

**状态：** 待执行。

## 当前执行记录（2026-09-02）

已完成本轮端侧回归：

- 390×844：V3 `scrollWidth=375/clientWidth=375`，stage/panel 均不再被桌面固有宽度撑开。
- 768×1024：`scrollWidth=clientWidth=768`。
- 1115×864：stage 735px、panel 380px，`scrollWidth=clientWidth=1115`。
- 1440×900：stage 979px、panel 461px，`scrollWidth=clientWidth=1440`。
- 1920×1080：stage 1440px、panel 480px，`scrollWidth=clientWidth=1920`。
- `npm run android:prepare` 与 `npm run android:sync` 均成功，V3 CSS/JS 已进入 Android `assets/public/engine`。

**状态：** 已完成（本轮响应式修复已通过；待任务 08 做最终用户视觉确认）。
