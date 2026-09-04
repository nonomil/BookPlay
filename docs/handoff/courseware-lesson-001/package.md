# DSH FULL 交接包：EP1 课件课程页

task_id：`courseware-lesson-001`  
contract_revision：`1`  
environment_revision：`1`

## 唯一目标

先用《西游记》第 1 集建立一条可重复、可验收的课件内容链：从三份锁定来源提取页面图像与文字，生成 `lesson.md`、`lesson.json`、素材和来源收据；随后由独立 `lesson-cards.js` 加载。故事遍和精学遍的逐句播放都不插题，只有完整看完一集并触发 `episode_complete` 后，才显示带题目、图片和豆豆龙教师的“知识巩固”整页界面。

本次 DSH 首切片只负责在 30 分钟内产生 EP1 的第一个真实工件或精确 blocker。禁止越过 EP1 直接批处理 108 集。

## 必读文件

1. `G:\Game\BookPlay书戏\docs\handoff\courseware-lesson-001\handoff-manifest.json`
2. `G:\Game\BookPlay书戏\.agent-control\tasks\courseware-lesson-001\task.md`
3. `G:\Game\BookPlay书戏\.agent-control\tasks\courseware-lesson-001\recent-context.md`
4. `G:\Game\BookPlay书戏\.agent-control\env\courseware-lesson-001\environment.json`
5. `G:\Game\BookPlay书戏\docs\plans\2026-08-30-课件课程页\README.md`

## 锁定输入

- 主页面课件：`G:\Game\BookPlay书戏\data\西游记课件\3.3西游记  Journey to the West PPT课件\001_Journey to the West 1_The Monkey.pptx`
- 字幕帧课件：`G:\Game\BookPlay书戏\data\西游记课件\西游记-外教课动画截图\Journey to the West 001  The Monkey_20240106162142.pptx`
- 教师课件：`G:\Game\BookPlay书戏\data\西游记课件\西游记外教培训11集课件\西游记外教E001.pptx`
- 剧情节点：`G:\Game\BookPlay书戏\content\dialogue_stories\ep1.json`
- 豆豆龙形象：`G:\Game\BookPlay书戏\content\assets\ui\doudou-loong-icon.png`

原始 PPTX、`data/`、发布物和既有媒体只读。附图仅作为布局与交互参考，不复制紫色品牌或附图中的教师形象。

## 首件与消费者

- 首件：`G:\Game\BookPlay书戏\content\lesson_guides\ep001\source-receipt.json`
- 同一首切片至少还应产生：`lesson.md`、`lesson.json` 和一张 `assets\slide-*.webp`。
- 最终消费者：`G:\Game\BookPlay书戏\prj\engine\wala.html`、`wala.js`、`wala.css`，新建加载边界为 `lesson-cards.js`。
- 第一阶段不得直接把课件字段塞进 `content\dialogue_stories\ep1.json`。

## 当前阻塞

用户已明确锁定 `opencode-go/deepseek-v4-flash`，DSH owner 已启动且环境门通过。修改前基线 `node --test prj/engine/wala-player-ui.test.mjs` 退出码为 1：句子标记触控区域未达到 40px，图标未达到 24px。按固定车道的停止条件，EP1 提取没有开始，也没有播放器代码修改。

该交接包直接解锁的下一条真实命令是：先修复 `wala.css` 的两项既有 UI 合同并让基线通过，再续接同一 owner 进入 EP1 提取车道。
