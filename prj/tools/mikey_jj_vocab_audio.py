"""Pre-generate Mikey & JJ sentence-word and glossary audio with Edge TTS.

Every authored English token in the published sentence captions gets a local
clip, so tapping any word works offline. Chinese clips are generated only for
reviewed glossary definitions; this script never invents translations.
Glossary phrases are kept in a separate ``phrases`` section for compatibility
with the vocabulary cards, while ``terms`` is the complete sentence tap
surface. Existing files are reused unless ``--force`` is passed.
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
DATA_ROOT = ROOT / "prj" / "data" / "storybooks-mikey-jj"
OUTPUT_ROOT = ROOT / "prj" / "assets" / "mikey-jj" / "vocab"
INDEX_PATH = OUTPUT_ROOT / "index.json"
EN_VOICE = "en-US-JennyNeural"
ZH_VOICE = "zh-CN-XiaoxiaoNeural"
CONCURRENCY = 8
TOKEN_RE = re.compile(r"[A-Za-z]+(?:['’][A-Za-z]+)?(?:-[A-Za-z]+)*|[0-9]+")


def slug(value: str) -> str:
    result = re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")
    return result or hashlib.md5(value.encode("utf-8")).hexdigest()[:10]


def digest(value: str) -> str:
    return hashlib.md5(value.strip().encode("utf-8")).hexdigest()[:12]


def normalize(value: str) -> str:
    return " ".join(str(value or "").replace("’", "'").split()).strip().casefold()


def tokenise(text: str) -> list[str]:
    return TOKEN_RE.findall(text or "")


def allocate_stems(items: dict[str, dict[str, Any]]) -> dict[str, str]:
    """Create readable, collision-free filenames for tokens and phrases."""
    grouped: dict[str, list[str]] = {}
    for key, item in items.items():
        grouped.setdefault(slug(item["term"]), []).append(key)
    result: dict[str, str] = {}
    for stem, keys in grouped.items():
        for key in keys:
            result[key] = stem if len(keys) == 1 else f"{stem}-{digest(key)}"
    return result


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
    """Return every sentence token and the independently reviewed glossary."""
    terms: dict[str, dict[str, Any]] = {}
    glossary: dict[str, dict[str, Any]] = {}
    for book_path in sorted(DATA_ROOT.glob("book*.json"), key=lambda path: int(path.stem[4:])):
        book = json.loads(book_path.read_text(encoding="utf-8"))
        for page in book.get("pages") or []:
            for item in page.get("glossary") or []:
                if isinstance(item, dict):
                    _merge_glossary(glossary, item)
            for sentence in page.get("sentences") or []:
                for item in sentence.get("glossary") or []:
                    if isinstance(item, dict):
                        _merge_glossary(glossary, item)
                for token in tokenise(str(sentence.get("text_en") or "")):
                    key = normalize(token)
                    entry = terms.setdefault(
                        key,
                        {
                            "term": token,
                            "books": [],
                            "count": 0,
                        },
                    )
                    entry["count"] += 1
                    if book.get("book") not in entry["books"]:
                        entry["books"].append(book.get("book"))

    for key, entry in terms.items():
        reviewed = glossary.get(key)
        if reviewed:
            entry["definitions"] = list(reviewed["definitions"])
            entry["zh"] = entry["definitions"][0]
            entry["ipa"] = reviewed.get("ipa") or ""
            entry["pos"] = reviewed.get("pos") or ""
        else:
            entry["definitions"] = []
            entry["zh"] = ""
            entry["ipa"] = ""
            entry["pos"] = ""
    return terms, glossary


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
        except Exception as exc:  # noqa: BLE001 - keep one failed word isolated
            last_error = str(exc)[:160]
        await asyncio.sleep(0.8 * (attempt + 1))
    part.unlink(missing_ok=True)
    print(f"TTS_FAILED text={text!r}: {last_error}", file=sys.stderr)
    return False


async def run_jobs(jobs: list[tuple[str, str, Path]], force: bool) -> tuple[int, int]:
    semaphore = asyncio.Semaphore(CONCURRENCY)
    made = 0
    skipped = 0

    async def one(text: str, voice: str, destination: Path) -> bool:
        nonlocal skipped
        if destination.is_file() and destination.stat().st_size > 1000 and not force:
            skipped += 1
            return True
        async with semaphore:
            return await synthesize(text, voice, destination)

    results = await asyncio.gather(*(one(*job) for job in jobs))
    made = sum(1 for result in results if result) - skipped
    return made, skipped


def write_index(
    terms: dict[str, dict[str, Any]],
    glossary: dict[str, dict[str, Any]],
    stems: dict[str, str],
    definition_audio: dict[str, str],
) -> None:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
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
            "audio_en": f"assets/mikey-jj/vocab/en/{stems[key]}.mp3",
        }
        if output["definitions"]:
            with_definition += 1
            output["audio_zh"] = definition_audio[output["zh"]]
            output["audio_zh_variants"] = [
                {"zh": definition, "audio_zh": definition_audio[definition]}
                for definition in output["definitions"]
            ]
        payload_terms[key] = output

    payload_phrases: dict[str, dict[str, Any]] = {}
    for key, item in sorted(glossary.items()):
        if key in terms:
            continue
        definitions = item.get("definitions") or []
        output = {
            "term": item["term"],
            "ipa": item.get("ipa") or "",
            "pos": item.get("pos") or "",
            "zh": definitions[0] if definitions else "",
            "definitions": definitions,
            "audio_en": f"assets/mikey-jj/vocab/en/{stems[key]}.mp3",
        }
        if definitions:
            output["audio_zh"] = definition_audio[definitions[0]]
            output["audio_zh_variants"] = [
                {"zh": definition, "audio_zh": definition_audio[definition]}
                for definition in definitions
            ]
        payload_phrases[key] = output

    payload = {
        "schema_version": 1,
        "series": "mikey-jj",
        "voice": {"en": EN_VOICE, "zh": ZH_VOICE},
        "scope": "all-sentence-words",
        "stats": {
            "unique_terms": len(payload_terms),
            "token_occurrences": sum(item["count"] for item in payload_terms.values()),
            "with_reviewed_definition": with_definition,
            "glossary_phrases": len(payload_phrases),
        },
        "definitions": definition_audio,
        "terms": payload_terms,
        "phrases": payload_phrases,
    }
    INDEX_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


async def main_async(force: bool, index_only: bool = False) -> int:
    terms, glossary = collect_terms()
    if not terms:
        print("VOCAB_FAILED no sentence terms", file=sys.stderr)
        return 3
    stems = allocate_stems({**terms, **{key: item for key, item in glossary.items() if key not in terms}})
    jobs: list[tuple[str, str, Path]] = []
    zh_paths: dict[str, str] = {}
    for item in glossary.values():
        for definition in item["definitions"]:
            zh_paths.setdefault(
                definition,
                str((OUTPUT_ROOT / "zh" / f"{digest(definition)}.mp3").relative_to(ROOT / "prj")).replace("\\", "/"),
            )
    for key, item in sorted({**terms, **{key: value for key, value in glossary.items() if key not in terms}}.items()):
        jobs.append((item["term"], EN_VOICE, OUTPUT_ROOT / "en" / f"{stems[key]}.mp3"))
    jobs.extend((zh, ZH_VOICE, ROOT / "prj" / path) for zh, path in sorted(zh_paths.items()))
    if index_only:
        write_index(terms, glossary, stems, zh_paths)
        print(f"VOCAB_INDEX_OK terms={len(terms)} phrases={len(glossary) - len(set(glossary) & set(terms))} index={INDEX_PATH}")
        return 0
    made, skipped = await run_jobs(jobs, force)
    write_index(terms, glossary, stems, zh_paths)
    print(f"VOCAB_OK terms={len(terms)} phrases={len(glossary) - len(set(glossary) & set(terms))} jobs={len(jobs)} generated={made} reused={skipped} index={INDEX_PATH}")
    return 0


def main() -> int:
    global CONCURRENCY
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="regenerate existing clips")
    parser.add_argument("--index-only", action="store_true", help="rewrite index.json without contacting Edge TTS")
    parser.add_argument("--concurrency", type=int, default=CONCURRENCY)
    args = parser.parse_args()
    CONCURRENCY = max(1, min(16, int(args.concurrency)))
    return asyncio.run(main_async(args.force, args.index_only))


if __name__ == "__main__":
    raise SystemExit(main())
