# 深度技术调研：`achrefelouafi/SamuraiThirdPersonTemplateThreeJS`

> 调研日期：2026-08-19 · 基于 GitHub API 实地读取仓库 metadata、README、`/git/trees` 文件树及关键源码（
> `CharacterController.js`、`ThirdPersonController.js`、`Locomotion.js`、`Attack.js`、`Jump.js`、`Ragdoll.js`、
> `WeaponFire.js`、`DistanceField.js`、`SurfaceSampler.js`、`ShadowCharacter.js`、`Judgement.js`、`BladeStorm.js`、
> `EquipmentCatalog.js`、`EquipmentManager.js`、`Terrain.js`、`Environment.js`、`ContactShadows.js`、`App.js`、
> `terrain.glsl.js`、`blackbody.glsl.js`、`package.json`、`vite.config.js`、`abilities.js`）。
>
> 所有结论均有源码/README 依据；个别无法直接取证处已标注「（推断）」。

---

## 0. 关键统计快照

| 项目 | 数值 |
| --- | --- |
| GitHub 统计 | 47 star · 11 forks · 0 open issues · 6 commits |
| 许可证 | MIT |
| 语言 | JavaScript（纯 ES Module，无 TS） |
| 运行时依赖 | **2 个**：`three` ^0.185.1、`lil-gui` ^0.21.0 |
| 开发依赖 | **1 个**：`vite` ^8.1.5 |
| `src/` 源码模块 | **78 个 `.js`**（vfx 17、world 15、ui 9、core 7、animation 6、combat 4、equipment 3、loaders 3、shaders/lib 3、utils 4、config 2、postprocessing 2、screens 2、main 1）|
| 能力数（`abilities.js`） | **8 个**：movement 2（leap、customize）、technique 3（kick、slashHit、crouchSlash）、ability 3（shadows、judgement、flight）|
| 其中近战攻击 | **3 个**（`Attacks[]`：踢/劈/滑斩） |
| 动画剪辑数 | 11 个 skeleton-only FBX |
| 地形查找表 | 256×256 字节表，`NEAREST`，最多 6 个八度 |
| 角色阴影贴图 | 4096²（方向光），联系阴影 256px ×3 遍 |

---

## 1. 项目定位

**做什么**：一个**纯浏览器端运行的完整第三人称动作游戏模板/舞台（stage）**。绑定的武士（rigged samurai）站在
**无限程序化夜间景观**上，具备完整的移动系统、**运动变形（motion warping）**近战、召唤类能力（影子/审判/飞行）、
无物理引擎的布娃娃死亡、体积燃烧武士刀，以及 Tab 进入的装备工作室。

核心卖点（README 自述与源码一致验证）：
- **无引擎、无物理库、无资产管线**：`Three.js + Vite + 一个 settings 文件（每帧都被读取）`。
- README 标题即定位：*"a complete third-person action stage in the browser"*（浏览器中的完整第三人称动作舞台），
  强调"模板"——所有可调数字收敛进 `src/config/settings.js`，所有招式收敛进 `src/config/abilities.js`。

**核心玩法**（对照 README Controls 表 + `abilities.js`）：
- **移动**：WASD/方向键（相对相机摇杆）、Shift 跑、Space 跳跃（奔跑=长跳，低速=原地小跳，空中/飞行时=释放刀片）。
- **战斗**：E 踢击、R 劈砍（Slash Hit）、T 滑斩（Slide Cut）——三种 technique，均为运动变形实现的近战。
- **能力（先标记目标再用）**：V 影子（召唤两个影子各追一个被标记的敌人）、C 审判（敌人头顶开印章、拳头砸下）、
  X 飞行（离地进入飞行模式，标记敌人逐一锻造刀片、Space 齐射）。
- **装备**：Tab 进入装备工作室，切换相机/灯光/色调，挂载并微调武器与饰品。
- **运行方式**：`npm install && npm run dev`（http://127.0.0.1:5173），`npm run build` 产出静态站。

---

## 2. 技术栈与依赖（`package.json` + `vite.config.js` 实证）

`package.json`（`name: "character-equipment"`，`type: "module"`）：

```json
"scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview" },
"dependencies": { "lil-gui": "^0.21.0", "three": "^0.185.1" },
"devDependencies": { "vite": "^8.1.5" }
```

**要点**：
- 全部依赖仅 3 个（2 runtime + 1 dev），无任何物理库、无 GLSL 工具链、无状态管理。README 亦注明
  *"three ^0.185 · lil-gui ^0.21 · vite ^8.1 · no other runtime dependencies"*。
- `vite.config.js`：`base: './'`（相对路径部署，适配 GitHub Pages/Cloudflare 等静态托管）、
  `server` 固定 `127.0.0.1:5173`、`build.target: 'es2022'`、**`assetsInclude: ['**/*.fbx', '**/*.hdr']`**
  —— 大型二进制资产（FBX/HDR）走 `/public` 原样投递，不进 Vite 打包管线。
- 存在 `wrangler.toml`（Cloudflare 部署配置）。

**角色模型/动画来源**：
- 身体蒙皮：`public/models/tpose.fbx` —— **一个带纹理、蒙皮的网格，绑定 Mixamo `mixamorig:` 骨架，T-pose，无自带动画**。
- 动画：`public/animations/*.fbx` —— **纯骨架导出（只有关节无网格）**。
- 表面材质：`public/models/textures.glb` —— **未绑定的 GLB**，因 FBX 几乎不带 PBR 细节，材质库按材质名匹配到 GLB。
- 武器/饰品：`public/models/weapons/sword.glb`、`fist.glb`、`attachements/Scabbard.glb`、`Potion.glb`（GLB 格式）。
- 环境资源：`public/textures/moon/*`（月球 1024² 五件套）、`stone/terrain`（PBR）、`leafs/*`（叶子五件套）、
  `hdri/spruit_sunrise.hdr`（Poly Haven，仅作暗镜面反射探针）。

**Credits**（README）：角色模型 dark_igorek（Sketchfab）、动画 Mixamo、纹理 ambientCG、HDRI Poly Haven ——
全部为免费/CC 资产，印证"无资产管线"主张。

---

## 3. 目录结构

README 的 Layout 与 `/git/trees` 逐文件一一对应（实际 78 个 `.js` 模块）：

```
src/
  main.js                    # 入口
  core/            (7)      renderer、clock(Time)、orbit rig(CameraRig)、输入(Input)、
                            共享帧 uniform(FrameUniforms)、图层(Layers)、App(编排/每帧顺序)
  world/           (15)     Terrain 高度场 · Ground 跟随地面 · Sky 全屏天空/星/月 ·
                            Moon 实体月球 · Atmosphere 高度雾 · GroundFog 地面雾 ·
                            Leaves/LeafLitter/LeafDrift 叶子 · ContactShadows 联系阴影 ·
                            Environment 光照/阴影图 · DustMotes 尘埃 · StudioStage 工作室舞台 ·
                            TerrainCache 地形烘焙缓存 · leafMaterial
  animation/        (6)     CharacterController(rig+retarget) · ThirdPersonController(移动) ·
                            Locomotion(走跑混合) · Jump(长跳/小跳) · Flight(飞行) · Attack(运动变形)
  combat/           (4)     Enemy · EnemyManager(包围圈/克隆) · Ragdoll(无引擎布娃娃) · TargetMarking(屏幕空间标记)
  vfx/            (17)     WeaponFire · DistanceField · VolumetricFireMaterial · EmberSystem ·
                            BladeHeat · SurfaceSampler · EmitterBox · ShadowCharacter · Judgement ·
                            SummonSeal · BladeStorm · BladeImpact · BloodBurst · DustBurst · ShockRing ·
                            TargetMarkers · TargetRings
  equipment/        (3)     EquipmentCatalog(内容层，配置驱动) · EquipmentLibrary(懒加载库) · EquipmentManager(挂载)
  screens/          (2)     CharacterScreen(工作室模式切换) · StudioCamera(免费检查轨道)
  loaders/          (3)     AssetLoader · MaterialLibrary · fbxEmbeddedMedia
  postprocessing/   (2)     PostProcessing(Bloom→tone map→grade) · GradeShader
  shaders/lib/      (3)     noise.glsl.js · terrain.glsl.js(高度场) · blackbody.glsl.js(黑体辐射)
  ui/               (9)     ActionHUD · Editor(lil-gui) · Stats · CharacterScreenUI · PresetManager ·
                            TargetHotkeys · LoadingScreen · Toast · icons
  config/           (2)     settings.js(每个数字) · abilities.js(每个招式)
```

**各子系统职责一句话**（README + 源码）：
- `core/App.js`——构建全部子系统后只负责**按固定顺序驱动每帧更新**，单向接线（子系统不回指 App）。
- `animation/`——身体与运动分离；retarget、移动、混合、跳跃、飞行、攻击。
- `combat/`——敌人、无引擎布娃娃、目标标记（屏幕空间）。
- `vfx/`——燃烧武士刀、三能力、命中/血/尘/冲击环、目标环/目标标记。
- `equipment/`——目录（内容层）、懒加载库、挂载管理。
- `screens/`——角色工作室及其相机。
- `world/`——地形、天空、月、大气、雾、叶子、光、工作室布景。
- `config/`——所有可调数字 + 所有招式定义（两条"契约"文件）。

---

## 4. 核心系统 / 技术路线（重点）

### 4.1 动画系统：`_retarget()` 单位换算 + 根运动处理（`CharacterController.js` 实证）

`_retarget(source, name)` 从纯骨架导出里**提出第一个 clip**，按关节名绑定到身体，丢弃本 rig 没有的关节轨道；
凡同名关节即可绑定（无需手动对齐蒙皮）。两个关键修正：

- **单位换算（units）**：身体与动画可能用不同尺度导出（Mixamo 厘米 vs DCC 米），**旋转无需管，但平移轨道要换算**。
  换算比例**从绑定姿势实测**（`_measureClipUnits`）：取髋部之下的任意关节——其平移即"骨长"（父→子的固定偏移，
  任何姿势下相同）——用该骨长相对其绑定平移的比例作为单位换算系数。若搞错会把髋部抛到百米高空。
- **根运动（root motion）**：控制器独占身体位置，所以髋部**水平平移在第 0 帧冻结（原地播放）**，竖直分量保留
  （那是步态起伏"bob"而非位移）。对 `ROOT_MOTION_CLIPS = new Set(['bigJump'])` 里的 clip，水平平移在路过时被
  **录制**（`extractTravel`，存进 `rootMotion`）而非丢弃——动作照常原地冻结，但旅程被另一处（`Jump`）重放到根节点上。
- 冻结对象是 **bind pose 而非 clip 首帧**：防止"作者身体不在原点"的导出把偏移永久带进来。
- 轨道过滤依据：`this.bones` Map（同一关节以原始名 + 去 `mixamorig:` 命名空间两种 key 各索引一次），
  `_retarget` 里 `if (!this.bones.has(node)) continue` 即丢弃不存在的关节。
- 攻击 clip（kick/slashHit/crouchSlash）导出**自带网格**但只读 `animations[0]`，多余网格在 `_retarget` 里丢弃。

**动画输入/状态机**：`ANIMATION_URLS`（11 个：idle/walk/run/bigJump/hop/crouch/float/land/kick/slashHit/crouchSlash）。
默认无骨骼映射就冻结/重放；"加一个状态 = ANIMATION_URLS 一行 + Locomotion 一个权重"。

### 4.2 第三人称移动控制器：身体朝去向、权重混合去抖动（`ThirdPersonController.js` + `Locomotion.js` 实证）

`ThirdPersonController`（第三层：输入 → 速度 → 位置）：
- **把输入积分成速度，而非直接作为位置增量**。摇杆按**相机方位角（azimuth）**解析——W 恒为"远离相机"，
  绕轨道相机即重定向控制（第三人称游戏标准做法）。
- **身体朝向"正在去的地方"，而非相机看向处**：`atan2(velocity.x, velocity.y)` 得 heading，
  `character.turnToward(heading, turnRate, dt)` 平滑转向。`settings.character.facing` 是唯一权威。
- 加减速用不同 ramp（`acceleration` 起步 / `deceleration` 刹车更陡，避免身体滑过松键点）。
- 与敌人做**圆柱体碰撞推出**（`enemies.pushOut`）。
- 只动 **XZ**（`character.position.x/z`），高度由别处（地形/飞行）负责。

`Locomotion`（idle/walk/run 混合）：
- **三个 clip 永久播放，只动权重**——无"停旧起新"时刻，故 stop-start 输入绝不会把身体卡在淡入淡出中间。
- **相位锁（phase lock）**：walk 是主循环，run 每帧由 `walk.time` 的归一化相位**从属锁相**
  （`this.run.time = phase * runDuration`），两 clip 永远同一帧同脚触地，杜绝混叠时的"四腿乱步"。
- **步频（stride rate）**：播放速率 = `速度 / clip 作者速度 · trim`，故提高 `walkSpeed/runSpeed` 是**重计时腿**而非滑步
  （`setEffectiveTimeScale(stride)`）。
- 权重用 `damp()` 平滑，防止输入突推时姿势瞬跳；跳跃/攻击通过 `overrides`（`weight` + `takeover`）**掩盖（mask）**步态，
  分开掩盖"站立 vs 移动"，让长跳底下仍留走/跑。

### 4.3 运动变形（Motion Warping）攻击：`Attack.js` 实证

问题：动画是冲着"想象中某个固定距离/角度的对手"作者化的，玩家不会正好站那里。滑步（ease）会被读成"打滑"，
挥空又像 bug。`Attack` 做第三种——**运动变形**：

- **按下时锁定目标**，一次性解析 clip 需要的落脚点：`to.yaw = atan2(dx, dz)`（面向它），
  `step = clamp(distance - standoff, 0, maxWarp)`（站到离对方 `standoff` 米处），
  `passThrough` 再解析终点后面的第二点（穿身/滑斩）。
- **`turnAt` 先转身、`warpAt` 后踏入**——按真人顺序：先面对要打的东西，再逼近。
- `warp` 只在**动作自身时钟**上推进（`phase/time` 归一化），故整个 move 顺带服从 `animationSpeed`、暂停键与 hit-stop。
- 变形**不写 transform**：只求解身体应处位置，真正落位由唯一权威 `ThirdPersonController`（`_applyAttackWarp`）
  写入 `character.position` 并设 `facing`，同时清速度（停脚）。
- **平滑**：approach 用 `smootherstep(t)`（端点零速度零加速度避免 snap）；转身走**最短弧**（euclideanModulo）。
- 触发帧：`phase >= config.hitAt`——命中帧**以动作自身时钟为准**，并与屏幕实际姿势对齐（hit-stop 从此触发仍不偏位）。
- **命中检测在触发瞬间复测**（`_strike`）：`hypot` 超 `config.reach` 则视为挥空，防止打到已死/已不在位的目标。
- `canStart()` 门控：身体在地面、既非跳跃也未在挥其他招——"同一骨架两个招式同时占姿势=汤"。

**接触/手感三连**（README 与 `App#_onStrike` 语义一致）：同一帧做三件同拍的事——身体交布娃娃、世界降至
`hitStopScale` 的 `dt`（**hit-stop 是对 dt 的缩放而非暂停**，故动画/布娃娃/雾一起慢，而镜头抖动按真实时间走）+
镜头 `shake`。

### 4.4 无物理引擎布娃娃：`Ragdoll.js` 实证

核心论点：布娃娃眼之所见 = `骨长不变` + `肢体不能反向弯` + `重力 + 地面挡路`，三样全是**距离约束**，
而"距离约束正是 PBD 四行能解的东西"。于是**骨架变成每关节一个粒子、骨变成约束，每个子步松弛数次（`iterations`）**。
求解用 **PBD（position-based）而非纯 Verlet**：predict → project → 从修正量读回速度——此形式可忍受 hit-stop/暂停时钟而不爆炸。

三样让它不读成"绳子"：
- **质量（Mass）**：`WEIGHTS` 存**逆质量**，`Hips:0.35` / `Spine:0.45` 重，手脚 `DEFAULT_WEIGHT 1.35` 轻。
  约束修正按该比例分，故手臂甩出而躯干几乎不觉。
- **支撑（Bracing）**：`BRACES` 一行行跨髋/胸/脊柱的额外约束（Hips-Spine1、Spine-Spine2、Spine1-Neck、双大腿互连、
  双肩/双臂互连等），让躯干保有一个"想保持的形状"。
- **限位（Limits）**：`LIMITS` 对髋→踝、肩→手设**距离上下限**（`0.42`/`0.38` 等），`STRAIGHT=0.995` 略低于伸直，
  阻止膝盖反弯/彻底折平——对铰链的廉价替代。

**回到骨架（pose back）**：粒子是点、骨需要旋转。每根骨**朝其子粒子 aim**（`setFromUnitVectors`），保住死亡姿势的
轴向自转（twist）；而 `FRAMES`（Hips/Spine2）有两条独立方向可用，**从该帧重建完整 3-DOF 朝向**——否则趴/仰同 aim 向量、
尸体会侧躺。写回按"父先子后"。

交接**不是混合**：mixer 在半帧被停，求解器初始姿势 = 中招时 clip 正在显示的姿势——死亡才像同一具刚还站着的身。

切尸：`include`/`collide` 两个 Set 让上下半各自只模拟自己显示的关节，`SIZES` 给出每关节的碰撞粗糙球，
两个半身互撞不会内爆。

### 4.5 能力系统（三能力共用屏幕空间 `TargetMarking`）

`TargetMarking.js`：**屏幕空间而非世界空间**——候选 = 在玩家屏幕瞄准点附近者，最近者胜；容差是**屏幕高度的分数**，
故是"看"而非"像素搜寻"；瞄准点初值屏幕中心（与轨道相机的中心手势一致）。瞄准点即光标。

- **影子 `ShadowCharacter.js`（V）**：`SkeletonUtils.clone` 克隆整具 rig（含骨上挂件），**每个材质替换为单一黑面**
  （fresnel rim 防黑体读成屏幕上的洞）。克隆节点本地变换逐个从原节点拷贝，故转向/步态同步。生命周期
  emerge（**站在角色内原位生出**，滑到身边标记）→ crouch（`settings.shadowCharacter.crouch` 蹲踞一拍——两步踏出、
  站稳、*然后*才动的节奏点）→ hunt（一影一敌不重、`hunt.speed` 追击）→ strike（**用玩家自己的 `Attack` 招式**、
  按该招数值抛射：滑斩同样跑着倒地劈过）→ dissolve（噪声从脚烧起，rim 紫色）。
  **故意不给同拍**：无 hit-stop、一半 shake——hit-stop 是玩家自己的一刀卖回给自己，替身于三十米外挥出时冻结世界读成卡顿。
- **审判 `Judgement.js`（C）**：六拍 `open`（印章逆时针自顶写出一整圈，`SummonSeal.js`）→`charge`（收紧变亮、让打击显得
  "必然"而非突发——去掉就像弹丸）→`fall`（**`t^2` 加速下落**，掉落物的真实物理）→`impact`（单帧：放倒、世界近停、镜头踢、
  地裂 `ShockRing` + 尘土 `DustBurst`）→`dwell`（停半秒=最廉价的重锤感）→`withdraw`（上提破印折叠）。
  **全招核心**：拳头穿环形若打成"道具"只因环不是"洞"——所以拳头材质**丢弃密封条平面上方的每片碎片**并在穿越处烧线，
  前臂在**顶点着色器里拉伸**恒达标定平面（多高挂都行）。屏幕上永远是"手臂穿洞而过"，任何高度、下降任一点、无关键帧。
  光（`PointLight`）不 cast——只为两秒存在的光重渲影贴图比其余加起来都贵。
- **飞行 `BladeStorm.js`（X）**：三能力里唯一的**模式**、唯一排他者（`flight.flying` 时 `ThirdPersonController._fly`
  直接 `return`，其下全不跑）。升空三件事同时发生：离地、瞄准上线（下个 click 即标记）、收起地面的一切。
  每点一个敌**从当前实装武器克隆锻造一把刀**（同钢/同 temper line/同柄缠/同月光），叠加 fresnel rim 与"写入空气"的
  **阈值扫描（ragged noisy 前缘，绘出而非闪现）**——"你认得的物体 + 发生了些事"读为"刀在做某事"，换成替换材质则读成
  "刀形道具"。五拍 forge→hold（环形驻位充能，中央光读充能）→**wind（后仰以蓄力，约四分之一秒，开火无此即空）**→
  strike（沿自身拉伸 smear、**穿过**敌人、`onStrike` 放倒之并掠过）→plant（扎进地面如音叉振响、从写入处烧回）。
  **逐一离场（stagger）**，是六杀与一个事件的区别。瞄准每次点击自重启（此模式下标记即玩家在做的"事"）；
  Space 释放，落地 = 释放仍挂的刀（玩家标记过，落地丢弃是夺走）。

### 4.6 体积燃烧武士刀（`WeaponFire` / `DistanceField` / `SurfaceSampler` / `VolumetricFireMaterial` / `EmberSystem` / `BladeHeat`）

`WeaponFire` 用**体积而非骨骼**瞄准：`box` 是武器自身坐标系里的**定向包围盒**（`EmitterBox`），盒内每个模型面都在发射
（`settings.fire.box`；起始 = 模型自身 bbox 即整刀燃烧，可缩到只留刀刃冷刀柄）。一个 `SurfaceSampler` 把盒选中的面拍平
成三角形池（池以 `maxEdge=0.018m` 细分，使"质心在盒内"即"三角形在盒内"至毫米精度），此后一切只是**同一池的不同读法**：

- **`DistanceField`**——把池烘焙成"钢离这里多远"的**有向距离字段（UDF）3D 纹理**，`VolumetricFireMaterial` 借着它
  **raymarch 黑体体积**——这使它读作"刀在烧"而非"刀周围的火盒"。烘焙两步：表面 stamp 精确距离（每体素约 1 样本、行走
  每个面）→ 双程 **3-3-4 chamfer sweep** 把种子向外扫成满场（两遍线性、避开体素×三角形的直解）。值存 `distance/band`
  （byte/体素 ≈ 毫米精度），窗外钳成"远无火"。`uTime` 驱动，`onBeforeRender` 取"本次绘制"的相机避免一帧视差。
- **`EmberSystem`**——按面积从池里取三角形抛火星（`EmberSystem`），故每粒余烬都脱离模型的一个真实面。
- **`BladeHeat`**——让盒内钢**白炽化**，武器成为光源而非立于火中的暗道具。

三者经同一 `blackbody()`（`shaders/lib/blackbody.glsl.js`：Tanner Helland 分段近似、线性工作空间、`radiance()` 用
Stefan-Boltzmann `T^4` 给动态范围）在同一温标放射——冷却火星、羽边缘、发光刀脊同温同色，整效果读成"一个物体"而非三层。
每帧读武器世界矩阵与上一次之差，得出每射线的求解帧 + **刀自身速度**（从浮力中减去 → 静止直冒、挥动后掠、
越快越长越扁，一个 uniform 火随动画应答）。hull 是"能装下体积的空盒"，形状来自距离场、march 窗在盒内解析求解。

### 4.7 装备工作室（`EquipmentManager` / `EquipmentCatalog`）

`Tab` 进入 = `CharacterScreen.active` 切换后处理绘制哪场、哪相机、哪色调块、哪条 update 路径——**是模式非场景图技巧**，
同一骨架 / 同一 mixer / 同一装备挂载在两处都在屏上（此处调对、野外即对）。

- **目录即整个内容层**（`EquipmentCatalog.js`）：加一把剑 = 一个条目 + 零处代码。`weapons`（将来长规则：拔/收、持手、
  伤害）与 `attachments`（纯装饰，永不）刻意分离。实例：`sword`（默认装备且 `locked`）挂 `RightHand`、
  `scabbard`（Hips）、`potion`（Spine）——共 3 件。
- **懒加载**：`EquipmentLibrary` 未请求不下载（boot 路径不受目录规模影响），工作室打开后后台预取。
- **穿身体的材质**：这些 GLB 嵌入的正是角色调色板已带的 4 张 1024² 图（同一 Blender 场景），`MaterialLibrary` 按名解析、
  释放导出自身材质——**零额外纹理内存**，装备与盔甲同材质同光照。
- **挂载（mount）与米制偏移**：rig 是 Mixamo FBX 厘米制，经 `fbxScale` 又到 `targetHeight`，关节世界缩放约 `0.01`；
  直挂骨上会小一百倍。所以每件**挂到 mount 而非关节**，`mount.scale = 关节世界缩放的倒数`，**mount 内一切即米**，
  数字在 `targetHeight` 变动后仍成立。`attach('sword','RightHand')` 直挂骨也可用；骨以原始名 + 去命名空间双索引入 `bones`。
- 解锁镜像：一个片可沿中心轴三向折叠（`normaliseMirror`），一手调好的鞘经反射即另一手，不重复造条目。

### 4.8 环境：程序化地形（`Terrain` / `terrain.glsl.js` / `Ground`）+ 天空体系

**为何用 256×256 字节查找表而非 `snoise`**（源码反复强调）：过程哈希 `fract(sin(x)*43758.5)` **在 GPU 与 JS 上不一致**
（差几位小数 = 几厘米地形 = 角色陷进山坡）。而字节表 `NEAREST` 采样在两侧**严格返回 `byte/255`**，后续全是普通浮点、
误差 < 微米。`terrainHeightAt(vec2)` 是"地面在哪"的唯一答案，`Terrain.js` 逐行镜像同一算术；floor 顶点着色器、落叶、
角色、相机锚、联系阴影、太阳阴影焦点全从它取高。表以 `RGBA` 打包每格四角（**一次 fetch 取四邻**，直降 4× 热内存流量）；
新 seed 用 mulberry32 重洗整表（改变地形形状而非平移）。每格 4 字节把四角装进一个 texel，`NEAREST` 无 mip，
着色器自做插值——CPU 才能复现。

两个配套否则地面"沸腾"：
- **Swimming**：`Ground#setCenter` 把平面**吸附到整顶点间距**，使每顶点恒落同世界位、网格在不变表面下滑。
- **法线**：由场**中心差分解析**、取恰半顶点间距，着色绝不宣称三角承担不了的细节；叠上平铺法线贴图。

`Sky`：一个全屏 shader——地平线 = 雾色的渐变、cell-hash 星场、月亮。它**独占月亮位置**，`moon.azimuth/elevation`
解析进 `frame.uLightDir`，圆盘/眩光/雾内散射叶/地面雾受光侧永一致。`Moon`：实体球 + 真实月面材质，**object-space
三平面投影**（1024² 方形贴图球面 UV 会缝脸、挤极点陨石坑）、高度图**实际位移顶点**（陨石坑缘破剪影而非画在圆上）。
`Atmosphere`：解析高度雾积分 + 月向前向叶（比线性雾每片多一次 `exp`）。`GroundFog`：顺风软板片、随龄扩散、
读地板烘焙高度场贴地并可溶入（整条轨迹顶点着色器闭合解，CPU 只写过期槽）。`Leaves`：5600 片落 + 260 飘、一 sheet 九叶、
**opaque + alpha-test**（写深度免排序、一 draw call 一片），走体扫开后散（位置 + 地速原样传入）。

---

## 5. 性能 / 工程要点（源码/注释求证）

- **方向光阴影 4096²**（`Environment.js` `mapSize.set(4096, 4096)`），`shadowExtent` 半宽可调、52 m 盒 →
  ~1.3 cm/texel，并**按整影图网格吸附相机位置 + 远离焦点定光位**——"**shadow crawl（飘边）的唯一修复**"：
  边缘 texel 不再独立翻转（见源码注释）。阴影盒近 0.5、远 520，`_fitShadowCamera` 防幅度切换突变。
- **联系阴影 256px 三遍**（`ContactShadows.js`：`resolution = 256`、renderTarget + 双向 blur 各 256，
  `h = amount / 256`）——补阳光影图解不了的脚底紧贴暗。注释明言 "costing three 256px passes per frame"。
- **帧序即架构**（`App.js` `frame()` 实证，与 README 编号逐条吻合）：Terrain → Air/Sky/Moon → Controller →
  GroundHeight+Character → Enemies→rings→marks → Equipment→WeaponFire→Shadows→Judgement→Blades → Floor→Fog→Leaves →
  Camera（真实时间）→ ShadowMap/Grade/Post。**单向、无子系统回指 App**，每步的产物恰被下游读取。
- **live-editing 单一规则**：系统只许**每帧采样** settings 字段、不许构造时快照拷贝。故 lil-gui / `Editor.js` 无数
  `onChange` 处理器，滑杆下一秒重打光、无重建无着色器重编译；暂停（P）时仍可摆 pose。preset 合并进活对象而非替换，
  着色器/灯光持有的绑定恒有效。
- **约 66 个 draw call** 装下一整台舞台（README stats 段：地形、落叶、飘叶、雾、五敌、烧刀 + 全后处理链）。
- **零拷贝材质**：装备复用身体材质 → 零额外纹理内存；vfx 共享同一 `blackbody()` 温度标尺防三层漂移。
- 每帧热点数据刻意优化（地形表 4× 打包、chamfer sweep 两遍线性）体现 CPU/GPU 一致性的成本上限控制。

---

## 6. 优点 / 局限 / 值得学习之处

**优点**
1. **架构即文档**：`App.js` 一帧的顺序就是全文架构；`settings.js` / `abilities.js` 两条契约文件让"加招式/调数字"
   变成纯 data edit，`Editor.js` 零 onChange 靠"每帧采样"。极强的可读性 + 模块化（78 模块每文件单一职责）。
2. **原理克制而深刻**：作者在每个"听起来该上引擎库"的地方用数学 / 着色器解决——无物理库做 PBD 布娃娃、
   距离场 + raymarch 做体积火而非粒子贴图、屏幕空间标记做锁定、mount 缩放做米制挂装。
3. **扎实的工程细节**：shadow crawl 的相机吸附修复、`onBeforeRender` 取当帧相机防视差、地形表保 GPU/JS 位一致、
   相位锁防走跑混叠、黑体同温标统一火焰层次——都是教科书级注释的反面痛点的对症答案。
4. **性能意识强**：66 draw call 全舞台、4096² / 256px 阴影分层、NEAREST 字节表 4× 打包、alpha-test 叶子免排序。

**局限**
1. **单作者短生命周期项目**：仅 6 commits、2026-08 创建、无 CI、无 discussions、无 issue、无 wiki。
2. **模板性 > 内容完成度**：只有 5 个敌人、3 招近战、3 能力、3 件装备（1 武器 + 2 饰品），作为"完整动作
   游戏"仍是**系统演示级**而非内容成型；它更像一份"第三人称动作模板的教学样板"。
3. **部署/分支细节含糊**：默认分支 `main`，与本地仓库 `git status` 所示 `master` 不一致（推断：fork/重命名
   历史遗留）；无已发布构建产物、无 API/脚本文档，仅 README 长文。
4. **纯 JavaScript 无类型**：78 个模块靠 JSDoc 类型标注，无 TS 编译期保障，大改时依赖作者纪律。

**值得学习之处**（对团队/个人最有用）：
- **PBD 布娃娃三件套**：质量（逆质量分配）+ 支撑（BRACES）+ 限位（LIMITS），再把粒子重建成骨（aim at child +
  帧重建全朝向）——证明"不挂物理引擎也能出布娃娃手感"。
- **运动变形三阶段**（turn → step → hit）与"控制器唯一落位"解耦——`Attack` 只解析该处、`Controller` 才写 transform，
  天然兼容 hit-stop / 暂停 / 变速。
- **CPU/GPU 地形一致性**用 256×256 字节查找表化解（`NEAREST` 严格返回 `byte/255`，双方位一致到微米）——
  是"共享算术而非共享浮点舍入"的经典范本。
- **"每帧采样而非构造时快照"** 的 live-editing 规则——滑杆零 onChange 重打光、暂停可摆 pose。
- **颜色统一走物理温度标尺**（同一 `blackbody()`）：火焰/余烬/白炽钢在同一温标，天然不漂移。

---

*（完）本笔记所有代码路径均相对仓库根 `src/...`；依赖/统计来自 GitHub API 实时读取，非记忆推断。*
