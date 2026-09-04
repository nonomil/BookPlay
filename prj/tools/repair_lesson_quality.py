# -*- coding: utf-8 -*-
"""Repair noisy word-card glosses while leaving story text untouched.

The lesson guides are derived data.  A small number of extraction records put
dialogue fragments into ``payload.def``/``prompt.zh``.  This tool replaces
those fields with a short, learner-facing gloss sourced from the matching
story glossary (or a conservative fallback for common function words).
It is deterministic and supports a dry-run so pack builds can inspect the
planned edits before writing.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

try:  # package import in tests; direct script execution in build tooling
    from .validate_lesson_quality import MAX_GLOSS_CHARS, _word_issues, audit_root
except ImportError:  # pragma: no cover - exercised by the CLI invocation
    from validate_lesson_quality import MAX_GLOSS_CHARS, _word_issues, audit_root

POLLUTION_MARKERS = ("。\u201d", "！\u201d", "召集天兵", "找一份工作", "给我把孙悟空抓来")


# Terms which do not occur in the authored story glossary often enough to
# provide a clean candidate.  These are intentionally short and neutral;
# they are used only when no cleaner in-repo value exists.
FALLBACK_GLOSSES = {
    "call": "打电话；呼喊",
    "certain": "某个；确定的",
    "cheer": "欢呼；使高兴",
    "direct": "直接的；指导",
    "do": "做；干",
    "far": "远的；遥远地",
    "finger": "手指",
    "from": "从；来自",
    "get": "得到；变得",
    "have": "有；经历",
    "he": "他",
    "in": "在里面；进入",
    "keep": "保持；保留",
    "laugh": "笑；笑声",
    "must": "必须；一定",
    "near": "附近的",
    "on": "在……上；进行中",
    "order": "顺序；命令",
    "pull": "拉；拖",
    "serve": "服务；提供",
    "slow": "慢的；缓慢地",
    "sound": "声音；听起来",
    "take": "拿；带走",
    "that": "那个；那",
    "wear": "穿；戴",
    "with": "和……一起",
    "your": "你的；你们的",
}

# A few source records are short enough to pass a length check but are still
# not suitable learner glosses.  They are OCR artefacts (for example ``in``
# was once mapped to “成堆地”) or overly broad dictionary entries whose first
# sense is not the one used by the story.  Keep these overrides small and
# explicit so the repair remains auditable.
CANONICAL_GLOSSES = {
    "above": "在上方",
    "around": "在周围",
    "between": "在两者之间",
    "block": "挡住；阻塞",
    "call": "打电话；呼喊",
    "cheer": "欢呼；喝彩",
    "certain": "某个；确定的",
    "change": "改变；变化",
    "clear": "清除；清楚",
    "close": "靠近的；关闭",
    "in": "在里面；进入",
    "keep": "保持；保留",
    "near": "在附近",
    "order": "命令；顺序",
    "over": "在上方；超过",
    "forward": "向前",
    "from": "从；来自",
    "head": "前往；朝向",
    "name": "名字；命名",
    "on": "在……上；进行中",
    "serve": "服务；提供",
    "sound": "声音；听起来",
    "surprise": "惊讶；使吃惊",
    "take": "拿；带走",
    "travel": "旅行；游历",
    "wide": "宽的；充分地",
}

_POS_RE = re.compile(
    r"(?<!\w)(?:v\.-link\.|(?:aux\s+)?v(?:t|i)?\.|adj\./(?:adv|n)\.|adj\.|adv\.|n\.|prep\.|pron\.|conj\.|num\.|interj\.)"
)


def _text(value: Any) -> str:
    return str(value or "").replace("\n", " ").strip()


def _is_clean(value: str) -> bool:
    if not value or len(value) > MAX_GLOSS_CHARS:
        return False
    return not any(marker in value for marker in ("。”", "！”", "召集天兵", "找一份工作", "给我把孙悟空抓来")) and not any(
        quote in value for quote in ("“", "”", '"')
    )


def _is_learner_gloss(value: Any) -> bool:
    """Stricter check used for source selection (not the audit contract)."""
    text = _text(value)
    if not _is_clean(text):
        return False
    if _POS_RE.search(text) or re.search(r"[。！？]", text):
        return False
    # English fragments and OCR tails are not learner-facing Chinese glosses.
    if re.search(r"[A-Za-z]{2,}", text):
        return False
    return bool(re.search(r"[\u3400-\u9fff]", text))


def _extract_local_gloss(value: Any) -> str:
    """Extract the first short dictionary definition from a card-local value.

    Intensive-reader definitions contain POS labels followed by one or more
    senses, and the same extraction occasionally appends a story sentence.
    This parser deliberately prefers a conservative first sense and returns
    an empty string when the result still looks like prose.
    """
    text = _text(value)
    if not text:
        return ""
    # Remove quoted dialogue and the common unquoted tail left by PDF OCR.
    text = re.sub(r"\s+", " ", text).strip()

    # Start at the first part-of-speech label.  If OCR left a fragment before
    # the dictionary (e.g. ``…… adj.抱歉的``), this discards that fragment.
    match = _POS_RE.search(text)
    if match:
        text = text[match.end() :].strip()
    else:
        # Plain prompt text is only safe when it is already a short gloss;
        # otherwise it is usually an OCR-extracted story fragment.
        return text if _is_learner_gloss(text) else ""
    text = re.sub(r"“[^”]*”|\"[^\"]*\"", " ", text)
    for marker in POLLUTION_MARKERS:
        text = text.split(marker, 1)[0]
    text = re.split(r"[。！？]", text, 1)[0]
    text = re.sub(r"\s+", " ", text).strip()
    # Stop at the next POS label; the first segment is generally the most
    # useful learner-facing sense and avoids copying a multi-line dictionary.
    next_pos = _POS_RE.search(text)
    if next_pos:
        text = text[: next_pos.start()].strip()
    # A space usually separates the dictionary headword gloss from the OCR
    # story tail (``请求,要求,询问 王一脸疑惑``).  Preserve spaces inside a
    # definition only when there is no obvious tail, then remove them.
    chunks = text.split()
    if len(chunks) > 1 and re.search(r"[\u3400-\u9fff]", chunks[0]):
        text = chunks[0]
    text = re.sub(r"\[[A-Z]+\]", "", text)
    text = text.replace(" ", "").strip("，,；;:：。")
    text = re.sub(r"\.{2,}", "…", text)
    # Keep at most the first few senses when a dictionary has no POS boundary.
    if len(text) > MAX_GLOSS_CHARS:
        pieces = [p for p in re.split(r"[,，;；]", text) if p]
        text = "；".join(pieces[:2])
    if not text or len(text) > MAX_GLOSS_CHARS:
        return ""
    # A useful gloss should contain Chinese (the source is a Chinese learner
    # dictionary); this also filters English OCR tails such as ``and cold``.
    if not re.search(r"[\u3400-\u9fff]", text):
        return ""
    return text


def _normalise_source_gloss(value: Any) -> str:
    text = _text(value)
    if not text:
        return ""
    if _is_learner_gloss(text):
        return text
    return _extract_local_gloss(text)


def _episode_sources(root: Path, episode: int) -> tuple[dict[str, str], dict[str, str]]:
    """Return (script_gloss, official_words) for one episode."""
    path = root / "dialogue_stories" / f"ep{episode}.json"
    try:
        story = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}, {}
    script: dict[str, str] = {}
    raw_script = story.get("script_gloss") if isinstance(story.get("script_gloss"), dict) else {}
    for raw_term, raw_gloss in raw_script.items():
        term, gloss = _text(raw_term).lower(), _normalise_source_gloss(raw_gloss)
        if term and gloss:
            script[term] = gloss
    official: dict[str, str] = {}
    raw_official = story.get("official_words") if isinstance(story.get("official_words"), list) else []
    for item in raw_official:
        if not isinstance(item, dict):
            continue
        term, gloss = _text(item.get("term")).lower(), _normalise_source_gloss(item.get("zh"))
        if term and gloss:
            official.setdefault(term, gloss)
    return script, official


def _story_glosses(root: Path) -> dict[str, str]:
    """Build a global fallback glossary, keeping authored script values first."""
    result: dict[str, str] = {}
    stories = root / "dialogue_stories"
    for path in sorted(stories.glob("ep*.json")):
        try:
            episode = int(path.stem.removeprefix("ep"))
        except ValueError:
            continue
        script, official = _episode_sources(root, episode)
        for term, gloss in (*script.items(), *official.items()):
            result.setdefault(term, gloss)
    return result


def _existing_clean_glosses(root: Path, result: dict[str, str]) -> None:
    guides = root / "lesson_guides"
    for path in sorted(guides.glob("ep*/lesson.json")):
        try:
            lesson = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        cards = lesson.get("cards") if isinstance(lesson.get("cards"), list) else []
        for card in cards:
            if not isinstance(card, dict) or card.get("type") != "word_review":
                continue
            payload = card.get("payload") if isinstance(card.get("payload"), dict) else card
            prompt = card.get("prompt") if isinstance(card.get("prompt"), dict) else {}
            term = _text(payload.get("term") or prompt.get("en")).lower()
            candidates = (payload.get("gloss"), payload.get("meaning"), prompt.get("zh"), payload.get("def"))
            for value in candidates:
                gloss = _normalise_source_gloss(value)
                if term and gloss:
                    result.setdefault(term, gloss)
                    break


def build_glossary(root: Path) -> dict[str, str]:
    result = _story_glosses(root)
    _existing_clean_glosses(root, result)
    for term, gloss in FALLBACK_GLOSSES.items():
        result.setdefault(term, gloss)
    return result


def _local_glosses(card: dict[str, Any]) -> tuple[str, str]:
    """Return (direct_clean, extracted) local candidates for a card."""
    payload = card.get("payload") if isinstance(card.get("payload"), dict) else card
    prompt = card.get("prompt") if isinstance(card.get("prompt"), dict) else {}
    values = (payload.get("gloss"), payload.get("meaning"), payload.get("def"), prompt.get("zh"))
    direct = ""
    extracted = ""
    # ``payload.gloss``/``meaning`` are authored learner fields when present;
    # the original prompt/def fields are dictionary extraction and must pass
    # through the parser below even when they happen to be short.
    for value in values[:2]:
        text = _text(value)
        if not direct and _is_learner_gloss(text):
            direct = text
    plain_candidate = ""
    for value in values[2:]:
        parsed = _extract_local_gloss(value)
        if not parsed:
            continue
        # Prefer a parsed dictionary definition over a short prompt fragment;
        # the latter can be an OCR tail such as ``保险箱`` for ``safe``.
        if _POS_RE.search(_text(value)):
            extracted = parsed
            break
        if not plain_candidate:
            plain_candidate = parsed
    if not extracted:
        extracted = plain_candidate
    return direct, extracted


def _select_gloss(
    card: dict[str, Any],
    term: str,
    episode: int,
    root: Path,
    glossary: dict[str, str],
) -> str:
    # Explicit corrections take precedence over polluted or semantically
    # misleading short source values.
    if term in CANONICAL_GLOSSES:
        return CANONICAL_GLOSSES[term]
    direct, extracted = _local_glosses(card)
    if direct:
        return direct
    script, official = _episode_sources(root, episode)
    for candidate in (script.get(term), official.get(term), extracted, glossary.get(term), FALLBACK_GLOSSES.get(term, "")):
        if candidate and _is_learner_gloss(candidate):
            return candidate
    return ""


def repair_root(root: Path, write: bool = False) -> dict[str, Any]:
    root = root.resolve()
    guides = root / "lesson_guides"
    glossary = build_glossary(root)
    changes: list[dict[str, Any]] = []
    unresolved: list[dict[str, Any]] = []
    for path in sorted(guides.glob("ep*/lesson.json")):
        try:
            lesson = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        episode = int(lesson.get("episode") or int(path.parent.name.removeprefix("ep")) or 0)
        cards = lesson.get("cards") if isinstance(lesson.get("cards"), list) else []
        touched = False
        for card in cards:
            if not isinstance(card, dict) or card.get("type") != "word_review":
                continue
            issues = _word_issues(card, episode)
            if not issues:
                continue
            payload = card.get("payload") if isinstance(card.get("payload"), dict) else card
            prompt = card.get("prompt") if isinstance(card.get("prompt"), dict) else {}
            term = _text(payload.get("term") or prompt.get("en")).lower()
            gloss = _select_gloss(card, term, episode, root, glossary)
            if not _is_clean(gloss):
                unresolved.append({"episode": episode, "card_id": card.get("card_id"), "term": term})
                continue
            before = {
                "gloss": payload.get("gloss"),
                "def": payload.get("def"),
                "prompt_zh": prompt.get("zh"),
            }
            payload["gloss"] = gloss
            payload["def"] = gloss
            if isinstance(card.get("prompt"), dict):
                card["prompt"]["zh"] = gloss
            after = {"gloss": gloss, "def": gloss, "prompt_zh": gloss}
            changes.append({"episode": episode, "card_id": card.get("card_id"), "term": term, "before": before, "after": after})
            touched = True
        if touched and write:
            path.write_text(json.dumps(lesson, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"root": str(root), "changes": changes, "unresolved": unresolved, "change_count": len(changes)}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default="content", help="content root containing lesson_guides")
    parser.add_argument("--write", action="store_true", help="write repaired lesson.json files")
    parser.add_argument("--report", help="write a repair report JSON")
    args = parser.parse_args()
    result = repair_root(Path(args.root), write=args.write)
    if args.report:
        target = Path(args.report)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    else:
        print(json.dumps({k: v for k, v in result.items() if k != "changes"}, ensure_ascii=False, indent=2))
    if result["unresolved"]:
        return 1
    if args.write:
        audit = audit_root(Path(args.root))
        blocking = {"missing_term", "missing_gloss", "dialogue_pollution", "no_usable_puzzle", "invalid_card"}
        if any(kind in blocking for kind in audit["issue_counts"]):
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
