---
status: DRAFT
updated: 2026-09-29T23:58:00+08:00
plan_version: v2
source_of_truth: ../../../../solution.md
---

# T03 战场站在同一张地上

## 目标与消费者

第 1 集战斗里，悟空、小猴、头目站在同一张黏土花果山路上。消费者是已经认了「在打架」、但还觉得画面是贴图的人。

关联：需求 R9、R4。验收 A5 的战场部分。计划 01 的 A2、A3 不能退。

## 允许改

- `proto-action.html` 的 `applyBackdrop`（约第 1031 行）。第 1 集应选中 `../assets/generated/arena/clay/bg-ep1.jpg`，并给场地加上 `scene`，从而隐藏那层和照片无关的椭圆地面
- `placeSprite`、英雄落点（`render` 里约第 1924 行起）里脚底和影子的纵坐标，使脚贴在画面地面带上
- 小怪优先用黏土 `monkey-minor.png`。若 `makeSprite` 先走到另一套管线的 gif，第 1 集小怪改走这张黏土图
- 头目使用同一张小猴图放大，或已有的同风格头目图。没有同风格图时，用小猴放大并加冠，不要退回品红底贴纸

## 禁止改

- `hurtFoe` 的匹配和浮字
- 词表、波次定额数字（每波 5、同屏 2）
- 第 2 集及以后的背景选择逻辑。它们继续用各自现有图，本任务只保证第 1 集
- 不新增图片生成流程

## 依赖

`progress/README.md` 里有计划 01 的人话，承认这是在打猴子。

## 首件调查

本地确认三个文件存在且能被页面路径加载到：

- `prj/assets/generated/arena/clay/bg-ep1.jpg`
- `prj/assets/generated/arena/clay/wukong/wukong-south-idle.png`
- `prj/assets/generated/arena/clay/monkey-minor/monkey-minor.png`

在第 1 集开战时看 `applyBackdrop` 实际选中哪一张。若先命中别的 `bg/ep1.jpg`，以黏土 `bg-ep1.jpg` 为第 1 集优先。

## 首件

第 1 集战斗画面同时满足：背景是黏土路和瀑布；悟空脚和影子在路的下半地面；小猴没有品红底板；跳起来时影子留在地上、人离地（现有 K 跳规则）。

## 验证

`../../../test-plan.md` 计划 02 的第 1、2 步，并重做计划 01 的打错、打对、Boss 过关三下，确认没有把测验加回来。

## 停止条件

- 三张图缺任何一张
- 不改投影公式就无法让脚落地，而且一改就使点击地面走路对不上。这时停，把投影和点击是否还一致写进进度，不靠隐藏角色来假装落地
- 开始为 108 集批量生图

## Owner

未派发。计划 01 未通过前不派。

## 证据与下一步

尚无。通过后做 T04。
