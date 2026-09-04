#!/usr/bin/env python3
"""Audit and repair Mikey & JJ glossary placeholders.

Some later books shipped with ``zh: 重点词`` and a dummy IPA value.  Those
entries made the right rail look complete while providing no learning value.
This tool uses a reviewed, explicit term map; unknown placeholders are left
untouched and reported rather than guessed.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


REPO = Path(__file__).resolve().parents[2]
DATA_DIR = REPO / "prj" / "data" / "storybooks-mikey-jj"
PLACEHOLDER_ZH = {"", "重点词", "待补", "待翻译", "placeholder"}
PLACEHOLDER_IPA = {"ˈwɜːd", "", "/word/"}

# Curated for the words that were actually present in the affected sentences.
# The values are intentionally compact because the renderer shows one term,
# one IPA line, and one Chinese gloss per card.
TERM_MAP: dict[str, dict[str, str]] = {
    "activate": {"ipa": "ˈæktɪveɪt", "pos": "V", "zh": "激活"},
    "anything": {"ipa": "ˈeniθɪŋ", "pos": "Pron", "zh": "任何事"},
    "behold": {"ipa": "bɪˈhəʊld", "pos": "V", "zh": "看啊"},
    "being": {"ipa": "ˈbiːɪŋ", "pos": "V", "zh": "处于"},
    "blast": {"ipa": "blɑːst", "pos": "V", "zh": "猛轰"},
    "bridge": {"ipa": "brɪdʒ", "pos": "N", "zh": "桥"},
    "broken": {"ipa": "ˈbrəʊkən", "pos": "Adj", "zh": "破损的"},
    "budge": {"ipa": "bʌdʒ", "pos": "V", "zh": "移动"},
    "build": {"ipa": "bɪld", "pos": "V", "zh": "建造"},
    "built": {"ipa": "bɪlt", "pos": "V", "zh": "建造了"},
    "bunker": {"ipa": "ˈbʌŋkə", "pos": "N", "zh": "地堡"},
    "burger": {"ipa": "ˈbɜːɡə", "pos": "N", "zh": "汉堡"},
    "business": {"ipa": "ˈbɪznəs", "pos": "N", "zh": "生意"},
    "buying": {"ipa": "ˈbaɪɪŋ", "pos": "V", "zh": "购买"},
    "catch": {"ipa": "kætʃ", "pos": "V", "zh": "抓住"},
    "chefs": {"ipa": "ʃefs", "pos": "N", "zh": "厨师"},
    "choice": {"ipa": "tʃɔɪs", "pos": "N", "zh": "选择"},
    "close": {"ipa": "kləʊz", "pos": "V", "zh": "关闭"},
    "comes": {"ipa": "kʌmz", "pos": "V", "zh": "来"},
    "death": {"ipa": "deθ", "pos": "N", "zh": "死亡"},
    "deploying": {"ipa": "dɪˈplɔɪɪŋ", "pos": "V", "zh": "部署"},
    "destroyed": {"ipa": "dɪˈstrɔɪd", "pos": "V", "zh": "被摧毁"},
    "dollar": {"ipa": "ˈdɒlə", "pos": "N", "zh": "美元"},
    "enough": {"ipa": "ɪˈnʌf", "pos": "Adj", "zh": "足够的"},
    "expensive": {"ipa": "ɪkˈspensɪv", "pos": "Adj", "zh": "昂贵的"},
    "extinguisher": {"ipa": "ɪkˈstɪŋɡwɪʃə", "pos": "N", "zh": "灭火器"},
    "finish": {"ipa": "ˈfɪnɪʃ", "pos": "V", "zh": "完成"},
    "floors": {"ipa": "flɔːz", "pos": "N", "zh": "地板"},
    "focus": {"ipa": "ˈfəʊkəs", "pos": "V", "zh": "专注"},
    "forgot": {"ipa": "fəˈɡɒt", "pos": "V", "zh": "忘记了"},
    "fresh": {"ipa": "freʃ", "pos": "Adj", "zh": "新鲜的"},
    "gaming": {"ipa": "ˈɡeɪmɪŋ", "pos": "N", "zh": "游戏"},
    "ghosts": {"ipa": "ɡəʊsts", "pos": "N", "zh": "鬼魂"},
    "giant": {"ipa": "ˈdʒaɪənt", "pos": "Adj", "zh": "巨大的"},
    "glued": {"ipa": "ɡluːd", "pos": "Adj", "zh": "粘住的"},
    "hamburger": {"ipa": "ˈhæmbɜːɡə", "pos": "N", "zh": "汉堡包"},
    "handover": {"ipa": "ˈhændəʊvə", "pos": "N", "zh": "交接"},
    "haven": {"ipa": "ˈheɪvən", "pos": "N", "zh": "避风港"},
    "heated": {"ipa": "ˈhiːtɪd", "pos": "Adj", "zh": "加热的"},
    "hello": {"ipa": "həˈləʊ", "pos": "Interj", "zh": "你好"},
    "house": {"ipa": "haʊs", "pos": "N", "zh": "房子"},
    "importantly": {"ipa": "ɪmˈpɔːtəntli", "pos": "Adv", "zh": "重要的是"},
    "inside": {"ipa": "ɪnˈsaɪd", "pos": "Prep", "zh": "在里面"},
    "kaboom": {"ipa": "kəˈbuːm", "pos": "Interj", "zh": "轰隆"},
    "laser": {"ipa": "ˈleɪzə", "pos": "N", "zh": "激光"},
    "legend": {"ipa": "ˈledʒənd", "pos": "N", "zh": "传说"},
    "legion": {"ipa": "ˈliːdʒən", "pos": "N", "zh": "军团"},
    "little": {"ipa": "ˈlɪtəl", "pos": "Adj", "zh": "小的"},
    "loves": {"ipa": "lʌvz", "pos": "V", "zh": "喜爱"},
    "mikey": {"ipa": "ˈmaɪki", "pos": "N", "zh": "Mikey（人名）"},
    "mines": {"ipa": "maɪnz", "pos": "N", "zh": "地雷"},
    "money": {"ipa": "ˈmʌni", "pos": "N", "zh": "钱"},
    "monster": {"ipa": "ˈmɒnstə", "pos": "N", "zh": "怪物"},
    "netherite": {"ipa": "ˈneðəraɪt", "pos": "N", "zh": "下界合金"},
    "nuclear": {"ipa": "ˈnjuːkliə", "pos": "Adj", "zh": "核能的"},
    "number": {"ipa": "ˈnʌmbə", "pos": "N", "zh": "编号"},
    "obsidian": {"ipa": "əbˈsɪdiən", "pos": "N", "zh": "黑曜石"},
    "pantry": {"ipa": "ˈpæntri", "pos": "N", "zh": "食品储藏室"},
    "piglins": {"ipa": "ˈpɪɡlɪnz", "pos": "N", "zh": "猪灵"},
    "premium": {"ipa": "ˈpriːmiəm", "pos": "Adj", "zh": "高级的"},
    "quick": {"ipa": "kwɪk", "pos": "Adj", "zh": "快速的"},
    "refunds": {"ipa": "ˈriːfʌndz", "pos": "N", "zh": "退款"},
    "right": {"ipa": "raɪt", "pos": "Adj", "zh": "对的"},
    "rotten": {"ipa": "ˈrɒtən", "pos": "Adj", "zh": "腐烂的"},
    "royal": {"ipa": "ˈrɔɪəl", "pos": "Adj", "zh": "王室的"},
    "scaring": {"ipa": "ˈskeərɪŋ", "pos": "V", "zh": "吓人"},
    "sealed": {"ipa": "siːld", "pos": "Adj", "zh": "密封的"},
    "seems": {"ipa": "siːmz", "pos": "V", "zh": "似乎"},
    "skeleton": {"ipa": "ˈskelɪtən", "pos": "N", "zh": "骷髅"},
    "snout": {"ipa": "snaʊt", "pos": "N", "zh": "鼻吻"},
    "squid": {"ipa": "skwɪd", "pos": "N", "zh": "鱿鱼"},
    "sticky": {"ipa": "ˈstɪki", "pos": "Adj", "zh": "黏的"},
    "storm": {"ipa": "stɔːm", "pos": "N", "zh": "暴风雨"},
    "swamp": {"ipa": "swɒmp", "pos": "N", "zh": "沼泽"},
    "tanking": {"ipa": "ˈtæŋkɪŋ", "pos": "V", "zh": "硬扛"},
    "thanks": {"ipa": "θæŋks", "pos": "Interj", "zh": "谢谢"},
    "three": {"ipa": "θriː", "pos": "Num", "zh": "三"},
    "tough": {"ipa": "tʌf", "pos": "Adj", "zh": "坚硬的"},
    "treasure": {"ipa": "ˈtreʒə", "pos": "N", "zh": "宝藏"},
    "vegetables": {"ipa": "ˈvedʒtəbəlz", "pos": "N", "zh": "蔬菜"},
    "village": {"ipa": "ˈvɪlɪdʒ", "pos": "N", "zh": "村庄"},
    "warning": {"ipa": "ˈwɔːnɪŋ", "pos": "N", "zh": "警告"},
    "weeks": {"ipa": "wiːks", "pos": "N", "zh": "周"},
    "welcome": {"ipa": "ˈwelkəm", "pos": "V", "zh": "欢迎"},
    "wheel": {"ipa": "wiːl", "pos": "N", "zh": "轮子"},
}


def iter_glossary(payload: dict[str, Any]):
    for page in payload.get("pages") or []:
        for sentence in page.get("sentences") or []:
            for glossary in sentence.get("glossary") or []:
                yield glossary


def audit_file(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    placeholders = []
    unknown = []
    for glossary in iter_glossary(payload):
        term = str(glossary.get("term") or "").lower()
        if glossary.get("zh") in PLACEHOLDER_ZH or glossary.get("ipa") in PLACEHOLDER_IPA:
            if term in TERM_MAP:
                placeholders.append(term)
            else:
                unknown.append(term)
    return {"file": str(path), "placeholders": placeholders, "unknown": unknown}


def clean_file(path: Path, *, write: bool = False) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    changed = []
    unknown = []
    for glossary in iter_glossary(payload):
        term = str(glossary.get("term") or "").lower()
        if glossary.get("zh") not in PLACEHOLDER_ZH and glossary.get("ipa") not in PLACEHOLDER_IPA:
            continue
        replacement = TERM_MAP.get(term)
        if not replacement:
            unknown.append(term)
            continue
        glossary.update(replacement)
        changed.append(term)
    if write and changed:
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"file": str(path), "changed": changed, "unknown": unknown, "written": bool(write and changed)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--book", type=int, action="append")
    parser.add_argument("--data-dir", type=Path, default=DATA_DIR)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    books = args.book or list(range(1, 12))
    reports = []
    for book in books:
        path = Path(args.data_dir) / f"book{book}.json"
        if path.exists():
            reports.append(clean_file(path, write=args.write))
    if args.json:
        print(json.dumps(reports, ensure_ascii=False, indent=2))
    else:
        for report in reports:
            print(f"{Path(report['file']).name}: changed={len(report['changed'])} unknown={len(report['unknown'])} written={report['written']}")
            for term in report["unknown"]:
                print(f"  unknown placeholder: {term}")
    return 1 if any(report["unknown"] for report in reports) else 0


if __name__ == "__main__":
    raise SystemExit(main())
