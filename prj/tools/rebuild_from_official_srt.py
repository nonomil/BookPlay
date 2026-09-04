# -*- coding: utf-8 -*-
"""Rebuild all episode stories from official English SRT + clean MP4 in data/03."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

DEMO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(DEMO / "tools"))

from pipeline_dialogue_story import build_vocab, make_puzzles, make_patterns  # noqa: E402

SRC = DEMO.parent / "data" / "03.外挂英文字幕（无字幕）高清视频"
STORIES = DEMO / "data" / "dialogue_stories"
VIDEO_OUT = DEMO / "assets" / "video"

TIME = re.compile(
    r"(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)"
)
END_OK = re.compile(r'[.!?…]["\']?$')


def to_sec(h, m, s, ms) -> float:
    return int(h) * 3600 + int(m) * 60 + int(s) + int(ms.ljust(3, "0")[:3]) / 1000


def find_src(n: int, ext: str) -> Path | None:
    hits = sorted(SRC.glob(f"*】{n:03d} *.{ext}")) or sorted(SRC.glob(f"*】{n:03d}*.{ext}"))
    return hits[0] if hits else None


def parse_srt(path: Path) -> list[dict]:
    raw = path.read_text(encoding="utf-8-sig")
    raw = raw.replace("\r\n", "\n").replace("\r", "\n")
    cues = []
    for block in re.split(r"\n\s*\n", raw.strip()):
        lines = [ln.strip() for ln in block.splitlines() if ln.strip()]
        if len(lines) < 2:
            continue
        m = None
        text_from = 1
        for i, ln in enumerate(lines[:3]):
            m = TIME.search(ln)
            if m:
                text_from = i + 1
                break
        if not m:
            continue
        text = " ".join(lines[text_from:]).replace("\xa0", " ")
        text = re.sub(r"\s+", " ", text).strip()
        if not text:
            continue
        start = to_sec(*m.group(1, 2, 3, 4))
        end = to_sec(*m.group(5, 6, 7, 8))
        if end <= start:
            end = start + 0.4
        cues.append({"start": round(start, 3), "end": round(end, 3), "text": text})
    return cues


def is_complete(text: str) -> bool:
    t = text.strip()
    if not t:
        return False
    if t.count('"') % 2 == 1:
        return False
    return bool(END_OK.search(t))


def merge_cues(cues: list[dict]) -> list[dict]:
    if not cues:
        return []
    out = [dict(cues[0])]
    for c in cues[1:]:
        prev = out[-1]
        if not is_complete(prev["text"]):
            prev["text"] = (prev["text"].rstrip() + " " + c["text"]).strip()
            prev["end"] = c["end"]
        else:
            out.append(dict(c))
    return out


def link_video(n: int) -> bool:
    src = find_src(n, "mp4")
    if not src:
        return False
    VIDEO_OUT.mkdir(parents=True, exist_ok=True)
    dest = VIDEO_OUT / f"ep{n}.mp4"
    if dest.exists() or dest.is_symlink():
        dest.unlink()
    try:
        dest.hardlink_to(src)
    except OSError:
        dest.symlink_to(src)
    return dest.exists()


def rebuild_one(n: int) -> dict:
    srt = find_src(n, "srt")
    if not srt:
        raise FileNotFoundError(f"missing srt {n}")
    cues = merge_cues(parse_srt(srt))
    texts = [c["text"] for c in cues]
    pool, node_cards = build_vocab(texts)
    puzzles = make_puzzles(texts)
    puzzle_at = sorted({max(1, len(cues) // 3), max(2, len(cues) * 2 // 3)}) if cues else []

    old_path = STORIES / f"ep{n}.json"
    old = {}
    if old_path.exists():
        old = json.loads(old_path.read_text(encoding="utf-8"))
    frames = old.get("frames") or []
    title = old.get("title") or {"en": f"Episode {n}", "zh": f"西游记 第{n}集"}

    nodes = []
    pi = 0
    for i, c in enumerate(cues):
        nodes.append({
            "node_id": f"n{i + 1:03d}",
            "type": "narration",
            "speaker": "narrator",
            "text_en": c["text"],
            "text_zh": "",
            "illustration": frames[(i + 1) % len(frames)] if frames else None,
            "audio_start": c["start"],
            "audio_end": c["end"],
            "vocab": node_cards.get(i, []),
        })
        if (i + 1) in puzzle_at and pi < len(puzzles):
            nodes.append({
                "node_id": f"p{pi + 1:02d}",
                "type": "puzzle",
                "speaker": "system",
                "text_en": "Put the words in order",
                "text_zh": "点词块组句，完成后点确定",
                "illustration": None,
                "puzzle": puzzles[pi],
                "vocab": [],
            })
            pi += 1

    story = {
        "schema_version": 1,
        "story_id": f"adv_ep{n}",
        "episode": n,
        "title": title,
        "source_note": (
            "台词与时间轴来自 data/03 外挂英文字幕；视频为同目录无字幕高清版。"
            "词汇短语来自 data/05 中英对照词汇。个人使用。"
        ),
        "audio": old.get("audio"),
        "video": f"assets/video/ep{n}.mp4",
        "frames": frames,
        "vocab_pool": pool,
        "nodes": nodes,
        "puzzles": puzzles,
        "patterns": make_patterns(texts, pool),
        "quiz": old.get("quiz") or [],
    }
    STORIES.mkdir(parents=True, exist_ok=True)
    old_path.write_text(json.dumps(story, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"n": n, "cues": len(cues), "nodes": len(nodes), "srt": srt.name}


def main() -> None:
    linked = 0
    rows = []
    for n in range(1, 109):
        if link_video(n):
            linked += 1
        rows.append(rebuild_one(n))
        print(f"ep{n:03d} cues={rows[-1]['cues']} nodes={rows[-1]['nodes']}")
    print("linked_videos", linked, "episodes", len(rows), "cues", sum(r["cues"] for r in rows))


if __name__ == "__main__":
    main()
