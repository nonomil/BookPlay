#!/usr/bin/env python3
"""为西游记地图预生成自然的 Edge-TTS 篇章导语与英文集标题。"""
from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "content"
COLLECTIONS_PATH = CONTENT / "dialogue_stories" / "collections.json"
CATALOG_PATH = CONTENT / "storybooks" / "catalog.json"
OUT = CONTENT / "assets" / "map_audio"
MANIFEST_PATH = OUT / "index.json"

ZH_VOICE = "zh-CN-XiaoxiaoNeural"
EN_VOICE = "en-US-JennyNeural"


def collection_zh_text(collection: dict) -> str:
    return (
        f"{collection['title']['zh']}。"
        f"第{collection['from']}到{collection['to']}集。"
        f"{collection['summary']['zh']}"
    )


def collection_en_text(collection: dict) -> str:
    return (
        f"{collection['title']['en']}. "
        f"Episodes {collection['from']} through {collection['to']}. "
        f"{collection['summary']['en']}"
    )


async def synthesize(text: str, voice: str, rate: str, target: Path, force: bool) -> bool:
    if not force and target.exists() and target.stat().st_size > 1000:
        return False
    target.parent.mkdir(parents=True, exist_ok=True)
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            await asyncio.wait_for(
                edge_tts.Communicate(text, voice, rate=rate).save(str(target)),
                timeout=40,
            )
            if target.exists() and target.stat().st_size > 1000:
                return True
        except Exception as exc:  # noqa: BLE001
            last_error = exc
        await asyncio.sleep(0.8 * (attempt + 1))
    raise RuntimeError(f"Edge-TTS 生成失败: {target.name}: {last_error}")


async def generate(force: bool, concurrency: int) -> tuple[int, dict]:
    collections = json.loads(COLLECTIONS_PATH.read_text(encoding="utf-8"))["collections"]
    episodes = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))["episodes"]
    manifest = {
        "schema_version": 1,
        "voices": {"zh": ZH_VOICE, "en": EN_VOICE},
        "collections": {},
        "episodes": {},
    }
    jobs: list[tuple[str, str, str, Path]] = []

    for c in collections:
        zh_rel = f"assets/map_audio/collections/{c['id']}_zh.mp3"
        en_rel = f"assets/map_audio/collections/{c['id']}_en.mp3"
        manifest["collections"][c["id"]] = {"zh": zh_rel, "en": en_rel}
        jobs.append((collection_zh_text(c), ZH_VOICE, "-4%", CONTENT / zh_rel))
        jobs.append((collection_en_text(c), EN_VOICE, "-8%", CONTENT / en_rel))

    for ep in episodes:
        number = int(ep["episode"])
        zh_rel = f"assets/map_audio/episodes/ep{number:03d}_zh.mp3"
        en_rel = f"assets/map_audio/episodes/ep{number:03d}_en.mp3"
        manifest["episodes"][str(number)] = {"zh": zh_rel, "en": en_rel}
        jobs.append((f"第{number}集，{ep['title']['zh']}", ZH_VOICE, "-4%", CONTENT / zh_rel))
        jobs.append((ep["title"]["en"], EN_VOICE, "-8%", CONTENT / en_rel))

    sem = asyncio.Semaphore(max(1, concurrency))
    made = 0

    async def one(job: tuple[str, str, str, Path]) -> bool:
        text, voice, rate, target = job
        async with sem:
            return await synthesize(text, voice, rate, target, force)

    for start in range(0, len(jobs), max(8, concurrency * 4)):
        results = await asyncio.gather(*(one(job) for job in jobs[start:start + max(8, concurrency * 4)]))
        made += sum(results)
        print(f"地图音频 {min(start + len(results), len(jobs))}/{len(jobs)}，新生成 {made}", flush=True)

    OUT.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return made, manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--concurrency", type=int, default=6)
    args = parser.parse_args()
    made, manifest = asyncio.run(generate(args.force, args.concurrency))
    print(
        f"完成：新生成 {made} 段，"
        f"篇章 {len(manifest['collections'])}，分集 {len(manifest['episodes'])} -> {MANIFEST_PATH}",
        flush=True,
    )


if __name__ == "__main__":
    main()
