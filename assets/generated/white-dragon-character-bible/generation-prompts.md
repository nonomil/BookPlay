# 小白龙阶段图生图记录

## 调用记录

- 后端：CliproxAPI（OpenAI Images 兼容接口）
- 模型：`gpt-image-2`
- 请求尺寸：`1024x1024`（接口返回尺寸以真实图片为准）
- 响应格式：`b64_json`
- 背景策略：纯色 `#00ff00` chroma-key；主体不得使用幕布绿
- 去背：`chroma_key.py --key 0,255,0 --tolerance 180 --feather 8`
- 密钥：仅通过当前 PowerShell 会话的 `CLIPROX_API_KEY` 注入，未写入本文件、项目或日志

## 通用提示词

```text
Use case: illustration-story. Asset type: child learning companion game asset. A gentle Chinese fantasy white dragon companion named Xiao Bailong, pearl-white scales, aqua teal cloud markings, small gold horns, warm dark-brown eyes, rounded friendly proportions, clean polished 2D storybook illustration, soft rim light, plain pure #00ff00 chroma-key background, single centered character, complete subject, safe margins, no text, no logo, no watermark.
```

## 阶段补充提示词

| 阶段 | 补充提示词 |
| --- | --- |
| `mysterious-egg` | West Sea cloud-pattern dragon egg, rounded pearl-white egg with aqua teal cloud markings, gentle inner glow. |
| `awakening-egg` | The same dragon egg, one soft warm-gold crack at the top, still clearly an egg, friendly and calm. |
| `west-sea-hatchling` | Young Xiao Bailong, short horns, rounded snout, small fin-like wings, seated pose, holding a tiny cloud. |
| `white-dragon-revealed` | Adolescent Xiao Bailong, three-quarter standing pose, aqua scales and white belly, tail curling into a cloud motif. |
| `white-dragon-horse` | White Dragon Horse, pearl-white horse body, same eyes and small gold horns, mane with aqua cloud markings, standing pose. |
| `cloud-riding-dragon` | Light cloud-riding transition between white horse and dragon forms, two soft clouds under the feet, clear joyful motion. |
| `eightfold-heavenly-dragon` | Mature Eightfold Heavenly Dragon celebration form, white-gold scales and a soft pale-gold halo, dignified and friendly, never intimidating. |

## 负面提示词

```text
photorealistic, scary, sharp fangs, aggressive attack, weapon, armor, dark horror, extra characters, duplicate limbs, text, Chinese characters, watermark, logo, opaque background, checkerboard pattern, green object on the character.
```

## 质量门

- 四角 alpha 必须为 0；输出必须有真实 alpha 通道。
- 主体可见区域不得残留幕布绿；边缘绿残色需要人工复核。
- 保留真实接口返回尺寸与 SHA-256，不按请求尺寸或扩展名猜测。
- 页面优先使用 PNG；同名 SVG 仅作为无法加载 PNG 时的兼容回退。
