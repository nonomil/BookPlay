# -*- coding: utf-8 -*-
"""巩固单元音频覆盖合同：drill 包内全部测验/句型文本必须在静态索引中有 clip。"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "prj" / "tools"))
from pack_datapack import _build_stage_pack  # noqa: E402
from paths import CONTENT  # noqa: E402
DRILL_DIR = ROOT / "content" / "dialogue_stories" / "drill"
AUDIO = ROOT / "content" / "assets" / "adv_audio"


def _norm(value: str) -> str:
    return " ".join(str(value or "").split()).strip()


def _load(name: str) -> dict:
    path = AUDIO / name
    if not path.exists():
        pytest.skip(f"missing {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def _file_ok(rel: str) -> bool:
    if not rel:
        return False
    path = ROOT / "content" / rel.replace("\\", "/")
    return path.is_file() and path.stat().st_size > 1000


def _has_clip(text: str, *indexes: dict) -> bool:
    key = _norm(text)
    if not key:
        return True
    lower = key.lower()
    for idx in indexes:
        if key in idx and _file_ok(idx[key]):
            return True
        for candidate, rel in idx.items():
            if _norm(candidate).lower() == lower and _file_ok(rel):
                return True
    return False


def _collect_drill_texts() -> tuple[set[str], set[str]]:
    en: set[str] = set()
    zh: set[str] = set()
    for pack in sorted(DRILL_DIR.glob("c*.json")):
        data = json.loads(pack.read_text(encoding="utf-8"))
        for ep in data.get("episodes", []):
            for q in ep.get("official_quiz", []):
                qtext = _norm(q.get("q", ""))
                if qtext and re.search(r"[A-Za-z]", qtext):
                    en.add(qtext)
                qzh = _norm(q.get("q_zh", ""))
                if qzh:
                    zh.add(qzh)
                for choice in q.get("choices") or []:
                    t = _norm(choice)
                    if t and re.search(r"[A-Za-z]", t):
                        en.add(t)
                for choice in q.get("choices_zh") or []:
                    t = _norm(choice)
                    if t:
                        zh.add(t)
            for puzzle in ep.get("puzzles", []):
                t = _norm(puzzle.get("sentence", ""))
                if t and re.search(r"[A-Za-z]", t):
                    en.add(t)
    return en, zh


@pytest.fixture(scope="module")
def indexes() -> tuple[dict, dict, dict, dict, dict]:
    quiz_en = _load("quiz_en_index.json")
    quiz_zh = _load("quiz_zh_index.json")
    sent_en = _load("sent_en_index.json")
    sent_zh = _load("sent_zh_index.json")
    en_words = _load("en_index.json")
    return quiz_en, quiz_zh, sent_en, sent_zh, en_words


def test_all_drill_quiz_and_puzzle_english_have_static_clips(indexes: tuple[dict, ...]) -> None:
    quiz_en, _, sent_en, _, en_words = indexes
    en_texts, _ = _collect_drill_texts()
    missing = sorted(
        t for t in en_texts
        if not _has_clip(t, quiz_en, sent_en, en_words)
    )
    assert not missing, f"缺少英文静态音频 {len(missing)} 条，示例: {missing[:10]}"


def test_all_drill_quiz_chinese_have_static_clips(indexes: tuple[dict, ...]) -> None:
    _, quiz_zh, _, sent_zh, _ = indexes
    _, zh_texts = _collect_drill_texts()
    missing = sorted(
        t for t in zh_texts
        if not _has_clip(t, quiz_zh, sent_zh)
    )
    assert not missing, f"缺少中文静态音频 {len(missing)} 条，示例: {missing[:10]}"


FORMER_MISSING_C01_C02 = (
    "They can turn themselves into other animals.",
    "Something terrible has happened!",
    "What have you been doing?",
    "You attacked his subjects.",
    "And so will all of my subjects!",
    "Um, I don't think so.",
    "There were five enormous pillars.",
    "I can do anything I want!",
)


def _clip_rel(text: str, *indexes: dict) -> str:
    key = _norm(text)
    lower = key.lower()
    for idx in indexes:
        if key in idx:
            return str(idx[key]).replace("\\", "/")
        for candidate, rel in idx.items():
            if _norm(candidate).lower() == lower:
                return str(rel).replace("\\", "/")
    return ""


def test_c01_c02_stage_pack_includes_former_silent_sentences(indexes: tuple[dict, ...]) -> None:
    quiz_en, _, sent_en, _, en_words = indexes
    files, ids, episodes, _published, warnings = _build_stage_pack(
        CONTENT, collections="c01,c02", published="none"
    )
    assert ids == ("c01", "c02")
    assert episodes == list(range(1, 14))
    missing = []
    for text in FORMER_MISSING_C01_C02:
        rel = _clip_rel(text, quiz_en, sent_en, en_words)
        if not rel or rel not in files:
            missing.append((text, rel))
    assert not missing, f"阶段包未收录原静默句: {missing}"
    assert "assets/adv_audio/quiz_en_index.json" in files
    assert "assets/adv_audio/quiz_zh_index.json" in files
    assert not [w for w in warnings if "索引引用缺失" in w]
