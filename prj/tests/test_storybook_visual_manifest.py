import hashlib
import json
from pathlib import Path

from PIL import Image

from prj.tools.storybook_visual_manifest import build_asset_record, validate_manifest


def _write_asset(tmp_path: Path) -> tuple[Path, Path]:
    asset = tmp_path / "quiz-background.png"
    Image.new("RGB", (1536, 1024), (20, 50, 70)).save(asset)
    prompt = tmp_path / "quiz-background.prompt.txt"
    prompt.write_text("wide panoramic text-free scene\n", encoding="utf-8")
    return asset, prompt


def test_manifest_rejects_asset_without_source_evidence(tmp_path: Path) -> None:
    asset, prompt = _write_asset(tmp_path)
    record = build_asset_record("quiz", "quiz-background", asset, prompt, [], "assets/quiz.png")
    errors = validate_manifest(
        {"schema_version": 1, "series": "minecraft", "episode": 1, "assets": [record]},
        {"pages": [{"page_no": 1}]},
        tmp_path,
        tmp_path,
    )
    assert any("source evidence" in error for error in errors)


def test_manifest_validates_hashes_ratio_and_page_evidence(tmp_path: Path) -> None:
    asset, prompt = _write_asset(tmp_path)
    record = build_asset_record(
        "quiz", "quiz-background", asset, prompt,
        [{"storybook_pages": [1], "sentence_ids": ["s1"]}], "assets/quiz.png",
    )
    manifest = {"schema_version": 1, "series": "minecraft", "episode": 1, "assets": [record]}
    assert validate_manifest(manifest, {"pages": [{"page_no": 1}]}, tmp_path, tmp_path) == []
    record["sha256"] = hashlib.sha256(b"wrong").hexdigest()
    assert any("sha256 mismatch" in error for error in validate_manifest(manifest, {"pages": [{"page_no": 1}]}, tmp_path, tmp_path))
