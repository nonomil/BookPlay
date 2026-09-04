# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from report_stage_pack import verify_manifest  # noqa: E402
from test_stage_pack import _fixture  # noqa: E402
from pack_datapack import write_datapack_zip  # noqa: E402


def test_manifest_and_runtime_boundary_are_consistent(tmp_path: Path) -> None:
    root = tmp_path / "content"
    _fixture(root)
    pack = tmp_path / "c01.zip"
    write_datapack_zip(root, pack, collections="c01", published="none", version="test")
    manifest = verify_manifest(pack)
    assert manifest["episodes"] == [1, 2]
    with zipfile.ZipFile(pack) as zf:
        names = set(zf.namelist())
        collections = json.loads(zf.read("dialogue_stories/collections.json"))
        assert [item["id"] for item in collections["collections"]] == ["c01"]
        assert "dialogue_stories/drill/c01.json" in names
        assert "assets/video/ep1.mp4" in names
        assert "assets/video/ep3.mp4" not in names
        assert not any(name.startswith("assets/lf_ep") for name in names)


def test_stage_pack_runtime_has_home_and_map_assets(tmp_path: Path) -> None:
    root = tmp_path / "content"
    _fixture(root)
    catalog = {
        "schema_version": 1,
        "count": 4,
        "episodes": [
            {"episode": i, "title": {"en": str(i), "zh": str(i)}, "cover": f"assets/covers/ep{i:03d}.jpg"}
            for i in range(1, 5)
        ],
    }
    (root / "storybooks").mkdir(parents=True, exist_ok=True)
    (root / "storybooks/catalog.json").write_text(json.dumps(catalog), encoding="utf-8")
    (root / "assets/covers/journey-west-cover.png").write_bytes(b"cover")
    pack = tmp_path / "c01.zip"
    write_datapack_zip(root, pack, collections="c01", published="none", version="test")
    verify_manifest(pack)
    with zipfile.ZipFile(pack) as zf:
        names = set(zf.namelist())
        assert "storybooks/catalog.json" in names
        assert "assets/covers/journey-west-cover.png" in names
        assert "assets/covers/ep001.jpg" in names
        assert "assets/covers/ep002.jpg" in names
        stage_catalog = json.loads(zf.read("storybooks/catalog.json"))
        assert [item["episode"] for item in stage_catalog["episodes"]] == [1, 2]


if __name__ == "__main__":
    print("ok")
