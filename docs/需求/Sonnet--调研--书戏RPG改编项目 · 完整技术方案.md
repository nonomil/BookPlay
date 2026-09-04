# 书戏RPG改编项目 · 完整技术方案

> 目标：把"书戏Bookplay"欧美原著剧本资源，改编成可玩的RPG动画对话故事。核心技术栈：GLM-5.3-Flash（生成大脑）+ ZCode（开发工作台）+ Grok/GPT/Nano Banana（生图）。架构思路参考 OpenEscordia（JSON驱动的模块化引擎）与 Narraitor（剧情检查点摘要机制）。

---

## 0. 版权前提（先看这条）

书戏的剧本是其门店付费教学内容，原著本身版权归原作者/出版社，改编剧本版权归书戏。个人练手/不公开分发没问题；一旦要发布、分享甚至小范围公开，务必：
- 优先选**进入公共领域的原著**（如福尔摩斯、爱丽丝梦游仙境、简·爱这类版权已过期的经典），自己重新写分场剧本，绕开书戏的改编版权；
- 或对书戏剧本做"提取核心冲突/人物弧光，全部原创化重写台词"的深度改编，而不是直接结构化他们的原文。

下面方案默认走"公版原著 + 自主改编"路线，这样从素材源头就没有法律风险。

---

## 1. 整体流程（五个模块）

```
① 剧情整理          ② 剧情/对话设计        ③ 关卡与地图         ④ 生图              ⑤ 集成运行
资料文档            结构化JSON             场景图/流程图        角色立绘/场景图      RPG对话故事
(书戏/公版剧本)  →  (world/character/    →  (地图节点+          →  (Grok/GPT/       →  (ZCode + GLM
                     scene/dialogue)        关卡触发条件)          Nano Banana)         5.3-Flash驱动)
```

每个模块产出的都是**结构化数据文件**（JSON为主），最后由GLM-5.3-Flash在运行时读取这些数据，只负责"填空式"生成台词和过渡叙述——而不是让AI凭空编整个故事。这是解决你之前"故事太长控制不了"问题的核心设计原则：**剧情骨架是确定性的代码/数据，AI只管血肉（对话措辞、场景描写）**。

---

## 2. 模块一：剧情资料整理

### 2.1 输入源
- 书戏门店的原著剧本（仅供个人研究改编方向，不直接复制原文）
- 公版原著全本（Project Gutenberg 等公共领域文本库）

### 2.2 整理产出：`story_outline.json`
用 GLM-5.3-Flash 辅助，把长篇原著/剧本拆解为**章节化+场景化**结构，这一步是关键的"降维"步骤：

```json
{
  "story_id": "sherlock_hound_case",
  "title": "巴斯克维尔的猎犬（改编）",
  "chapters": [
    {
      "chapter_id": "ch01",
      "title": "迷雾中的委托",
      "scenes": ["sc01_office", "sc02_moor_intro"],
      "summary_for_checkpoint": "侦探接受委托，得知家族诅咒传说。"
    }
  ]
}
```

**操作方法**：把原著/剧本文本喂给 GLM-5.3-Flash（利用它1M上下文的优势，可以一次性喂入整本书），让它输出章节列表、每章的场景切分点、人物出场表。这一步只做**提取**，不做**生成**，所以幻觉风险低，可以人工快速核对。

---

## 3. 模块二：剧情设计与对话设计（核心模块）

参考 **OpenEscordia** 的 JSON 驱动模式 + **Narraitor** 的检查点摘要机制，设计三层数据结构：

### 3.1 世界层 `world.json`（对应 Narraitor 的 World Creation）
```json
{
  "world_id": "victorian_london",
  "tone": "悬疑、阴郁、维多利亚时代",
  "rules": "禁止出现现代科技/词汇",
  "attributes": ["观察力", "胆量", "社交"]
}
```

### 3.2 场景层 `scene_{id}.json`（对应 OpenEscordia 的 environments + actions）
```json
{
  "scene_id": "sc01_office",
  "location": "贝克街221B",
  "characters_present": ["detective", "client_henry"],
  "entry_condition": "chapter == ch01",
  "dialogue_tree": "dialogue_sc01.json",
  "exits": [
    {"to_scene": "sc02_moor_intro", "condition": "player_choice == accept_case"}
  ]
}
```

### 3.3 对话树 `dialogue_sc01.json`（AI生成的落点，控制粒度最细）
```json
{
  "nodes": [
    {
      "node_id": "d01",
      "speaker": "client_henry",
      "intent": "焦急地陈述家族诅咒",
      "npc_persona_ref": "client_henry_persona.json",
      "generated_by": "GLM-5.3-Flash",
      "player_choices": [
        {"text": "冷静分析", "next": "d02a", "attribute_check": "观察力"},
        {"text": "安抚情绪", "next": "d02b"}
      ]
    }
  ]
}
```

**关键点**：`intent`字段是人工/规则预先写好的"这一句话要传达什么"，GLM-5.3-Flash 只负责把 `intent` 转成符合人设（`npc_persona_ref`）的自然语言台词。这样即使模型每次生成的用词不同，**剧情走向和信息量是完全可控的**，不会跑偏或注水。

### 3.4 长剧情控制：检查点摘要（抄 Narraitor 的设计）
每完成一个章节，自动触发一次摘要：
```json
{
  "checkpoint_after": "ch01",
  "summary_prompt": "用80字总结本章发生的关键事件和玩家的关键选择",
  "injected_into_next_chapter_context": true
}
```
下一章生成对话时，只把"摘要"塞进 GLM-5.3-Flash 的上下文，而不是把整个历史对话堆进去——这样即使故事做到第20章，prompt也不会爆炸，AI也不会因为上下文太长而"失忆"或跑题。

---

## 4. 模块三：关卡与地图

### 4.1 地图节点图 `map.json`
把场景当图节点、把exits当边，本质是一张有向图：
```json
{
  "nodes": ["sc01_office", "sc02_moor_intro", "sc03_manor"],
  "edges": [
    {"from": "sc01_office", "to": "sc02_moor_intro"},
    {"from": "sc02_moor_intro", "to": "sc03_manor", "requires_item": "old_map"}
  ]
}
```
这套结构可以直接用一个简单的Web前端（Canvas/SVG）可视化成关卡地图，玩家点击节点跳转场景。

### 4.2 关卡触发条件
用最简单的规则引擎（if-else即可，不需要复杂框架）判断玩家能否进入下一关卡：物品收集、属性检定（沿用 world.json 里定义的attributes）、关键对话选择。这部分**完全不用AI**，纯代码逻辑，保证游戏机制稳定可测试。

---

## 5. 模块四：生图流水线

### 5.1 分工建议
| 用途 | 推荐工具 | 原因 |
|---|---|---|
| 角色立绘（一致性要求高） | Nano Banana（Gemini图像模型）或 GPT图像 | 对同一角色多姿态/多表情的一致性控制较好，适合反复生成同一人物 |
| 场景背景图（单张、无需一致性） | Grok 生图 或 GPT图像 | 风格化场景图生成速度快，适合批量出图 |
| 视觉描述提示词（Prompt） | GLM-5.3-Flash | 用它的多模态理解能力，把场景/角色的文字描述转成结构化、适合喂给生图模型的英文Prompt |

### 5.2 流程
```
scene_{id}.json / character.json 里的文字描述
        ↓ (GLM-5.3-Flash 转写)
标准化生图Prompt（英文，风格锚点统一）
        ↓ (Grok / GPT / Nano Banana)
角色立绘 / 场景图
        ↓
存入 assets/{character_id}/ 或 assets/{scene_id}/，路径写回 JSON
```

### 5.3 风格一致性技巧
在 world.json 里加一个全局的 `art_style_anchor` 字段（比如"暗色调水彩、维多利亚版画风格"），每次生图Prompt都自动拼接这个锚点，避免不同场景/角色画风跑偏。

---

## 6. 技术栈与工具链

| 层级 | 工具 |
|---|---|
| 剧情提取/结构化 | GLM-5.3-Flash（长上下文，一次性处理整本原著） |
| 对话生成 | GLM-5.3-Flash（API调用，按 intent 生成台词） |
| 开发环境/流水线编排 | ZCode（脚手架代码生成、自动化脚本） |
| 生图 | Grok / GPT图像 / Nano Banana |
| 前端呈现 | 轻量 Web（Canvas/HTML对话框）或 Python 桌面/终端（参考OpenEscordia的多接口设计：终端/Discord bot/PyGame/Web，按你熟悉程度选） |
| 数据存储 | 纯JSON文件即可起步，后续可换SQLite |

> 鉴于你本身是vibecoding风格、偏好Python技术栈（跟工作中的CV/深度学习一致），建议第一版走 **Python + JSON文件** 的轻量路线，而不是照搬 Narraitor 的 Next.js 全栈架构——那套更适合已经有前端团队维护的长期产品。

---

## 7. 开发路线图

**第一阶段：单场景demo（1-2周）**
- 选一个公版短篇小说的一个场景
- 手工写 world.json + 一个 scene.json + 一个 dialogue.json
- 接入 GLM-5.3-Flash，跑通"读JSON → 生成台词 → 玩家选择 → 跳转"闭环
- 用GPT/Grok生成2-3张场景/角色图，验证生图流程

**第二阶段：完整章节（2-4周）**
- 扩展到一整个章节（3-5个场景）
- 加入检查点摘要机制，验证长剧情不跑偏
- 加入属性检定和关卡触发条件

**第三阶段：完整故事+地图可视化（视规模而定）**
- 完成整本书的场景图谱
- 做地图可视化前端
- 批量生图，建立素材库

---

## 8. 一句话总结

用**确定性的JSON剧情骨架**（世界规则、场景图、对话树、检查点摘要）控制"故事往哪走"，只让 **GLM-5.3-Flash 负责"怎么说"**（台词措辞、场景描写、生图Prompt），生图工具负责视觉呈现，ZCode 负责把这套流水线的开发/自动化脚手架搭起来。这样从架构上就规避了"AI自由生成导致故事失控"的老问题。