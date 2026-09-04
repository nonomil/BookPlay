from __future__ import annotations

import json
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]


def _norm(value: str) -> str:
    return " ".join(str(value or "").replace("’", "'").split()).strip().casefold()


@pytest.mark.parametrize("series", ["minecraft", "mikey-jj"])
def test_quiz_audio_manifest_covers_every_prompt_and_choice(series: str):
    data_root = ROOT / "prj" / "data" / f"storybooks-{series}"
    index_path = ROOT / "prj" / "assets" / series / "quiz" / "index.json"
    assert index_path.is_file(), f"{series} quiz index must be published"
    manifest = json.loads(index_path.read_text(encoding="utf-8"))
    assert manifest["series"] == series
    assert manifest["scope"] == "quiz-prompts-and-choices"
    records = manifest["questions"]
    expected = {}
    for book_path in sorted(data_root.glob("book*.json"), key=lambda p: int(p.stem[4:])):
        for question in json.loads(book_path.read_text(encoding="utf-8")).get("quiz") or []:
            qid = str(question.get("id") or "").strip()
            if not qid:
                continue
            expected[qid] = question
    assert set(records) == set(expected)
    for qid, question in expected.items():
        record = records[qid]
        prompt_en = str(question.get("prompt_en") or question.get("q") or "").strip()
        assert record["prompt"]["en"]
        assert _norm(prompt_en) in manifest["text_audio"]["en"]
        prompt_path = ROOT / "prj" / record["prompt"]["en"]
        assert prompt_path.stat().st_size > 1000
        choices = question.get("choices_en") if isinstance(question.get("choices_en"), list) else question.get("choices") or []
        assert len(record["choices"]) == len(choices)
        for choice in record["choices"]:
            assert choice["en"]
            assert (ROOT / "prj" / choice["en"]).stat().st_size > 1000
        prompt_zh = str(question.get("prompt_zh") or question.get("q_zh") or "").strip()
        if prompt_zh:
            assert record["prompt"]["zh"]
            assert (ROOT / "prj" / record["prompt"]["zh"]).stat().st_size > 1000
        for choice in record["choices"]:
            if choice["zh"]:
                assert (ROOT / "prj" / choice["zh"]).stat().st_size > 1000
