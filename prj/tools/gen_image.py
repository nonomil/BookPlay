#!/usr/bin/env python3
"""通过 Cliproxy 中继调用 gpt-image-2 生图（游戏资产工具包的 Cliprox 备用后端）。

密钥来源：本机 Codex 凭据库（%USERPROFILE%\\.codex\\auth.json 的 OPENAI_API_KEY，
与中继 base_url 配套）。密钥仅注入子进程环境变量，不回显、不写入任何文件/日志，
符合工具包 cliprox-api.md 的安全约定。

用法:
    python tools/gen_image.py --prompt "..." --output assets/gen/x.png [--size 1024x1024]
    python tools/gen_image.py --prompt-file prompts/a.txt --output assets/gen/a.png
"""
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOOLKIT = Path(r"G:\AI编程--项目模板\美术和游戏设计\游戏资产开发工具")
CLIENT = TOOLKIT / "skills" / "transparent-image-generator" / "scripts" / "cliprox_image_client.py"
DEFAULT_BASE = "http://rn6.nonom.top/v1"  # 与本机 Codex model_provider 配置一致


def load_key() -> str:
    auth = Path(os.environ["USERPROFILE"]) / ".codex" / "auth.json"
    data = json.loads(auth.read_text(encoding="utf-8"))
    key = data.get("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("凭据库中未找到 OPENAI_API_KEY")
    return key


def main() -> int:
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--prompt")
    g.add_argument("--prompt-file")
    ap.add_argument("--output", required=True)
    ap.add_argument("--size", default="1024x1024")
    ap.add_argument("--model", default="gpt-image-2")
    ap.add_argument("--base", default=DEFAULT_BASE)
    args = ap.parse_args()

    prompt = args.prompt or Path(args.prompt_file).read_text(encoding="utf-8")
    env = dict(os.environ)
    env["CLIPROX_API_BASE"] = args.base
    env["CLIPROX_API_KEY"] = load_key()

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)

    proc = subprocess.run(
        [sys.executable, str(CLIENT), "generate",
         "--model", args.model, "--size", args.size,
         "--prompt", prompt, "--output", str(out)],
        env=env, capture_output=True, text=True, encoding="utf-8", timeout=300,
    )
    sys.stdout.write(proc.stdout)
    if proc.returncode != 0:
        sys.stderr.write(proc.stderr)
        return proc.returncode
    return 0


if __name__ == "__main__":
    sys.exit(main())
