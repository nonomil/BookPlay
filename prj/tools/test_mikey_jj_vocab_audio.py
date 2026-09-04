from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "prj" / "data" / "storybooks-mikey-jj"
INDEX = ROOT / "prj" / "assets" / "mikey-jj" / "vocab" / "index.json"


def test_mikey_manifest_covers_every_sentence_word_with_offline_english_audio():
    """Every tap target in published Mikey & JJ sentences has a local clip."""
    import sys

    sys.path.insert(0, str(ROOT / "prj" / "tools"))
    import mikey_jj_vocab_audio as pipeline

    manifest = json.loads(INDEX.read_text(encoding="utf-8"))
    assert manifest["series"] == "mikey-jj"
    assert manifest["scope"] == "all-sentence-words"
    terms = manifest["terms"]
    expected_occurrences = 0
    for book_path in sorted(DATA.glob("book*.json"), key=lambda p: int(p.stem[4:])):
        payload = json.loads(book_path.read_text(encoding="utf-8"))
        for page in payload.get("pages") or []:
            for sentence in page.get("sentences") or []:
                for token in pipeline.tokenise(sentence.get("text_en") or ""):
                    expected_occurrences += 1
                    key = pipeline.normalize(token)
                    assert key in terms, token
                    clip = terms[key].get("audio_en")
                    assert clip
                    assert (ROOT / "prj" / clip).stat().st_size > 1000
    assert manifest["stats"]["token_occurrences"] == expected_occurrences
    assert manifest["stats"]["unique_terms"] == len(terms)


def test_mikey_manifest_only_claims_reviewed_chinese_definitions():
    manifest = json.loads(INDEX.read_text(encoding="utf-8"))
    definitions = set(manifest["definitions"])
    with_definition = [entry for entry in manifest["terms"].values() if entry.get("zh")]
    for entry in with_definition:
        assert set(entry["definitions"]) <= definitions
        assert (ROOT / "prj" / entry["audio_zh"]).stat().st_size > 1000
    assert manifest["stats"]["with_reviewed_definition"] == len(with_definition)
