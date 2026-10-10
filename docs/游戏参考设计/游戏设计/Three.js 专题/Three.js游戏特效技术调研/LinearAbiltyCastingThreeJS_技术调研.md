# LinearAbiltyCastingThreeJS 调研笔记

> 仓库：`achrefelouafi/LinearAbiltyCastingThreeJS`（GitHub）
> 项目名：**Elemental Sandbox**（元素沙盒），Three.js 游戏特效系列作品
> 定位：一个**纯程序化（fully procedural）技能施放 VFX 沙盒**，带 MOBA 风格地面瞄准指示器
> 本调研聚焦技术路线与方法，不逐文件展开。

---

## 一、项目概况

| 维度 | 内容 |
| --- | --- |
| 编程语言 | JavaScript（ES Modules，`"type": "module"`），GLSL 着色器 |
| Star / Fork | 约 588★ / 121 forks（调研时点） |
| 许可证 | MIT |
| 引擎 | Three.js `^0.185.1` |
| 构建 | Vite `^8.1.5`（dev / build / preview） |
| 其它依赖 | lil-gui `^0.21.0`（实时 VFX 编辑器面板） |
| 创建/更新 | 2026-08 创建，活跃 |

### 一句话定位
用 Three.js + 手写 GLSL，把约 6 个"法术"（Frost Lance / Storm Lance / Cinder Fall / Nova Beam / Voltaic Snare 等）做成**零贴图、零精灵表、零磁盘网格**的完全程序化特效，并且**所有参数都是实时滑块（938 个），可在暂停状态下编辑**。

---

## 二、交互方式

**键盘 + 鼠标**，参数键绑定：

| 输入 | 动作 |
| --- | --- |
| Q/E/R/F（或 1–4） | 武装 Frost Lance / Storm Lance / Cinder Fall / Nova Beam（线性击发） |
| V（或 5） | 武装 Voltaic Snare（**远程/区域瞄准**，用圆圈指示） |
| 移动鼠标 | 挥动地面瞄准箭头 / 移动远投圆圈 |
| 左键点击 | 施放 |
| Esc / 右键 | 取消已武装的施法 |
| G | 显示/隐藏 VFX 编辑器 |
| P | 暂停/继续（**编辑器在暂停时仍生效**） |
| C | 清除所有活动特效 |
| H | 隐藏控制面板 |

瞄准逻辑：`AimController` **每帧**（而非仅鼠标移动时）把指针 raycast 到地面平面，夹紧到各技能的 `[minRange, range]`，发射单个 `cast` 事件（origin + 方向 + 距离）。两种指示器（线条箭头 / 远投圆圈）只在一个字段上分歧：`ELEMENT_META[element].cast` 为 `CastShape.LINE` 或 `CastShape.ZONE`，其余武装/夹紧/校验/发射逻辑完全共享。

---

## 三、目录结构（src 一级）

```
src/
  abilities/      能力基类 Ability.js + AbilityManager + 6 个具体技能(Ice/Thunder/Meteor/Beam/Snare/Glacier) + 对象池
  animation/      FBX 角色加载、AnimationMixer、施法动画、程序化施法前扑
  assets/         程序化晶体/小行星几何、闪电 ribbon 条带、光束参数化管道
  config/         settings.js —— 全部可调参数的唯一数据源
  core/           App / Renderer / CameraRig / Time / Layers / 共享帧 uniform
  effects/        瞄准箭头、远投圆、地面 decal、裂隙、爆炸、光池、震屏、闪屏
  input/          InputManager + AimController
  loaders/        AssetLoader + 共享 LoadingManager
  materials/      Ice / Lightning / Meteor / VolumetricFire / Beam / Snare 材质
  particles/      GPU 粒子系统 + 引擎 + 速率发射器
  postprocessing/ Composer 管线、调色着色器、畸变着色器
  shaders/lib/    共享 GLSL：噪声库、通用工具
  ui/             HUD、lil-gui 编辑器、预设管理、样式
  utils/          数学、颜色缓存、对象池、释放、shader 补丁
  world/          环境(舞台光照)、地面、尘埃、接触阴影
  archive/        已退役的四元素沙盒(可挖取 raymarch 火焰/水面)
```

顶层另有 `index.html`、`vite.config.js`、`package.json`、若干参考图（icecast.jpg 等）。

---

## 四、关键技术文件精读

### 1. `src/main.js` —— 入口（约 25 行）
极简。创建 `App(canvas)`，`await app.load()`，把 `window.app` 暴露给控制台以便调试。异常时用 `LoadingScreen.fail()` 报错。核心全在 `core/App.js`。

### 2. `src/abilities/Ability.js` —— 线性技能基类（核心抽象）
这是整个系统的抽象骨架。要点：

- **阶段状态机**：`IDLE → TRAVEL → IMPACT → FADE → DONE`（`AbilityPhase` 常量冻结对象）。
- **前进前锋（front）**：沿直线以恒定米/秒前进，帧率无关，且从静止**缓出**（`Easing.outQuad`，基于 elapsed 而非进度，否则第一步会乘零卡住）。
- **局部坐标系**：每个特效通过 `direction`、`side = direction × up` 定位自己。
- **动态光记账**：包括衰减的冲击光增强（`lightBoost`）、按技能可覆盖的光闪烁函数 `lightShimmer()`。
- **对象池契约**：`spawn` 必须完全重置状态、`destroy` 必须释放、二者都不得分配内存。
- **子类钩子**：`createShaders` / `createParticles` / `onSpawn` / `onTravel` / `onImpact` / `onFade` / `onDestroy`。
- **扩展成本**：新增一个技能 = 一个新文件 + 一个 settings 块，其余项目零改动。README 明确说"第二个能力只需一个文件加一个 settings 块"。

**Phase machine 的 update 循环**：TRAVEL 阶段调用 `advance(dt)` 前锋到位触发 IMPACT（一次），IMPACT 后进入 FADE，FADE 结束置 DONE。

### 3. `src/particles/ParticleSystem.js` —— GPU 实例化粒子系统
- 基于 `InstancedBufferGeometry` 的 GPU 模拟：**运动（速度、重力、解析拖曳、curl 湍流、涡旋）、大小曲线、颜色渐变、透明度淡出**全部在 shader 里由 per-instance attribute 计算。
- CPU 只写 spawn 数据，且只上传变化的槽位。
- **环形缓冲**：发射超出容量回收最旧槽位 = 原生对象池，可容忍狂按技能。
- 剪影**完全程序化**（无精灵贴图）：`SOFT / SMOKE / STREAK / LEAF / CHIP / RING` 六种。
- 每例子系统的 per-particle 属性：start/origin/velocity/color/spawn/life/size/seed/spin。

### 4. `src/core/App.js` —— 应用根与帧循环
- **单向装配**：App 构建各系统，向 ability manager 注入共享服务 context 对象，之后只做逐帧排序更新；**没有任何子系统反向访问 App**。
- 共享 VFX 服务：`ParticleEngine`、`LightPool`、`DecalSystem`、`FissureSystem`、`BurstSystem`、`CameraShake`、`ScreenFlash`。
- 交互单循环：选技能→武装→鼠标挥箭头→点击发射；`AimController` 负责瞄准并发出 cast 事件，App 把它变成技能 + 角色朝向 + 冷却。
- 每技能独立的冷却 Map（`cooldowns`，按元素），花掉一个槽不会锁死其它。

### 5. `src/config/settings.js` —— 唯一数据源 / "实时编辑"的法门
- **所有可调值唯一归宿**：shader、粒子、灯光、后处理每帧**读取**这些对象，因此改滑块无需重建。
- 关键规则：**系统只能采样，不得在 spawn 时把值拷进记录再回头读**。`IceAbility` 的 spike 记录只存**无单位骰子结果**（沿线位置分数、侧向分数、几个无单位抖动），不存米/弧度/秒；每个维度在 update 循环里实时对照 `settings.ice` 解析——这是"暂停时编辑仍生效"的根本原因。
- 颜色存为 `#rrggbb` 字符串，以便 lil-gui 直接绑定。
- `global` 存放全局乘数（timeScale/speed/lifetime/glow/干扰/粒子等）。
- 每能力块（ice/thunder/meteor/beam…）存绝对值；共享系统只依赖 `range`/`minRange`/`speed`/`cooldown` 四个字段，远投再加 `zoneRadius`。

---

## 五、方法总结：它如何做"技能释放/法术施放"特效

### 5.1 三个核心技术信条

1. **完全没有外部美术资产**——无纹理、无精灵表、无磁盘上的网格（除角色的 FBX + diffuse.png + HDR 环境探针）。所有视觉 100% 来自代码生成：程序化几何、vertex shader 放置的 ribbon、SDF/噪声着色器、GPU 粒子。

2. **"CPU 上零维度"（no dimensions on the CPU）**——这是全项目最核心的规则。每个特效的形态参数（长度、宽度、分形、抖动）**不**在 CPU 端记录成固定值，而是在每帧的 shader 里从 `settings` 实时解析。
   - 闪电：一个 `InstancedBufferGeometry`（顶点只带 `(t, side)` 参数坐标），材质每帧把参数对转为世界坐标 → 一组条带服务任意长度/形状/宽度的闪电，且 `strands`（丝数）几乎免费。
   - 光束：ribbon 扩展成参数化管道（顶点带 `(t, a)`），三次绘制（halo/sheath/core）加权模拟体积积分。
   - 冰晶：spike 记录只存无单位骰子；四个"形状"参数（facets/taper/roughness/bend）无法表达为 per-instance 变换，则在 `_syncGeometry` 里哈希并重建三个晶体网格（六面晶体仅 60 三角形，重建便宜）。
   - **收益**：拖 `height` 重新长高已站立的冰面；拖 `jitter` 重新扭结已飞行的闪电。暂停（P）时所有滑块仍实时生效——这是"编辑即反馈"的核心。

3. **一切皆对象池 + 少量 draw call**——特效、decals、bursts、粒子按类型池化。性能指标（README）：
   - 冰晶场整个只需 3 次 draw call（3 个 InstancedMesh 共享一个材质），上限 288 晶体。
   - 整条闪电 2 次 draw call，上限 24 丝 × 72 采样。
   - 到底的卷须/支柱/边缘电弧共用 2 次 draw call + 1 次地面场，上限 56。
   - 光束 6 次 draw call（3 管道 + coils + discs + 聚能球），上限是 6 个动态光的池容量。
   - 实测：空闲 32 draw call，满冰面 ~69，闪电在空 ~49，~1150 活粒子。

### 5.2 用到的 Three.js / 图形特性

- **InstancedBufferGeometry / InstancedMesh**：闪电 ribbon、冰晶场、光束 coils/discs、卷须体系。
- **ShaderMaterial + 完整 GLSL**：所有程序化视觉（箭头 SDF、远投圆 SDF、地面灼烧、裂隙、晶体材质补丁）。
- **材质打补丁而非替换**：`IceMaterial.js` 给 `MeshStandardMaterial` 打补丁，使晶体既能投射/接收真实阴影，又能采样 HDR 环境探针做反射 + 叠加厚度染色、内部裂隙（world 空间噪声）、霜花（local 空间 fbm）、glint、出生闪光。
- **MeshStandardMaterial + Image-based lighting**：HDR（spruit_sunrise.hdr）作为 IBL 和冰的反光来源，但从不作为可见天空。
- **SDF（有符号距离场）+ 噪声着色器**：瞄准箭头单一 SDF 派生出轮廓/内部/chevrons/霜噪声/voronoi 板/脚环/射程弧/六重霜花；地面灼烧靠域扭曲（domain warp）避免"直射辐条"。
- **参数化 ribbon 条带 / 参数化管道**：闪电、光束、卷须体系共用一条 vertex shader 放置的条带，角色由实例索引决定，走不同参数路径。
- **相机朝向 ribbon（billboarding）**：通过"局部切线 × 视图向量"转向，保持任意角度表观厚度。
- **GPU 粒子系统**：curl 噪声湍流、涡旋、velocity-aligned stretch、环缓冲。
- **后期管线（PostProcessing）**：scene → 折射扭曲(beta) → bloom → ACES tone map → grade（色差、lift/gain/对比/饱和度/色温、暗角、胶片噪点、冲击闪）。
- **深度 pre-pass + 软交叉**：不透明世界写入半分辨率 packed-depth，所有 VFX shader 采样它做软相交，避免特效与地面硬切。
- **动态光池（LightPool）**：6 个点光启动时建好驻停于 0 强度，而非增删（避免改光数量触发全部材质重编译）；`acquire()` 返回 null 且每次使用都被守卫。
- **接触阴影（Contact Shadows）**：真实渲染角色的底部深度，256² 目标，两次模糊后投影到地面。
- **阴影**：单一平行光，正交阴影相机每帧重居中于角色、52m 盒子 4096²（~1.3cm/texel）。**曾试用 three/addons 的 CSM 并移除**——它全局替换 `lights_fragment_begin` chunk，任何未显式注册的材料会静默丢失所有方向光。
- **FBX 角色/动画**：Mixamo 导出，同一 rig；csant clip 按骨骼名绑定（无需 retarget）；idle 带网格，cast 文件只取其 `AnimationClip`，重复 rig 立即释放。
- **动画混合**：一次性 cast clip 叠加在循环 idle 上，以 `castBlendIn/castBlendOut` 为边缘。

### 5.3 每一个特效的"表现力构成"（可作为方法论参考）

| 技能 | 核心手法 |
| --- | --- |
| Frost Lance（冰） | 前锋沿直线推进；身后地面晶体爆出（脚部小而密、远端成片刀墙）；3 个 InstancedMesh 共享一个打补丁的 MeshStandardMaterial；厚度染色 + world 空间内部裂隙 + local 空间霜花 + glint + 出生闪光；mist(非加性)/shards(受光)/glitter(加性反重力)三套粒子 |
| Storm Lance（雷） | 单 instanced ribbon（顶点仅 `(t,side)`）双时钟控制闪烁：`restrike`(每秒整片换形) + `crawl`(连续滑动扭结)；线性插值值噪声保留"尖角"；相机朝向 ribbon 双绘制（宽软光晕 + 白热芯）；地面灼烧用平面噪声 + 域扭曲，避免 atan 直辐条 |
| Nova Beam（光柱） | 参数化管道三次绘制加权（halo 纯边缘 / sheath 空心边缘亮 / core 轴心最亮）模拟体积积分；coils 为弯曲成螺旋的 ribbon；shock discs 相位纯时钟函数；**唯一的四拍技能**（额外 wind-up），通过 `advance()` 拒绝在聚能未完时让前锋离手实现，状态机零改动 |
| Voltaic Snare（远投陷阱） | **围绕一个点而非一条线**；整个"笼子"（leash/支柱/卷须/边缘电弧）是**同一条 instanced ribbon**，vertex shader 按实例索引测四个活计数决定角色与参数路径；`zoneRadius` 是唯一被多方共读、从不拷贝的数字，拖它五个部位同步缩放；**snap 回弹**（outCubic × 峰值靠后的 bump，超程回拉）是"远投手感"关键 |

### 5.4 值得借鉴的工程做法

1. **UI = 数据源 API**：把"设计工具"与"游戏内实时编辑"合一。938 个实时滑块令特效调参可视化、迭代极快。
2. **弱耦合 + 面向扩展**：Ability 基类 + settings 块 + ELEMENT_META + AbilityManager 注册 + Editor 文件夹 + glyph + 按键绑定，五步加一个技能；加一个远投只需再补 `CastShape.ZONE` + `zoneRadius`。
3. **对象池贯通**：能力/特效/粒子统一池化，限制分配。
4. **参数"采样而非拷贝"** 的反直觉技巧：把维度计算延迟到 shader 每帧进行，获得实时可调 + 暂停可编辑。
5. **体积感的低成本近似**：多层参数化条带/管道叠加、边缘/轴心反权重，比真正体积渲染便宜得多。

### 5.5 已知局限（README 自述）

- 地面是 `y=0` 单平面，前锋是直线——不适用于不平地面。
- 晶体用 `transparent:true + depthWrite:true`，低透明度时重叠尖角有排序伪影。
- 畸变 pass 当前无写入，每帧耗一次半分辨率 clear（为折射预留的钩子）。
- 远投指示器与卷须体系都铺设在同一平面，不会随台阶起伏。

---

## 六、总结

这是一个**"程序化 VFX 方法论"的示范项目**：不依赖任何美术资产，把"魔法施放"的观感全部建立在一套自洽技术上——`CPU 零维度 + settings 实时代码解析 + 参数化 ribbon/管道 + GPU 粒子 + 对象池`。其核心贡献不是某个炫技特效，而是**"实时可编辑、暂停仍生效、扩展成本极低"的特效调参工程范式**，对自研技能特效管线的搭建有很强的参考价值。
