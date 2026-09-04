"""Regression checks for cross-storybook character and reward assets."""

import hashlib
import json
from pathlib import Path

from PIL import Image

from pack_datapack import included


ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "content"


def _catalog():
    return json.loads((CONTENT / "storybook-collections/catalog.json").read_text(encoding="utf-8"))


def test_collection_catalog_has_two_series_and_required_layers():
    catalog = _catalog()
    assert catalog["schema_version"] == 1
    assert {"minecraft", "mikey-jj"} <= set(catalog["series"])
    for series in catalog["series"].values():
        assert series["characters"]
        assert series["action_sets"]
        assert series["sticker_themes"]
        assert series["badges"]
        assert series["rooms"]


def test_pilot_catalog_assets_exist_and_are_packable():
    catalog = _catalog()
    refs = []
    for series in catalog["series"].values():
        for character in series["characters"]:
            bible = character.get("bible")
            assert bible, character["id"]
            assert (CONTENT / bible).is_file(), bible
            assert included(bible), f"data pack excludes {bible}"
            refs.extend(character.get("actions", {}).values())
        refs.extend(item["asset"] for item in series["badges"] if item.get("asset"))
    assert refs
    for rel in refs:
        path = CONTENT / rel
        assert path.is_file(), rel
        assert included(rel), f"data pack excludes {rel}"
        with Image.open(path) as image:
            assert image.mode == "RGBA", rel
            assert image.getpixel((0, 0))[3] == 0, rel


def test_pilot_manifests_and_alpha_reports_are_complete():
    assets_root = CONTENT / "assets/generated"
    manifests = [
        assets_root / "storybook-mikey-jj-character-action-sheet-v1/manifest.json",
        assets_root / "storybook-minecraft-character-action-sheet-v1/manifest.json",
        assets_root / "storybook-mikey-jj-reward-sheet-v1/manifest.json",
        assets_root / "storybook-minecraft-reward-sheet-v1/manifest.json",
    ]
    for manifest_path in manifests:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        assert manifest["provider"] == "cliprox"
        assert manifest["model"] == "gpt-image-2"
        source = manifest_path.parent / manifest["source_sheet"]["path"]
        assert source.is_file()
        assert hashlib.sha256(source.read_bytes()).hexdigest().upper() == manifest["source_sheet"]["sha256"]
        assert len(manifest["outputs"]) == 9
        story_rel = manifest["source_evidence"]["storybook"]
        story = json.loads((CONTENT / story_rel).read_text(encoding="utf-8"))
        sentence_ids = {sentence["id"] for page in story.get("pages", []) for sentence in page.get("sentences", [])}
        for binding in manifest["source_evidence"]["bindings"].values():
            assert set(binding["sentence_ids"]) <= sentence_ids
        for output in manifest["outputs"]:
            runtime = CONTENT / output["runtime_path"]
            report = manifest_path.parent / output["alpha_report"] if "alpha_report" in output else None
            assert runtime.is_file(), output["runtime_path"]
            assert report is not None and report.is_file(), output["alpha_report"]
            report_data = json.loads(report.read_text(encoding="utf-8"))
            assert report_data["corners_transparent"] is True
            assert report_data["green_visible_pct"] == 0
            assert report_data["green_edge_pct"] == 0
