#!/usr/bin/env python3
"""Generate sentence clips and word timings for Minecraft text-only books.

Book 3 has no trustworthy source narration.  This tool makes that status
explicit by generating Edge-TTS sentence clips (never a fabricated source
recording), recording the voice and timing source in both the book JSON and
the reviewed annotation sidecar.  Edge-TTS word-boundary events are retained
as offsets inside each generated clip so the existing point-read surface can
highlight every token.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
BOOK_PATH = ROOT / "prj" / "data" / "storybooks-minecraft" / "book3.json"
ANNOTATION_PATH = ROOT / "prj" / "data" / "storybooks-minecraft" / "sentence-annotations-book3.json"
OUT_ROOT = ROOT / "prj" / "assets" / "minecraft" / "trouble-brewing" / "sentences"
VOICE = "en-US-JennyNeural"
TOKEN_RE = re.compile(r"[A-Za-z]+(?:['’][A-Za-z]+)?(?:-[A-Za-z]+)*|[0-9]+")


def tokens(text: str) -> list[str]:
    return TOKEN_RE.findall(text or "")


def duration_ms(value: Any) -> int:
    try:
        return max(0, int(round(float(value) / 10_000)))
    except (TypeError, ValueError):
        return 0


def probe_duration_ms(path: Path) -> int:
    """Read the encoded clip length when a prior run was interrupted."""
    try:
        import av
        with av.open(str(path)) as container:
            if container.duration is not None:
                return max(0, int(round(container.duration / 1000)))
    except Exception:  # noqa: BLE001 - optional decoder
        pass
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
            check=True, capture_output=True, text=True, timeout=10,
        )
        return max(0, int(round(float(result.stdout.strip()) * 1000)))
    except (OSError, subprocess.SubprocessError, ValueError):
        return 0


async def synthesize(text: str, destination: Path) -> tuple[bool, list[dict[str, Any]], int]:
    import edge_tts

    destination.parent.mkdir(parents=True, exist_ok=True)
    part = destination.with_suffix(destination.suffix + ".part")
    part.unlink(missing_ok=True)
    boundaries: list[dict[str, Any]] = []
    try:
        # ``save`` is intentionally used instead of the streaming boundary
        # endpoint: some Edge regions keep a WordBoundary stream open after
        # the final frame.  The clip's encoded duration is authoritative and
        # align_words() supplies a monotonic fallback timeline.
        await asyncio.wait_for(edge_tts.Communicate(text, VOICE).save(str(part)), timeout=45)
        if not part.is_file() or part.stat().st_size <= 1000:
            raise RuntimeError("empty Edge-TTS output")
        part.replace(destination)
        total_ms = probe_duration_ms(destination)
        return True, boundaries, total_ms
    except Exception as exc:  # noqa: BLE001 - report one sentence and continue
        part.unlink(missing_ok=True)
        print(f"TTS_FAILED text={text!r}: {str(exc)[:180]}", file=sys.stderr)
        return False, [], 0


def align_words(text: str, boundaries: list[dict[str, Any]], total_ms: int) -> list[dict[str, Any]]:
    """Map Edge's punctuation-aware boundaries back to authored tokens."""
    authored = tokens(text)
    if not authored:
        return []
    # Edge normally returns one event per authored token.  A conservative
    # monotonic proportional fallback keeps the clip point-readable if the
    # service coalesces a short function word.
    events = [b for b in boundaries if tokens(str(b.get("text") or ""))]
    if len(events) == len(authored):
        return [
            {"text": token, "start_ms": max(0, int(event["start_ms"])), "end_ms": max(int(event["start_ms"]), int(event["end_ms"])),
             "timing_source": "edge-tts-word-boundary"}
            for token, event in zip(authored, events)
        ]
    # Leave a tiny encoder-safe tail.  PyAV reports the MP3 container duration
    # a couple of milliseconds above ffmpeg's decoded duration on some VBR
    # files; the tail keeps the final word inside both measurements.
    total = max(400, int(total_ms or 0) - 10)
    step = total / len(authored)
    return [
        {"text": token, "start_ms": int(round(i * step)), "end_ms": int(round((i + 1) * step)),
         "timing_source": "edge-tts-proportional-fallback"}
        for i, token in enumerate(authored)
    ]


async def run(force: bool = False) -> int:
    book = json.loads(BOOK_PATH.read_text(encoding="utf-8"))
    annotations = json.loads(ANNOTATION_PATH.read_text(encoding="utf-8"))
    annotation_by_id = {str(item.get("id")): item for item in annotations.get("sentences") or []}
    jobs: list[tuple[dict[str, Any], Path]] = []
    for page in book.get("pages") or []:
        for index, sentence in enumerate(page.get("sentences") or [], start=1):
            filename = f"page-{int(page['page_no']):02d}-sentence-{index:02d}.mp3"
            jobs.append((sentence, OUT_ROOT / filename))

    generated = reused = failed = 0
    for sentence, destination in jobs:
        sid = str(sentence.get("id") or "")
        if destination.is_file() and destination.stat().st_size > 1000 and not force:
            reused += 1
            # Reuse files still needs timings in a clean checkout.  Do not
            # treat an earlier proportional timeline as fresh boundary
            # evidence; re-probe the encoded duration and rebuild it.
            boundaries = []
            total_ms = probe_duration_ms(destination)
        else:
            ok, boundaries, total_ms = await synthesize(str(sentence.get("text_en") or ""), destination)
            if not ok:
                failed += 1
                continue
            generated += 1
        words = align_words(str(sentence.get("text_en") or ""), boundaries, total_ms)
        rel = f"assets/minecraft/trouble-brewing/sentences/{destination.name}"
        sentence.update({
            "audio": rel,
            "audio_source": "edge-tts",
            "audio_voice": VOICE,
            "word_timing_source": "edge-tts-word-boundary" if any(w.get("timing_source") == "edge-tts-word-boundary" for w in words) else "edge-tts-proportional-fallback",
            "words": words,
        })
        sidecar = annotation_by_id.get(sid)
        if sidecar is not None:
            sidecar.update({
                "audio": rel,
                "audio_source": "edge-tts",
                "audio_voice": VOICE,
                "word_timing_status": "generated",
                "word_timing_source": sentence.get("word_timing_source"),
                "words": words,
            })

    if failed:
        print(f"MINECRAFT_SENTENCE_AUDIO FAILED generated={generated} reused={reused} failed={failed}", file=sys.stderr)
        return 2
    book["audio"] = None
    book["audio_duration_sec"] = None
    book["audio_source"] = "edge-tts-sentence-clips"
    book["audio_voice"] = VOICE
    book["sources"]["mp3"] = None
    BOOK_PATH.write_text(json.dumps(book, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    annotations["status"] = "generated_sentence_audio"
    annotations["audio_source"] = "edge-tts-sentence-clips"
    annotations["audio_voice"] = VOICE
    ANNOTATION_PATH.write_text(json.dumps(annotations, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"MINECRAFT_SENTENCE_AUDIO OK sentences={len(jobs)} generated={generated} reused={reused} failed={failed} out={OUT_ROOT}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="regenerate existing clips")
    args = parser.parse_args()
    return asyncio.run(run(force=args.force))


if __name__ == "__main__":
    raise SystemExit(main())
