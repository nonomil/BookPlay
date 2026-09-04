#!/usr/bin/env python3
"""Pre-generate English/Chinese audio for storybook quiz text.

The quiz UI is intentionally English-first.  This manifest gives every
question prompt and every answer card a deterministic Edge TTS clip; Chinese
prompt/choice clips are exposed only inside the on-demand hint panel.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
SERIES_CONFIG = {
    "minecraft": ("storybooks-minecraft", "minecraft"),
    "mikey-jj": ("storybooks-mikey-jj", "mikey-jj"),
}
# Backwards-compatible aliases for callers that imported the original
# Minecraft-only constants.  The CLI uses the selected series configuration.
BOOK_ROOT = ROOT / "prj" / "data" / "storybooks-minecraft"
OUT_ROOT = ROOT / "prj" / "assets" / "minecraft" / "quiz"
INDEX_PATH = OUT_ROOT / "index.json"
EN_VOICE = "en-US-JennyNeural"
ZH_VOICE = "zh-CN-XiaoxiaoNeural"
CONCURRENCY = 8


def norm(value: Any) -> str:
    return " ".join(str(value or "").replace("’", "'").split()).strip().casefold()


def slug(value: str) -> str:
    result = re.sub(r"[^a-z0-9]+", "-", norm(value)).strip("-")
    return result or hashlib.md5(str(value).encode("utf-8")).hexdigest()[:10]


async def synthesize(text: str, voice: str, destination: Path) -> bool:
    import edge_tts

    destination.parent.mkdir(parents=True, exist_ok=True)
    part = destination.with_suffix(destination.suffix + ".part")
    part.unlink(missing_ok=True)
    last_error = ""
    for attempt in range(3):
        try:
            await asyncio.wait_for(edge_tts.Communicate(text, voice).save(str(part)), timeout=30)
            if part.is_file() and part.stat().st_size > 1000:
                part.replace(destination)
                return True
            last_error = "empty output"
        except Exception as exc:  # noqa: BLE001 - isolate one clip
            last_error = str(exc)[:160]
        await asyncio.sleep(0.8 * (attempt + 1))
    part.unlink(missing_ok=True)
    print(f"TTS_FAILED text={text!r}: {last_error}", file=sys.stderr)
    return False


async def run_jobs(jobs: list[tuple[str, str, Path]], force: bool) -> tuple[int, int, int]:
    semaphore = asyncio.Semaphore(CONCURRENCY)

    async def one(text: str, voice: str, destination: Path) -> str:
        if destination.is_file() and destination.stat().st_size > 1000 and not force:
            return "reused"
        async with semaphore:
            return "generated" if await synthesize(text, voice, destination) else "failed"

    results = await asyncio.gather(*(one(*job) for job in jobs))
    return results.count("generated"), results.count("reused"), results.count("failed")


def collect(book_root: Path = BOOK_ROOT) -> dict[str, dict[str, Any]]:
    questions: dict[str, dict[str, Any]] = {}
    for path in sorted(book_root.glob("book*.json")):
        book = json.loads(path.read_text(encoding="utf-8"))
        for question in book.get("quiz") or []:
            qid = str(question.get("id") or "").strip()
            if not qid:
                continue
            prompt_en = str(question.get("prompt_en") or question.get("q") or "").strip()
            prompt_zh = str(question.get("prompt_zh") or question.get("q_zh") or "").strip()
            choices_en = question.get("choices_en") if isinstance(question.get("choices_en"), list) else question.get("choices") or []
            choices_zh = question.get("choices_zh") if isinstance(question.get("choices_zh"), list) else []
            questions[qid] = {
                "book": int(book.get("book") or 0),
                "prompt_en": prompt_en,
                "prompt_zh": prompt_zh,
                "choices_en": [str(value).strip() for value in choices_en if str(value).strip()],
                "choices_zh": [str(value).strip() for value in choices_zh],
            }
    return questions


async def main_async(force: bool, series: str = "minecraft") -> int:
    if series not in SERIES_CONFIG:
        print(f"QUIZ_AUDIO_FAILED unknown series: {series}", file=sys.stderr)
        return 3
    folder, asset_series = SERIES_CONFIG[series]
    book_root = ROOT / "prj" / "data" / folder
    out_root = ROOT / "prj" / "assets" / asset_series / "quiz"
    index_path = out_root / "index.json"
    questions = collect(book_root)
    if not questions:
        print("QUIZ_AUDIO_FAILED no questions", file=sys.stderr)
        return 3
    jobs: list[tuple[str, str, Path]] = []
    text_audio = {"en": {}, "zh": {}}
    records: dict[str, dict[str, Any]] = {}

    def add(text: str, lang: str, relative: str) -> str:
        if not text:
            return ""
        bucket = text_audio[lang]
        key = norm(text)
        if key not in bucket:
            bucket[key] = f"assets/{asset_series}/quiz/{lang}/{relative}"
            voice = EN_VOICE if lang == "en" else ZH_VOICE
            jobs.append((text, voice, ROOT / "prj" / bucket[key]))
        return bucket[key]

    for qid, question in sorted(questions.items()):
        stem = slug(qid)
        prompt_en = add(question["prompt_en"], "en", f"{stem}-prompt.mp3")
        prompt_zh = add(question["prompt_zh"], "zh", f"{stem}-prompt.mp3")
        choices_en = [add(text, "en", f"{stem}-choice-{index + 1}.mp3") for index, text in enumerate(question["choices_en"])]
        choices_zh = [add(text, "zh", f"{stem}-choice-{index + 1}.mp3") if text else "" for index, text in enumerate(question["choices_zh"])]
        records[qid] = {
            "book": question["book"],
            "prompt": {"en": prompt_en, "zh": prompt_zh},
            "choices": [{"en": en, "zh": choices_zh[index] if index < len(choices_zh) else ""} for index, en in enumerate(choices_en)],
        }

    generated, reused, failed = await run_jobs(jobs, force)
    out_root.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema_version": 1,
        "series": asset_series,
        "scope": "quiz-prompts-and-choices",
        "voice": {"en": EN_VOICE, "zh": ZH_VOICE},
        "stats": {"questions": len(records), "clips": len(jobs), "generated": generated, "reused": reused, "failed": failed},
        "text_audio": text_audio,
        "questions": records,
    }
    index_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{asset_series.upper()}_QUIZ_AUDIO {'OK' if failed == 0 else 'FAILED'} questions={len(records)} clips={len(jobs)} generated={generated} reused={reused} failed={failed} index={index_path}")
    return 0 if failed == 0 else 2


def main() -> int:
    global CONCURRENCY
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="regenerate existing clips")
    parser.add_argument("--concurrency", type=int, default=CONCURRENCY)
    parser.add_argument("--series", choices=sorted(SERIES_CONFIG), default="minecraft")
    args = parser.parse_args()
    CONCURRENCY = max(1, min(16, int(args.concurrency)))
    return asyncio.run(main_async(args.force, args.series))


if __name__ == "__main__":
    raise SystemExit(main())
