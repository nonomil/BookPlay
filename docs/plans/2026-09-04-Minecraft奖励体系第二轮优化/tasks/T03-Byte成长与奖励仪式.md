# T03 Byte 成长与奖励仪式

> 状态：已落地并通过 Node/UI 回归。

## 文件

- 修改：`content/companions/block-buddy.json`、`prj/data/companions/block-buddy.json`
- 修改：`prj/engine/companion.js`、`prj/engine/companion.css`
- 修改：`prj/engine/storybook.js`、`prj/engine/storybook-v3.css`
- 修改：`prj/engine/companion-core.js`
- 资产：`content/assets/generated/storybooks/minecraft/characters/byte/transparent/`（仅使用已审核素材；缺图时先回退）
- 测试：`prj/engine/companion-core.test.mjs`、`prj/engine/companion-ui.test.mjs`、`prj/engine/storybook-ui.test.mjs`

## 步骤

1. 先写失败断言：Minecraft 存档的 `companion` 字段不能被规范化为 `white-dragon-horse`；完成一本/两本后的阶段名称和动作必须不同。
2. 运行 Node 测试确认失败。
3. 让 `normalizeState` 保留传入 companion ID 或按系列设置；不改变西游默认行为。
4. 为 Byte 三阶段增加明显视觉差异：方块蛋、Byte 小狼、方块探险伙伴；没有新图时用安全的现有 idle/high-five 回退。
5. 将照料按钮收敛为故事动作，或明确标注为轻互动；不把喂养/清洁解释成会生病、饥饿的状态机。
6. 完成卡新增儿童化的“故事礼物”仪式与“去小屋/下一本”路径；选择操作支持稍后再选，不能丢失未领取资格。
7. 运行 Node 测试和浏览器通关卡抽样，确认动效遵守 `prefers-reduced-motion`。

## 预期结果

- Byte 是主角奖励，不是额外的积分仪表盘。
- 孩子完成一本书后能立刻看到“贴纸 + 一件物品 + Byte 反应”，但不会被迫进入商店或复杂养成。
