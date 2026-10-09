# 西游故事贴纸与房间收藏素材（v1）

## 生成目标

为 `prj/data/rewards/jttw.json` 中的故事贴纸与篇章纪念物生成一套可复用的 PNG 素材。每个物件独立占一个网格单元，后续由 `split_asset_sheet.py` 切图，再用纯色抠图得到真正带 alpha 的 PNG。图片内不放文字，双语标题由网页 UI 渲染。

## 总提示词（4×3 网格）

Use case: illustration-story  
Asset type: children's learning game reward sticker sheet and room keepsake icons  
Primary request: a 4 by 3 sprite sheet with twelve independent, centered story keepsakes from a gentle Journey to the West learning adventure; each cell contains exactly one object, with generous even spacing and no overlap between cells  
Scene/backdrop: solid chroma-key green background #00ff00 for offline background removal; no floor, no horizon, no cast shadow  
Subject: row 1 — a warm celestial stone with a tiny golden glow, a friendly peach with one leaf, a blue Water Curtain Cave droplet; row 2 — a soft white cloud with a playful swirl, a small bronze journey bell with red tassel, a cute white dragon curled like a companion toy; row 3 — a red-and-gold cloud saddle, a round ginseng-fruit gourd, a flowering peach tree branch; row 4 — a child-safe golden ring, a small banana-leaf magic fan, a smiling river fish friend  
Style/medium: original gentle watercolor storybook game art, rounded child-safe silhouettes, warm pastel palette, consistent medium-weight outline, clear readable shape at 82 px, handcrafted paper texture kept inside objects only  
Composition/framing: front or three-quarter view, centered in each invisible cell, complete object with safe margin, no connecting elements, no visible grid lines  
Lighting/mood: soft morning light, calm wonder, friendly and collectible, subtle highlight without glare  
Color palette: jade green, sky blue, peach, warm gold, coral red, cream white; avoid green close to #00ff00 on the objects  
Materials/textures: watercolor wash, soft paper grain, simple cel shading, no photorealism, no 3D render  
Text (verbatim): ""  
Constraints: exactly twelve objects in 4×3 cells; each object isolated; no characters except the tiny friendly white dragon and river fish; no combat power symbols; preserve clean outer silhouette for chroma-key removal  
Avoid: text, letters, numbers, logos, watermark, UI panels, badges, stars used as currency, coins, weapons with blades, scary faces, sharp cracks, blood, dark shadows, realistic food, extra props, duplicate objects, cell borders, grid lines, checkerboard pattern, background green on the objects

## 网格顺序与运行时映射

| 网格 | 文件基名 | 运行时用途 |
|---|---|---|
| 01 | `stone` | `sticker.ep001` / 仙石 |
| 02 | `peach` | `sticker.ep002` / 仙桃 |
| 03 | `waterfall` | `sticker.ep003` / 水帘洞 |
| 04 | `cloud` | `sticker.ep004` / 筋斗云 |
| 05 | `bell` | `sticker.ep005` / 启程铃 |
| 06 | `dragon` | `sticker.ep006` / 小白龙 |
| 07 | `saddle` | `jttw-ep001-cloud-saddle` |
| 08 | `gourd` | `jttw-ep002-ginseng-gourd` |
| 09 | `tree` | `jttw-ep002-ginseng-tree` |
| 10 | `golden-ring` | `jttw-ep005-golden-ring` |
| 11 | `fan` | `jttw-ep006-magic-fan` |
| 12 | `river-fish` | `jttw-ep004-river-fish` |

## 生图后处理要求

1. 将 API 返回的原始文件放入 `00_raw/`，不要把提示词或响应 JSON 放进运行时目录。
2. 以 4×3 网格切出 12 张，裁透明边并保留 8 px 安全边距。
3. 使用 `chroma_key.py --key 0,255,0` 去除绿色，再用 `publish_transparent_assets.py` 重新读取、校验四角 alpha 和外圈透明。
4. 任何绿边残留、四角不透明、尺寸不可读或对象重复时，整批标记为待返工，不接入 `jttw.json`。
