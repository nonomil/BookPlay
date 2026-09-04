import json
from pathlib import Path

from pack_android import DATA_DIRS
from pack_datapack import included


ROOT = Path(__file__).resolve().parents[2]
CONTENT_CATALOG = ROOT / "content" / "rewards" / "storybooks.json"
DATA_CATALOG = ROOT / "prj" / "data" / "rewards" / "storybooks.json"


def _minecraft_catalog(path: Path) -> dict:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return payload["storybooks"]["minecraft"]


def _runtime_path(relative: str) -> Path:
    return ROOT / "content" / relative


def test_minecraft_reward_catalog_is_synced_between_content_and_runtime_data():
    content = _minecraft_catalog(CONTENT_CATALOG)
    runtime = _minecraft_catalog(DATA_CATALOG)
    assert content == runtime
    assert set(content["episodes"]) == {"1", "2"}
    assert all(len(config["items"]) == 3 for config in content["episodes"].values())


def test_minecraft_rewards_keep_story_proof_and_validated_transparency():
    catalog = _minecraft_catalog(CONTENT_CATALOG)
    for episode, config in catalog["episodes"].items():
        for item in config["items"]:
            item_id = item["id"]
            story_image = item.get("story_image")
            assert story_image, f"{item_id} 缺少 story_image"
            assert _runtime_path(story_image).is_file(), story_image
            assert included(story_image), f"data pack excludes {story_image}"

            # `asset` is the authored story-frame evidence in the Minecraft
            # catalog. It remains separate from the transparent room cutout.
            authored_asset = item.get("asset")
            assert authored_asset, f"{item_id} 缺少故事出处图 asset"
            assert _runtime_path(authored_asset).is_file(), authored_asset
            assert included(authored_asset), f"data pack excludes {authored_asset}"

            room_asset = item.get("room_asset")
            assert room_asset, f"{item_id} 必须有已审核 room_asset"
            assert item.get("asset_status") != "pending-transparent-generation", item_id
            path = _runtime_path(room_asset)
            assert path.is_file(), room_asset
            assert included(room_asset), f"data pack excludes {room_asset}"
            from PIL import Image

            with Image.open(path) as image:
                assert image.mode == "RGBA", room_asset
                assert all(
                    image.getpixel(point)[3] == 0
                    for point in (
                        (0, 0),
                        (image.width - 1, 0),
                        (0, image.height - 1),
                        (image.width - 1, image.height - 1),
                    )
                ), room_asset
            report = path.with_name(path.name + ".report.json")
            assert report.is_file(), report
            report_data = json.loads(report.read_text(encoding="utf-8"))
            assert report_data["corners_transparent"] is True, report
            assert report_data["green_visible_pct"] == 0.0, report
            assert report_data["green_edge_pct"] == 0.0, report


def test_minecraft_reward_assets_are_declared_for_offline_android_pack():
    android_dirs = {relative for relative, _ in DATA_DIRS}
    assert "assets/generated/storybooks/minecraft/rewards" in android_dirs
    assert "assets/generated/storybooks/minecraft-story-scenes-v1" in android_dirs
    assert "assets/generated/storybooks/minecraft/characters" in android_dirs
