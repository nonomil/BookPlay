# Mikey & JJ speaking bubble handoff

## 唯一目标

在 BookPlay 正式共用绘本播放器中，为已发布的 Mikey & JJ 两本书交付严格单句自动播放、仅播放期显示的画内放大气泡、说话人标签与尾巴、逐词高亮、重点词中文下注和点词中英双语朗读。

## 真实消费者与首件

- 消费者：`http://127.0.0.1:8810/engine/storybook.html?series=mikey-jj&book=2`
- 首件：Water House 第 1 页从现有 6 个复合单元拆成 11 个真实单句，附独立 MP3、speaker/bubble/words；正式页跑通切句自动播放、播放期气泡和一个重点词双语朗读。
- 期限：首件默认 30 分钟；不能可靠确认说话人、坐标或音频边界时返回精确 blocker。

## 已锁定输入

- 页图：`书籍资料库/Mikey & JJ 英文冒险/pages/water-house-adventure/p01.webp`
- 源音频：`书籍资料库/Mikey & JJ 英文冒险/audio/Water House Adventure.mp3`
- 当前单句候选与切片：`prj/data/storybooks-mikey-jj/book2.json` 第 1 页，`prj/assets/mikey-jj/water-house-adventure/sentences/`
- 正式播放器：`prj/engine/storybook.html`, `media.js`, `storybook.js`, `storybook.css`
- 设计和实施规范：`docs/plans/2026-08-31-mikey-jj-speaking-bubble-design.md`, `docs/plans/2026-08-31-mikey-jj-speaking-bubble-plan.md`

## 不可违反

- 气泡仅在句音频或点词音频播放期出现；手动暂停/停止立即隐藏，ended 后 600ms 停留再淡出。
- 坐标相对漫画实际显示矩形；不猜说话人，不用固定左右交替伪造尾巴。
- 一个音频单元只对应一个完整单句；不用整段音频冒充，不伪造对齐。
- 点词复用 `WalaMedia.ttsUrl`，使用独立 word audio，不覆盖句音频。
- 不改 Minecraft/西游记行为；新 CSS 仅限 `body.sb-mj`；320px/390px 不溢出。
- 原图、源 MP3/MP4 只读；不写 `G:\Game\BookPlay书戏\tmp`；不改全局 Git 身份。

## 下一条真实命令

先运行锁定环境门，再运行任务卡 `first_command`。通过后跑 44 项基线，接着以失败测试启动 Water House 第 1 页切片。

