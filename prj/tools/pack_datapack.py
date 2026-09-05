# -*- coding: utf-8 -*-
"""Pack playable content into a full or selective external data ZIP.

The historical no-option mode keeps the complete content pack. Passing
``--collections`` switches to a stage pack: only the selected Journey to the
West collections are included, while small shared runtime assets and the
published non-JTTW storybooks are collected by reference closure.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Iterator
import zipfile

from paths import CONTENT, REPO

INCLUDE_DIRS = (
    "dialogue_stories",
    "achievements",
    "companions",
    "rewards",
    "lesson_guides",
    "storybooks",
    "storybooks-minecraft",
    "storybook-collections",
    # 降妖记小游戏：关卡派生数据 + 精灵注册表 + 台词库（build_game_levels.py 产物）
    "game",
    "assets/video",
    "assets/adv_audio",
    "assets/map_audio",
    "assets/covers",
    "assets/collections",
    "assets/minecraft",
    "assets/cast",
    "assets/ui",
    "assets/achievements",
    "assets/companions",
    "assets/adv_frames",
    "assets/adv_video_frames",
    "assets/walker-gifs",
    # Published storybook character/reward art is runtime-ready PNG/JSON;
    # generation prompts live under docs/data and are not in this tree.
    "assets/generated/storybooks",
    # 路线图背景：collections.json 的 background 字段按合辑引用
    "assets/generated/map-backgrounds",
    # 降妖记小角色运行时 GIF 与 v2 战斗背景
    "assets/game-sprites",
    "assets/game-backgrounds",
    # Story-frame thumbnails are compact, text-free crops of each book's first
    # illustration. They keep sticker cards tied to the actual episode plot.
    "assets/generated/jttw-story-scenes-v1",
)
SKIP_PREFIXES = (
    "assets/lf_ep",
    "assets/gen/",
    "align/",
)
STORE_SUFFIXES = {".mp4", ".mp3", ".png", ".jpg", ".jpeg", ".webp", ".gif"}

SHARED_AUDIO_INDEXES = (
    "assets/adv_audio/en_index.json",
    "assets/adv_audio/zh_index.json",
    "assets/adv_audio/sent_en_index.json",
    "assets/adv_audio/sent_zh_index.json",
    "assets/adv_audio/quiz_en_index.json",
    "assets/adv_audio/quiz_zh_index.json",
)
PUBLISHED_SERIES = {
    "mikey-jj": "storybooks-mikey-jj",
    "minecraft": "storybooks-minecraft",
}
COMMON_DIRS = (
    "achievements",
    "companions",
    "rewards",
    "assets/achievements",
    "assets/companions",
    "assets/cast",
    "assets/ui",
    "assets/characters",
    "assets/backgrounds",
    "assets/map_audio",
)
COMMON_FILES = (
    # The library home screen and the JTTW map splash are outside the
    # episode-specific reference closure, so keep the public series cover in
    # every JTTW stage package.
    "assets/covers/journey-west-cover.png",
    "assets/minecraft/escape-from-the-nether/cover.webp",
    "assets/mikey-jj/zombie-school-adventure/pages/p01.webp",
    "assets/collections/mc01.jpg",
    # EP1 sticker-book covers use two authored story pages so the chapter
    # scene remains visibly tied to the plot even in a selective data pack.
    "assets/lf_ep1/pages/p03.png",
    "assets/lf_ep1/pages/p10.png",
    # P2 companion room art is kept to the clean, runtime-ready files only;
    # generation prompts and intermediate responses stay out of data packs.
    "assets/generated/wala-gamification/companion-room-bg-v1.png",
    "assets/generated/wala-gamification/clean/decor-parts/decor01_417x485.png",
    "assets/generated/wala-gamification/clean/decor-parts/decor02_336x495.png",
    "assets/generated/wala-gamification/clean/decor-parts/decor03_396x465.png",
    "assets/generated/wala-gamification/clean/decor-parts/decor04_411x452.png",
    "assets/generated/wala-gamification/clean/decor-parts/decor05_305x433.png",
    "assets/generated/wala-gamification/clean/decor-parts/decor06_534x383.png",
    "assets/generated/wala-gamification/clean/gear-parts/gear01_541x573.png",
    "assets/generated/wala-gamification/clean/gear-parts/gear02_454x525.png",
    "assets/generated/wala-gamification/clean/gear-parts/gear03_514x504.png",
    "assets/generated/wala-gamification/clean/gear-parts/gear04_569x480.png",
    # EP1 story-bound reward art: validated transparent outputs only.
    "assets/generated/jttw-ep001-story-rewards/transparent/jttw-ep001-stone-shard.png",
    "assets/generated/jttw-ep001-story-rewards/transparent/jttw-ep001-heaven-light.png",
    "assets/generated/jttw-ep001-story-rewards/transparent/jttw-ep001-peach-pip.png",
    "assets/generated/jttw-ep001-story-rewards/transparent/jttw-ep001-stream-splash.png",
    "assets/generated/jttw-ep001-story-rewards/transparent/jttw-ep001-waterfall-gate.png",
    "assets/generated/jttw-ep001-story-rewards/transparent/jttw-ep001-brave-ribbon.png",
    "assets/generated/jttw-ep001-story-rewards/transparent/jttw-ep001-water-curtain-token.png",
    # JTTW map route companion: only runtime-ready transparent atlas/strip and
    # fixed-size fallback frames enter stage packs; source prompts stay local.
    "assets/generated/jttw-route-companion/transparent/wukong-walk-atlas.png",
    "assets/generated/jttw-route-companion/transparent/wukong-walk-strip.png",
    "assets/generated/jttw-route-companion/transparent/wukong-walk-01.png",
    "assets/generated/jttw-route-companion/transparent/wukong-walk-02.png",
    "assets/generated/jttw-route-companion/transparent/wukong-walk-03.png",
    "assets/generated/jttw-route-companion/transparent/wukong-walk-04.png",
    "assets/generated/jttw-route-companion/transparent/wukong-walk-05.png",
    "assets/generated/jttw-route-companion/transparent/wukong-walk-06.png",
    "assets/generated/jttw-route-companion/transparent/wukong-walk-07.png",
    "assets/generated/jttw-route-companion/transparent/wukong-walk-08.png",
    # Mikey & JJ route companion: generated transparent four-direction atlas.
    "assets/generated/mikey-jj-route-companion/transparent/mikey-walk-atlas.png",
    # Episode-stable player avatar walkers. The GIFs are fixed-canvas,
    # transparent 8-frame loops; source sheets and prompts stay out of packs.
    "assets/generated/jttw-player-walkers/wukong/wukong-walk.gif",
    "assets/generated/jttw-player-walkers/tang/tang-walk.gif",
    "assets/generated/jttw-player-walkers/bajie/bajie-walk.gif",
    "assets/generated/jttw-player-walkers/shawujing/shawujing-walk.gif",
    "assets/generated/jttw-player-walkers/guanyin/guanyin-walk.gif",
    "assets/generated/jttw-player-walkers/redboy/redboy-walk.gif",
    "assets/generated/jttw-player-walkers/ironfan/ironfan-walk.gif",
    "assets/generated/jttw-player-walkers/bullking/bullking-walk.gif",
    "assets/generated/jttw-player-walkers/dragonking/dragonking-walk.gif",
    "assets/generated/jttw-player-walkers/whitedragonhorse/whitedragonhorse-walk.gif",
    "assets/generated/jttw-player-walkers/subodhi/subodhi-walk.gif",
    "assets/generated/jttw-player-walkers/jadeemperor/jadeemperor-walk.gif",
    "assets/generated/jttw-player-walkers/yellowwind/yellowwind-walk.gif",
    "assets/generated/jttw-player-walkers/whitebone/whitebone-walk.gif",
    "assets/generated/jttw-player-walkers/blackwind/blackwind-walk.gif",
    "assets/generated/jttw-player-walkers/zhenyuan/zhenyuan-walk.gif",
    "assets/generated/jttw-player-walkers/hundredflowers/hundredflowers-walk.gif",
    "assets/generated/jttw-player-walkers/goldenhorn/goldenhorn-walk.gif",
    "assets/generated/jttw-player-walkers/liondemon/liondemon-walk.gif",
    "assets/generated/jttw-player-walkers/tigerimmortal/tigerimmortal-walk.gif",
    "assets/generated/jttw-player-walkers/yellowbrows/yellowbrows-walk.gif",
    "assets/generated/jttw-player-walkers/powerdemon/powerdemon-walk.gif",
    "assets/generated/jttw-player-walkers/spiderdemon/spiderdemon-walk.gif",
    "assets/generated/jttw-player-walkers/centipededemon/centipededemon-walk.gif",
    # v1 story sticker/keepsake art: publish only validated PNGs; prompts,
    # API responses, split intermediates and WebP previews stay out of packs.
    "assets/generated/jttw-story-stickers-v1/transparent/stone.png",
    "assets/generated/jttw-story-stickers-v1/transparent/peach.png",
    "assets/generated/jttw-story-stickers-v1/transparent/waterfall.png",
    "assets/generated/jttw-story-stickers-v1/transparent/cloud.png",
    "assets/generated/jttw-story-stickers-v1/transparent/bell.png",
    "assets/generated/jttw-story-stickers-v1/transparent/dragon.png",
    "assets/generated/jttw-story-stickers-v1/transparent/saddle.png",
    "assets/generated/jttw-story-stickers-v1/transparent/gourd.png",
    "assets/generated/jttw-story-stickers-v1/transparent/tree.png",
    "assets/generated/jttw-story-stickers-v1/transparent/golden-ring.png",
    "assets/generated/jttw-story-stickers-v1/transparent/fan.png",
    "assets/generated/jttw-story-stickers-v1/transparent/river-fish.png",
    # v2 GPT-generated medal art: only the validated transparent PNGs enter
    # packs; source prompts, raw sheets and split intermediates stay local.
    "assets/generated/jttw-medals-v2/transparent/flower-fruit-mountain.png",
    "assets/generated/jttw-medals-v2/transparent/brave-heart.png",
    "assets/generated/jttw-medals-v2/transparent/journey-bell.png",
    "assets/generated/jttw-medals-v2/transparent/yellow-wind-shield.png",
    "assets/generated/jttw-medals-v2/transparent/truth-bone-flower.png",
    "assets/generated/jttw-medals-v2/transparent/clever-gourd.png",
    "assets/generated/jttw-medals-v2/transparent/fire-cloud-hero.png",
    "assets/generated/jttw-medals-v2/transparent/contest-scales.png",
    "assets/generated/jttw-medals-v2/transparent/steady-heart.png",
    "assets/generated/jttw-medals-v2/transparent/true-monkey-star.png",
    "assets/generated/jttw-medals-v2/transparent/illusion-lotus-lamp.png",
    "assets/generated/jttw-medals-v2/transparent/friendship-mountain.png",
    "assets/generated/jttw-medals-v2/transparent/spirit-mountain-scroll.png",
    "assets/generated/jttw-medals-v2/transparent/story-opener-door.png",
    "assets/generated/jttw-medals-v2/transparent/ten-tales-beads.png",
    "assets/generated/jttw-medals-v2/transparent/halfway-river.png",
    "assets/generated/jttw-medals-v2/transparent/seventy-two-cloud.png",
    "assets/generated/jttw-medals-v2/transparent/hundred-tale-compass.png",
    "assets/generated/jttw-medals-v2/transparent/journey-complete-crown.png",
)


def _posix(rel: Path | str) -> str:
    return (rel.as_posix() if isinstance(rel, Path) else str(rel)).lstrip("/").replace("\\", "/")


def included(rel: str) -> bool:
    """Return whether a path belongs to the historical full-pack allowlist."""
    rel = _posix(rel)
    # Explicitly listed runtime assets are intentional exceptions to broad
    # skip prefixes (EP1 sticker-book story pages are one such small pair).
    if rel in COMMON_FILES:
        return True
    if any(rel.startswith(p) for p in SKIP_PREFIXES):
        return False
    return any(rel == d or rel.startswith(d + "/") for d in INCLUDE_DIRS)


def iter_pack_files(root: Path) -> Iterator[tuple[str, Path]]:
    """Iterate the backwards-compatible full content allowlist."""
    root = root.resolve()
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        rel = _posix(path.relative_to(root))
        if included(rel):
            yield rel, path


def _csv(value: str | Iterable[str] | None) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [x.strip() for x in value.split(",") if x.strip()]
    return [str(x).strip() for x in value if str(x).strip()]


def parse_episode_ids(value: str | Iterable[int] | None) -> tuple[int, ...] | None:
    """Normalize an optional episode selector (``1`` or ``1,2``).

    ``None`` keeps the collection's complete episode range.  A selector is
    intentionally restricted to positive integers so a typo cannot silently
    create an empty or unrelated stage pack.
    """
    if value is None:
        return None
    tokens = _csv(value if isinstance(value, str) else [str(item) for item in value])
    if not tokens:
        raise ValueError("集号筛选不能为空，例如 --episodes 1")
    result: set[int] = set()
    for token in tokens:
        if not re.fullmatch(r"\d+", token):
            raise ValueError(f"无效集号: {token}；请使用正整数，例如 1 或 1,2")
        number = int(token)
        if number < 1:
            raise ValueError(f"无效集号: {token}；请使用正整数")
        result.add(number)
    return tuple(sorted(result))


def _load_json(path: Path) -> object | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return None


def parse_collection_ids(root: Path, collections: str | Iterable[str]) -> tuple[str, ...]:
    """Validate and return collection IDs in source index order."""
    requested = _csv(collections)
    if not requested:
        raise ValueError("至少选择一个合辑，例如 c01")
    index_path = root / "dialogue_stories" / "collections.json"
    data = _load_json(index_path)
    if not isinstance(data, dict) or not isinstance(data.get("collections"), list):
        raise ValueError(f"无法读取合辑索引: {index_path}")
    available = [str(item.get("id")) for item in data["collections"] if isinstance(item, dict) and item.get("id")]
    if requested == ["all"]:
        return tuple(available)
    unknown = [cid for cid in requested if cid not in available]
    if unknown:
        raise ValueError(f"未知合辑: {', '.join(unknown)}；可用值: {', '.join(available)}")
    wanted = set(requested)
    return tuple(cid for cid in available if cid in wanted)


def _normal_text(value: str) -> str:
    return " ".join(str(value).split()).strip().lower()


def _strings(value: object, out: set[str]) -> None:
    if isinstance(value, str):
        out.add(_normal_text(value))
    elif isinstance(value, dict):
        for item in value.values():
            _strings(item, out)
    elif isinstance(value, list):
        for item in value:
            _strings(item, out)


def _safe_rel(rel: str) -> str | None:
    clean = _posix(rel)
    if not clean or clean.startswith("../") or "/../" in f"/{clean}" or Path(clean).is_absolute():
        return None
    return clean


def _read_ref(root: Path, rel: str) -> Path | None:
    safe = _safe_rel(rel)
    if safe is None or not safe.startswith("assets/"):
        return None
    path = (root / safe).resolve()
    try:
        path.relative_to(root.resolve())
    except ValueError:
        return None
    return path if path.is_file() else None


def _add_file(root: Path, files: dict[str, Path | bytes], warnings: list[str], rel: str, *, required: bool = False) -> None:
    safe = _safe_rel(rel)
    if safe is None:
        warnings.append(f"拒绝不安全路径: {rel}")
        return
    path = root / safe
    if path.is_file():
        files[safe] = path
    elif required:
        warnings.append(f"缺失文件: {safe}")


def _add_dir(root: Path, files: dict[str, Path | bytes], warnings: list[str], rel_dir: str) -> None:
    safe = _safe_rel(rel_dir)
    if safe is None:
        warnings.append(f"拒绝不安全目录: {rel_dir}")
        return
    directory = root / safe
    if not directory.is_dir():
        warnings.append(f"缺失目录: {safe}")
        return
    for path in directory.rglob("*"):
        if not path.is_file():
            continue
        rel = _posix(path.relative_to(root))
        if any(rel.startswith(prefix) for prefix in SKIP_PREFIXES):
            continue
        files[rel] = path


def _collection_data(root: Path, ids: tuple[str, ...]) -> tuple[dict, dict[str, dict], list[str]]:
    path = root / "dialogue_stories" / "collections.json"
    data = _load_json(path)
    warnings: list[str] = []
    if not isinstance(data, dict) or not isinstance(data.get("collections"), list):
        raise ValueError(f"无法读取合辑索引: {path}")
    by_id = {str(item.get("id")): item for item in data["collections"] if isinstance(item, dict) and item.get("id")}
    filtered = dict(data)
    filtered["collections"] = [by_id[cid] for cid in ids]
    return filtered, by_id, warnings


def _add_shared_audio(root: Path, files: dict[str, Path | bytes], strings: set[str], warnings: list[str]) -> None:
    for index_rel in SHARED_AUDIO_INDEXES:
        index_path = root / index_rel
        data = _load_json(index_path)
        _add_file(root, files, warnings, index_rel)
        if not isinstance(data, dict):
            continue
        for key, target in data.items():
            if not isinstance(target, str) or _normal_text(key) not in strings:
                continue
            target_path = _read_ref(root, target)
            if target_path is None:
                warnings.append(f"索引引用缺失: {target}")
                continue
            files[_posix(target_path.relative_to(root))] = target_path


def _published_ids(root: Path, series: str) -> tuple[str, ...]:
    if series not in PUBLISHED_SERIES:
        raise ValueError(f"未知绘本系列: {series}")
    catalog_rel = f"{PUBLISHED_SERIES[series]}/catalog.json"
    data = _load_json(root / catalog_rel)
    if not isinstance(data, dict) or not isinstance(data.get("episodes"), list):
        return ()
    ids = []
    for item in data["episodes"]:
        if not isinstance(item, dict):
            continue
        value = item.get("book", item.get("episode"))
        if value is not None:
            ids.append(str(value))
    return tuple(ids)


def _selected_book_ids(
    series: str,
    ids: tuple[str, ...],
    published_books: dict[str, Iterable[int]] | None,
) -> tuple[str, ...]:
    """Return the published book ids to include for one series.

    ``published_books`` is intentionally optional so the historical stage-pack
    contract (all books for ``--published all``) remains unchanged.  Android's
    built-in starter bundle passes a per-series allowlist here to keep the APK
    small while preserving the complete catalog for future import prompts.
    """
    if not published_books or series not in published_books:
        return ids
    wanted = {int(value) for value in published_books[series]}
    return tuple(book_id for book_id in ids if _book_number(book_id) in wanted)


def _book_number(value: str) -> int | None:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def _add_published(
    root: Path,
    files: dict[str, Path | bytes],
    warnings: list[str],
    published: str,
    *,
    published_books: dict[str, Iterable[int]] | None = None,
) -> list[str]:
    names = _csv(published)
    if names == ["none"]:
        return []
    if names == ["all"]:
        names = list(PUBLISHED_SERIES)
    unknown = [name for name in names if name not in PUBLISHED_SERIES]
    if unknown:
        raise ValueError(f"未知绘本系列: {', '.join(unknown)}；可用值: none, mikey-jj, minecraft, all")
    selected: list[str] = []
    for series in PUBLISHED_SERIES:
        if series not in names:
            continue
        folder = PUBLISHED_SERIES[series]
        catalog_rel = f"{folder}/catalog.json"
        catalog = _load_json(root / catalog_rel)
        _add_file(root, files, warnings, catalog_rel, required=True)
        all_ids = _published_ids(root, series)
        ids = _selected_book_ids(series, all_ids, published_books)
        for book_id in ids:
            book_rel = f"{folder}/book{book_id}.json"
            book = _load_json(root / book_rel)
            _add_file(root, files, warnings, book_rel, required=True)
            if book is None:
                continue
            refs: set[str] = set()
            _collect_asset_strings(book, refs)
            for ref in refs:
                target = _read_ref(root, ref)
                if target is None:
                    warnings.append(f"绘本引用缺失: {ref}")
                else:
                    files[_posix(target.relative_to(root))] = target
        # Mikey & JJ vocabulary is loaded by the reader at runtime rather
        # than referenced from each book JSON. Include its manifest and both
        # Edge-TTS language directories in stage packs so point-read works
        # offline (the book-level reference closure cannot discover them).
        if series == "mikey-jj":
            vocab_dir = root / "assets" / "mikey-jj" / "vocab"
            if vocab_dir.is_dir():
                _add_dir(root, files, warnings, "assets/mikey-jj/vocab")
            quiz_dir = root / "assets" / "mikey-jj" / "quiz"
            if quiz_dir.is_dir():
                _add_dir(root, files, warnings, "assets/mikey-jj/quiz")
            # The full pack allowlist contains this directory, but selective
            # stage packs use reference closure.  Keep the CSS quiz fallback
            # background with the published Mikey & JJ books so review/quiz
            # screens do not become a flat color offline.
            ui_dir = root / "assets" / "mikey-jj" / "ui"
            if ui_dir.is_dir():
                _add_dir(root, files, warnings, "assets/mikey-jj/ui")
            _add_file(root, files, warnings, "storybooks-mikey-jj/collections.json", required=True)
        if series == "minecraft":
            vocab_dir = root / "assets" / "minecraft" / "vocab"
            if vocab_dir.is_dir():
                _add_dir(root, files, warnings, "assets/minecraft/vocab")
            quiz_dir = root / "assets" / "minecraft" / "quiz"
            if quiz_dir.is_dir():
                _add_dir(root, files, warnings, "assets/minecraft/quiz")
            # CSS fallback art is not referenced by book JSON, therefore it
            # must be closed explicitly for selective packs as well.
            ui_dir = root / "assets" / "minecraft" / "ui"
            if ui_dir.is_dir():
                _add_dir(root, files, warnings, "assets/minecraft/ui")
            _add_file(root, files, warnings, "storybooks-minecraft/collections.json", required=True)
        # Unified storybook completion cards load the shared reward catalog and
        # per-book visual manifests at runtime; these are not discoverable from
        # the book JSON reference closure, so include them explicitly.
        # The pack root is already `content/`; use the runtime-relative path
        # here so published storybook completion metadata is included without
        # a spurious `data/rewards/storybooks.json` warning.
        _add_file(root, files, warnings, "rewards/storybooks.json", required=True)
        _add_file(root, files, warnings, "storybook-collections/catalog.json", required=True)
        for book_id in ids:
            generated_rel = f"assets/generated/storybooks/{series}/ep{int(book_id):03d}"
            if (root / generated_rel).is_dir():
                _add_dir(root, files, warnings, generated_rel)
        # Character/action and sticker/badge pilot art is shared by all
        # published books in the selected series, so it is not discoverable
        # from a single book JSON reference closure.
        for generated_rel in (
            f"assets/generated/storybooks/{series}/characters",
            f"assets/generated/storybooks/{series}/rewards",
        ):
            if (root / generated_rel).is_dir():
                _add_dir(root, files, warnings, generated_rel)
        selected.append(series)
    return selected


def _add_stage_catalog(
    root: Path,
    files: dict[str, Path | bytes],
    warnings: list[str],
    episode_ids: set[int],
) -> None:
    """Add the map/list catalog limited to the selected episode range.

    ``map.js`` and ``shelf.js`` read this catalog for bilingual titles and
    episode cover paths.  The full-pack iterator still keeps the historical
    complete catalog; only selective stage packs need the filtered variant.
    """
    rel = "storybooks/catalog.json"
    path = root / rel
    if not path.is_file():
        warnings.append(f"缺失文件: {rel}")
        return
    data = _load_json(path)
    if not isinstance(data, dict) or not isinstance(data.get("episodes"), list):
        warnings.append(f"无效目录: {rel}")
        return
    selected: list[dict] = []
    for item in data["episodes"]:
        if not isinstance(item, dict):
            continue
        value = item.get("episode", item.get("book"))
        try:
            number = int(value)
        except (TypeError, ValueError):
            continue
        if number in episode_ids:
            selected.append(item)
            cover = item.get("cover")
            if isinstance(cover, str) and cover.replace("\\", "/").startswith("assets/"):
                _add_file(root, files, warnings, cover)
    filtered = dict(data)
    filtered["episodes"] = selected
    if "count" in filtered:
        filtered["count"] = len(selected)
    files[rel] = json.dumps(filtered, ensure_ascii=False, indent=2).encode("utf-8")


def _collect_asset_strings(value: object, out: set[str]) -> None:
    if isinstance(value, str) and value.replace("\\", "/").startswith("assets/"):
        out.add(value.replace("\\", "/"))
    elif isinstance(value, dict):
        for item in value.values():
            _collect_asset_strings(item, out)
    elif isinstance(value, list):
        for item in value:
            _collect_asset_strings(item, out)


def _build_stage_pack(
    root: Path,
    *,
    collections: str | Iterable[str] = "c01",
    published: str = "all",
    episodes: str | Iterable[int] | None = None,
    published_books: dict[str, Iterable[int]] | None = None,
) -> tuple[dict[str, Path | bytes], tuple[str, ...], list[int], list[str], list[str]]:
    """Build a selective file map and metadata before writing the ZIP."""
    root = root.resolve()
    ids = parse_collection_ids(root, collections)
    selected_episodes = parse_episode_ids(episodes)
    filtered, by_id, warnings = _collection_data(root, ids)
    files: dict[str, Path | bytes] = {}
    strings: set[str] = set()

    for rel_dir in COMMON_DIRS:
        _add_dir(root, files, warnings, rel_dir)
    for rel in COMMON_FILES:
        _add_file(root, files, warnings, rel)
    for rel in ("dialogue_stories/index.json", "lesson_guides/official-quiz-bank.json"):
        _add_file(root, files, warnings, rel)
    files["dialogue_stories/collections.json"] = json.dumps(filtered, ensure_ascii=False, indent=2).encode("utf-8")

    episode_ids: set[int] = set()
    for cid in ids:
        item = by_id[cid]
        first, last = int(item["from"]), int(item["to"])
        episode_ids.update(range(first, last + 1))
        drill_rel = f"dialogue_stories/drill/{cid}.json"
        drill_data = _load_json(root / drill_rel)
        if selected_episodes is None:
            _add_file(root, files, warnings, drill_rel, required=True)
            _strings(drill_data, strings)
        elif isinstance(drill_data, dict) and isinstance(drill_data.get("episodes"), list):
            # A one-episode pack must not ship a drill file that advertises
            # questions for episodes whose video/assets are intentionally
            # absent.  Keep the original schema and metadata, only narrowing
            # the episode list to the selected IDs.
            narrowed = dict(drill_data)
            narrowed_episodes = []
            for episode in drill_data["episodes"]:
                if not isinstance(episode, dict):
                    continue
                try:
                    episode_number = int(episode.get("episode", -1))
                except (TypeError, ValueError):
                    continue
                if episode_number in selected_episodes:
                    narrowed_episodes.append(episode)
            narrowed["episodes"] = narrowed_episodes
            files[drill_rel] = json.dumps(narrowed, ensure_ascii=False, indent=2).encode("utf-8")
            _strings(narrowed, strings)
        else:
            _add_file(root, files, warnings, drill_rel, required=True)
            _strings(drill_data, strings)
        background = item.get("background")
        if isinstance(background, str):
            _add_file(root, files, warnings, background, required=True)

    if selected_episodes is not None:
        invalid = sorted(set(selected_episodes) - episode_ids)
        if invalid:
            raise ValueError(f"集号不属于所选合辑: {', '.join(str(item) for item in invalid)}")
        episode_ids = set(selected_episodes)

    for ep in sorted(episode_ids):
        ep_json_rel = f"dialogue_stories/ep{ep}.json"
        ep_json = _load_json(root / ep_json_rel)
        _add_file(root, files, warnings, ep_json_rel, required=True)
        _strings(ep_json, strings)
        refs: set[str] = set()
        _collect_asset_strings(ep_json, refs)
        for ref in refs:
            if ref.startswith("assets/lf_ep"):
                # These are legacy full-storybook MP3s. Stage lessons use the
                # 960x540 video and adv_audio clips instead; excluding them is
                # the main reason a c01 pack stays small.
                continue
            target = _read_ref(root, ref)
            if target is not None:
                files[_posix(target.relative_to(root))] = target
        _add_dir(root, files, warnings, f"lesson_guides/ep{ep:03d}")
        _add_dir(root, files, warnings, f"assets/adv_frames/ep{ep}")
        _add_dir(root, files, warnings, f"assets/adv_audio/ep{ep}")
        _add_file(root, files, warnings, f"assets/generated/jttw-story-scenes-v1/ep{ep:03d}.jpg", required=True)
        _add_file(root, files, warnings, f"assets/video/ep{ep}.mp4", required=True)
        _add_file(root, files, warnings, f"assets/covers/ep{ep:03d}.jpg")

    _add_stage_catalog(root, files, warnings, episode_ids)
    published_ids = _add_published(root, files, warnings, published, published_books=published_books)
    _add_shared_audio(root, files, strings, warnings)
    return files, ids, sorted(episode_ids), published_ids, warnings


def iter_stage_pack_files(
    root: Path,
    *,
    collections: str | Iterable[str] = "c01",
    published: str = "all",
    episodes: str | Iterable[int] | None = None,
    published_books: dict[str, Iterable[int]] | None = None,
) -> Iterator[tuple[str, Path | bytes]]:
    """Yield files for a selective stage pack."""
    files, _ids, _episodes, _published, _warnings = _build_stage_pack(
        root,
        collections=collections,
        published=published,
        episodes=episodes,
        published_books=published_books,
    )
    for rel, src in files.items():
        yield rel, src


def _entry_size(source: Path | bytes) -> int:
    return len(source) if isinstance(source, bytes) else source.stat().st_size


def _entry_sha256(source: Path | bytes) -> str:
    h = hashlib.sha256()
    if isinstance(source, bytes):
        h.update(source)
        return h.hexdigest()
    with source.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def _manifest(
    entries: list[tuple[str, Path | bytes]],
    *,
    ids: tuple[str, ...],
    episodes: list[int],
    published_ids: list[str],
    warnings: list[str],
    version: str,
    pack_id: str,
) -> dict:
    files = [
        {"path": rel, "size": _entry_size(src), "sha256": _entry_sha256(src)}
        for rel, src in sorted(entries, key=lambda item: item[0])
    ]
    return {
        "schema_version": 1,
        "pack_id": pack_id,
        "version": version,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "profile": "stage",
        "collections": list(ids),
        "episodes": episodes,
        "published_books": published_ids,
        "file_count": len(files),
        "total_bytes": sum(item["size"] for item in files),
        "files": files,
        "warnings": warnings,
    }


def write_datapack_zip(
    root: Path,
    dest: Path,
    *,
    collections: str | Iterable[str] | None = None,
    published: str | None = None,
    episodes: str | Iterable[int] | None = None,
    published_books: dict[str, Iterable[int]] | None = None,
    version: str = "dev",
) -> Path:
    """Write a ZIP; optional ``collections`` enables selective stage mode."""
    root = root.resolve()
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".partial")
    if tmp.exists():
        tmp.unlink()
    stage = collections is not None or published is not None
    if stage:
        files, ids, selected_episode_ids, published_ids, warnings = _build_stage_pack(
            root,
            collections=collections or "c01",
            published=published or "all",
            episodes=episodes,
            published_books=published_books,
        )
        episode_suffix = "-ep" + "-".join(str(item) for item in selected_episode_ids) if episodes else ""
        entries = list(files.items())
        manifest = _manifest(
            entries,
            ids=ids,
            episodes=selected_episode_ids,
            published_ids=published_ids,
            warnings=warnings,
            version=version,
            pack_id="jttw-" + "-".join(ids) + episode_suffix,
        )
    else:
        entries = list(iter_pack_files(root))
        manifest = None

    count = 0
    with zipfile.ZipFile(tmp, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=1) as zf:
        for rel, src in entries:
            suffix = Path(rel).suffix.lower()
            method = zipfile.ZIP_STORED if suffix in STORE_SUFFIXES else zipfile.ZIP_DEFLATED
            if isinstance(src, bytes):
                zf.writestr(rel, src, compress_type=method)
            else:
                zf.write(src, rel, compress_type=method)
            count += 1
            if count % 500 == 0:
                print(f"  packed {count} {rel}", flush=True)
        if manifest is not None:
            zf.writestr("pack-manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8"), compress_type=zipfile.ZIP_DEFLATED)
    tmp.replace(dest)
    print(f"wrote {dest} files={count} size={dest.stat().st_size / 1024 / 1024:.1f}MB", flush=True)
    return dest


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=str(CONTENT), help="content folder")
    ap.add_argument("--out", default=str(REPO / "豆豆龙数据包.zip"), help="output zip path")
    ap.add_argument("--collections", help="selective stage mode, e.g. c01 or c01,c02")
    ap.add_argument("--episodes", help="optional episode filter inside selected collections, e.g. 1 or 1,2")
    ap.add_argument("--published", default=None, help="stage books: none, mikey-jj, minecraft, all")
    ap.add_argument("--version", default="dev", help="content package version written to manifest")
    ap.add_argument("--lesson-quality-report", help="write a JSON lesson quality audit before packing")
    ap.add_argument("--strict-lesson-quality", action="store_true", help="fail before packing when lesson quality has blocking issues")
    args = ap.parse_args()
    if args.lesson_quality_report or args.strict_lesson_quality:
        from validate_lesson_quality import audit_root

        quality = audit_root(Path(args.src))
        if args.lesson_quality_report:
            report = Path(args.lesson_quality_report)
            report.parent.mkdir(parents=True, exist_ok=True)
            report.write_text(json.dumps(quality, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        if args.strict_lesson_quality:
            blocking = {"missing_term", "missing_gloss", "dialogue_pollution", "no_usable_puzzle", "invalid_card"}
            found = sorted(blocking.intersection(quality.get("issue_counts", {})))
            if found:
                raise SystemExit("lesson quality gate failed: " + ", ".join(found))
    write_datapack_zip(
        Path(args.src),
        Path(args.out),
        collections=args.collections,
        published=args.published,
        episodes=args.episodes,
        version=args.version,
    )


if __name__ == "__main__":
    main()
