# 测试、验收与优化验证方案

所有命令从仓库根 `G:/Game/BookPlay书戏` 执行；Android命令明确给出 `-p android`。本文件是后续验收设计，除审查报告已列出的检查外，**以下新增测试、真机操作与性能指标均尚未执行**。

## 1. 验收层级与环境

| 层 | 输入 | 应覆盖 | 通过条件 |
|---|---|---|---|
| L0 源码 | 干净检出+固定依赖+仓库内小fixture | 状态机、Range解析、存储、题目判定、打包选择 | 无媒体/个人技能目录也能复现；0未解释失败 |
| L1 内容 | 指定版本content及manifest | 引用、题目证据、音频索引、时间轴、发布集合 | 必需路径缺失0；数据合同0错误 |
| L2 Web | 隔离浏览器profile+真实serve.py | 点击→媒体→存档→巩固→奖励 | 无未处理异常/必需404，关键行为真实断言 |
| L3 原生 | JDK/Android SDK+Mobile/TV flavor | Range、来源切换、权限、生命周期 | 单测与instrumentation通过，真实设备操作留证 |
| L4 成品 | 确切APK与ZIP hash | 解包闭包、首发、导入、升级、离线 | APK内生产依赖完整，数据包对应版本，发布收据齐全 |

浏览器最低矩阵：Chromium桌面1440×900、手机视口390×844、横屏844×390、平板1024×768；每次固定版本。真实设备最低矩阵：一台常用/低内存Android手机、一台Android TV/盒子；记录Android与WebView版本。若要承诺Android15兼容，补Android15实机/模拟器沉浸栏验收。模拟器不能替代真实音频/遥控体验。

数据矩阵：完整本地content；starter三首本；jttw-only；c01外置ZIP；同内容解压SAF目录；旧有效包；错误包/损坏清单/权限撤销。真实源测试只读原包，故障样本复制到临时目录。

## 2. 现有可执行命令

```powershell
npm test
python -X utf8 -m pytest prj/tests prj/tools -q --disable-warnings
python -X utf8 prj/tools/validate_data.py
python -X utf8 prj/tools/validate_storybooks.py
python -X utf8 prj/tools/validate_storybook_quiz_evidence.py --root prj/data/storybooks-mikey-jj prj/data/storybooks-minecraft
```

当前预期基线是339 Node通过、Python243通过/5失败；优化结束目标是全部适用用例通过且五个失败关闭。测试数量可因合理重组变化，必须解释增删和覆盖，不能简单要求数字只增。

## 3. 新增后才能运行的测试入口

T01创建`requirements-test.txt`/marker/verify-project；T03创建Range与TTS并发测试；T04创建存储/删除集成测试；T05创建构建fixture；T07安装并锁定Playwright/配置/用例。以下命令是对应任务产出合同，当前不要当成已存在入口：

```powershell
python -m pip install -r requirements-test.txt
powershell -File scripts/verify-project.ps1
python -X utf8 -m pytest -m unit -q
python -X utf8 -m pytest -m content -q
node --test scripts/prepare-mobile.test.mjs
node scripts/verify-mobile-dist.mjs
npx playwright test --project=chromium
.\android\gradlew.bat -p android testMobileDebugUnitTest testTvDebugUnitTest
.\android\gradlew.bat -p android connectedMobileDebugAndroidTest
.\android\gradlew.bat -p android connectedTvDebugAndroidTest
```

浏览器依赖安装按固定lockfile执行；设备命令在设备可用后运行。`npm run android:build`会改变版本并生成/清理打包目录，应在T05约束完成后作为发布步骤，不能当只读审查命令。

## 4. 具体验收用例

### A01 首发内容可达性（T02/T05/T07，P1）

1. 在新测试profile/清洁测试安装下启动starter，点击西游记EP1、Minecraft1、Mikey1。
2. 每个都实际进入、加载首图与首句，手势后发声；点击下一集/本。
3. 切换jttw-only成品重复；已排除系列不得显示可用，仍可通过导入入口获得支持内容。

预期：starter三首本可进入；第二集/本显示明确导入提示；jttw-only只保证西游记EP1。不接受通过直接输入URL绕过错误门禁来验收。证据：profile/manifest、三条导航trace、网络请求和对应声音人工确认。

### A02 导入状态与来源一致（T02，P1）

依次选择取消、任意非包文件、缺必需条目的ZIP、正确c01 ZIP；每次检查提示与当前URI；正确导入后点EP2并重启应用再进入。选一个与旧自动发现目录存在同名但不同内容版本的合法包，确认使用显式选择来源。

预期：取消不报成功；无效包不取代旧有效包；导入完成能力集合包含真实内容、目标可打开；权限撤销有明确恢复操作；无内置就绪掩盖错误。录屏、来源状态、实际ep2响应hash作为证据。

### A03 HTTP Range/HEAD（T03，P1）

使用100字节`0..99`样本；Python服务与Java解析共享fixture；原生流服务再对内置、ZIP、SAF三类源抽查。

| 请求 | 预期 |
|---|---|
| GET无Range | 200，100字节 |
| bytes=0-16 | 206，17字节，Content-Range 0-16/100 |
| bytes=90- | 206，10字节，90-99/100 |
| bytes=-10 | 206，10字节，90-99/100 |
| bytes=95-999 | 206，5字节，95-99/100 |
| bytes=100- | 416，Content-Range bytes */100 |
| bytes=20-10 | 按明确非法范围策略拒绝；不返回负长度206 |
| bytes=-0/空文件/超大整数 | 不崩溃；确定的拒绝或忽略策略，有测试 |
| bytes=0-1,4-5 | 明确多段策略；若不支持则完整200，不能谎报一个不完整206 |
| HEAD | 与GET相应元信息，body为0 |

再用真实视频seek到非零时间、末尾，观察currentTime推进及声音/画面。响应头正确但实际body短缺仍为失败。

### A04 录音保存删除（T04，P1）

录3秒→保存→回放→删→列表/数量检查→刷新/重开→再次录；内存后端、正常IDB、IDB删除异常三种模式都执行。故障注入只在隔离profile。

预期：删除成功实际Blob不存在且metadata不存在；删除失败保留条目、显示重试；不会显示虚假“已删除”；重复删幂等。内存模式刷新丢失是预期，但必须提示本次有效。检查对象URL回收和无孤立记录。

### A05 进度/奖励/权限生命周期（T04/T07，P1）

EP1学习若干句→退出→重开→回到合理节点；单集巩固错答后重试→达标→刷新/再提交；注入损坏JSON、旧schema、null/数组、QuotaExceeded；麦克风权限pending时重复开始并离页，随后允许权限。

预期：原进度不被清空；迁移幂等；同一奖励不重复发；不达标不提前解锁；存储失败可继续且明确未保存；迟到stream停止、无后台录音。保存前后状态快照，不修改真实用户存档。

### A06 内容与学习全链（T06/T07，P1）

完整数据模式抽EP1/54/108和c01/c02边界；每系列首本/末本；新增题100%逐项核对来源证据、答案和双语口播。执行播放→词卡→巩固→奖励→返回地图；包模式只对宣称包含集验收，未包含集应显示门禁。

预期：全部112题机器合同校验持续通过（数量变化需版本记录）；已发布音频引用100%完整；题型必需声音飞行模式可用；不把TTS临时联网成功算离线通过。旧未修改题每本至少2题人工抽查，有异常扩到整本。

### A07 多媒体/TV/焦点/安全渲染（T07/T09，P2）

音乐开关→朗读→点词→切页→返回；快速下一句10次；打开内容门禁，方向键/Tab遍历，ESC/返回关闭；切到横屏和大字幕；暂停游戏后切后台再回前台。向测试内容注入HTML事件文本与超长中英混排。

预期：一个前景音源，不串旧句；离页音频停止/恢复规则明确；弹窗焦点不进入遮罩后，关闭回触发控件；按钮不遮挡、焦点可见；reduced-motion有效；注入不执行脚本。保留读词高亮等合法富文本功能。

### A08 Android异常与升级矩阵（T02/T03/T07，P1）

Mobile/TV分别执行：首次启动、飞行模式播放、ZIP随机seek、目录访问、包权限撤销、坏包→好包、前后台10轮、强制停止后恢复、旧版本覆盖安装。端口占用和低内存用测试环境模拟；HTTP32并发后关闭全部连接。

预期：有效内容无白屏；失败有错误类别和恢复动作；线程/流最终释放；存档不丢；Mobile与TV包ID各自稳定（不同flavor不要求共享存档）。未知长度源不得一次无界读入。记录设备、WebView、数据源、APK hash、logcat和录屏。

### A09 性能基线与优化目标（T09，P2）

以下为**建议初始预算，当前没有实测达标结论**。先同设备/同包每项至少20次，冷/热分开记录P50/P95；低端机预算可在M2结束时根据真实基线调整一次并写理由。

| 指标 | 初始目标 | 测法 |
|---|---|---|
| 首页到可操作 | P95≤3秒（已恢复本地资源） | 启动到主入口可点击时间 |
| 首句手势后可听 | P95≤1秒 | 手势时间到playing/实际发声；人工确认 |
| 非零seek恢复 | P95≤800ms | seeking到seeked/playing，ZIP/SAF分别测 |
| 普通页面/题型切换 | P95≤500ms | 点击到目标控件可用 |
| 交互长任务 | 不出现>200ms长任务阻断关键点击 | 浏览器性能采样；真实设备观察 |
| 内存 | 15分钟往返后稳定，不单调增长；PSS相对首次稳态增幅≤20%为调查线 | adb dumpsys meminfo，固定检查点 |
| 同类回归 | 任一关键P95退化不超过10% | 相同输入，优化前后对照 |
| APK/数据包 | 比同profile上一版不无解释增长；jttw精简档如继续承诺单文件<100MB则成品满足 | 明确使用十进制MB，ZIP/APK实际字节 |

有进度提示的导入分“首次反馈”（建议≤300ms）与“全部校验”两个时间，不承诺任意大ZIP固定秒数；记录大小与吞吐。性能改善必须以相同场景对比，不拿不同profile/设备数据证明优化。

### A10 构建与发布闭包（T05/T10，P1）

临时root执行生成测试→生成两profile对应的生产树→解包本次APK→按HTML/动态清单检查必需脚本、媒体、manifest→检查不存在开发测试文件/重复旧树→比较hash与release receipt→实装。

预期：必需缺失0；APK/ZIP/source/profile一一对应；失败构建不产生“可发布”收据；同源重构建资源清单稳定；升级版本可解释，回滚路径明确。文件mtime不作为内容一致性依据。

## 5. 总门禁与例外

- M0允许登记当前5个失败并继续定向修复，发布不允许保留。
- 单个任务的关联P1行为未通过不得done；缺真机/素材标BLOCKED，不能用“理论没问题”关闭。
- 零未处理浏览器异常；必需404为失败；预期门禁或缺可选资源必须单独断言而非把所有404忽略。
- L0–L4适用检查全部通过、内容缺项0、存档升级可恢复、无未关闭P1后才能完成T10。
- 如业务明确缩小发布范围，更新发布清单并验证门禁，再以新范围验收；不能通过隐藏测试缩范围。

## 6. 统一验收记录模板

```markdown
# Txx-Sxx 验收记录
执行人 / 复核人 / 时间：
代码 revision / dirty diff或文件hash：
App版本 / content版本 / profile / APK或ZIP sha256：
设备 / OS / WebView / Node / Python：
关联发现与用例：Fxx、Axx
输入与前置：
实际命令及exit code：
操作步骤：
预期：
实际：
原始日志 / trace / 截图 / 录屏路径：
修复前后对照与性能样本数：
未验证项及阻塞解除动作：
回滚点与数据备份：
结论：PASS / FAIL / BLOCKED（禁止只写“完成”）
```

截图/录音可能包含个人信息，使用隔离测试数据。二进制证据放本地输出目录并在Markdown记录hash和路径，不改变仓库媒体不入Git规则。
