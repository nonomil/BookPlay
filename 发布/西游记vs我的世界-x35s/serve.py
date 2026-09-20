#!/usr/bin/env python3
"""Local static server with .mjs as JavaScript (Servo ESM)."""
import http.server
import mimetypes
import sys

mimetypes.add_type("text/javascript", ".mjs")
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/html", ".html")
mimetypes.add_type("image/gif", ".gif")

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 18787
ROOT = sys.argv[2] if len(sys.argv) > 2 else "."


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)


http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
