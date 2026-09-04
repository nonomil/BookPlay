# T02：奖励目录与 Minecraft 伙伴

## 目标

把第 1、2 本的奖励接入 `episode-reward.js`，同时为 `companion.html?series=minecraft` 提供 Byte 伙伴和 3 枚长期勋章。

## 规则

1. 每本完成并通过巩固自动获得一张本书故事贴纸。
2. 每本完成后提供 3 件绑定物件，孩子任选 1 件；重复完成幂等。
3. 每日掉落上限仍为 2，但贴纸不占用大件上限。
4. `bookplay_storybook_rewards_v1.minecraft` 与西游状态隔离。
5. 所有物件 `non_power: true`，不影响英语学习数值。
6. 书 3–5 没有审核好的 items 时不自动回退到书 1/2。

## 伙伴阶段

- 神秘方块蛋：尚未完成任何一本。
- Byte 小狼：完成第 1 本。
- 方块探险伙伴：完成第 2 本。

阶段图使用仓库现有 Byte 透明图，找不到图时回退 glyph，不阻塞页面。

