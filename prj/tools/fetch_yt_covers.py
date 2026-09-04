#!/usr/bin/env python3
"""从 YouTube 播放列表抓全部 videoId 并下载封面（innertube browse API，走本机代理）。

新版播放列表结构为 lockupViewModel/contentId（每页约22条）+ continuation 分页。

用法:
    python tools/fetch_yt_covers.py            # 全流程：ID -> 封面
    python tools/fetch_yt_covers.py --refresh  # 忽略已存 ID 重新抓
"""
import argparse
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "assets" / "yt_covers"
PLAYLIST = "PLTYeDakuqA3_Lyt0jogwdJMpgR9Dbaf0k"
API = "https://www.youtube.com/youtubei/v1/browse"
WEB_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9tSsav0w"  # YouTube web 客户端公开 key

OPENER = urllib.request.build_opener(urllib.request.ProxyHandler(
    {"http": "http://127.0.0.1:10808", "https": "http://127.0.0.1:10808"}))
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      "Content-Type": "application/json"}


def post(payload):
    req = urllib.request.Request(f"{API}?key={WEB_KEY}&prettyPrint=false",
                                 data=json.dumps(payload).encode(),
                                 headers=UA, method="POST")
    with OPENER.open(req, timeout=60) as r:
        return r.read().decode()


def fetch_ids():
    """逐页抓 contentId（保持播放列表顺序），兼容旧 playlistVideoRenderer。"""
    ctx = {"context": {"client": {"clientName": "WEB", "clientVersion": "2.20240701.00.00"}}}
    ids: list[str] = []
    token = None
    for page in range(20):
        payload = dict(ctx, browseId="VL" + PLAYLIST)
        if token:
            payload = dict(ctx, continuation=token)  # 续页请求只带 context+continuation
        raw = post(payload)
        new = re.findall(r'"(?:contentId|videoId)":\s*"([A-Za-z0-9_-]{11})"', raw)
        before = len(ids)
        for v in new:
            if v not in ids:
                ids.append(v)
        m = re.search(r'"getContinuationCommand":\s*\{"commandMetadata":[^}]*"[^"]*":[^}]*"token":\s*"([^"]+)"', raw)
        if not m:
            m = re.search(r'"continuationCommand":\s*\{[^{}]*"token":\s*"([^"]+)"', raw)
        token = m.group(1) if m else None
        print(f"  第{page + 1}页: 新增 {len(ids) - before}，累计 {len(ids)}，{'有续页' if token else '结束'}")
        if not token or len(ids) == before:
            break
    return ids


def download(vid: str, path: Path):
    for q in ("maxresdefault", "sddefault", "hqdefault"):
        url = f"https://i.ytimg.com/vi/{vid}/{q}.jpg"
        req = urllib.request.Request(url, headers=UA)
        try:
            with OPENER.open(req, timeout=30) as r:
                data = r.read()
            if len(data) > 5000:  # 无图时 YouTube 返回 120b 占位
                path.write_bytes(data)
                return q
        except Exception:
            continue
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args()

    ids_path = Path(__file__).parent / "_playlist_ids.json"
    if ids_path.exists() and not args.refresh:
        ids = json.load(open(ids_path))
        print(f"复用已存 ID: {len(ids)}")
    else:
        print("抓取播放列表...")
        ids = fetch_ids()
        json.dump(ids, open(ids_path, "w"))
    print(f"共 {len(ids)} 个视频")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ok = fail = 0
    for i, vid in enumerate(ids, 1):
        out = OUT_DIR / f"ep{i:03d}.jpg"
        if out.exists() and out.stat().st_size > 5000:
            ok += 1
            continue
        q = download(vid, out)
        if q:
            ok += 1
            if i % 20 == 0 or i == len(ids):
                print(f"  {i}/{len(ids)} ep{i:03d} <- {q}")
        else:
            fail += 1
            print(f"  [失败] ep{i:03d} {vid}")
    print(f"封面完成: ok={ok} fail={fail} -> {OUT_DIR}")


if __name__ == "__main__":
    main()
