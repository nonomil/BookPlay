from __future__ import annotations

import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "prj" / "tools" / "minecraft_word_alignment.py"


def load_alignment():
    spec = importlib.util.spec_from_file_location("minecraft_word_alignment", MODULE_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_tokenizer_keeps_authored_contractions_and_hyphens():
    alignment = load_alignment()
    assert alignment.tokenize("It's brand-new TNT! Don't fall—run.") == ["It's", "brand-new", "TNT", "Don't", "fall", "run"]


def test_alignment_rejects_insertions_deletions_and_bad_boundaries():
    alignment = load_alignment()
    words, reason = alignment.align_tokens(
        ["Birch", "ran"],
        [{"text": "Birch", "start_ms": 0, "end_ms": 300}, {"text": "ran", "start_ms": 320, "end_ms": 600}],
    )
    assert reason is None
    assert [word["text"] for word in words] == ["Birch", "ran"]
    words, reason = alignment.align_tokens(
        ["Birch", "ran"],
        [{"text": "Birch", "start_ms": 0, "end_ms": 300}],
    )
    assert words is None
    assert reason and "ASR delete" in reason


def test_alignment_accepts_a_small_asr_spelling_variation_but_keeps_source_text():
    alignment = load_alignment()
    words, reason = alignment.align_tokens(
        ["Birch"],
        [{"text": "Burch", "start_ms": 120, "end_ms": 420}],
    )
    assert reason is None
    assert words[0]["text"] == "Birch"
    assert words[0]["asr_text"] == "Burch"
