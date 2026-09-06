import json
import re
from pathlib import Path

from pack_datapack import COMMON_FILES, included
from pack_android import DATA_DIRS, ENGINE_FILES

ROOT = Path(__file__).resolve().parents[2]


def test_companion_catalogs_and_art_are_in_datapack():
    expected = (
        "achievements/jttw.json",
        "companions/white-dragon.json",
        "rewards/jttw.json",
        "assets/achievements/jttw/medal-frame.svg",
        "assets/companions/white-dragon/stages/mysterious-egg.png",
        "assets/companions/white-dragon/stages/mysterious-egg.svg",
        "assets/generated/wala-gamification/clean/decor-parts/decor01_417x485.png",
        "assets/lf_ep1/pages/p03.png",
        "assets/lf_ep1/pages/p10.png",
    )
    for rel in expected:
        assert included(rel), f"data pack excludes {rel}"


def test_story_scene_thumbnails_are_packable_for_every_episode():
    for episode in (1, 8, 32, 64, 108):
        rel = f"assets/generated/jttw-story-scenes-v1/ep{episode:03d}.jpg"
        assert included(rel), f"data pack excludes {rel}"
        path = ROOT / "content" / rel
        assert path.is_file(), rel
        assert path.stat().st_size < 150_000, rel


def test_route_companion_animation_is_packable_and_runtime_ready():
    sprite = "assets/generated/jttw-route-companion/transparent/wukong-walk-strip.png"
    assert included(sprite), "data pack excludes the generated JTTW route companion sprite"
    path = ROOT / "content" / sprite
    assert path.is_file(), sprite
    from PIL import Image

    with Image.open(path) as image:
        assert image.mode == "RGBA"
        assert image.size == (3072, 512)
        assert image.getpixel((0, 0))[3] == 0


def test_route_companion_four_direction_atlas_is_packable_and_runtime_ready():
    sprite = "assets/generated/jttw-route-companion/transparent/wukong-walk-atlas.png"
    assert included(sprite), "data pack excludes the four-direction JTTW route companion atlas"
    path = ROOT / "content" / sprite
    assert path.is_file(), sprite
    from PIL import Image

    with Image.open(path) as image:
                assert image.mode == "RGBA"
                assert image.size == (3072, 2048)
                assert image.getpixel((0, 0))[3] == 0


def test_mikey_route_companion_atlas_is_packable_and_runtime_ready():
    sprite = "assets/generated/mikey-jj-route-companion/transparent/mikey-walk-atlas.png"
    assert included(sprite), "data pack excludes the Mikey & JJ route companion atlas"
    path = ROOT / "content" / sprite
    assert path.is_file(), sprite
    from PIL import Image

    with Image.open(path) as image:
        assert image.mode == "RGBA"
        assert image.size == (3072, 2048)
        assert image.getpixel((0, 0))[3] == 0


def test_episode_walker_gifs_are_packable_and_fixed_canvas():
    from PIL import Image

    roles = ("wukong", "tang", "bajie", "shawujing", "guanyin", "redboy", "ironfan", "bullking", "dragonking", "whitedragonhorse", "subodhi", "jadeemperor", "yellowwind", "whitebone", "blackwind", "zhenyuan", "hundredflowers", "goldenhorn", "liondemon", "tigerimmortal", "yellowbrows", "powerdemon", "spiderdemon", "centipededemon", "chaosdemon")
    manifest = json.loads((ROOT / "assets" / "generated" / "jttw-player-walkers" / "manifest.json").read_text(encoding="utf-8"))
    assert {entry["id"] for entry in manifest["characters"]} == set(roles)
    for role in roles:
        filename = "wukong-walk.gif" if role == "wukong" else f"{role}-walk.gif"
        rel = f"assets/generated/jttw-player-walkers/{role}/{filename}"
        assert included(rel), f"data pack excludes {rel}"
        path = ROOT / "content" / rel
        assert path.is_file(), rel
        with Image.open(path) as image:
            assert image.size == (384, 512)
            assert image.n_frames == 8
            assert image.info.get("duration") in (120, 150)
            frames = []
            for frame_index in range(image.n_frames):
                image.seek(frame_index)
                frame = image.convert("RGBA")
                assert all(frame.getpixel(point)[3] == 0 for point in ((0, 0), (383, 0), (0, 511), (383, 511)))
                frames.append(frame.tobytes())
            assert len(set(frames)) > 1, f"{rel} does not animate"
    directional = manifest.get("directionalContract") or {}
    assert directional.get("directions") == ["east", "south", "west", "north"]
    assert directional.get("framesPerDirection") == 8
    for role in ("wukong", "subodhi", "dragonking", "chaosdemon"):
        entry = next(item for item in manifest["characters"] if item["id"] == role)
        atlas_rel = entry["directional"]["atlas"].replace("content/", "")
        atlas_path = ROOT / "content" / atlas_rel
        assert atlas_path.is_file(), atlas_rel
        with Image.open(atlas_path) as atlas:
            assert atlas.mode == "RGBA"
            assert atlas.size == (3072, 2048)
            assert atlas.getpixel((0, 0))[3] == 0


def test_android_tree_carries_companion_engine_and_data_dirs():
    for name in ("map.html", "map.js", "companion.html", "companion.js", "companion.css", "companion-core.js", "medals.html", "stickers.html", "room.html"):
        assert name in ENGINE_FILES
    for rel, _ in DATA_DIRS:
        if rel in {"achievements", "companions", "rewards", "assets/achievements", "assets/companions"}:
            break
    else:
        raise AssertionError("Android data tree excludes companion catalogs or art")
    dirs = {rel for rel, _ in DATA_DIRS}
    assert {"achievements", "companions", "rewards", "assets/achievements", "assets/companions"} <= dirs
    assert "assets/generated/wala-gamification/companion-room-bg-v1.png" in dirs
    assert "assets/generated/jttw-route-companion/transparent" in dirs
    assert any(rel == "assets/generated/jttw-player-walkers/tang/tang-walk.gif" for rel, _ in DATA_DIRS)
    android_files = {rel for rel, _ in DATA_DIRS}
    for rel in (
        "assets/generated/jttw-ep001-story-rewards/transparent/jttw-ep001-stream-splash.png",
        "assets/generated/jttw-ep001-story-rewards/transparent/jttw-ep001-waterfall-gate.png",
        "assets/generated/jttw-ep001-story-rewards/transparent/jttw-ep001-brave-ribbon.png",
        "assets/generated/jttw-ep001-story-rewards/transparent/jttw-ep001-water-curtain-token.png",
        "assets/lf_ep1/pages/p03.png",
        "assets/lf_ep1/pages/p10.png",
    ):
        assert rel in android_files, rel
    assert any(rel == "assets/generated/jttw-player-walkers/redboy/redboy-walk.gif" for rel, _ in DATA_DIRS)
    assert any(rel == "assets/generated/jttw-player-walkers/whitedragonhorse/whitedragonhorse-walk.gif" for rel, _ in DATA_DIRS)
    assert any(rel == "assets/generated/jttw-player-walkers/blackwind/blackwind-walk.gif" for rel, _ in DATA_DIRS)
    assert any(rel == "assets/generated/jttw-player-walkers/goldenhorn/goldenhorn-walk.gif" for rel, _ in DATA_DIRS)
    assert any(rel == "assets/generated/jttw-player-walkers/tigerimmortal/tigerimmortal-walk.gif" for rel, _ in DATA_DIRS)
    assert any(rel == "assets/generated/jttw-player-walkers/yellowbrows/yellowbrows-walk.gif" for rel, _ in DATA_DIRS)
    assert any(rel == "assets/generated/jttw-player-walkers/powerdemon/powerdemon-walk.gif" for rel, _ in DATA_DIRS)
    assert any(rel == "assets/generated/jttw-player-walkers/spiderdemon/spiderdemon-walk.gif" for rel, _ in DATA_DIRS)
    assert any(rel == "assets/generated/jttw-player-walkers/centipededemon/centipededemon-walk.gif" for rel, _ in DATA_DIRS)


def test_android_tree_carries_lesson_reward_dependencies_for_per_episode_stickers():
    required = {
        "lesson.html",
        "lesson.js",
        "lesson.css",
        "lesson-core.js",
        "episode-reward.js",
        "voice-core.js",
        "voice.js",
        "review-queue.js",
    }
    assert required <= set(ENGINE_FILES), sorted(required - set(ENGINE_FILES))


def test_gpt_medal_assets_are_explicit_runtime_pngs_only():
    """The 19 published GPT medals ship; spare art and QA reports do not."""
    catalog = json.loads((ROOT / "content" / "achievements" / "jttw.json").read_text(encoding="utf-8"))
    assets = [item["asset"] for item in catalog["achievements"] if item.get("asset")]
    assert len(assets) == 19
    data_dirs = {rel for rel, _ in DATA_DIRS}
    assert "assets/generated/jttw-medals-v2/transparent" not in data_dirs
    from PIL import Image

    for asset in assets:
        assert included(asset), f"data pack excludes medal asset {asset}"
        path = ROOT / "content" / asset
        assert path.is_file(), asset
        with Image.open(path).convert("RGBA") as image:
            assert image.mode == "RGBA"
            assert image.getpixel((0, 0))[3] == 0
    assert not included("assets/generated/jttw-medals-v2/transparent/spare-cloud-star.png")
    assert not included("assets/generated/jttw-medals-v2/transparent/flower-fruit-mountain.report.json")


def test_p2_room_pack_keeps_only_runtime_art_and_excludes_generation_intermediates():
    assert "assets/generated/wala-gamification/companion-room-bg-v1.png" in COMMON_FILES
    assert "assets/generated/wala-gamification/clean/decor-parts/decor01_417x485.png" in COMMON_FILES
    assert not included("assets/generated/wala-gamification/companion-room-bg-v1.response.attempt1.json")
    assert not included("assets/generated/wala-gamification/doudou-dragon-companion-v1-alpha-v2.png")


def test_every_reward_asset_is_packable_and_exists():
    catalog = json.loads((ROOT / "content" / "rewards" / "jttw.json").read_text(encoding="utf-8"))
    assets = {
        item["asset"]
        for episode in catalog.get("episodes", {}).values()
        for item in episode.get("items", [])
        if item.get("asset")
    }
    for asset in assets | {catalog["rooms"]["room.huaguo"]["background"]}:
        assert (ROOT / "content" / asset).exists(), f"missing reward asset {asset}"
        assert included(asset), f"data pack excludes reward asset {asset}"


def test_ep1_generated_reward_pngs_keep_transparent_edges_and_no_key_green():
    """Generated EP1 keepsakes must be safe to composite in the room UI."""
    catalog = json.loads((ROOT / "content" / "rewards" / "jttw.json").read_text(encoding="utf-8"))
    assets = [
        item["asset"]
        for item in catalog["episodes"]["1"]["items"]
        if item.get("asset", "").startswith("assets/generated/jttw-ep001-story-rewards/transparent/")
    ]
    assert len(assets) == 3
    from PIL import Image

    for asset in assets:
        path = ROOT / "content" / asset
        with Image.open(path).convert("RGBA") as image:
            assert image.size == (1254, 1254), asset
            edge = []
            for x in range(image.width):
                edge.extend((image.getpixel((x, 0))[3], image.getpixel((x, image.height - 1))[3]))
            for y in range(image.height):
                edge.extend((image.getpixel((0, y))[3], image.getpixel((image.width - 1, y))[3]))
            assert max(edge) == 0, asset
            for pixel in image.getdata():
                r, g, b, alpha = pixel
                if alpha:
                    distance = (r * r + (g - 255) * (g - 255) + b * b) ** 0.5
                    assert distance >= 40, f"near-key-green residue in {asset}: {pixel}"


def test_ep1_sticker_overrides_use_story_specific_generated_assets():
    catalog = json.loads((ROOT / "content" / "rewards" / "jttw.json").read_text(encoding="utf-8"))
    theme = catalog["sticker_themes"][0]
    overrides = theme.get("episode_overrides") or {}
    assert set(overrides) == {str(i) for i in range(1, 8)}
    expected = {
        "1": "jttw-ep001-stone-shard.png",
        "2": "jttw-ep001-heaven-light.png",
        "3": "jttw-ep001-peach-pip.png",
        "4": "jttw-ep001-stream-splash.png",
        "5": "jttw-ep001-waterfall-gate.png",
        "6": "jttw-ep001-brave-ribbon.png",
        "7": "jttw-ep001-water-curtain-token.png",
    }
    from PIL import Image
    for episode, filename in expected.items():
        asset = overrides[episode]["asset"]
        assert asset.endswith(filename)
        path = ROOT / "content" / asset
        assert path.is_file(), asset
        assert included(asset), asset
        binding = overrides[episode].get("story_binding") or {}
        assert binding.get("storybook_pages"), episode
        assert binding.get("scene_ids"), episode
        assert overrides[episode].get("asset_prompt_id"), episode
        with Image.open(path).convert("RGBA") as image:
            assert image.size == (1254, 1254), asset
            assert all(image.getpixel(point)[3] == 0 for point in ((0, 0), (image.width - 1, 0), (0, image.height - 1), (image.width - 1, image.height - 1)))
            for r, g, b, alpha in image.getdata():
                if alpha:
                    distance = (r * r + (g - 255) * (g - 255) + b * b) ** 0.5
                    assert distance >= 40, f"near-key-green residue in {asset}: {(r, g, b, alpha)}"


def test_ep1_story_bound_rewards_match_storybook_pages_scenes_and_time_range():
    catalog = json.loads((ROOT / "content" / "rewards" / "jttw.json").read_text(encoding="utf-8"))
    story = json.loads((ROOT / "content" / "storybooks" / "ep1.json").read_text(encoding="utf-8"))
    page_numbers = {int(page["page_no"]) for page in story.get("pages", []) if "page_no" in page}
    scene_ids = {str(scene["id"]) for scene in story.get("scenes", []) if scene.get("id")}
    duration = float(story["audio_duration_sec"])
    items = catalog.get("episodes", {}).get("1", {}).get("items", [])
    assert items, "EP1 reward items are required"
    for item in items:
        binding = item.get("story_binding")
        assert isinstance(binding, dict), f"{item.get('id')} 缺少 story_binding"
        assert set(binding.get("storybook_pages", [])) <= page_numbers
        assert set(binding.get("scene_ids", [])) <= scene_ids
        assert binding.get("trigger_terms"), f"{item.get('id')} 缺少重点词"
        video = binding.get("video") or {}
        start = float(video.get("start_sec"))
        end = float(video.get("end_sec"))
        assert 0 <= start < end <= duration + 0.01
        assert binding.get("asset_prompt_id"), f"{item.get('id')} 缺少生图 prompt id"


def _normalize_title(text: str) -> str:
    cleaned = re.sub(r"""[“”‘’'".,!?！？：:、，。·()（）\[\]【】]""", " ", str(text or "").lower())
    return re.sub(r"\s+", " ", cleaned).strip()


def _count_alias(text: str, alias: str) -> int:
    escaped = re.escape(alias)
    pattern = rf"\b{escaped}\b" if re.match(r"[A-Za-z]", alias) else escaped
    return len(re.findall(pattern, str(text or ""), flags=re.I))


def _js_array(source: str, key: str):
    import ast

    marker = f"{key}:"
    start = source.find(marker)
    if start < 0:
        return []
    start = source.find("[", start)
    depth = 0
    for index, char in enumerate(source[start:], start):
        if char == "[":
            depth += 1
        elif char == "]":
            depth -= 1
            if depth == 0:
                return ast.literal_eval(source[start:index + 1])
    return []


def _walking_cast():
    source = (ROOT / "prj" / "engine" / "wala.js").read_text(encoding="utf-8")
    cast = {}
    for match in re.finditer(
        r"^  (?P<id>[a-z]+): Object\.freeze\(\{(?P<body>.*?)^  \}\),",
        source,
        flags=re.M | re.S,
    ):
        body = match.group("body")
        titles = _js_array(body, "titleAliases")
        aliases = _js_array(body, "aliases")
        if titles or aliases:
            cast[match.group("id")] = {"titleAliases": titles, "aliases": aliases}
    return cast


def test_new_walkers_win_their_catalog_episode_titles():
    catalog = json.loads((ROOT / "prj" / "engine" / "catalog-jttw.json").read_text(encoding="utf-8"))
    titles = {int(item["episode"]): item["title"] for item in catalog["episodes"]}
    cast = _walking_cast()
    expected = {
        55: "tigerimmortal",
        56: "tigerimmortal",
        57: "tigerimmortal",
        58: "tigerimmortal",
        82: "yellowbrows",
        83: "yellowbrows",
        84: "powerdemon",
        85: "powerdemon",
        86: "powerdemon",
        87: "spiderdemon",
        88: "spiderdemon",
        89: "centipededemon",
    }
    for episode, role_id in expected.items():
        title = titles[episode]
        sources = [_normalize_title(title.get("en")), _normalize_title(title.get("zh"))]
        joined = f"{title.get('zh', '')} {title.get('en', '')}"
        scored = []
        for role, aliases in cast.items():
            score = 0
            for alias, weight in aliases["titleAliases"]:
                normalized = _normalize_title(alias)
                score += weight * 10000 if normalized in sources else _count_alias(joined, alias) * weight * 100
            for alias, weight in aliases["aliases"]:
                if _normalize_title(alias) in sources:
                    score += weight * 10000
            scored.append((score, role))
        winner = max(scored)[1]
        assert winner == role_id, f"ep{episode} {title['en']} resolved to {winner}, expected {role_id}"
