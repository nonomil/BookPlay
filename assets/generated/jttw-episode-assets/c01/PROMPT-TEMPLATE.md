# 四方向动态分镜提示词模板

把 `{CHARACTER}`、`{EPISODE_PROP}` 和 `{STYLE_CUES}` 替换为每集 `manifest.json` 中的角色与动作道具。生成时保留本文件和最终响应元数据，便于复用和追踪。

```text
Transparent-ready 2D storybook game sprite sheet for Journey to the West learning mini-game.
Character: {CHARACTER}. Preserve the character bible identity, species, age, silhouette,
costume layers, signature palette and prop. Episode action cue: {EPISODE_PROP}.

Create exactly one 8-column x 4-row sheet, four true directions in this row order:
east, south, west, north. Each row has exactly eight equal portrait cells. Cells 1-4
are an in-place walk cycle: contact, left-foot-forward, passing, right-foot-forward.
Cells 5-8 are a child-safe story action: anticipation, action-open, action-peak, settle.
Keep one character per cell, fixed orthographic camera, same scale and shared foot
baseline; do not crop hands, feet, tails, horns or props. East/west are true side views,
south is the face, north is the back. No three-quarter views.

Flat chroma-key green background only for the source sheet; no scenery, text, logo,
watermark, checkerboard, fake transparency, cast shadow, matte green pixels, blood,
injury, frightening face, motion blur, duplicate limbs, stretched oval body or extra
characters. Remove the chroma key to true alpha and export the master sheet plus
individual frames/GIFs. Keep every action prop as a separate layer when possible.
Style cues: {STYLE_CUES}.
```

质量门槛：32 个格子都必须可读，四行方向不能重复；同一角色的头身比、脚底线、服装和主色不可漂移。若某个小角色缺少稳定身份，先生成一张中性角色参考图，再生成四方向分镜。
