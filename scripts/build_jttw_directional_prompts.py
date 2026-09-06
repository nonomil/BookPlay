"""Write reusable four-direction action-sheet prompts for the first JTTW arc.

The image runner consumes one prompt per direction.  Keeping the prompt files
beside the generated asset makes later chapters reproducible without putting
provider credentials in the project.
"""
from __future__ import annotations

from pathlib import Path
import argparse


ROOT = Path(__file__).resolve().parents[1]
PROMPT_ROOT = ROOT / "assets" / "generated" / "jttw-player-walkers"

ROLES = {
    "wukong": {
        "zh": "孙悟空",
        "en": "Sun Wukong",
        "identity": "a friendly golden-brown monkey hero with a peach muzzle, bright eyes, a small gold circlet, a short red scarf, an ochre-gold cloud-pattern tunic, curled tail, and a compact red-and-gold Ruyi staff",
        "walk": "The first four cells are a clear in-place walk cycle with alternating feet and natural arm swing.",
        "action": "The last four cells show a playful staff-action cycle: lift the short Ruyi staff, sweep it safely across the body, point it upward, then settle back to ready pose; no impact or violence.",
        "avoid": "no extra characters, no giant staff, no battle damage, no aggressive expression",
    },
    "subodhi": {
        "zh": "菩提祖师",
        "en": "Patriarch Subhuti",
        "identity": "an approachable elderly mountain sage with silver eyebrows, a short white beard, rounded scholar cap, plum-purple robe, teal sash, cloth shoes, and a small bamboo teaching scroll",
        "walk": "The first four cells are a gentle in-place walk cycle with robe hem, sleeves, beard and scroll moving naturally.",
        "action": "The last four cells show a calm teaching-magic cycle: open the scroll, raise one hand with a small warm-gold talisman glow, trace a circle, then return the scroll to his side; child-safe and non-violent.",
        "avoid": "no staff, no sword, no extra characters, no scary magic, no floating body",
    },
    "chaosdemon": {
        "zh": "混世魔王",
        "en": "Demon of Chaos",
        "identity": "a child-safe, friendly dark-indigo mountain demon with rounded charcoal horns, warm amber eyes, a russet vest over a teal tunic, a broad gold belt, sturdy boots, and a small padded cloud-club prop",
        "walk": "The first four cells are a chunky in-place walk cycle with alternating feet, swinging arms and a tiny shoulder bounce.",
        "action": "The last four cells show a harmless training cycle with the padded cloud-club: hold low, make one wide slow practice sweep, lift it overhead, then rest it by the side; no hitting, sparks or damage.",
        "avoid": "no frightening face, no sharp weapon, no blood, no extra characters, no oversized club",
    },
    "dragonking": {
        "zh": "东海龙王",
        "en": "East Sea Dragon King",
        "identity": "an upright compact teal-blue dragon ruler with friendly eyes, short whiskers, small golden horns, sapphire robe with wave trim, coral sash, little pearl, and short clawed feet; never a long snake body",
        "walk": "The first four cells are an in-place walk cycle with robe hem, whiskers, arms and tail tip moving while both feet stay on one baseline.",
        "action": "The last four cells show a gentle water-magic cycle: lift the pearl, draw a small blue wave ribbon, let it arc around the body, then lower the pearl; no attack, no flooding and no other characters.",
        "avoid": "no long serpentine tail, no trident, no aggressive expression, no extra characters, no water background",
    },
    "gibbon": {
        "zh": "长臂猿",
        "en": "Gibbon elder",
        "identity": "a friendly elder gibbon with warm cinnamon-brown fur, a cream muzzle, expressive round eyes, long slim arms, a moss-green sash, a small blue shoulder cloth, and a tiny fruit pouch; distinct from Sun Wukong and with no crown or staff",
        "walk": "The first four cells are a relaxed in-place walk cycle with long arms swinging gently and the short tail staying above the shared foot baseline.",
        "action": "The last four cells show a welcoming guide cycle: cup one hand to call the troop, point toward a waterfall map, wave both arms, then settle with the fruit pouch at the side; no weapon.",
        "avoid": "no crown, no staff, no red scarf, no duplicate monkeys, no scary expression, no long tail dragging on the ground",
    },
    "generic-monkey": {
        "zh": "猴群成员",
        "en": "Monkey troop member",
        "identity": "a small friendly chestnut-brown monkey troop member with a peach muzzle, bright eyes, a lemon-yellow leaf vest, a turquoise waist cord, a short curled tail, and simple cloth ankle wraps; clearly not Sun Wukong",
        "walk": "The first four cells are a light in-place walk cycle with small alternating steps, a gentle tail curl and natural arm swing.",
        "action": "The last four cells show a cheerful troop action: hold a round fruit, lift it in celebration, wave toward a friend, then return to a relaxed stance; no weapon and no crowd in the sheet.",
        "avoid": "no crown, no staff, no red scarf, no armor, no multiple characters, no scary face, no long limbs, no text",
    },
    "heaven-captain": {
        "zh": "天庭将领",
        "en": "Heaven captain",
        "identity": "a kind celestial captain with warm tan skin, neat black topknot, sky-blue cloud-trim robe under soft gold shoulder guards, a crimson sash, white cloud boots, and a small rolled report scroll; polished storybook official, not a warrior",
        "walk": "The first four cells are a dignified in-place walk cycle with a small shoulder bounce, robe hem movement and the report scroll held safely at the side.",
        "action": "The last four cells show a messenger action: unfold the report scroll, raise one hand toward the Earth, point at a tiny light marker on the scroll, then salute and settle; no sword or combat.",
        "avoid": "no spear, no sword, no helmet hiding the face, no stern or frightening expression, no extra celestial soldiers, no background palace",
    },
    "woodcutter": {
        "zh": "樵夫",
        "en": "Woodcutter",
        "identity": "a friendly mountain woodcutter with sun-browned skin, a straw hat, russet vest over a moss-green shirt, brown trousers, sturdy cloth shoes, a teal waist sash, and a small wooden axe held safely downward; approachable guide, not a fighter",
        "walk": "The first four cells are a practical in-place walk cycle with the straw hat, sash and safe-downward axe moving slightly while both feet share one baseline.",
        "action": "The last four cells show a helpful trail-guide action: point up the mountain path, lift the axe to rest on one shoulder, open a hand-drawn trail note, then wave goodbye; no chopping, sparks or impact.",
        "avoid": "no blood, no chopping impact, no aggressive pose, no extra people, no giant axe, no forest background, no text",
    },
    "temple-student": {
        "zh": "菩提门下弟子",
        "en": "Temple student",
        "identity": "a friendly young adult temple student with a tidy black topknot, warm tan skin, plum-purple student robe, teal sash, cream undershirt, cloth shoes, and a slim bamboo lesson scroll; modest and curious, distinct from Patriarch Subhuti",
        "walk": "The first four cells are a quiet in-place walk cycle with robe hem and scroll hand moving naturally, small steps and a shared foot baseline.",
        "action": "The last four cells show a learning action: open the bamboo scroll, raise a questioning hand, bow respectfully, then close the scroll and settle; no weapon and no extra students.",
        "avoid": "no long white beard, no scholar cap, no staff, no magic blast, no extra characters, no text, no frightening expression",
    },
}

DIRECTIONS = {
    "east": "side view facing RIGHT (east)",
    "south": "front view facing the viewer (south/down)",
    "west": "side view facing LEFT (west)",
    "north": "back view walking AWAY from the viewer (north/up), no face visible",
}


def prompt(role_id: str, role: dict[str, str], direction_id: str, direction: str) -> str:
    return f"""Use case: transparent-ready 2D storybook game asset for a Journey to the West learning mini-game.
Character: original, child-safe {role['en']} ({role['zh']}), {role['identity']}.
Direction: {direction}. Keep the same orthographic camera, scale, proportions, costume layers, palette, signature prop and foot baseline as the other directions. The north row must show the back of the same costume; east and west are true side views, not three-quarter views; south clearly shows the face.

Create exactly one sprite sheet on a perfectly flat #00ff00 chroma-key background, no scenery and no text. Exactly 8 equal portrait cells in a 4 columns x 2 rows grid, final sheet 1536x1024, each cell 384x512, with 12px green gutters. Read cells left-to-right on the top row, then left-to-right on the bottom row. One complete character per cell, centered, never clipped or overlapping, all feet on one shared absolute baseline near the bottom, generous transparent-ready margin, identical camera and lighting.

{role['walk']} {role['action']}
Frames 1-4 are walk poses in this order: contact, left-foot-forward, passing, right-foot-forward. Frames 5-8 are the action poses in this order: anticipation, action-open, action-peak, settle. The action prop must stay the same size and identity. Keep every frame readable at 36x48 pixels, with crisp dark-brown outline and softly textured children’s storybook fills.

Lighting and style: bright welcoming Chinese-fantasy palette, polished 2D game illustration, even light, no cast shadow. No green pixels on the character. {role['avoid']}. Also avoid motion blur, watermark, logo, typography, changing camera zoom, oval or stretched body, duplicate limbs, cropped hands or feet, matte lines, checkerboard or fake transparency.
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--roles",
        default=",".join(ROLES),
        help="comma-separated role ids to write (default: all roles)",
    )
    args = parser.parse_args()
    selected = tuple(item.strip() for item in str(args.roles).split(",") if item.strip())
    unknown = [item for item in selected if item not in ROLES]
    if unknown:
        raise SystemExit(f"unknown roles: {', '.join(unknown)}")
    for role_id in selected:
        role = ROLES[role_id]
        source = PROMPT_ROOT / role_id / "source" / "directional"
        source.mkdir(parents=True, exist_ok=True)
        for direction_id, direction in DIRECTIONS.items():
            (source / f"{role_id}-{direction_id}.txt").write_text(
                prompt(role_id, role, direction_id, direction), encoding="utf-8"
            )
    print(f"wrote {len(selected) * len(DIRECTIONS)} directional prompts")


if __name__ == "__main__":
    main()
