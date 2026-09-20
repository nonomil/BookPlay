"""Derive per-episode battle-level JSONs (降妖记小游戏) from existing data.

Reads content/dialogue_stories + content/storybooks + lesson_guides
(official quiz / intensive reader) + the hand-maintained
content/game/cast.json & taunts.json, and writes content/game/levels/ep{n}.json.

Generation is fully deterministic: no randomness, stable ordering, and the
same inputs always produce byte-identical output.

Usage:
    python -X utf8 prj/tools/build_game_levels.py --eps 1-7
    python -X utf8 prj/tools/build_game_levels.py --eps 1-108
    python -X utf8 prj/tools/build_game_levels.py --eps 1-108 --check
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "content"
# prj/data 与 content 互为 junction，引擎开发态经 ../data 直接可读；
# 仓库根的 data/ 是原始素材目录，不是运行时镜像，不要写入。
OUT_DIRS = (
    CONTENT / "game" / "levels",
)

SCHEMA_VERSION = 1
WORD_TARGET = 12
POOL_TARGET = 24
MIN_WORDS = 8
WAVE_COUNT = 2
MONSTERS_PER_WAVE = 4
BOSS_WORDS = 4
INTRO_LIMIT = 2
TERM_MAX_LEN = 14
WORLD_TILES = 4
DEFAULT_REGIONS = {
    "hero": 5,
    "waves": [5, 6],
    "npc": {"intro": 5, "quiz": 6},
    "boss": 7,
}

WARNINGS: list[str] = []


def warn(msg: str) -> None:
    WARNINGS.append(msg)
    print(f"  [warn] {msg}")


def load_json(path: Path):
    try:
        with path.open("r", encoding="utf-8") as fh:
            return json.load(fh)
    except FileNotFoundError:
        return None
    except (OSError, ValueError) as exc:
        warn(f"读取失败 {path}: {exc}")
        return None


def parse_eps(spec: str) -> list[int]:
    eps: list[int] = []
    for chunk in spec.split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        if "-" in chunk:
            lo, _, hi = chunk.partition("-")
            eps.extend(range(int(lo), int(hi) + 1))
        else:
            eps.append(int(chunk))
    return sorted(set(eps))


def collection_for_ep(collections: dict, ep: int) -> str:
    for item in collections.get("collections", []):
        frm = item.get("from")
        to = item.get("to")
        if isinstance(frm, int) and isinstance(to, int) and frm <= ep <= to:
            return str(item.get("id"))
    return ""


def node_terms(node: dict) -> set[str]:
    terms: set[str] = set()
    for vocab in node.get("vocab", []) or []:
        term = vocab.get("term")
        if term:
            terms.add(str(term).casefold())
    for word in node.get("page_words", []) or []:
        term = word.get("term")
        if term:
            terms.add(str(term).casefold())
    return terms


def ipa_for_term(dialogue: dict, term: str) -> str:
    folded = term.casefold()
    for node in dialogue.get("nodes", []) or []:
        for bucket in ("vocab", "page_words"):
            for entry in node.get(bucket, []) or []:
                if str(entry.get("term", "")).casefold() == folded and entry.get("ipa"):
                    return str(entry["ipa"])
    return ""


def lesson_guide_path(ep: int, name: str) -> Path:
    return CONTENT / "lesson_guides" / f"ep{ep:03d}" / name


def intensive_ipa_map(ep: int) -> dict[str, str]:
    raw = load_json(lesson_guide_path(ep, "intensive-reader.json"))
    out: dict[str, str] = {}
    if not isinstance(raw, dict):
        return out
    for item in raw.get("vocab") or []:
        if not isinstance(item, dict):
            continue
        term = str(item.get("term") or "").strip()
        ipa = str(item.get("ipa") or "").strip()
        if term and ipa:
            out[term.casefold()] = ipa
    return out


def first_sentence_choice(ep: int) -> dict | None:
    lesson = load_json(lesson_guide_path(ep, "lesson.json"))
    if not isinstance(lesson, dict):
        return None
    for card in lesson.get("cards") or []:
        if not isinstance(card, dict) or card.get("type") != "sentence_choice":
            continue
        payload = card.get("payload") if isinstance(card.get("payload"), dict) else {}
        choices = payload.get("choices") or []
        if isinstance(choices, list) and len(choices) >= 2 and payload.get("answer"):
            return card
    return None


def line_from_node(node: dict, line_id: str) -> dict:
    text_en = str(node.get("text_en") or "").strip()
    item = {
        "id": line_id,
        "sourceNodeId": str(node.get("node_id") or ""),
        "speaker": str(node.get("speaker") or "narrator"),
        "textEn": text_en,
        "textZh": str(node.get("text_zh") or "").strip(),
        "audioRef": f"sent_en:{text_en}" if text_en else "",
    }
    for src, dest in (("audio_start", "audioStart"), ("audio_end", "audioEnd")):
        if node.get(src) is None:
            continue
        try:
            item[dest] = float(node[src])
        except (TypeError, ValueError):
            pass
    return item


def node_by_id(dialogue: dict, node_id: str) -> dict | None:
    wanted = str(node_id or "")
    if not wanted:
        return None
    for node in dialogue.get("nodes") or []:
        if isinstance(node, dict) and str(node.get("node_id") or "") == wanted:
            return node
    return None


def derive_npc_dialogue(ep: int, dialogue: dict, words: list[dict]) -> dict | None:
    """Build intro/quiz lines from this episode's subtitles and official quiz."""
    nodes = [n for n in (dialogue.get("nodes") or []) if isinstance(n, dict) and str(n.get("text_en") or "").strip()]
    if not nodes:
        return None
    intro_nodes = nodes[:INTRO_LIMIT]
    result: dict = {
        "intro": {
            "id": f"ep{ep}-map-intro",
            "lines": [line_from_node(node, f"ep{ep}-map-intro-{idx}") for idx, node in enumerate(intro_nodes, 1)],
        }
    }
    card = first_sentence_choice(ep)
    quiz_node = None
    quiz_word = words[0] if words else None
    options: list[dict] = []
    question = {
        "id": f"ep{ep}-map-quiz-question",
        "textEn": f"What does {(quiz_word or {}).get('term', 'this word')} mean?",
        "textZh": f"{(quiz_word or {}).get('term', '这个词')} 的意思是什么？",
    }
    lesson_card_id = ""
    if card:
        payload = card.get("payload") or {}
        prompt = card.get("prompt") if isinstance(card.get("prompt"), dict) else {}
        answer = str(payload.get("answer") or "")
        lesson_card_id = str(card.get("card_id") or "")
        question = {
            "id": str(card.get("card_id") or f"ep{ep}-map-quiz-question"),
            "textEn": str(prompt.get("en") or question["textEn"]),
            "textZh": str(prompt.get("zh") or question["textZh"]),
        }
        for choice in payload.get("choices") or []:
            if not isinstance(choice, dict):
                continue
            cid = str(choice.get("id") or "")
            text_en = str(choice.get("en") or "").strip()
            text_zh = str(choice.get("zh") or "").strip()
            correct = cid == answer
            options.append({
                "id": cid,
                "textEn": text_en,
                "textZh": text_zh,
                "correct": correct,
                "feedback": (
                    f"对了。{text_zh or text_en}"
                    if correct
                    else "再想想，选和本集故事相符的那一项。"
                ),
            })
        evidence = payload.get("answer_evidence") or []
        if evidence and isinstance(evidence[0], dict):
            quiz_node = node_by_id(dialogue, str(evidence[0].get("node_id") or ""))
    if quiz_node is None:
        for word in words:
            term = str(word.get("term") or "")
            if len(term) < 3:
                continue
            needle = term.casefold()
            for node in nodes[len(intro_nodes):] or nodes:
                if needle in str(node.get("text_en") or "").casefold():
                    quiz_node = node
                    quiz_word = word
                    break
            if quiz_node:
                break
        if quiz_node is None:
            quiz_node = nodes[min(len(intro_nodes), len(nodes) - 1)]
    quiz_section: dict = {
        "id": f"ep{ep}-map-quiz",
        "lines": [line_from_node(quiz_node, f"ep{ep}-map-quiz-1")],
        "question": question,
    }
    if quiz_word:
        quiz_section["word"] = {
            "term": str(quiz_word.get("term") or ""),
            "zh": str(quiz_word.get("zh") or ""),
            "ipa": str(quiz_word.get("ipa") or ""),
        }
    if options:
        quiz_section["options"] = options
    if lesson_card_id:
        quiz_section["lessonCardId"] = lesson_card_id
    result["quiz"] = quiz_section
    return result


def select_words(dialogue: dict, ep: int, limit: int | None = None) -> list[dict]:
    """official_words 优先、page_words 补足；IPA 优先精读本。"""
    selected: list[dict] = []
    seen: set[str] = set()
    ipa_map = intensive_ipa_map(ep)
    cap = WORD_TARGET if limit is None else max(MIN_WORDS, int(limit))

    def take(term: str, zh: str) -> None:
        key = str(term).casefold()
        if not term or not zh or key in seen or len(term) > TERM_MAX_LEN:
            return
        seen.add(key)
        selected.append(
            {
                "term": str(term),
                "zh": str(zh).strip(),
                "ipa": ipa_for_term(dialogue, term) or ipa_map.get(key, ""),
            }
        )

    for word in dialogue.get("official_words", []) or []:
        if len(selected) >= cap:
            break
        take(str(word.get("term", "")), str(word.get("zh", "")))

    if len(selected) < cap:
        for node in dialogue.get("nodes", []) or []:
            for word in node.get("page_words", []) or []:
                if len(selected) >= cap:
                    break
                take(str(word.get("term", "")), str(word.get("zh", "")))
            if len(selected) >= cap:
                break

    if len(selected) < cap:
        vocab_pool = dialogue.get("vocab_pool", {}) or {}
        for term in sorted(vocab_pool):
            if len(selected) >= cap:
                break
            take(term, str(vocab_pool[term]))

    nodes = dialogue.get("nodes", []) or []
    for word in selected:
        folded = word["term"].casefold()
        word["illustration"] = None
        for node in nodes:
            if folded in node_terms(node) and node.get("illustration"):
                word["illustration"] = str(node["illustration"])
                break
        if word["illustration"] is None:
            for node in nodes:
                if node.get("illustration"):
                    word["illustration"] = str(node["illustration"])
                    break
    return selected


def split_waves(words: list[dict]) -> tuple[list[list[dict]], list[dict]]:
    """前段两波小怪、后段 Boss；词数不足时按比例压缩（保持确定性）。"""
    n = len(words)
    boss_n = min(BOSS_WORDS, max(2, n // 3))
    pool = words[: n - boss_n]
    boss = words[n - boss_n :]
    half = (len(pool) + 1) // 2
    waves = [pool[:half], pool[half:]]
    waves = [w for w in waves if w]
    return waves, boss


def build_intro(dialogue: dict) -> list[dict]:
    intro: list[dict] = []
    for node in dialogue.get("nodes", []) or []:
        if len(intro) >= INTRO_LIMIT:
            break
        if node.get("illustration") and node.get("text_en"):
            intro.append(
                {
                    "speaker": str(node.get("speaker", "narrator")),
                    "textEn": str(node["text_en"]),
                    "textZh": str(node.get("text_zh", "")),
                    "illustration": str(node["illustration"]),
                    "sourceNodeId": str(node.get("node_id") or ""),
                    "audioRef": f"sent_en:{node['text_en']}",
                }
            )
    return intro


def load_npc_dialogue(ep: int) -> dict | None:
    """Load the small, hand-authored NPC script for sample episodes.

    The file is deliberately separate from the large story source so a
    dialogue review can keep stable IDs, source-node evidence and an explicit
    audio reference without changing the lesson transcript.
    """
    raw = load_json(CONTENT / "game" / "dialogues" / f"ep{ep}.json")
    if not isinstance(raw, dict):
        return None
    result: dict = {}
    for role in ("intro", "quiz"):
        section = raw.get(role)
        if not isinstance(section, dict):
            continue
        lines: list[dict] = []
        for index, line in enumerate(section.get("lines", []) or []):
            if not isinstance(line, dict):
                continue
            text_en = str(line.get("textEn", line.get("text_en", "")) or "").strip()
            text_zh = str(line.get("textZh", line.get("text_zh", "")) or "").strip()
            if not text_en and not text_zh:
                continue
            item = {
                "id": str(line.get("id") or f"{role}-{index + 1}"),
                "sourceNodeId": str(line.get("sourceNodeId", line.get("source_node_id", "")) or ""),
                "speaker": str(line.get("speaker") or "narrator"),
                "textEn": text_en,
                "textZh": text_zh,
                "audioRef": str(line.get("audioRef", line.get("audio_ref", "")) or ""),
            }
            for target, aliases in (("audioStart", ("audioStart", "audio_start")), ("audioEnd", ("audioEnd", "audio_end"))):
                for alias in aliases:
                    if alias in line:
                        try:
                            item[target] = float(line[alias])
                        except (TypeError, ValueError):
                            pass
                        break
            lines.append(item)
        section_out = {"id": str(section.get("id") or f"{role}-dialogue"), "lines": lines}
        word = section.get("word")
        if isinstance(word, dict) and word.get("term") and word.get("zh"):
            section_out["word"] = {
                "term": str(word["term"]),
                "zh": str(word["zh"]),
                "ipa": str(word.get("ipa", "") or ""),
            }
        question = section.get("question")
        if isinstance(question, dict):
            section_out["question"] = {
                "id": str(question.get("id") or f"{role}-question"),
                "textEn": str(question.get("textEn", question.get("text_en", "")) or ""),
                "textZh": str(question.get("textZh", question.get("text_zh", "")) or ""),
            }
        options = section.get("options")
        if isinstance(options, list) and options:
            cleaned = []
            for opt in options:
                if not isinstance(opt, dict):
                    continue
                item = {
                    "id": str(opt.get("id") or ""),
                    "textEn": str(opt.get("textEn", opt.get("en", "")) or "").strip(),
                    "textZh": str(opt.get("textZh", opt.get("zh", "")) or "").strip(),
                    "correct": bool(opt.get("correct")),
                }
                if opt.get("feedback"):
                    item["feedback"] = str(opt.get("feedback"))
                cleaned.append(item)
            if cleaned:
                section_out["options"] = cleaned
        if section.get("lessonCardId"):
            section_out["lessonCardId"] = str(section.get("lessonCardId"))
        if lines or "word" in section_out or "question" in section_out:
            result[role] = section_out
    return result or None


def _safe_local(value: object, fallback: float = 0.5) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = fallback
    return max(0.0, min(1.0, number))


def _region_value(regions: dict, key: str, fallback: int) -> int:
    try:
        value = int(regions.get(key, fallback))
    except (TypeError, ValueError):
        value = fallback
    return max(0, min(WORLD_TILES * WORLD_TILES - 1, value))


def _world_point(point: dict | None, region: int) -> dict:
    """Expand an authored 0..1 point inside a map region to world coordinates."""
    point = point if isinstance(point, dict) else {}
    col = region % WORLD_TILES
    row = region // WORLD_TILES
    return {
        "x": round((col + _safe_local(point.get("x"))) / WORLD_TILES, 6),
        "y": round((row + _safe_local(point.get("y"))) / WORLD_TILES, 6),
    }


def _world_rect(rect: dict | None, region: int) -> dict:
    rect = rect if isinstance(rect, dict) else {}
    col = region % WORLD_TILES
    row = region // WORLD_TILES
    x = _safe_local(rect.get("x"), 0.0)
    y = _safe_local(rect.get("y"), 0.0)
    w = max(0.0, min(1.0 - x, float(rect.get("w", 1.0) or 0.0)))
    h = max(0.0, min(1.0 - y, float(rect.get("h", 1.0) or 0.0)))
    return {
        "x": round((col + x) / WORLD_TILES, 6),
        "y": round((row + y) / WORLD_TILES, 6),
        "w": round(w / WORLD_TILES, 6),
        "h": round(h / WORLD_TILES, 6),
    }


def _map_regions(layout: dict) -> dict:
    raw = layout.get("regions") if isinstance(layout.get("regions"), dict) else {}
    waves_raw = raw.get("waves") if isinstance(raw.get("waves"), list) else []
    waves = [_region_value({}, "wave", item) for item in waves_raw[:2]]
    while len(waves) < WAVE_COUNT:
        waves.append(DEFAULT_REGIONS["waves"][len(waves)])
    npc_raw = raw.get("npc") if isinstance(raw.get("npc"), dict) else {}
    return {
        "hero": _region_value(raw, "hero", DEFAULT_REGIONS["hero"]),
        "waves": waves,
        "npc": {
            "intro": _region_value(npc_raw, "intro", DEFAULT_REGIONS["npc"]["intro"]),
            "quiz": _region_value(npc_raw, "quiz", DEFAULT_REGIONS["npc"]["quiz"]),
        },
        "boss": _region_value(raw, "boss", DEFAULT_REGIONS["boss"]),
    }


def _walkable_local(authored: dict) -> dict:
    """Keep the authored ground band inside each tile (do not inflate it into the sky)."""
    x = _safe_local(authored.get("x"), 0.05)
    y = _safe_local(authored.get("y"), 0.32)
    try:
        w = float(authored.get("w", 0.9) or 0.9)
    except (TypeError, ValueError):
        w = 0.9
    try:
        h = float(authored.get("h", 0.58) or 0.58)
    except (TypeError, ValueError):
        h = 0.58
    w = max(0.2, min(1.0 - x, w))
    h = max(0.2, min(1.0 - y, h))
    return {"x": x, "y": y, "w": w, "h": h}


def _world_walkable(layout: dict, regions: dict) -> dict:
    """Return a world-space union plus exact per-region rectangles for clamping."""
    authored = layout.get("walkable") if isinstance(layout.get("walkable"), dict) else {}
    local = _walkable_local(authored)
    region_ids = [regions["hero"], regions["boss"], *regions["waves"], *regions["npc"].values()]
    rects = [_world_rect(local, region) for region in dict.fromkeys(region_ids)]
    min_x = min((r["x"] for r in rects), default=0.0)
    min_y = min((r["y"] for r in rects), default=0.0)
    max_x = max((r["x"] + r["w"] for r in rects), default=1.0)
    max_y = max((r["y"] + r["h"] for r in rects), default=1.0)
    return {
        "space": "world",
        "x": round(min_x, 6),
        "y": round(min_y, 6),
        "w": round(max_x - min_x, 6),
        "h": round(max_y - min_y, 6),
        "rects": rects,
    }


def _scene_point(point: dict | None, fallback_x: float = 0.5, fallback_y: float = 0.5) -> dict:
    point = point if isinstance(point, dict) else {}
    return {
        "x": round(_safe_local(point.get("x"), fallback_x), 6),
        "y": round(_safe_local(point.get("y"), fallback_y), 6),
    }


def _scene_walkable(layout: dict) -> dict:
    authored = layout.get("walkable") if isinstance(layout.get("walkable"), dict) else {}
    x = _safe_local(authored.get("x"), 0.05)
    y = _safe_local(authored.get("y"), 0.32)
    try:
        w = float(authored.get("w", 0.9) or 0.9)
    except (TypeError, ValueError):
        w = 0.9
    try:
        h = float(authored.get("h", 0.58) or 0.58)
    except (TypeError, ValueError):
        h = 0.58
    w = max(0.0, min(1.0 - x, w))
    h = max(0.0, min(1.0 - y, h))
    rect = {"x": round(x, 6), "y": round(y, 6), "w": round(w, 6), "h": round(h, 6)}
    return {"space": "world", **rect, "rects": [dict(rect)]}


def _layout_world_tiles(layout: dict) -> int:
    try:
        value = int(layout.get("worldTiles", WORLD_TILES))
    except (TypeError, ValueError):
        value = WORLD_TILES
    return 1 if value <= 1 else max(1, value)


def build_map_layer(ep: int, cast: dict, maps: dict | None) -> dict | None:
    """v2 地图层：主题布局 + 每集 NPC 分派。缺 maps.json 或 --no-v2 时为 None。"""
    if not isinstance(maps, dict):
        return None
    key = str(ep)
    themes = cast.get("themesByEp", {})
    theme = str(themes.get(key, "generic"))
    layout = (maps.get("themes", {}) or {}).get(theme) or (maps.get("themes", {}) or {}).get("default")
    if not isinstance(layout, dict):
        return None
    world_tiles = _layout_world_tiles(layout)
    npc_cfg = cast.get("npcByEp", {}).get(key) or {}
    minor_names = cast.get("minorNames", {})
    if world_tiles <= 1:
        npc_spots = []
        for spot in layout.get("npcSpots", []) or []:
            role = str(spot.get("role", "intro"))
            sprite = str(npc_cfg.get(role) or spot.get("sprite") or "imp")
            npc_spots.append(
                {
                    "role": role,
                    "sprite": sprite,
                    "nameZh": minor_names.get(sprite, sprite),
                    **_scene_point(spot),
                }
            )
        local_monsters = layout.get("monsterSpawns", []) or []
        wave_spawns = [
            [_scene_point(point) for point in local_monsters]
            for _ in range(WAVE_COUNT)
        ]
        local_orbs = layout.get("orbSpawns") or [
        {"x": 0.22, "y": 0.50},
        {"x": 0.32, "y": 0.62},
        {"x": 0.24, "y": 0.74},
        {"x": 0.36, "y": 0.48},
    ]
        orb_spawns = [
            [_scene_point(point) for point in local_orbs]
            for _ in range(WAVE_COUNT)
        ]
        return {
            "theme": theme,
            "coordinateSpace": "world-normalized",
            "worldTiles": world_tiles,
            "walkable": _scene_walkable(layout),
            "heroSpawn": _scene_point(layout.get("heroSpawn"), 0.1, 0.62),
            "monsterSpawns": wave_spawns[0],
            "waveSpawns": wave_spawns,
            "orbSpawns": orb_spawns,
            "npcSpots": npc_spots,
            "bossSpot": _scene_point(layout.get("bossSpot"), 0.9, 0.7),
        }
    regions = _map_regions(layout)
    npc_spots = []
    for spot in layout.get("npcSpots", []) or []:
        role = str(spot.get("role", "intro"))
        sprite = str(npc_cfg.get(role) or spot.get("sprite") or "imp")
        npc_spots.append(
            {
                "role": role,
                "sprite": sprite,
                "nameZh": minor_names.get(sprite, sprite),
                **_world_point(spot, regions["npc"].get(role, regions["npc"]["intro"])),
            }
        )
    local_monsters = layout.get("monsterSpawns", []) or []
    wave_spawns = [
        [_world_point(point, regions["waves"][wave_index]) for point in local_monsters]
        for wave_index in range(WAVE_COUNT)
    ]
    local_orbs = layout.get("orbSpawns") or [
        {"x": 0.22, "y": 0.50},
        {"x": 0.32, "y": 0.62},
        {"x": 0.24, "y": 0.74},
        {"x": 0.36, "y": 0.48},
    ]
    orb_spawns = [
        [_world_point(point, regions["waves"][wave_index]) for point in local_orbs]
        for wave_index in range(WAVE_COUNT)
    ]
    return {
        "theme": theme,
        "coordinateSpace": "world-normalized",
        "worldTiles": world_tiles,
        "regions": regions,
        "walkable": _world_walkable(layout, regions),
        "heroSpawn": _world_point(layout.get("heroSpawn"), regions["hero"]),
        # Keep monsterSpawns as the first-wave compatibility field. New code
        # consumes waveSpawns so authored points are not silently reused in the
        # wrong region.
        "monsterSpawns": wave_spawns[0],
        "waveSpawns": wave_spawns,
        "orbSpawns": orb_spawns,
        "npcSpots": npc_spots,
        "bossSpot": _world_point(layout.get("bossSpot"), regions["boss"]),
    }


def build_level(ep: int, cast: dict, taunts: dict, collections: dict, maps: dict | None = None, v2: bool = True) -> dict | None:
    dialogue = load_json(CONTENT / "dialogue_stories" / f"ep{ep}.json")
    storybook = load_json(CONTENT / "storybooks" / f"ep{ep}.json")
    if not isinstance(dialogue, dict) or not isinstance(storybook, dict):
        warn(f"ep{ep}: 缺 dialogue_stories/storybooks 数据，跳过")
        return None

    pool = select_words(dialogue, ep, limit=POOL_TARGET)
    words = pool[:WORD_TARGET]
    if len(words) < MIN_WORDS:
        warn(f"ep{ep}: 可用单词不足（{len(words)} < {MIN_WORDS}），跳过")
        return None

    waves, boss_words = split_waves(words)
    key = str(ep)
    hero = cast.get("heroDefault", {"id": "wukong", "nameZh": "孙悟空"})
    boss_cfg = cast.get("bossByEp", {}).get(key) or {
        "id": "imp",
        "mode": "villain",
        "nameZh": cast.get("minorNames", {}).get("imp", "小妖"),
    }
    minor_ids = cast.get("minorsByEp", {}).get(key) or ["imp"]
    minor_names = cast.get("minorNames", {})

    boss_id = str(boss_cfg.get("id", "imp"))
    taunt_refs = [
        f"{boss_id}.{idx}"
        for idx in range(1, 6)
        if boss_id in taunts and len(taunts[boss_id]) >= idx
    ][:3]

    nodes = dialogue.get("nodes", []) or []
    fallback_illustration = next(
        (str(n["illustration"]) for n in nodes if n.get("illustration")), None
    )

    title = storybook.get("title", {}) or {}
    level = {
        "schema_version": SCHEMA_VERSION,
        "ep": ep,
        "title": {
            "en": str(title.get("en", f"Episode {ep}")),
            "zh": str(title.get("zh", f"西游记 第{ep}集")),
        },
        "collection": collection_for_ep(collections, ep),
        "cast": {
            "hero": {"id": hero["id"], "nameZh": hero["nameZh"]},
            "boss": {
                "id": boss_id,
                "nameZh": str(boss_cfg.get("nameZh", boss_id)),
                "mode": str(boss_cfg.get("mode", "villain")),
                "sprite": boss_id,
            },
            "minors": [
                {
                    "id": minor_id,
                    "nameZh": minor_names.get(minor_id, minor_id),
                    "sprite": minor_id,
                }
                for minor_id in minor_ids
            ],
        },
        "background": {
            "theme": str(cast.get("themesByEp", {}).get(key, "generic")),
            "illustration": fallback_illustration,
        },
        "intro": build_intro(dialogue),
        "previewWords": words,
        "wordPool": pool,
        "waves": [
            {
                "monsters": [
                    {
                        "term": w["term"],
                        "zh": w["zh"],
                        "sprite": minor_ids[i % len(minor_ids)],
                    }
                    for i, w in enumerate(wave)
                ]
            }
            for wave in waves
        ],
        "boss": {
            "hpWords": [{"term": w["term"], "zh": w["zh"]} for w in boss_words],
            "taunts": taunt_refs,
        },
        "quizUrl": f"lesson.html?ep={ep}",
    }
    derived_npc = derive_npc_dialogue(ep, dialogue, words)
    npc_dialogue = load_npc_dialogue(ep) or derived_npc
    if npc_dialogue:
        quiz = npc_dialogue.get("quiz") if isinstance(npc_dialogue.get("quiz"), dict) else None
        derived_quiz = derived_npc.get("quiz") if derived_npc and isinstance(derived_npc.get("quiz"), dict) else None
        if quiz is not None and derived_quiz:
            if not quiz.get("options") and derived_quiz.get("options"):
                quiz["options"] = derived_quiz["options"]
            if not quiz.get("lessonCardId") and derived_quiz.get("lessonCardId"):
                quiz["lessonCardId"] = derived_quiz["lessonCardId"]
        level["npcDialogue"] = npc_dialogue
    if v2:
        map_layer = build_map_layer(ep, cast, maps)
        if map_layer is not None:
            level["map"] = map_layer
    return level


def render(level: dict) -> str:
    return json.dumps(level, ensure_ascii=False, indent=1) + "\n"


def write_level(ep: int, payload: str) -> list[Path]:
    written: list[Path] = []
    for out_dir in OUT_DIRS:
        out_dir.mkdir(parents=True, exist_ok=True)
        path = out_dir / f"ep{ep}.json"
        path.write_text(payload, encoding="utf-8", newline="\n")
        written.append(path)
    return written


def validate_level(level: dict, taunts: dict, ep: int) -> list[str]:
    problems: list[str] = []
    if level.get("schema_version") != SCHEMA_VERSION:
        problems.append("schema_version 不符")
    if level.get("ep") != ep:
        problems.append("ep 字段不符")
    waves = level.get("waves", [])
    if len(waves) != WAVE_COUNT:
        problems.append(f"波数 {len(waves)} != {WAVE_COUNT}")
    for idx, wave in enumerate(waves):
        monsters = wave.get("monsters", [])
        if not 3 <= len(monsters) <= 5:
            problems.append(f"wave{idx + 1} 怪物数 {len(monsters)} 不在 3-5")
        for monster in monsters:
            if not monster.get("term") or not monster.get("zh"):
                problems.append(f"wave{idx + 1} 存在空词")
    boss = level.get("boss", {})
    if not 2 <= len(boss.get("hpWords", [])) <= BOSS_WORDS:
        problems.append("boss.hpWords 数量异常")
    for ref in boss.get("taunts", []):
        role, _, idx = ref.rpartition(".")
        entries = taunts.get(role, [])
        if not entries or not 1 <= int(idx) <= len(entries):
            problems.append(f"台词引用缺失: {ref}")
    preview = level.get("previewWords", [])
    if not 1 <= len(preview) <= WORD_TARGET:
        problems.append("previewWords 数量异常")
    for entry in preview:
        illustration = entry.get("illustration")
        if illustration and not (CONTENT / illustration).exists():
            problems.append(f"插图缺失: {illustration}")
    for item in level.get("intro", []):
        if not item.get("textEn"):
            problems.append("intro 存在空句")
        illustration = item.get("illustration")
        if illustration and not (CONTENT / illustration).exists():
            problems.append(f"插图缺失: {illustration}")

    game_map = level.get("map")
    if game_map is not None:
        if not game_map.get("theme"):
            problems.append("map.theme 缺失")
        spawn_count = len(game_map.get("monsterSpawns", []) or [])
        if not 3 <= spawn_count <= 5:
            problems.append(f"map.monsterSpawns 数量 {spawn_count} 不在 3-5")
        npc_spots = game_map.get("npcSpots", []) or []
        if not any(s.get("role") == "intro" for s in npc_spots):
            problems.append("map.npcSpots 缺 intro 型 NPC")
        walkable = game_map.get("walkable") or {}
        walkable_rects = walkable.get("rects") if isinstance(walkable, dict) else None
        if not isinstance(walkable_rects, list) or not walkable_rects:
            walkable_rects = [walkable]

        def in_bounds(point) -> bool:
            if not isinstance(point, dict):
                return False
            x, y = point.get("x"), point.get("y")
            if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
                return False
            if not 0 <= x <= 1 or not 0 <= y <= 1:
                return False
            for rect in walkable_rects:
                if not isinstance(rect, dict):
                    continue
                wx, wy = rect.get("x", 0), rect.get("y", 0)
                ww, wh = rect.get("w", 1), rect.get("h", 1)
                if wx <= x <= wx + ww and wy <= y <= wy + wh:
                    return True
            return False

        for label, point in (
            [("heroSpawn", game_map.get("heroSpawn"))]
            + [("monsterSpawn", s) for s in game_map.get("monsterSpawns", []) or []]
            + [("npcSpot", s) for s in npc_spots]
            + [("bossSpot", game_map.get("bossSpot"))]
        ):
            if not in_bounds(point):
                problems.append(f"map.{label} 超出可行走区或坐标非法")
    return problems


def run(eps: list[int], check_only: bool, validate_only: bool = False, v2: bool = True) -> int:
    cast = load_json(CONTENT / "game" / "cast.json") or {}
    taunts = load_json(CONTENT / "game" / "taunts.json") or {}
    collections = load_json(CONTENT / "dialogue_stories" / "collections.json") or {}
    maps = load_json(CONTENT / "game" / "maps.json") if v2 else None
    failures = 0
    written = 0

    for ep in eps:
        level = build_level(ep, cast, taunts, collections, maps=maps, v2=v2)
        if level is None:
            failures += 1
            continue
        payload = render(level)

        problems = validate_level(level, taunts, ep)
        if render(json.loads(payload)) != payload:
            problems.append("渲染不确定（两次序列化不一致）")
        if problems:
            failures += 1
            print(f"ep{ep}: 校验失败")
            for problem in problems:
                print(f"  [fail] {problem}")
            continue

        existing = OUT_DIRS[0] / f"ep{ep}.json"
        if validate_only:
            print(f"ep{ep}: validate OK（{len(level['previewWords'])} 词 / boss {level['cast']['boss']['id']}）")
        elif check_only:
            if not existing.exists():
                print(f"ep{ep}: 缺少关卡文件（--check 需要先生成）")
                failures += 1
                continue
            if existing.read_text(encoding="utf-8") != payload:
                print(f"ep{ep}: 文件与重新生成结果不一致（数据或规则已变化）")
                failures += 1
                continue
            print(f"ep{ep}: check OK（{len(level['previewWords'])} 词 / boss {level['cast']['boss']['id']}）")
        else:
            for path in write_level(ep, payload):
                print(f"ep{ep}: 写出 {path.relative_to(ROOT)}")
            written += 1

    print(f"\n完成：{written} 集写出，{failures} 集失败，{len(WARNINGS)} 条警告")
    return 1 if failures else 0


def main() -> int:
    parser = argparse.ArgumentParser(description="生成降妖记每集关卡 JSON")
    parser.add_argument("--eps", required=True, help="集数范围，如 1-7 / 1-108 / 5")
    parser.add_argument("--check", action="store_true", help="只校验已生成文件，不写出")
    parser.add_argument("--validate-only", action="store_true", help="构建并校验，不写出、不要求已有文件")
    parser.add_argument("--no-v2", action="store_true", help="不写入 map 地图层（仅 v1 字段）")
    args = parser.parse_args()
    return run(parse_eps(args.eps), args.check, args.validate_only, v2=not args.no_v2)


if __name__ == "__main__":
    sys.exit(main())
