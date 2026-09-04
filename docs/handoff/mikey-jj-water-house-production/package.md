# Water House Adventure production handoff

## Unique outcome

将 Water House Adventure 作为 Mikey & JJ 第 2 本合入正式共用绘本播放器：10 页原漫画整页、逐气泡单句英文/中文、真实句音频、重点词三层卡和全屏章末测验。

## Real consumer

`G:\Game\BookPlay书戏\prj\engine\storybook.html?series=mikey-jj&book=2`

## Exact inputs

- `G:\Game\BookPlay书戏\书籍资料库\Mikey & JJ 英文冒险\pages\water-house-adventure\p01.webp..p10.webp`
- `G:\Game\BookPlay书戏\书籍资料库\Mikey & JJ 英文冒险\audio\Water House Adventure.mp3`
- `G:\Game\BookPlay书戏\书籍资料库\Mikey & JJ 英文冒险\PDF\Water House Adventure.pdf`
- 已验收 schema：`G:\Game\BookPlay书戏\prj\data\storybooks-mikey-jj\book1.json`

## First artifact

`prj/data/storybooks-mikey-jj/book2.json` 的第 1 页真实气泡数据 + 至少一个可解码真实句音频 + 正式 book=2 路由加载。

## Fixed lane

环境/合同/基线 → 双 ASR 与页面 OCR（仅任务根）→ 第 1 页首件 → 余下 9 页与测验 → 路由/音频/双视口验证 → result.json。

## Prohibitions

不改源媒体，不改播放器 CSS/JS，不处理 Slime Jail，不扫描其它书，不写根 tmp，不用 preview 冒充正式消费者。
