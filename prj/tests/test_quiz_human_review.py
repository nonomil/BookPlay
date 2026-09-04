# -*- coding: utf-8 -*-
from __future__ import annotations

import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
TOOL = ROOT / "prj" / "tools" / "build_quiz_human_review.py"


def _load():
    spec = importlib.util.spec_from_file_location("build_quiz_human_review", TOOL)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_quote_candidates_are_locators_not_answer_guesses() -> None:
    tool = _load()
    nodes = [
        {"node_id": "n1", "text_en": "Monkey came out of a rock."},
        {"node_id": "n2", "text_en": "A river flowed down the mountain."},
    ]
    quotes = tool._quote_candidates("What did Monkey come out of?", "a rock", nodes)
    assert quotes[0]["node_id"] == "n1"
    assert "answer" not in quotes[0]


def test_completed_review_has_no_pending_rows_and_353_evidence_backed_answers() -> None:
    tool = _load()
    bank, rows = tool.build_rows()
    reviewed = [q for q in bank["questions"] if q["review_status"] == "assistant_reviewed"]
    assert rows == []
    assert len(reviewed) == 353
    assert all(q["answer"] in (0, 1, 2) for q in reviewed)
    assert all(q["answer_evidence"] for q in reviewed)
    markdown = tool.render_markdown(bank, rows)
    assert "待审核：0 道" in markdown
    assert "不能按候选分数自动判答案" in markdown
