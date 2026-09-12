# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from build_game_audio import build_entries, inventory_episode, validate_index  # noqa: E402


def _fixture(root: Path) -> None:
    (root / "game" / "levels").mkdir(parents=True)
    (root / "assets" / "adv_audio" / "ep1").mkdir(parents=True)
    (root / "assets" / "adv_audio" / "sent_en").mkdir(parents=True)
    level = {
        "ep": 1,
        "intro": [{"textEn": "Story.", "textZh": "故事"}],
        "previewWords": [{"term": "monkey", "zh": "猴子"}],
        "npcDialogue": {"intro": {"lines": [{"id": "i1", "sourceNodeId": "n001", "textEn": "Hello.", "textZh": "你好。", "audioRef": "sent_en:Hello."}]}},
    }
    (root / "game" / "levels" / "ep1.json").write_text(json.dumps(level), encoding="utf-8")
    (root / "assets" / "adv_audio" / "ep1" / "index.json").write_text(json.dumps({"monkey": "assets/adv_audio/ep1/monkey.mp3"}), encoding="utf-8")
    (root / "assets" / "adv_audio" / "en_index.json").write_text("{}", encoding="utf-8")
    (root / "assets" / "adv_audio" / "zh_index.json").write_text(json.dumps({"猴子": "assets/adv_audio/zh/monkey.mp3"}), encoding="utf-8")
    (root / "assets" / "adv_audio" / "sent_en_index.json").write_text(json.dumps({"Hello.": "assets/adv_audio/sent_en/hello.mp3", "Story.": "assets/adv_audio/sent_en/story.mp3"}), encoding="utf-8")
    (root / "assets" / "adv_audio" / "sent_zh_index.json").write_text("{}", encoding="utf-8")
    (root / "assets" / "adv_audio" / "ep1" / "monkey.mp3").write_bytes(b"mp3")
    (root / "assets" / "adv_audio" / "sent_en" / "hello.mp3").write_bytes(b"mp3")
    (root / "assets" / "adv_audio" / "sent_en" / "story.mp3").write_bytes(b"mp3")
    (root / "assets" / "adv_audio" / "zh").mkdir(parents=True)
    (root / "assets" / "adv_audio" / "zh" / "monkey.mp3").write_bytes(b"mp3")


def test_build_entries_is_deterministic_and_keeps_source_node(tmp_path: Path) -> None:
    _fixture(tmp_path)
    first = build_entries(1, root=tmp_path)
    second = build_entries(1, root=tmp_path)
    assert first == second
    assert first["entries"]["word:monkey:en"]["src"].endswith("monkey.mp3")
    assert first["entries"]["word:猴子:zh"]["src"].endswith("monkey.mp3")
    assert first["entries"]["dialogue:i1:en"]["sourceNodeId"] == "n001"
    assert first["entries"]["dialogue:ep1-story-intro-1:en"]["src"].endswith("story.mp3")


def test_inventory_marks_missing_clip_for_review(tmp_path: Path) -> None:
    _fixture(tmp_path)
    (tmp_path / "assets" / "adv_audio" / "ep1" / "monkey.mp3").unlink()
    rows = inventory_episode(1, root=tmp_path)["items"]
    assert next(row for row in rows if row["id"] == "word:monkey:en")["status"] == "synthesis-needed"


def test_playable_episodes_publish_audio_indexes() -> None:
    """1–54 都有可解析且引用存在的 game/audio 索引。"""
    content = Path(__file__).resolve().parents[2] / "content"
    missing = []
    for ep in range(1, 55):
        errors = validate_index(ep, root=content)
        if errors:
            missing.append(errors[0])
    assert missing == []


def test_validate_index_reports_missing_published_reference(tmp_path: Path) -> None:
    _fixture(tmp_path)
    out = tmp_path / "game" / "audio"
    out.mkdir(parents=True)
    (out / "ep1.json").write_text(json.dumps({"version": 1, "episode": 1, "entries": {"bad": {"src": "assets/nope.mp3"}}}), encoding="utf-8")
    errors = validate_index(1, root=tmp_path)
    assert errors and "缺失" in errors[0]
