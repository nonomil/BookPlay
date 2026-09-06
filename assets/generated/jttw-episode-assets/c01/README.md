# C01 · 按集游戏资产包

这是《西游记》第一章节（第 1–7 集）的资产索引与生成计划。每个 `ep001`–`ep007` 文件夹对应一集，包含该集的 `manifest.json` 和本说明；实际图片可以先引用共享角色库，生成后再放入该集的 `characters/`、`scenes/`、`props/` 子目录。

## 统一动态分镜规格

新的角色主图不是旧的 4×2 八联图，而是 **4 行 × 8 列**：

| 行 | 方向 | 第 1–4 格 | 第 5–8 格 |
| --- | --- | --- | --- |
| 1 | east | 原地走路 | 本集动作/兵器 |
| 2 | south | 原地走路 | 本集动作/兵器 |
| 3 | west | 原地走路 | 本集动作/兵器 |
| 4 | north | 原地走路 | 本集动作/兵器 |

每行的前四格依次为 contact、left-foot-forward、passing、right-foot-forward；后四格依次为 anticipation、action-open、action-peak、settle。角色必须保持透明背景、统一脚底基线、比例和服装识别点。动作是儿童友好的训练/表演动作，武器和特效应作为独立透明图层，便于地图、对话和打怪环节复用。

`manifest.json` 中的 `sharedExisting` 是盘点时真实找到的旧资产；`legacy-eight-frame-only` 表示有旧 4×2 GIF/图集，但不满足新规格；`missing` 表示只有提示词或没有可用图。不要因为缺图而静默替换成悟空。

## 本章角色与缺口摘要

- `wukong`：已有四方向 walk/action PNG 与 GIF，可作为新格式验收基准。
- `subodhi`：已有四方向 walk/action PNG 与 GIF，第 3–4 集复用；需要按新 4×8 行格式重新整理或生成变体。
- `jadeemperor`、`dragonking`：已有旧 4×2 GIF；第 1、6、7 集需要四方向动作版。
- `chaosdemon`：有四方向提示词种子，但没有已验证 PNG/GIF。
- 樵夫、长臂猿、菩提弟子、龙王后、龟将军、章鱼侍从、幽冥小鬼、审判官、猴群等小角色均需要单独生成，不能把同一张悟空图复制成配角。

## 游戏使用约定

每集的 `gameplay` 给出地图入口、对话节点、是否进入安全打怪/训练环节和奖励方向。打怪使用 `defeatFx` 的“烟雾/消散”反馈，不画血、伤口或恐怖内容；战斗道具、场景和角色分开图层，后续可以直接换成本集主角或小角色。

数据依据：`prj/data/dialogue_stories/ep1.json`–`ep7.json` 与 `prj/data/storybooks/catalog.json`。本目录本轮只建立可复用清单和占位，不调用生图接口。
