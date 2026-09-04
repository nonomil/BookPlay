# -*- coding: utf-8 -*-
from __future__ import annotations

import zipfile
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from pack_datapack import iter_pack_files, write_datapack_zip  # noqa: E402


def _touch(path: Path, size: int = 16) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"x" * size)


def test_pack_includes_playable_and_skips_storybook_pages(tmp_path: Path) -> None:
    root = tmp_path / "content"
    _touch(root / "dialogue_stories" / "ep1.json")
    _touch(root / "dialogue_stories" / "index.json")
    _touch(root / "assets" / "video" / "ep1.mp4", 64)
    _touch(root / "assets" / "adv_audio" / "sent_en" / "aaa.mp3")
    _touch(root / "assets" / "map_audio" / "collections" / "c01_zh.mp3")
    _touch(root / "assets" / "map_audio" / "index.json")
    _touch(root / "assets" / "covers" / "cover.png")
    _touch(root / "assets" / "cast" / "wukong" / "idle.png")
    _touch(root / "assets" / "ui" / "logo.png")
    _touch(root / "storybooks" / "catalog.json")
    _touch(root / "lesson_guides" / "ep001" / "lesson.json")
    _touch(root / "lesson_guides" / "ep001" / "assets" / "slide-001.webp")
    _touch(root / "assets" / "collections" / "normalized" / "c01.jpg")
    _touch(root / "assets" / "lf_ep1" / "page01.png", 128)
    _touch(root / "align" / "raw.bin", 32)

    names = {rel for rel, _src in iter_pack_files(root)}
    assert "dialogue_stories/ep1.json" in names
    assert "assets/video/ep1.mp4" in names
    assert "assets/adv_audio/sent_en/aaa.mp3" in names
    assert "assets/map_audio/collections/c01_zh.mp3" in names
    assert "assets/map_audio/index.json" in names
    assert "storybooks/catalog.json" in names
    assert "lesson_guides/ep001/lesson.json" in names
    assert "lesson_guides/ep001/assets/slide-001.webp" in names
    assert "assets/collections/normalized/c01.jpg" in names
    assert not any(n.startswith("assets/lf_ep") for n in names)
    assert "align/raw.bin" not in names

    dest = tmp_path / "storyhall.zip"
    write_datapack_zip(root, dest)
    with zipfile.ZipFile(dest) as zf:
        info = zf.getinfo("assets/video/ep1.mp4")
        assert info.compress_type == zipfile.ZIP_STORED
        assert "dialogue_stories/index.json" in zf.namelist()


if __name__ == "__main__":
    import tempfile
    with tempfile.TemporaryDirectory() as d:
        test_pack_includes_playable_and_skips_storybook_pages(Path(d))
    print("ok")
