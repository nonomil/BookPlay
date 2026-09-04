# 书戏RPG改编项目 · 调研资料（交叉核实版）

> 调研时间：2026-08-28。本文档是对 `Sonnet--分析讨论.md`、`Sonnet--调研--书戏RPG改编项目 · 完整技术方案.md`、`DS--调研资料2--交互.md` 三份材料中全部事实性内容的**独立联网核实与补充**，并新增交互呈现层、语音流水线、故事素材版权三个维度的调研。
>
> **标注规则**：✅=已核实为真（附来源）；⚠️=部分属实/未证实；❌=查无实据；【推断】=基于来源的判断，非来源原文；【建议】=我的建议。
>
> **工具说明**：本机 Tavily/Firecrawl 调研链路因代理环境 TLS 阻断不可用（技能文档允许的降级路径），本次改用内置联网检索完成，来源 URL 均可直接打开复核。

---

## 1. 一图速览：三份文档中所有项目的核实结论

| 项目/事实 | 出处 | 结论 | 用途定位 |
|---|---|---|---|
| GLM-5.3-Flash（320B-A18B/1M上下文/MIT） | Sonnet分析 ✅ | ✅ 官方确认 | 生成大脑 |
| ZCode（智谱官方编程工具） | Sonnet分析 ✅ | ✅ 官方确认 | 开发工作台 |
| 书戏Bookplay=英文原著桌游教育品牌 | Sonnet分析 ✅ | ✅ 官网确认 | 素材来源（注意版权） |
| Narraitor | Sonnet分析 ✅ | ✅ 复核属实 | 参考架构（检查点摘要） |
| OpenPythonRPG / OpenEscordia | Sonnet分析 ✅ | ✅ 复核属实 | 参考架构（JSON驱动） |
| VirtualGameMaster | Sonnet分析 ✅ | ✅ 复核属实 | 参考架构（LLM当GM） |
| FreeKill（新月杀） | Sonnet分析 ✅ | ✅ 真实但仅限卡牌对战 | 不适用本需求 |
| AetherNPC / Fugue / Shinsekai / RpgAi / Micro RPG Engine / AI-RPG-Engine | Sonnet分析 ❌ | ❌ 维持辟谣结论 | 不可引用 |
| EasyVN（轻量TS视觉小说引擎） | DS交互 ✅ | ✅ 核实为真 | **呈现层候选** |
| NarraLeaf-React（React视觉小说框架） | DS交互 ✅ | ✅ 核实为真 | **呈现层候选** |
| Small Tales Story Builder（"Svelte+Supabase开源"） | DS交互 ⚠️ | ⚠️ 平台存在，开源属性未证实 | 仅作产品形态参考 |
| AI-storybook-maker（Kivy桌面应用） | DS交互 ❌ | ❌ 查无此仓库 | 有同类真实项目替代 |
| Interactive AI Storyteller（STT+TTS） | DS交互 ❌ | ❌ 查无此仓库 | 有同类真实项目替代 |
| Little Fox《西游记》108集 | DS交互 ✅ | ✅ 核实为真，**注意素材版权** | 素材方法论参考 |

**结论**：Sonnet 的两轮辟谣是有效的；DS 交互记录中又混入 2 个查无实据的项目（AI-storybook-maker、Interactive AI Storyteller）和 1 个存疑项目（Small Tales 的开源描述）。**引用任何 AI 列举的开源项目前，先在本表核对。**

---

## 2. 技术底座核实

### 2.1 GLM-5.3-Flash ✅

智谱 2026-08-26 上线并开源，官方发布页与开放文档均已核实：

- **架构**：MoE，总参数 320B / 激活 18B（A18B）；首个采用**稀疏注意力+线性注意力混合架构**的开源前沿模型；GLM-5 系列首个**原生多模态**
- **上下文**：1M token 输入，最大输出 128K
- **多模态输入**：文本、图片、视频、文件
- **开源协议**：MIT（权重可下载）
- **API**：Model Code 为 `glm-5.3-flash`；价格约为 GLM-5.3 的 1/10（发布时有限时五折），第三方评测称约为 Opus 4.8 的 1/40
- **获取渠道**：开放平台 API、HuggingFace 权重、GLM Coding Plan、ZCode、chat.z.ai 同步就位
- **对本项目的意义**【推断】：1M 上下文可整本喂入公版原著做章节/场景切分（技术方案模块一成立）；原生多模态可直读绘本/剧本截图辅助结构化；单价极低使"每个对话节点实时调 API 生成台词"成本可忽略

来源：[S1] 智谱官方发布 https://www.zhipuai.cn/zh/research/163 ；[S2] 开放平台文档 https://docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash ；[S3] 规格汇总 https://notes.kamacoder.com/llm/news/glm-5-3-flash.html ；[S4] https://www.datalearner.com/ai-models/pretrained-models/glm-5-3-flash

### 2.2 ZCode ✅

智谱官方编程工具（非第三方适配层），随 GLM-5.3-Flash 同批接入，订阅 GLM Coding Plan 开箱即用。官网 [S5] https://zcode.z.ai/cn 。用于本项目：脚手架生成、JSON schema 校验脚本、生图/TTS 批量流水线编排。

---

## 3. 产品原型核实：书戏Bookplay ✅

- 主体：**深圳书戏科技**，官网 www.bookplay.com.cn [S6]
- 定位：少儿英语教育品牌，以**英文原著 + 卡牌桌游**为载体（"让孩子每天在家自学1小时以上"），采取**加盟代理模式，已有约 50 家代理门店**
- 产品线：英文原著桌游产品体系 + 学员自学软件「单词争霸」App（学生端，Android）[S7]
- ⚠️ **同名陷阱**：Google Play 上的 "Bookplay" 应用是巴西 Mundal 出版社的阅读 App（6000+图书），与深圳书戏无关，检索时注意区分 [S8]
- 【推断】门店形态是"桌游+剧本演绎"而非线上产品，因此其剧本（角色对话+场景描述）天然适合改造成对话驱动型数字产品——这与 DS 交互记录中"像有声绘本"的观察一致：**素材本质就是角色扮演对话剧本，做成互动视觉小说是顺势而为，硬套动作RPG是逆势**。

---

## 4. 故事素材评估与版权红线

### 4.1 Little Fox《西游记》（Journey to the West）✅

- 事实：Little Fox 是英语分级动画读物品牌，其《西游记》系列共 **108 集**，难度 **Level 5**，每集约 5-6 分钟，官方 YouTube 频道提供全集播放；官方站有配套读者/音频/生词资源 [S9] https://www.littlefox.com/en/readers/contents_list_v2/FS0078 ；[S10] 官方播放列表 https://www.youtube.com/playlist?list=PLTYeDakuqA3_Lyt0jogwdJMpgR9Dbaf0k
- 优点【推断】：分集结构天然模块化（每集=一个场景单元），故事家喻户晓，是验证"章节化+检查点"架构的好载体
- **版权红线（重要）**：
  - ✅ 可用：《西游记》小说原著（吴承恩，明代）已进入公共领域，其情节、人物、对话可自由改编
  - ❌ 不可用：Little Fox 的**英文简写脚本、插画、音频、动画**是其商业版权资产（Level 5 分级读物是其付费产品）。B站/网盘流传的"108集资源包"均为未授权传播，**官方 YouTube 可观看 ≠ 可再利用**。直接拿它的分集脚本做结构化输入，等于复制其演绎作品
  - ✅ 合规做法：**借鉴方法论不复制内容**——参考其"108集×5分钟×每集一完整事件"的分集颗粒度设计，从公版原著自行做英文简写与分场，台词全部自写/自生成
- 该结论与 Sonnet 技术方案的"公版原著+自主改编"路线完全一致，适用于一切候选素材（书戏剧本同理）

### 4.2 公版文本源

- Project Gutenberg（gutenberg.org）：公版英文原著标准来源；福尔摩斯、爱丽丝、简·爱、格林童话等均可自由改编（Sonnet 方案已提及，此处确认其仍为首选）【常识性事实，未单独检索】
- 【建议】若目标是"英语学习+中文用户"，公版库中改编难度低、对话密度高的首选：**福尔摩斯短篇**（悬疑结构天然适合分支对话）、**格林/安徒生童话**（篇幅短、词汇简单）、**西游记原著**（无版权障碍、分集方法论可参照 Little Fox）

---

## 5. 开源项目分档清单（全部经核实）

### 5.1 叙事逻辑层参考（怎么组织故事）

| 项目 | 状态 | 核实要点 | 可借鉴点 |
|---|---|---|---|
| **Narraitor** [S11] github.com/jerseycheese/Narraitor | ✅ 活跃 | "world-agnostic narrative-driven RPG"：自建世界→建角色→AI叙事；Next.js+TS+Zustand+IndexedDB | 检查点摘要（Story Checkpoint）、决策权重分级 |
| **OpenPythonRPG**（OpenEscordia）[S12] github.com/rodmarkun/OpenPythonRPG | ✅ 早期WIP | JSON定义 actions/environments/entities + AI叙事集成，Python | JSON驱动模式；轻量易改 |
| **VirtualGameMaster** [S13] github.com/Maximilian-Winter/VirtualGameMaster | ✅ 真实 | LLM当GM，支持本地LLM+API，FastAPI后端，Python3.7+/Node | "GM只做解释器"的prompt工程思路 |
| NarrativeEngine-P [S14] github.com/Sagesheep/NarrativeEngine-P | ✅（本次新增发现） | 自托管TTRPG引擎，跨场次持久记忆、NPC独立状态 | 长线战役的记忆管理 |
| FreeKill github.com/Qsgs-Fans/FreeKill | ✅ 但不适用 | Qt+Lua卡牌对战引擎（三国杀类） | 无叙事分支能力，仅当规则引擎参考 |

### 5.2 交互呈现层候选（怎么呈现给玩家）——本次重点核实

| 项目 | 状态 | 核实要点 | 适用性 |
|---|---|---|---|
| **EasyVN** [S15] github.com/Eshan276/easyvn | ✅ | 轻量、模块化、TypeScript 浏览器视觉小说引擎；支持简单脚本、分支路径、富对话；作者有 dev.to 构建记与 Reddit 发布帖 | **首选demo**：体量小、纯浏览器运行 |
| **NarraLeaf-React** [S16] github.com/NarraLeaf/narraleaf-react | ✅ | 轻量前端视觉小说播放器，UI高度可定制；官方文档 react.narraleaf.com；同组织另有跨平台桌面版 NarraLeaf | React 熟练者首选；定制自由度高 |
| Pixi'VN [S17] github.com/DRincs-Productions/pixi-vn | ✅（本次新增发现） | JS/TS + PixiJS 的叙事引擎，2D渲染能力强 | 需要"立绘动起来/场景特效"时升级用 |
| react-visual-novel [S18] github.com/utilfirst/react-visual-novel | ✅（本次新增发现） | React+Tailwind+Framer Motion+howler.js | 轻量备选，动画与音频集成现成 |
| **Twine** [S19] twinery.org | ✅ | 老牌开源非线性互动叙事工具，无需代码 | 用于**手工编排/校验剧情分支**（设计师工具，不是运行时） |
| **Ink** [S20] inklestudios.com/ink + github.com/inkle/ink | ✅ | inkle 工作室开源叙事脚本语言，《80 Days》《Heaven's Vault》同款；可集成 Unity/Ren'Py | 工业级分支脚本格式；若嫌自造JSON schema麻烦，可直接采用ink格式 |
| Small Tales Story Builder [S21] smalltales.online | ⚠️ | 平台真实存在（交互式绘本创作工具），但 **"Svelte+Supabase开源"描述未找到对应仓库**，按闭源产品对待 | 仅作产品形态/功能清单参考 |

### 5.3 AI 故事生成同类（工作流参考，非直接依赖）

- ✅ jaketae/storyteller [S22] github.com/jaketae/storyteller：SD+GPT+神经TTS 生成"带旁白动画短片"，工作流与本项目"文本→图→音"最接近
- ✅ StorybookGenerator（kcthedev）、naakaarafr/Storybook-Generator（5-agent流水线）等一批真实 AI 绘本生成器 [S23] github.com/topics/ai-storybook
- ✅ **Gemini Storybook**（Google 官方功能）：10页图文+朗读自动生成 [S24] gemini.google/overview/storybook/ ——竞品基线：说明"AI绘本"已是平台级标配能力，本项目差异化必须落在**分支交互+英语学习闭环**上【推断】
- ❌ DS记录中的 "AI-storybook-maker"（Kivy）与 "Interactive AI Storyteller"（STT+TTS）：**查无此仓库**；语音交互需求可参考 VocalTales 思路（Whisper STT→故事→TTS）[S25] medium.com/@tszumowski/vocaltales… 或直接用 §6.2 的 TTS 方案

---

## 6. 生图与语音流水线核实

### 6.1 生图：角色一致性 ✅

- **Nano Banana（gemini-2.5-flash-image）**：Google 官方文档确认三大能力——**多图融合、角色一致性（character consistency for rich storytelling）、定向变换**；支持最多 3 张参考图输入 [S26] https://ai.google.dev/gemini-api/docs/image-generation ；官方博客明确将其定位为"故事叙述的角色一致性"工具 [S27] developers.googleblog.com/introducing-gemini-2-5-flash-image/
- 新一代 **gemini-3-pro-image（Nano Banana Pro）**：5 张高保真参考图、最多 14 图 [S26]
- 【建议】角色立绘流程：每角色生成 1 张"设定基准图"→ 后续所有姿态/表情用"基准图作参考图+文字指令"生成，一致性显著优于纯文字 prompt；配合 Sonnet 方案的 `art_style_anchor` 全局风格锚点

### 6.2 语音/TTS（英语学习场景关键补强）

| 方案 | 状态 | 核实要点 | 适用性 |
|---|---|---|---|
| **IndexTTS**（B站开源）[S28] github.com/index-tts/index-tts | ✅ | 零样本音色克隆（一段参考音频）；IndexTTS-2.5 支持中/英/日/西/阿 + **细粒度情感控制**；社区已有基于它的开源多角色多情绪配音平台 | **首选**：多角色+情感，英文支持确认 |
| **CosyVoice**（阿里） | ✅ | 中/英/日/粤/韩五语，指令控制情感风格，跨语言生成 | 多语言备选 |
| **GPT-SoVITS** | ✅ | 1分钟数据微调，中文效果最佳，V4版 | 需要自定义老师音色时用 |
| 云端API（Edge TTS免费/Azure/ElevenLabs） | 常识 | Edge TTS 免费但情感平；ElevenLabs 表现力最强但按量付费 | demo期用 Edge TTS 零成本起步【建议】 |

【推断】对"英文对话故事"，TTS 不是锦上添花而是核心学习功能（跟读、点击发声），DS 交互记录中"点击发声：点击文字高亮并播放对应角色配音"应升级为 P0 交互；技术上每句台词文本→TTS 音频文件预生成并挂到对话节点 JSON 上，运行时零延迟。

---

## 7. 交互定位：从"有声绘本"到"交互RPG"的连续谱

DS 交互记录回答了"像绘本怎么办"的疑虑，本次核实后可以给出更明确的定位结论：

**技术连续谱**（左=纯观看，右=硬核RPG）：

```
有声绘本 → 交互绘本 → 视觉小说(VN) → 带数值/物品的VN → 探索解谜 → 地图移动RPG → 动作RPG
  AI全擅长 ←———————————————— AI+规则混合 ————————————————→ 传统游戏逻辑为主
```

- 【核实+推断】现有所有 AI 叙事开源项目（Narraitor/OpenPythonRPG/VirtualGameMaster/EasyVN/NarraLeaf）全部落在**左半区到中部**——验证了 DS 的判断：AI 擅长文本叙事与视觉联想，不擅长实时物理逻辑
- 【建议】书戏素材（对话剧本）+ 目标用户（英语学习者）+ AI 技术特性三者对齐的最优落点：**"带数值与收集的视觉小说"（谱系中间偏左）**：
  - P0（demo必须有）：对话分支选择、检查点摘要、点击发声（TTS）、立绘表情切换
  - P1（第二章加）：属性检定（观察力/胆量——Sonnet world.json 已定义）、物品收集解锁分支、章节末知识问答（答对解锁下一章，自然承接"单词争霸"的学习闭环）
  - P2（验证成功后）：场景点击探索（热点图）、语音输入选择（STT）、地图节点可视化（Sonnet map.json 已设计）
  - 明确**不做**：实时移动/碰撞/战斗——投入产出比最低且与素材形态不匹配
- 交互细节库可直接沿用 DS 交互记录 §"可以怎么交互"的清单（对话选择/行为选择/点击探索/解谜/点击发声/视觉反馈），该清单与上述谱系兼容，无需修改

---

## 8. 综合落地组合（在 Sonnet 技术方案基础上的修正与补充）

Sonnet 技术方案（JSON确定性骨架+GLM填空+检查点）**经核实全部成立**，仅做三处修正/补充：

1. **呈现层选型明确化**【修正】：方案中"Canvas/HTML对话框或PyGame"太粗。核实后推荐：
   - 路线A（推荐起步）：**EasyVN**——轻量TS，浏览器即开即玩，便于给书戏门店/家长演示
   - 路线B（要长期做产品）：**NarraLeaf-React**——可定制性+官方文档+跨桌面打包
   - 剧情分支格式若不想自造 schema：直接用 **Ink 格式**（工业验证过），或保持自造 JSON 但用 **Twine 做人工编排校验工具**
2. **语音层补齐**【补充】：IndexTTS-2.5（多角色多情绪，本地）或 Edge TTS（零成本）预生成台词音频挂入 dialogue JSON 节点；"点击发声"为 P0
3. **素材红线执行**【强调】：无论选 Little Fox 式分集还是书戏剧本，一律"公版原著/原创台词 + 借鉴分集方法论"，不复制任何受版权保护的脚本/插画/音频

**修正后的五模块流水线**：剧情整理(GLM 1M上下文切分公版原著) → 对话设计(intent+persona JSON) → 关卡地图(纯代码规则) → 生图+TTS(Nano Banana基准图法 + IndexTTS) → 集成运行(EasyVN/NarraLeaf + GLM API 实时填词)

---

## 9. 来源清单

| 编号 | 来源 | 用途 |
|---|---|---|
| S1 | https://www.zhipuai.cn/zh/research/163 | GLM-5.3-Flash 官方发布 |
| S2 | https://docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash | GLM-5.3-Flash 官方文档 |
| S3 | https://notes.kamacoder.com/llm/news/glm-5-3-flash.html | 规格汇总 |
| S4 | https://www.datalearner.com/ai-models/pretrained-models/glm-5-3-flash | 参数/价格 |
| S5 | https://zcode.z.ai/cn | ZCode 官网 |
| S6 | http://www.bookplay.com.cn/ | 书戏官网 |
| S7 | http://www.bookplay.com.cn/Web/product/ | 书戏产品页 |
| S8 | https://play.google.com/store/apps/details?id=air.com.mundialeditora.bookplay | 同名App辨析（无关） |
| S9 | https://www.littlefox.com/en/readers/contents_list_v2/FS0078 | Little Fox 官方目录 |
| S10 | https://www.youtube.com/playlist?list=PLTYeDakuqA3_Lyt0jogwdJMpgR9Dbaf0k | Little Fox 官方频道 |
| S11 | https://github.com/jerseycheese/Narraitor | Narraitor |
| S12 | https://github.com/rodmarkun/OpenPythonRPG | OpenPythonRPG |
| S13 | https://github.com/Maximilian-Winter/VirtualGameMaster | VirtualGameMaster |
| S14 | https://github.com/Sagesheep/NarrativeEngine-P | NarrativeEngine-P（新增） |
| S15 | https://github.com/Eshan276/easyvn | EasyVN |
| S16 | https://github.com/NarraLeaf/narraleaf-react | NarraLeaf-React |
| S17 | https://github.com/DRincs-Productions/pixi-vn | Pixi'VN（新增） |
| S18 | https://github.com/utilfirst/react-visual-novel | react-visual-novel（新增） |
| S19 | https://twinery.org/ | Twine |
| S20 | https://www.inklestudios.com/ink/ | Ink |
| S21 | https://smalltales.online/ | Small Tales（开源属性未证实） |
| S22 | https://github.com/jaketae/storyteller | 多模态storyteller |
| S23 | https://github.com/topics/ai-storybook | AI绘本项目族 |
| S24 | https://gemini.google/overview/storybook/ | Gemini Storybook 竞品基线 |
| S25 | https://medium.com/@tszumowski/vocaltales-an-interactive-all-audio-interactive-ai-childrens-storyteller-f796fc715dcb | VocalTales 语音交互参考 |
| S26 | https://ai.google.dev/gemini-api/docs/image-generation | Nano Banana 官方文档 |
| S27 | https://developers.googleblog.com/introducing-gemini-2-5-flash-image/ | 角色一致性官方博客 |
| S28 | https://github.com/index-tts/index-tts | IndexTTS |

> 未单独检索的常识性条目（Project Gutenberg、Ren'Py、Edge TTS）已标注，使用前可顺手复核官方站点（gutenberg.org / renpy.org）。
