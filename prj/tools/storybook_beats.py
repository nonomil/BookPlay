#!/usr/bin/env python3
"""第 1 集一句一拍分镜：写入 ep1.json 的 scenes。"""
from __future__ import annotations

import json
import re
from pathlib import Path

DEMO = Path(__file__).resolve().parent.parent
EP1 = DEMO / "data" / "storybooks" / "ep1.json"

SENT_RE = re.compile(r"(?<=[.!?。！？])\s+|(?<=[.”\"])(?=[A-Z“\"])")

EP1_SCENES = [
    {
        "id": "s01",
        "title_zh": "石破天惊",
        "title_en": "The rock splits",
        "page_nos": [3],
        "mode": "clip",
        "portrait": "narrator",
        "speaker": "旁白",
    },
    {
        "id": "s02",
        "title_zh": "天庭惊光",
        "title_en": "Light in Heaven",
        "page_nos": [4, 5],
        "mode": "clip",
        "portrait": "jade-emperor",
        "speaker": "玉帝",
    },
    {
        "id": "s03",
        "title_zh": "花果山岁月",
        "title_en": "Fruit and Flower Mountain",
        "page_nos": [6, 7, 8],
        "mode": "clip",
        "portrait": "young-monkey",
        "speaker": "石猴",
    },
    {
        "id": "s04",
        "title_zh": "寻源至瀑",
        "title_en": "The waterfall",
        "page_nos": [9, 10],
        "mode": "clip",
        "portrait": "narrator",
        "speaker": "旁白",
    },
    {
        "id": "s05",
        "title_zh": "谁敢一跳",
        "title_en": "Who will jump",
        "page_nos": [11],
        "mode": "hybrid",
        "portrait": "gibbon",
        "speaker": "长臂猿",
    },
    {
        "id": "s06",
        "title_zh": "石猴请战",
        "title_en": "I'll do it",
        "page_nos": [12],
        "mode": "sprite",
        "portrait": "wukong-face",
        "speaker": "悟空",
        "sprite": "assets/cast/wukong/idle.png",
    },
]


def split_sentences(text: str) -> list[str]:
    raw = re.sub(r"\s+", " ", (text or "").strip())
    if not raw:
        return []
    parts = [p.strip() for p in SENT_RE.split(raw) if p.strip()]
    if len(parts) <= 1:
        parts = [s.strip() for s in re.split(r"(?<=[.!?])\s+", raw) if s.strip()]
    return parts or [raw]


def estimate_beats(pages: list[dict], page_nos: list[int]) -> list[dict]:
    wanted = {p["page_no"]: p for p in pages if p["page_no"] in page_nos}
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
                "id": f"b{n:02d}",
                "page_no": page_no,
                "text_en": sent,
                "start_sec": round(t, 2),
                "end_sec": round(t + span, 2),
                "image": page["image"],
                "glossary": page.get("glossary") or [],
            })
            t += span
        if beats:
            beats[-1]["end_sec"] = round(end, 2)
    return beats


def attach_ep1_scenes(pages: list[dict]) -> list[dict]:
    out = []
    page_map = {p["page_no"]: p for p in pages}
    for spec in EP1_SCENES:
        last = page_map[spec["page_nos"][-1]]
        scene = {
            "id": spec["id"],
            "title": {"en": spec["title_en"], "zh": spec["title_zh"]},
            "mode": spec["mode"],
            "page_nos": spec["page_nos"],
            "portrait": f"assets/cast/{spec['portrait']}/idle.png",
            "speaker": spec["speaker"],
            "image": page_map[spec["page_nos"][0]]["image"],
            "beats": estimate_beats(pages, spec["page_nos"]),
        }
        if spec.get("sprite"):
            scene["sprite"] = spec["sprite"]
        if last.get("choice"):
            scene["choice"] = last["choice"]
        out.append(scene)
    return out


def flatten_beats(scenes: list[dict]) -> list[dict]:
    flat = []
    for scene in scenes:
        beats = scene.get("beats") or []
        for i, beat in enumerate(beats):
            item = dict(beat)
            item["scene_id"] = scene["id"]
            item["mode"] = scene["mode"]
            item["last_in_scene"] = i == len(beats) - 1
            flat.append(item)
    return flat


def write_ep1() -> Path:
    book = json.loads(EP1.read_text(encoding="utf-8"))
    book["scenes"] = attach_ep1_scenes(book["pages"])
    EP1.write_text(json.dumps(book, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return EP1


if __name__ == "__main__":
    path = write_ep1()
    book = json.loads(path.read_text(encoding="utf-8"))
    n = sum(len(s["beats"]) for s in book["scenes"])
    print(f"ok {path} scenes={len(book['scenes'])} beats={n}")
