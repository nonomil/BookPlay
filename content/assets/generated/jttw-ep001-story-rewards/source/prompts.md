# EP001 故事奖励生图提示词

这些提示词以第 1 集绘本页与动画关键帧为参考，目标是生成可去背的单件奖励图。图片只画物品，不画文字、徽章标题或 UI。

## jttw-ep001-stone-shard

Use case: illustration-story  
Asset type: small room keepsake, transparent cutout  
Input images: `assets/lf_ep1/pages/p03.png` (storybook reference); `assets/lf_ep1/frames/monkey_in_stone.jpg` (video keyframe reference)  
Scene/backdrop: the celestial rock from the birth scene, simplified for a child's room  
Subject: one warm stone shard with a clean split seam and a tiny soft golden glow inside  
Style/medium: gentle watercolor storybook illustration, rounded edges, consistent with the White Dragon character bible  
Composition/framing: centered single object, three-quarter view, generous margin, no cast of characters  
Lighting/mood: warm dawn light, wonder and safety  
Constraints: use a solid chroma-key green background for offline removal; no text, letters, numbers, watermark, or extra props  
Avoid: scary cracks, sharp weapon-like fragments, photorealism, additional monkeys

## jttw-ep001-heaven-light

Use case: illustration-story  
Asset type: small glowing toy, transparent cutout  
Input images: `assets/lf_ep1/pages/p03.png` and `assets/lf_ep1/pages/p04.png` (storybook references); `assets/lf_ep1/frames/cand_25.jpg` (video keyframe reference)  
Scene/backdrop: the first beam that reaches the Cloud Palace  
Subject: a rounded luminous bead containing a ribbon of soft white-gold light  
Style/medium: gentle watercolor storybook illustration, simple silhouette, child-safe  
Composition/framing: centered single bead, readable at 82px UI scale  
Lighting/mood: calm celestial sparkle, not a flash  
Constraints: solid chroma-key green background; no text, letters, numbers, watermark, or characters  
Avoid: lens flare covering the object, lightning bolts, hard neon edges

## jttw-ep001-peach-pip

Use case: illustration-story  
Asset type: tiny nature keepsake, transparent cutout  
Input images: `assets/lf_ep1/pages/p06.png`, `assets/lf_ep1/pages/p07.png`, `assets/lf_ep1/pages/p08.png` (storybook references); `assets/lf_ep1/frames/forest.jpg` (video keyframe reference)  
Scene/backdrop: Fruit and Flower Mountain after the monkeys explore the stream  
Subject: one friendly peach pit with a small green leaf, slightly bouncy and tactile  
Style/medium: gentle watercolor storybook illustration, warm fruit colors, consistent outline weight  
Composition/framing: centered single object, slight tilt, generous margin  
Lighting/mood: playful afternoon, fresh and safe  
Constraints: solid chroma-key green background; no text, letters, numbers, watermark, or characters  
Avoid: rot, dirt, insects, realistic food photography

## jttw-ep001-stream-splash

Story beat: pages 7–8, the monkeys cool off and splash in the stream. Generate only a jade-blue splash curling around two smooth stones; no monkeys, cave or mountain panorama. Use the same single-object, green-screen and child-safe watercolor contract as the three assets above.

## jttw-ep001-waterfall-gate

Story beat: pages 10–11, the troop reaches the enormous waterfall and wonders what is behind it. Generate a compact welcoming waterfall curtain with a visible cave opening; do not render a generic droplet or a full landscape.

## jttw-ep001-brave-ribbon

Story beat: page 11, the stone monkey steps forward to try the jump. Generate a red-and-gold courage ribbon tied to a rounded stone as an abstract keepsake; no character, weapon or medal frame.

## jttw-ep001-water-curtain-token

Story beat: page 12, Monkey says “I’ll do it!” Generate a small rounded water-curtain token with three streams and a warm opening; keep it clearly distinct from the waterfall-gate asset.
