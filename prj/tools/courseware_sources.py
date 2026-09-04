# -*- coding: utf-8 -*-
"""Episode three-source catalog (TDD, read-only, local-only, episodes 1-10).

Resolves per-episode courseware (main/teacher/screenshot PPTX when present),
the single official quiz PDF and the annotated intensive-reader 上/下 PDF
pair by leading-3-digit episode prefix — never by directory order.
Files are only read; callers persist catalogs under content/lesson_guides/reports/.
"""
from __future__ import annotations

import hashlib
import re
import zipfile
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[2]
COURSEWARE = ROOT / "data" / "西游记课件"
MAIN_DIR = COURSEWARE / "3.3西游记  Journey to the West PPT课件"
TEACHER_DIR = COURSEWARE / "西游记外教培训11集课件"
SHOTS_DIR = COURSEWARE / "西游记-外教课动画截图"
QUIZ_DIR = ROOT / "data" / "测试题"
READER_DIR = ROOT / "data" / "02-西游记精读版台词本" / "1、带标注版PDF 108集"
STORY_DIR = ROOT / "content" / "dialogue_stories"

# Task-card locked SHA-256 for the main courseware PPTX of episodes that
# exist in more than one directory version. We MUST use the files under
# "3.3西游记  Journey to the West PPT课件" (never the G092 directory copy).
LOCKED_MAIN_HASHES = {
    42: "9e3075146e640675ae6ab15ebab1c68a694eda40012e6043b132cd0145fa7e6f",
    61: "c06c3469f69cb790d3d7d305e7c4b736051e2cff66ec4e0f1d62fbc5e85fe7ce",
    97: "6012f2e2dc8f6ca99810cdb14ef98e1f350e1f5dd7067de2c1c01dc83542a804",
}


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def pptx_pages(path: Path) -> int:
    with zipfile.ZipFile(path) as zf:
        return len([n for n in zf.namelist() if re.fullmatch(r"ppt/slides/slide\d+\.xml", n)])


def pptx_media_count(path: Path) -> int:
    with zipfile.ZipFile(path) as zf:
        return len([n for n in zf.namelist() if n.startswith("ppt/media/")])


def pdf_pages(path: Path) -> int:
    return len(PdfReader(str(path)).pages)


def _source(path: Path, kind: str, include_media: bool = False) -> dict:
    if not path.is_file():
        raise FileNotFoundError(f"locked source missing: {path}")
    out = {
        "kind": kind,
        "file": str(path),
        "name": path.name,
        "sha256": sha256_file(path),
        "pages": pptx_pages(path) if path.suffix.lower() == ".pptx" else pdf_pages(path),
    }
    if include_media:
        out["media_count"] = pptx_media_count(path)
    return out


def _require_single(files: list[Path], what: str) -> Path:
    if len(files) != 1:
        raise FileNotFoundError(f"{what}: expected exactly 1 match, found {len(files)}")
    return files[0]


def discover_quiz_pdf() -> Path:
    return _require_single(sorted(Path(QUIZ_DIR).glob("*.pdf")), "quiz PDF")


def discover_main_pptx(episode: int) -> Path:
    path = _require_single(list(Path(MAIN_DIR).glob(f"{episode:03d}_*.pptx")), f"main PPTX ep{episode}")
    pin = LOCKED_MAIN_HASHES.get(episode)
    if pin is not None:
        actual = sha256_file(path).lower()
        if actual != pin:
            raise SystemExit(
                f"BLOCKED: main PPTX hash lock failed for ep{episode}: "
                f"{path.name} sha256={actual} != locked {pin}; "
                "do NOT fall back to the G092 directory version"
            )
        if "G092" in str(path):
            raise SystemExit(f"BLOCKED: ep{episode} main PPTX must not come from the G092 directory")
    return path


def discover_teacher_pptx(episode: int) -> Path | None:
    files = list(Path(TEACHER_DIR).glob(f"西游记外教E{episode:03d}.pptx"))
    if len(files) > 1:
        raise FileNotFoundError(f"teacher PPTX ep{episode}: expected <=1, found {len(files)}")
    return files[0] if files else None


def discover_screenshots_pptx(episode: int) -> Path | None:
    files = list(Path(SHOTS_DIR).glob(f"Journey to the West {episode:03d}  *.pptx"))
    if len(files) > 1:
        raise FileNotFoundError(f"screenshots PPTX ep{episode}: expected <=1, found {len(files)}")
    return files[0] if files else None


def discover_reader_pair(episode: int) -> list[Path]:
    # leading-3-digit lock; no space required (e.g. "074谛听 上.pdf")
    found = sorted(Path(READER_DIR).glob(f"{episode:03d}*.pdf"))
    if len(found) != 2:
        raise FileNotFoundError(f"reader pair ep{episode}: expected exactly 2 PDFs, found {len(found)} in {READER_DIR}")
    return found


def story_json_path(episode: int) -> Path:
    return Path(STORY_DIR) / f"ep{episode}.json"


def catalog_episode(episode: int) -> dict:
    if not 1 <= episode <= 108:
        raise SystemExit(f"BLOCKED: episode out of range (got {episode})")
    up, down = discover_reader_pair(episode)
    quiz = discover_quiz_pdf()
    main = discover_main_pptx(episode)
    teacher = discover_teacher_pptx(episode)
    shots = discover_screenshots_pptx(episode)

    sources = {
        "main_pptx": _source(main, "courseware_main_pptx", include_media=True),
        "quiz_pdf": _source(quiz, "official_quiz_pdf"),
        "reader_up": dict(_source(up, "intensive_reader_pdf"), half="up"),
        "reader_down": dict(_source(down, "intensive_reader_pdf"), half="down"),
    }
    sources["teacher_pptx"] = (
        dict(_source(teacher, "courseware_teacher_pptx", include_media=True), available=True)
        if teacher
        else {"kind": "courseware_teacher_pptx", "available": False, "file": None,
              "reason": "teacher source unavailable for this episode"}
    )
    sources["screenshots_pptx"] = (
        dict(_source(shots, "courseware_screenshots_pptx", include_media=True), available=True)
        if shots
        else {"kind": "courseware_screenshots_pptx", "available": False, "file": None,
              "reason": "screenshot source unavailable for this episode"}
    )
    return {
        "schema_version": 1,
        "episode": episode,
        "sources": sources,
    }


if __name__ == "__main__":
    import json
    import sys

    ep = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    print(json.dumps(catalog_episode(ep), ensure_ascii=False, indent=2))