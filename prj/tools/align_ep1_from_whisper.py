#!/usr/bin/env python3
"""用无 VAD 的 Whisper 时间轴回写 ep1 各句 audio_start/end。"""
from __future__ import annotations

import json
import re
from difflib import SequenceMatcher
from pathlib import Path

from faster_whisper import WhisperModel

DEMO = Path(__file__).resolve().parent.parent
VIDEO = DEMO / "assets" / "video" / "ep1.mp4"
STORY = DEMO / "data" / "dialogue_stories" / "ep1.json"
OUT = DEMO / "data" / "align" / "ep1" / "whisper_novad.json"


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", " ", (s or "").lower()).split()


def score(a: str, b: str) -> float:
    wa, wb = norm(a), norm(b)
    if not wa or not wb:
        return 0.0
    return SequenceMatcher(None, " ".join(wa), " ".join(wb)).ratio()


def transcribe() -> list[dict]:
    model = WhisperModel("small", device="cpu", compute_type="int8")
    segs, info = model.transcribe(
        str(VIDEO),
        language="en",
        word_timestamps=True,
        vad_filter=False,
        beam_size=5,
    )
    rows = []
    for i, s in enumerate(segs, 1):
        rows.append({
            "i": i,
            "start": round(s.start, 3),
            "end": round(s.end, 3),
            "text": (s.text or "").strip(),
        })
        print(f"{s.start:7.2f}-{s.end:7.2f}  {rows[-1]['text']}")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "episode": 1,
        "source": "assets/video/ep1.mp4",
        "vad_filter": False,
        "duration": getattr(info, "duration", None),
        "segments": rows,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    return rows


def align(story: dict, segs: list[dict]) -> None:
    cursor = 0
    first_line = None
    for n in story["nodes"]:
        if n.get("type") != "narration":
            continue
        text = n.get("text_en") or ""
        if n.get("node_id") == "n000":
            continue
        window = list(range(cursor, min(len(segs), cursor + 10)))
        best_i, best_s = -1, 0.0
        for i in window:
            sc = score(text, segs[i]["text"])
            if sc > best_s:
                best_s, best_i = sc, i
        if best_i < 0 or best_s < 0.42:
            print("MISS", n.get("node_id"), best_s, text[:60])
            continue
        s = segs[best_i]
        cursor = best_i + 1
        n["audio_start"] = s["start"]
        n["audio_end"] = s["end"]
        if first_line is None:
            first_line = s["start"]
        print(f"OK {n['node_id']} {best_s:.2f} {s['start']:.2f}-{s['end']:.2f} | {text[:50]}")

    n000 = next(x for x in story["nodes"] if x["node_id"] == "n000")
    n000["audio_start"] = 0.0
    n000["audio_end"] = round(max(0.4, (first_line or 21.8) - 0.15), 2)


def main() -> None:
    segs = transcribe()
    story = json.loads(STORY.read_text(encoding="utf-8"))
    align(story, segs)
    STORY.write_text(json.dumps(story, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("wrote", STORY)


if __name__ == "__main__":
    main()
