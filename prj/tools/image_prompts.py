#!/usr/bin/env python3
"""从三层 JSON 生成生图提示词（F6 的素材契约）。

用法:
    python tools/image_prompts.py

产出 prompts/ 目录:
  <character_id>_base.txt      角色设定基准图（后续所有姿态的参考图）
  <character_id>_<emotion>.txt 表情变体（配基准图作参考图使用）
  scene_<scene_id>.txt         场景背景
  manifest.json                批量生成清单（推荐工具: Nano Banana / gemini-2.5-flash-image）

一致性策略（见 DS--调研资料.md §6.1）:
  先用 base prompt 生成每角色一张基准图；表情变体与场景图一律把基准图作为
  参考图输入（gemini-2.5-flash-image 支持最多 3 张参考图），并拼接全局风格锚点。
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "prompts"

EN = """Nano Banana (gemini-2.5-flash-image) prompt
=== base (generate this first, per character) ===
{base}
=== variants (pass the BASE IMAGE as reference image + this instruction) ===
{variant}
=== scene (pass relevant character bases as reference if characters appear) ===
{scene}
"""


def main() -> int:
    world = json.loads((DATA / "world.json").read_text(encoding="utf-8"))
    outline = json.loads((DATA / "story_outline.json").read_text(encoding="utf-8"))
    anchor = world["art_style_anchor"]
    OUT.mkdir(exist_ok=True)

    manifest = {"style_anchor": anchor, "tool": "gemini-2.5-flash-image", "items": []}

    for cid in sorted(p.stem for p in (DATA / "characters").glob("*.json")):
        c = json.loads((DATA / "characters" / f"{cid}.json").read_text(encoding="utf-8"))
        base = (
            f"Full-body character reference sheet, front view, {c['visual_description_en']}. "
            f"Role: {c['role']}. Personality: {c['personality_en']}. "
            f"Style: {anchor}. Plain light background, no text."
        )
        (OUT / f"{cid}_base.txt").write_text(
            EN.format(base=base, variant="(see per-emotion files)", scene="(n/a)"), encoding="utf-8"
        )
        manifest["items"].append({"id": f"{cid}_base", "prompt_file": f"{cid}_base.txt", "reference_images": [], "out": f"assets/characters/{cid}_base.png"})
        for emo in (c.get("emotions") or {}):
            variant = (
                f"Same character as the reference image, unchanged design, colors and proportions. "
                f"Change only the expression to: {emo}. Style: {anchor}. No text."
            )
            (OUT / f"{cid}_{emo}.txt").write_text(
                EN.format(base="(already generated)", variant=variant, scene="(n/a)"), encoding="utf-8"
            )
            manifest["items"].append({
                "id": f"{cid}_{emo}", "prompt_file": f"{cid}_{emo}.txt",
                "reference_images": [f"assets/characters/{cid}_base.png"],
                "out": f"assets/characters/{cid}_{emo}.png",
            })

    for sid in [s for ch in outline["chapters"] for s in ch["scenes"]]:
        scene = json.loads((DATA / "scenes" / f"{sid}.json").read_text(encoding="utf-8"))
        p = (
            f"Storybook background art, establishing shot: {scene['location']['en']} "
            f"({scene['location']['zh']}). A tall waterfall pouring into a green valley, "
            f"magic atmosphere. Style: {anchor}. Landscape 16:9, no characters, no text."
        )
        (OUT / f"scene_{sid}.txt").write_text(p, encoding="utf-8")
        manifest["items"].append({"id": f"scene_{sid}", "prompt_file": f"scene_{sid}.txt", "reference_images": [], "out": scene["background"].replace(".svg", ".png")})

    (OUT / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"已生成 {len(manifest['items'])} 条生图任务 -> {OUT}/manifest.json")
    print("说明: 先跑 *_base，再以其为参考图跑变体（Nano Banana 最多 3 张参考图）。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
