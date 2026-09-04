# -*- coding: utf-8 -*-
"""Fix Journey to the West proper-noun machine translations in player Chinese."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "content"

# Longest / regex first. 虎仙 must not eat 虎力大仙.
REPLACES: list[tuple[str, str]] = [
    ("菩萨灵智", "灵吉菩萨"),
    ("菩萨灵极", "灵吉菩萨"),
    ("觉醒如来", "观音"),
    ("蟠桃花果山", "花果山"),
    ("皇家桃园", "蟠桃园"),
    ("小雷击寺", "小雷音寺"),
    ("小雷霆寺", "小雷音寺"),
    ("雷击寺", "雷音寺"),
    ("雷霆寺", "雷音寺"),
    ("斯夸尔·库", "寇员外"),
    ("库斯quire", "寇员外"),
    ("员外·库", "寇员外"),
    ("员外·古", "寇员外"),
    ("员外·寇", "寇员外"),
    ("库员外", "寇员外"),
    ("库先生", "寇员外"),
    ("秀姑夫人", "寇夫人"),
    ("古夫人", "寇夫人"),
    ("库夫人", "寇夫人"),
    ("白骨女士", "白骨夫人"),
    ("唐代僧侣", "唐僧"),
    ("唐代僧人", "唐僧"),
    ("桀罗汉", "唐僧"),
    ("苏波底", "菩提祖师"),
    ("苏博迪", "菩提祖师"),
    ("Subodhi", "菩提祖师"),
    ("Plum Mountain", "梅山"),
    ("Golden Horn", "金角"),
    ("Red Boy", "红孩儿"),
    ("红衣少年", "红孩儿"),
    ("红衣男孩", "红孩儿"),
    ("红小鬼", "红孩儿"),
    ("红童", "红孩儿"),
    ("金角湾", "金角"),
    ("虎仙师", "虎力大仙"),
    ("虎仙子", "虎力大仙"),
    ("维纳斯", "太白金星"),
    ("Erlang", "二郎"),
    ("尔朗", "二郎"),
    ("凌极", "灵吉"),
    ("巴杰", "八戒"),
    ("巴捷", "八戒"),
    ("班吉", "八戒"),
    ("百劫", "八戒"),
    ("吴京", "悟净"),
    ("吴静", "悟净"),
    ("秀姑", "寇夫人"),
    ("秀女士", "寇夫人"),
    ("库斯科爵爷", "寇员外"),
    ("康克爵士", "寇员外"),
    ("库斯维尔先生", "寇员外"),
    ("库尔侍从", "寇员外"),
    ("灵栖禅师", "灵吉菩萨"),
    ("菩萨大圆", "地藏菩萨"),
    ("为大圆工作", "为地藏菩萨工作"),
    ("直奔高老庄而去", "直奔寇员外家而去"),
    ("雷声寺", "雷音寺"),
    ("熊仙", "虎力大仙"),
    ("林吉", "灵吉"),
    ("灵地", "灵吉"),
    ("钢铁不朽者", "铁扇公主"),
    ("铁不朽者", "铁扇公主"),
    ("铁不朽的粉丝", "铁扇公主的扇子"),
    ("铁不朽", "铁扇公主"),
    ("铁不死", "铁扇公主"),
    ("铁神的石头", "铁扇公主的石头"),
]

REGEXES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"虎仙(?!力)"), "虎力大仙"),
]


def fix_text(s: str) -> str:
    out = s
    for old, new in REPLACES:
        if old in out:
            out = out.replace(old, new)
    for pat, new in REGEXES:
        out = pat.sub(new, out)
    return out


# Only Chinese player copy. Never rewrite English sentences or cache keys.
ZH_FIELD_KEYS = {"text_zh", "phrase_zh", "zh", "gloss"}
EN_FIELD_KEYS = {
    "text_en", "phrase_en", "pattern", "example", "sentence",
    "term", "en", "ipa", "pos", "def", "prompt", "question",
}


def walk(obj, parent: str | None = None, *, fix_keys: bool = False) -> tuple[object, int]:
    changed = 0
    if isinstance(obj, str):
        if parent in EN_FIELD_KEYS:
            return obj, 0
        if parent in ZH_FIELD_KEYS or (fix_keys and parent is None):
            nxt = fix_text(obj)
            return nxt, int(nxt != obj)
        return obj, 0
    if isinstance(obj, list):
        out = []
        for item in obj:
            nxt, n = walk(item, parent, fix_keys=fix_keys)
            out.append(nxt)
            changed += n
        return out, changed
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            nk = k
            if fix_keys and isinstance(k, str) and parent is None:
                # sent_zh_index keys are Chinese sentences
                nk = fix_text(k)
            nv, n = walk(v, k if isinstance(k, str) else parent, fix_keys=False)
            changed += n + int(nk != k)
            if nk in out and nk != k:
                continue
            out[nk] = nv
        return out, changed
    return obj, 0


TARGETS = [
    CONTENT / "dialogue_stories",
    CONTENT / "assets" / "adv_audio" / "sent_zh_index.json",
    CONTENT / "assets" / "adv_audio" / "quiz_zh_index.json",
    CONTENT / "assets" / "adv_audio" / "zh_index.json",
    CONTENT / "quiz_zh_cache.json",
    CONTENT / "align" / "zh_cache.json",
]


def patch_file(path: Path) -> int:
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    name = path.name
    fix_keys = name in {
        "sent_zh_index.json",
        "quiz_zh_index.json",
        "zh_index.json",
    }
    # zh_cache is {english: chinese} — only values
    if name == "zh_cache.json":
        if not isinstance(data, dict):
            return 0
        nxt, n = {}, 0
        for k, v in data.items():
            nv, c = walk(v, "text_zh")
            nxt[k] = nv
            n += c
        if n:
            path.write_text(json.dumps(nxt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return n
    nxt, n = walk(data, fix_keys=fix_keys)
    if n:
        path.write_text(json.dumps(nxt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return n


def main() -> None:
    total = 0
    files = 0
    for t in TARGETS:
        paths = sorted(t.glob("ep*.json")) if t.is_dir() else [t]
        for path in paths:
            if not path.exists():
                print("skip missing", path)
                continue
            n = patch_file(path)
            if n:
                files += 1
                total += n
                print(f"{n:5d}  {path.relative_to(ROOT)}")
    print(f"done files={files} replacements={total}")


if __name__ == "__main__":
    main()
