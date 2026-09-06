"""Create reusable four-direction action-sheet prompts for C01 episode roles.

The generated source files stay next to each episode character asset so future
variants can reuse the same identity and action contract without credentials.
"""
from __future__ import annotations

import argparse
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ROOT = ROOT / "assets" / "generated" / "jttw-episode-assets" / "c01"
DIRECTIONS = {
    "east": "side view facing RIGHT (east)",
    "south": "front view facing the viewer (south/down)",
    "west": "side view facing LEFT (west)",
    "north": "back view walking AWAY from the viewer (north/up), no face visible",
}

ROLES = {
    "dragon-queen": {
        "episode": "ep006",
        "zh": "龙王后",
        "en": "Dragon Queen",
        "identity": "an original child-safe upright turquoise sea-dragon queen with friendly eyes, short whiskers, small golden crown-horns, pearl hair ornaments, a sea-green and sapphire robe with wave embroidery, coral sash, shell fan, and compact clawed feet; never a long snake body",
        "walk": "The first four cells are a graceful in-place walk cycle with robe hem, whiskers, sash, fan and tail tip moving while the feet share one baseline.",
        "action": "The last four cells show a welcoming tide-greeting cycle: open the shell fan, lift a pearl, draw one small blue wave ribbon, then close the fan and settle; no attack or flooding.",
        "avoid": "no long serpentine body, no trident, no extra characters, no frightening expression, no water scenery",
    },
    "turtle-soldier": {
        "episode": "ep006",
        "zh": "龟将军",
        "en": "Turtle Soldier",
        "identity": "an original child-safe compact anthropomorphic green sea turtle palace guard with warm eyes, round jade shell, teal tunic, coral-and-gold shoulder cape, shell badge, sturdy webbed feet, and one short padded ceremonial spear; never a realistic animal on four legs",
        "walk": "The first four cells are a sturdy in-place walk cycle with alternating feet, shell bob, cape and spear hand moving while the shell stays centered.",
        "action": "The last four cells show a harmless guard-demonstration cycle: raise the padded spear in greeting, point toward the treasury, make one slow practice sweep, then return to rest; no stabbing or impact.",
        "avoid": "no sharp weapon, no battle damage, no extra characters, no realistic turtle crawl, no aggressive face",
    },
    "octopus-helper": {
        "episode": "ep006",
        "zh": "章鱼侍从",
        "en": "Octopus Palace Helper",
        "identity": "an original child-safe small lavender-and-teal eight-armed octopus palace helper with bright eyes, tiny gold circlet, blue vest with wave trim, coral sash, pearl satchel, and soft rounded tentacle feet; keep exactly eight readable arms, no scary suction cups",
        "walk": "The first four cells are a cheerful in-place waddling cycle with eight arms gently alternating, satchel bobbing and tentacles sharing one baseline.",
        "action": "The last four cells show a helpful delivery cycle: present a pearl parcel, raise a tiny bubble ribbon, point toward the weapon vault, then tuck the parcel back; no combat.",
        "avoid": "no extra arms, no missing arms, no tentacle monster, no scary face, no extra characters, no underwater scenery",
    },
    "underworld-spirit": {
        "episode": "ep007",
        "zh": "幽冥小鬼",
        "en": "Underworld Spirit",
        "identity": "an original child-safe friendly pale-blue underworld spirit with a rounded face, soft cloud-like lower body, teal hood, tiny gold name-token badge, small lantern, and a gentle smile; float just above the baseline but remain compact and readable",
        "walk": "The first four cells are a slow bobbing in-place float cycle with the hood, lantern and cloud-tail swaying while the character remains centered on one shared pivot.",
        "action": "The last four cells show a comic guiding cycle: lift the lantern, reveal one glowing name token, make a small welcoming wave, then tuck the token away; no horror or attack.",
        "avoid": "no skull, no bones, no blood, no frightening ghost, no chains, no extra characters, no dark scenery",
    },
    "judge-of-dead": {
        "episode": "ep007",
        "zh": "死者审判官",
        "en": "Judge of the Dead",
        "identity": "an original child-safe dignified underworld judge with kind stern eyes, short charcoal beard, black scholar hat with a jade bead, burgundy robe with gold cloud trim, teal belt, ink brush, and a large blue Directory ledger; compact upright human proportions",
        "walk": "The first four cells are a measured in-place walk cycle with robe hem, sleeves, beard, brush and ledger moving while both shoes keep one baseline.",
        "action": "The last four cells show a fair-records cycle: open the Directory ledger, raise the brush, place one gentle glowing mark, then close the ledger and settle; no punishment, fire or violence.",
        "avoid": "no skeletal face, no horror, no fire, no extra characters, no huge book hiding the body, no weapon",
    },
    "demon-guard": {
        "episode": "ep005",
        "zh": "妖怪守卫",
        "en": "Demon Guard",
        "identity": "an original child-safe friendly dark-purple mountain demon guard with rounded charcoal horns, warm amber eyes, teal scarf, russet padded vest, broad gold belt, sturdy boots, a small foam cloud-club and a rounded practice shield; compact humanoid proportions",
        "walk": "The first four cells are a chunky in-place walk cycle with alternating feet, scarf bounce, shield sway and club held safely down.",
        "action": "The last four cells show a harmless training cycle: raise the practice shield, make one slow foam-club salute, point to the training field, then return to ready pose; no hitting, sparks or damage.",
        "avoid": "no sharp weapons, no blood, no frightening face, no extra characters, no oversized club, no battle damage",
    },
}


def make_prompt(role: dict[str, str], direction: str, direction_text: str) -> str:
    return f"""Use case: engine-ready 2D storybook game asset for a Journey to the West learning mini-game in episode {role['episode']}.
Character: original, child-safe {role['en']} ({role['zh']}), {role['identity']}.
Direction: {direction_text}. Preserve the exact same character identity, costume layers, palette, body proportions, signature props and foot/pivot baseline in every direction. East and west are true side views, south clearly shows the face, and north clearly shows the back of the same costume.

Create exactly one sprite sheet on a perfectly flat #00ff00 chroma-key background, with no scenery and no text. Exactly 8 equal portrait cells in a 4 columns x 2 rows grid, final sheet 1536x1024, each cell 384x512. Keep generous green gutters, one complete character per cell, centered, never clipped or overlapping, and all feet or floating pivots on one shared absolute baseline. Read cells left-to-right on the top row, then left-to-right on the bottom row.

{role['walk']} {role['action']}
Frames 1-4 are walk poses in this order: contact, left-foot-forward, passing, right-foot-forward. Frames 5-8 are action poses in this order: anticipation, action-open, action-peak, settle. The same prop must keep its identity and scale. Keep every frame readable at 36x48 pixels, with crisp dark-brown outline and softly textured children’s storybook fills.

Lighting and style: bright welcoming Chinese-fantasy palette, polished 2D game illustration, even light, no cast shadow. {role['avoid']}. Also avoid motion blur, watermark, logo, typography, changing camera zoom, oval or stretched body, duplicate limbs, cropped hands or feet, matte lines, checkerboard or fake transparency.
"""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    args = parser.parse_args()
    root = args.root
    count = 0
    for slug, role in ROLES.items():
        source = root / role["episode"] / "characters" / slug / "source" / "directional"
        source.mkdir(parents=True, exist_ok=True)
        for direction, direction_text in DIRECTIONS.items():
            path = source / f"{slug}-{direction}.txt"
            path.write_text(make_prompt(role, direction, direction_text), encoding="utf-8")
            count += 1
    print(f"wrote {count} prompts for {len(ROLES)} roles")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
