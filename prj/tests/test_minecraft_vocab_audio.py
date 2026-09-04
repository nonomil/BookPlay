from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "prj" / "data" / "storybooks-minecraft"
INDEX = ROOT / "prj" / "assets" / "minecraft" / "vocab" / "index.json"


def test_minecraft_vocab_manifest_covers_every_sentence_token_and_static_clip():
    import sys

    sys.path.insert(0, str(ROOT / "prj" / "tools"))
    import minecraft_vocab_audio as pipeline

    manifest = json.loads(INDEX.read_text(encoding="utf-8"))
    assert manifest["series"] == "minecraft"
    assert manifest["scope"] == "all-sentence-words"
    terms = manifest["terms"]
    expected_occurrences = 0
    for book_no in range(1, 6):
        payload = json.loads((DATA / f"book{book_no}.json").read_text(encoding="utf-8"))
        for page in payload.get("pages") or []:
            for sentence in page.get("sentences") or []:
                for token in pipeline.tokenise(sentence.get("text_en") or ""):
                    expected_occurrences += 1
                    key = pipeline.normalize(token)
                    assert key in terms, token
                    assert (ROOT / "prj" / terms[key]["audio_en"]).stat().st_size > 1000
    assert manifest["stats"]["token_occurrences"] == expected_occurrences
    assert manifest["stats"]["unique_terms"] == len(terms)


def test_minecraft_manifest_only_claims_reviewed_chinese_definitions():
    manifest = json.loads(INDEX.read_text(encoding="utf-8"))
    definitions = set(manifest["definitions"])
    with_definition = [entry for entry in manifest["terms"].values() if entry.get("zh")]
    assert with_definition
    for entry in with_definition:
        assert set(entry["definitions"]) <= definitions
        assert (ROOT / "prj" / entry["audio_zh"]).stat().st_size > 1000
    assert manifest["stats"]["with_reviewed_definition"] == len(with_definition)
