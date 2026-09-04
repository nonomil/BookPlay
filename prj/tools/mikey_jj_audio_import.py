"""Import Mikey & JJ audiobook video audio and regenerate sentence clips.

The source videos are immutable.  This command keeps the derived, auditable
audio under ``prj/data/storybooks-mikey-jj/source-audio`` and writes playback
clips under each book's existing ``prj/assets/mikey-jj/<slug>/sentences``
directory.  Only exact basename matches are processed; unmatched local videos
are reported instead of being guessed into a book.

Examples:
  python -X utf8 prj/tools/mikey_jj_audio_import.py run
  python -X utf8 prj/tools/mikey_jj_audio_import.py manifest
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
SOURCE_ROOT = ROOT / "书籍资料库" / "Mikey & JJ 英文冒险"
VIDEO_ROOT = SOURCE_ROOT / "MikeyJJ Audio Books"
DERIVED_ROOT = ROOT / "prj" / "data" / "storybooks-mikey-jj" / "source-audio"
ASSET_ROOT = ROOT / "prj" / "assets" / "mikey-jj"
MANIFEST_PATH = ROOT / "prj" / "data" / "storybooks-mikey-jj" / "audio-manifest.json"
FFMPEG = Path(
    r"C:\Users\No'mi'l\AppData\Local\Programs\Python\Python311\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe"
)

# The contract intentionally excludes Baby Creeper, Slime King, and Warden:
# there is no exact matching published book/page package for those videos.
BOOKS: tuple[dict[str, Any], ...] = (
    {"book": 1, "slug": "zombie-school-adventure", "video": "Zombie School Adventure.mp4", "annotations": "speaking-annotations-book1.json"},
    {"book": 2, "slug": "water-house-adventure", "video": "Water House Adventure.mp4", "annotations": "speaking-annotations.json"},
    {"book": 3, "slug": "penguin-adventure", "video": "Penguin Adventure.mp4", "annotations": "speaking-annotations-book3.json"},
    {"book": 5, "slug": "tornado-adventure", "video": "Tornado Adventure.mp4", "annotations": "speaking-annotations-book5.json"},
    {"book": 6, "slug": "godzilla-adventure", "video": "Godzilla Adventure.mp4", "annotations": "speaking-annotations-book6.json"},
    {"book": 7, "slug": "piglin-adventure", "video": "Piglin Adventure.mp4", "annotations": "speaking-annotations-book7.json"},
    {"book": 8, "slug": "burger-shop-adventure", "video": "Burger Shop Adventure.mp4", "annotations": "speaking-annotations-book8.json"},
    {"book": 9, "slug": "scary-cat-adventure", "video": "Scary Cat Adventure.mp4", "annotations": "speaking-annotations-book9.json"},
    {"book": 10, "slug": "cruise-ship-adventure", "video": "Cruise Ship Adventure.mp4", "annotations": "speaking-annotations-book10.json"},
    {"book": 11, "slug": "noob-to-king-adventure", "video": "Noob to King Adventure.mp4", "annotations": "speaking-annotations-book11.json"},
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run(command: list[str]) -> None:
    result = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode:
        detail = (result.stderr or result.stdout or "command failed").strip()
        raise RuntimeError(f"{command[0]} failed ({result.returncode}): {detail}")


def probe_duration_ms(path: Path) -> int | None:
    result = subprocess.run([str(FFMPEG), "-i", str(path)], capture_output=True, text=True, encoding="utf-8", errors="replace")
    match = re.search(r"Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)", (result.stderr or "") + (result.stdout or ""))
    if not match:
        return None
    hours, minutes, seconds = match.groups()
    return round((int(hours) * 3600 + int(minutes) * 60 + float(seconds)) * 1000)


def extract_one(item: dict[str, Any]) -> Path:
    if not FFMPEG.is_file():
        raise FileNotFoundError(f"locked ffmpeg missing: {FFMPEG}")
    source = VIDEO_ROOT / str(item["video"])
    if not source.is_file():
        raise FileNotFoundError(f"source video missing: {source}")
    DERIVED_ROOT.mkdir(parents=True, exist_ok=True)
    destination = DERIVED_ROOT / f"{item['slug']}.mp3"
    # Keep `.mp3` as the final suffix so ffmpeg selects the muxer reliably;
    # the intermediate name is still clearly separated from the final file.
    part = destination.with_name(destination.stem + ".part.mp3")
    part.unlink(missing_ok=True)
    run([str(FFMPEG), "-y", "-hide_banner", "-loglevel", "error", "-i", str(source), "-vn", "-c:a", "libmp3lame", "-q:a", "2", str(part)])
    if not part.is_file() or part.stat().st_size == 0:
        raise RuntimeError(f"empty extraction: {source}")
    part.replace(destination)
    return destination


def slice_one(item: dict[str, Any], audio: Path) -> int:
    annotation = ROOT / "prj" / "data" / "storybooks-mikey-jj" / str(item["annotations"])
    output = ASSET_ROOT / str(item["slug"]) / "sentences"
    output.mkdir(parents=True, exist_ok=True)
    pipeline = ROOT / "prj" / "tools" / "mikey_jj_sentence_pipeline.py"
    run([sys.executable, "-X", "utf8", str(pipeline), "slice", "--annotations", str(annotation), "--audio", str(audio), "--out", str(output)])
    # A sidecar can contain a visual-only unit (for example the Godzilla
    # explosion).  The book JSON is the source of truth for whether a playable
    # clip exists; remove any clip the generic slicer produced for audio:null.
    book_json = ROOT / "prj" / "data" / "storybooks-mikey-jj" / f"book{item['book']}.json"
    book = json.loads(book_json.read_text(encoding="utf-8"))
    for page in book.get("pages") or []:
        page_no = int(page.get("page_no") or 0)
        for index, sentence in enumerate(page.get("sentences") or [], start=1):
            if sentence.get("audio") is None:
                stale = output / f"page-{page_no:02d}-sentence-{index:02d}.mp3"
                stale.unlink(missing_ok=True)
    return len(list(output.glob("page-*-sentence-*.mp3")))


def build_manifest() -> dict[str, Any]:
    local_videos = sorted(p.name for p in VIDEO_ROOT.glob("*.mp4"))
    matched_names = {str(item["video"]) for item in BOOKS}
    entries: list[dict[str, Any]] = []
    for item in BOOKS:
        audio = DERIVED_ROOT / f"{item['slug']}.mp3"
        book_json = ROOT / "prj" / "data" / "storybooks-mikey-jj" / f"book{item['book']}.json"
        book = json.loads(book_json.read_text(encoding="utf-8"))
        sentence_count = sum(len(page.get("sentences") or []) for page in book.get("pages") or [])
        missing_audio = sum(1 for page in book.get("pages") or [] for sentence in page.get("sentences") or [] if sentence.get("audio") is None)
        clip_dir = ASSET_ROOT / str(item["slug"]) / "sentences"
        library_audio = SOURCE_ROOT / "audio" / (Path(str(item["video"])).stem + ".mp3")
        derived_hash = sha256(audio) if audio.is_file() else None
        library_hash = sha256(library_audio) if library_audio.is_file() else None
        entries.append(
            {
                "book": item["book"],
                "slug": item["slug"],
                "source_video": str((VIDEO_ROOT / str(item["video"])).relative_to(ROOT)).replace("\\", "/"),
                "derived_audio": str(audio.relative_to(ROOT)).replace("\\", "/"),
                "source_video_sha256": sha256(VIDEO_ROOT / str(item["video"])),
                "derived_audio_sha256": derived_hash,
                "existing_library_audio": str(library_audio.relative_to(ROOT)).replace("\\", "/"),
                "existing_library_audio_sha256": library_hash,
                "byte_identical_to_existing": bool(derived_hash and library_hash and derived_hash == library_hash),
                "duration_ms": probe_duration_ms(audio) if audio.is_file() else None,
                "expected_sentences": sentence_count,
                "missing_audio_sentences": missing_audio,
                "sentence_clips": len(list(clip_dir.glob("page-*-sentence-*.mp3"))),
            }
        )
    return {
        "schema_version": 1,
        "generated_by": "prj/tools/mikey_jj_audio_import.py",
        "ffmpeg": str(FFMPEG),
        "source_root": str(VIDEO_ROOT.relative_to(ROOT)).replace("\\", "/"),
        "derived_root": str(DERIVED_ROOT.relative_to(ROOT)).replace("\\", "/"),
        "matched_count": len(BOOKS),
        "local_video_count": len(local_videos),
        "unmatched_local_videos": sorted(name for name in local_videos if name not in matched_names),
        "books": entries,
    }


def write_manifest() -> None:
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps(build_manifest(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("extract", "slice", "manifest", "run"))
    args = parser.parse_args()
    try:
        if args.command in ("extract", "run"):
            for item in BOOKS:
                output = extract_one(item)
                print(f"EXTRACT_OK book={item['book']} audio={output}")
        if args.command in ("slice", "run"):
            for item in BOOKS:
                audio = DERIVED_ROOT / f"{item['slug']}.mp3"
                clips = slice_one(item, audio)
                print(f"SLICE_OK book={item['book']} clips={clips}")
        if args.command in ("manifest", "run"):
            write_manifest()
            print(f"MANIFEST_OK path={MANIFEST_PATH}")
    except (FileNotFoundError, RuntimeError, json.JSONDecodeError) as exc:
        print(f"AUDIO_IMPORT_FAILED: {exc}", file=sys.stderr)
        return 3
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
