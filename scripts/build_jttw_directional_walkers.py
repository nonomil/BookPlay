"""Build four-direction walk/action atlases for the first JTTW chapter.

Each direction is generated as an 8-cell 4x2 sheet (four walk poses followed
by four friendly action poses).  This script keys the staging green, aligns
the feet to one pivot, emits direction GIFs and packs the rows into the
runtime atlas expected by map.css: 8 columns x 4 rows, 384x512 cells.  The
chapter-one support cast is included so small roles can use the same contract
as the established heroes.
"""
from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
import argparse
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "assets" / "generated" / "jttw-player-walkers"
RUNTIME_ROOT = ROOT / "content" / "assets" / "generated" / "jttw-player-walkers"
CK = Path.home() / ".codex" / "skills" / "transparent-image-generator" / "scripts" / "chroma_key.py"
CELL_W, CELL_H = 384, 512
SHEET_W, SHEET_H = CELL_W * 4, CELL_H * 2
ATLAS_W, ATLAS_H = CELL_W * 8, CELL_H * 4
FRAME_MS = 150
DIRECTIONS = ("east", "south", "west", "north")
ROLES = (
    "wukong",
    "subodhi",
    "chaosdemon",
    "dragonking",
    "gibbon",
    "generic-monkey",
    "heaven-captain",
    "woodcutter",
    "temple-student",
)
META = {
    "wukong": ("孙悟空", "Sun Wukong"),
    "subodhi": ("菩提祖师", "Patriarch Subhuti"),
    "chaosdemon": ("混世魔王", "Demon of Chaos"),
    "dragonking": ("东海龙王", "East Sea Dragon King"),
    "gibbon": ("长臂猿", "Gibbon elder"),
    "generic-monkey": ("猴群成员", "Monkey troop member"),
    "heaven-captain": ("天庭将领", "Heaven captain"),
    "woodcutter": ("樵夫", "Woodcutter"),
    "temple-student": ("菩提门下弟子", "Temple student"),
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def key_green(raw: Path, out: Path, report: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    report.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            sys.executable,
            "-X",
            "utf8",
            str(CK),
            str(raw),
            str(out),
            "--key",
            "0,255,0",
            "--tolerance",
            "180",
            "--feather",
            "8",
            "--report",
            str(report),
        ],
        cwd=ROOT,
        check=True,
    )


def crop_frames(sheet: Path, out_dir: Path, slug: str, direction: str) -> list[Path]:
    image = Image.open(sheet).convert("RGBA")
    if image.size != (SHEET_W, SHEET_H):
        raise ValueError(f"{sheet} has {image.size}, expected {SHEET_W}x{SHEET_H}")
    raw = [
        image.crop(((i % 4) * CELL_W, (i // 4) * CELL_H, (i % 4 + 1) * CELL_W, (i // 4 + 1) * CELL_H))
        for i in range(8)
    ]
    boxes = [frame.getchannel("A").getbbox() for frame in raw]
    visible = [box for box in boxes if box]
    target_bottom = min(CELL_H - 8, max(box[3] for box in visible)) if visible else CELL_H - 8
    # Keep all direction sheets on the same pivot.  We only translate; no
    # resize/stretch is allowed because map movement relies on fixed cells.
    frames: list[Path] = []
    out_dir.mkdir(parents=True, exist_ok=True)
    for i, frame in enumerate(raw):
        box = boxes[i]
        aligned = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
        if box:
            cx = (box[0] + box[2]) / 2
            dx = round(CELL_W / 2 - cx)
            dy = round(target_bottom - box[3])
            dx = max(-box[0], min(CELL_W - box[2], dx))
            dy = max(-box[1], min(CELL_H - box[3], dy))
            aligned.alpha_composite(frame, (dx, dy))
        path = out_dir / f"{slug}-{direction}-{i + 1:02d}.png"
        aligned.save(path, "PNG", optimize=True)
        frames.append(path)
    return frames


def make_gif(frames: list[Path], path: Path) -> None:
    images = []
    for frame in frames:
        rgba = Image.open(frame).convert("RGBA")
        alpha = rgba.getchannel("A")
        rgb = Image.new("RGB", rgba.size, (0, 0, 0))
        rgb.paste(rgba, mask=alpha)
        indexed = rgb.quantize(colors=255, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        palette = indexed.getpalette() or []
        palette.extend([0] * (768 - len(palette)))
        palette[255 * 3 : 255 * 3 + 3] = [0, 0, 0]
        indexed.putpalette(palette)
        indexed.paste(255, (0, 0), alpha.point(lambda value: 255 if value == 0 else 0))
        images.append(indexed)
    path.parent.mkdir(parents=True, exist_ok=True)
    images[0].save(
        path,
        format="GIF",
        save_all=True,
        append_images=images[1:],
        duration=FRAME_MS,
        loop=0,
        disposal=2,
        optimize=True,
        transparency=255,
    )


def build_role(slug: str) -> dict:
    base = ASSET_ROOT / slug
    direction_frames: dict[str, list[Path]] = {}
    reports: dict[str, str] = {}
    for direction in DIRECTIONS:
        raw = base / "2d" / "directions" / direction / f"{slug}-{direction}-walk-action-sheet.png"
        # A future rerun may use the shorter generated filename; accept it so
        # prompts can be regenerated without changing the processing contract.
        if not raw.is_file():
            alt = base / "2d" / "directions" / direction / f"{slug}-{direction}-sheet.png"
            raw = alt if alt.is_file() else raw
        if not raw.is_file():
            raise FileNotFoundError(f"missing generated sheet: {raw}")
        transparent = base / "transparent" / "directions" / direction / f"{slug}-{direction}-transparent.png"
        report = transparent.with_suffix(".report.json")
        key_green(raw, transparent, report)
        frames = crop_frames(transparent, base / "transparent" / "directions" / direction / "frames", slug, direction)
        direction_frames[direction] = frames
        reports[direction] = f"assets/generated/jttw-player-walkers/{slug}/transparent/directions/{direction}/{report.name}"
        direction_gif = base / "transparent" / "directions" / direction / f"{slug}-{direction}-walk-action.gif"
        make_gif(frames, direction_gif)

    atlas = Image.new("RGBA", (ATLAS_W, ATLAS_H), (0, 0, 0, 0))
    for row, direction in enumerate(DIRECTIONS):
        for col, frame_path in enumerate(direction_frames[direction]):
            atlas.alpha_composite(Image.open(frame_path).convert("RGBA"), (col * CELL_W, row * CELL_H))
    atlas_path = base / "transparent" / f"{slug}-walk-action-atlas.png"
    atlas.save(atlas_path, "PNG", optimize=True)

    # The south action row doubles as the 8-frame player-avatar loop for the
    # new chapter role. Existing roles keep their established avatar GIFs.
    south_gif = base / "transparent" / f"{slug}-walk.gif"
    if slug == "chaosdemon":
        make_gif(direction_frames["south"], south_gif)

    runtime = RUNTIME_ROOT / slug
    runtime.mkdir(parents=True, exist_ok=True)
    shutil.copy2(atlas_path, runtime / atlas_path.name)
    if slug == "chaosdemon":
        shutil.copy2(south_gif, runtime / south_gif.name)
        # lesson/parent pages use the compact shared walker directory.
        shared = ROOT / "content" / "assets" / "walker-gifs"
        shared.mkdir(parents=True, exist_ok=True)
        shutil.copy2(south_gif, shared / south_gif.name)
    for direction in DIRECTIONS:
        direction_gif = base / "transparent" / "directions" / direction / f"{slug}-{direction}-walk-action.gif"
        runtime_dir = runtime / "directions"
        runtime_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(direction_gif, runtime_dir / direction_gif.name)

    return {
        "atlas": f"content/assets/generated/jttw-player-walkers/{slug}/{atlas_path.name}",
        "directions": list(DIRECTIONS),
        "framesPerDirection": 8,
        "frameSize": "384x512",
        "layout": "8 columns x 4 rows; rows east/south/west/north",
        "walkFrames": [1, 2, 3, 4],
        "actionFrames": [5, 6, 7, 8],
        "durationMs": FRAME_MS,
        "gifByDirection": {
            direction: f"content/assets/generated/jttw-player-walkers/{slug}/directions/{slug}-{direction}-walk-action.gif"
            for direction in DIRECTIONS
        },
        "alphaReports": reports,
        "sha256": {"atlas": sha256(atlas_path)},
    }


def update_manifest(records: dict[str, dict]) -> None:
    path = ASSET_ROOT / "manifest.json"
    manifest = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}
    chars = manifest.setdefault("characters", [])
    by_id = {str(item.get("id")): item for item in chars if isinstance(item, dict)}
    for slug, directional in records.items():
        item = by_id.get(slug)
        if item is None:
            zh, en = META[slug]
            item = {
                "id": slug,
                "name": {"zh": zh, "en": en},
                "frames": 8,
                "frameSize": "384x512",
                "durationMs": FRAME_MS,
                "loop": True,
                "gif": f"content/assets/generated/jttw-player-walkers/{slug}/{slug}-walk.gif",
                "runtimeFrames": f"content/assets/generated/jttw-player-walkers/{slug}/{slug}-walk-01.png .. {slug}-walk-08.png",
                "sourceSheet": f"assets/generated/jttw-player-walkers/{slug}/2d/directions/south/{slug}-south-walk-action-sheet.png",
            }
            chars.append(item)
            by_id[slug] = item
        item["directional"] = directional
    manifest["directionalContract"] = {
        "directions": list(DIRECTIONS),
        "rows": "east, south, west, north",
        "framesPerDirection": 8,
        "walkFrames": [1, 2, 3, 4],
        "actionFrames": [5, 6, 7, 8],
        "cellSize": "384x512",
        "transparent": True,
    }
    manifest["selection"] = "episode-stable main-character selection; c01 overrides are explicit in engine/walker-cast.js"
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--roles",
        default=",".join(ROLES),
        help="comma-separated role ids to process (default: all first-chapter roles)",
    )
    args = parser.parse_args()
    selected = tuple(item.strip() for item in str(args.roles).split(",") if item.strip())
    unknown = [item for item in selected if item not in ROLES]
    if unknown:
        raise SystemExit(f"unknown roles: {', '.join(unknown)}")
    records = {slug: build_role(slug) for slug in selected}
    update_manifest(records)
    print(json.dumps(records, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
