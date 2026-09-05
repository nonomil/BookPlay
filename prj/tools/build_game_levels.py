"""Derive per-episode battle-level JSONs (降妖记小游戏) from existing data.

Reads content/dialogue_stories + content/storybooks + the hand-maintained
content/game/cast.json & taunts.json, and writes content/game/levels/ep{n}.json
(mirrored into prj/data/game/levels and data/game/levels for dev/runtime).

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
MIN_WORDS = 8
WAVE_COUNT = 2
MONSTERS_PER_WAVE = 4
BOSS_WORDS = 4
INTRO_LIMIT = 2
TERM_MAX_LEN = 14

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


def select_words(dialogue: dict, ep: int) -> list[dict]:
    """official_words 优先、page_words 补足；顺序稳定、无随机。"""
    selected: list[dict] = []
    seen: set[str] = set()

    def take(term: str, zh: str) -> None:
        key = str(term).casefold()
        if not term or not zh or key in seen or len(term) > TERM_MAX_LEN:
            return
        seen.add(key)
        selected.append(
            {"term": str(term), "zh": str(zh).strip(), "ipa": ipa_for_term(dialogue, term)}
        )

    for word in dialogue.get("official_words", []) or []:
        if len(selected) >= WORD_TARGET:
            break
        take(str(word.get("term", "")), str(word.get("zh", "")))

    if len(selected) < WORD_TARGET:
        for node in dialogue.get("nodes", []) or []:
            for word in node.get("page_words", []) or []:
                if len(selected) >= WORD_TARGET:
                    break
                take(str(word.get("term", "")), str(word.get("zh", "")))
            if len(selected) >= WORD_TARGET:
                break

    if len(selected) < WORD_TARGET:
        vocab_pool = dialogue.get("vocab_pool", {}) or {}
        for term in sorted(vocab_pool):
            if len(selected) >= WORD_TARGET:
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
                }
            )
    return intro


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
    npc_cfg = cast.get("npcByEp", {}).get(key) or {}
    minor_names = cast.get("minorNames", {})
    npc_spots = []
    for spot in layout.get("npcSpots", []) or []:
        role = str(spot.get("role", "intro"))
        sprite = str(npc_cfg.get(role) or spot.get("sprite") or "imp")
        npc_spots.append(
            {
                "role": role,
                "sprite": sprite,
                "nameZh": minor_names.get(sprite, sprite),
                "x": spot.get("x"),
                "y": spot.get("y"),
            }
        )
    return {
        "theme": theme,
        "walkable": layout.get("walkable"),
        "heroSpawn": layout.get("heroSpawn"),
        "monsterSpawns": layout.get("monsterSpawns", []),
        "npcSpots": npc_spots,
        "bossSpot": layout.get("bossSpot"),
    }


def build_level(ep: int, cast: dict, taunts: dict, collections: dict, maps: dict | None = None, v2: bool = True) -> dict | None:
    dialogue = load_json(CONTENT / "dialogue_stories" / f"ep{ep}.json")
    storybook = load_json(CONTENT / "storybooks" / f"ep{ep}.json")
    if not isinstance(dialogue, dict) or not isinstance(storybook, dict):
        warn(f"ep{ep}: 缺 dialogue_stories/storybooks 数据，跳过")
        return None

    words = select_words(dialogue, ep)
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

        def in_bounds(point) -> bool:
            if not isinstance(point, dict):
                return False
            x, y = point.get("x"), point.get("y")
            if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
                return False
            if not 0 <= x <= 1 or not 0 <= y <= 1:
                return False
            wx, wy = walkable.get("x", 0), walkable.get("y", 0)
            ww, wh = walkable.get("w", 1), walkable.get("h", 1)
            return wx <= x <= wx + ww and wy <= y <= wy + wh

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
