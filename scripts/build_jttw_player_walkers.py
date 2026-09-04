"""Build runtime walker frames/GIFs from approved 4x2 character sheets.

The generated source sheets are staging artifacts. This script applies the
project chroma-key contract, keeps fixed 384x512 cells (so feet never wobble
or stretch), and publishes semantic PNG frames plus a small looping GIF for
the player avatar.
"""
from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "assets" / "generated" / "jttw-player-walkers"
RUNTIME_ROOT = ROOT / "content" / "assets" / "generated" / "jttw-player-walkers"
CK = Path.home() / ".codex" / "skills" / "transparent-image-generator" / "scripts" / "chroma_key.py"
CELL_W, CELL_H = 384, 512
FRAME_MS = 150

# Keep the character bible in one place so generated records, runtime names,
# and future selection tooling cannot drift apart.  The slugs are also the
# directory names used by the transparent/GIF outputs.
CHARACTER_META = {
    "tang": ("唐僧", "Tang Monk"),
    "bajie": ("猪八戒", "Zhu Bajie"),
    "shawujing": ("沙悟净", "Sha Wujing"),
    "guanyin": ("观音", "Guanyin"),
    "redboy": ("红孩儿", "Red Boy"),
    "ironfan": ("铁扇公主", "Princess Iron Fan"),
    "bullking": ("牛魔王", "Bull King"),
    "dragonking": ("东海龙王", "East Sea Dragon King"),
    "whitedragonhorse": ("白龙马", "White Dragon Horse"),
    "subodhi": ("菩提祖师", "Patriarch Subhuti"),
    "jadeemperor": ("玉皇大帝", "Jade Emperor"),
    "yellowwind": ("黄风大王", "Yellow Wind King"),
    "whitebone": ("白骨夫人", "Lady White Bone"),
    "blackwind": ("黑风大王", "Black Wind King"),
    "zhenyuan": ("镇元大仙", "Great Immortal Zhenyuan"),
    "hundredflowers": ("百花羞公主", "Princess Hundred Flowers"),
    "goldenhorn": ("金角大王", "Golden Horn"),
    "liondemon": ("狮魔王", "Lion Demon"),
    "tigerimmortal": ("虎力大仙", "Tiger Immortal"),
    "yellowbrows": ("黄眉怪", "Yellow Brows"),
    "powerdemon": ("大力妖王", "Demon of Power"),
    "spiderdemon": ("蜘蛛精", "Spider Spirit"),
    "centipededemon": ("多目怪", "Centipede Spirit"),
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def key_sheet(raw: Path, out: Path, report: Path, key: str, tolerance: int, strict: bool = True) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        sys.executable,
        "-X",
        "utf8",
        str(CK),
        str(raw),
        str(out),
        "--key",
        key,
        "--tolerance",
        str(tolerance),
        "--feather",
        "8",
        "--report",
        str(report),
    ]
    if strict:
        cmd.extend(["--fail-if-green-percent", "0"])
    subprocess.run(cmd, cwd=ROOT, check=True)


def key_sheet_multi(raw: Path, out: Path, report: Path, slug: str) -> None:
    """Remove the green cell matte and protect against white gutter mattes."""
    if slug != "bajie":
        # Some generations include a narrow white studio gutter around the
        # green matte.  Do not key white globally (it can erase ivory robes or
        # pearls); key green first, then clear only the guaranteed-safe outer
        # safety border before writing the final alpha report.
        intermediate = out.with_name(out.stem + "-green.png")
        intermediate_report = intermediate.with_suffix(".report.json")
        key_sheet(raw, intermediate, intermediate_report, "0,255,0", 180, strict=False)
        image = Image.open(intermediate).convert("RGBA")
        pix = image.load()
        safety = 16
        for y in range(image.height):
            for x in range(image.width):
                if x < safety or y < safety or x >= image.width - safety or y >= image.height - safety:
                    r, g, b, _a = pix[x, y]
                    # The prompt reserves this margin for gutters; clearing
                    # it removes white/green corner mattes without touching
                    # the character silhouette.
                    pix[x, y] = (r, g, b, 0)
        image.save(out, "PNG", optimize=True)
        write_quality_report(image, out, report)
        intermediate.unlink(missing_ok=True)
        intermediate_report.unlink(missing_ok=True)
        return
    intermediate = out.with_name(out.stem + "-green.png")
    key_sheet(raw, intermediate, intermediate.with_suffix(".report.json"), "0,255,0", 180, strict=False)
    key_sheet(intermediate, out, report, "255,255,255", 16)
    intermediate.unlink(missing_ok=True)
    intermediate.with_suffix(".report.json").unlink(missing_ok=True)


def _strict_green(pixel: tuple[int, int, int, int], threshold: int = 16) -> bool:
    red, green, blue, alpha = pixel
    return alpha > threshold and green > 170 and red < 100 and blue < 100 and green - red > 70 and green - blue > 70


def write_quality_report(image: Image.Image, output: Path, report_path: Path) -> None:
    """Write the same compact alpha evidence used by chroma_key.py."""
    rgba = image.convert("RGBA")
    pixels = list(rgba.getdata())
    alpha = [pixel[3] for pixel in pixels]
    visible = [pixel for pixel in pixels if pixel[3] > 16]
    width, height = rgba.size
    edge = [
        rgba.getpixel((x, y))
        for y in range(height)
        for x in range(width)
        if x < 4 or y < 4 or x >= width - 4 or y >= height - 4
    ]
    edge_visible = [pixel for pixel in edge if pixel[3] > 16]
    corners = [rgba.getpixel(point)[3] == 0 for point in ((0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1))]
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps({
        "path": str(output),
        "width": width,
        "height": height,
        "bytes": output.stat().st_size,
        "mode": "RGBA",
        "alpha_min": min(alpha),
        "alpha_max": max(alpha),
        "corners_transparent": all(corners),
        "visible_pixels": len(visible),
        "green_visible_pct": round(sum(_strict_green(pixel) for pixel in visible) / max(1, len(visible)) * 100, 4),
        "edge_visible_pixels": len(edge_visible),
        "green_edge_pct": round(sum(_strict_green(pixel) for pixel in edge_visible) / max(1, len(edge_visible)) * 100, 4),
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def crop_frames(sheet: Path, out_dir: Path, slug: str) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    im = Image.open(sheet).convert("RGBA")
    if im.size != (CELL_W * 4, CELL_H * 2):
        raise ValueError(f"{sheet} has {im.size}, expected 1536x1024")
    raw_frames: list[Image.Image] = []
    for i in range(8):
        x, y = (i % 4) * CELL_W, (i // 4) * CELL_H
        raw_frames.append(im.crop((x, y, x + CELL_W, y + CELL_H)))

    # Generated sheets sometimes place the second row a few pixels higher or
    # let a prop touch the cell edge. Re-anchor every frame to one foot
    # baseline and one horizontal pivot while retaining the fixed canvas.
    boxes = [frame.getchannel("A").getbbox() for frame in raw_frames]
    visible_boxes = [box for box in boxes if box]
    target_bottom = min(CELL_H - 8, max(box[3] for box in visible_boxes))
    frames: list[Path] = []
    for i, frame in enumerate(raw_frames):
        box = boxes[i]
        if not box:
            aligned = frame
        else:
            cx = (box[0] + box[2]) / 2
            dx = round(CELL_W / 2 - cx)
            dy = round(target_bottom - box[3])
            dx = max(-box[0], min(CELL_W - box[2], dx))
            dy = max(-box[1], min(CELL_H - box[3], dy))
            aligned = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
            aligned.alpha_composite(frame, (dx, dy))
        # Remove occasional one-pixel studio-matte rules left at the extreme
        # cell edges (a generated sheet can contain a pale green/white frame
        # line even after chroma-keying). A real character part cannot occupy
        # more than half of a border column continuously.
        alpha = aligned.getchannel("A")
        for edge_x in list(range(16)) + list(range(CELL_W - 16, CELL_W)):
            if sum(1 for y in range(CELL_H) if alpha.getpixel((edge_x, y)) > 16) > CELL_H * 0.5:
                for y in range(CELL_H):
                    aligned.putpixel((edge_x, y), (0, 0, 0, 0))
        for edge_y in list(range(16)) + list(range(CELL_H - 16, CELL_H)):
            if sum(1 for x in range(CELL_W) if alpha.getpixel((x, edge_y)) > 16) > CELL_W * 0.5:
                for x in range(CELL_W):
                    aligned.putpixel((x, edge_y), (0, 0, 0, 0))
        # A few generated sheets have a pale matte rule just inside the
        # nominal 16px safety margin after the baseline shift. Detect only a
        # row/column that is overwhelmingly near-white (or near-green), so a
        # character's cream robe/highlight is never removed accidentally.
        for y in range(CELL_H):
            matte = sum(
                1 for x in range(CELL_W)
                if aligned.getpixel((x, y))[3] > 16
                and (
                    min(aligned.getpixel((x, y))[:3]) > 238
                    or (
                        aligned.getpixel((x, y))[1] > 220
                        and aligned.getpixel((x, y))[0] > 150
                        and aligned.getpixel((x, y))[2] > 150
                        and aligned.getpixel((x, y))[1] - aligned.getpixel((x, y))[0] > 20
                        and aligned.getpixel((x, y))[1] - aligned.getpixel((x, y))[2] > 20
                    )
                )
            )
            if matte > CELL_W * 0.5:
                for x in range(CELL_W):
                    aligned.putpixel((x, y), (0, 0, 0, 0))
        for x in range(CELL_W):
            matte = sum(
                1 for y in range(CELL_H)
                if aligned.getpixel((x, y))[3] > 16
                and (
                    min(aligned.getpixel((x, y))[:3]) > 238
                    or (
                        aligned.getpixel((x, y))[1] > 220
                        and aligned.getpixel((x, y))[0] > 150
                        and aligned.getpixel((x, y))[2] > 150
                        and aligned.getpixel((x, y))[1] - aligned.getpixel((x, y))[0] > 20
                        and aligned.getpixel((x, y))[1] - aligned.getpixel((x, y))[2] > 20
                    )
                )
            )
            if matte > CELL_H * 0.5:
                for y in range(CELL_H):
                    aligned.putpixel((x, y), (0, 0, 0, 0))
        path = out_dir / f"{slug}-walk-{i + 1:02d}.png"
        aligned.save(path, "PNG", optimize=True)
        frames.append(path)
    return frames


def make_gif(frames: list[Path], path: Path) -> None:
    images = []
    for frame in frames:
        rgba = Image.open(frame).convert("RGBA")
        alpha = rgba.getchannel("A")
        # Reserve palette index 255 for transparency. Pillow's direct RGBA
        # GIF conversion may otherwise assign the transparent pixels a black
        # opaque index on later frames (visible as a flash in the circle).
        rgb = Image.new("RGB", rgba.size, (0, 0, 0))
        rgb.paste(rgba, mask=alpha)
        indexed = rgb.quantize(colors=255, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        palette = indexed.getpalette() or []
        palette.extend([0] * (768 - len(palette)))
        palette[255 * 3:255 * 3 + 3] = [0, 0, 0]
        indexed.putpalette(palette)
        transparent_mask = alpha.point(lambda value: 255 if value == 0 else 0)
        indexed.paste(255, (0, 0), transparent_mask)
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


def process_generated(slug: str) -> dict:
    base = ASSET_ROOT / slug
    raw = base / "2d" / f"{slug}-walk-sheet.png"
    transparent = base / "transparent" / f"{slug}-walk-sheet-transparent.png"
    report = base / "transparent" / f"{slug}-walk-sheet-transparent.report.json"
    key_sheet_multi(raw, transparent, report, slug)
    frames = crop_frames(transparent, base / "transparent" / "frames", slug)
    gif = base / "transparent" / f"{slug}-walk.gif"
    make_gif(frames, gif)

    runtime = RUNTIME_ROOT / slug
    runtime.mkdir(parents=True, exist_ok=True)
    for frame in frames:
        shutil.copy2(frame, runtime / frame.name)
    shutil.copy2(gif, runtime / gif.name)
    shutil.copy2(transparent, runtime / transparent.name)
    shutil.copy2(report, runtime / report.name)

    name_zh, name_en = CHARACTER_META[slug]
    return {
        "id": slug,
        "name": {"zh": name_zh, "en": name_en},
        "frames": 8,
        "frameSize": "384x512",
        "durationMs": FRAME_MS,
        "loop": True,
        "gif": f"content/assets/generated/jttw-player-walkers/{slug}/{gif.name}",
        "runtimeFrames": f"content/assets/generated/jttw-player-walkers/{slug}/{slug}-walk-01.png .. {slug}-walk-08.png",
        "sourceSheet": f"assets/generated/jttw-player-walkers/{slug}/2d/{raw.name}",
        "alphaReport": f"assets/generated/jttw-player-walkers/{slug}/transparent/{report.name}",
        "sha256": {"gif": sha256(gif), "frame01": sha256(frames[0])},
    }


def copy_wukong() -> dict:
    slug = "wukong"
    src_base = ASSET_ROOT.parent / "jttw-route-companion" / "2d"
    src_gif = src_base / "wukong-walk.gif"
    src_frames = [src_base / f"wukong-walk-{i:02d}.png" for i in range(1, 9)]
    runtime = RUNTIME_ROOT / slug
    runtime.mkdir(parents=True, exist_ok=True)
    for frame in src_frames:
        shutil.copy2(frame, runtime / frame.name)
    shutil.copy2(src_gif, runtime / src_gif.name)
    return {
        "id": slug,
        "name": {"zh": "孙悟空", "en": "Sun Wukong"},
        "frames": 8,
        "frameSize": "384x512",
        "durationMs": 120,
        "loop": True,
        "gif": f"content/assets/generated/jttw-player-walkers/{slug}/wukong-walk.gif",
        "runtimeFrames": f"content/assets/generated/jttw-player-walkers/{slug}/wukong-walk-01.png .. wukong-walk-08.png",
        "sourceSheet": "assets/generated/jttw-route-companion/2d/wukong-walk-strip.png",
        "sha256": {"gif": sha256(src_gif), "frame01": sha256(src_frames[0])},
    }


def main() -> int:
    records = [copy_wukong()]
    for slug in ("tang", "bajie", "shawujing", "guanyin", "redboy", "ironfan", "bullking", "dragonking", "whitedragonhorse", "subodhi", "jadeemperor", "yellowwind", "whitebone", "blackwind", "zhenyuan", "hundredflowers", "goldenhorn", "liondemon", "tigerimmortal", "yellowbrows", "powerdemon", "spiderdemon", "centipededemon"):
        records.append(process_generated(slug))
    manifest = {
        "schemaVersion": 1,
        "assetId": "jttw-player-walkers",
        "tool": "gpt-image-workflow + transparent-image-generator + Pillow",
        "layout": "4 columns x 2 rows, 384x512 cells",
        "frameOrder": ["contact", "left-foot-forward", "passing", "right-foot-forward"] * 2,
        "characters": records,
        "selection": "episode-stable weighted main-character selection in prj/engine/wala.js",
    }
    ASSET_ROOT.mkdir(parents=True, exist_ok=True)
    (ASSET_ROOT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    (ASSET_ROOT / "review.md").write_text(
        "# 西游记播放器角色行走动图\n\n"
        "所有剧情角色均使用 8 帧、384×512 固定画布，150ms（悟空现有素材 120ms）循环。\n"
        "所有新生成图先经 chroma-key 去背并生成 alpha 报告，再按固定网格裁切；运行时使用 GIF，\n"
        "同一集先用精确篇章标题线索，再用字幕/说话人加权后只选择一个角色，\n"
        "不在句子之间随机跳变；没有明确标题线索时才回退到孙悟空。\n\n"
        "当前角色池：孙悟空、唐僧、猪八戒、沙悟净、观音、红孩儿、铁扇公主、牛魔王、东海龙王、\n"
        "白龙马、菩提祖师、玉皇大帝、黄风大王、白骨夫人、黑风大王、镇元大仙、\n"
        "百花羞公主、金角大王、狮魔王、虎力大仙、黄眉怪、大力妖王、蜘蛛精、多目怪。\n"
        "标题命中权重最高，英文/中文字幕作为辅助证据；\n"
        "同分按集数稳定选择。\n",
        encoding="utf-8",
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
