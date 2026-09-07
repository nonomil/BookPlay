# -*- coding: utf-8 -*-
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import make_release as mr  # noqa: E402


def test_make_release_writes_folders_and_notes(tmp_path: Path, monkeypatch) -> None:
    repo = tmp_path / "repo"
    mobile = tmp_path / "mobile.apk"
    tv = tmp_path / "tv.apk"
    pack = tmp_path / "follow.zip"
    mobile.write_bytes(b"mobile-apk")
    tv.write_bytes(b"tv-apk-file")
    pack.write_bytes(b"datapack")
    monkeypatch.setattr(mr, "REPO", repo)
    dest = mr.make_release(
        "1.0.6",
        mobile_src=mobile,
        tv_src=tv,
        pack_src=pack,
        version_code="11",
    )
    assert dest == repo / "release" / "v1.0.6"
    assert (dest / "apk" / "豆豆龙英语-1.0.6-mobile.apk").is_file()
    assert (dest / "apk" / "豆豆龙英语-1.0.6-tv.apk").is_file()
    assert (dest / "datapack" / "书戏后续数据包-1.0.6.zip").is_file()
    notes = (dest / "版本说明.md").read_text(encoding="utf-8-sig")
    install = (dest / "安装说明.md").read_text(encoding="utf-8-sig")
    assert "掌机按键探测" in notes
    assert "versionCode：11" in notes
    assert "apk/豆豆龙英语-1.0.6-mobile.apk" in install
    assert "datapack/书戏后续数据包-1.0.6.zip" in install
