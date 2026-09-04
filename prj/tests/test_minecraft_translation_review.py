from __future__ import annotations

import importlib.util
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "prj" / "tools" / "minecraft_translation_review.py"
DATA_DIR = ROOT / "prj" / "data" / "storybooks-minecraft"


def load_review():
    spec = importlib.util.spec_from_file_location("minecraft_translation_review", MODULE_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_export_contains_all_stable_ids_and_immutable_source_text(tmp_path):
    review = load_review()
    target = review.export_queue(1, output=tmp_path / "book1.json")
    queue = json.loads(target.read_text(encoding="utf-8"))
    # The production queue may advance as books are reviewed; export must
    # preserve the current state rather than resetting it.
    assert queue["status"] in {"needs-review", "reviewed"}
    assert len(queue["sentences"]) == 76
    assert queue["sentences"][0]["id"] == "mc-b1-p01-s01"
    assert queue["sentences"][0]["text_en"] == "Emmy and Birch were ready for adventure!"


def test_import_rejects_missing_translation_and_source_mutation(tmp_path):
    review = load_review()
    target = review.export_queue(1, output=tmp_path / "book1.json")
    queue = json.loads(target.read_text(encoding="utf-8"))
    queue["sentences"][0]["text_en"] = "changed"
    queue["sentences"][0]["zh"] = ""
    queue["sentences"][0]["status"] = "missing"
    errors = review.validate_queue(1, queue)
    assert any("text_en changed" in error for error in errors)
    assert any("zh is missing" in error for error in errors)
