# -*- coding: utf-8 -*-
"""TDD 合同：每集播放后的知识巩固页与分级难度设置。"""
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
ENGINE = ROOT / "prj" / "engine"
CORE = ENGINE / "lesson-core.js"
LESSON_HTML = ENGINE / "lesson.html"
LESSON_JS = ENGINE / "lesson.js"
LESSON_CSS = ENGINE / "lesson.css"
WALA_HTML = ENGINE / "wala.html"
WALA_JS = ENGINE / "wala.js"
PACKER = ROOT / "prj" / "tools" / "pack_datapack.py"


def _read(path: Path) -> str:
    assert path.exists(), f"缺少运行时文件：{path.relative_to(ROOT)}"
    return path.read_text(encoding="utf-8")


def _node(expression: str, payload: dict | list | None = None):
    assert CORE.exists(), "缺少 prj/engine/lesson-core.js"
    script = (
        "const core=require(process.argv[1]);"
        "const input=JSON.parse(require('fs').readFileSync(0,'utf8')||'null');"
        f"const result=({expression});"
        "process.stdout.write(JSON.stringify(result));"
    )
    proc = subprocess.run(
        ["node", "-e", script, str(CORE)],
        input=json.dumps(payload, ensure_ascii=False),
        text=True,
        encoding="utf-8",
        capture_output=True,
        check=False,
    )
    assert proc.returncode == 0, proc.stderr
    return json.loads(proc.stdout)


def _card(
    card_id: str,
    card_type: str = "sentence_choice",
    *,
    grade_bands: list[str] | None = None,
    difficulty: int = 1,
    review_status: str = "machine_verified",
    stage: str = "episode_complete",
    order: int = 1,
) -> dict:
    payload = {
        "choices": [
            {"id": "a", "en": "a rock", "zh": "一块石头"},
            {"id": "b", "en": "a tree", "zh": "一棵树"},
        ],
        "answer": "a",
    }
    prompt = {"en": "What did Monkey come out of?", "zh": "猴子从哪里出来？"}
    if card_type == "word_review":
        term = card_id.replace("word-", "")
        payload = {"term": term, "ipa": "test", "def": f"{term} 的中文释义", "pos": "n."}
        prompt = {"en": term, "zh": f"{term} 的中文释义"}
    return {
        "card_id": card_id,
        "type": card_type,
        "stage": stage,
        "order": order,
        "difficulty": difficulty,
        "grade_bands": grade_bands or ["g1_2", "g3_4", "g5_6"],
        "prompt": prompt,
        "payload": payload,
        "review_status": review_status,
    }


def test_lesson_runtime_files_exist() -> None:
    for path in (LESSON_HTML, LESSON_JS, LESSON_CSS, CORE):
        assert path.exists(), f"缺少 {path.relative_to(ROOT)}"


def test_default_settings_and_three_by_three_quota_matrix() -> None:
    result = _node(
        "({defaults:core.DEFAULT_SETTINGS, key:core.SETTINGS_KEY, matrix:core.QUESTION_QUOTAS})"
    )
    assert result["defaults"] == {"gradeBand": "g3_4", "intensity": "standard"}
    assert result["key"] == "bookplay_lesson_settings_v1"
    assert result["matrix"] == {
        "g1_2": {"light": 3, "standard": 4, "challenge": 5},
        "g3_4": {"light": 5, "standard": 7, "challenge": 9},
        "g5_6": {"light": 7, "standard": 10, "challenge": 14},
    }


def test_normalize_settings_rejects_unknown_values() -> None:
    result = _node("core.normalizeSettings(input)", {"gradeBand": "college", "intensity": "huge"})
    assert result == {"gradeBand": "g3_4", "intensity": "standard"}


def test_selector_excludes_needs_review_wrong_stage_grade_and_difficulty() -> None:
    cards = [
        _card("good", grade_bands=["g1_2"], difficulty=2),
        _card("needs-review", grade_bands=["g1_2"], review_status="needs_review"),
        _card("wrong-stage", grade_bands=["g1_2"], stage="during_episode"),
        _card("wrong-grade", grade_bands=["g5_6"]),
        _card("too-hard", grade_bands=["g1_2"], difficulty=3),
        _card("missing-answer", grade_bands=["g1_2"]),
        _card("word-rock", "word_review", grade_bands=["g1_2"]),
    ]
    cards[5]["payload"].pop("answer")
    result = _node(
        "core.selectCards(input.cards,input.settings,1).map(c=>c.card_id)",
        {"cards": cards, "settings": {"gradeBand": "g1_2", "intensity": "challenge"}},
    )
    assert "good" in result
    assert "word-rock" in result
    assert not ({"needs-review", "wrong-stage", "wrong-grade", "too-hard", "missing-answer"} & set(result))


def test_selector_is_stable_and_respects_quota() -> None:
    cards = [
        _card(f"sentence-{i}", order=20 - i) for i in range(8)
    ] + [
        _card(f"word-word{i}", "word_review", order=100 + i) for i in range(12)
    ]
    payload = {"cards": cards, "settings": {"gradeBand": "g3_4", "intensity": "standard"}}
    first = _node("core.selectCards(input.cards,input.settings,17).map(c=>c.card_id)", payload)
    second = _node("core.selectCards(input.cards,input.settings,17).map(c=>c.card_id)", payload)
    assert first == second
    assert len(first) == 7
    assert any(item.startswith("sentence-") for item in first)
    assert any(item.startswith("word-") for item in first)


def test_word_review_becomes_bilingual_choice_with_pronunciation_fields() -> None:
    words = [
        _card("word-monkey", "word_review"),
        _card("word-rock", "word_review"),
        _card("word-mountain", "word_review"),
        _card("word-river", "word_review"),
    ]
    result = _node("core.buildWordQuestion(input[0],input,1)", words)
    assert result["type"] == "word_choice"
    assert result["answer"] == "monkey"
    assert result["promptZh"] == "monkey 的中文释义"
    assert result["term"] == "monkey"
    assert result["ipa"] == "test"
    assert len(result["choices"]) >= 3
    assert all({"en", "zh"} <= set(choice) for choice in result["choices"])


def test_word_choices_support_both_directions_without_losing_speech_text() -> None:
    words = [
        _card("word-monkey", "word_review"),
        _card("word-rock", "word_review"),
        _card("word-mountain", "word_review"),
        _card("word-river", "word_review"),
    ]
    en_to_zh = _node("core.buildWordQuestion(input[0],input,1,'en_to_zh')", words)
    assert en_to_zh["type"] == "word_choice"
    assert en_to_zh["direction"] == "en_to_zh"
    assert en_to_zh["target"] == {"en": "monkey", "zh": "monkey 的中文释义"}
    assert en_to_zh["answer"] == "monkey 的中文释义"
    assert en_to_zh["promptEn"] == "Which Chinese meaning matches this word?"
    assert en_to_zh["speech"] == {"en": "monkey", "zh": "monkey 的中文释义"}

    zh_to_en = _node("core.buildWordQuestion(input[0],input,1,'zh_to_en')", words)
    assert zh_to_en["direction"] == "zh_to_en"
    assert zh_to_en["answer"] == "monkey"
    assert zh_to_en["promptEn"] == "Which English word matches this meaning?"
    assert zh_to_en["speech"]["en"] == "monkey"


def test_sentence_order_model_contains_stable_tokens_and_edge_tts_text() -> None:
    payload = {
        "sentence": "The monkey jumped.",
        "words": ["jumped.", "The", "monkey"],
        "text_zh": "猴子跳了起来。",
    }
    result = _node("core.buildSentenceOrderQuestion(input,1)", payload)
    assert result["type"] == "sentence_order"
    assert result["words"] == ["jumped.", "The", "monkey"]
    assert result["answer"] == ["The", "monkey", "jumped."]
    assert result["speech"]["en"] == "The monkey jumped."
    assert result["speech"]["zh"] == "猴子跳了起来。"
    clue = _node("core.getSentenceOrderClue(input)", result)
    assert clue == {"text": "猴子跳了起来。", "lang": "zh-CN", "source": "translation"}


def test_sentence_order_page_renders_a_real_clue_and_english_fallback() -> None:
    js = _read(LESSON_JS)
    css = _read(LESSON_CSS)
    assert "sentence-order-clue" in js
    assert "getSentenceOrderClue" in js
    assert "sentence-order-clue" in css
    # A puzzle without a Chinese translation must still expose its English
    # sentence as a visible clue instead of showing only the generic action.
    fallback = _node(
        "core.getSentenceOrderClue(core.buildSentenceOrderQuestion(input,1))",
        {"sentence": "The monkey jumped.", "words": ["jumped.", "The", "monkey"]},
    )
    assert fallback == {"text": "The monkey jumped.", "lang": "en", "source": "sentence"}


def test_sentence_fill_model_blanks_a_word_and_provides_bilingual_choices() -> None:
    payload = {
        "example": "The monkey jumped.",
        "term": "jumped",
        "zh": "跳跃",
    }
    pool = [
        {"term": "jumped", "zh": "跳跃"},
        {"term": "walked", "zh": "走路"},
        {"term": "slept", "zh": "睡觉"},
    ]
    result = _node("core.buildSentenceFillQuestion(input.payload,input.pool,1)", {"payload": payload, "pool": pool})
    assert result["type"] == "sentence_fill"
    assert result["sentenceWithBlank"] == "The monkey _____."
    assert result["answer"] == "jumped"
    assert len(result["choices"]) >= 3
    assert all({"en", "zh"} <= set(choice) for choice in result["choices"])
    assert result["speech"]["en"] == "The monkey jumped."


def test_word_review_model_is_a_clickable_bilingual_recall_card() -> None:
    card = _card("word-monkey", "word_review")
    result = _node("core.buildWordReviewQuestion(input,1)", card)
    assert result["type"] == "word_review"
    assert result["term"] == "monkey"
    assert result["definition"] == "monkey 的中文释义"
    assert result["speech"] == {"en": "monkey", "zh": "monkey 的中文释义"}


def test_next_route_never_generates_episode_109() -> None:
    assert _node("core.getNextHref(1)") == "wala.html?ep=2"
    assert _node("core.getNextHref(107)") == "wala.html?ep=108"
    assert _node("core.getNextHref(108)") == "map.html"
    assert "ep=109" not in _read(CORE)


def test_lesson_page_loads_episode_data_and_has_accessible_states() -> None:
    html = _read(LESSON_HTML)
    js = _read(LESSON_JS)
    css = _read(LESSON_CSS)
    assert "lesson-core.js" in html and "lesson.js" in html and "lesson.css" in html
    assert "lesson_guides" in js and "lesson.json" in js
    assert "bookplay_lesson_progress_v1" in js
    assert "speechSynthesis" in js
    assert "暂无可评分题" in js
    assert 'aria-live="polite"' in html
    assert ":focus-visible" in css
    assert "prefers-reduced-motion" in css
    assert re.search(r"@media\s*\([^)]*max-width\s*:\s*480px", css)
    assert "overflow-x" in css


def test_lesson_page_defaults_to_english_with_edge_tts_and_toggleable_chinese() -> None:
    html = _read(LESSON_HTML)
    js = _read(LESSON_JS)
    css = _read(LESSON_CSS)
    # The lesson surface should make English the learning path and keep Chinese
    # as an explicit, non-destructive hint below each matching English line.
    assert 'id="lesson-hint"' in html
    assert 'aria-expanded="false"' in html
    assert "lesson-zh" in js and "showChinese" in js
    assert "choice-zh lesson-zh" in js
    assert "question-en" in js and "question-zh lesson-zh" in js
    # Every question and option must use the local Edge-TTS endpoint first.
    assert 'EDGE_TTS_ENDPOINT = "/api/tts"' in js and "?voice=" in js
    assert "en-US-JennyNeural" in js
    assert "zh-CN-XiaoxiaoNeural" in js
    assert 'id="lesson-title-speak"' in html
    assert 'id="lesson-intro-speak"' in html
    assert "lesson-speak-question" in js
    assert "lesson-speak-choice" in js
    # The hint and audio controls need a visible focus treatment and a real
    # hidden utility class (the old page relied on an undefined class).
    assert ".hidden" in css
    assert ":focus-visible" in css


def test_lesson_session_gates_quiz_and_distinguishes_pass_from_practice() -> None:
    js = _read(LESSON_JS)
    assert "bookplay_lesson_session_v2" in js
    assert "renderStudyGate" in js
    assert "isStudyComplete" in js
    assert "evaluateLessonResult" in js
    assert "done: Boolean(passed" in js
    assert "再测一次" in js
    assert "renderEpisodeReward(passed)" in js


def test_lesson_page_exposes_all_requested_learning_modes_and_story_source() -> None:
    html = _read(LESSON_HTML)
    js = _read(LESSON_JS)
    css = _read(LESSON_CSS)
    assert "dialogue_stories" in js
    for marker in ("word_en_to_zh", "word_zh_to_en", "sentence_order", "sentence_fill", "word_review"):
        assert marker in js or marker in _read(CORE)
    assert "lesson-speak-review" in js
    assert "sentence-order" in css and "sentence-fill" in css
    assert "word-review" in css
    words_html = _read(ENGINE / "lesson-words.html")
    assert "lesson-story" in words_html
    assert "lesson-word-review" in words_html


def test_lesson_page_uses_doudou_teacher_not_story_narrator() -> None:
    html = _read(LESSON_HTML)
    assert 'data-character-id="doudou-teacher"' in html
    assert "../assets/cast/doudou-teacher/idle.png" in html
    assert "../assets/cast/narrator/" not in html
    assert 'rel="icon" href="../assets/ui/doudou-loong-icon.png"' in html


def test_lesson_teacher_switches_to_talk_for_feedback_then_returns_idle() -> None:
    html = _read(LESSON_HTML)
    js = _read(LESSON_JS)
    assert 'id="lesson-teacher"' in html
    assert 'idle: "../assets/cast/doudou-teacher/idle.png"' in js
    assert 'talk: "../assets/cast/doudou-teacher/talk.png"' in js
    assert re.search(r"function setTeacherState\(state\)", js)
    answer = re.search(r"function answerQuestion\([^)]*\)\s*\{([\s\S]*?)\n\}", js)
    render = re.search(r"function renderQuestion\(\)\s*\{([\s\S]*?)\n\}", js)
    finish = re.search(r"function finishLesson\([^)]*\)\s*\{([\s\S]*?)\n\}", js)
    assert answer and 'setTeacherState("talk")' in answer.group(1)
    assert render and 'setTeacherState("idle")' in render.group(1)
    assert finish and 'setTeacherState("idle")' in finish.group(1)


def test_wala_keeps_learning_volume_and_adds_independent_lesson_settings() -> None:
    html = _read(WALA_HTML)
    js = _read(WALA_JS)
    assert "学习量" in html
    assert "年级段" in html and "巩固强度" in html
    for control in (
        "w-grade-g1-2", "w-grade-g3-4", "w-grade-g5-6",
        "w-intensity-light", "w-intensity-standard", "w-intensity-challenge",
    ):
        assert f'id="{control}"' in html
        assert control in js
    assert "bookplay_learn_level" in js
    assert "bookplay_lesson_settings_v1" in js


def test_wala_episode_completion_routes_to_current_episode_lesson() -> None:
    js = _read(WALA_JS)
    finish = re.search(r"function finishEpisode\(\)\s*\{([\s\S]*?)\n\}", js)
    show_end = re.search(r"function showEnd\(\)\s*\{([\s\S]*?)\n\}", js)
    assert finish and "saveProgress(false)" in finish.group(1)
    assert show_end and "saveProgress(false)" in show_end.group(1)
    assert "lesson-words.html?ep=${ep}" in js
    assert "进入知识巩固" in js


def test_datapack_includes_lesson_guides_without_building_an_archive() -> None:
    source = _read(PACKER)
    assert re.search(r"INCLUDE_DIRS\s*=\s*\([\s\S]*?[\"']lesson_guides[\"']", source)
