# -*- coding: utf-8 -*-
"""知识巩固题干/选项必须能通过 quiz/sent 索引找到已生成的 Edge-TTS 片段。"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
AUDIO = ROOT / "content" / "assets" / "adv_audio"
LESSON = ROOT / "content" / "lesson_guides" / "ep001" / "lesson.json"


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
    path = ROOT / "content" / str(rel).replace("\\", "/")
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


def _quiz_texts(lesson: dict) -> tuple[list[str], list[str]]:
    en: list[str] = []
    zh: list[str] = []
    for card in lesson.get("cards") or []:
        if card.get("type") != "sentence_choice":
            continue
        prompt = card.get("prompt") or {}
        payload = card.get("payload") or {}
        if prompt.get("en"):
            en.append(_norm(prompt["en"]))
        if prompt.get("zh"):
            zh.append(_norm(prompt["zh"]))
        for choice in payload.get("choices") or []:
            if not isinstance(choice, dict):
                continue
            if choice.get("en"):
                en.append(_norm(choice["en"]))
            if choice.get("zh"):
                zh.append(_norm(choice["zh"]))
    return en, zh


def test_ep001_official_quiz_prompts_and_choices_have_edge_tts_clips() -> None:
    lesson = json.loads(LESSON.read_text(encoding="utf-8"))
    quiz_en, quiz_zh = _load("quiz_en_index.json"), _load("quiz_zh_index.json")
    sent_en, sent_zh = _load("sent_en_index.json"), _load("sent_zh_index.json")
    en_texts, zh_texts = _quiz_texts(lesson)
    assert en_texts, "ep001 应有英文题干/选项"
    missing_en = sorted({t for t in en_texts if not _has_clip(t, quiz_en, sent_en)})
    missing_zh = sorted({t for t in zh_texts if not _has_clip(t, quiz_zh, sent_zh)})
    assert not missing_en, f"缺少英文巩固音频 {len(missing_en)} 条: {missing_en[:12]}"
    assert not missing_zh, f"缺少中文巩固音频 {len(missing_zh)} 条: {missing_zh[:12]}"
