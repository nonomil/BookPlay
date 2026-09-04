#!/usr/bin/env python3
"""批量生成 M1 正式美术资产（gpt-image-2 经 Cliproxy 中继）。

用法: python tools/gen_assets_batch.py [--only id1,id2]
流程: 每个角色先出绿底基准图→chroma_key 去背；背景图直接出。
已存在的目标文件跳过（--force 重生成）。
"""
import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GEN = ROOT / "assets" / "gen"
KEY_TOOL = Path(r"G:\AI编程--项目模板\美术和游戏设计\游戏资产开发工具") / "skills" / "transparent-image-generator" / "scripts" / "chroma_key.py"

STYLE = ("flat vector storybook illustration, warm ink-wash palette, Ming-dynasty Chinese legend style, "
         "soft gradients, clean shapes, no text in image")

ELDER = ("an old anthropomorphic monkey, hunched posture, round head with bushy grey eyebrows and a long "
         "white beard, tan muzzle, big gentle round eyes, wearing a simple woven leaf cloak over his "
         "shoulders, thin arms, long curly brown tail, kind grandfather look")
STONE = ("a young golden-furred monkey, round fluffy head, large bright amber eyes, cream-colored muzzle "
         "and belly, small pink nose, lively energetic pose, fluffy curved tail, no clothes, cute "
         "mischievous little hero")

GREEN = ("Full body, standing, front view, centered, isolated on a solid pure green background "
         "(#00FF00), flat colors, no shadow on the background, no green on the character.")

TASKS = [
    # id, size, prompt, 是否需要去背
    ("elder_monkey_neutral", "1024x1024",
     f"{ELDER}. Calm gentle smile, warm expression. {GREEN} Style: {STYLE}.", True),
    ("elder_monkey_awed", "1024x1024",
     f"{ELDER}. Wide amazed eyes, mouth open in wonder, both hands raised slightly in astonishment. "
     f"{GREEN} Style: {STYLE}.", True),
    ("elder_monkey_happy", "1024x1024",
     f"{ELDER}. Big joyful grin, eyes curved with delight, arms raised in celebration. "
     f"{GREEN} Style: {STYLE}.", True),
    ("stone_monkey_neutral", "1024x1024",
     f"{STONE}. Calm friendly smile, looking forward. {GREEN} Style: {STYLE}.", True),
    ("stone_monkey_curious", "1024x1024",
     f"{STONE}. Head tilted, one hand raised to his chin, wide sparkling curious eyes. "
     f"{GREEN} Style: {STYLE}.", True),
    ("stone_monkey_brave", "1024x1024",
     f"{STONE}. Determined smile, small fists clenched, chest out, confident heroic stance. "
     f"{GREEN} Style: {STYLE}.", True),
    ("background_sc01", "1536x1024",
     f"Storybook background art, establishing shot of the Mountain of Flowers and Fruit: a tall waterfall "
     f"pouring from a mossy cliff into a green pool, soft mist, blooming peach blossoms, old pine and banyan "
     f"trees, warm golden afternoon light, magical fairy-tale atmosphere. Wide landscape composition, "
     f"no characters, no text. Style: {STYLE}.", False),
]


def run(cmd: list[str]) -> None:
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", timeout=300)
    out = (proc.stdout + proc.stderr).strip()
    print("   " + (out.replace("\n", " | ")[:160] or "(无输出)"))
    if proc.returncode != 0:
        raise RuntimeError(f"命令失败: {' '.join(cmd[:3])}...")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="逗号分隔的任务 id")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    only = set(args.only.split(",")) if args.only else None

    (GEN / "characters").mkdir(parents=True, exist_ok=True)
    (GEN / "backgrounds").mkdir(parents=True, exist_ok=True)

    fails = []
    for tid, size, prompt, need_key in TASKS:
        if only and tid not in only:
            continue
        raw = GEN / ("backgrounds" if tid.startswith("background") else "characters") / f"{tid}.png"
        if raw.exists() and not args.force:
            print(f"[跳过] {tid} 已存在")
            continue
        print(f"[生成] {tid} ({size})...")
        try:
            run([sys.executable, str(ROOT / "tools" / "gen_image.py"),
                 "--prompt", prompt, "--output", str(raw), "--size", size])
            if need_key:
                run([sys.executable, str(KEY_TOOL), str(raw), str(raw),
                     "--key", "0,255,0", "--tolerance", "60", "--feather", "20"])
                print(f"   去背完成 -> {raw.name}")
        except Exception as exc:  # noqa: BLE001
            fails.append(tid)
            print(f"   [失败] {tid}: {exc}")
    print(f"\n完成，失败 {len(fails)}: {fails or '无'}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
