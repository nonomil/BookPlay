# -*- coding: utf-8 -*-
"""启动带 Range 的本地服务，并打开首页。不要用 python -m http.server。"""
from __future__ import annotations

import socket
import sys
import urllib.request
import webbrowser

from serve import main as serve_main

PORTS = (8810, 8787, 8790, 8807, 8788, 8808)
HOME = "/engine/home.html"


def _has_range(port: int) -> bool:
    try:
        urllib.request.urlopen(f"http://127.0.0.1:{port}{HOME}", timeout=0.8).read(32)
        req = urllib.request.Request(
            f"http://127.0.0.1:{port}/assets/video/ep1.mp4",
            headers={"Range": "bytes=0-16"},
        )
        with urllib.request.urlopen(req, timeout=1.5) as r:
            cr = r.headers.get("Content-Range") or ""
            return r.status == 206 and cr.startswith("bytes")
    except Exception:
        return False


def _free(port: int) -> bool:
    s = socket.socket()
    s.settimeout(0.2)
    try:
        return s.connect_ex(("127.0.0.1", port)) != 0
    finally:
        s.close()


def main() -> None:
    page = sys.argv[1] if len(sys.argv) > 1 else HOME
    if not page.startswith("/"):
        page = "/" + page
    for port in PORTS:
        if _has_range(port):
            url = f"http://127.0.0.1:{port}{page}"
            print(f"服务已在运行：{url}", flush=True)
            webbrowser.open(url)
            return
    for port in PORTS:
        if _free(port):
            url = f"http://127.0.0.1:{port}{page}"
            print(f"启动 {url}", flush=True)
            webbrowser.open(url)
            sys.argv = [sys.argv[0], "--port", str(port)]
            serve_main()
            return
    print("没有空闲端口", flush=True)
    sys.exit(1)


if __name__ == "__main__":
    main()
