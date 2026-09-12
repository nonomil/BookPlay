# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "content"
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from build_game_levels import (  # noqa: E402
    derive_npc_dialogue,
    first_sentence_choice,
    load_json,
    load_npc_dialogue,
    select_words,
)


def _fold(text: str) -> str:
    return " ".join(str(text or "").casefold().split())


def _nodes(ep: int) -> list[dict]:
    dialogue = load_json(CONTENT / "dialogue_stories" / f"ep{ep}.json") or {}
    return [n for n in dialogue.get("nodes") or [] if isinstance(n, dict)]


def test_preview_words_come_from_official_or_intensive_vocab() -> None:
    for ep in range(1, 8):
        dialogue = load_json(CONTENT / "dialogue_stories" / f"ep{ep}.json")
        assert isinstance(dialogue, dict), ep
        official = {str(w.get("term") or "").casefold() for w in dialogue.get("official_words") or []}
        intensive = load_json(CONTENT / "lesson_guides" / f"ep{ep:03d}" / "intensive-reader.json") or {}
        intensive_terms = {str(v.get("term") or "").casefold() for v in intensive.get("vocab") or []}
        words = select_words(dialogue, ep)
        assert len(words) >= 8, ep
        for word in words:
            key = word["term"].casefold()
            assert key in official or key in intensive_terms, f"ep{ep} extra term {word['term']}"


def test_intro_lines_match_subtitle_nodes() -> None:
    for ep in range(1, 8):
        level = load_json(CONTENT / "game" / "levels" / f"ep{ep}.json")
        nodes = {str(n.get("node_id")): n for n in _nodes(ep)}
        texts = {_fold(n.get("text_en")) for n in nodes.values()}
        intro = (level or {}).get("intro") or []
        assert intro, ep
        for line in intro:
            folded = _fold(line.get("textEn"))
            assert folded in texts, f"ep{ep} intro not in subtitles: {line.get('textEn')}"
            source = str(line.get("sourceNodeId") or "")
            if source:
                assert _fold(nodes[source].get("text_en")) == folded, ep


def test_npc_dialogue_cites_story_nodes_and_lesson_quiz() -> None:
    for ep in range(1, 8):
        dialogue = load_json(CONTENT / "dialogue_stories" / f"ep{ep}.json")
        level = load_json(CONTENT / "game" / "levels" / f"ep{ep}.json") or {}
        npc = level.get("npcDialogue") or load_npc_dialogue(ep) or derive_npc_dialogue(ep, dialogue, select_words(dialogue, ep))
        assert npc and npc.get("intro", {}).get("lines"), ep
        nodes = {str(n.get("node_id")): n for n in _nodes(ep)}
        for line in npc["intro"]["lines"]:
            source = str(line.get("sourceNodeId") or "")
            assert source in nodes, f"ep{ep} intro source {source}"
            assert _fold(line.get("textEn")) == _fold(nodes[source].get("text_en"))
        quiz = npc.get("quiz") or {}
        assert quiz.get("lines"), ep
        quiz_line = quiz["lines"][0]
        source = str(quiz_line.get("sourceNodeId") or "")
        assert source in nodes, f"ep{ep} quiz source {source}"
        card = first_sentence_choice(ep)
        if card:
            assert quiz.get("lessonCardId") == card.get("card_id"), ep
            assert quiz.get("options"), ep
            answers = [opt for opt in quiz["options"] if opt.get("correct")]
            assert len(answers) == 1, ep


def test_playable_levels_share_flow_schema_but_swap_skins() -> None:
    """流程字段同一套；Boss / 词 / 官方题按集变化；技能按 Boss id 复用。"""
    kits = load_json(CONTENT / "game" / "boss-kits.json") or {}
    kit_bosses = set((kits.get("bosses") or {}))
    required = {"cast", "previewWords", "waves", "boss", "npcDialogue", "background"}
    first_words: set[str] = set()
    boss_ids: set[str] = set()
    cards: set[str] = set()
    for ep in range(1, 55):
        level = load_json(CONTENT / "game" / "levels" / f"ep{ep}.json")
        assert isinstance(level, dict), ep
        assert required <= set(level), ep
        boss_id = str(((level.get("cast") or {}).get("boss") or {}).get("id") or "")
        assert boss_id, ep
        assert boss_id in kit_bosses, f"ep{ep} boss {boss_id} has no kit"
        words = level.get("previewWords") or []
        assert len(words) >= 8, ep
        first_words.add(str(words[0].get("term") or ""))
        boss_ids.add(boss_id)
        card = str((((level.get("npcDialogue") or {}).get("quiz") or {}).get("lessonCardId") or ""))
        assert card, ep
        cards.add(card)
        assert len((level.get("waves") or [])) == 2, ep
        assert len(((level.get("boss") or {}).get("hpWords") or [])) >= 4, ep
    assert len(cards) == 54
    assert len(boss_ids) >= 10
    assert len(first_words) >= 20


def test_playable_levels_reuse_official_quiz_on_every_episode() -> None:
    """1–54 共用同一套 NPC/擂台合同：官方题 options + lessonCardId，不按集手写。"""
    for ep in range(1, 55):
        level = load_json(CONTENT / "game" / "levels" / f"ep{ep}.json")
        assert isinstance(level, dict), ep
        quiz = (level.get("npcDialogue") or {}).get("quiz") or {}
        assert quiz.get("lines"), ep
        assert quiz.get("options"), f"ep{ep} missing official options"
        answers = [opt for opt in quiz["options"] if opt.get("correct")]
        assert len(answers) == 1, ep
        card = first_sentence_choice(ep)
        assert card, ep
        assert quiz.get("lessonCardId") == card.get("card_id"), ep
        assert (level.get("boss") or {}).get("hpWords"), ep


def test_derived_quiz_uses_official_sentence_choice_for_ep2() -> None:
    dialogue = load_json(CONTENT / "dialogue_stories" / "ep2.json")
    words = select_words(dialogue, 2)
    derived = derive_npc_dialogue(2, dialogue, words)
    card = first_sentence_choice(2)
    assert derived and card
    assert derived["quiz"]["lessonCardId"] == card["card_id"]
    assert derived["quiz"]["question"]["textEn"] == card["prompt"]["en"]


def test_bajie_display_name_is_zhu_bajie() -> None:
    """孩子看到的是猪八戒，不用原著刚出山时的猪刚鬣。"""
    kits = load_json(CONTENT / "game" / "boss-kits.json") or {}
    assert ((kits.get("bosses") or {}).get("bajie") or {}).get("nameZh") == "猪八戒"
    cast = load_json(CONTENT / "game" / "cast.json") or {}
    bosses = cast.get("bossByEp") or {}
    for ep in (23, 33):
        assert (bosses.get(str(ep)) or {}).get("nameZh") == "猪八戒", ep
        level = load_json(CONTENT / "game" / "levels" / f"ep{ep}.json") or {}
        assert ((level.get("cast") or {}).get("boss") or {}).get("nameZh") == "猪八戒", ep


def test_shawujing_display_name_is_sha_seng() -> None:
    """孩子看到的是沙僧，不用流沙河妖。"""
    kits = load_json(CONTENT / "game" / "boss-kits.json") or {}
    assert ((kits.get("bosses") or {}).get("shawujing") or {}).get("nameZh") == "沙僧"
    cast = load_json(CONTENT / "game" / "cast.json") or {}
    assert ((cast.get("bossByEp") or {}).get("26") or {}).get("nameZh") == "沙僧"
    assert ((cast.get("minorNames") or {}).get("shawujing") == "沙僧")
    for ep in (26, 54):
        level = load_json(CONTENT / "game" / "levels" / f"ep{ep}.json") or {}
        if ep == 26:
            assert ((level.get("cast") or {}).get("boss") or {}).get("nameZh") == "沙僧", ep
        spots = [
            spot for spot in ((level.get("map") or {}).get("npcSpots") or [])
            if spot.get("sprite") == "shawujing"
        ]
        assert spots, ep
        for spot in spots:
            assert spot.get("nameZh") == "沙僧", (ep, spot)
