# -*- coding: utf-8 -*-
"""TDD 合同：每辑巩固的知识回顾与错题回顾是可用但非门禁标签。"""
from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
ENGINE = ROOT / "prj" / "engine"
HTML = (ENGINE / "drill.html").read_text(encoding="utf-8")
JS = (ENGINE / "drill.js").read_text(encoding="utf-8")
CSS = (ENGINE / "drill.css").read_text(encoding="utf-8")
MAP_JS = (ENGINE / "map.js").read_text(encoding="utf-8")


def _function_body(name: str) -> str:
    match = re.search(r"function\s+" + re.escape(name) + r"\([^)]*\)\s*\{", JS)
    assert match, f"缺少 function {name}"
    start = match.end()
    depth = 1
    cursor = start
    while cursor < len(JS) and depth:
        if JS[cursor] == "{":
            depth += 1
        elif JS[cursor] == "}":
            depth -= 1
        cursor += 1
    return JS[start:cursor]


def test_html_has_two_non_gating_review_tabs_and_panels() -> None:
    assert 'data-tab="review"' in HTML
    assert 'data-tab="wrong"' in HTML
    assert 'id="d-review"' in HTML
    assert 'id="d-wrong"' in HTML
    assert "知识回顾" in HTML
    assert "错题回顾" in HTML


def test_knowledge_review_uses_eight_cards_and_four_second_continue_gate() -> None:
    assert re.search(r"REVIEW_PAGE_SIZE\s*=\s*8", JS)
    assert re.search(r"REVIEW_COUNTDOWN\s*=\s*4", JS)
    body = _function_body("renderReview")
    assert "review-card" in body
    assert "review-continue" in body
    assert "playText" in body, "知识回顾卡中的英文词应可点击发音"
    assert ".wrong" in _function_body("buildReviewWords"), "错词必须优先进入知识回顾"


def test_wrong_review_reads_wrong_count_and_clears_only_after_correct_answer() -> None:
    build = _function_body("buildWrongQs")
    answer = _function_body("wrongAnswer")
    clear = _function_body("clearWrong")
    assert ".wrong" in build and "> 0" in build
    assert "clearWrong" in answer
    assert "if (ok)" in answer
    assert re.search(r"\.wrong\s*=\s*0", clear)
    assert "还没有错题" in JS


def test_review_tabs_do_not_change_the_three_part_pass_gate() -> None:
    body = _function_body("finishCheck")
    assert "wPass && pPass && qPass" in body
    assert "reviewPass" not in body
    assert "wrongPass" not in body
    assert "d-review" not in body
    assert "d-wrong" not in body


def test_review_panels_are_integrated_with_tab_switching_and_responsive_css() -> None:
    show_tab = _function_body("showTab")
    render_current = _function_body("renderCurrent")
    assert '"review"' in show_tab and '"wrong"' in show_tab
    assert "renderReview" in render_current and "renderWrong" in render_current
    assert ".review-grid" in CSS
    assert ".wrong-empty" in CSS
    assert ":focus-visible" in CSS


def test_drill_assets_are_cache_busted_and_map_lock_copy_is_current() -> None:
    assert re.search(r'drill\.css\?v=\d+', HTML)
    assert re.search(r'drill\.js\?v=\d+', HTML)
    assert "巩固单元下个版本开放" not in MAP_JS
    assert "先学完本辑所有集" in MAP_JS

