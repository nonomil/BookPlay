"""绘本页文本清理：首字下沉、句间空格、页脚页码。"""
from __future__ import annotations

import re


def clean_story_text(spans: list[tuple]) -> str:
    drop_cap = ""
    parts = []
    for _y, _x, size, txt in spans:
        t = str(txt).strip()
        if size > 30 and len(t) == 1 and t.isalpha():
            drop_cap = t
            continue
        parts.append(str(txt))
    text = "".join(parts)
    text = re.sub(r"\s*\n\s*", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if drop_cap and not text.startswith(drop_cap):
        text = drop_cap + text
    text = re.sub(r"\.([A-Z“\"])", r". \1", text)
    text = re.sub(r"\s*\d{1,2}$", "", text)
    return text


def extract_page_text(page) -> str:
    d = page.get_text("dict")
    spans = []
    for b in d["blocks"]:
        if b["type"] != 0:
            continue
        for line in b["lines"]:
            for s in line["spans"]:
                spans.append((round(s["bbox"][1]), round(s["bbox"][0]), s["size"], s["text"]))
    spans.sort()
    return clean_story_text(spans)
