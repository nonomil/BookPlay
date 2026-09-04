# -*- coding: utf-8 -*-
import json
from pathlib import Path

from prj.tools.repair_lesson_quality import repair_root
from prj.tools.validate_lesson_quality import audit_root


def test_lesson_quality_audit_reports_pollution_and_missing_puzzle(tmp_path: Path) -> None:
    guides = tmp_path / "lesson_guides" / "ep001"
    guides.mkdir(parents=True)
    (guides / "lesson.json").write_text(
        '{"episode":1,"status":"draft","cards":[{"card_id":"w1","type":"word_review","prompt":{"en":"cheer","zh":"欢乐 召集天兵天将下界去花果山。"},"payload":{"term":"cheer","def":"欢乐 召集天兵天将下界去花果山。"}}]}',
        encoding="utf-8",
    )
    result = audit_root(tmp_path)
    assert result["totals"]["lessons"] == 1
    assert result["totals"]["draft"] == 1
    assert result["issue_counts"]["dialogue_pollution"] == 1
    assert result["issue_counts"]["no_usable_puzzle"] == 1


def test_lesson_quality_audit_accepts_short_word_and_usable_puzzle(tmp_path: Path) -> None:
    guides = tmp_path / "lesson_guides" / "ep001"
    stories = tmp_path / "dialogue_stories"
    guides.mkdir(parents=True)
    stories.mkdir(parents=True)
    (guides / "lesson.json").write_text(
        '{"episode":1,"cards":[{"card_id":"w1","type":"word_review","prompt":{"en":"climb","zh":"爬"},"payload":{"term":"climb","gloss":"爬","def":"爬"}}]}',
        encoding="utf-8",
    )
    (stories / "ep1.json").write_text('{"puzzles":[{"sentence":"The monkey climbs.","words":["climbs.","monkey","The"],"text_zh":"猴子在爬。"}]}', encoding="utf-8")
    result = audit_root(tmp_path)
    assert result["issue_counts"] == {}
    assert result["totals"]["usable_puzzles"] == 1


def test_lesson_quality_repair_prefers_local_gloss_and_canonical_override(tmp_path: Path) -> None:
    guides = tmp_path / "lesson_guides" / "ep001"
    stories = tmp_path / "dialogue_stories"
    guides.mkdir(parents=True)
    stories.mkdir(parents=True)
    lesson = {
        "episode": 1,
        "cards": [
            {
                "card_id": "w-local",
                "type": "word_review",
                "prompt": {"en": "rare", "zh": "旧对白 召集天兵天将下界去花果山。"},
                "payload": {"term": "rare", "gloss": "本卡释义", "def": "旧对白 召集天兵天将下界去花果山。"},
            },
            {
                "card_id": "w-in",
                "type": "word_review",
                "prompt": {"en": "in", "zh": "成堆地"},
                "payload": {"term": "in", "def": "prep.在......里 召集天兵天将下界去花果山。"},
            },
        ],
    }
    (guides / "lesson.json").write_text(json.dumps(lesson, ensure_ascii=False), encoding="utf-8")
    (stories / "ep1.json").write_text(
        '{"script_gloss":{"rare":"本集释义","in":"成堆地"},"puzzles":[{"sentence":"A rare word.","text_zh":"稀有的词"}]}',
        encoding="utf-8",
    )

    report = repair_root(tmp_path, write=True)
    assert report["change_count"] == 2
    repaired = json.loads((guides / "lesson.json").read_text(encoding="utf-8"))
    cards = {card["card_id"]: card for card in repaired["cards"]}
    assert cards["w-local"]["payload"]["gloss"] == "本卡释义"
    assert cards["w-in"]["payload"]["gloss"] == "在里面；进入"
    assert audit_root(tmp_path)["issue_counts"] == {}
