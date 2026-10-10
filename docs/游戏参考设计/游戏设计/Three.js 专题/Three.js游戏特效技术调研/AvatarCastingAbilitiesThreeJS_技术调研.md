# AvatarCastingAbilitiesThreeJS 深度技术调研

> 调研对象：GitHub 开源项目 `achrefelouafi/AvatarCastingAbilitiesThreeJS`
> 本项目：基于 Three.js 受动画《最后的气宗》(Avatar: The Last Airbender) 启发的**元素弯曲 (element bending)** 沙箱
> 调研方式：GitHub API 实地读取仓库 README / package.json / src 全部源码
> 数据快照：133 stars / 20 forks / MIT 协议 / JavaScript / 最新提交 2026-08-03 (Initial commit)

---

## 1. 项目定位

### 做什么

一个"**弯曲沙箱 (Bending Sandbox)**"——用鼠标在地面上**绘制一条路径**，松开鼠标后，火/水/土/气四种元素能力会**沿这条样条曲线传播到终点并爆炸**。所有视觉效果参数都能通过实时 VFX 编辑器在运行时修改，并可保存为预设。

同一种手势还有**第二重含义**：切换到"行走模式 (walk mode)"后，绘制的路径不再是"被施放"，而是"被骑乘"——角色会跃上笔画的头部、折叠成冥想打坐姿势、骑在一个旋转的空气球上、沿路径骑行到终点，并在转弯时倾斜身体。

### 核心玩法交互

| 输入 | 动作 |
|------|------|
| **按住左键 + 拖拽** | 在地面上绘制路径 |
| **松开左键** | 施放当前元素沿路径传播 —— 或在行走模式下骑乘它 |
| **右键 + 拖拽** | 环绕相机（缩放锁定） |
| **M** | 在"施放(cast)"和"行走(walk)"模式间切换 |
| **1 / 2 / 3 / 4** | 火 / 水 / 土 / 气 |
| **Q / E** | 循环切换元素 |
| **G** | 显示/隐藏 VFX 编辑器 (lil-gui) |
| **C** | 清除所有活动效果并取消骑行 |
| **P** | 暂停/恢复模拟 |
| **T** | 在站立待机/冥想打坐姿态间切换角色 |
| **H** | 隐藏控制面板 |

### Demo 入口 / 运行方式

- 入口 HTML：根目录 `index.html`，含 id 为 `viewport` 的 canvas 和 `hud` 容器
- 入口 JS：`src/main.js`，实例化 `App` 并绑定页面

```bash
npm install     # 安装依赖
npm run dev     # Vite dev server (默认 http://127.0.0.1:5173)
npm run build   # 生产构建
npm run preview # 预览构建产物
```

启动时自动加载两个二进制资产（`public/`）：
- `public/models/Standing Idle.fbx` —— 绑定角色骨架 + 待机动画（Mixamo 导出的 skinned mesh + 单个动画栈）
- `public/hdri/spruit_sunrise.hdr` —— HDR 探针，用于基于图像的照明和环境

---

## 2. 技术栈与依赖

`package.json`（name = `casting-abilities`，version 1.0.0，type: module）：

**依赖 (dependencies)**
- `three` — `^0.185.1`（Three.js 核心）
- `lil-gui` — `^0.21.0`（实时 VFX 编辑器 / 调试面板）

**开发依赖 (devDependencies)**
- `vite` — `^8.1.5`（构建与开发服务器）

**scripts**：`dev` (vite) / `build` (vite build) / `preview` (vite preview)

技术栈核心特点：
- **手写 GLSL**：大量自定义 `ShaderMaterial`，无任何精灵纹理（no sprite textures），全部程序化
- **Vite** 做打包开发，ESM 模块化
- **所有噪声/渐晕/软粒子都是 GLSL 库函数**，无噪声纹理贴图

---

## 3. 目录结构

```
src/
├── main.js                    # 入口：绑定 canvas，实例化 App
├── abilities/                 # 能力系统
│   ├── Ability.js             # 抽象基类：生命周期/样条沿弧长行进/相位机
│   ├── AbilityManager.js      # 能力池管理 (ObjectPool)，注册表 ABILITY_TYPES
│   ├── FireAbility.js         # 火（体积 ray march，飞行）
│   ├── WaterAbility.js        # 水（体积 ray march 水面，掠行）
│   ├── EarthAbility.js        # 土（程序化几何铺路/破碎/石塔）
│   └── WindAbility.js         # 气（丝绸螺旋发丝）
├── animation/                 # 角色动画
│   ├── CharacterController.js # FBX 加载/材质转换/AnimationMixer
│   ├── SittingPose.js         # 程序化冥想打坐姿势
│   └── WalkController.js      # 行走模式四阶段：跳跃→骑行→下马→待机
├── assets/
│   └── ProceduralGeometry.js  # 程序化几何生成：岩石/石板/石塔/碎片
├── config/
│   └── settings.js            # ★ 唯一状态源（单源驱动架构）
├── core/
│   ├── App.js                 # 应用根：组装所有子系统 + 主循环
│   ├── Renderer.js            # WebGLRenderer 封装（像素比/阴影/色调映射）
│   ├── CameraRig.js           # 相机机架（轨道 + 自动取景）
│   ├── Time.js                # 时间
│   ├── Layers.js              # 渲染层 (VFX / DISTORTION 等)
│   └── FrameUniforms.js       # ★ 共享帧 Uniform（对象身份共享）
├── effects/                   # 效果
│   ├── AirScooter.js          # 行走模式的空气球坐骑
│   ├── BurstSphere.js         # 爆炸球体（火球/空气压缩波）
│   ├── CameraShake.js         # 相机抖动
│   ├── GroundDecals.js        # 地面贴花（焦痕/冲击波/尘圈）
│   ├── LightPool.js           # 动态点光源池
│   ├── PathTrail.js           # 预览路径拖尾
│   ├── RibbonGeometry.js      # 拖尾带状几何（billboard）
│   └── ScreenFlash.js         # 屏幕闪光
├── input/
│   ├── InputManager.js        # 输入事件管理
│   └── PathDrawer.js          # ★ raycast → 样条 → 弧长重采样
├── loaders/
│   └── AssetLoader.js         # 资产加载器（共享 LoadingManager，FBX 路径重定向）
├── materials/                 # ★ 所有自定义特效材质
│   ├── VolumetricFireMaterial.js  # 火：体积 ray march（black-body 辐射）
│   ├── OceanWaterMaterial.js      # 水：ray march 水面（Fresnel/Beer-Lambert）
│   ├── WindMaterial.js            # 气：风/Billboard 螺旋发丝 + 龙卷风
│   ├── RockMaterial.js            # 土：岩石着色器（苔藓/法线）
│   ├── TrailMaterial.js           # 拖尾
│   ├── DistortionMaterial.js      # 热畸变/折射（屏幕空间 UV offset）
│   └── AirScooterMaterial.js      # 空气球坐骑（流线/扭曲/空气感）
├── particles/
│   ├── ParticleSystem.js      # ★ GPU 粒子系统（instanced quad）
│   └── ParticleEngine.js      # 粒子系统管理与惰性共享
├── postprocessing/
│   ├── PostProcessing.js      # Composer 管线
│   ├── DistortionShader.js    # 畸变 shader
│   └── GradeShader.js         # 调色 shader（CA/提亮/对比/暗角/颗粒）
├── shaders/
│   └── lib/
│       ├── common.glsl.js     # 共享辅助：softFade/fresnel/dissolve/gradient4
│       └── noise.glsl.js      # 噪声库：hash/simplex/fbm/ridged fbm/curl/voronoi
├── ui/
│   ├── Editor.js              # lil-gui VFX 编辑器（含"添加第五元素"分档）
│   ├── HUD.js                 # 头顶显示（FPS/粒子数/操作说明）
│   ├── PresetManager.js       # 预设（localStorage 保存/JSON 导入导出）
│   ├── glyphs.js / styles.css
├── utils/
│   ├── EventEmitter.js / ObjectPool.js / color.js / dispose.js / math.js / shaderPatch.js
└── world/
    ├── Environment.js         # 环境光照（key/rim/hemi + 雾）
    ├── Ground.js              # 地面（无雾地板，雾色一致化）
    ├── DustMotes.js           # 空气中漂浮尘埃
    └── ContactShadows.js      # 真实接触阴影渲染
```

---

## 4. 核心系统 / 技术路线

### 4.1 路径绘制 PathDrawer 与样条/弧长参数化

`src/input/PathDrawer.js` 是交互与轨迹的核心，管线如下：

```
pointer NDC → raycast 到地面平面 → 抖动过滤采样列表 → 指数平滑
→ CatmullRomCurve3 → 均匀弧长重采样
```

- **射线投影**：`raycaster.setFromCamera(pointer, camera)` + `ray.intersectPlane(GROUND_PLANE)`（`GROUND_PLANE = new Plane(new Vector3(0,1,0), 0)`）
- **抖动过滤**：只用 `settings.input.minPointDistance` (0.22 世界单位) 过滤近距离重复点，忽略手抖
- **指数平滑**：`this._smoothed.lerp(this._hit, clamp(1 - smoothing, 0.05, 1))`，去颤抖又不引入延迟
- **样条构建**：`new CatmullRomCurve3(points, false, 'catmullrom', curveTension)`，`curve.arcLengthDivisions = max(64, points.length * 8)`
- **弧长重采样**：`curve.getPointAt(i/(wanted-1))` 用 `samplesPerUnit` (3.0) 决定密度
- 重采样折线被**预览 ribbon 和能力共同消费**，保证"你画的轨迹"和"能力实际走的轨迹"完全一致
- 过短笔迹（`< settings.input.minPathLength` 1.6 米）被丢弃

**弧长参数化**（关键设计）：`Ability.followPath()` 按**弧长**而非曲线参数前进，所以传播速度是真正的**米/秒**，与帧率、绘制不均匀度无关。

```js
this.distance += speed * easeIn * easeOut * profile * dt;  // 累加弧长距离
this.u = saturate(this.distance / this.curveLength);       // 归一化进度
this.curve.getPointAt(this.u, this.position);              // 用 getPointAt 取弧长位置
```

`pathHeight(u)` 让元素能抬离地面飞行（火 override 它飞天），head/trailing window/动态光/每个粒子发射点都一起被抬起。

### 4.2 四种元素各自的材质实现

#### 火 —— 体积射线步进 (VolumetricFireMaterial / raymarch)

火**不是**纹理化的 ribbon，而是真实的体积。mesh 只是沿飞行路径的**相机朝向代理外壳 (camera-facing proxy hull)**，每个片段从 hull 的 `aCenter`/`aTangent` 属性重建路径局部坐标系，从相机发射射线并**穿过密度场积分**（capsule 衰减 + 三层噪声侵蚀）。

密度场分四层堆叠（按人眼读取真实火球的顺序）：
1. **轮廓 (silhouette)**：沿飞行路径的 capsule，横截面泪滴形（浮力向上拉伸），局部半径被一个超低频噪声 octave 调制（塑造米级火焰轮廓，避免"光秃秃的管子"）
2. **涡环卷起 (vortex roll-up)**：高温气体脱落环涡沿尾迹向后传播并增长。在 (stream, vertical) 平面内旋转噪声域产生卷曲蘑菇状翻滚——**纯 fbm 只能做云，做不出卷曲**
3. **湍流 (turbulence)**：5 个逐步 domain-warped octave，octave 间旋转消除晶格排列，每个 octave 上浮更快，使细节撕裂成上卷的火舌
4. **撕裂 (shred)**：轴上侵蚀弱、边缘剧烈，所以火保持实心的燃烧核心，边缘分解为缕状与挣脱的细丝

**着色是温度驱动而非梯度驱动**：
- `temperature` 由 capsule falloff（几何）携带，只被两个粗 octave 轻推
- `emission`：黑体辐射颜色按 `(T/Tcore)^3`（`emissionCurve`，略低于 Stefan-Boltzmann 的 4），红边→橙身→白核的自然连续来自物理
- `scatter`：燃烧核心附近的冷气体被其光沐浴（soot 边缘不塌成纯黑）
- `absorption`：soot 消光。冷烟硬遮挡，即使最热气体也保留消光下限 (`uCoreClarity`)，避免整团积分成一个剪裁的白斑

**成本与质量旋钮**：`fire.volumeSteps` (默认 35/44) 是质量/成本旋钮。README 明确：**26 samples/pixel 在 960×540 大约 1.3ms**。

**性能优化细节**（源码实打实）：
- 边界用**椭球**而非球：火焰高宽比 2.5:1，球体会把步进预算浪费在几乎空的区域；椭球边界比球多一个点积，直接把步进密度提升回来
- **自适应步长**：在空区域用 `stride *= 1.6`（粗步进），命中后回到细步进；发射入口抖动避免洋葱圈伪影
- **软粒子/深度剪裁**：march 被半分辨率 packed-depth prepass 剪裁，火被地面和角色正确遮挡
- 混合模式为**预乘"over"**（`OneFactor` src, `OneMinusSrcAlphaFactor` dst），因为真火既发射又遮挡（soot 吸收），而非其它 VFX 用的 additive

#### 水 —— 射线步进水面 (OceanWaterMaterial)

水和火用同样的"代理外壳"技巧，但做**相反**的事：火是发光气体（穿过介质积分），水有表面（一切"像水"的效果都发生在表面上）。

- 射线步进寻找**符号变化**：
  ```
  field(p) = radius(u) * (1 + swell + chop) − distanceToAxis(p)
  ```
- 用**四次二分法** (four bisections) 精化交点，用同一 field 的梯度作**法线**（所以 field 里的每个波纹都是光照里的真实波纹）
- 表面着色：Schlick fresnel 叠加 HDR probe + 一个紧凑的太阳高光；**Beer-Lambert 深度染色**作用在穿过管子的**解析弦**上（薄边缘青色，腹部深蓝）；透过薄脊的背光半透明；swell 峰值处的泡沫 + 脊状 octave 侵蚀 + 轮廓处泡沫，全部按 **voronoi** 分割成气泡而不是白漆
- 高光和背光对准舞台**主光源**方向，所以水的受光方向与场景其余部分一致
- `water.volumeSteps` 是其质量/成本旋钮

#### 土 —— 程序化石板几何 (非着色器)

土是唯一用**实体几何**而非着色器的元素，分三拍：
1. **铺路 (pave)**：随着头部前进，`createSlabGeometry` 生成程序化石板，与地板齐平地铺在 `earth.crustWidth` 宽的带内，重叠铺开成连续石壳
2. **破碎 (crack)**：一道裂缝波以 `earth.crackDelay` 跟随头部，把每块石板从低边撬起、翻转或落入缝隙、滑开并喷出尘土碎石
3. **石塔 (tower)**：施放结束时地面升起一座 `createTowerGeometry` 方尖碑（覆有阶梯底座），周围一圈巨石被顶起，`earth.towerHold` 时间后一切下沉

- 石板/巨石/石塔是三个 mesh（两个 `InstancedMesh` + 一个 `Mesh`），共享 `RockMaterial`，全部投射/接收场景级联阴影
- 每个材质独立实例：因为**一个材质被实例化和非实例化 mesh 同时使用会触发两次程序变体编译，且 CSM 只跟踪它"最后看到的那个"的 uniform**——这是一个值得注意的 Three.js 陷阱与规避
- `mossAmount` 按实例不同，因为苔藓 term 依赖朝上法线，平地板块会饱和

#### 气 —— 风的螺旋 (WindMaterial)

空气弯曲 ribbon 是"**一束梳顺的丝绸 (a tress of combed silk)**"，不是单条带。参考艺术是几十根发丝般的蒸汽纤维贯穿宽阔帘幕。

- **关键性质是各向异性**：让发丝摇摆/成束/变暗的场几乎只沿 ribbon 变化、跨 ribbon 几乎不变——跨宽向的噪声或高频纵向噪声会立刻变成烟糊而非头发
- 两层梳刷叠加：细的一层做发丝，稀疏柔和的一层做下面宽大的绸缎
- 发丝密于像素处用抗锯齿下限自然融合成实心帘幕
- 冲击时生成 `TornadoMaterial` 龙卷风（多个漏斗 shell，漏斗半径从上到下收窄成凹轮廓，非圆锥）

#### 空气球坐骑 (AirScooterMaterial)

行走模式骑的空气球**是着色器球体，不是纹理**（`windball.jpg` 只是参考图）。shader 把球面按 `uBands`（默认 7）条"**constant longitude + twist × latitude**"流线分割——从一极螺旋到另一极的曲线族——每条车道画一条发丝，被 fbm 域形变扭曲织入破裂，而非线框地球。图形绕 mesh 本地 **Y 轴**旋转，而 AirScooter 对象把该轴与骑行者的侧向量对齐，所以涡旋的滚动方向和球滚动一致。

### 4.3 GPU 粒子系统 (ParticleSystem)

`src/particles/ParticleSystem.js` 是 **GPU 模拟、instanced-quad** 系统（最多可配容量，默认 2000）。

- **CPU 只写 spawn 数据**：运动（速度/重力/解析拖曳/湍流/涡旋）、size-over-lifetime、颜色渐变和 alpha 淡出**全部在 shader 里从 per-instance attributes 求值**
- **解析指数拖曳**：`travel = (1 - exp(-k*age))/k`——精确且与帧率无关
- **湍流两种**：`USE_CURL` define 升级到真实 curl noise（重烟/火），否则用确定性抖动 wobble
- **只上传变更槽位**：核心优化——发射是连续的，`_markDirty` 合并且 `<packing>` 后 merge 成 range，`flush()` 用 `addUpdateRange` 只上传变化的槽
- **环形缓冲**：超过容量回收最旧槽，所以狂按能力是回收而不是分配
- **六种程序化轮廓 (ParticleShape)**，无精灵纹理：SOFT（柔圆）/ SMOKE（fbm 蚀刻 puff）/ STREAK（速度对齐火花）/ LEAF（叶形）/ CHIP（棱角岩石碎片）/ RING（细膨胀环=冲击波）
- 死粒子被推到裁剪空间外 (`gl_Position = vec4(2,2,2,1)`)，GPU 在光栅化前丢弃整个三角形
- `ParticleEngine` 按名称惰性创建并**在能力实例间共享**系统——连火二十次复用同一个余烬缓冲

### 4.4 "设置驱动"架构 (settings.js 单源)

`src/config/settings.js` 持有**每个可调值**，其它系统（shader、粒子、灯光、后处理）**每帧都读取这些对象**，这是实时编辑器不用重建即可工作的原因：

```js
import { settings } from './config/settings.js';
settings.fire.flameHeight = 5;   // 下一帧立刻可见
settings.global.speed = 0.35;    // 让所有元素变慢
```

关键实现配套：
- **共享帧 Uniform** (`core/FrameUniforms.js`)：`frame` 对象里的 uniform 按**对象身份**被所有自定义材质共享（three 存 `{value}` 盒子），一帧一次写入更新全部材质——把几十个 VFX 材质的逐帧 CPU 工作压到几次赋值
- **深度合并预设** (`applySettings`)：深合并到**同一个对象**里，所以保活绑定仍有效；`DEFAULT_SETTINGS = structuredClone(settings)` 支持"恢复默认"
- 预设是 settings 树的纯快照，可 localStorage 保存 / JSON 导入导出 / 手改

### 4.5 行走模式 WalkController 四阶段

`src/animation/WalkController.js`（Phase 枚举：`IDLE / LEAP / RIDE / DISMOUNT`）：

| 阶段 | 发生的事 |
|------|---------|
| **leap (跳跃)** | 从他所在位置沿**抛物线弧**跳向路径头部，空中转向路径自身的航向；在 `walk.tuck` (0.62) 处折叠进冥想姿势，落地时已坐好 |
| **ride (骑行)** | 空气球在身下出现。他**按弧长**以 `walk.speed` (5 m/s) 跟随曲线，`walk.accel` 内缓加速，路径最后 `walk.brake` 秒滑行停下 |
| **dismount (下马)** | 球炸开，他向前迈步踩到地面 |
| **idle (待机)** | 放置交还给待机动画 clique |

关键设计：
- **倾斜由推导而非手工编排**（banking is derived, not authored）：控制器跟踪航向实际摆动的快慢，按其自身前向轴成比例滚动身体，急弯斜得猛、直道平稳。roll 存放在角色根节点下的一个 `tilt` 关节上，避免与航向争抢同一旋转
- **骑行中允许重绘路径**：直接从他正在做的事上跳向新路径头部
- `walk.returnHome` 让他走完路径后跳回起点，默认停在远端
- 碰撞接触时用 decal 尘圈 + 相机 kick (`landShake`)
- 空气球在下马后继续动画，留在原地消散

---

## 5. 性能要点

从源码注释与 README 提取，非常详实：

- **火的 `fire.volumeSteps` 是主质量/成本旋钮**：26 samples/pixel 约 1.3 ms @ 960×540。体积 ray march 用**三线性 value noise**（比表面 shader 的 simplex 便宜约 1/3），且边界用椭球、空区自适应粗步进
- **能力/decals/爆裂/粒子全部池化**：热会话每帧几乎零分配
- **Ribbon 几何每次施放预分配一次**，原地重写 + 部分缓冲上传
- **六个动态点光源在启动时创建、驻留在零强度**而非增删——改变灯数量会强制所有材质重新编译
- **阴影贴图每帧只更新一次**，尽管场景被渲染多次（深度 prepass/畸变/接触阴影/主 pass）；`shadowMap.autoUpdate = false`
- **`renderer.compileAsync()` 启动时运行**，首次施放不卡顿
- **像素比上限 1.75**；深度与畸变缓冲是半分辨率
- HUD 右上实时计数器：FPS / live particles / draw calls / active abilities
- Sheet 中"小于约 1/8 车道的发丝无法在此尺寸解析，推高只会损失对比度"这类注释显示了作者对每项开销的把握

---

## 6. 优点、局限与值得学习之处

### 优点

1. **架构极其清晰**："设置驱动 (settings-as-API)" 单源 + 共享 Uniform 身份，让实时 VFX 编辑器、预设系统、全局乘子都顺理成章，且"添加第五元素"只需 4 步（settings 块、ELEMENTS 注册、Ability 子类、editor 分档），一切继承
2. **极高的内聚/解耦**：`Ability` 基类把生命周期/弧长行进/拖尾窗/动态光/池化契约全收走，子类只需描述"元素长什么样"，切面十分干净
3. **物理驱动的着色**（尤其火的黑体辐射、水的 Beer-Lambert），比纯手工调色更自然，注释里对"温度高次方放大噪声等高线→玛瑙纹"这类陷阱讲解透彻
4. **工程实践中罕见的细节**：椭球边界、自适应步进、dither 打散洋葱环、色散合并 partial buffer upload、阴影自动更新关闭、光源驻留零强度，都是货真价实的性能智慧
5. **文档质量极高**（README + 每文件头部注释都像论文），是很好的学习范本

### 局限（README "Known rough edges" + 源码观察）

- 冲击爆裂在火/水上比土/气好；爆裂外壳某些角度读作多面碎块，需要更多美术指导
- 水的厚度是**解析弦**而非 march 出的出口点，深度染色忽略它穿过的波位移——被峰部泡沫掩盖，但很慢很近的镜头能看出腹部略浅
- 舞台地板是单平面，无法表现雾气在起伏地面上滚动（依赖雾与背景同色）
- 热畸变缓冲半分辨率，极细 shimmer 细节偏软
- 非渲染层面：`.fbx` 纹理路径是烘焙的绝对本地路径，必须重定向到占位（见 AssetLoader）——一个数据资产踏坑示例

### 值得学习之处（技术亮点清单）

- **弧长参数化运动**（`getPointAt` + 距离累积），实现恒速、与帧率无关的曲线行走
- **代理外壳 + ray march** 的通用手法：mesh 只是包围盒，片段内重建局部系并积分——火和水一脉相承、方向相反
- **GPU 粒子**的"CPU 只写 spawn、GPU 算全部" + 环形缓冲 + partial upload，是 WebGL 粒子系统的高性能范式
- **obj身份共享 uniform** 是 Three.js 多材质 VFX 优化的关键技巧
- 程序化轮廓（无精灵纹理）整套方案值得直接借鉴
- "倾斜由推导而非手工编排"、banking 关节分离（`tilt` joint）的动画设计思路
- CSM 一个材质被实例化/非实例化 mesh 兼用导致变体/追踪问题的避坑，是真实的 Three.js 坑

---

*本调研基于对仓库 README / package.json / src 全部源码的 GitHub API 实地读取。所列文件与实现均来自真实源码，无推断虚构内容。*
