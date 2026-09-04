# -*- coding: utf-8 -*-
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "content"
MANIFEST_PATH = CONTENT / "assets" / "map_audio" / "index.json"
COLLECTIONS_PATH = CONTENT / "dialogue_stories" / "collections.json"
CATALOG_PATH = CONTENT / "storybooks" / "catalog.json"


def test_map_audio_manifest_uses_edge_neural_voices() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    assert manifest["voices"]["zh"] == "zh-CN-XiaoxiaoNeural"
    assert manifest["voices"]["en"] == "en-US-JennyNeural"


def test_every_collection_and_episode_has_nonempty_audio() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    collections = json.loads(COLLECTIONS_PATH.read_text(encoding="utf-8"))["collections"]
    episodes = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))["episodes"]

    assert set(manifest["collections"]) == {c["id"] for c in collections}
    assert set(manifest["episodes"]) == {str(ep["episode"]) for ep in episodes}

    entries = [*manifest["collections"].values(), *manifest["episodes"].values()]
    assert all(set(entry) == {"zh", "en"} for entry in entries), "每个标题都必须有中英双语音频"
    for entry in entries:
        for rel in entry.values():
            audio = CONTENT / rel
            assert audio.exists(), f"缺少地图朗读音频: {rel}"
            assert audio.stat().st_size > 1000, f"地图朗读音频为空: {rel}"
