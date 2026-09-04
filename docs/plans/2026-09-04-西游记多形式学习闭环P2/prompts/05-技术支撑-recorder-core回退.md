# 任务：趣配音录音兼容回退——vendor recorder-core（P2 ⑤，仅 5a 部分）

项目根目录：`G:\Game\BookPlay书戏`（儿童英语绘本播放器，原生 JS + Capacitor 打包）。

> 本任务只做 5a（recorder-core 兼容回退）。5b（Demucs 伴奏轨）是 P3 数据包项目，需要 Python/Demucs/ffmpeg 真实批处理音频，见 `docs/plans/2026-09-04-西游记多形式学习闭环P2/05-技术支撑.md` 的 5b 节，不要在本任务里顺手做。

## 第一步：先读这些（不要跳过）

1. 方案：`docs/plans/2026-09-04-西游记多形式学习闭环P2/05-技术支撑.md`（重点 5a 节）与 `00-总览.md`
2. 现状代码：`prj/engine/dub-recorder.js`（engine 选择点：`chooseMime`、`capabilities()`、`start()` 的分支）、`prj/engine/dub-recorder.test.mjs`（假 env 注入模式）、`prj/engine/dub.html`（script 引入区）
3. 上游库：npm 包 `recorder-core`（xiangyuecn/Recorder，MIT）。本机 `node_modules` 没有它——用 `npm pack recorder-core` 或从 jsdelivr/unpkg 下载 `recorder.mp3.min.js` 单文件；**不要**整包安装进项目依赖。

## 要做什么（TDD：先写失败测试再实现）

1. 新建 `prj/engine/vendor/` 目录：
   - 放入 `recorder-core.mp3.min.js`（单文件 dist）；
   - 写 `prj/engine/vendor/README.md`：来源 URL、版本号、MIT 许可、"保留原头注释"说明。
2. 修改 `prj/engine/dub.html`：在 `dub-recorder.js` 之前引入 `<script src="vendor/recorder-core.mp3.min.js?v=1"></script>`。
3. 改造 `prj/engine/dub-recorder.js`（对外合同 `{capabilities, start, stop, cancel, snapshot}` 不变）：
   - `capabilities()` 增加 `engine: "media-recorder" | "recorder-core" | "none"`；
   - 选择顺序：MediaRecorder 存在且 mime 协商命中 webm;opus/webm → media-recorder；否则 `env.Recorder` 存在 → recorder-core（mp3，`bitRate:64, sampleRate:16000`）；都没有 → none；
   - recorder-core 分支：包装 `Recorder()` 实例的 `start()/stop()` 回调为既有 `{ok, blob, mime:"audio/mp3", sec}` 合同；stop 后调用 `destroy()`；错误映射沿用 `not-allowed/no-mic/busy/no-data`；
   - 释放语义：cancel/stop 后必须释放麦克风（recorder-core 分支调用其关闭/destroy 逻辑，media-recorder 分支维持现有 track 释放）。
4. 扩展 `prj/engine/dub-recorder.test.mjs`：
   - 假 `env.Recorder`（带 `reqStart/reqStop` 可控行为）存在且 MediaRecorder 不可用 → `engine:"recorder-core"`、start/stop 走该分支、blob mime 为 audio/mp3、destroy 被调用；
   - 两者都不可用 → engine:"none"；
   - MediaRecorder 可用时优先 media-recorder（即使 Recorder 也存在）。
5. 回归确认 `prj/engine/dub.js` 无需行为改动（仅按 `capabilities().mic` 判断的地方继续成立）；若 dub.js 有对 mime 的硬编码假设（webm），核对并放宽为按返回 mime 处理。

## 硬性约束

- `dub-recorder.js` 对外合同与既有测试不得破坏（既有 6 个用例必须继续全绿）；vendor 文件不参与 node 测试（测试全部用注入假构造器）。
- 不要把 recorder-core 加进 `package.json` 依赖（保持零运行时依赖，vendor 单文件方式）。
- 完成后必须：`npm test` 全绿零失败（测试数随特性递增，只许增不许减）；`node --check` 新改 js；`npm run android:prepare` 后确认 `dist/engine/vendor/` 存在且 dub.html 引用正确；更新 `docs/plans/2026-09-04-西游记多形式学习闭环P2/00-总览.md` 状态表；写 `docs/reports/2026-09-XX-recorder-core回退验收.md`（真机待验项：老安卓 X5 实录 mp3 可回放）。
- 不要 git commit（由用户决定）。
