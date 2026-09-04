# -*- coding: utf-8 -*-
"""Static server with real HTTP Range (HTML5 video seek) + on-demand Edge-TTS."""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import os
import re
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse
import posixpath

from paths import ASSETS, CONTENT, PRJ

RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)")
URL_ROOTS = {
    "engine": PRJ / "engine",
    "data": CONTENT,
    "assets": ASSETS,
}
TTS_VOICES = {
    "en": "en-US-JennyNeural",
    "zh": "zh-CN-XiaoxiaoNeural",
}
TTS_LOCK = threading.Semaphore(3)
AUDIO_OUT = ASSETS / "adv_audio"


class RangeHandler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def translate_path(self, url):
        raw = url.split("?", 1)[0].split("#", 1)[0]
        rel = posixpath.normpath(unquote(raw)).lstrip("/")
        first, _sep, rest = rel.partition("/")
        base = URL_ROOTS.get(first)
        if base is None:
            dest = (PRJ / rel) if rel else PRJ
        else:
            dest = (base / rest) if rest else base
        resolved = dest.resolve()
        root = (base or PRJ).resolve()
        try:
            resolved.relative_to(root)
        except ValueError:
            return str(root)
        return str(resolved)

    def send_head(self):
        self._range = (0, None)
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            return super().send_head()
        if not os.path.isfile(path):
            self.send_error(404, "File not found")
            return None
        ctype = self.guess_type(path)
        try:
            f = open(path, "rb")
        except OSError:
            self.send_error(404, "File not found")
            return None
        fs = os.fstat(f.fileno())
        size = fs.st_size
        rng = self.headers.get("Range")
        start, end = 0, size - 1
        status = 200
        if rng:
            m = RANGE_RE.match(rng.strip())
            if m:
                if m.group(1):
                    start = int(m.group(1))
                if m.group(2):
                    end = int(m.group(2))
                end = min(end, size - 1)
                if start > end or start >= size:
                    f.close()
                    self.send_error(416, "Requested Range Not Satisfiable")
                    return None
                status = 206
        length = end - start + 1
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(length))
        self.send_header("Accept-Ranges", "bytes")
        if status == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Last-Modified", self.date_time_string(fs.st_mtime))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self._range = (start, length)
        return f

    def copyfile(self, source, outputfile):
        start, length = getattr(self, "_range", (0, None))
        if start:
            source.seek(start)
        if length is None:
            super().copyfile(source, outputfile)
            return
        remain = length
        while remain > 0:
            chunk = source.read(min(64 * 1024, remain))
            if not chunk:
                break
            try:
                outputfile.write(chunk)
            except (ConnectionResetError, BrokenPipeError, ConnectionAbortedError):
                break
            remain -= len(chunk)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/tts":
            self.handle_tts(parsed, head_only=False)
            return
        return super().do_GET()

    def do_HEAD(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/tts":
            self.handle_tts(parsed, head_only=True)
            return
        return super().do_HEAD()

    def handle_tts(self, parsed, head_only: bool) -> None:
        qs = parse_qs(parsed.query)
        voice_key = (qs.get("voice") or ["en"])[0].strip().lower()
        if voice_key not in TTS_VOICES:
            self.send_error(400, "bad voice")
            return
        text = " ".join(((qs.get("text") or [""])[0] or "").split()).strip()
        if not text or len(text) > 2000:
            self.send_error(400, "bad text")
            return
        folder = "sent_zh" if voice_key == "zh" else "sent_en"
        digest = hashlib.md5(text.encode("utf-8")).hexdigest()[:12]
        dest = AUDIO_OUT / folder / f"{digest}.mp3"
        dest.parent.mkdir(parents=True, exist_ok=True)
        if not (dest.exists() and dest.stat().st_size > 1000):
            ok = self._synth_edge(text, TTS_VOICES[voice_key], dest)
            if not ok:
                self.send_error(502, "edge-tts failed")
                return
        try:
            f = open(dest, "rb")
        except OSError:
            self.send_error(404, "File not found")
            return
        size = dest.stat().st_size
        # REPAIR r2: do not inherit the previous static request's _range on a
        # persistent HTTP/1.1 connection; TTS always serves the full file.
        self._range = (0, None)
        self.send_response(200)
        self.send_header("Content-Type", "audio/mpeg")
        self.send_header("Content-Length", str(size))
        self.send_header("Cache-Control", "public, max-age=86400")
        self.end_headers()
        if head_only:
            f.close()
            return
        try:
            self.copyfile(f, self.wfile)
        finally:
            f.close()

    @staticmethod
    def _synth_edge(text: str, voice: str, dest: Path) -> bool:
        tmp = dest.with_suffix(".part.mp3")

        async def _run() -> bool:
            import edge_tts
            await edge_tts.Communicate(text, voice).save(str(tmp))
            return tmp.exists() and tmp.stat().st_size > 1000

        with TTS_LOCK:
            if dest.exists() and dest.stat().st_size > 1000:
                return True
            try:
                ok = asyncio.run(_run())
            except Exception:
                ok = False
            if ok:
                tmp.replace(dest)
                return True
            if tmp.exists():
                try:
                    tmp.unlink()
                except OSError:
                    pass
            return dest.exists() and dest.stat().st_size > 1000

    def log_message(self, fmt, *args):
        if ".mp4" in self.path or ".json" in self.path or "/api/tts" in self.path:
            super().log_message(fmt, *args)


def apply_roots(engine_root: Path | None, data_root: Path | None) -> None:
    if engine_root:
        URL_ROOTS["engine"] = engine_root.resolve()
    if data_root:
        root = data_root.resolve()
        URL_ROOTS["data"] = root
        URL_ROOTS["assets"] = root / "assets"
        globals()["AUDIO_OUT"] = URL_ROOTS["assets"] / "adv_audio"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8787)
    ap.add_argument("--data-root", help="Android-style data folder: dialogue_stories/ + assets/")
    ap.add_argument("--engine-root", help="Player HTML/JS folder (default prj/engine)")
    args = ap.parse_args()
    apply_roots(
        Path(args.engine_root) if args.engine_root else None,
        Path(args.data_root) if args.data_root else None,
    )
    os.chdir(PRJ)
    httpd = ThreadingHTTPServer(("127.0.0.1", args.port), RangeHandler)
    print(
        f"serving engine={URL_ROOTS['engine']} data={URL_ROOTS['data']} "
        f"on http://127.0.0.1:{args.port}/engine/home.html",
        flush=True,
    )
    httpd.serve_forever()


if __name__ == "__main__":
    main()
