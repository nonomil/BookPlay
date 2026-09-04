from __future__ import annotations

import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "prj" / "tools" / "seed_minecraft_translation_batch.py"


def load_batch():
    spec = importlib.util.spec_from_file_location("seed_minecraft_translation_batch", MODULE_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_translation_batches_match_book_sentence_counts_and_have_no_placeholders():
    batch = load_batch()
    expected = {1: 76, 2: 85, 3: 61, 4: 72, 5: 73}
    values = {
        1: batch.BOOK1_ZH,
        2: batch.BOOK2_ZH,
        3: batch.BOOK3_ZH,
        4: batch.BOOK4_ZH,
        5: batch.BOOK5_ZH,
    }
    for book, translations in values.items():
        assert len(translations) == expected[book]
        assert all(text.strip() and "TODO" not in text and "待翻译" not in text for text in translations)
