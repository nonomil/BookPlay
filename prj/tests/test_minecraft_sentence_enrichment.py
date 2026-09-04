from __future__ import annotations

import importlib.util
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "prj" / "tools" / "minecraft_sentence_pipeline.py"
DATA_DIR = ROOT / "prj" / "data" / "storybooks-minecraft"


def load_pipeline():
    spec = importlib.util.spec_from_file_location("minecraft_sentence_pipeline", MODULE_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_all_minecraft_sentences_have_stable_ids_and_expected_count():
    pipeline = load_pipeline()
    all_ids = []
    for book in range(1, 6):
        payload = json.loads((DATA_DIR / f"book{book}.json").read_text(encoding="utf-8"))
        ids = [item["id"] for item in pipeline.iter_book_sentences(payload, book)]
        assert len(ids) == len(set(ids))
        assert all(pipeline.ID_RE.fullmatch(item) for item in ids)
        all_ids.extend(ids)
    assert len(all_ids) == 367
    assert len(all_ids) == len(set(all_ids))


def test_scaffold_is_sidecar_only_and_preserves_source(tmp_path):
    pipeline = load_pipeline()
    source = DATA_DIR / "book1.json"
    before = source.read_bytes()
    target = tmp_path / "sentence-annotations-book1.json"
    assert pipeline.scaffold_book(1, output=target) == target
    assert source.read_bytes() == before
    payload = json.loads(target.read_text(encoding="utf-8"))
    assert payload["status"] == "scaffold"
    assert payload["named_entities"]["Nether"] == "下界"
    assert len(payload["sentences"]) == 76
    first = payload["sentences"][0]
    assert first["id"] == "mc-b1-p01-s01"
    assert first["text_en"]
    assert first["zh"] == ""
    assert first["words"] == []
    assert first["audio"].endswith("page-01-sentence-01.mp3")


def test_scaffold_validation_reports_missing_learning_data_without_fabricating_it(tmp_path):
    pipeline = load_pipeline()
    target = tmp_path / "sentence-annotations-book1.json"
    pipeline.scaffold_book(1, output=target)
    report = pipeline.validate_annotations(1, annotations=target)
    assert report["errors"] == []
    assert report["expected_sentences"] == 76
    assert report["with_audio"] == 76
    assert report["with_zh"] == 0
    assert report["with_words"] == 0
    assert len(report["warnings"]) == 76

    strict = pipeline.validate_annotations(
        1,
        annotations=target,
        require_zh=True,
        require_words_when_audio=True,
    )
    assert len(strict["errors"]) == 152


def test_apply_refuses_an_incomplete_scaffold(tmp_path):
    pipeline = load_pipeline()
    target = tmp_path / "sentence-annotations-book1.json"
    pipeline.scaffold_book(1, output=target)
    try:
        pipeline.apply_annotations(1, annotations=target)
    except ValueError as exc:
        assert "annotation validation failed" in str(exc)
    else:
        raise AssertionError("apply must refuse empty translations and word timings")


def test_apply_merges_only_validated_fields_and_preserves_quiz(tmp_path):
    pipeline = load_pipeline()
    data_dir = tmp_path / "storybooks-minecraft"
    data_dir.mkdir()
    source = DATA_DIR / "book1.json"
    target_book = data_dir / "book1.json"
    target_book.write_bytes(source.read_bytes())
    annotations = data_dir / "sentence-annotations-book1.json"
    pipeline.scaffold_book(1, data_dir=data_dir)
    payload = json.loads(annotations.read_text(encoding="utf-8"))
    for record in payload["sentences"]:
        record["zh"] = "已审核译文"
        record["words"] = [{"text": record["text_en"].split()[0], "start_ms": 0, "end_ms": 1}]
        record["translation_status"] = "reviewed"
        record["word_timing_status"] = "reviewed"
    annotations.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    result = pipeline.apply_annotations(1, data_dir=data_dir)
    assert result == target_book
    merged = json.loads(target_book.read_text(encoding="utf-8"))
    assert merged["quiz"]
    first = merged["pages"][0]["sentences"][0]
    assert first["id"] == "mc-b1-p01-s01"
    assert first["zh"] == "已审核译文"
    assert first["words"][0]["end_ms"] == 1
