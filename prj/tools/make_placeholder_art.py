#!/usr/bin/env python3
"""生成 M1 占位美术（SVG）。正式素材由 Nano Banana 按 prompts/manifest.json 生成后替换。

用法: python tools/make_placeholder_art.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
A = ROOT / "assets"

SKY = ["#ffe9b8", "#f6c26b", "#e8935a"]


def monkey(cid: str, emo: str) -> str:
    fur, face = ("#8a5a33", "#e8c39a") if cid == "elder_monkey" else ("#d8a12e", "#f5d9a8")
    # 表情：眼睛与嘴形
    eyes = {
        "neutral": '<circle cx="52" cy="62" r="5" fill="#2b2320"/><circle cx="88" cy="62" r="5" fill="#2b2320"/>',
        "awed": '<circle cx="52" cy="60" r="7" fill="#2b2320"/><circle cx="88" cy="60" r="7" fill="#2b2320"/><circle cx="54" cy="58" r="2.4" fill="#fff"/><circle cx="90" cy="58" r="2.4" fill="#fff"/>',
        "happy": '<path d="M45 62 q7 -9 14 0" stroke="#2b2320" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M81 62 q7 -9 14 0" stroke="#2b2320" stroke-width="4" fill="none" stroke-linecap="round"/>',
        "curious": '<circle cx="52" cy="60" r="6" fill="#2b2320"/><circle cx="88" cy="60" r="6" fill="#2b2320"/><circle cx="54" cy="58" r="2.2" fill="#fff"/><circle cx="90" cy="58" r="2.2" fill="#fff"/>',
        "brave": '<path d="M42 54 l20 6" stroke="#2b2320" stroke-width="4" stroke-linecap="round"/><path d="M98 54 l-20 6" stroke="#2b2320" stroke-width="4" stroke-linecap="round"/><circle cx="52" cy="66" r="5" fill="#2b2320"/><circle cx="88" cy="66" r="5" fill="#2b2320"/>',
    }.get(emo, '<circle cx="52" cy="62" r="5" fill="#2b2320"/><circle cx="88" cy="62" r="5" fill="#2b2320"/>')
    mouth = {
        "neutral": '<path d="M60 86 q10 6 20 0" stroke="#2b2320" stroke-width="3.5" fill="none" stroke-linecap="round"/>',
        "awed": '<ellipse cx="70" cy="88" rx="7" ry="9" fill="#2b2320"/>',
        "happy": '<path d="M56 82 q14 14 28 0" stroke="#2b2320" stroke-width="4" fill="none" stroke-linecap="round"/>',
        "curious": '<path d="M60 84 q10 4 20 -2" stroke="#2b2320" stroke-width="3.5" fill="none" stroke-linecap="round"/>',
        "brave": '<path d="M58 86 l24 0" stroke="#2b2320" stroke-width="4" fill="none" stroke-linecap="round"/>',
    }.get(emo, '<path d="M60 86 q10 6 20 0" stroke="#2b2320" stroke-width="3.5" fill="none" stroke-linecap="round"/>')
    beard = (
        '<path d="M48 96 q22 26 44 0 l0 18 q-22 14 -44 0 z" fill="#d9d2c5"/>'
        if cid == "elder_monkey" else ""
    )
    hunch = "rotate(-6 70 130)" if cid == "elder_monkey" else ""
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 200" width="140" height="200">
  <g {hunch}>
    <path d="M96 150 q34 -4 30 -40" stroke="{fur}" stroke-width="9" fill="none" stroke-linecap="round"/>
    <circle cx="34" cy="52" r="13" fill="{fur}"/><circle cx="106" cy="52" r="13" fill="{fur}"/>
    <circle cx="34" cy="52" r="6.5" fill="{face}"/><circle cx="106" cy="52" r="6.5" fill="{face}"/>
    <circle cx="70" cy="72" r="42" fill="{fur}"/>
    <ellipse cx="70" cy="82" rx="30" ry="26" fill="{face}"/>
    {eyes}{mouth}{beard}
    <ellipse cx="70" cy="150" rx="30" ry="34" fill="{fur}"/>
    <ellipse cx="70" cy="152" rx="18" ry="22" fill="{face}"/>
    <rect x="46" y="180" width="16" height="14" rx="6" fill="{fur}"/>
    <rect x="78" y="180" width="16" height="14" rx="6" fill="{fur}"/>
  </g>
</svg>
"""


def background() -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="{SKY[0]}"/><stop offset="0.6" stop-color="{SKY[1]}"/><stop offset="1" stop-color="{SKY[2]}"/>
    </linearGradient>
    <linearGradient id="fall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#eaf6ff"/><stop offset="1" stop-color="#7db8e8"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#sky)"/>
  <circle cx="1250" cy="170" r="80" fill="#fff3d0" opacity="0.9"/>
  <path d="M0 620 L260 380 L470 620 Z" fill="#7a6a4f"/>
  <path d="M340 640 L620 330 L900 640 Z" fill="#5e6b4a"/>
  <path d="M900 650 L1180 300 L1470 650 Z" fill="#6d7a52"/>
  <path d="M1150 330 q40 40 30 90 l-14 220 h-40 l-6 -230 z" fill="url(#fall)"/>
  <ellipse cx="1158" cy="660" rx="90" ry="22" fill="#bcd8ee" opacity="0.8"/>
  <rect y="640" width="1600" height="260" fill="#4e5c3e"/>
  <ellipse cx="300" cy="700" rx="120" ry="26" fill="#5e7048"/>
  <ellipse cx="760" cy="760" rx="150" ry="30" fill="#5e7048"/>
  <ellipse cx="1350" cy="730" rx="130" ry="28" fill="#5e7048"/>
</svg>
"""


def main() -> int:
    (A / "backgrounds").mkdir(parents=True, exist_ok=True)
    (A / "characters").mkdir(parents=True, exist_ok=True)

    # 背景按 scene JSON 生成
    for sp in (DATA / "scenes").glob("*.json"):
        scene = json.loads(sp.read_text(encoding="utf-8"))
        bg = A.parent / scene["background"]
        bg.parent.mkdir(parents=True, exist_ok=True)
        bg.write_text(background(), encoding="utf-8")
        print(f"  [bg] {bg.name}")

    # 立绘按 characters JSON 声明的表情生成
    for cp in (DATA / "characters").glob("*.json"):
        c = json.loads(cp.read_text(encoding="utf-8"))
        for emo in c.get("emotions", {}):
            p = ROOT / c["emotions"][emo]
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(monkey(c["character_id"], emo), encoding="utf-8")
            print(f"  [立绘] {c['character_id']}_{emo}")
    print("占位美术完成（正式素材请按 prompts/manifest.json 用 Nano Banana 生成后替换）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
