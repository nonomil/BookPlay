from __future__ import annotations

import importlib.util
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "prj" / "tools" / "clean_minecraft_text.py"
DATA_DIR = ROOT / "prj" / "data" / "storybooks-minecraft"


def load_cleaner():
    spec = importlib.util.spec_from_file_location("clean_minecraft_text", MODULE_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_reviewed_replacements_are_idempotent_and_keep_sentence_count(tmp_path):
    cleaner = load_cleaner()
    data_dir = tmp_path / "storybooks-minecraft"
    data_dir.mkdir()
    for name in ("book1.json", "book2.json", "book3.json", "book4.json", "book5.json"):
        (data_dir / name).write_bytes((DATA_DIR / name).read_bytes())
    for name in ("sentence-annotations-book1.json", "sentence-annotations-book2.json",
                 "sentence-annotations-book3.json", "sentence-annotations-book4.json",
                 "sentence-annotations-book5.json"):
        (data_dir / name).write_bytes((DATA_DIR / name).read_bytes())

    # Seed one known OCR artefact in each sidecar/source copy so the test
    # exercises the write path even though the checked-in data is already
    # clean after the review batch.
    for name in ("book1.json", "sentence-annotations-book1.json"):
        path = data_dir / name
        payload = json.loads(path.read_text(encoding="utf-8"))
        node = payload["pages"][0]["sentences"][0] if "pages" in payload else payload["sentences"][0]
        node["text_en"] = "RA On the other side of the portal, they could see Byte."
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    first = sum(cleaner.clean_book(book, data_dir=data_dir, write=True) for book in range(1, 6))
    second = sum(cleaner.clean_book(book, data_dir=data_dir, write=True) for book in range(1, 6))
    assert first == 2
    assert second == 0

    for book in range(1, 6):
        source = json.loads((data_dir / f"book{book}.json").read_text(encoding="utf-8"))
        sidecar = json.loads((data_dir / f"sentence-annotations-book{book}.json").read_text(encoding="utf-8"))
        source_sentences = [s for p in source["pages"] for s in p["sentences"]]
        assert all(not any(token in s["text_en"] for token in ("7277", "JQ ", "RA ", "bottom I", "j journey", "\nH "))
                   for s in source_sentences)
        assert len(source_sentences) == len(sidecar["sentences"])
        assert [s["text_en"] for s in source_sentences] == [s["text_en"] for s in sidecar["sentences"]]
