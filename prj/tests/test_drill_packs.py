# -*- coding: utf-8 -*-
from __future__ import annotations

import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
DRILL_DIR = ROOT / "content" / "dialogue_stories" / "drill"
COLLECTIONS_PATH = ROOT / "content" / "dialogue_stories" / "collections.json"
MAX_UNCOMPRESSED_BYTES = 200 * 1024  # 每个包 gzip 前 < 200KB
FORBIDDEN_KEYS = ("nodes", "script_gloss", "script_lexicon", "frames")


def _collections() -> list[dict]:
    return json.loads(COLLECTIONS_PATH.read_text(encoding="utf-8"))["collections"]


@pytest.fixture
def cols() -> list[dict]:
    return _collections()


def test_13_packs_exist(cols: list[dict]) -> None:
    missing = [c["id"] for c in cols if not (DRILL_DIR / f"{c['id']}.json").exists()]
    assert not missing, f"缺少 drill 包: {missing}"


def test_episode_count_per_pack(cols: list[dict]) -> None:
    for c in cols:
        pack = json.loads((DRILL_DIR / f"{c['id']}.json").read_text(encoding="utf-8"))
        expect = c["to"] - c["from"] + 1
        assert len(pack["episodes"]) == expect, (
            f"{c['id']}: 包内 {len(pack['episodes'])} 集, 应为 {expect}"
        )
        assert [e["episode"] for e in pack["episodes"]] == list(range(c["from"], c["to"] + 1))


def test_min_counts_per_episode(cols: list[dict]) -> None:
    for c in cols:
        pack = json.loads((DRILL_DIR / f"{c['id']}.json").read_text(encoding="utf-8"))
        for ep in pack["episodes"]:
            assert len(ep.get("official_quiz", [])) >= 1, f"{c['id']} ep{ep['episode']}: quiz < 1"
            assert len(ep.get("official_words", [])) >= 10, f"{c['id']} ep{ep['episode']}: words < 10"
            assert len(ep.get("puzzles", [])) >= 1, f"{c['id']} ep{ep['episode']}: puzzles < 1"


def test_pack_size_below_200k(cols: list[dict]) -> None:
    for c in cols:
        size = (DRILL_DIR / f"{c['id']}.json").stat().st_size
        assert size < MAX_UNCOMPRESSED_BYTES, (
            f"{c['id']}: 包 {size // 1024}KB 超过 200KB (应精简)"
        )


def test_no_heavy_keys(cols: list[dict]) -> None:
    for c in cols:
        pack = json.loads((DRILL_DIR / f"{c['id']}.json").read_text(encoding="utf-8"))
        for ep in pack["episodes"]:
            bad = [k for k in FORBIDDEN_KEYS if k in ep]
            assert not bad, f"{c['id']} ep{ep['episode']}: 含重字段 {bad}"


if __name__ == "__main__":
    cols = _collections()
    test_13_packs_exist(cols)
    test_episode_count_per_pack(cols)
    test_min_counts_per_episode(cols)
    test_pack_size_below_200k(cols)
    test_no_heavy_keys(cols)
    print(f"ok: {len(cols)} drill packs, all slim (<200KB), no heavy keys")
