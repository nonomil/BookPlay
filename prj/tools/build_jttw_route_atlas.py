#!/usr/bin/env python3
"""Build the four-direction JTTW route companion atlas.

The generated front/back sheets are chroma-keyed first. This tool removes
separator pixels by keeping the largest connected character component in each
cell, aligns every frame to a shared foot baseline/pivot, mirrors the
approved side view for west, and packs rows in east/south/west/north order.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps
from scipy import ndimage


ROOT = Path(__file__).resolve().parents[2]
CELL_W, CELL_H = 384, 512
FRAMES = 8
BASELINE_Y = 466
PIVOT_X = CELL_W // 2


class Character:
    """Per-character path/prefix bundle. wukong keeps the historical layout."""

    def __init__(self, name: str) -> None:
        dir_names = {"wukong": "jttw-route-companion", "mikey": "mikey-jj-route-companion"}
        self.dir_name = dir_names.get(name, f"{name}-route-companion")
        self.frame_prefix = "wukong" if name == "wukong" else name
        self.canonical = ROOT / "assets/generated" / self.dir_name / "2d"
        self.runtime = ROOT / "content/assets/generated" / self.dir_name / "transparent"
        self.tmp = ROOT / "tmp/imagegen" / self.dir_name / "four-dir"


CHAR = Character("wukong")
CANONICAL = CHAR.canonical
RUNTIME = CHAR.runtime
TMP = CHAR.tmp


def _largest_component(alpha: np.ndarray) -> tuple[np.ndarray, tuple[int, int, int, int]]:
    """Return a cleaned mask and bbox for the largest visible component."""

    binary = alpha >= 20
    labels, count = ndimage.label(binary, structure=np.ones((3, 3), dtype=np.uint8))
    if count == 0:
        raise ValueError("sprite cell contains no visible pixels")
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    label_id = int(sizes.argmax())
    mask = labels == label_id
    ys, xs = np.where(mask)
    if not len(xs):
        raise ValueError("sprite cell component is empty")
    # Keep a tiny anti-aliased halo around the main component, but discard
    # separator lines and isolated green/white artifacts.
    keep = ndimage.binary_dilation(mask, iterations=2)
    return keep, (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))


def normalize_cell(cell: Image.Image, *, pivot_x: int = PIVOT_X) -> Image.Image:
    """Put one source cell on the fixed 384x512 canvas."""

    rgba = np.array(cell.convert("RGBA"), dtype=np.uint8)
    source_h, source_w = rgba.shape[:2]
    alpha = rgba[:, :, 3]
    keep, (xmin, ymin, xmax, ymax) = _largest_component(alpha)
    # Preserve original RGB/alpha inside the dilated component only.
    rgba[~keep, 3] = 0
    crop = Image.fromarray(rgba[max(0, ymin - 2) : min(source_h, ymax + 3),
                                max(0, xmin - 2) : min(source_w, xmax + 3)], "RGBA")
    crop_arr = np.array(crop, dtype=np.uint8)
    crop_x0 = max(0, xmin - 2)
    crop_y0 = max(0, ymin - 2)

    component_rows = np.where(keep)[0]
    bottom_rows = np.where(keep[max(0, ymax - 10) : ymax + 1])[1]
    foot_x = float(np.median(bottom_rows)) if len(bottom_rows) else (xmin + xmax) / 2
    # The source crop includes a two-pixel halo. Anchor using the original
    # component bbox so the visible foot line lands exactly on BASELINE_Y.
    paste_x = int(round(pivot_x - foot_x + xmin - crop_x0))
    paste_y = int(BASELINE_Y - (ymax - crop_y0))

    out = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    left = max(0, paste_x)
    top = max(0, paste_y)
    right = min(CELL_W, paste_x + crop.width)
    bottom = min(CELL_H, paste_y + crop.height)
    if right <= left or bottom <= top:
        raise ValueError("normalized sprite falls outside its canvas")
    clipped = crop.crop((left - paste_x, top - paste_y,
                         right - paste_x, bottom - paste_y))
    out.alpha_composite(clipped, (left, top))
    return out


def read_existing_side() -> list[Image.Image]:
    frames = []
    for i in range(1, FRAMES + 1):
        path = CANONICAL / f"{CHAR.frame_prefix}-walk-{i:02d}.png"
        with Image.open(path) as image:
            frames.append(image.convert("RGBA"))
    return frames


def read_generated_direction(name: str) -> list[Image.Image]:
    path = TMP / f"{CHAR.frame_prefix}-walk-{name}-transparent.png"
    if not path.is_file():
        raise FileNotFoundError(path)
    with Image.open(path) as image:
        sheet = image.convert("RGBA")
    # GPT image models may honor a side-view prompt as an 8x1 strip while
    # returning a 3:1 canvas, but generally return the requested 4x2 grid for
    # front/back.  Detect the grid from the actual aspect ratio instead of
    # assuming fixed 384x512 source cells; normalize_cell() will letterbox
    # either layout onto the runtime canvas without stretching the character.
    columns, rows = (8, 1) if sheet.width / max(sheet.height, 1) >= 2.2 else (4, 2)
    frames: list[Image.Image] = []
    for i in range(FRAMES):
        row, col = divmod(i, columns)
        x0 = round(col * sheet.width / columns)
        x1 = round((col + 1) * sheet.width / columns)
        y0 = round(row * sheet.height / rows)
        y1 = round((row + 1) * sheet.height / rows)
        cell = sheet.crop((x0, y0, x1, y1))
        frames.append(normalize_cell(cell))
    return frames


def save_frames(direction: str, frames: list[Image.Image]) -> None:
    out_dir = CANONICAL / "directions" / direction
    out_dir.mkdir(parents=True, exist_ok=True)
    for i, frame in enumerate(frames, 1):
        frame.save(out_dir / f"{CHAR.frame_prefix}-walk-{i:02d}.png", optimize=True)


def pack_strip(frames: list[Image.Image]) -> Image.Image:
    strip = Image.new("RGBA", (CELL_W * FRAMES, CELL_H), (0, 0, 0, 0))
    for i, frame in enumerate(frames):
        strip.alpha_composite(frame, (i * CELL_W, 0))
    return strip


def pack_atlas(rows: dict[str, list[Image.Image]]) -> Image.Image:
    atlas = Image.new("RGBA", (CELL_W * FRAMES, CELL_H * len(rows)), (0, 0, 0, 0))
    for row, direction in enumerate(rows):
        for col, frame in enumerate(rows[direction]):
            atlas.alpha_composite(frame, (col * CELL_W, row * CELL_H))
    return atlas


def write_outputs(rows: dict[str, list[Image.Image]]) -> None:
    CANONICAL.mkdir(parents=True, exist_ok=True)
    RUNTIME.mkdir(parents=True, exist_ok=True)
    atlas = pack_atlas(rows)
    atlas.save(CANONICAL / f"{CHAR.frame_prefix}-walk-atlas.png", optimize=True)
    atlas.save(RUNTIME / f"{CHAR.frame_prefix}-walk-atlas.png", optimize=True)
    for direction, frames in rows.items():
        save_frames(direction, frames)
        pack_strip(frames).save(CANONICAL / "directions" / f"{CHAR.frame_prefix}-walk-{direction}-strip.png", optimize=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check-only", action="store_true", help="build in memory and report dimensions")
    parser.add_argument("--character", default="wukong", help="companion name: wukong (default) or mikey")
    args = parser.parse_args()

    global CHAR, CANONICAL, RUNTIME, TMP
    CHAR = Character(args.character)
    CANONICAL = CHAR.canonical
    RUNTIME = CHAR.runtime
    TMP = CHAR.tmp

    east_sheet = TMP / f"{CHAR.frame_prefix}-walk-east-transparent.png"
    if east_sheet.is_file():
        east = read_generated_direction("east")
    else:
        east = read_existing_side()
    west = [ImageOps.mirror(frame) for frame in east]
    south = read_generated_direction("south")
    north = read_generated_direction("north")
    rows = {"east": east, "south": south, "west": west, "north": north}
    if not args.check_only:
        write_outputs(rows)
    print(f"directions={','.join(rows)} frames_per_direction={FRAMES} "
          f"cell={CELL_W}x{CELL_H} atlas={CELL_W * FRAMES}x{CELL_H * len(rows)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
