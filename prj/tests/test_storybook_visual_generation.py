from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "prj" / "tools" / "generate_storybook_visual_assets.py"


def load_module():
    spec = importlib.util.spec_from_file_location("generate_storybook_visual_assets", MODULE_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_cliprox_generation_requires_process_environment_key(monkeypatch: pytest.MonkeyPatch) -> None:
    module = load_module()
    monkeypatch.delenv("CLIPROX_API_KEY", raising=False)
    with pytest.raises(SystemExit, match="CLIPROX_API_KEY missing"):
        module._require_key("cliprox")


def test_provider_output_is_normalized_to_png(tmp_path: Path) -> None:
    module = load_module()
    source = tmp_path / "generated.jpg"
    target = tmp_path / "final.png"
    Image.new("RGB", (1536, 1024), (30, 60, 90)).save(source, format="JPEG")
    module._stage_as_png(source, target)
    with Image.open(target) as image:
        assert image.format == "PNG"
        assert image.size == (1536, 1024)
    assert not (tmp_path / "final.png.tmp").exists()


def test_missing_key_does_not_modify_existing_manifest(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    module = load_module()
    monkeypatch.delenv("CLIPROX_API_KEY", raising=False)
    manifest = tmp_path / "manifest.json"
    manifest.write_text('{"generation_provider":"fallback-local-awaiting-cliprox-key"}\n', encoding="utf-8")
    before = manifest.read_bytes()
    with pytest.raises(SystemExit, match="CLIPROX_API_KEY missing"):
        module.generate(tmp_path, "minecraft", 1, "cliprox", False, "1536x1024", 1, 1)
    assert manifest.read_bytes() == before


def test_fallback_preparation_does_not_overwrite_formal_assets() -> None:
    from prj.tools.prepare_storybook_visual_assets import prepare

    # The fallback helper is imported from the same module and must refuse to
    # downgrade a published Cliprox set unless --force is explicit.
    runtime_manifest = ROOT / "prj" / "assets" / "generated" / "storybooks" / "minecraft" / "ep001" / "manifest.json"
    before = runtime_manifest.read_bytes()
    payload = json.loads(before)
    payload["generation_provider"] = "cliprox"
    runtime_manifest.write_text(json.dumps(payload), encoding="utf-8")
    try:
        with pytest.raises(RuntimeError, match="formal assets already exist"):
            prepare(ROOT, "minecraft", 1)
    finally:
        runtime_manifest.write_bytes(before)
