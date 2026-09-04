# Mikey & JJ Penguin Adventure handoff

把 `Penguin Adventure` 作为 Mikey & JJ 第 3 本合入正式共用绘本播放器。执行必须复用既有 Owner，不得因为批次变长新建会话。

## 真实目标

`G:\Game\BookPlay书戏\prj\engine\storybook.html?series=mikey-jj&book=3` 能加载 10 页原漫画，按真实气泡顺序逐句播放同名 MP3，逐词高亮，点击重点词可英→中→恢复句音频，并在章末显示全屏测验。

## 首件

先交 `G:\Game\BookPlay书戏\.agent-control\tasks\mikey-jj-penguin-production\evidence\first-artifact.json`：第 1 页真实气泡/说话人/毫秒边界、至少一个可解码句片段和 book=3 正式路由证据。首件未通过不得扩展其余页面。

## 输入与输出

- 输入 PDF：`G:\Game\BookPlay书戏\书籍资料库\Mikey & JJ 英文冒险\PDF\Penguin Adventure.pdf`
- 输入页图：`G:\Game\BookPlay书戏\书籍资料库\Mikey & JJ 英文冒险\pages\penguin-adventure\p01.webp..p10.webp`
- 输入音频：`G:\Game\BookPlay书戏\书籍资料库\Mikey & JJ 英文冒险\audio\Penguin Adventure.mp3`
- 输出数据：`G:\Game\BookPlay书戏\prj\data\storybooks-mikey-jj\book3.json`、`speaking-annotations-book3.json`
- 输出音频：`G:\Game\BookPlay书戏\prj\assets\mikey-jj\penguin-adventure\sentences\`

先读项目技能及 [audio-contract.md](../../.codex/skills/storybook-audio-splitting/references/audio-contract.md)，再按任务卡的固定车道执行。Slime Jail 不在本任务范围。
