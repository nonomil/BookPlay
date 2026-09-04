# -*- coding: utf-8 -*-
from __future__ import annotations

import importlib.util
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
VALIDATOR = ROOT / "prj" / "tools" / "validate_storybook_quiz_evidence.py"
BOOKS = (
    ROOT / "prj" / "data" / "storybooks-minecraft" / "book1.json",
    ROOT / "prj" / "data" / "storybooks-mikey-jj" / "book1.json",
    ROOT / "prj" / "data" / "storybooks-minecraft" / "book2.json",
    ROOT / "prj" / "data" / "storybooks-mikey-jj" / "book2.json",
    ROOT / "prj" / "data" / "storybooks-minecraft" / "book3.json",
    ROOT / "prj" / "data" / "storybooks-mikey-jj" / "book3.json",
    ROOT / "prj" / "data" / "storybooks-minecraft" / "book4.json",
    ROOT / "prj" / "data" / "storybooks-minecraft" / "book5.json",
    ROOT / "prj" / "data" / "storybooks-mikey-jj" / "book5.json",
    ROOT / "prj" / "data" / "storybooks-mikey-jj" / "book6.json",
    ROOT / "prj" / "data" / "storybooks-mikey-jj" / "book7.json",
    ROOT / "prj" / "data" / "storybooks-mikey-jj" / "book8.json",
    ROOT / "prj" / "data" / "storybooks-mikey-jj" / "book9.json",
    ROOT / "prj" / "data" / "storybooks-mikey-jj" / "book10.json",
    ROOT / "prj" / "data" / "storybooks-mikey-jj" / "book11.json",
)


def _validator():
    spec = importlib.util.spec_from_file_location("quiz_evidence", VALIDATOR)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_book1_questions_have_explicit_learning_evidence():
    tool = _validator()
    for path in BOOKS:
        book = json.loads(path.read_text(encoding="utf-8"))
        problems = tool.validate_book(book, path)
        assert problems == [], f"{path.name}: {problems}"
        expected_count = 4 if path.parent.name == "storybooks-minecraft" and path.stem == "book3" else 3 if path.parent.name == "storybooks-minecraft" and path.stem == "book4" else 5
        assert len(book["quiz"]) == expected_count
        for question in book["quiz"]:
            assert question["id"]
            assert question["type"] in tool.VALID_TYPES
            assert question.get("source_sentence_id") or question.get("source_sentence_ids") or question.get("scene_id")
