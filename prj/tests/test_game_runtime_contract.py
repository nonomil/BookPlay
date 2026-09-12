# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from build_game_levels import build_map_layer  # noqa: E402

CONTENT = Path(__file__).resolve().parents[2] / "content"


def _maps():
    return {
        "themes": {
            "sample": {
                "regions": {
                    "hero": 5,
                    "waves": [5, 6],
                    "npc": {"intro": 5, "quiz": 6},
                    "boss": 7,
                },
                "walkable": {"x": 0.1, "y": 0.3, "w": 0.8, "h": 0.5},
                "heroSpawn": {"x": 0.2, "y": 0.4},
                "monsterSpawns": [{"x": 0.6, "y": 0.5}],
                "npcSpots": [
                    {"role": "intro", "x": 0.3, "y": 0.4},
                    {"role": "quiz", "x": 0.4, "y": 0.6},
                ],
                "bossSpot": {"x": 0.7, "y": 0.6},
            }
        }
    }


def test_map_layer_expands_authored_points_to_world_coordinates() -> None:
    result = build_map_layer(
        1,
        {"themesByEp": {"1": "sample"}, "npcByEp": {}},
        _maps(),
    )
    assert result["coordinateSpace"] == "world-normalized"
    assert result["worldTiles"] == 4
    assert result["heroSpawn"] == {"x": 0.3, "y": 0.35}
    assert result["waveSpawns"][0][0] == {"x": 0.4, "y": 0.375}
    assert result["waveSpawns"][1][0] == {"x": 0.65, "y": 0.375}
    assert result["npcSpots"][1]["x"] == 0.6
    assert result["bossSpot"] == {"x": 0.925, "y": 0.4}
    assert result["walkable"]["space"] == "world"


def test_walkable_uses_full_involved_tiles_not_a_ribbon() -> None:
    result = build_map_layer(
        1,
        {"themesByEp": {"1": "sample"}, "npcByEp": {}},
        _maps(),
    )
    rects = result["walkable"]["rects"]
    assert rects
    for rect in rects:
        assert rect["h"] >= 0.1, rect
        assert rect["w"] >= 0.1, rect
    walk = result["walkable"]
    for point in (result["heroSpawn"], result["bossSpot"], *result["npcSpots"], *result["waveSpawns"][0]):
        x, y = point["x"], point["y"]
        assert any(
            r["x"] <= x <= r["x"] + r["w"] and r["y"] <= y <= r["y"] + r["h"]
            for r in rects
        ), point
    assert walk["h"] >= 0.1


def test_reusable_boss_skill_fx_pngs_exist() -> None:
    root = CONTENT / "assets" / "game-fx"
    required = [
        "wukong/attack.png",
        "wukong/special.png",
        "wukong/defend.png",
        "wukong/hint.png",
        "generic/hit-player.png",
        "generic/hit-boss.png",
        "generic/shock.png",
    ]
    kits = json.loads((CONTENT / "game" / "boss-kits.json").read_text(encoding="utf-8"))
    for boss in (kits.get("bosses") or {}).values():
        for kind in ("attack", "special", "defend"):
            fx = str(((boss.get(kind) or {}).get("fx") or "")).replace("\\", "/")
            if fx.startswith("assets/game-fx/"):
                required.append(fx[len("assets/game-fx/") :])
    missing = []
    for rel in required:
        path = root / rel
        if not (path.is_file() and path.stat().st_size > 800):
            missing.append(rel)
    assert missing == [], missing


def test_new_named_bosses_use_own_skill_fx() -> None:
    """如来/土地公/太子/黑水河神出招图走自己的目录，不再借用菩提镇元唐僧白龙。"""
    kits = json.loads((CONTENT / "game" / "boss-kits.json").read_text(encoding="utf-8"))
    bosses = kits.get("bosses") or {}
    for boss_id in (
        "rulai",
        "tudigong",
        "prince",
        "heishui",
        "jinchi",
        "laojun",
        "king",
        "mountain-bandit",
        "forest-beast",
    ):
        boss = bosses[boss_id]
        for kind in ("attack", "special", "defend"):
            fx = str(((boss.get(kind) or {}).get("fx") or "")).replace("\\", "/")
            assert fx.startswith(f"assets/game-fx/{boss_id}/"), (boss_id, kind, fx)
            path = CONTENT / fx
            assert path.is_file() and path.stat().st_size > 800, path


def test_wukong_south_sprites_have_transparent_corners() -> None:
    """悟空南向 idle/walk 四角必须透明，不能留浅色方框。"""
    sprites = json.loads((CONTENT / "game" / "sprites.json").read_text(encoding="utf-8"))
    table = sprites.get("sprites") or sprites
    wukong = table["wukong"]
    for key, rel in (
        ("idle", wukong["idleFrames"]["south"]),
        ("walk", wukong["walkGifs"]["south"]),
        ("east-idle", wukong["idleFrames"]["east"]),
    ):
        path = CONTENT / str(rel).replace("\\", "/")
        assert path.is_file() and path.stat().st_size > 800, path
        im = Image.open(path)
        frames = getattr(im, "n_frames", 1)
        for i in range(frames):
            im.seek(i)
            rgba = im.convert("RGBA")
            w, h = rgba.size
            for xy in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
                assert rgba.getpixel(xy)[3] < 16, (key, path.name, i, xy, rgba.getpixel(xy))


def test_later_minion_south_walk_gifs_exist() -> None:
    """后面关新小怪南向走路用独立 GIF，不再整段复用 idle PNG。"""
    sprites = json.loads((CONTENT / "game" / "sprites.json").read_text(encoding="utf-8"))
    table = sprites.get("sprites") or sprites
    for sprite_id in (
        "heaven-soldier",
        "gourd-imp",
        "fire-imp",
        "bone-wraith",
        "temple-novice",
        "mountain-bandit",
        "blackwind-imp",
        "sand-yaksha",
        "court-guard",
        "forest-beast",
        "yellowrobe-imp",
    ):
        walks = table[sprite_id].get("walkGifs") or {}
        for direction in ("south", "west", "east", "north"):
            walk = str(walks.get(direction) or "").replace("\\", "/")
            assert walk.endswith(".gif"), (sprite_id, direction, walk)
            path = CONTENT / walk
            assert path.is_file() and path.stat().st_size > 800, path
        assert walks.get("east") != walks.get("south"), sprite_id
        assert walks.get("west") != walks.get("south"), sprite_id
        assert walks.get("north") != walks.get("south"), sprite_id


def test_named_bosses_south_walk_gifs_exist() -> None:
    """具名 Boss 南向走路用独立 GIF，不再整段复用 idle PNG。"""
    sprites = json.loads((CONTENT / "game" / "sprites.json").read_text(encoding="utf-8"))
    table = sprites.get("sprites") or sprites
    for sprite_id in (
        "yellowrobe",
        "rulai",
        "jinchi",
        "laojun",
        "king",
        "tudigong",
        "prince",
        "heishui",
        "yingchou",
    ):
        walk = str(((table[sprite_id].get("walkGifs") or {}).get("south") or "")).replace("\\", "/")
        assert walk.endswith(".gif"), (sprite_id, walk)
        path = CONTENT / walk
        assert path.is_file() and path.stat().st_size > 800, path


def test_combo_toast_matches_staff_combo_skill_name() -> None:
    """连击清场 toast 跟英雄技能名走，不再写金箍棒横扫。"""
    text = (Path(__file__).resolve().parents[1] / "engine" / "battle.js").read_text(encoding="utf-8")
    assert "金箍棒横扫" not in text
    assert "棒影连击" in text


def test_every_episode_has_minors_and_pickup_art() -> None:
    cast = json.loads((CONTENT / "game" / "cast.json").read_text(encoding="utf-8"))
    pickups = json.loads((CONTENT / "game" / "pickups.json").read_text(encoding="utf-8"))
    items = pickups["items"]
    for ep in range(1, 55):
        minors = cast["minorsByEp"][str(ep)]
        assert minors, ep
        pickup_id = pickups["byEp"][str(ep)]["id"]
        image = CONTENT / items[pickup_id]["image"]
        assert image.is_file(), image
        level = json.loads((CONTENT / "game" / "levels" / f"ep{ep}.json").read_text(encoding="utf-8"))
        assert level["cast"]["minors"][0]["id"] == minors[0]


def test_later_minion_families_match_story_pack() -> None:
    """后面关按剧情族换小怪，不继续用通用 imp / 水妖。"""
    cast = json.loads((CONTENT / "game" / "cast.json").read_text(encoding="utf-8"))
    sprites = json.loads((CONTENT / "game" / "sprites.json").read_text(encoding="utf-8"))
    expected = {
        "8": "heaven-soldier",
        "12": "temple-novice",
        "14": "mountain-bandit",
        "20": "blackwind-imp",
        "24": "sand-yaksha",
        "27": "forest-beast",
        "32": "bone-wraith",
        "34": "yellowrobe-imp",
        "35": "court-guard",
        "38": "gourd-imp",
        "48": "fire-imp",
    }
    table = sprites.get("sprites") or sprites
    for ep, sprite_id in expected.items():
        assert cast["minorsByEp"][ep] == [sprite_id], ep
        entry = table[sprite_id]
        south = CONTENT / entry["idleFrames"]["south"]
        assert south.is_file() and south.stat().st_size > 800, south
        level = json.loads((CONTENT / "game" / "levels" / f"ep{ep}.json").read_text(encoding="utf-8"))
        assert level["cast"]["minors"][0]["id"] == sprite_id, ep


def test_later_intro_npcs_match_minion_family() -> None:
    """开场 NPC 跟本集小怪族走，不再把水妖/通用小妖摆进换过皮的关。"""
    cast = json.loads((CONTENT / "game" / "cast.json").read_text(encoding="utf-8"))
    expected = {
        "12": "temple-novice",
        "14": "mountain-bandit",
        "19": "temple-novice",
        "27": "forest-beast",
        "34": "yellowrobe-imp",
    }
    for ep, sprite_id in expected.items():
        assert cast["npcByEp"][ep]["intro"] == sprite_id, ep
        level = json.loads((CONTENT / "game" / "levels" / f"ep{ep}.json").read_text(encoding="utf-8"))
        intro = next(spot for spot in level["map"]["npcSpots"] if spot["role"] == "intro")
        assert intro["sprite"] == sprite_id, ep


def test_yellowrobe_boss_is_not_chaosdemon() -> None:
    """黄袍怪关的 Boss / 问答立绘独立，不再借用混世魔王。"""
    cast = json.loads((CONTENT / "game" / "cast.json").read_text(encoding="utf-8"))
    sprites = json.loads((CONTENT / "game" / "sprites.json").read_text(encoding="utf-8"))
    kits = json.loads((CONTENT / "game" / "boss-kits.json").read_text(encoding="utf-8"))
    table = sprites.get("sprites") or sprites
    entry = table["yellowrobe"]
    south = CONTENT / entry["idleFrames"]["south"]
    assert south.is_file() and south.stat().st_size > 800, south
    assert ((kits.get("bosses") or {}).get("yellowrobe") or {}).get("nameZh") == "黄袍怪"
    for ep in ("34", "36", "37"):
        assert (cast["bossByEp"][ep] or {}).get("id") == "yellowrobe", ep
        assert (cast["npcByEp"][ep] or {}).get("quiz") == "yellowrobe", ep
        level = json.loads((CONTENT / "game" / "levels" / f"ep{ep}.json").read_text(encoding="utf-8"))
        assert ((level.get("cast") or {}).get("boss") or {}).get("id") == "yellowrobe", ep
        quiz = next(spot for spot in level["map"]["npcSpots"] if spot["role"] == "quiz")
        assert quiz["sprite"] == "yellowrobe", ep


def test_remaining_imp_bosses_use_family_sprites() -> None:
    """山贼关、林中野兽关的 Boss 不再用通用小妖立绘。"""
    cast = json.loads((CONTENT / "game" / "cast.json").read_text(encoding="utf-8"))
    kits = json.loads((CONTENT / "game" / "boss-kits.json").read_text(encoding="utf-8"))
    expected = {
        "14": "mountain-bandit",
        "15": "mountain-bandit",
        "27": "forest-beast",
    }
    for ep, sprite_id in expected.items():
        assert (cast["bossByEp"][ep] or {}).get("id") == sprite_id, ep
        assert sprite_id in (kits.get("bosses") or {}), sprite_id
        level = json.loads((CONTENT / "game" / "levels" / f"ep{ep}.json").read_text(encoding="utf-8"))
        boss = (level.get("cast") or {}).get("boss") or {}
        assert boss.get("id") == sprite_id, ep
        assert boss.get("sprite") == sprite_id, ep


def test_named_bosses_no_longer_borrow_standin_sprites() -> None:
    """如来/金池/老君/国王用自己的立绘；假唐僧和真正的菩提、唐僧、镇元不动。"""
    cast = json.loads((CONTENT / "game" / "cast.json").read_text(encoding="utf-8"))
    sprites = json.loads((CONTENT / "game" / "sprites.json").read_text(encoding="utf-8"))
    kits = json.loads((CONTENT / "game" / "boss-kits.json").read_text(encoding="utf-8"))
    table = sprites.get("sprites") or sprites
    expected = {
        "12": "rulai",
        "13": "rulai",
        "19": "jinchi",
        "35": "king",
        "44": "king",
        "46": "laojun",
    }
    keep = {
        "4": "subodhi",
        "28": "zhenyuan",
        "47": "tang",
    }
    for ep, sprite_id in {**expected, **keep}.items():
        assert (cast["bossByEp"][ep] or {}).get("id") == sprite_id, ep
        if ep in expected:
            assert sprite_id in (kits.get("bosses") or {}), sprite_id
            entry = table[sprite_id]
            south = CONTENT / entry["idleFrames"]["south"]
            assert south.is_file() and south.stat().st_size > 800, south
            assert (cast["npcByEp"][ep] or {}).get("quiz") == sprite_id, ep
        level = json.loads((CONTENT / "game" / "levels" / f"ep{ep}.json").read_text(encoding="utf-8"))
        assert ((level.get("cast") or {}).get("boss") or {}).get("id") == sprite_id, ep


def test_remaining_named_bosses_match_their_titles() -> None:
    """蟠桃园土地、鹰愁涧龙、乌鸡太子、黑水河神不再借用小猴/东海龙王/国王。"""
    cast = json.loads((CONTENT / "game" / "cast.json").read_text(encoding="utf-8"))
    sprites = json.loads((CONTENT / "game" / "sprites.json").read_text(encoding="utf-8"))
    kits = json.loads((CONTENT / "game" / "boss-kits.json").read_text(encoding="utf-8"))
    table = sprites.get("sprites") or sprites
    expected = {
        "9": "tudigong",
        "17": "yingchou",
        "45": "prince",
        "54": "heishui",
    }
    for ep, sprite_id in expected.items():
        assert (cast["bossByEp"][ep] or {}).get("id") == sprite_id, ep
        assert sprite_id in (kits.get("bosses") or {}), sprite_id
        entry = table[sprite_id]
        south = CONTENT / entry["idleFrames"]["south"]
        assert south.is_file() and south.stat().st_size > 800, south
        level = json.loads((CONTENT / "game" / "levels" / f"ep{ep}.json").read_text(encoding="utf-8"))
        assert ((level.get("cast") or {}).get("boss") or {}).get("id") == sprite_id, ep


def test_orbs_do_not_share_monster_spawn_points() -> None:
    maps = json.loads((CONTENT / "game" / "maps.json").read_text(encoding="utf-8"))
    cast = json.loads((CONTENT / "game" / "cast.json").read_text(encoding="utf-8"))
    result = build_map_layer(1, cast, maps)
    monsters = {(round(p["x"], 4), round(p["y"], 4)) for p in result["waveSpawns"][0]}
    orbs = {(round(p["x"], 4), round(p["y"], 4)) for p in result["orbSpawns"][0]}
    assert orbs.isdisjoint(monsters)
    assert min(p["x"] for p in result["orbSpawns"][0]) < min(p["x"] for p in result["waveSpawns"][0])


def test_map_layer_keeps_legacy_monster_spawns_for_old_consumers() -> None:
    result = build_map_layer(
        1,
        {"themesByEp": {"1": "sample"}, "npcByEp": {}},
        _maps(),
    )
    assert result["monsterSpawns"] == result["waveSpawns"][0]


def _tile_local(world_value: float, tiles: int = 4) -> float:
    return (float(world_value) * tiles) % 1.0


def test_episode_scene_maps_are_one_screen() -> None:
    """后面关每集一张空镜：一屏走完，不要把同一张图铺成 4×4 细廊。"""
    maps = json.loads((CONTENT / "game" / "maps.json").read_text(encoding="utf-8"))
    cast = json.loads((CONTENT / "game" / "cast.json").read_text(encoding="utf-8"))
    assert maps["themes"]["episode-scene"]["worldTiles"] == 1
    result = build_map_layer(23, cast, maps)
    assert result["worldTiles"] == 1
    assert result["walkable"]["h"] >= 0.2, result["walkable"]
    assert result["heroSpawn"]["y"] >= 0.5, result["heroSpawn"]
    baked = json.loads((CONTENT / "game" / "levels" / "ep23.json").read_text(encoding="utf-8"))
    assert ((baked.get("map") or {}).get("worldTiles") == 1)


def test_early_theme_maps_are_one_screen() -> None:
    maps = json.loads((CONTENT / "game" / "maps.json").read_text(encoding="utf-8"))
    for theme in (
        "flower-fruit-mountain",
        "water-curtain-cave",
        "three-star-cave",
        "water-dirty-cave",
        "dragon-palace",
        "underworld",
        "heaven-palace",
    ):
        if theme in maps["themes"]:
            assert maps["themes"][theme]["worldTiles"] == 1, theme
    cast = json.loads((CONTENT / "game" / "cast.json").read_text(encoding="utf-8"))
    result = build_map_layer(1, cast, maps)
    assert result["worldTiles"] == 1
    assert result["walkable"]["h"] >= 0.2, result["walkable"]
    baked = json.loads((CONTENT / "game" / "levels" / "ep1.json").read_text(encoding="utf-8"))
    assert ((baked.get("map") or {}).get("worldTiles") == 1)


def test_ep2_spawn_sits_on_cave_floor_not_the_dark_wall() -> None:
    maps = json.loads((CONTENT / "game" / "maps.json").read_text(encoding="utf-8"))
    cast = json.loads((CONTENT / "game" / "cast.json").read_text(encoding="utf-8"))
    result = build_map_layer(2, cast, maps)
    assert result["worldTiles"] == 1
    assert result["heroSpawn"]["y"] >= 0.5, result["heroSpawn"]
    assert result["heroSpawn"]["x"] >= 0.1, result["heroSpawn"]
    assert result["theme"] == "water-curtain-cave"


def test_ep4_and_ep5_spawn_on_lower_walking_ground() -> None:
    maps = json.loads((CONTENT / "game" / "maps.json").read_text(encoding="utf-8"))
    cast = json.loads((CONTENT / "game" / "cast.json").read_text(encoding="utf-8"))
    ep4 = build_map_layer(4, cast, maps)
    ep5 = build_map_layer(5, cast, maps)
    assert ep4["heroSpawn"]["y"] >= 0.5, ep4["heroSpawn"]
    assert ep5["heroSpawn"]["y"] >= 0.5, ep5["heroSpawn"]
