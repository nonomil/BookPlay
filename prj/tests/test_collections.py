# -*- coding: utf-8 -*-
from __future__ import annotations

import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
COLLECTIONS_PATH = ROOT / "content" / "dialogue_stories" / "collections.json"
EP_DIR = ROOT / "content" / "dialogue_stories"


def _load_collections() -> list[dict]:
    data = json.loads(COLLECTIONS_PATH.read_text(encoding="utf-8"))
    return list(data["collections"])


@pytest.fixture
def cols() -> list[dict]:
    return _load_collections()


def _nums(c: dict) -> list[int]:
    return list(range(c["from"], c["to"] + 1))


def test_13_collections_index_contiguous(cols: list[dict]) -> None:
    assert len(cols) == 13, f"合辑数应为 13, 实际 {len(cols)}"
    assert [c["index"] for c in cols] == list(range(1, 14)), "index 应为 1..13 连续"


def test_ranges_cover_exactly_1_108(cols: list[dict]) -> None:
    seen: set[int] = set()
    for c in cols:
        seen.update(_nums(c))
    expected = set(range(1, 109))
    assert seen == expected, (
        f"并集应为 1..108 无重复无缺口; "
        f"缺口: {sorted(expected - seen)}, 多余: {sorted(seen - expected)}"
    )


def test_ranges_valid_and_leq_12(cols: list[dict]) -> None:
    for c in cols:
        assert c["to"] >= c["from"], f"{c['id']}: to({c['to']}) < from({c['from']})"
        size = c["to"] - c["from"] + 1
        assert size <= 12, f"{c['id']}: 集数 {size} 超过 12"


def test_episode_files_exist(cols: list[dict]) -> None:
    missing = [f"{c['id']} ep{n}" for c in cols for n in _nums(c)
               if not (EP_DIR / f"ep{n}.json").exists()]
    assert not missing, f"缺少集文件: {missing}"


def test_ids_match_index(cols: list[dict]) -> None:
    for c in cols:
        assert c["id"] == f"c{c['index']:02d}", (
            f"{c['id']} 与 index {c['index']} 不对应 (应为 c{str(c['index']).zfill(2)})"
        )


def test_every_collection_has_story_summary(cols: list[dict]) -> None:
    for c in cols:
        summary = c.get("summary", {})
        assert len(summary.get("zh", "")) >= 16, f"{c['id']}: 缺少简短中文剧情导语"
        assert len(summary.get("en", "")) >= 24, f"{c['id']}: 缺少简短英文剧情导语"


def test_broad_arc_titles_cover_multi_episode_stories(cols: list[dict]) -> None:
    by_id = {c["id"]: c for c in cols}
    assert by_id["c07"]["title"]["zh"] == "红孩儿降伏记·黑水河"
    assert by_id["c10"]["title"]["zh"] == "真假美猴王·三借芭蕉扇"
    assert all("~" not in c["title"]["zh"] and "～" not in c["title"]["zh"] for c in cols)


if __name__ == "__main__":
    cols = _load_collections()
    test_13_collections_index_contiguous(cols)
    test_ranges_cover_exactly_1_108(cols)
    test_ranges_valid_and_leq_12(cols)
    test_episode_files_exist(cols)
    test_ids_match_index(cols)
    test_every_collection_has_story_summary(cols)
    test_broad_arc_titles_cover_multi_episode_stories(cols)
    total = sum(c["to"] - c["from"] + 1 for c in cols)
    print(f"ok: {len(cols)} collections, {total} episodes, all files present")
