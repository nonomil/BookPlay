# Mikey & JJ Storybook Production handoff

## 唯一目标

把 `Zombie School Adventure` 作为 `series=mikey-jj&book=1` 合入 BookPlay 共用绘本播放器，交付真实的 10 页漫画阅读、逐气泡单句字幕、逐句真实音频、重点词和全屏章末测验。

## 真实消费者与首件

- 消费者：`prj/engine/storybook.html?series=mikey-jj&book=1`
- 首件：`prj/data/storybooks-mikey-jj/book1.json` 第 1 页真实气泡数据 + 至少一个可解码真实句音频 + 正式路由加载。
- 期限：首件默认 30 分钟；无法确认时返回精确 blocker。

## 已锁定输入

- 10 页原漫画：`书籍资料库/Mikey & JJ 英文冒险/pages/zombie-school-adventure/p01.webp..p10.webp`
- 原始同名 MP3：`书籍资料库/Mikey & JJ 英文冒险/audio/Zombie School Adventure.mp3`
- 视觉基准：`docs/previews/mikey-jj-storybook-v1.html`
- 全屏测验背景：`docs/generated/mikey-jj/quiz-background/final/quiz-bg.png`
- 正式播放器：`prj/engine/storybook.html`, `storybook-route.js`, `storybook.js`, `storybook.css`
- schema 参考：`prj/data/storybooks-minecraft/`

## 不可违反

- 不把 preview 当交付；必须改并运行正式消费者。
- 不裁漫画，不把正文画进图；正文、中文、词卡、测验使用确定性 HTML/CSS。
- 一次只显示一句/一个气泡；不把整段放右栏。
- 音频必须按真实边界切片并记录毫秒范围；不能确认则明确标记未对齐，不假对齐。
- 测验覆盖全视口，不挤在右栏；桌面和 390px 移动端均无横向溢出。
- 保持 Journey to the West 与 Minecraft 兼容。
- 源媒体只读；本轮不处理其他 10 本。

## 下一条真实命令

运行任务卡 `first_command`；之后按 `execution-lane.md` 执行。任务卡是当前切片唯一约束，交接包只提供原因和已做决定。

