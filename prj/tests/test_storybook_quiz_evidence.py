# -*- coding: utf-8 -*-
from __future__ import annotations

import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
TOOL = ROOT / "prj" / "tools" / "validate_storybook_quiz_evidence.py"


def _load():
    spec = importlib.util.spec_from_file_location("validate_storybook_quiz_evidence", TOOL)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _book(*questions):
    return {
        "schema_version": 2,
        "series": "fixture",
        "book": 1,
        "pages": [
            {
                "page_no": 1,
                "sentences": [
                    {
                        "id": "fx-p01-s01",
                        "text_en": "Mikey crossed the river.",
                        "glossary": [{"term": "river", "zh": "河流"}],
                    }
                ],
            }
        ],
        "scenes": [{"id": "scene-01", "sentence_ids": ["fx-p01-s01"]}],
        "quiz": list(questions),
    }


def test_valid_vocab_question_is_bound_to_sentence_glossary():
    tool = _load()
    problems = tool.validate_book(
        _book(
            {
                "id": "fx-q01",
                "type": "meaning-choice",
                "term": "river",
                "source_sentence_id": "fx-p01-s01",
                "prompt_en": 'What does “river” mean?',
                "choices_en": ["河流", "山"],
                "answer": 0,
            }
        )
    )
    assert problems == []


def test_comprehension_question_requires_concept_and_real_source():
    tool = _load()
    problems = tool.validate_book(
        _book(
            {
                "id": "fx-q02",
                "type": "comprehension",
                "concept_id": "cross-the-river",
                "source_sentence_ids": ["fx-p01-s01"],
                "scene_id": "scene-01",
                "prompt_en": "What did Mikey cross?",
                "choices_en": ["A river", "A mountain"],
                "answer": 0,
            }
        )
    )
    assert problems == []


def test_missing_evidence_and_substring_match_are_rejected():
    tool = _load()
    problems = tool.validate_book(
        _book(
            {
                "id": "fx-q03",
                "type": "meaning-choice",
                "term": "Mikey",
                "source_sentence_id": "fx-p01-s01",
                "prompt_en": "What does Mikey mean?",
                "choices_en": ["米凯", "河流"],
                "answer": 0,
            },
            {
                "id": "fx-q04",
                "type": "comprehension",
                "prompt_en": "Who crossed the river?",
                "choices_en": ["Mikey", "A wolf"],
                "answer": 0,
            },
        )
    )
    codes = {item["code"] for item in problems}
    assert "term_not_in_source_sentence" in codes
    assert "missing_source" in codes

