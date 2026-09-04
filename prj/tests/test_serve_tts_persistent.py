# -*- coding: utf-8 -*-
"""REPAIR r2 regression: /api/tts must not inherit the previous static request's
_range on a persistent HTTP/1.1 connection.

Serves prj/tools/serve.py on a loopback test port with a stubbed audio cache
(no edge-tts network, no writes to real assets), then on ONE keep-alive
connection requests a short static file followed by cached TTS clips and
asserts the body length equals Content-Length and the connection is reusable.

Run:  python -X utf8 prj/tests/test_serve_tts_persistent.py
"""
import hashlib
import http.client
import os
import sys
import threading
from http.server import ThreadingHTTPServer
from pathlib import Path

TOOLS = Path(__file__).resolve().parent.parent / "tools"
TASK = Path(os.environ.get("DSH_TASK_ROOT", r"G:\Game\BookPlay书戏\.agent-control\tasks\mikey-jj-speaking-bubble-v1"))
CACHE = TASK / "work" / "serve-test-cache"

sys.path.insert(0, str(TOOLS))
import serve  # noqa: E402

EN_PAYLOAD = bytes(range(256)) * 36          # 9216 bytes, matching Codex evidence
ZH_PAYLOAD = bytes(range(256)) * 32 + bytes(16)  # 8208 bytes
EN_TEXT = "flood"
ZH_TEXT = "洪水"


def seed_cache():
    en = CACHE / "sent_en" / f"{hashlib.md5(EN_TEXT.encode('utf-8')).hexdigest()[:12]}.mp3"
    zh = CACHE / "sent_zh" / f"{hashlib.md5(ZH_TEXT.encode('utf-8')).hexdigest()[:12]}.mp3"
    en.parent.mkdir(parents=True, exist_ok=True)
    zh.parent.mkdir(parents=True, exist_ok=True)
    en.write_bytes(EN_PAYLOAD)
    zh.write_bytes(ZH_PAYLOAD)
    serve.AUDIO_OUT = CACHE
    return en, zh


def main():
    failures = []

    def check(name, cond, detail=""):
        line = ("PASS " if cond else "FAIL ") + name + ((" :: " + str(detail)) if detail else "")
        print(line)
        if not cond:
            failures.append(name)

    seed_cache()
    server = ThreadingHTTPServer(("127.0.0.1", 0), serve.RangeHandler)
    port = server.server_address[1]
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    try:
        conn = http.client.HTTPConnection("127.0.0.1", port, timeout=6)
        # 1) small static file on the same keep-alive connection
        conn.request("GET", "/engine/storybook.html")
        r1 = conn.getresponse()
        static_body = r1.read()
        static_len = int(r1.getheader("Content-Length") or 0)
        check("static file served intact", r1.status == 200 and len(static_body) == static_len,
              f"status={r1.status} len={len(static_body)} cl={static_len}")
        check("static file smaller than TTS clip", static_len < len(EN_PAYLOAD), f"static={static_len} tts={len(EN_PAYLOAD)}")

        # 2) cached English TTS on the SAME connection
        conn.request("GET", "/api/tts?voice=en&text=" + EN_TEXT)
        r2 = conn.getresponse()
        body = r2.read()
        cl = r2.getheader("Content-Length")
        check("TTS en 200 + full Content-Length", r2.status == 200 and cl == str(len(EN_PAYLOAD)),
              f"status={r2.status} cl={cl} expected={len(EN_PAYLOAD)}")
        check("TTS en body length equals Content-Length",
              len(body) == len(EN_PAYLOAD), f"received={len(body)} expected={len(EN_PAYLOAD)}")

        # 3) cached Chinese TTS on the SAME connection
        from urllib.parse import quote
        conn.request("GET", "/api/tts?voice=zh&text=" + quote(ZH_TEXT))
        r3 = conn.getresponse()
        body3 = r3.read()
        cl3 = r3.getheader("Content-Length")
        check("TTS zh 200 + full Content-Length", r3.status == 200 and cl3 == str(len(ZH_PAYLOAD)),
              f"status={r3.status} cl={cl3} expected={len(ZH_PAYLOAD)}")
        check("TTS zh body length equals Content-Length",
              len(body3) == len(ZH_PAYLOAD), f"received={len(body3)} expected={len(ZH_PAYLOAD)}")

        # 4) connection still reusable afterwards
        conn.request("GET", "/engine/home.html")
        r4 = conn.getresponse()
        r4.read()
        check("keep-alive connection reusable after TTS", r4.status == 200, f"status={r4.status}")
        conn.close()
    finally:
        server.shutdown()
        server.server_close()

    print("RESULT", "FAIL" if failures else "PASS", "failures=", failures)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())