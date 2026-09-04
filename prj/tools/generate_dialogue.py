#!/usr/bin/env python3
"""用 GLM-5.3-Flash 把对话节点的 intent 转成台词（F3）。

用法:
    python tools/generate_dialogue.py            # 只处理没有 generated_text 的节点
    python tools/generate_dialogue.py --force    # 全部重新生成
    python tools/generate_dialogue.py --node d05 # 只生成指定节点
    python tools/generate_dialogue.py --dry-run  # 只打印 prompt，不调用 API

密钥: 环境变量 ZHIPUAI_API_KEY 或 GLM_API_KEY。
生成结果写入节点的 generated_text 字段（引擎优先使用）；失败节点保留 fallback_text。
"""
import argparse
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions"
MODEL = "glm-5.3-flash"

WORDS_LIMIT = 30  # 单句英文台词词数上限


def load_json(p: Path):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def save_json(p: Path, obj) -> None:
    with open(p, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")


def build_messages(world: dict, character: dict, node: dict) -> list:
    """构造系统+用户 prompt：人设、世界观规则、意图 → 一句台词。"""
    persona = ""
    if character:
        persona = (
            f"角色: {character.get('name_en')} ({character.get('name_zh')})\n"
            f"身份: {character.get('role')}\n"
            f"性格: {character.get('personality_en')}\n"
            f"语言风格: {character.get('speech_style_en')}\n"
            f"词汇级别: {character.get('vocab_level')}\n"
        )
    emotion = node.get("emotion", "neutral")
    system = (
        "You are a dialogue writer for an English-learning visual novel for Chinese kids.\n"
        "Rewrite the given line INTENT as ONE line of spoken dialogue.\n"
        f"Hard rules: <= {WORDS_LIMIT} English words; simple vocabulary (CEFR A1-A2); "
        "no modern words; keep the emotional tone.\n"
        "Also give a natural Chinese translation.\n"
        "Reply with ONLY a JSON object: {\"en\": \"...\", \"zh\": \"...\"}\n\n" + persona +
        f"World tone: {world.get('tone')}\n"
        f"World rules: {world.get('rules')}\n"
        f"Current emotion: {emotion}"
    )
    user = (
        f"INTENT (what this line must convey): {node.get('intent')}\n"
        f"Reference line (meaning must match, wording may vary): "
        f"{node.get('fallback_text', {}).get('en')}"
    )
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def call_glm(messages: list) -> dict:
    key = os.environ.get("ZHIPUAI_API_KEY") or os.environ.get("GLM_API_KEY")
    if not key:
        raise RuntimeError("未设置 ZHIPUAI_API_KEY / GLM_API_KEY 环境变量")
    body = json.dumps({
        "model": MODEL,
        "messages": messages,
        "temperature": 0.8,
        "max_tokens": 300,
    }).encode("utf-8")
    req = urllib.request.Request(
        API_URL, data=body, method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        resp = json.load(r)
    content = resp["choices"][0]["message"]["content"].strip()
    if content.startswith("```"):  # 剥掉 markdown 代码围栏
        content = content.strip("`")
        if content.startswith("json"):
            content = content[4:]
    return json.loads(content)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="忽略已有 generated_text 全部重生成")
    ap.add_argument("--node", help="只处理指定节点 id")
    ap.add_argument("--dry-run", action="store_true", help="只打印 prompt 不调用")
    args = ap.parse_args()

    if not args.dry_run and not (os.environ.get("ZHIPUAI_API_KEY") or os.environ.get("GLM_API_KEY")):
        print("未检测到 ZHIPUAI_API_KEY / GLM_API_KEY，无法调用 GLM。")
        print("节点将保留 fallback_text，游戏仍可完整运行（F3 兜底设计）。")
        return 1

    world = load_json(DATA / "world.json")
    dpath = DATA / "dialogues" / "dialogue_sc01_mountain_birth.json"
    d = load_json(dpath)
    scene = load_json(DATA / "scenes" / f"{d['scene_id']}.json")

    # speaker -> character persona
    char_of_speaker = {}
    for spk_id, spk in world["speakers"].items():
        ref = spk.get("character_ref")
        if ref and (DATA / "characters" / f"{ref}.json").exists():
            char_of_speaker[spk_id] = load_json(DATA / "characters" / f"{ref}.json")

    ok = skip = fail = 0
    for node in d["nodes"]:
        if args.node and node["node_id"] != args.node:
            continue
        if node.get("player_choices"):  # M1 不生成选项文案（选项是玩家自己的话）
            continue
        if not args.force and node.get("generated_text"):
            skip += 1
            continue
        msgs = build_messages(world, char_of_speaker.get(node["speaker"]), node)
        if args.dry_run:
            print(f"--- {node['node_id']} ---")
            for m in msgs:
                print(f"[{m['role']}]\n{m['content']}\n")
            continue
        try:
            out = call_glm(msgs)
            node["generated_text"] = {
                "en": out["en"].strip(),
                "zh": out["zh"].strip(),
                "model": MODEL,
                "generated_at": datetime.now(timezone.utc).isoformat(),
            }
            ok += 1
            print(f"  [生成] {node['node_id']}: {node['generated_text']['en']}")
        except Exception as exc:  # noqa: BLE001
            fail += 1
            print(f"  [失败] {node['node_id']}: {exc}")

    if not args.dry_run:
        save_json(dpath, d)
        print(f"\n完成: 生成 {ok}, 跳过 {skip}, 失败 {fail} -> {dpath.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
