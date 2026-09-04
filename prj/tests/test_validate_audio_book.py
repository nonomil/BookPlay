from __future__ import annotations

import importlib.util
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "scripts" / "validate_audio_book.py"


def load_validator():
    spec = importlib.util.spec_from_file_location("validate_audio_book", MODULE_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def write_fixture(tmp_path: Path, *, audio: str = "clips/line.mp3", words=None, zh: str = "一条线"):
    book = {
        "series": "minecraft",
        "book": 1,
        "pages": [{"page_no": 1, "sentences": [{"text_en": "Run fast!", "audio": audio}]}],
    }
    annotations = {
        "sentences": [{
            "id": "mc-b1-p01-s01",
            "text_en": "Run fast!",
            "zh": zh,
            "audio": audio,
            "duration_ms": 1000,
            "words": words if words is not None else [
                {"text": "Run", "start_ms": 0, "end_ms": 420},
                {"text": "fast", "start_ms": 420, "end_ms": 900},
            ],
        }],
    }
    book_path = tmp_path / "book.json"
    annotation_path = tmp_path / "annotations.json"
    book_path.write_text(json.dumps(book), encoding="utf-8")
    annotation_path.write_text(json.dumps(annotations), encoding="utf-8")
    if audio:
        clip = tmp_path / audio
        clip.parent.mkdir(parents=True, exist_ok=True)
        clip.write_bytes(b"fixture")
    return book_path, annotation_path


def test_validator_accepts_complete_fixture(tmp_path):
    validator = load_validator()
    book, annotations = write_fixture(tmp_path)
    report = validator.validate_audio_book(
        book_json=book,
        annotations=annotations,
        root=tmp_path,
        require_zh=True,
        require_words_when_audio=True,
    )
    assert report["errors"] == []
    assert report["clips"] == 1
    assert report["with_zh"] == 1
    assert report["with_words"] == 1


def test_validator_reports_missing_clip(tmp_path):
    validator = load_validator()
    book, annotations = write_fixture(tmp_path, audio="clips/missing.mp3")
    (tmp_path / "clips" / "missing.mp3").unlink()
    report = validator.validate_audio_book(book_json=book, annotations=annotations, root=tmp_path)
    assert any("clip not found" in error for error in report["errors"])


def test_validator_reports_out_of_range_and_overlapping_words(tmp_path):
    validator = load_validator()
    book, annotations = write_fixture(
        tmp_path,
        words=[
            {"text": "Run", "start_ms": 0, "end_ms": 700},
            {"text": "fast", "start_ms": 650, "end_ms": 1200},
        ],
    )
    report = validator.validate_audio_book(book_json=book, annotations=annotations, root=tmp_path)
    assert any("overlaps" in error for error in report["errors"])
    assert any("exceeds clip duration" in error for error in report["errors"])


def test_validator_can_require_translation_and_word_timing(tmp_path):
    validator = load_validator()
    book, annotations = write_fixture(tmp_path, words=[], zh="")
    report = validator.validate_audio_book(
        book_json=book,
        annotations=annotations,
        root=tmp_path,
        require_zh=True,
        require_words_when_audio=True,
    )
    assert any("zh is missing" in error for error in report["errors"])
    assert any("no word timing" in error for error in report["errors"])
