# -*- coding: utf-8 -*-
"""Fix SRT times that lead the spoken video by one cue.

Only rewrites audio_start/audio_end on narration nodes.
Does not touch vocab, gloss, quiz, or other imported fields.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg

DEMO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(DEMO / "tools"))

from rebuild_from_official_srt import find_src, merge_cues, parse_srt  # noqa: E402

STORIES = DEMO / "data" / "dialogue_stories"
VIDEO = DEMO / "assets" / "video"
CACHE = DEMO / "data" / "align" / "whisper_head"
BACKUP = DEMO / "data" / "align" / "times_backup.json"
REPORT = DEMO / "data" / "align" / "shift_report.json"
PROBE = DEMO / "data" / "align" / "probe_after_fix"
WORD = re.compile(r"[a-z0-9']+")
AMBIG = 0.15


def tokens(s: str) -> set[str]:
    return set(WORD.findall((s or "").lower()))


def jaccard(a: str, b: str) -> float:
    ta, tb = tokens(a), tokens(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def whisper_in_window(segs: list[dict], start: float, end: float) -> str:
    parts = []
    for s in segs:
        if s["end"] <= start or s["start"] >= end:
            continue
        parts.append(s.get("text") or "")
    return " ".join(parts)


def score_shift(cues: list[dict], segs: list[dict], shift: int, n: int = 3) -> float:
    scores = []
    for i in range(min(n, len(cues))):
        j = i + shift
        if j >= len(cues):
            break
        heard = whisper_in_window(segs, cues[j]["start"], cues[j]["end"])
        scores.append(jaccard(cues[i]["text"], heard))
    return sum(scores) / len(scores) if scores else 0.0


def load_whisper(n: int) -> dict | None:
    p = CACHE / f"ep{n}.json"
    if not p.exists():
        return None
    return json.loads(p.read_text(encoding="utf-8"))


def run_whisper(n: int, model, force: bool = False) -> dict | None:
    if not force:
        cached = load_whisper(n)
        if cached:
            return cached
    src = VIDEO / f"ep{n}.mp4"
    if not src.exists():
        print(f"ep{n} missing video")
        return None
    CACHE.mkdir(parents=True, exist_ok=True)
    print(f"whisper ep{n} {src.name}", flush=True)
    segments, info = model.transcribe(
        str(src),
        language="en",
        vad_filter=False,
        beam_size=1,
        clip_timestamps="0,150",
        word_timestamps=False,
    )
    rows = []
    for i, seg in enumerate(segments, 1):
        rows.append({
            "i": i,
            "start": round(float(seg.start), 3),
            "end": round(float(seg.end), 3),
            "text": (seg.text or "").strip(),
        })
    payload = {
        "episode": n,
        "source": f"assets/video/ep{n}.mp4",
        "model": "base",
        "duration": getattr(info, "duration", None),
        "segments": rows,
    }
    (CACHE / f"ep{n}.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return payload


def seed_ep1_from_old() -> None:
    old = DEMO / "data" / "align" / "ep1" / "whisper_novad.json"
    dest = CACHE / "ep1.json"
    if dest.exists() or not old.exists():
        return
    CACHE.mkdir(parents=True, exist_ok=True)
    data = json.loads(old.read_text(encoding="utf-8"))
    dest.write_text(json.dumps({
        "episode": 1,
        "source": data.get("source"),
        "model": "seeded_novad",
        "duration": data.get("duration"),
        "segments": [
            {"i": s["i"], "start": s["start"], "end": s["end"], "text": s["text"]}
            for s in data.get("segments") or []
        ],
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def decide(cues: list[dict], segs: list[dict]) -> tuple[int, float, float, str]:
    s0 = score_shift(cues, segs, 0)
    s1 = score_shift(cues, segs, 1)
    if abs(s1 - s0) < AMBIG:
        return 0, s0, s1, "ambiguous"
    return (1 if s1 > s0 else 0), s0, s1, "ok"


def shifted_merged(cues: list[dict], last_end: float) -> list[dict]:
    shifted = []
    for i, c in enumerate(cues):
        nc = dict(c)
        if i + 1 < len(cues):
            nc["start"] = cues[i + 1]["start"]
            nc["end"] = cues[i + 1]["end"]
        else:
            dur = max(0.8, c["end"] - c["start"])
            nc["start"] = c["end"]
            nc["end"] = max(c["end"] + dur, last_end) if last_end > c["end"] else c["end"] + dur
        shifted.append(nc)
    return merge_cues(shifted)


def narration_nodes(data: dict) -> list[dict]:
    return [n for n in (data.get("nodes") or []) if n.get("type") == "narration" and (n.get("text_en") or "").strip()]


def backup_times() -> None:
    if BACKUP.exists():
        return
    out = {}
    for n in range(1, 109):
        p = STORIES / f"ep{n}.json"
        if not p.exists():
            continue
        data = json.loads(p.read_text(encoding="utf-8"))
        out[str(n)] = [
            {
                "node_id": nd.get("node_id"),
                "audio_start": nd.get("audio_start"),
                "audio_end": nd.get("audio_end"),
            }
            for nd in data.get("nodes") or []
            if nd.get("audio_start") is not None
        ]
    BACKUP.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("backed up", BACKUP)


def restore_times() -> None:
    if not BACKUP.exists():
        raise SystemExit("no backup")
    bak = json.loads(BACKUP.read_text(encoding="utf-8"))
    for key, rows in bak.items():
        p = STORIES / f"ep{int(key)}.json"
        data = json.loads(p.read_text(encoding="utf-8"))
        by_id = {r["node_id"]: r for r in rows}
        for nd in data.get("nodes") or []:
            r = by_id.get(nd.get("node_id"))
            if not r:
                continue
            nd["audio_start"] = r["audio_start"]
            nd["audio_end"] = r["audio_end"]
        p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("restored", len(bak), "episodes")


def apply_episode(n: int, segs: list[dict], last_end: float) -> dict:
    srt = find_src(n, "srt")
    if not srt:
        return {"ep": n, "status": "FAIL", "reason": "no srt"}
    cues = parse_srt(srt)
    if len(cues) < 2:
        return {"ep": n, "status": "FAIL", "reason": "few cues"}
    shift, s0, s1, tag = decide(cues, segs)
    story_path = STORIES / f"ep{n}.json"
    data = json.loads(story_path.read_text(encoding="utf-8"))
    narr = narration_nodes(data)
    if shift == 1:
        merged = shifted_merged(cues, last_end)
        if len(merged) != len(narr):
            return {
                "ep": n, "shift": shift, "score0": round(s0, 3), "score1": round(s1, 3),
                "nodes": len(narr), "merged": len(merged), "status": "FAIL",
                "reason": "count mismatch",
            }
        for nd, c in zip(narr, merged):
            nd["audio_start"] = round(c["start"], 3)
            nd["audio_end"] = round(c["end"], 3)
        story_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        status = "shifted" if tag == "ok" else "ambiguous_shifted"
    else:
        status = "unchanged" if tag == "ok" else "ambiguous"
    return {
        "ep": n,
        "shift": shift,
        "score0": round(s0, 3),
        "score1": round(s1, 3),
        "nodes": len(narr),
        "status": status,
    }


def probe_frames(episodes: list[int]) -> None:
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    PROBE.mkdir(parents=True, exist_ok=True)
    for n in episodes:
        p = STORIES / f"ep{n}.json"
        if not p.exists():
            continue
        data = json.loads(p.read_text(encoding="utf-8"))
        narr = narration_nodes(data)[:3]
        src = VIDEO / f"ep{n}.mp4"
        for i, nd in enumerate(narr, 1):
            t = float(nd.get("audio_start") or 0) + 0.3
            out = PROBE / f"ep{n}_s{i}_{t:.1f}.jpg"
            subprocess.run(
                [ff, "-y", "-v", "error", "-ss", f"{t:.3f}", "-i", str(src),
                 "-frames:v", "1", "-q:v", "4", str(out)],
                check=False,
            )
            print("frame", out.name, out.exists())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--episodes", default="1-108")
    ap.add_argument("--restore", action="store_true")
    ap.add_argument("--probe", action="store_true")
    ap.add_argument("--force-whisper", action="store_true")
    args = ap.parse_args()
    if args.restore:
        restore_times()
        return

    eps: list[int] = []
    for part in args.episodes.split(","):
        part = part.strip()
        if "-" in part:
            a, b = part.split("-", 1)
            eps.extend(range(int(a), int(b) + 1))
        else:
            eps.append(int(part))

    backup_times()
    seed_ep1_from_old()

    model = None
    rows = []
    need_whisper = [n for n in eps if args.force_whisper or not (CACHE / f"ep{n}.json").exists()]
    if need_whisper:
        from faster_whisper import WhisperModel
        model = WhisperModel("base", device="cpu", compute_type="int8")

    for n in eps:
        wh = run_whisper(n, model, force=args.force_whisper) if model and (
            args.force_whisper or not (CACHE / f"ep{n}.json").exists()
        ) else load_whisper(n)
        if not wh:
            rows.append({"ep": n, "status": "FAIL", "reason": "no whisper"})
            print(rows[-1], flush=True)
            continue
        segs = wh.get("segments") or []
        last_end = max((s["end"] for s in segs), default=0)
        row = apply_episode(n, segs, last_end)
        rows.append(row)
        print(row, flush=True)

    REPORT.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    amb = [r for r in rows if "ambiguous" in r.get("status", "")]
    fail = [r for r in rows if r.get("status") == "FAIL"]
    shifted = [r for r in rows if r.get("shift") == 1 and r.get("status") != "FAIL"]
    print("done", len(rows), "shifted", len(shifted), "ambiguous", len(amb), "FAIL", len(fail))
    if amb:
        print("ambiguous", [r["ep"] for r in amb])
    if fail:
        print("FAIL", fail)

    if args.probe:
        probe_frames([e for e in (1, 2, 50, 108) if e in eps] or eps[:1])


if __name__ == "__main__":
    main()
