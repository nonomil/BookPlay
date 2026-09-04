# -*- coding: utf-8 -*-
"""诊断生图接口的实际返回尺寸。

## 结论（2026-08-31，已验证）

**这个接口不把 size 当硬约束，会按 prompt 语义自己决定画布比例，并在响应的
`size` 字段里回显它自己选的尺寸。**

证据：同样请求 `1536x1024`——

| prompt | 返回 |
|---|---|
| 一句话「flat empty green meadow」 | 1536x1024（照办） |
| v3 style_suffix（含 "TOP THIRD" / "lower two thirds" / "30 percent of the height"） | 1313x1198（竖了） |
| v4 style_suffix（改成 "Wide panoramic horizontal landscape banner, far wider than it is tall"，去掉纵向百分比措辞） | 1821x864 / 1536x1024（横回来了） |

所以 bg-04 那批 12 张竖图不是脚本 bug，是 prompt 措辞把路由带偏了。纵向百分比
描述（"top third"、"lower two thirds"、"percent of the height"）会被读成竖构图信号，
不要再写回 style_suffix。

`gen_collection_bg.py` 的连带缺陷：它把 `actual_size` 记成**请求值**而不是解码出的
真实尺寸，所以 12 张竖图在收据里全显示 `1536x1024`，问题被掩盖到人工看图才发现。

用法：
    python -X utf8 prj\\tools\\diag_image_size.py         # 一句话 prompt
    python -X utf8 prj\\tools\\diag_image_size.py c05     # 用某辑的真实 prompt

不打印 key，不写图片文件。
"""
from __future__ import annotations

import base64
import io
import json
import os
import ssl
import sys
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
CA_FILE = ROOT / "prj" / "tools" / "cliproxy-rn6.pem"


def main() -> int:
    key = os.environ.get("CLIPROX_API_KEY")
    base = os.environ.get("CLIPROX_API_BASE", "https://rn6.nonom.top/v1")
    if not key:
        print("CLIPROX_API_KEY 未设置")
        return 2

    spec = json.load(io.open(ROOT / "prj" / "tools" / "collection_bg_prompts.json", encoding="utf-8"))
    cid = sys.argv[1] if len(sys.argv) > 1 else None
    if cid:
        col = next(c for c in spec["collections"] if c["id"] == cid)
        prompts = [(cid, (col["prompt"] + " " + spec["style_suffix"]).strip())]
    else:
        prompts = [("trivial", "A flat empty green meadow under a clear blue sky, simple cartoon style, no objects.")]

    for label, prompt in prompts:
      for size in ("1536x1024",):
        payload = {
            "model": "gpt-image-2",
            "prompt": prompt,
            "size": size,
            "n": 1,
        }
        req = urllib.request.Request(
            f"{base}/images/generations",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        ctx = ssl.create_default_context(cafile=str(CA_FILE))
        opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}),
            urllib.request.HTTPSHandler(context=ctx),
        )
        try:
            with opener.open(req, timeout=180) as resp:
                body = json.loads(resp.read().decode("utf-8"))
        except Exception as exc:  # noqa: BLE001
            print(f"requested={size} ERROR {type(exc).__name__}: {exc}")
            continue

        item = (body.get("data") or [{}])[0]
        echoed = {k: v for k, v in body.items() if k not in ("data",)}
        b64 = item.get("b64_json")
        if not b64:
            print(f"requested={size} 无 b64_json，返回字段={list(item.keys())} meta={echoed}")
            continue
        im = Image.open(io.BytesIO(base64.b64decode(b64)))
        print(f"requested={size} -> actual={im.size} format={im.format} meta={echoed}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
