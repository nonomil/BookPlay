import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_companion_manifest_paths_and_hashes_are_current():
    manifest = json.loads((ROOT / "assets/generated/white-dragon-character-bible/manifest.json").read_text(encoding="utf-8"))
    assert manifest["generation_mode"] == "cliprox-api-gpt-image-2"
    assert manifest["status"] == "cliprox-raster-ready"
    assert manifest["processing"]["method"] == "chroma-key"
    assert manifest["review"]["alpha_required"] is True
    for item in manifest["generated_assets"]:
        path = ROOT / item["path"]
        assert path.is_file(), item["path"]
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        assert digest == item["sha256"], item["path"]
        if path.suffix.lower() == ".png":
            report_path = ROOT / item["quality_report"]
            assert report_path.is_file(), item["quality_report"]
            report = json.loads(report_path.read_text(encoding="utf-8"))
            assert report["corners_transparent"] is True
            assert report["green_visible_pct"] == 0
            assert report["green_edge_pct"] == 0
            from PIL import Image

            with Image.open(path) as image:
                assert image.mode == "RGBA", item["path"]
                assert image.size == (item["width"], item["height"]), item["path"]
                assert all(image.getpixel(point)[3] == 0 for point in ((0, 0), (image.width - 1, 0), (0, image.height - 1), (image.width - 1, image.height - 1)))


def test_mikey_route_atlas_manifest_and_alpha_are_current():
    manifest_path = ROOT / "assets/generated/mikey-jj-route-companion/manifest.json"
    atlas = ROOT / "content/assets/generated/mikey-jj-route-companion/transparent/mikey-walk-atlas.png"
    assert manifest_path.is_file()
    assert atlas.is_file()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert manifest["asset_id"] == "mikey-jj-route-companion"
    assert manifest["acceptance"]["atlas_dimensions"] == "3072x2048"
    assert hashlib.sha256(atlas.read_bytes()).hexdigest() == manifest["hashes"]["mikey-walk-atlas.png"]
    from PIL import Image

    with Image.open(atlas) as image:
        assert image.mode == "RGBA"
        assert image.size == (3072, 2048)
        assert all(image.getpixel(point)[3] == 0 for point in ((0, 0), (3071, 0), (0, 2047), (3071, 2047)))
