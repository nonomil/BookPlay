#!/usr/bin/env python3
"""章节检查点摘要（F4）。

用法:
    python tools/checkpoint.py                # 无密钥时写入 outline 的 summary_for_checkpoint
    python tools/checkpoint.py --use-glm      # 用 GLM 依据对话树+玩家路径生成摘要

输出: data/checkpoints/ch01.json，引擎在章节结算页优先展示。
"""
import argparse
import json
import os
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions"
MODEL = "glm-5.3-flash"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--use-glm", action="store_true")
    args = ap.parse_args()

    outline = json.loads((DATA / "story_outline.json").read_text(encoding="utf-8"))
    ch = outline["chapters"][0]
    summary = ch["summary_for_checkpoint"]

    if args.use_glm:
        key = os.environ.get("ZHIPUAI_API_KEY") or os.environ.get("GLM_API_KEY")
        if not key:
            print("未设置密钥，回退为 outline 预置摘要。")
        else:
            dpath = DATA / "dialogues" / "dialogue_sc01_mountain_birth.json"
            d = json.loads(dpath.read_text(encoding="utf-8"))
            beats = [
                f"{n['node_id']}: {n.get('generated_text', n.get('fallback_text', {})).get('zh', '')}"
                for n in d["nodes"]
            ]
            body = json.dumps({
                "model": MODEL,
                "messages": [
                    {"role": "system", "content": outline["checkpoint"]["summary_prompt"]},
                    {"role": "user", "content": "\n".join(beats)},
                ],
                "temperature": 0.3,
            }).encode("utf-8")
            req = urllib.request.Request(
                API_URL, data=body, method="POST",
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
            )
            with urllib.request.urlopen(req, timeout=60) as r:
                resp = json.load(r)
            summary = resp["choices"][0]["message"]["content"].strip()

    out = DATA / "checkpoints"
    out.mkdir(exist_ok=True)
    (out / f"{ch['chapter_id']}.json").write_text(
        json.dumps({
            "chapter_id": ch["chapter_id"],
            "summary": summary,
            "max_chars": outline["checkpoint"]["max_chars"],
            "generated_by": MODEL if args.use_glm and os.environ.get("ZHIPUAI_API_KEY") else "preset",
        }, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"检查点已写入: {out / (ch['chapter_id'] + '.json')}")
    print(f"摘要: {summary}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
