# -*- coding: utf-8 -*-
"""TDD: assistant-reviewed quiz answers are evidence-gated and atomic."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from prj.tools import apply_quiz_assistant_answers as sut
from prj.tools import build_quiz_answer_key, lesson_schema, validate_quiz_answers


def _bank() -> dict:
    return {
        "questions": [
            {
                "episode": 1,
                "number": 1,
                "q": "already verified",
                "choices": ["rock", "tree", "river"],
                "answer": 0,
                "answer_evidence": [{"node_id": "n1", "quote": "came from a rock"}],
                "review_status": "machine_verified",
            },
            {
                "episode": 1,
                "number": 2,
                "q": "where did he go?",
                "choices": ["river", "cave", "palace"],
                "answer": -1,
                "answer_evidence": [],
                "review_status": "needs_review",
                "old_answer": 0,
            },
        ]
    }


def _packet() -> dict:
    return {
        "reviewer": "codex-worker",
        "episodes": "1-1",
        "answers": [
            {
                "episode": 1,
                "number": 2,
                "answer": 1,
                "answer_letter": "B",
                "evidence": [{"node_id": "n2", "quote": "He entered the cave."}],
                "confidence": 0.96,
                "rationale": "The story explicitly says he entered the cave.",
            }
        ],
    }


def _stories(tmp_path):
    story_dir = tmp_path / "stories"
    story_dir.mkdir()
    (story_dir / "ep1.json").write_text(
        json.dumps({"nodes": [
            {"node_id": "n1", "text_en": "The monkey came from a rock."},
            {"node_id": "n2", "text_en": "He entered the cave."},
        ]}),
        encoding="utf-8",
    )
    return story_dir


def test_apply_marks_only_pending_question_as_assistant_reviewed(tmp_path) -> None:
    updated = sut.apply_packets(_bank(), [_packet()], _stories(tmp_path))
    existing, reviewed = updated["questions"]
    assert existing["review_status"] == "machine_verified"
    assert reviewed["answer"] == 1
    assert reviewed["answer_evidence"] == [{"node_id": "n2", "quote": "He entered the cave."}]
    assert reviewed["review_status"] == "assistant_reviewed"
    assert reviewed["match_kind"] == "assistant_semantic_review"
    assert reviewed["assistant_review"]["reviewer"] == "codex-worker"
    assert reviewed["assistant_review"]["rationale"]


@pytest.mark.parametrize(
    "mutate, expected",
    [
        (lambda p: p["answers"].clear(), "missing answer"),
        (lambda p: p["answers"][0].update(answer=3, answer_letter="D"), "invalid answer"),
        (lambda p: p["answers"][0]["evidence"][0].update(quote="not verbatim"), "not verbatim"),
    ],
)
def test_rejects_incomplete_or_unverifiable_packets(tmp_path, mutate, expected) -> None:
    packet = _packet()
    mutate(packet)
    with pytest.raises(ValueError, match=expected):
        sut.apply_packets(_bank(), [packet], _stories(tmp_path))


def test_rejects_duplicate_decisions(tmp_path) -> None:
    packet = _packet()
    packet["answers"].append(dict(packet["answers"][0]))
    with pytest.raises(ValueError, match="duplicate answer"):
        sut.apply_packets(_bank(), [packet], _stories(tmp_path))


def test_runtime_schemas_accept_evidence_backed_assistant_review(tmp_path, monkeypatch) -> None:
    bank = _bank()
    bank["questions"][1].update(
        answer=1,
        answer_evidence=[{"node_id": "n2", "quote": "He entered the cave."}],
        review_status="assistant_reviewed",
    )
    bank_path = tmp_path / "bank.json"
    bank_path.write_text(json.dumps(bank), encoding="utf-8")
    story_dir = _stories(tmp_path)
    monkeypatch.setattr(validate_quiz_answers, "BANK_JSON", bank_path)
    monkeypatch.setattr(validate_quiz_answers, "STORY_DIR", story_dir)
    assert "assistant_reviewed" in lesson_schema.STATUSES
    assert validate_quiz_answers.validate_bank() == []


def test_lesson_reports_track_assistant_reviewed_cards() -> None:
    source = (Path(__file__).resolve().parents[1] / "tools" / "build_lesson_guide.py").read_text(encoding="utf-8")
    assert '"assistant_reviewed": sum(' in source
    assert '"verified": sum(' in source


def test_answer_key_report_exposes_letters_provenance_and_low_confidence() -> None:
    bank = _bank()
    bank["questions"][1].update(
        answer=1,
        review_status="assistant_reviewed",
        confidence=0.65,
        assistant_review={"rationale": "Episode scope is ambiguous."},
    )
    text = build_quiz_answer_key.render_markdown(bank)
    assert "| EP001 | A·机 | B·AI |" in text
    assert "EP001 Q2" in text
    assert "0.65" in text
    assert "不是官方 Answer Key" in text
