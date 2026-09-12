# -*- coding: utf-8 -*-
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from pack_android import (  # noqa: E402
    DATA_DIRS,
    ENGINE_FILES,
    _prune_jttw_only,
    available_for_profile,
)


def test_starter_available_includes_three_first_titles() -> None:
    available = available_for_profile("starter")
    assert available["jttw"]["episodes"] == [1]
    assert available["minecraft"]["books"] == [1]
    assert available["mikey-jj"]["books"] == [1]


def test_jttw_only_does_not_claim_storybooks() -> None:
    assert available_for_profile("jttw-only") == {
        "jttw": {"episodes": [1], "collections": ["c01"]},
    }


def test_jttw_engine_whitelist_contains_all_game_page_scripts() -> None:
    assert "game-core.js" in ENGINE_FILES
    assert "game-input.js" in ENGINE_FILES
    assert "game-audio.js" in ENGINE_FILES


def test_jttw_audio_indexes_are_registered_for_stage_and_builtin_packs() -> None:
    rels = {rel for rel, _ in DATA_DIRS}
    assert "game/audio" in rels
    assert "assets/game-fx" in rels


def test_jttw_split_motion_assets_are_in_builtin_closure() -> None:
    rels = {rel for rel, _ in DATA_DIRS}
    # 小怪目录随闭包复制；主角与 ep5 Boss 的四向三态文件逐个登记。
    assert "assets/game-sprites" in rels
    for character in ("wukong", "chaosdemon"):
        for direction in ("south", "west", "east", "north"):
            for suffix in ("idle.png", "walk.gif", "attack.gif"):
                rel = f"assets/generated/jttw-player-walkers/{character}/directions/{character}-{direction}-{suffix}"
                assert rel in rels


def test_stage_common_files_include_ep1_battle_fx() -> None:
    from pack_datapack import COMMON_FILES

    for rel in (
        "assets/game-fx/wukong/hint.png",
        "assets/game-fx/wukong/attack.png",
        "assets/game-fx/generic/hit-player.png",
        "assets/game-fx/monkey-minor/attack.png",
        "assets/generated/jttw-player-walkers/wukong/wukong-walk-01.png",
    ):
        assert rel in COMMON_FILES, rel


def test_jttw_only_prune_keeps_ep1_hero_three_state_assets() -> None:
    files = {
        "assets/generated/jttw-player-walkers/wukong/directions/wukong-south-idle.png": b"idle",
        "assets/generated/jttw-player-walkers/wukong/directions/wukong-east-walk.gif": b"walk",
        "assets/generated/jttw-player-walkers/wukong/directions/wukong-north-attack.gif": b"attack",
        "assets/generated/jttw-player-walkers/chaosdemon/directions/chaosdemon-south-idle.png": b"drop",
        "assets/generated/jttw-player-walkers/wukong/wukong-walk-01.png": b"png",
    }
    _prune_jttw_only(files)
    assert "assets/generated/jttw-player-walkers/wukong/directions/wukong-south-idle.png" in files
    assert "assets/generated/jttw-player-walkers/wukong/directions/wukong-east-walk.gif" in files
    assert "assets/generated/jttw-player-walkers/wukong/directions/wukong-north-attack.gif" in files
    assert "assets/generated/jttw-player-walkers/wukong/wukong-walk-01.png" in files
    assert "assets/generated/jttw-player-walkers/chaosdemon/directions/chaosdemon-south-idle.png" not in files
