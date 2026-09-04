#!/usr/bin/env python3
"""Generate deterministic Minecraft storybook word audio.

The sentence text in ``storybooks-minecraft/book*.json`` is the source of
truth for the vocabulary surface.  Every authored word token receives an
English Edge TTS clip, including function words and character names, so a
reader can tap any word in a sentence.  Chinese clips are generated only for
definitions already reviewed in the Minecraft sentence annotations; this
script never invents translations.

The resulting manifest is consumed by ``engine/storybook.js`` and intentionally
uses browser-facing ``assets/...`` paths (the local ``prj/`` prefix is omitted).
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[2]
DATA_ROOT = ROOT / "prj" / "data" / "storybooks-minecraft"
OUTPUT_ROOT = ROOT / "prj" / "assets" / "minecraft" / "vocab"
INDEX_PATH = OUTPUT_ROOT / "index.json"
EN_VOICE = "en-US-JennyNeural"
ZH_VOICE = "zh-CN-XiaoxiaoNeural"
CONCURRENCY = 8

# Keep contractions and hyphenated compounds as one point-readable token.
TOKEN_RE = re.compile(r"[A-Za-z]+(?:['’][A-Za-z]+)?(?:-[A-Za-z]+)*|[0-9]+")


def normalize(value: str) -> str:
    return " ".join(str(value or "").replace("’", "'").split()).strip().casefold()


def tokenise(text: str) -> list[str]:
    return TOKEN_RE.findall(text or "")


def slug(value: str) -> str:
    result = re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")
    return result or hashlib.md5(value.encode("utf-8")).hexdigest()[:10]


def digest(value: str) -> str:
    return hashlib.md5(value.strip().encode("utf-8")).hexdigest()[:10]


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _merge_glossary(target: dict[str, dict[str, Any]], glossary: dict[str, Any]) -> None:
    term = " ".join(str(glossary.get("term") or "").split()).strip()
    zh = " ".join(str(glossary.get("zh") or "").split()).strip()
    if not term or not zh:
        return
    key = normalize(term)
    entry = target.setdefault(
        key,
        {
            "term": term,
            "definitions": [],
            "ipa": glossary.get("ipa") or "",
            "pos": glossary.get("pos") or "",
        },
    )
    if zh not in entry["definitions"]:
        entry["definitions"].append(zh)
    if not entry.get("ipa") and glossary.get("ipa"):
        entry["ipa"] = glossary["ipa"]
    if not entry.get("pos") and glossary.get("pos"):
        entry["pos"] = glossary["pos"]


def collect_terms() -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    """Return all sentence tokens and reviewed glossary definitions."""
    terms: dict[str, dict[str, Any]] = {}
    glossary: dict[str, dict[str, Any]] = {}
    for book_no in range(1, 6):
        book_path = DATA_ROOT / f"book{book_no}.json"
        annotation_path = DATA_ROOT / f"sentence-annotations-book{book_no}.json"
        book = load_json(book_path)
        annotations = load_json(annotation_path) if annotation_path.is_file() else {}

        for sentence in annotations.get("sentences") or []:
            for item in sentence.get("glossary") or []:
                if isinstance(item, dict):
                    _merge_glossary(glossary, item)
        # Book JSON may contain a small page-level glossary even when the
        # annotation sidecar is older.  It is accepted as evidence too.
        for page in book.get("pages") or []:
            for item in page.get("glossary") or []:
                if isinstance(item, dict):
                    _merge_glossary(glossary, item)
            for sentence in page.get("sentences") or []:
                for token in tokenise(str(sentence.get("text_en") or "")):
                    key = normalize(token)
                    if not key:
                        continue
                    entry = terms.setdefault(
                        key,
                        {
                            "term": token,
                            "books": [],
                            "count": 0,
                        },
                    )
                    entry["count"] += 1
                    if book_no not in entry["books"]:
                        entry["books"].append(book_no)

    # Attach reviewed definitions after all spellings have been collected.
    for key, entry in terms.items():
        evidence = glossary.get(key)
        if evidence:
            entry["definitions"] = list(evidence["definitions"])
            entry["zh"] = entry["definitions"][0]
            entry["ipa"] = evidence.get("ipa") or ""
            entry["pos"] = evidence.get("pos") or ""
        else:
            entry["definitions"] = []
            entry["zh"] = ""
            entry["ipa"] = ""
            entry["pos"] = ""
    return terms, glossary


def allocate_stems(terms: dict[str, dict[str, Any]]) -> dict[str, str]:
    """Create readable, collision-free filenames for token clips."""
    grouped: dict[str, list[str]] = defaultdict(list)
    for key, item in terms.items():
        grouped[slug(item["term"])].append(key)
    result: dict[str, str] = {}
    for stem, keys in grouped.items():
        for key in keys:
            result[key] = stem if len(keys) == 1 else f"{stem}-{digest(key)}"
    return result


async def synthesize(text: str, voice: str, destination: Path) -> bool:
    import edge_tts

    destination.parent.mkdir(parents=True, exist_ok=True)
    part = destination.with_name(destination.stem + ".part.mp3")
    part.unlink(missing_ok=True)
    last_error = ""
    for attempt in range(3):
        try:
            await asyncio.wait_for(edge_tts.Communicate(text, voice).save(str(part)), timeout=30)
            if part.is_file() and part.stat().st_size > 1000:
                part.replace(destination)
                return True
            last_error = "empty output"
        except Exception as exc:  # noqa: BLE001 - isolate one failed token
            last_error = str(exc)[:160]
        await asyncio.sleep(0.8 * (attempt + 1))
    part.unlink(missing_ok=True)
    print(f"TTS_FAILED text={text!r}: {last_error}", file=sys.stderr)
    return False


async def run_jobs(jobs: list[tuple[str, str, Path]], force: bool) -> tuple[int, int, int]:
    semaphore = asyncio.Semaphore(CONCURRENCY)
    generated = 0
    reused = 0
    failed = 0

    async def one(text: str, voice: str, destination: Path) -> str:
        nonlocal reused
        if destination.is_file() and destination.stat().st_size > 1000 and not force:
            reused += 1
            return "reused"
        async with semaphore:
            return "generated" if await synthesize(text, voice, destination) else "failed"

    results = await asyncio.gather(*(one(*job) for job in jobs))
    generated = sum(result == "generated" for result in results)
    failed = sum(result == "failed" for result in results)
    return generated, reused, failed


def write_index(
    terms: dict[str, dict[str, Any]],
    stems: dict[str, str],
    definitions: dict[str, str],
) -> None:
    payload_terms: dict[str, dict[str, Any]] = {}
    with_definition = 0
    for key, item in sorted(terms.items()):
        output = {
            "term": item["term"],
            "books": item["books"],
            "count": item["count"],
            "ipa": item.get("ipa") or "",
            "pos": item.get("pos") or "",
            "zh": item.get("zh") or "",
            "definitions": item.get("definitions") or [],
            "audio_en": f"assets/minecraft/vocab/en/{stems[key]}.mp3",
        }
        if output["definitions"]:
            with_definition += 1
            output["audio_zh"] = definitions[output["zh"]]
            output["audio_zh_variants"] = [
                {"zh": definition, "audio_zh": definitions[definition]}
                for definition in output["definitions"]
            ]
        payload_terms[key] = output
    payload = {
        "schema_version": 1,
        "series": "minecraft",
        "scope": "all-sentence-words",
        "voice": {"en": EN_VOICE, "zh": ZH_VOICE},
        "stats": {
            "unique_terms": len(payload_terms),
            "token_occurrences": sum(item["count"] for item in payload_terms.values()),
            "with_reviewed_definition": with_definition,
        },
        "definitions": definitions,
        "terms": payload_terms,
    }
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    INDEX_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


async def main_async(force: bool, index_only: bool) -> int:
    terms, glossary = collect_terms()
    if not terms:
        print("VOCAB_FAILED no Minecraft sentence terms", file=sys.stderr)
        return 3
    stems = allocate_stems(terms)
    definitions: dict[str, str] = {}
    for item in glossary.values():
        for definition in item.get("definitions") or []:
            definitions.setdefault(
                definition,
                f"assets/minecraft/vocab/zh/{digest(definition)}.mp3",
            )

    jobs: list[tuple[str, str, Path]] = []
    for key, item in sorted(terms.items()):
        jobs.append((item["term"], EN_VOICE, OUTPUT_ROOT / "en" / f"{stems[key]}.mp3"))
    for definition, rel in sorted(definitions.items()):
        jobs.append((definition, ZH_VOICE, ROOT / "prj" / rel))

    if index_only:
        write_index(terms, stems, definitions)
        print(f"MINECRAFT_VOCAB_INDEX_OK terms={len(terms)} definitions={len(definitions)} index={INDEX_PATH}")
        return 0

    generated, reused, failed = await run_jobs(jobs, force)
    write_index(terms, stems, definitions)
    print(
        f"MINECRAFT_VOCAB_OK terms={len(terms)} definitions={len(definitions)} "
        f"jobs={len(jobs)} generated={generated} reused={reused} failed={failed} index={INDEX_PATH}"
    )
    return 0 if failed == 0 else 2


def main(argv: Iterable[str] | None = None) -> int:
    global CONCURRENCY
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="regenerate existing clips")
    parser.add_argument("--index-only", action="store_true", help="rewrite index without contacting Edge TTS")
    parser.add_argument("--concurrency", type=int, default=CONCURRENCY)
    args = parser.parse_args(list(argv) if argv is not None else None)
    CONCURRENCY = max(1, min(16, int(args.concurrency)))
    return asyncio.run(main_async(args.force, args.index_only))


if __name__ == "__main__":
    raise SystemExit(main())
