"""Build the small, published voice index used by the JTTW game pages.

The source indexes under ``content/assets/adv_audio`` are shared with the
lesson reader.  This tool only publishes references that are actually used by
the selected level; it never copies media and never treats a TTS URL as an
offline clip.  ``inventory`` is read-only, ``build`` writes deterministic
``content/game/audio/epN.json`` files, and ``validate`` checks every published
reference after the data tree has been assembled.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "content"


def load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def norm(value: object) -> str:
    return " ".join(str(value or "").split()).strip()


def lookup(mapping: object, key: str):
    if not isinstance(mapping, dict) or not key:
        return None
    if key in mapping:
        return mapping[key]
    lower = key.casefold()
    for candidate, value in mapping.items():
        if norm(candidate).casefold() == lower:
            return value
    return None


def sentence_index(lang: str):
    name = "sent_zh_index.json" if lang == "zh" else "sent_en_index.json"
    return load_json(CONTENT / "assets" / "adv_audio" / name) or {}


def episode_word_index(ep: int):
    return load_json(CONTENT / "assets" / "adv_audio" / f"ep{ep}" / "index.json") or {}


def level_for(ep: int):
    return load_json(CONTENT / "game" / "levels" / f"ep{ep}.json") or {}


def _words(level: dict) -> list[dict]:
    result: list[dict] = []
    seen: set[str] = set()
    for word in level.get("previewWords", []) or []:
        if not isinstance(word, dict):
            continue
        term = norm(word.get("term"))
        if term and term.casefold() not in seen:
            seen.add(term.casefold())
            result.append(word)
    return result


def _dialogue_lines(level: dict, ep: int | None = None) -> Iterable[dict]:
    # The battle page opens with the level's story intro while the map page
    # uses authored NPC lines. Publish both through one auditable index so the
    # same offline player can speak either entry without inventing a clip.
    story = level.get("intro", []) if isinstance(level, dict) else []
    for index, line in enumerate(story if isinstance(story, list) else [], 1):
        if not isinstance(line, dict) or not (norm(line.get("textEn")) or norm(line.get("textZh"))):
            continue
        item = dict(line)
        item.setdefault("id", f"ep{int(ep) if ep is not None else 0}-story-intro-{index}")
        yield item
    dialogue = level.get("npcDialogue") if isinstance(level, dict) else None
    if not isinstance(dialogue, dict):
        return []
    for section in ("intro", "quiz"):
        value = dialogue.get(section)
        if not isinstance(value, dict):
            continue
        for line in value.get("lines", []) or []:
            if isinstance(line, dict) and (norm(line.get("textEn")) or norm(line.get("textZh"))):
                yield line


def _relative_exists(src: str) -> bool:
    return bool(src) and (CONTENT / src).is_file()


def build_entries(ep: int, *, root: Path = CONTENT) -> dict:
    """Return a deterministic published index for one episode."""
    level = load_json(root / "game" / "levels" / f"ep{ep}.json") or {}
    words_index = load_json(root / "assets" / "adv_audio" / f"ep{ep}" / "index.json") or {}
    shared_words_index = load_json(root / "assets" / "adv_audio" / "en_index.json") or {}
    shared_zh_index = load_json(root / "assets" / "adv_audio" / "zh_index.json") or {}
    sent_en = load_json(root / "assets" / "adv_audio" / "sent_en_index.json") or {}
    sent_zh = load_json(root / "assets" / "adv_audio" / "sent_zh_index.json") or {}
    entries: dict[str, dict] = {}

    for word in _words(level):
        term = norm(word.get("term"))
        # Prefer the episode voice; the shared published vocabulary index is
        # an explicit fallback for words introduced by a lesson before the
        # per-episode pack was generated.
        src = lookup(words_index, term) or lookup(shared_words_index, term)
        if src and (root / src).is_file():
            entries[f"word:{term}:en"] = {
                "text": term,
                "lang": "en-US",
                "kind": "static-existing",
                "src": str(src),
            }
        zh = norm(word.get("zh"))
        zh_src = lookup(shared_zh_index, zh)
        if zh and zh_src and (root / zh_src).is_file():
            entries[f"word:{zh}:zh"] = {
                "text": zh,
                "lang": "zh-CN",
                "kind": "static-existing",
                "src": str(zh_src),
            }

    for line in _dialogue_lines(level, ep):
        text_en = norm(line.get("textEn"))
        text_zh = norm(line.get("textZh"))
        ref = norm(line.get("audioRef"))
        explicit = ref.split(":", 1)[1] if ":" in ref else ""
        en_src = lookup(sent_en, explicit or text_en)
        if en_src and (root / en_src).is_file():
            item = {
                "text": text_en,
                "lang": "en-US",
                "kind": "static-existing",
                "src": str(en_src),
            }
            if line.get("sourceNodeId"):
                item["sourceNodeId"] = str(line["sourceNodeId"])
            entries[f"dialogue:{line.get('id', 'line')}:en"] = item
        zh_src = lookup(sent_zh, text_zh)
        if zh_src and (root / zh_src).is_file():
            item = {
                "text": text_zh,
                "lang": "zh-CN",
                "kind": "static-existing",
                "src": str(zh_src),
            }
            if line.get("sourceNodeId"):
                item["sourceNodeId"] = str(line["sourceNodeId"])
            entries[f"dialogue:{line.get('id', 'line')}:zh"] = item

    return {"version": 1, "episode": int(ep), "entries": {key: entries[key] for key in sorted(entries)}}


def inventory_episode(ep: int, *, root: Path = CONTENT) -> dict:
    level = load_json(root / "game" / "levels" / f"ep{ep}.json") or {}
    word_index = load_json(root / "assets" / "adv_audio" / f"ep{ep}" / "index.json") or {}
    shared_words_index = load_json(root / "assets" / "adv_audio" / "en_index.json") or {}
    shared_zh_index = load_json(root / "assets" / "adv_audio" / "zh_index.json") or {}
    sent_en = load_json(root / "assets" / "adv_audio" / "sent_en_index.json") or {}
    rows: list[dict] = []
    for word in _words(level):
        term = norm(word.get("term"))
        src = lookup(word_index, term) or lookup(shared_words_index, term)
        rows.append({"id": f"word:{term}:en", "text": term, "lang": "en-US", "status": "existing" if src and (root / src).is_file() else "synthesis-needed", "src": src})
        zh = norm(word.get("zh"))
        zh_src = lookup(shared_zh_index, zh)
        if zh:
            rows.append({"id": f"word:{zh}:zh", "text": zh, "lang": "zh-CN", "status": "existing" if zh_src and (root / zh_src).is_file() else "synthesis-needed", "src": zh_src})
    for line in _dialogue_lines(level, ep):
        text = norm(line.get("textEn"))
        ref = norm(line.get("audioRef"))
        candidate = ref.split(":", 1)[1] if ":" in ref else text
        src = lookup(sent_en, candidate)
        rows.append({"id": f"dialogue:{line.get('id', 'line')}:en", "text": text, "lang": "en-US", "sourceNodeId": line.get("sourceNodeId", ""), "status": "existing" if src and (root / src).is_file() else "extract-candidate" if line.get("sourceNodeId") else "synthesis-needed", "src": src})
    return {"version": 1, "episode": int(ep), "items": rows}


def validate_index(ep: int, *, root: Path = CONTENT, decode: bool = False) -> list[str]:
    path = root / "game" / "audio" / f"ep{ep}.json"
    payload = load_json(path)
    errors: list[str] = []
    if not isinstance(payload, dict) or not isinstance(payload.get("entries"), dict):
        return [f"ep{ep}: 缺少可解析的 game/audio 索引"]
    for key, item in payload["entries"].items():
        src = item.get("src") if isinstance(item, dict) else ""
        if not isinstance(src, str) or not (root / src).is_file():
            errors.append(f"ep{ep}: {key} -> 缺失 {src}")
            continue
        if decode:
            ffprobe = shutil.which("ffprobe")
            if not ffprobe:
                errors.append("ffprobe 不在 PATH，无法执行 --decode")
                break
            result = subprocess.run([ffprobe, "-v", "error", "-show_entries", "format=duration", "-of", "json", str(root / src)], capture_output=True, text=True)
            if result.returncode != 0:
                errors.append(f"ep{ep}: {key} 解码失败")
    return errors


def parse_eps(spec: str) -> list[int]:
    values: list[int] = []
    for chunk in str(spec).split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        if "-" in chunk:
            lo, _, hi = chunk.partition("-")
            values.extend(range(int(lo), int(hi) + 1))
        else:
            values.append(int(chunk))
    return sorted(set(values))


def run(command: str, eps: list[int], *, decode: bool = False) -> int:
    if command == "inventory":
        print(json.dumps({str(ep): inventory_episode(ep) for ep in eps}, ensure_ascii=False, indent=2))
        return 0
    if command == "build":
        out = CONTENT / "game" / "audio"
        out.mkdir(parents=True, exist_ok=True)
        for ep in eps:
            payload = build_entries(ep)
            (out / f"ep{ep}.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
            print(f"ep{ep}: 写出 {out / f'ep{ep}.json'} ({len(payload['entries'])} 条静态引用)")
        return 0
    failures = 0
    for ep in eps:
        errors = validate_index(ep, decode=decode)
        if errors:
            failures += 1
            print("\n".join(errors))
        else:
            print(f"ep{ep}: validate OK")
    return 1 if failures else 0


def main() -> int:
    parser = argparse.ArgumentParser(description="构建降妖记游戏语音索引")
    parser.add_argument("command", choices=("inventory", "build", "validate"))
    parser.add_argument("--eps", required=True, help="集数，如 1,5")
    parser.add_argument("--approved-only", action="store_true", help="兼容文档命令；只发布已有静态引用")
    parser.add_argument("--decode", action="store_true", help="validate 时用 ffprobe 检查音频")
    args = parser.parse_args()
    return run(args.command, parse_eps(args.eps), decode=args.decode)


if __name__ == "__main__":
    sys.exit(main())
