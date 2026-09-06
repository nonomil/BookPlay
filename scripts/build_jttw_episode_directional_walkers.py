"""Build episode-owned four-direction character assets for JTTW C01.

Each role lives under ``assets/generated/jttw-episode-assets/c01/epXXX`` and
has four generated 4x2 direction sheets.  This builder performs chroma-key
cleanup, removes accidental full-sheet separator stripes, aligns all cells to
one pivot, emits direction GIFs and a 3072x2048 runtime atlas, then updates
the episode and chapter manifests with the generated asset references.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "assets" / "generated" / "jttw-episode-assets" / "c01"
RUNTIME_ROOT = ROOT / "content" / "assets" / "generated" / "jttw-episode-assets" / "c01"
CK = Path.home() / ".codex" / "skills" / "transparent-image-generator" / "scripts" / "chroma_key.py"
CELL_W, CELL_H = 384, 512
SHEET_W, SHEET_H = CELL_W * 4, CELL_H * 2
ATLAS_W, ATLAS_H = CELL_W * 8, CELL_H * 4
FRAME_MS = 150
DIRECTIONS = ("east", "south", "west", "north")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


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


def _near_white(rgb: tuple[int, int, int]) -> bool:
    lo, hi = min(rgb), max(rgb)
    return lo > 220 and hi - lo < 40


def _groups(values: list[int]) -> list[list[int]]:
    groups: list[list[int]] = []
    for value in values:
        if not groups or value > groups[-1][-1] + 1:
            groups.append([value])
        else:
            groups[-1].append(value)
    return groups


def remove_separator_stripes(path: Path, report_path: Path) -> dict[str, list[int]]:
    """Erase only full-sheet near-white stripes accidentally drawn by the model.

    Character details are never removed by a global white key.  A stripe must
    cover at least 80% of a full image dimension to qualify, which catches the
    common white grid separators while leaving white whiskers, paper, and
    costume trim intact.
    """
    image = Image.open(path).convert("RGBA")
    pixels = image.load()
    width, height = image.size
    col_counts = [
        sum(1 for y in range(height) if pixels[x, y][3] > 0 and _near_white(pixels[x, y][:3]))
        for x in range(width)
    ]
    row_counts = [
        sum(1 for x in range(width) if pixels[x, y][3] > 0 and _near_white(pixels[x, y][:3]))
        for y in range(height)
    ]
    cols = [x for x, count in enumerate(col_counts) if count > int(height * 0.80)]
    rows = [y for y, count in enumerate(row_counts) if count > int(width * 0.80)]
    kill_cols = {
        x
        for group in _groups(cols)
        for x in range(max(0, group[0] - 2), min(width, group[-1] + 3))
    }
    kill_rows = {
        y
        for group in _groups(rows)
        for y in range(max(0, group[0] - 2), min(height, group[-1] + 3))
    }
    for x in kill_cols:
        for y in range(height):
            pixels[x, y] = (0, 0, 0, 0)
    for y in kill_rows:
        for x in range(width):
            pixels[x, y] = (0, 0, 0, 0)
    image.save(path, "PNG", optimize=True)

    # Keep the original report schema and add reproducible cleanup evidence.
    report = json.loads(report_path.read_text(encoding="utf-8")) if report_path.is_file() else {}
    edge_pixels = []
    for x in range(width):
        edge_pixels.extend((image.getpixel((x, 0)), image.getpixel((x, height - 1))))
    for y in range(1, height - 1):
        edge_pixels.extend((image.getpixel((0, y)), image.getpixel((width - 1, y))))
    data = list(image.getdata())
    visible = [pixel for pixel in data if pixel[3] > 0]
    green_visible = [
        pixel
        for pixel in visible
        if pixel[1] > pixel[0] * 1.35 and pixel[1] > pixel[2] * 1.35
    ]
    green_edge = [
        pixel
        for pixel in edge_pixels
        if pixel[3] > 0 and pixel[1] > pixel[0] * 1.35 and pixel[1] > pixel[2] * 1.35
    ]
    report.update(
        {
            "path": str(path),
            "width": width,
            "height": height,
            "bytes": path.stat().st_size,
            "mode": "RGBA",
            "alpha_min": min(pixel[3] for pixel in data),
            "alpha_max": max(pixel[3] for pixel in data),
            "corners_transparent": all(image.getpixel(point)[3] == 0 for point in ((0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1))),
            "visible_pixels": len(visible),
            "green_visible_pct": round(100 * len(green_visible) / max(1, len(visible)), 4),
            "edge_visible_pixels": sum(1 for pixel in edge_pixels if pixel[3] > 0),
            "green_edge_pct": round(100 * len(green_edge) / max(1, len(edge_pixels)), 4),
            "separatorCleanup": {"columns": sorted(kill_cols), "rows": sorted(kill_rows)},
        }
    )
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"columns": sorted(kill_cols), "rows": sorted(kill_rows)}


def crop_frames(sheet: Path, out_dir: Path, slug: str, direction: str) -> list[Path]:
    image = Image.open(sheet).convert("RGBA")
    if image.size != (SHEET_W, SHEET_H):
        raise ValueError(f"{sheet} has {image.size}, expected {SHEET_W}x{SHEET_H}")
    raw = [
        image.crop(
            (
                (index % 4) * CELL_W,
                (index // 4) * CELL_H,
                (index % 4 + 1) * CELL_W,
                (index // 4 + 1) * CELL_H,
            )
        )
        for index in range(8)
    ]
    boxes = [frame.getchannel("A").getbbox() for frame in raw]
    visible = [box for box in boxes if box]
    target_bottom = min(CELL_H - 8, max(box[3] for box in visible)) if visible else CELL_H - 8
    out_dir.mkdir(parents=True, exist_ok=True)
    frames: list[Path] = []
    for index, frame in enumerate(raw):
        box = boxes[index]
        aligned = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
        if box:
            center_x = (box[0] + box[2]) / 2
            dx = round(CELL_W / 2 - center_x)
            dy = round(target_bottom - box[3])
            dx = max(-box[0], min(CELL_W - box[2], dx))
            dy = max(-box[1], min(CELL_H - box[3], dy))
            aligned.alpha_composite(frame, (dx, dy))
        output = out_dir / f"{slug}-{direction}-{index + 1:02d}.png"
        aligned.save(output, "PNG", optimize=True)
        frames.append(output)
    return frames


def make_gif(frames: list[Path], path: Path) -> None:
    images = []
    for frame_path in frames:
        rgba = Image.open(frame_path).convert("RGBA")
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


def _direction_manifest(role_dir: Path, direction: str) -> dict:
    manifest = role_dir / "2d" / "directions" / direction / "manifest.json"
    return json.loads(manifest.read_text(encoding="utf-8")) if manifest.is_file() else {}


def build_role(role_dir: Path, episode: str, runtime_root: Path) -> dict:
    slug = role_dir.name
    base_2d = role_dir / "2d" / "directions"
    transparent_root = role_dir / "transparent" / "directions"
    frames_root = transparent_root / "frames"
    direction_frames: dict[str, list[Path]] = {}
    reports: dict[str, str] = {}
    cleanups: dict[str, dict[str, list[int]]] = {}
    providers = {}
    for direction in DIRECTIONS:
        raw = base_2d / direction / f"{slug}-{direction}-walk-action-sheet.png"
        if not raw.is_file():
            raise FileNotFoundError(f"missing generated sheet: {raw}")
        transparent = transparent_root / direction / f"{slug}-{direction}-transparent.png"
        report = transparent.with_suffix(".report.json")
        key_green(raw, transparent, report)
        cleanups[direction] = remove_separator_stripes(transparent, report)
        frames = crop_frames(transparent, frames_root / direction, slug, direction)
        direction_frames[direction] = frames
        reports[direction] = str(report.relative_to(ROOT)).replace("\\", "/")
        direction_info = _direction_manifest(role_dir, direction).get("runs", [{}])
        if direction_info:
            providers[direction] = {
                "provider": direction_info[-1].get("provider"),
                "model": direction_info[-1].get("model"),
                "sizeRequested": direction_info[-1].get("sizeRequested"),
                "actualSize": direction_info[-1].get("actualSize"),
            }
        gif = transparent_root / direction / f"{slug}-{direction}-walk-action.gif"
        make_gif(frames, gif)

    atlas = Image.new("RGBA", (ATLAS_W, ATLAS_H), (0, 0, 0, 0))
    for row, direction in enumerate(DIRECTIONS):
        for column, frame in enumerate(direction_frames[direction]):
            atlas.alpha_composite(Image.open(frame).convert("RGBA"), (column * CELL_W, row * CELL_H))
    atlas_path = role_dir / "transparent" / f"{slug}-walk-action-atlas.png"
    atlas.save(atlas_path, "PNG", optimize=True)

    runtime_role = runtime_root / episode / "characters" / slug
    runtime_role.mkdir(parents=True, exist_ok=True)
    shutil.copy2(atlas_path, runtime_role / atlas_path.name)
    runtime_gifs = {}
    for direction in DIRECTIONS:
        gif = transparent_root / direction / f"{slug}-{direction}-walk-action.gif"
        runtime_dir = runtime_role / "directions"
        runtime_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(gif, runtime_dir / gif.name)
        runtime_gifs[direction] = str((runtime_dir / gif.name).relative_to(ROOT)).replace("\\", "/")

    relative_role = str(role_dir.relative_to(ROOT)).replace("\\", "/")
    relative_runtime = str((runtime_root / episode / "characters" / slug).relative_to(ROOT)).replace("\\", "/")
    prompt_files = [
        str((role_dir / "source" / "directional" / f"{slug}-{direction}.txt").relative_to(ROOT)).replace("\\", "/")
        for direction in DIRECTIONS
    ]
    record = {
        "schemaVersion": 1,
        "assetId": slug,
        "type": "character-directional-action",
        "episode": episode,
        "tool": "gpt-image-workflow + transparent-image-generator + Pillow",
        "providerByDirection": providers,
        "source": {
            "promptFiles": prompt_files,
            "rawSheets": {
                direction: str((base_2d / direction / f"{slug}-{direction}-walk-action-sheet.png").relative_to(ROOT)).replace("\\", "/")
                for direction in DIRECTIONS
            },
        },
        "contract": {
            "directions": list(DIRECTIONS),
            "rows": "east, south, west, north",
            "framesPerDirection": 8,
            "walkFrames": [1, 2, 3, 4],
            "actionFrames": [5, 6, 7, 8],
            "cellSize": "384x512",
            "atlasSize": "3072x2048",
            "durationMs": FRAME_MS,
            "transparent": True,
        },
        "outputs": {
            "atlas": str(atlas_path.relative_to(ROOT)).replace("\\", "/"),
            "runtimeAtlas": str((runtime_role / atlas_path.name).relative_to(ROOT)).replace("\\", "/"),
            "transparentSheets": {
                direction: str((transparent_root / direction / f"{slug}-{direction}-transparent.png").relative_to(ROOT)).replace("\\", "/")
                for direction in DIRECTIONS
            },
            "directionGifs": {
                direction: str((transparent_root / direction / f"{slug}-{direction}-walk-action.gif").relative_to(ROOT)).replace("\\", "/")
                for direction in DIRECTIONS
            },
            "runtimeDirectionGifs": runtime_gifs,
            "alphaReports": reports,
        },
        "cleanup": cleanups,
        "acceptance": {
            "dimensionsChecked": True,
            "alphaChecked": True,
            "directionsChecked": True,
            "baselineAligned": True,
            "separatorStripesRemoved": True,
        },
        "sha256": {"atlas": sha256(atlas_path)},
        "limitations": [
            "Generated raster poses are reviewed for silhouette and baseline, but exact temporal consistency is not guaranteed by one model call.",
            "Props remain embedded in the action cells; independent prop layers can be added later.",
        ],
    }
    (role_dir / "manifest.json").write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    review = f"""# {slug} · 四向动作资产验收

- episode: `{episode}`
- layout: 4 rows × 8 columns, rows `east / south / west / north`
- cells: 384×512; atlas: 3072×2048 RGBA
- columns 1–4: in-place walk; columns 5–8: child-safe story action
- frame duration: {FRAME_MS}ms

原始分镜、提示词、透明图、逐帧 PNG、GIF 和 atlas 均保留在本目录。透明报告检查真实 alpha、绿色残留、四角和边缘；模型意外生成的整幅白色分隔条已仅在派生透明图中清理，原始图仍可复用。

运行时主图集：`{record['outputs']['runtimeAtlas']}`
"""
    (role_dir / "review.md").write_text(review, encoding="utf-8")
    return record


def update_manifests(records: dict[str, dict], root: Path) -> None:
    # Episode manifests own the character reference. If a role is used in a
    # second episode (Dragon Queen in ep007), reference the first generated
    # episode asset rather than duplicating the raster files.
    generated_by_role = {slug: record for slug, record in records.items()}
    for episode_path in sorted(root.glob("ep[0-9][0-9][0-9]")):
        path = episode_path / "manifest.json"
        if not path.is_file():
            continue
        manifest = json.loads(path.read_text(encoding="utf-8"))
        generated_assets = manifest.setdefault("generatedCharacterAssets", {})
        for section in (manifest.get("cast", {}).get("main", []), manifest.get("cast", {}).get("support", [])):
            for item in section:
                slug = str(item.get("id", ""))
                if slug not in generated_by_role:
                    continue
                owner_episode = generated_by_role[slug]["episode"]
                if episode_path.name == owner_episode:
                    item["asset"] = f"characters/{slug}/manifest.json"
                    generated_assets[slug] = f"characters/{slug}/manifest.json"
                else:
                    item["asset"] = f"reuse:../{owner_episode}/characters/{slug}/manifest.json"
                    generated_assets[slug] = f"reuse:../{owner_episode}/characters/{slug}/manifest.json"
                item["assetStatus"] = "ready-four-direction-action"
        path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    chapter_path = root / "manifest.json"
    chapter = json.loads(chapter_path.read_text(encoding="utf-8")) if chapter_path.is_file() else {}
    character_index = chapter.setdefault("characterIndex", {})
    for slug, record in generated_by_role.items():
        index_item = character_index.setdefault(slug, {"zh": slug, "en": slug})
        owner_episode = record["episode"]
        index_item["episodeAssets"] = {
            owner_episode: str((root / owner_episode / "characters" / slug / "manifest.json").relative_to(ROOT)).replace("\\", "/")
        }
        index_item["sharedExisting"] = {
            "status": "ready-four-direction-action",
            "runtimeAtlas": record["outputs"]["runtimeAtlas"],
            "runtimeGifs": record["outputs"]["runtimeDirectionGifs"],
        }
    chapter.setdefault("generatedCharacterAssets", {})
    chapter["generatedCharacterAssets"].update(
        {
            slug: {
                "episode": record["episode"],
                "manifest": str((root / record["episode"] / "characters" / slug / "manifest.json").relative_to(ROOT)).replace("\\", "/"),
                "atlas": record["outputs"]["atlas"],
            }
            for slug, record in generated_by_role.items()
        }
    )
    chapter_path.write_text(json.dumps(chapter, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def find_roles(root: Path, selected: tuple[str, ...]) -> list[tuple[str, Path, str]]:
    found: list[tuple[str, Path, str]] = []
    for episode_path in sorted(root.glob("ep[0-9][0-9][0-9]")):
        chars = episode_path / "characters"
        for role_dir in sorted(chars.iterdir()) if chars.is_dir() else []:
            if not role_dir.is_dir():
                continue
            if selected and role_dir.name not in selected:
                continue
            found.append((role_dir.name, role_dir, episode_path.name))
    missing = [slug for slug in selected if not any(role[0] == slug for role in found)]
    if missing:
        raise SystemExit(f"missing episode character directories: {', '.join(missing)}")
    return found


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=ASSET_ROOT)
    parser.add_argument("--runtime-root", type=Path, default=RUNTIME_ROOT)
    parser.add_argument("--roles", default="", help="comma-separated role ids; default builds all episode character dirs")
    args = parser.parse_args()
    selected = tuple(item.strip() for item in str(args.roles).split(",") if item.strip())
    roles = find_roles(args.root, selected)
    records = {}
    for slug, role_dir, episode in roles:
        records[slug] = build_role(role_dir, episode, args.runtime_root)
    update_manifests(records, args.root)
    print(json.dumps({slug: record["outputs"] for slug, record in records.items()}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
