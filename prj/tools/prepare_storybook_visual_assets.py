"""Prepare storybook visual outputs and manifests.

When Cliprox is unavailable this creates honest, text-free fallback art from
the already approved series backgrounds and simple geometric keepsakes.  The
prompt/evidence files stay alongside the output so a later Cliprox run can
replace the files without changing runtime paths.
"""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance

try:  # Works both as ``python prj/tools/...`` and as a package in tests.
    from storybook_visual_evidence import project_root
    from storybook_visual_manifest import build_manifest
except ModuleNotFoundError:  # pragma: no cover - import-mode compatibility
    from prj.tools.storybook_visual_evidence import project_root
    from prj.tools.storybook_visual_manifest import build_manifest


SPECS = {
    "minecraft": [
        ("completion-card-bg", "completion-card-bg.png", "completion-card-bg.prompt.txt", [1], ["mc-b1-p01-s01", "mc-b1-p01-s02"]),
        ("quiz-background", "quiz-background.png", "quiz-background.prompt.txt", [3], ["mc-b1-p03-s06", "mc-b1-p03-s07"]),
        ("room-reward-golden-helmet", "room-reward-golden-helmet.png", "room-reward-golden-helmet.prompt.txt", [1], ["mc-b1-p01-s02"]),
        ("room-reward-portal-shard", "room-reward-portal-shard.png", "room-reward-portal-shard.prompt.txt", [3], ["mc-b1-p03-s06"]),
        ("room-reward-wolf-tag", "room-reward-wolf-tag.png", "room-reward-wolf-tag.prompt.txt", [2], ["mc-b1-p02-s01", "mc-b1-p02-s02"]),
    ],
    "mikey-jj": [
        ("completion-card-bg", "completion-card-bg.png", "completion-card-bg.prompt.txt", [2], ["b1-p02-s03", "b1-p02-s04"]),
        ("quiz-background", "quiz-background.png", "quiz-background.prompt.txt", [2], ["b1-p02-s03", "b1-p02-s04"]),
        ("room-reward-helicopter", "room-reward-helicopter.png", "room-reward-helicopter.prompt.txt", [2], ["b1-p02-s04"]),
        ("room-reward-golden-apple", "room-reward-golden-apple.png", "room-reward-golden-apple.prompt.txt", [3], ["b1-p03-s02", "b1-p03-s03"]),
        ("room-reward-potion-kit", "room-reward-potion-kit.png", "room-reward-potion-kit.prompt.txt", [4], ["b1-p04-s01", "b1-p04-s02"]),
    ],
}


def fallback_icon(series: str, kind: str, destination: Path) -> None:
    image = Image.new("RGBA", (768, 432), (18, 30, 40, 255))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((20, 20, 748, 412), radius=28, outline=(255, 255, 255, 48), width=3)
    if "helmet" in kind:
        draw.ellipse((250, 96, 518, 350), fill=(244, 200, 64, 255), outline=(255, 244, 175, 255), width=8)
        draw.rectangle((220, 238, 548, 304), fill=(210, 156, 39, 255))
        draw.rectangle((322, 150, 446, 236), fill=(35, 47, 56, 255))
    elif "portal" in kind or "shard" in kind:
        draw.polygon([(384, 70), (532, 150), (508, 334), (384, 382), (260, 334), (236, 150)], fill=(81, 46, 132, 255), outline=(190, 145, 255, 255))
        draw.polygon([(384, 102), (480, 165), (462, 302), (384, 340), (306, 302), (288, 165)], fill=(148, 76, 226, 255))
    elif "wolf" in kind:
        draw.polygon([(248, 292), (258, 160), (316, 112), (354, 164), (420, 164), (464, 112), (514, 162), (524, 292), (460, 346), (310, 346)], fill=(173, 185, 195, 255), outline=(240, 248, 255, 255))
        draw.ellipse((314, 205, 340, 231), fill=(20, 30, 40, 255)); draw.ellipse((428, 205, 454, 231), fill=(20, 30, 40, 255))
        draw.polygon([(370, 247), (398, 247), (384, 268)], fill=(30, 36, 44, 255))
    elif "helicopter" in kind:
        draw.ellipse((190, 180, 578, 316), fill=(74, 203, 112, 255), outline=(255, 255, 255, 255), width=6)
        draw.rectangle((322, 120, 446, 182), fill=(91, 165, 232, 255), outline=(255, 255, 255, 255), width=5)
        draw.line((384, 120, 384, 66), fill=(255, 255, 255, 255), width=8); draw.line((184, 66, 584, 66), fill=(255, 255, 255, 255), width=8)
        draw.rectangle((238, 304, 530, 334), fill=(44, 58, 70, 255))
    elif "apple" in kind:
        draw.ellipse((248, 132, 430, 344), fill=(255, 205, 59, 255), outline=(255, 245, 168, 255), width=8)
        draw.ellipse((350, 104, 518, 300), fill=(248, 184, 45, 255), outline=(255, 245, 168, 255), width=8)
        draw.line((380, 124, 390, 72), fill=(94, 63, 35, 255), width=12)
    elif "potion" in kind:
        for x, color in ((282, (101, 231, 145, 255)), (402, (174, 111, 239, 255))):
            draw.rounded_rectangle((x, 170, x + 92, 336), radius=26, fill=color, outline=(245, 251, 255, 255), width=6)
            draw.rectangle((x + 24, 130, x + 68, 178), fill=(200, 205, 216, 255), outline=(245, 251, 255, 255), width=4)
    else:
        draw.ellipse((286, 116, 482, 312), fill=(116, 190, 247, 255), outline=(255, 255, 255, 255), width=8)
    image.save(destination, format="PNG")


def prepare(root: Path, series: str, episode: int = 1, force: bool = False) -> Path:
    if episode != 1 or series not in SPECS:
        raise ValueError("fallback preparation currently supports Minecraft/Mikey & JJ EP1")
    doc_dir = root / "docs" / "generated" / "storybooks" / series / f"ep{episode:03d}"
    final_dir = doc_dir / "final"
    prompt_dir = doc_dir / "prompts"
    runtime_dir = root / "prj" / "assets" / "generated" / "storybooks" / series / f"ep{episode:03d}"
    final_dir.mkdir(parents=True, exist_ok=True); prompt_dir.mkdir(parents=True, exist_ok=True); runtime_dir.mkdir(parents=True, exist_ok=True)
    existing_manifest = runtime_dir / "manifest.json"
    if existing_manifest.is_file() and not force:
        try:
            existing_provider = str(json.loads(existing_manifest.read_text(encoding="utf-8")).get("generation_provider") or "")
        except (OSError, json.JSONDecodeError):
            existing_provider = ""
        if existing_provider and existing_provider != "fallback-local-awaiting-cliprox-key":
            raise RuntimeError(
                f"formal assets already exist ({existing_provider}); pass --force to replace them with fallback art"
            )
    source = root / "prj" / "assets" / ("minecraft/ui/quiz-bg-v2.webp" if series == "minecraft" else "mikey-jj/ui/quiz-bg.png")
    evidence = json.loads((doc_dir / "references/evidence.json").read_text(encoding="utf-8"))
    specs = []
    for kind, file_name, prompt_name, pages, sentence_ids in SPECS[series]:
        destination = final_dir / file_name
        if kind in {"completion-card-bg", "quiz-background"}:
            image = Image.open(source).convert("RGB")
            if kind == "completion-card-bg": image = ImageEnhance.Brightness(image).enhance(0.72)
            image.save(destination, format="PNG")
        else:
            fallback_icon(series, kind, destination)
        shutil.copy2(destination, runtime_dir / file_name)
        specs.append({"id": kind, "kind": kind, "file": file_name, "prompt": prompt_name,
                      "source_evidence": [{"storybook_pages": pages, "sentence_ids": sentence_ids}]})
    manifest = build_manifest(series, episode, evidence, final_dir, prompt_dir, f"assets/generated/storybooks/{series}/ep{episode:03d}", specs)
    manifest["generation_provider"] = "fallback-local-awaiting-cliprox-key"
    manifest["fallback"] = "approved series quiz background + text-free geometric keepsakes"
    manifest_path = runtime_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (doc_dir / "final/manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest_path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--series", required=True, choices=sorted(SPECS))
    parser.add_argument("--episode", type=int, default=1)
    parser.add_argument("--force", action="store_true", help="replace an existing formal manifest with fallback art")
    parser.add_argument("--root", type=Path, default=project_root())
    args = parser.parse_args()
    print(prepare(args.root.resolve(), args.series, args.episode, args.force))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
