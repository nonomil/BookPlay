# Mikey & JJ 播放气泡与点词学习实施计划

> **给执行者:** 必需子技能：使用 executing-plans 逐任务实施；实际执行继续复用现有 DSH `Mikey & JJ Storybook Production` owner。

**目标：** 为两本已发布 Mikey & JJ 绘本交付切句自动播放、播放期画内放大气泡、说话者标签、逐词高亮、重点词中文下注和点词双语朗读。

**架构：** 保持当前静态 `storybook.html + storybook.js + storybook.css + book JSON` 消费路径。先以测试锁定新数据合同，再将两本书严格拆成 118 个单句音频单元并补齐 `speaker/bubble/words`，最后在 `sb-mj` 主题内增加自动播放控制器和图像内气泡层。点词朗读复用 `media.js` 的 `/api/tts` URL，并使用独立音频元素，避免覆盖句音频。

**技术栈：** 原生 HTML/CSS/JavaScript、Node `node:test`、Python 3.11、锁定的 imageio-ffmpeg 7.1、现有 8810 本地服务。

---

### 任务 1：用失败测试锁定数据与消费者合同

**文件：**
- 修改：`prj/engine/storybook-route.test.mjs`
- 读取：`prj/data/storybooks-mikey-jj/book1.json`
- 读取：`prj/data/storybooks-mikey-jj/book2.json`

**步骤 1：编写失败的数据合同测试**

增加独立测试，要求：

```js
test("published Mikey books expose atomic speaking-bubble sentences", () => {
  for (const path of [MJ_DATA, MH_DATA]) {
    const data = JSON.parse(fs.readFileSync(path, "utf8"));
    for (const page of data.pages) {
      for (const sentence of page.sentences) {
        assert.match(sentence.id, /^b\d+-p\d{2}-s\d{2}$/);
        assert.ok(["mikey", "jj", "narrator", "system"].includes(sentence.speaker.id));
        for (const key of ["x", "y", "w", "h"]) {
          assert.ok(sentence.bubble[key] >= 0 && sentence.bubble[key] <= 1);
        }
        assert.ok(sentence.bubble.w > 0 && sentence.bubble.h > 0);
        assert.ok(Array.isArray(sentence.words) && sentence.words.length > 0);
        assert.equal(/[.!?]+(?=\s+[A-Z]|$)/g.test(sentence.text_en.replace(/[.!?]+$/, "")), false);
      }
    }
  }
});
```

增加总量断言：book1 为 64 句，book2 为 54 句；每个 `audio` 文件存在且非空。

**步骤 2：编写失败的消费者结构测试**

要求：

- `storybook.html` 在 `#sb-stage-inner` 内包含 `#sb-speaking-bubble` 和 `#sb-autoplay-unlock`。
- `media.js` 在 `storybook.js` 之前加载。
- `storybook.js` 包含统一的自动播放、气泡渲染、词同步和点词朗读入口。
- `storybook.css` 的新规则全部限定在 `body.sb-mj`。

**步骤 3：运行测试并确认正确失败**

运行：

```powershell
node --test G:\Game\BookPlay书戏\prj\engine\storybook-route.test.mjs
```

预期：现有 44 项保持通过，新测试因缺少 `speaker/bubble/words` 与 DOM 入口失败。

**步骤 4：提交红灯测试**

```powershell
git add -- prj/engine/storybook-route.test.mjs
git commit -m "test: specify Mikey speaking bubble behavior"
```

若仓库未配置提交身份，记录精确 blocker，继续保留局部变更，不修改全局 Git 配置。

### 任务 2：建立可复现的单句音频与注释流水线

**文件：**
- 创建：`prj/tools/mikey_jj_sentence_pipeline.py`
- 创建：`prj/data/storybooks-mikey-jj/speaking-annotations.json`
- 修改：`prj/data/storybooks-mikey-jj/book1.json`
- 修改：`prj/data/storybooks-mikey-jj/book2.json`
- 修改/生成：`prj/assets/mikey-jj/zombie-school-adventure/sentences/*.mp3`
- 修改/生成：`prj/assets/mikey-jj/water-house-adventure/sentences/*.mp3`
- 测试：`prj/engine/storybook-route.test.mjs`

**步骤 1：写注释文件的最小结构**

每条记录以稳定句 ID 为键，包含：

```json
{
  "b1-p01-s01": {
    "text_en": "Run, Mikey!",
    "zh": "快跑，Mikey！",
    "speaker": { "id": "jj", "label": "JJ" },
    "bubble": { "x": 0.54, "y": 0.06, "w": 0.34, "h": 0.16, "tail": "bottom-left", "variant": "dialogue" },
    "start_ms": 0,
    "end_ms": 820
  }
}
```

坐标必须通过 20 张原图逐页检查；不得用固定左右交替伪造说话者或位置。旁白使用 `tail: "none"`。

**步骤 2：实现流水线的验证模式**

命令：

```powershell
python -X utf8 prj/tools/mikey_jj_sentence_pipeline.py validate --annotations prj/data/storybooks-mikey-jj/speaking-annotations.json
```

它必须拒绝：重叠/倒序时间、越界坐标、空说话者、复合多句、重复 ID、缺少来源音频。

**步骤 3：运行验证并确认在注释未完整时失败**

预期：报告首个缺失句 ID 和页码，不批量写产物。

**步骤 4：补齐两本书 118 条注释并生成音频**

锁定 ffmpeg：

```text
C:\Users\No'mi'l\AppData\Local\Programs\Python\Python311\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe
```

输入：

```text
书籍资料库\Mikey & JJ 英文冒险\audio\Zombie School Adventure.mp3
书籍资料库\Mikey & JJ 英文冒险\audio\Water House Adventure.mp3
```

输出命名保持 `page-XX-sentence-YY.mp3`。每段首尾加入 60–100ms 安全边界和短淡入淡出，但不得吞字或夹入相邻句。

**步骤 5：生成词级时间**

按句音频对齐并写入：

```json
"words": [
  { "text": "The", "start_ms": 0, "end_ms": 180 },
  { "text": "world", "start_ms": 180, "end_ms": 520 },
  { "text": "will", "start_ms": 520, "end_ms": 690 },
  { "text": "flood", "start_ms": 690, "end_ms": 1080, "term": "flood", "zh": "洪水" }
]
```

优先真实对齐；估算时间必须写 `timing_source: "estimated"`。单词区间必须单调、在片段时长内且首末覆盖合理。

**步骤 6：运行数据测试**

运行 Node 测试和 ffmpeg 首/中/末抽样。预期数据合同测试转绿，消费者结构测试仍红。

### 任务 3：增加图像内气泡 DOM 与视觉

**文件：**
- 修改：`prj/engine/storybook.html`
- 修改：`prj/engine/storybook.css`
- 测试：`prj/engine/storybook-route.test.mjs`

**步骤 1：添加最小 DOM**

在 `#sb-stage-inner` 的漫画图像后增加：

```html
<div id="sb-speaking-bubble" class="sb-speaking-bubble" hidden></div>
<button id="sb-autoplay-unlock" class="sb-autoplay-unlock" type="button" hidden>
  点击开启有声阅读
</button>
```

增加独立的 `<audio id="sb-word-audio">`，并在 `storybook.js` 前加载 `media.js`。

**步骤 2：实现 `sb-mj` 限定视觉**

- 气泡绝对定位于实际图像渲染矩形。
- 使用暖白背景、4px 漫画描边、硬阴影、角色色标签和 CSS 尾巴。
- 重点词为无默认按钮皮肤的内联按钮，英文上、中文下注。
- `.is-word-active` 与 `.is-word-done` 分开表达播放状态。
- 320/390px 下限制最大宽度和字号。
- `prefers-reduced-motion` 关闭位移与淡入淡出。

**步骤 3：运行结构测试**

预期：DOM/CSS 结构测试通过，行为测试仍失败。

### 任务 4：实现切句自动播放状态机

**文件：**
- 修改：`prj/engine/storybook.js`
- 测试：`prj/engine/storybook-route.test.mjs`

**步骤 1：先增加行为测试**

静态合同和正式浏览器测试应覆盖：

- `render()` 本身不并发播放；导航完成后只调用一次 `playCurrentSentence()`。
- 新播放开始前总是暂停旧音频并取消旧的隐藏计时器。
- `NotAllowedError` 只显示一次解锁按钮。
- 打开测验和页面卸载会停止播放。

**步骤 2：实现最小状态机**

建议状态：

```js
const playbackState = {
  generation: 0,
  unlockRequired: false,
  userPaused: false,
  wordSpeaking: false,
  resumeAt: 0,
  hideTimer: 0,
};
```

`playCurrentSentence()` 捕获当前 generation；任何异步 `play()` 回来时若 generation 已变化，立即停止，避免快速翻页导致旧句响起。

**步骤 3：连接所有入口**

- 首次 `main()` 渲染后尝试自动播放。
- 上一句、下一句、上一页、下一页完成渲染后自动播放。
- 手动“本句”按钮仍可播放/暂停。
- 浏览器返回到页面时不重复叠加播放。
- 测验打开时停止并隐藏气泡。

**步骤 4：运行测试**

预期：自动播放合同转绿，原有导航/测验测试无回归。

### 任务 5：实现放大气泡、说话者和逐词同步

**文件：**
- 修改：`prj/engine/storybook.js`
- 修改：`prj/engine/storybook.css`
- 测试：`prj/engine/storybook-route.test.mjs`

**步骤 1：渲染当前气泡**

实现：

```js
function renderSpeakingBubble(sentence) {}
function positionSpeakingBubble(sentence, imageRect) {}
function showSpeakingBubble(mode) {}
function hideSpeakingBubble({ immediate = false } = {}) {}
```

气泡坐标必须基于漫画图像实际显示区域，而不是 `#sb-stage` 全尺寸；窗口 resize、图片 load 后重算。

**步骤 2：渲染词与注释**

普通词输出 `<span>`；重点词输出真实 `<button>`，内部包含英文和中文。颜色由稳定 `toneOf(term)` 或 glossary 顺序决定，同一个词跨页颜色一致。

**步骤 3：同步播放词状态**

在句音频 `timeupdate` 或 `requestAnimationFrame` 中，用 `words[].start_ms/end_ms` 更新 `.is-word-active/.is-word-done`。暂停、切句、结束都清理旧状态。

**步骤 4：连接播放事件**

- `playing`：显示气泡。
- 手动 `pause`/停止：隐藏气泡。
- `ended`：保持 600ms 后淡出。
- 点词朗读：保持气泡显示并只高亮目标词。

### 任务 6：实现点词英文＋中文朗读

**文件：**
- 修改：`prj/engine/storybook.js`
- 复用：`prj/engine/media.js`
- 修改：`prj/engine/storybook.html`
- 测试：`prj/engine/storybook-route.test.mjs`

**步骤 1：添加失败测试**

要求重点词按钮具备 `aria-label="朗读 flood，洪水"`，点击后句音频暂停，独立 word audio 依次加载：

```js
WalaMedia.ttsUrl(term, "en-US")
WalaMedia.ttsUrl(zh, "zh-CN")
```

**步骤 2：实现 `speakGlossaryWord()`**

保存句音频是否正在播放及当前时间；播放英文、中文；结束后仅在原句此前正在播放且 generation 未变化时恢复。

**步骤 3：防止竞态**

重复点词、快速切句、打开测验时取消旧 TTS。任何 word audio 错误都恢复可操作状态，不影响句音频源。

**步骤 4：验证鼠标、触摸和键盘**

点击、Enter、Space 均只触发一次朗读；全局阅读快捷键不得吞掉重点词按钮的 Space。

### 任务 7：正式消费者视觉与回归验收

**文件：**
- 创建：`.agent-control/tasks/mikey-jj-speaking-bubble-v1/verify-browser.py` 或等价临时验收脚本
- 创建：`.agent-control/tasks/mikey-jj-speaking-bubble-v1/result.json`

**步骤 1：运行完整结构测试**

```powershell
node --test G:\Game\BookPlay书戏\prj\engine\storybook-route.test.mjs
```

预期：全部通过，无 warning/error。

**步骤 2：在 8810 验收两本书**

路径：

```text
http://127.0.0.1:8810/engine/storybook.html?series=mikey-jj&book=1
http://127.0.0.1:8810/engine/storybook.html?series=mikey-jj&book=2
```

桌面 1280×720、移动 390×844、窄屏 320×720 各验收：

- 切句后音频自动开始且只有一条音频。
- 气泡只在句音频或点词音频播放时出现。
- 气泡覆盖对应原文字区，无遮挡角色主体的明显错误。
- MIKEY/JJ/旁白标签正确。
- 重点词彩色、有中文下注，点击双语朗读并正确恢复。
- 逐词进度首、中、末至少各抽样一条。
- 无横向滚动、无 page error。

**步骤 3：回归其它系列**

打开 Minecraft book1 和西游记阅读器，确认没有 Mikey 气泡层视觉、自动播放策略或 CSS 污染。

**步骤 4：写结果收据**

记录：句子数量、音频数量、精确/估算词级时间数量、气泡注释数量、测试退出码、三视口截图路径、失败样本与 claim ceiling。

**步骤 5：提交**

仅提交本功能文件；若 Git 身份仍未配置，保留验证通过的工作树并报告，不自行修改全局身份。
