# -*- coding: utf-8 -*-
"""TDD 合同：合辑背景原图保留，运行时输出统一为 16:9。"""
from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "prj" / "tools" / "normalize_collection_backgrounds.py"
COLLECTIONS = ROOT / "content" / "dialogue_stories" / "collections.json"
ASSETS = ROOT / "content" / "assets" / "collections"


def _module():
    assert SCRIPT.exists(), "缺少合辑背景确定性后处理脚本"
    spec = importlib.util.spec_from_file_location("normalize_collection_backgrounds", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_normalize_one_keeps_source_and_writes_exact_16_by_9(tmp_path: Path) -> None:
    module = _module()
    src = tmp_path / "source.jpg"
    dst = tmp_path / "normalized" / "c01.jpg"
    Image.new("RGB", (300, 200), (80, 120, 160)).save(src, quality=90)
    before = hashlib.sha256(src.read_bytes()).hexdigest()

    receipt = module.normalize_one(src, dst, width=1600, height=900)

    assert hashlib.sha256(src.read_bytes()).hexdigest() == before
    with Image.open(dst) as image:
        assert image.size == (1600, 900)
        assert image.mode == "RGB"
    assert receipt["source_dimensions"] == [300, 200]
    assert receipt["output_dimensions"] == [1600, 900]
    assert receipt["transform"] == "center-crop-cover"
    assert len(receipt["source_sha256"]) == 64
    assert len(receipt["output_sha256"]) == 64


def test_build_all_writes_13_outputs_and_manifest(tmp_path: Path) -> None:
    module = _module()
    src_dir = tmp_path / "sources"
    out_dir = tmp_path / "normalized"
    src_dir.mkdir()
    for index in range(1, 14):
        Image.new("RGB", (320 + index, 180 + index), (index, 40, 70)).save(src_dir / f"c{index:02d}.jpg")

    manifest = module.build_all(src_dir, out_dir, width=1600, height=900)

    assert manifest["count"] == 13
    assert manifest["output_dimensions"] == [1600, 900]
    assert len(manifest["assets"]) == 13
    assert (out_dir / "manifest.json").exists()
    assert all((out_dir / f"c{index:02d}.jpg").exists() for index in range(1, 14))


def test_update_collection_refs_uses_normalized_folder(tmp_path: Path) -> None:
    module = _module()
    path = tmp_path / "collections.json"
    path.write_text(json.dumps({
        "collections": [
            {"id": f"c{index:02d}", "background": f"assets/collections/c{index:02d}.jpg"}
            for index in range(1, 14)
        ]
    }), encoding="utf-8")

    changed = module.update_collection_refs(path)
    data = json.loads(path.read_text(encoding="utf-8"))

    assert changed == 13
    assert data["collections"][0]["background"] == "assets/collections/normalized/c01.jpg"
    assert data["collections"][-1]["background"] == "assets/collections/normalized/c13.jpg"


def test_current_sources_cover_all_13_collections() -> None:
    data = json.loads(COLLECTIONS.read_text(encoding="utf-8"))
    assert [item["id"] for item in data["collections"]] == [f"c{index:02d}" for index in range(1, 14)]
    assert all((ASSETS / f"c{index:02d}.jpg").exists() for index in range(1, 14))
    for index, item in enumerate(data["collections"], start=1):
        assert item["background"] == f"assets/collections/normalized/c{index:02d}.jpg"
        with Image.open(ASSETS / "normalized" / f"c{index:02d}.jpg") as image:
            assert image.size == (1600, 900)
    manifest = json.loads((ASSETS / "normalized" / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["count"] == 13
    assert manifest["acceptance"]["source_files_preserved"] is True
