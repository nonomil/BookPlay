#!/usr/bin/env python3
"""生成「瓦拉式混合演出」方案包：总设计、计划、task、108 集文件夹。

    python demo/tools/generate_mixed_stage_pack.py
"""
from __future__ import annotations

import json
import re
from pathlib import Path

DEMO = Path(__file__).resolve().parent.parent
REPO = DEMO.parent
PACK = REPO / "docs" / "plans" / "2026-08-29-混合演出"
CATALOG = DEMO / "data" / "storybooks" / "catalog.json"
EP1 = DEMO / "data" / "storybooks" / "ep1.json"

SENT_RE = re.compile(r"(?<=[.!?。！？])\s+|(?<=[.”\"])(?=[A-Z“\"])")


def write_md(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    body = text.strip() + "\n"
    path.write_text(body, encoding="utf-8-sig")


def split_sentences(text: str) -> list[str]:
    raw = re.sub(r"\s+", " ", (text or "").strip())
    if not raw:
        return []
    parts = [p.strip() for p in SENT_RE.split(raw) if p.strip()]
    if len(parts) <= 1:
        parts = [s.strip() for s in re.split(r"(?<=[.!?])\s+", raw) if s.strip()]
    return parts or [raw]


def slug(title: str) -> str:
    s = re.sub(r"[^A-Za-z0-9]+", "-", title).strip("-").lower()
    return s[:48] or "episode"


# --- 第 1 集人工分幕（叙事拍，不是 PDF 页一一对应）---
EP1_SCENES = [
    {
        "id": "s01",
        "title_zh": "石破天惊",
        "title_en": "The rock splits",
        "page_nos": [3],
        "mode": "clip",
        "why": "画面是山与仙石，没有可独立行走的角色。用句级视频（或页图+整句音频）推进，旁白头像即可。",
        "portrait": "narrator",
        "cast": [],
        "bg": "绘本 p03 山石，或视频开场山景",
        "interact": "无选择。可点词 magic / split open。",
    },
    {
        "id": "s02",
        "title_zh": "天庭惊光",
        "title_en": "Light in Heaven",
        "page_nos": [4, 5],
        "mode": "clip",
        "why": "玉帝、将领只出现在绘本/视频里，封面没有干净立绘。群像对话适合句级短片，停在每一句上提问。",
        "portrait": "jade-emperor（页内裁切，脏边可接受）",
        "cast": ["jade-emperor", "captain"],
        "bg": "云宫；不做新地图",
        "interact": "句末可插 1 题：Who is the ruler of Heaven?",
    },
    {
        "id": "s03",
        "title_zh": "花果山岁月",
        "title_en": "Fruit and Flower Mountain",
        "page_nos": [6, 7, 8],
        "mode": "clip",
        "why": "幼猴与成年封面悟空不像；多只猴叠在风景里。整段用短片，对话框旁放幼猴裁切头像做呼吸。",
        "portrait": "young-monkey（p07 裁切）",
        "cast": ["young-monkey"],
        "bg": "花果山溪边",
        "interact": "点词 stream / explored。无分支。",
    },
    {
        "id": "s04",
        "title_zh": "寻源至瀑",
        "title_en": "The waterfall",
        "page_nos": [9, 10],
        "mode": "clip",
        "why": "主视觉是瀑布与山路。可把最后一拍做成 hybrid：瀑布静帧当场景，群猴贴纸轻微摆动。",
        "portrait": "narrator",
        "cast": ["troop"],
        "bg": "瀑布；可从 p10 去字当场景板",
        "interact": "点词 enormous / waterfall。",
    },
    {
        "id": "s05",
        "title_zh": "谁敢一跳",
        "title_en": "Who will jump",
        "page_nos": [11],
        "mode": "hybrid",
        "why": "剧情拐点。绘本 p11 群猴挤在一起，立绘走不了路，但适合「场景板+对话头像+选择」。视频按句切开，选完再进下一幕。",
        "portrait": "gibbon（p11 中心大猿裁切）",
        "cast": ["gibbon", "troop"],
        "bg": "p11 去字当场景板",
        "interact": "必选：I would try / I would stay back。未选不能进下一句。",
    },
    {
        "id": "s06",
        "title_zh": "石猴请战",
        "title_en": "I'll do it",
        "page_nos": [12],
        "mode": "sprite",
        "why": "封面悟空轮廓干净，适合立绘待机/说话。场景用水帘洞简化板。这是第 1 集唯一优先做可动立绘的一幕。",
        "portrait": "wukong（data/Journey to the west_图片/封面.png 左侧）",
        "cast": ["wukong", "gibbon"],
        "bg": "水帘洞入口（p12 或 p10 风格化，不要等距沙海）",
        "interact": "必选：Go, Monkey! / It looks dangerous。然后章末 5 题。",
    },
]


def estimate_beats(pages: list[dict], page_nos: list[int]) -> list[dict]:
    wanted = {n: p for p in pages if p["page_no"] in page_nos for n in [p["page_no"]]}
    beats = []
    n = 0
    for page_no in page_nos:
        page = wanted[page_no]
        sents = split_sentences(page["text_en"])
        start = float(page.get("start_sec") or 0)
        end = float(page.get("end_sec") or start)
        dur = max(end - start, 1.0)
        weights = [max(len(s), 1) for s in sents]
        total = float(sum(weights))
        t = start
        for sent, w in zip(sents, weights):
            n += 1
            span = dur * w / total
            beats.append({
                "beat_id": f"b{n:02d}",
                "page_no": page_no,
                "text_en": sent,
                "start_sec": round(t, 2),
                "end_sec": round(t + span, 2),
                "audio_src": "mp3-page-slice（待校准）",
                "video_src": "mp4-sentence-slice（待 ffprobe 对齐）",
            })
            t += span
        if beats:
            beats[-1]["end_sec"] = round(end, 2)
    return beats


DESIGN = r"""# 混合演出总设计（绘本 × 短片 × 立绘）

> 状态：方案冻结，待实施｜日期：2026-08-29
> 参考：`data/参考图片 -- 瓦拉英语/`（9 张截图）
> 前提：个人使用；`data/` 西游记 PDF / MP3 / MP4 可用
> 本机缺口：没有 ffmpeg / ffprobe。句级视频切片在装好 ffmpeg 之前只写时间表，不切文件。

## 1. 一句话

播放器不再是「整集 MP3 + 静页」，也不是「整集 MP4 当播放器」。它是 **一句一拍的演出器**：每一拍只能是立绘、短片、或两者叠在一起，中间可以停、可以选、可以答题。

## 2. 瓦拉英语拆成什么（我们学结构，不抄皮）

瓦拉截图里其实是三层，不是「把动画片切开」：

1. **大地图**：关卡点、通关勾、巩固入口。我们已有 108 集目录，M2 再做成花果山路径，不挡第 1 集。
2. **场景戏**：角色站在干净场景上，左下头像 + 底部台词 + 填空/组句/选择。这是本方案要先做成的。
3. **巩固页**：吉祥物在旁边喘气，中间单词卡。我们已有生词本和章末题，把头像换成可动立绘即可。

角色必须有两套图：**场上身子**（可站、可轻微动）和 **对话框头像**（说话时弹一下）。背景是积木，不是整帧动画。

## 3. 三种演法如何结合（按「拍」选，不按「集」选）

| 模式 | 何时用 | 屏幕上是什么 | 停/选/答怎么挂 |
|---|---|---|---|
| **sprite** | 有干净背景的独立角色图（封面悟空、单人全身） | 场景板 + 透明立绘 idle/talk + 头像 | 立绘停在待机；选项盖在对话框上 |
| **clip** | 角色焊在风景/群像里，或动作必须靠原片 | **一句一段**短视频，播完冻结末帧 | 句界暂停；选项/题盖在冻结帧上 |
| **hybrid** | 要场景感，但立绘不够走 | 短片或绘本静帧当背景 + 对话框旁可动头像 | 同 clip，头像负责「有人在说话」 |

判定顺序（写在每集 `方案.md`）：

1. 这一拍有没有**单人、轮廓清、背景简**的图？有 → `sprite`。
2. 没有，但原片这一秒能看清动作/口型 → `clip`（必须切到句，禁止整集连播）。
3. 群像或风景为主，又要选择/答题 → `hybrid`。

**禁止**：把 5 分钟 MP4 丢进一个 `<video>` 当主界面。整集只是源，不是 UI。

## 4. 一拍（beat）合同

```text
beat = {
  id, scene_id, mode,          # sprite | clip | hybrid
  text_en, text_zh?,
  audio: { file, start, end }, # 优先 MP3 句级；没有再用视频音轨
  video?: { file, start, end },# 仅 clip/hybrid
  portrait?: asset_id,         # 对话框旁可动头像
  sprite?: asset_id,           # 场上身子
  bg?: asset_id,
  choice?, quiz_item?, glossary?
}
```

播放器状态机：`idle → play_beat → hold（冻结）→ 用户下一句 / 选择 / 答题 → next_beat`。  
`hold` 时画面停在末帧或立绘待机，**不是黑场，也不是继续滚下一句**。

## 5. 素材从哪来（诚实边界）

| 源 | 能做什么 | 不能做什么 |
|---|---|---|
| Little Fox 封面 `data/Journey to the west_图片/封面.png` | 抠悟空/唐僧/八戒/沙僧立绘，第 1 集 s06 优先悟空 | 幼猴、玉帝、群猴 |
| 绘本页 PNG | 场景板、脏边头像、去字背景 | 可走路的精灵表 |
| MP4 108 集 | 句级短片（装 ffmpeg 后） | 软字幕轨（已核验：只有 vide+soun，字幕烧在画面上） |
| MP3 108 集 | 句级朗读（按页时长比例先估，再人工校准） | 自动口型 |

第 1 集 **只有 s06 走 sprite**；s01–s04 走 clip；s05 走 hybrid。其余 107 集先按页填「待拆镜」，规则相同。

## 6. 目录合同

```text
docs/plans/2026-08-29-混合演出/
  00-总设计.md          ← 本文
  01-实施计划.md
  02-素材与拆分规则.md
  tasks/                ← 跨集工程任务
  episodes/epNNN-.../   ← 每一集一个文件夹
    方案.md
    scenes/*.md
    tasks/              ← 这一集的子任务
```

运行时以后读 `demo/data/storybooks/epN.json` 的 `scenes[]`；本目录是方案与拆镜，不是给浏览器直接加载。

## 7. 第 1 集验收（本方案的黄金样本）

1. 打开第 1 集是「一拍一句」，不是整集视频。
2. s05 未选不能进 s06；s06 未选不能进测验。
3. 对话框旁有头像微动（CSS 呼吸即可）。
4. s06 场上有悟空立绘（封面抠图，透明 PNG）。
5. 时间轴可以先按字数估，但每拍有 `start_sec/end_sec` 字段。
"""

RULES = r"""# 素材与拆分规则

> 和 `00-总设计.md` 一起用。拆某一集时先读该集 `方案.md`。

## 1. 视频怎么切

源：`data/Journey to the West西游记 中英双字幕版108集视频/西游记英文版【中英字幕】{NN}.mp4`  
音：`data/Journey to the West MP3/{NNN}. *.mp3`（忽略 `lv05-*`）

目标文件（实施后才生成，现在只写表）：

```text
demo/assets/lf_ep{N}/beats/s{SS}-b{BB}.mp4   # 仅 clip/hybrid
demo/assets/lf_ep{N}/beats/s{SS}-b{BB}.mp3   # 从整集 MP3 按秒切
```

命令（本机装好 ffmpeg 之后）：

```text
ffmpeg -y -ss {start} -to {end} -i "{mp4}" -c:v libx264 -an "sXX-bYY.mp4"
ffmpeg -y -ss {start} -to {end} -i "{mp3}" -c:a libmp3lame "sXX-bYY.mp3"
```

**MP3 与 MP4 时长可能不一致。** 第 1 集 MP3 ≈ 340s。先以 MP3 为学习音轨，视频只做画面；对不齐就拉长/冻帧，不要为了齐去改课文。

句界：先按英文句号/问号/叹号切；绘本跨页半句（如 p04 末 The / p05 首 light）在拆镜里并成一句。

时间初值：用该页 `start_sec~end_sec` 按句子字数加权。全部标记 `待校准`。校准手段：听 MP3 点句，或以后上 whisperx。

## 2. 立绘怎么做

只从**干净图**抠，不从群像视频抠走路帧。

| 角色 | 首选源 | 最小帧 |
|---|---|---|
| 悟空 | 封面左侧 | idle、talk 各 1 张（talk=头或身子上移 4px 也算） |
| 唐僧/八戒/沙僧 | 封面 | 第 14 集以后再做 |
| 玉帝/将领/幼猴/长臂猿 | 对应绘本页裁切 | 只要头像，不做走路 |

输出：`demo/assets/cast/{id}/idle.png`、`talk.png`，透明背景。

## 3. 场景板

从绘本页上去掉英文正文（已有上半图）。不要重画瓦拉等距沙海。西游记用花果山、水帘洞、云宫即可。

## 4. 108 集怎么填

每集文件夹已建。默认：

- 封面/单人页 → 标 `sprite` 候选
- 其余页 → `clip`
- 该集已有 choice 的页 → `hybrid` 或 `sprite`
- `scenes/` 里先放「按页待拆」清单，听完再合并分幕

不要在没看片之前给 107 集写假时间码。
"""

IMPL = r"""# 混合演出实施计划

> **给 Claude:** 必需子技能：使用 superpowers:executing-plans 来逐任务实施此计划。先做第 1 集，不要批量切 108 集视频。

**目标：** 第 1 集从「整集听书」变成「一句一拍」：clip / hybrid / sprite 三种演法可切换，能停、能选、能答题；对话框旁有可动头像。

**架构：** 方案在 `docs/plans/2026-08-29-混合演出/`。运行时仍读 JSON。先给 `ep1.json` 加 `scenes[]`/`beats[]`，播放器按拍渲染。ffmpeg 未装时，clip 用绘本页 + MP3 句级 seek 代替视频文件。

**技术栈：** 现有静态 HTML/JS；Python 流水线；可选 ffmpeg。立绘用封面抠图 + CSS 呼吸，不上 Live2D。

---

### 任务 1：beat schema 与第 1 集数据

**文件：**
- 修改：`demo/data/storybooks/ep1.json`
- 测试：`demo/tests/test_storybook_beats.py`
- 参考：`docs/plans/2026-08-29-混合演出/episodes/ep001-the-monkey/方案.md`

**步骤 1：** 写失败测试：`ep1.json` 有 6 个 scene，每 scene 有 mode，beats 有 text_en 与 start/end。

**步骤 2：** 把本包第 1 集分镜写入 `ep1.json` 的 `scenes` 字段（页数据保留）。

**步骤 3：** `pytest demo/tests/test_storybook_beats.py -q` 通过。

---

### 任务 2：播放器改成一拍一句

**文件：**
- 修改：`demo/engine/storybook.html`、`storybook.js`、`storybook.css`
- 测试：浏览器第 1 集 s05/s06

**步骤 1：** 有 `scenes` 时走拍模式：播当前拍音频，画面按 mode 显示页图或立绘或（若有）短片。

**步骤 2：** 拍结束自动 `hold`，点「下一句」才继续。有 choice 的拍必须先选。

**步骤 3：** 对话框左侧挂 `#sb-portrait`，CSS 2s 呼吸；s06 显示悟空 idle。

**步骤 4：** 无 `scenes` 的 2–108 集仍走旧翻页，不破坏目录。

---

### 任务 3：封面抠悟空立绘

**文件：**
- 创建：`demo/assets/cast/wukong/idle.png`
- 源：`data/Journey to the west_图片/封面.png`

**步骤 1：** 裁悟空全身，去蓝底，透明 PNG。talk 可用 idle 上移复制。

**步骤 2：** 第 1 集 s06 引用该路径。

---

### 任务 4：ffmpeg 句级切片（可后做）

**文件：**
- 创建：`demo/tools/cut_episode_beats.py`
- 输出：`demo/assets/lf_ep1/beats/*.mp4`

**步骤 1：** 确认 `ffmpeg -version`。没有就停，继续用页图+MP3。

**步骤 2：** 按第 1 集 beats 的秒数切 MP4（不要切 108 集）。

**步骤 3：** clip/hybrid 拍优先播短片，失败回退页图。

---

### 任务 5：第 2 集起按同一模板拆镜

只填 `episodes/ep00N-.../方案.md`，不要先写播放器新功能。
"""

README = r"""# 2026-08-29 混合演出方案包

把瓦拉英语的「场景戏」结构接到西游记现成素材上：**一句一拍**，拍内在立绘 / 短片 / 混合里选一种。

| 文件 | 内容 |
|---|---|
| [00-总设计.md](00-总设计.md) | 为什么结合、三种模式、播放器合同 |
| [01-实施计划.md](01-实施计划.md) | 可交给执行会话的任务 |
| [02-素材与拆分规则.md](02-素材与拆分规则.md) | 视频怎么切、立绘从哪抠 |
| [tasks/](tasks/) | 跨集工程任务与子任务 |
| [episodes/](episodes/) | **每一集一个文件夹**；第 1 集已写满 6 幕 |

入口计划（给 executing-plans）：[`../2026-08-29-混合演出.md`](../2026-08-29-混合演出.md)

**现在不要做的事：** 装 3D、重画瓦拉沙海、未装 ffmpeg 就批量切 108 集、把整集 MP4 塞进播放器。
"""

ENTRY = r"""# 混合演出（瓦拉式一句一拍）实施计划

> **给 Claude:** 必需子技能：使用 superpowers:executing-plans 来逐任务实施此计划。

**目标：** 第 1 集改成一句一拍的混合演出（立绘 / 句级短片 / 头像叠加），能停、能选、能答题。

**架构：** 方案包在 `docs/plans/2026-08-29-混合演出/`。先扩 `ep1.json` 的 scenes/beats，再改 `storybook.js`。2–108 集保持旧翻页。

**技术栈：** 静态 HTML/JS、现有 MP3、封面抠图；ffmpeg 可选。

详细设计与分集文件夹见方案包。任务正文见 `2026-08-29-混合演出/01-实施计划.md`。
"""


def scene_md(scene: dict, beats: list[dict], ep_title: str) -> str:
    lines = [
        f"# {scene['id']} · {scene['title_zh']} / {scene['title_en']}",
        "",
        f"- 集：第 1 集 {ep_title}",
        f"- **模式：`{scene['mode']}`**",
        f"- 绘本页：{', '.join('p'+str(n) for n in scene['page_nos'])}",
        f"- 头像：{scene['portrait']}",
        f"- 场上角色：{', '.join(scene['cast']) or '无'}",
        f"- 场景板：{scene['bg']}",
        f"- 交互：{scene['interact']}",
        "",
        "## 为何是这种模式",
        "",
        scene["why"],
        "",
        "## 句级分镜（时间初值按页内字数加权，全部待校准）",
        "",
        "| 拍 | 页 | MP3 起 | MP3 止 | 英文 |",
        "|---|---:|---:|---:|---|",
    ]
    for b in beats:
        en = b["text_en"].replace("|", "/")
        lines.append(
            f"| {b['beat_id']} | {b['page_no']} | {b['start_sec']} | {b['end_sec']} | {en} |"
        )
    lines += [
        "",
        "## 视频拆分",
        "",
        f"- 源视频：`data/Journey to the West西游记 中英双字幕版108集视频/西游记英文版【中英字幕】01.mp4`",
        f"- 源音频：`demo/assets/lf_ep1/audio_ep1.mp3`（约 340s）",
        f"- 输出：`demo/assets/lf_ep1/beats/{scene['id']}-bXX.mp4`（须 ffmpeg；未装则用页图 + MP3 seek）",
        "- 校准：听整集 MP3，按句改 start/end；视频对不齐就冻帧。",
        "",
    ]
    return "\n".join(lines)


def ep1_plan_md(pages: list[dict], scenes_out: list[tuple[dict, list]]) -> str:
    rows = []
    for scene, beats in scenes_out:
        rows.append(
            f"| {scene['id']} | {scene['title_zh']} | `{scene['mode']}` | "
            f"{', '.join('p'+str(n) for n in scene['page_nos'])} | {len(beats)} | {scene['interact'][:24]} |"
        )
    return f"""# 第 1 集方案 · The Monkey

**模式总览（6 幕，不是 10 页各演一次）：**

| 幕 | 标题 | 模式 | 绘本页 | 拍数 | 交互 |
|---|---|---|---|---:|---|
{chr(10).join(rows)}

封面悟空只给 **s06** 做场上立绘。s01–s04 全部 clip。s05 hybrid（场景板 + 头像 + 必选）。

详细分镜见 `scenes/`。本集子任务见 `tasks/`。

源：

- PDF 页图：`demo/assets/lf_ep1/pages/p03.png`–`p12.png`
- MP3：`demo/assets/lf_ep1/audio_ep1.mp3`
- MP4：`data/.../西游记英文版【中英字幕】01.mp4`
- 立绘源：`data/Journey to the west_图片/封面.png`
"""


def stub_plan(ep: int, title_en: str, pages: int) -> str:
    return f"""# 第 {ep} 集方案 · {title_en}

状态：**待拆镜**（未看片，不写假时间码）

- 绘本页约 {pages} 页（见 `demo/data/storybooks/ep{ep}.json`）
- 默认：群像/风景 → `clip`；单人干净图 → `sprite` 候选；已有 choice 的页 → `hybrid`
- 视频源：`西游记英文版【中英字幕】{ep:02d}.mp4`（文件名以目录为准）
- 音频：`demo/assets/lf_ep{ep}/audio_ep{ep}.mp3`

拆镜时复制第 1 集 `scenes/s01-*.md` 的表格，按 `02-素材与拆分规则.md` 判定模式。

子任务：`tasks/T00-拆镜.md`
"""


def stub_task(ep: int, title_en: str) -> str:
    return f"""# T00 拆镜 · 第 {ep} 集 {title_en}

- [ ] 打开该集绘本 JSON，按叙事合成 4–8 幕（不要一页一幕硬拆）
- [ ] 每一幕填写 mode：sprite / clip / hybrid
- [ ] 列出句级英文，时间标待校准
- [ ] 标出能抠的头像/立绘源；没有就写「只用 clip」
- [ ] 若有自然选择点，挂 2 选 1（可后做）
"""


def main() -> int:
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    ep1 = json.loads(EP1.read_text(encoding="utf-8"))
    pages = ep1["pages"]

    write_md(PACK / "README.md", README)
    write_md(PACK / "00-总设计.md", DESIGN)
    write_md(PACK / "01-实施计划.md", IMPL)
    write_md(PACK / "02-素材与拆分规则.md", RULES)
    write_md(REPO / "docs" / "plans" / "2026-08-29-混合演出.md", ENTRY)

    tasks = {
        "T01-演出合同": (
            "跨集：冻结 beat JSON 与播放器状态机。",
            [
                ("S01-beat-schema", "给 ep1.json 增加 scenes/beats；测试先红后绿。"),
                ("S02-播放器状态机", "idle → play → hold → next/choice/quiz；无 scenes 的集走旧翻页。"),
            ],
        ),
        "T02-素材流水线": (
            "跨集：立绘与句级音视频。",
            [
                ("S01-封面抠悟空", "从封面切透明 idle/talk，写入 demo/assets/cast/wukong/。"),
                ("S02-装ffmpeg后切片", "只切第 1 集 beats；没有 ffmpeg 就停。"),
                ("S03-MP3句级seek", "未切视频时用 audio.currentTime 播一句。"),
            ],
        ),
        "T03-第1集落地": (
            "只验收 The Monkey。",
            [
                ("S01-六幕进播放器", "s01–s06 按方案模式显示。"),
                ("S02-两处必选", "s05/s06 未选不能前进。"),
                ("S03-头像呼吸", "对话框旁 portrait 微动。"),
            ],
        ),
        "T04-108集批量拆镜": (
            "填表，不先改播放器。",
            [
                ("S01-按集填方案", "打开 episodes/ep00N/方案.md，看页后改 mode。"),
            ],
        ),
    }
    for name, (summary, subs) in tasks.items():
        tdir = PACK / "tasks" / name
        write_md(tdir / "README.md", f"# {name}\n\n{summary}\n")
        for sid, body in subs:
            write_md(tdir / "sub" / f"{sid}.md", f"# {sid}\n\n{body}\n")

    scenes_out = []
    for scene in EP1_SCENES:
        beats = estimate_beats(pages, scene["page_nos"])
        scenes_out.append((scene, beats))

    ep1_dir = PACK / "episodes" / "ep001-the-monkey"
    write_md(ep1_dir / "方案.md", ep1_plan_md(pages, scenes_out))
    for scene, beats in scenes_out:
        fname = f"{scene['id']}-{slug(scene['title_en'])}.md"
        write_md(ep1_dir / "scenes" / fname, scene_md(scene, beats, "The Monkey"))
    write_md(ep1_dir / "tasks" / "T01-写入ep1-scenes.md", "# T01 把 6 幕写入 ep1.json\n\n对照 scenes/*.md 的表格。\n")
    write_md(ep1_dir / "tasks" / "T02-悟空立绘.md", "# T02 封面抠悟空\n\n输出 demo/assets/cast/wukong/idle.png。\n")
    write_md(ep1_dir / "tasks" / "T03-播放器拍模式.md", "# T03 storybook.js 走拍\n\nhold / 下一句 / 必选。\n")
    write_md(ep1_dir / "tasks" / "T04-可选切片.md", "# T04 ffmpeg 切 s01–s06 短片\n\n无 ffmpeg 则跳过。\n")

    count = 1
    for item in catalog["episodes"]:
        n = int(item["episode"])
        if n == 1:
            continue
        title = item["title"]["en"]
        folder = PACK / "episodes" / f"ep{n:03d}-{slug(title)}"
        write_md(folder / "方案.md", stub_plan(n, title, int(item.get("pages") or 0)))
        write_md(folder / "scenes" / "README.md", f"# 第 {n} 集分镜\n\n待拆。一幕一个 md，格式抄 ep001。\n")
        write_md(folder / "tasks" / "T00-拆镜.md", stub_task(n, title))
        count += 1

    index_rows = ["| 集 | 文件夹 | 状态 |", "|---:|---|---|", "| 1 | `ep001-the-monkey` | 6 幕已写 |"]
    for item in catalog["episodes"]:
        n = int(item["episode"])
        if n == 1:
            continue
        index_rows.append(f"| {n} | `ep{n:03d}-{slug(item['title']['en'])}` | 待拆镜 |")
    write_md(PACK / "episodes" / "README.md", "# 分集文件夹\n\n" + "\n".join(index_rows) + "\n")

    print(f"pack {PACK}")
    print(f"episodes {1 + count} folders")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
