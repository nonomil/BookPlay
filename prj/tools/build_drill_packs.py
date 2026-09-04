# -*- coding: utf-8 -*-
"""Generate slim drill packs (official_words / puzzles / official_quiz / patterns only).

Fully-loaded collections weigh ~2.8MB (nodes/script_gloss/frames are the bulk);
packs keep only what drill.html needs, ~59KB per collection.
Each matchable official_word also gets a light `review` record pointing at its source
node (episode/node_id/illustration/video/start/end) for the 再学一次 overlay
(jttw-drill-word-relearn). Output: content/dialogue_stories/drill/{id}.json.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from paths import STORIES

COLLECTIONS = STORIES / "collections.json"
OUT_DIR = STORIES / "drill"

# 只保留这四个字段 —— nodes / script_lexicon / script_gloss / frames 是 2.8MB 的来源
KEEP = ("official_words", "puzzles", "official_quiz", "patterns")

_NORM_RE = re.compile(r"\s+")
_MATCH_RE = re.compile(r"[^a-z0-9]+")


def _norm(s) -> str:
    """与 drill.js 的 normSent 同口径: 空白折叠 + 首尾去空。"""
    return _NORM_RE.sub(" ", str(s or "")).strip()


def _match_norm(s) -> str:
    """忽略英文引号、标点与多余空格，用于例句到原台词的稳定关联。"""
    return _MATCH_RE.sub(" ", str(s or "").lower()).strip()


def _find_review_node(example: str, nodes: list[dict]) -> dict | None:
    key = _match_norm(example)
    if not key:
        return None
    candidates: list[tuple[int, str, dict]] = []
    for node in nodes:
        node_key = _match_norm(node.get("text_en"))
        if node_key and (node_key == key or key in node_key or node_key in key):
            candidates.append((abs(len(node_key) - len(key)), str(node.get("node_id") or ""), node))
    return min(candidates, default=(0, "", None))[2]


def _attach_review(ep_num: int, data: dict, words: list[dict]) -> None:
    """把每个可匹配 official_word 关联到文本最匹配的 node, 写入轻量 review。

    忽略标点/引号后先精确、再做双向包含匹配，多个候选取长度差最小者；
    找不到或 node 缺少数值音频窗口的词不加 review，前端走文本回退。
    """
    video = data.get("video") or f"assets/video/ep{ep_num}.mp4"
    nodes = data.get("nodes", [])
    for w in words:
        ex = _norm(w.get("example"))
        node = _find_review_node(ex, nodes) if ex else None
        if not node:
            continue
        start, end = node.get("audio_start"), node.get("audio_end")
        if not (isinstance(start, (int, float)) and isinstance(end, (int, float)) and start < end):
            continue
        w["review"] = {
            "episode": ep_num,
            "node_id": node["node_id"],
            "illustration": node.get("illustration") or "",
            "video": video,
            "start": start,
            "end": end,
        }


def slim_episode(ep_num: int) -> dict:
    data = json.loads((STORIES / f"ep{ep_num}.json").read_text(encoding="utf-8-sig"))
    out = {"episode": ep_num, **{k: data.get(k, []) for k in KEEP}}
    words = out.get("official_words", [])
    if words:
        _attach_review(ep_num, data, words)
    return out


def build() -> list[tuple[str, int]]:
    cols = json.loads(COLLECTIONS.read_text(encoding="utf-8"))["collections"]
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rows: list[tuple[str, int]] = []
    for c in cols:
        episodes = [slim_episode(n) for n in range(c["from"], c["to"] + 1)]
        pack = {
            "schema_version": 1,
            "collection": c["id"],
            "title": c["title"],
            "from": c["from"],
            "to": c["to"],
            "episodes": episodes,
        }
        path = OUT_DIR / f"{c['id']}.json"
        # 运行时数据包无需人工编辑；紧凑 JSON 避免重复 review 键把大合辑推近 200KiB 门槛。
        path.write_text(
            json.dumps(pack, ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8",
        )
        rows.append((c["id"], len(episodes)))
        print(f"{c['id']}: {len(episodes)} eps -> {path.name} ({path.stat().st_size // 1024}KB)")
    return rows


if __name__ == "__main__":
    rows = build()
    print(f"done packs={len(rows)} total_episodes={sum(n for _, n in rows)}")
