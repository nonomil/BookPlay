#!/usr/bin/env python3
"""给第 1 集对话节点标说话人，并插入两处选择。"""
from __future__ import annotations

import json
from pathlib import Path

EP1 = Path(__file__).resolve().parent.parent / "data" / "dialogue_stories" / "ep1.json"


def speaker_for(text: str) -> str:
    t = (text or "").lower()
    if "gibbon" in t or "are you sure" in t:
        return "gibbon"
    if "jade emperor" in t or "your majesty" in t:
        return "jade-emperor"
    if "emperor" in t and "monkey" not in t:
        return "jade-emperor"
    if "i'll do it" in t or "i will be king" in t or "not afraid" in t:
        return "wukong"
    if "stepped forward" in t or "monkey laughed" in t:
        return "wukong"
    if "stream" in t or "fruit and flower" in t:
        return "young-monkey"
    return "narrator"


def main() -> int:
    book = json.loads(EP1.read_text(encoding="utf-8"))
    for node in book["nodes"]:
        if node.get("type") == "narration":
            node["speaker"] = speaker_for(node.get("text_en", ""))
    c1 = {
        "node_id": "c01",
        "type": "choice",
        "speaker": "gibbon",
        "text_en": "The gibbon asks who is brave enough to jump. What would you do?",
        "text_zh": "长臂猿问：谁有胆量跳过瀑布？你会怎么做？",
        "illustration": "assets/adv_frames/ep1/f1.jpg",
        "choices": [
            {"id": "try", "en": "I would try.", "zh": "我去试试。", "reply": "The others step back. Someone has to go first."},
            {"id": "stay", "en": "I would stay back.", "zh": "我先看看。", "reply": "Most of the monkeys think the same. Then a voice calls out."},
        ],
        "vocab": [],
    }
    c2 = {
        "node_id": "c02",
        "type": "choice",
        "speaker": "wukong",
        "text_en": "Monkey is going to jump. What do you say?",
        "text_zh": "石猴要跳了。你会对他说什么？",
        "illustration": "assets/adv_frames/ep1/f3.jpg",
        "choices": [
            {"id": "cheer", "en": "Go, Monkey!", "zh": "跳吧！", "reply": "The troop cheers. He is not afraid of anything."},
            {"id": "warn", "en": "It looks dangerous.", "zh": "太危险了。", "reply": "The gibbon said the same thing. Monkey only laughs."},
        ],
        "vocab": [],
    }
    out = []
    for node in book["nodes"]:
        out.append(node)
        if node.get("node_id") == "n057":
            out.append(c1)
        if node.get("node_id") == "n065":
            out.append(c2)
    book["nodes"] = out
    EP1.write_text(json.dumps(book, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"ok nodes={len(out)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
