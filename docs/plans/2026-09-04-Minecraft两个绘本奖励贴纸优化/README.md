# 《我的世界》前两本绘本：故事奖励与贴纸墙优化计划

> 日期：2026-09-04  
> 范围：`series=minecraft` 的第 1、2 本绘本  
> 目标年龄：7 岁一年级  
> 状态：本轮落地（第 1、2 本）；第 3–5 本沿用同一数据合同，暂不发放未审核奖励

## 1. 结论

当前 Minecraft 奖励目录只覆盖第 1 本的 3 个大件，贴纸页和伙伴页又把数据写死为西游，导致孩子从 Minecraft 绘本完成后看不到自己的故事收藏。本轮把“故事里看见什么，就收下什么”做成两本书可用的闭环：

```text
读完一本 + 通过巩固
  ├─ 自动收入 1 张本书故事贴纸（真实绘本场景）
  ├─ 从本书 3 件纪念物中选 1 件（装饰 / 动物 / 装备）
  └─ 进入 Minecraft 小屋，点击物件看轻互动
```

贴纸卡片全部可见、未解锁仍可点击预览大图、故事出处和动态说明；解锁只发生在完成对应绘本巩固后。奖励不增加学习数值、不设置金币消费、不让孩子因为漏学而失去永久物品。

## 2. 两本绘本的真实故事元素表

| 本 | 故事标题 | 适合作为奖励的元素 | 绑定页 | 奖励表达 |
|---|---|---|---:|---|
| 1 | 逃出下界 / *Escape from the Nether!* | 金头盔、Byte 狼、紫色下界传送门 | 1、2、3–4 | 装备、动物、场景装饰 |
| 2 | 主世界的生物 / *Mobs in the Overworld!* | 蜂巢、打喷嚏的小熊猫、Ink 黑马 | 4、8、13–15 | 装饰、动物、伙伴坐骑 |

选择依据：元素在原书插图和英文句子中都能找到，且对 7 岁儿童是“发现与照顾”的正向收藏。僵尸、骷髅、苦力怕、女巫等只保留在故事原图中，不作为可购买/战斗奖励，不生成血腥或攻击性新图。

## 3. 交互与信息架构

### 3.1 页面

- `companion.html?series=minecraft`：方块伙伴页，展示 Byte 成长、学习日记、入口卡片。
- `stickers.html?series=minecraft`：两本绘本地图；一页两个大卡片，点击进入本书详情。
- `stickers.html?series=minecraft&chapter=1/2`：本书场景封面 + 3 张大卡片。
- `room.html?series=minecraft`：下界小屋；已选纪念物按固定槽位摆放，点击有轻互动。
- `medals.html?series=minecraft`：3 枚长期勋章：第一块方块、下界侦察员、方块远征完成。

### 3.2 儿童界面规则

- 首屏最多两个书卡，图片优先，标题和进度各一行；不堆长说明。
- 卡片状态只表达“已贴上 / 等你发现”，不使用失败、扣分或倒计时。
- 未解锁卡片保留彩色故事图和锁标记；点击后显示“完成第 N 本绘本巩固即可收入”。
- 详情弹窗固定展示：大图、中文名、英文名、故事页码、故事元素类型、动态预览、获得条件。
- GPT 生成图只做透明小物件时必须带页码和故事动作；本轮优先使用真实绘本页裁切图，避免提示词漂移。

## 4. 数据合同

`prj/data/rewards/storybooks.json` 的 `minecraft` 目录升级为：

- `sticker_count: 2`，`story_image_template: assets/generated/storybooks/minecraft-story-scenes-v1/book{episode}.jpg`。
- `sticker_themes` 两个主题分别对应第 1、2 本，主题封面和详情图使用对应封面或真实场景缩略图。
- 每本 `episodes[N].items` 有 3 件纪念物；每件必须有 `story_binding.storybook_pages`、`scene_ids`、`trigger_terms`、`source_label_zh/en`。
- `non_power: true`；物件只写入 `inventory` 和 `room.minecraft` 的固定槽位。

奖励状态继续使用 `bookplay_storybook_rewards_v1.minecraft` 命名空间，和西游进度隔离。第 3–5 本没有本轮奖励配置时，不会被错误地循环发放第 1 本物件。

## 5. 资产策略

### 本轮

从既有 `content/assets/minecraft/.../pages/pNN.webp` 生成文字尽量少、画面占比高的 4:3 JPEG 缩略图，复制到 `content/assets/generated/storybooks/minecraft-story-scenes-v1/` 和 `prj/data/assets/generated/storybooks/minecraft-story-scenes-v1/`。这些图是故事事实锚点，不调用外部 API，不把随机装备、怪物或文字叠到角色脸上。

### 后续 GPT 透明素材

若后续要重生图，提示词必须包含：绘本编号、页码、人物、地点、动作、单个物件和 `avoid` 清单（无额外生物、无随机武器、无文字/水印、无恐怖血腥）。生成后继续经过透明通道、绿边、尺寸和儿童安全审查；生成失败时回退真实页图，不阻塞贴纸墙。

## 6. 验收矩阵

- `stickers.html?series=minecraft` 只显示两张绘本卡，不出现西游标题或 108 集计数。
- 详情页每本显示 3 个绑定物件；卡片可点击，锁定卡片也能打开大图和说明。
- `storybook.html?series=minecraft&book=1/2&ui=unified-v3` 通过巩固后只发对应本的贴纸和三选一大件，重复进入不重复发放。
- 房间读取 `room.minecraft`，背景存在，物件进入固定槽位；点击物件显示轻互动文案。
- 第 3–5 本完成不会凭空得到第 1/2 本物件；目录仍可正常打开。
- 页面没有横向溢出；手机/桌面卡片图片优先；减少动效时不强制浮动动画。

## 7. 执行任务

| 任务 | 文件 | 结果 |
|---|---|---|
| T01 故事元素与资产锚点 | `tasks/T01-故事元素与缩略图.md` | 6 个纪念物的页码、场景 ID、缩略图和提示词审查记录 |
| T02 奖励目录与伙伴页 | `tasks/T02-奖励目录与Minecraft伙伴.md` | 两本奖励、Minecraft 勋章、Byte 伙伴与命名空间 |
| T03 贴纸墙与小屋页面 | `tasks/T03-贴纸墙详情与房间.md` | `series=minecraft` 动态页面、锁定预览、大图详情、房间 |
| T04 回归与发布检查 | `tasks/T04-验证与打包.md` | Node/Python 测试、浏览器抽样、Android 数据包路径 |

## 8. 停止条件

- 任何奖励无法在指定页和句子中找到出处。
- 资产出现混合故事、随机武器、恐怖/血腥表达或文字乱码。
- 目录状态跨系列串写，或旧西游存档被覆盖。
- 书 3–5 尚未完成同等审查时，不能宣称五本全部完成。

