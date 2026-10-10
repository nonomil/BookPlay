# Three.js 游戏特效技术调研

> 来源文章：《[Three.js 游戏特效天花板：看看这三个开源项目你就知道了](../Three.js 游戏特效天花板：看看这三个开源项目你就知道了/Three.js 游戏特效天花板：看看这三个开源项目你就知道了.md)》（柳杉前端，微信公众号）
> 三个项目均出自作者 **achrefelouafi**，同为 "角色施法"（character casting）特效，但技术路线截然不同。
> 本文件夹针对每个仓库做了源码级技术调研，并汇总三者差异。

---

## 项目总览

| 项目 | Star | 定位 | 交互入口 | 法术数量 | 一句话技术路线 |
| --- | --- | --- | --- | --- | --- |
| [AvatarCastingAbilitiesThreeJS](AvatarCastingAbilitiesThreeJS_技术调研.md) | ~133★ | 元素弯曲沙箱（火/水/土/气） | 地面**手势绘制路径**，释放后沿样条传播 | 4 元素 | 路径=弧长参数化的 `Ability` 基类 + 各类材质各自 ray-march/程序化几何 |
| [LinearAbiltyCastingThreeJS](LinearAbiltyCastingThreeJS_技术调研.md) | ~588★ | 元素沙盒（类 MOBA 技能施放） | 线性指示器 / 范围圈 / 技能槽 / 冷却 | 6 技能 | "CPU 上零维度"，全部参数每帧在 GLSL 从 `settings` 实时解析（938 滑块） |
| [SamuraiThirdPersonTemplateThreeJS](SamuraiThirdPersonTemplateThreeJS_技术调研.md) | ~47★ | 完整第三人称动作模板 | 键盘控制的完整动作角色 | 8 能力/3 近战 | 状态机 + 运动变形 + PBD 布娃娃 + 体积燃烧武士刀 + 程序化地形 |

三项目共同点：**纯 Three.js + Vite + lil-gui**，运行时依赖仅 2 个（three、lil-gui），零贴图/零精灵/零磁盘网格，特效全部代码生成，参数全部收敛进一个 `settings` 文件并在每帧被读取——这是 achrefelouafi 一以贯之的"程序化 + 可实时编辑"方法论。

---

## 技术路线对比

### 1. 交互 / 玩法范式（三者最大分歧点）

| 维度 | Avatar | Linear | Samurai |
| --- | --- | --- | --- |
| 施法输入 | 地面**画路径** → 释放沿样条传播 | 键盘切技能 + **线性指示器/范围圈**瞄准 | 键鼠控制完整**第三人称移动与出招** |
| 战斗组织 | 无技能槽/冷却 | MOBA 式**技能槽 + 冷却时间** | 近战(踢/劈/滑斩) + 3 召唤能力 |
| 附加玩法 | **行走模式**（骑乘画出的路径） | 暂停状态实时编辑 938 滑块 | 装备工作室（Tab 进入）、布娃娃死亡 |

### 2. 特效实现共性

- **GPU 粒子 / InstancedBufferGeometry**：三项目都用实例化几何做 ribbon / 参数化管道，避免逐物体 draw call（Avatar 冰晶 3 次、Linear 闪电 2 次 draw call）。
- **SDF + 噪声着色器**：体积火焰、冰晶、能量束大量使用 signed distance field 与 Perlin/噪声，纯 shader 表现。
- **"CPU 上零维度"**（Linear 最典型）：特效维度不预先烘焙，每帧在 GLSL 里从 `settings` 实时解析，故拖动滑块即时重塑性状。
- **后处理**：bloom + ACES tone mapping + grade。

### 3. 复用价值（按你的用途取舍）

- 只想看**单技能华丽 VFX**（法术/能量/爆炸）→ 看 **Linear**（588★，代码最精简聚焦，字段即参数）。
- 想要**"手势/路径驱动 + 元素多样化材质"**（火水土地各一套高级材质）→ 看 **Avatar**。
- 想要**完整动作游戏框架**（移动/出招/死亡/装备/地形）→ 看 **Samurai**。

---

## 子文档

- [AvatarCastingAbilitiesThreeJS_技术调研.md](AvatarCastingAbilitiesThreeJS_技术调研.md) — 元素弯曲沙箱：路径 Ability 基类 + 四元素材质（体积火焰/水面菲涅尔/程序化石板/螺旋风）+ 行走骑乘
- [LinearAbiltyCastingThreeJS_技术调研.md](LinearAbiltyCastingThreeJS_技术调研.md) — 元素沙盒：CPU 零维度信条 + 阶段状态机 + SDF/噪声着色器 + GPU 粒子对象池
- [SamuraiThirdPersonTemplateThreeJS_技术调研.md](SamuraiThirdPersonTemplateThreeJS_技术调研.md) — 第三人称动作模板：运动变形 + PBD 布娃娃 + 体积燃烧武士刀 + 程序化地形

> 调研日期：2026-08-19 · 方式：GitHub API 实地读取各仓库 README / package.json / 文件树 / 关键源码
