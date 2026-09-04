#!/usr/bin/env python3
"""Evidence-backed word timing for Minecraft sentence clips.

Each sentence clip is transcribed independently with the locally cached
faster-whisper ``base.en`` model.  We keep the book's authored token order and
only attach boundaries when every token can be aligned to an ASR word.  Any
insertion, deletion, low-confidence substitution, or out-of-range boundary is
reported and left untouched; no proportional or duration-based estimate is
written by this tool.
"""
from __future__ import annotations

import argparse
import difflib
import json
import re
import sys
from pathlib import Path
from typing import Any, Iterable

try:
    import av  # type: ignore
except ImportError:  # pragma: no cover - exercised only on minimal machines
    av = None


REPO = Path(__file__).resolve().parents[2]
DATA_DIR = REPO / "prj" / "data" / "storybooks-minecraft"
TOKEN_RE = re.compile(r"[A-Za-z]+(?:['’][A-Za-z]+)?(?:-[A-Za-z]+)*|[0-9]+")
PLACEHOLDER = {"uh", "uhh", "um", "hmm"}
KNOWN_ASR_ALIASES = {
    ("emmy", "emmie"),
    ("emmy", "emi"),
    ("birch", "burch"),
    # Whisper base.en frequently hears the authored proper noun Byte as
    # "bite"; this alias is accepted only when the surrounding token order
    # and boundaries still match the sentence exactly.
    ("byte", "bite"),
    ("grass", "graph"),
}


def tokenize(text: str) -> list[str]:
    return TOKEN_RE.findall(text or "")


def normalize(token: str) -> str:
    return re.sub(r"[^a-z0-9]", "", token.lower().replace("’", "'"))


def similarity(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, normalize(a), normalize(b)).ratio()


def clip_duration_ms(path: Path) -> int | None:
    if av is None:
        return None
    try:
        with av.open(str(path)) as container:
            if container.duration is not None:
                return round(float(container.duration) / 1000)
            stream = next((s for s in container.streams if s.type == "audio"), None)
            if stream and stream.duration is not None and stream.time_base is not None:
                return round(float(stream.duration * stream.time_base) * 1000)
    except Exception:
        return None
    return None


def transcribe(model: Any, clip: Path, text_en: str) -> list[dict[str, Any]]:
    segments, _info = model.transcribe(
        str(clip),
        language="en",
        word_timestamps=True,
        vad_filter=False,
        beam_size=5,
        condition_on_previous_text=False,
        initial_prompt=text_en,
    )
    words: list[dict[str, Any]] = []
    for segment in segments:
        for word in segment.words or []:
            value = str(word.word or "").strip()
            if not normalize(value):
                continue
            words.append({
                "text": value,
                "start_ms": round(float(word.start) * 1000),
                "end_ms": round(float(word.end) * 1000),
                "probability": round(float(getattr(word, "probability", 0.0) or 0.0), 4),
            })
    return words


def transcribe_full_audio(model: Any, audio: Path) -> list[dict[str, Any]]:
    """Transcribe one audiobook once, retaining absolute millisecond times."""
    segments, _info = model.transcribe(
        str(audio),
        language="en",
        word_timestamps=True,
        vad_filter=True,
        beam_size=5,
        condition_on_previous_text=False,
    )
    words: list[dict[str, Any]] = []
    for segment in segments:
        for word in segment.words or []:
            value = str(word.word or "").strip()
            if not normalize(value):
                continue
            words.append({
                "text": value,
                "start_ms": round(float(word.start) * 1000),
                "end_ms": round(float(word.end) * 1000),
                "probability": round(float(getattr(word, "probability", 0.0) or 0.0), 4),
            })
    return words


def _align_tokens_core(source_tokens: list[str], asr_words: list[dict[str, Any]]) -> tuple[list[dict[str, Any]] | None, str | None]:
    # Whisper may split an authored hyphenated word into two tokens.  Merge
    # only when the concatenated ASR spelling is exactly the authored token;
    # this is an observable tokenization repair, not a guessed time split.
    merged_asr: list[dict[str, Any]] = []
    source_norm = [normalize(token) for token in source_tokens]
    ai = 0
    for expected in source_norm:
        if ai >= len(asr_words):
            break
        if normalize(str(asr_words[ai]["text"])) == expected:
            merged_asr.append(asr_words[ai])
            ai += 1
            continue
        found = None
        joined = normalize(str(asr_words[ai]["text"]))
        for width in range(2, 4):
            if ai + width > len(asr_words):
                break
            joined += normalize(str(asr_words[ai + width - 1]["text"]))
            if joined == expected:
                found = width
                break
        if found:
            first, last = asr_words[ai], asr_words[ai + found - 1]
            merged = dict(first)
            merged["text"] = " ".join(str(asr_words[ai + n]["text"]) for n in range(found))
            merged["end_ms"] = last["end_ms"]
            merged_asr.append(merged)
            ai += found
            continue
        merged_asr.append(asr_words[ai])
        ai += 1
    merged_asr.extend(asr_words[ai:])
    asr_words = merged_asr
    asr_tokens = [str(item["text"]) for item in asr_words]
    src_norm = [normalize(token) for token in source_tokens]
    asr_norm = [normalize(token) for token in asr_tokens]
    matcher = difflib.SequenceMatcher(a=src_norm, b=asr_norm, autojunk=False)
    mapped: list[dict[str, Any]] = []
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag != "equal":
            if tag == "replace" and (i2 - i1) == (j2 - j1):
                for si, aj in zip(range(i1, i2), range(j1, j2)):
                    score = similarity(source_tokens[si], asr_tokens[aj])
                    pair = (normalize(source_tokens[si]), normalize(asr_tokens[aj]))
                    if score < 0.72 and pair not in KNOWN_ASR_ALIASES:
                        return None, f"low-confidence token {source_tokens[si]!r} -> {asr_tokens[aj]!r} ({score:.2f})"
                    mapped.append({
                        "text": source_tokens[si],
                        "start_ms": int(asr_words[aj]["start_ms"]),
                        "end_ms": int(asr_words[aj]["end_ms"]),
                        "timing_source": "faster-whisper-base.en",
                        "asr_text": asr_tokens[aj],
                        "asr_probability": asr_words[aj].get("probability", 0),
                    })
                continue
            return None, f"ASR {tag}: source[{i1}:{i2}]={source_tokens[i1:i2]!r}, heard={asr_tokens[j1:j2]!r}"
        for si, aj in zip(range(i1, i2), range(j1, j2)):
            mapped.append({
                "text": source_tokens[si],
                "start_ms": int(asr_words[aj]["start_ms"]),
                "end_ms": int(asr_words[aj]["end_ms"]),
                "timing_source": "faster-whisper-base.en",
                "asr_text": asr_tokens[aj],
                "asr_probability": asr_words[aj].get("probability", 0),
            })
    if len(mapped) != len(source_tokens):
        return None, f"aligned {len(mapped)} of {len(source_tokens)} source tokens"
    last_end = -1
    for word in mapped:
        start, end = int(word["start_ms"]), int(word["end_ms"])
        # Full-file Whisper timestamps can land a few milliseconds before an
        # authored clip boundary.  Permit only a small, explicit decoder
        # tolerance and normalize it to the playable clip origin.
        if start < -200 or end <= 0 or end <= start or start < last_end:
            return None, f"non-monotonic boundary {start}..{end} after {last_end}"
        if start < 0:
            word["start_ms"] = 0
            start = 0
        last_end = end
    return mapped, None


def align_tokens(source_tokens: list[str], asr_words: list[dict[str, Any]]) -> tuple[list[dict[str, Any]] | None, str | None]:
    """Align while discarding only trailing/leading ASR hallucinations.

    Sentence clips occasionally contain a few non-speech frames that Whisper
    turns into ``That's it``/``L.A.``.  We try at most two leading and three
    trailing drops; any internal insertion or deletion still fails closed.
    """
    attempts: list[list[dict[str, Any]]] = [asr_words]
    for lead in range(0, min(2, len(asr_words)) + 1):
        for tail in range(0, min(3, len(asr_words) - lead) + 1):
            if lead == 0 and tail == 0:
                continue
            attempts.append(asr_words[lead: len(asr_words) - tail if tail else None])
    last_reason: str | None = None
    for attempt in attempts:
        words, reason = _align_tokens_core(source_tokens, attempt)
        if words is not None:
            return words, None
        last_reason = reason
    return None, last_reason


def load_sidecar(book: int, data_dir: Path) -> tuple[Path, dict[str, Any]]:
    path = Path(data_dir) / f"sentence-annotations-book{book}.json"
    return path, json.loads(path.read_text(encoding="utf-8"))


def valid_existing_words(record: dict[str, Any]) -> bool:
    words = record.get("words")
    if not isinstance(words, list) or not words:
        return False
    previous = -1
    for word in words:
        try:
            start, end = int(word["start_ms"]), int(word["end_ms"])
        except (KeyError, TypeError, ValueError):
            return False
        if start < 0 or end <= start or start < previous:
            return False
        previous = end
    return True


def align_book(
    book: int,
    *,
    data_dir: Path = DATA_DIR,
    limit: int | None = None,
    write: bool = False,
    model_name: str = "base.en",
) -> dict[str, Any]:
    path, payload = load_sidecar(book, data_dir)
    records = [record for record in payload.get("sentences", []) if record.get("audio")]
    if limit is not None:
        records = records[:limit]
    try:
        from faster_whisper import WhisperModel
        model = WhisperModel(model_name, device="cpu", compute_type="int8")
    except Exception as exc:
        return {"book": book, "processed": 0, "aligned": 0, "failed": len(records), "failures": [f"model unavailable: {exc}"]}

    aligned = 0
    failures: list[str] = []
    # The clips are all slices of one verified audiobook.  Transcribing the
    # parent file once is both faster and more stable than starting a decoder
    # for every tiny MP3.  The authored sentence windows remain the only
    # source of sentence identity; ASR is used solely for word boundaries.
    book_payload = json.loads((Path(data_dir) / f"book{book}.json").read_text(encoding="utf-8"))
    full_audio = REPO / "prj" / str(book_payload.get("audio") or "")
    full_words: list[dict[str, Any]] = []
    if full_audio.exists():
        try:
            print(f"transcribing audiobook once: {full_audio.name}", flush=True)
            full_words = transcribe_full_audio(model, full_audio)
            print(f"audiobook ASR words: {len(full_words)}", flush=True)
        except Exception as exc:
            failures.append(f"full audiobook transcription failed: {exc}")
    else:
        failures.append(f"full audiobook missing: {full_audio}")
    if not full_words:
        return {"book": book, "processed": len(records), "aligned": 0, "failed": len(failures) or len(records), "failures": failures, "annotation_file": str(path), "written": False}
    for index, record in enumerate(records, start=1):
        if record.get("word_timing_status") == "reviewed" and valid_existing_words(record):
            aligned += 1
            continue
        if record.get("word_timing_status") == "reviewed" and not valid_existing_words(record):
            # A previous exploratory run may have kept a zero-width ASR word;
            # remove it before the strict pass so it can never masquerade as
            # reviewed timing.
            record["words"] = []
            record["word_timing_status"] = "needs-review"
        clip = REPO / "prj" / str(record["audio"])
        if not clip.exists():
            reason = f"clip missing {clip}"
            record["word_timing_status"] = "needs-review"
            record["word_timing_error"] = reason
            failures.append(f"{record.get('id')}: {reason}")
            continue
        try:
            start_ms = int(record.get("start_ms") or 0)
            end_ms = int(record.get("end_ms") or 0)
            # Sentence clips are authored windows, so choose words by their
            # midpoint first; a small overlap fallback handles encoder
            # rounding at a boundary without pulling in a neighbouring line.
            candidates = [
                [
                    {**word, "start_ms": int(word["start_ms"]) - start_ms, "end_ms": int(word["end_ms"]) - start_ms}
                    for word in full_words
                    if start_ms <= (int(word["start_ms"]) + int(word["end_ms"])) // 2 <= end_ms
                ],
                [
                    {**word, "start_ms": int(word["start_ms"]) - start_ms, "end_ms": int(word["end_ms"]) - start_ms}
                    for word in full_words
                    if int(word["end_ms"]) > start_ms - 250 and int(word["start_ms"]) < end_ms + 250
                ],
            ]
            source_tokens = tokenize(str(record.get("text_en") or ""))
            words = None
            reason = None
            for asr_words in candidates:
                trial, trial_reason = align_tokens(source_tokens, asr_words)
                if trial is not None:
                    words, reason = trial, None
                    break
                reason = trial_reason
            # Full-file timestamps can disagree with a clip boundary by more
            # than the small tolerance even when the clip itself is clean.
            # Re-transcribe only that sentence clip (with the authored text as
            # prompt) before declaring it unresolved.
            if words is None:
                clip_words = transcribe(model, clip, str(record.get("text_en") or ""))
                words, clip_reason = align_tokens(source_tokens, clip_words)
                if words is not None:
                    reason = None
                else:
                    reason = clip_reason or reason
            if words is None and not candidates[-1]:
                reason = reason or "no ASR words in sentence window"
            duration = clip_duration_ms(clip)
            if words and duration is not None and int(words[-1]["end_ms"]) > duration:
                overflow = int(words[-1]["end_ms"]) - duration
                if overflow <= 120:
                    words[-1]["end_ms"] = duration
                    words[-1]["boundary_clamped_ms"] = overflow
                else:
                    words = None
                    reason = f"last word exceeds clip duration {duration}ms"
            if words is None:
                reason = reason or "alignment failed"
                record["word_timing_status"] = "needs-review"
                record["word_timing_error"] = reason
                failures.append(f"{record.get('id')}: {reason}")
                continue
            record["words"] = words
            record["word_timing_status"] = "reviewed"
            record["word_timing_model"] = model_name
            record.pop("word_timing_error", None)
            aligned += 1
            print(f"[{index}/{len(records)}] aligned {record.get('id')}", flush=True)
        except Exception as exc:
            failures.append(f"{record.get('id')}: transcription error: {exc}")
    if write and (aligned or failures):
        payload["status"] = "enrichment-in-progress"
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"book": book, "processed": len(records), "aligned": aligned, "failed": len(failures), "failures": failures, "annotation_file": str(path), "written": bool(write and (aligned or failures))}


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--book", type=int, choices=range(1, 6), required=True)
    parser.add_argument("--data-dir", type=Path, default=DATA_DIR)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--model", default="base.en")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(list(argv) if argv is not None else None)
    report = align_book(args.book, data_dir=args.data_dir, limit=args.limit, write=args.write, model_name=args.model)
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(f"book{args.book}: processed={report['processed']} aligned={report['aligned']} failed={report['failed']} written={report.get('written', False)}")
        for failure in report.get("failures", []):
            print("failure: " + failure)
    return 0 if report["failed"] == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
