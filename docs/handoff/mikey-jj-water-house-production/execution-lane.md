# Execution lane

1. `Test-Environment.ps1`
2. `Test-DshContractRevision.ps1` revision 1
3. `node --test prj/engine/storybook-route.test.mjs`
4. 读取任务卡、recent-context、manifest、book1 schema、3 个既有脚本和 Water House 精确输入；修改前最多 10 次 read/glob/grep。
5. 所有 OCR/ASR 中间物写新任务 `evidence/`；首件只做第 1 页和至少一条句音频。
6. 首件通过后完成 10 页、句音频、重点词与 5 道测验。
7. 运行结构测试、ffmpeg 首/中/末抽样、正式双视口和测验交互；写 result.json。

停止：文本/边界不确定、输入身份矛盾、基线失败、需要修改播放器 CSS/JS 或超出 Water House 时立即返回精确 blocker。
