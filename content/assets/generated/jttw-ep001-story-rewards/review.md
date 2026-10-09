# EP001 故事奖励资产审查

状态：已生成并通过透明素材质量门（2026-09-03）。

## 生成与来源

- 通过统一入口 `gpt-image-workflow/scripts/bee_image_workflow.py`，provider=`cliprox`，直连 `https://rn6.nonom.top/v1`。
- 使用 pinned CA 验证 TLS；没有使用本地代理、`verify=False` 或 `curl -k`。
- 七张图均以 EP1 绘本页、scene 小节、重点词和小白龙角色圣经为提示词依据；PNG 内不生成文字，双语标题由运行时叠加。

## 交付素材

| 奖励 | 运行时 PNG | 尺寸 | PNG 字节 | WebP 字节 | 目检 |
| --- | --- | ---: | ---: | ---: | --- |
| 仙石碎片 | `transparent/jttw-ep001-stone-shard.png` | 1254×1254 | 922,955 | 585,816 | 通过 |
| 天光珠 | `transparent/jttw-ep001-heaven-light.png` | 1254×1254 | 686,159 | 438,556 | 通过 |
| 桃核 | `transparent/jttw-ep001-peach-pip.png` | 1254×1254 | 523,107 | 334,828 | 通过 |
| 小溪水花 | `transparent/jttw-ep001-stream-splash.png` | 1254×1254 | 2,411,856 | 319,824 | 通过 |
| 瀑布门 | `transparent/jttw-ep001-waterfall-gate.png` | 1254×1254 | 2,063,411 | 217,540 | 通过 |
| 勇气彩带 | `transparent/jttw-ep001-brave-ribbon.png` | 1254×1254 | 1,916,126 | 170,590 | 通过 |
| 水帘洞信物 | `transparent/jttw-ep001-water-curtain-token.png` | 1254×1254 | 1,906,960 | 159,428 | 通过 |

模型实际返回 1254×1254（请求为 1024×1024），未做放大；运行时使用 PNG 以保证 Android WebView 兼容，旁边保留 WebP 供后续包体评估。

## 质量门证据

- 七张 PNG 均为 RGBA，四角和最外圈 alpha 非零像素为 0。
- 与 #00ff00 的 RGB 距离小于 40 的残留像素为 0；去背参数为 solid-color、tolerance=120、feather=2、trim=false。
- alpha<64 的半透明像素为 0；对象四周保留安全绿幕留白，避免贴边裁切。
- 绿色主色像素仅为物体内部有意保留的翡翠色水彩纹样，不是绿幕残留。

## 接入范围

- `content/rewards/jttw.json` 的 EP1 三个大件奖励与 1–7 关贴纸已切换到本目录透明 PNG。
- `prj/tools/pack_datapack.py` 与 `prj/tools/pack_android.py` 已将七张 PNG 和两张故事页纳入数据包/Android 数据树。
- 原有故事视频、绘本页和音频未修改；奖励图只在知识巩固首次领取时显示。

SHA-256、完整生成记录和提示词见同目录 `manifest.json` 与 `source/`。
