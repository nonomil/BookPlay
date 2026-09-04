#!/usr/bin/env python3
"""台词 TTS 预生成（F5 的文件通道，可选）。

用法:
    pip install edge-tts
    python tools/tts_generate.py

产出 assets/audio/<scene_id>/<node_id>.mp3 与 assets/audio/index.json；
引擎检测到 index.json 即优先播放音频文件，否则回退浏览器 speechSynthesis。
未安装 edge-tts 时脚本安全退出，不影响游戏运行。
"""
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "assets" / "audio"

VOICE_MAP = {  # speaker -> edge-tts 声音（英文）
    "narrator": "en-US-GuyNeural",
    "elder_monkey": "en-US-GuyNeural",
    "you": "en-US-AnaNeural",  # 少年音
    "system": "en-US-GuyNeural",
}


async def gen(node_id: str, speaker: str, text: str, scene_id: str) -> str | None:
    import edge_tts

    voice = VOICE_MAP.get(speaker, "en-US-GuyNeural")
    out_dir = OUT / scene_id
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / f"{node_id}.mp3"
    await edge_tts.Communicate(text, voice).save(str(out_file))
    return f"assets/audio/{scene_id}/{node_id}.mp3"


async def main() -> int:
    try:
        import edge_tts  # noqa: F401
    except ImportError:
        print("未安装 edge-tts（pip install edge-tts），跳过 TTS 预生成。")
        print("游戏仍可运行：引擎将使用浏览器 speechSynthesis 兜底（F5 验收不受影响）。")
        return 0

    world = json.loads((DATA / "world.json").read_text(encoding="utf-8"))
    index = {}
    for dpath in (DATA / "dialogues").glob("*.json"):
        d = json.loads(dpath.read_text(encoding="utf-8"))
        scene_id = d["scene_id"]
        index[scene_id] = {}
        for node in d["nodes"]:
            text = (node.get("generated_text") or node["fallback_text"])["en"]
            try:
                rel = await gen(node["node_id"], node["speaker"], text, scene_id)
                index[scene_id][node["node_id"]] = rel
                print(f"  [tts] {scene_id}/{node['node_id']}")
            except Exception as exc:  # noqa: BLE001
                print(f"  [跳过] {scene_id}/{node['node_id']}: {exc}")

    (OUT / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"完成 -> {OUT / 'index.json'}")
    return 0


if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.run(main())
    else:
        raise SystemExit(asyncio.run(main()))
