# -*- coding: utf-8 -*-
"""Write 西游记vs我的世界 (BookPlay) X35S launcher snapshot and copy onto the SD card.

This repo is BookPlay / 书戏 / 降妖记. Ports list name: 西游记vs我的世界.
Do NOT install onto 方块学园 — that is a different project (blocklegend).
Do NOT use the English Ports name bookplay as the player-facing entry.
"""
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SNAP = ROOT / "发布" / "西游记vs我的世界-x35s"

INNER_SH = """#!/bin/bash
# 西游记vs我的世界 · BookPlay 书戏 · Aurknix/ROCKNIX · X35S
# Same launch path as working plainland: MIME httpd.conf + pass URL to retsurf.

XDG_DATA_HOME=${XDG_DATA_HOME:-$HOME/.local/share}
if [ -d "/opt/system/Tools/PortMaster/" ]; then
  controlfolder="/opt/system/Tools/PortMaster"
elif [ -d "/opt/tools/PortMaster/" ]; then
  controlfolder="/opt/tools/PortMaster"
elif [ -d "/roms/ports/PortMaster/" ]; then
  controlfolder="/roms/ports/PortMaster"
elif [ -d "$XDG_DATA_HOME/PortMaster/" ]; then
  controlfolder="$XDG_DATA_HOME/PortMaster"
else
  controlfolder="/storage/roms/ports/PortMaster"
fi
if [ -f "$controlfolder/control.txt" ]; then
  . "$controlfolder/control.txt"
  [ -n "$CFW_NAME" ] && [ -f "$controlfolder/mod_${CFW_NAME}.txt" ] && . "$controlfolder/mod_${CFW_NAME}.txt"
  command -v get_controls >/dev/null 2>&1 && get_controls
fi

PORTROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
if [ -d "$PORTROOT/gamedata" ]; then
  GAMEDIR="$PORTROOT"
else
  GAMEDIR="$PORTROOT/西游记vs我的世界"
fi
[ -f "$GAMEDIR/gamedata/index.html" ] || { echo "ERROR: $GAMEDIR/gamedata/index.html missing" >&2; sleep 3; exit 1; }

cd "$GAMEDIR"
> "$GAMEDIR/log.txt" && exec > >(tee "$GAMEDIR/log.txt") 2>&1

chmod +x "$GAMEDIR/retsurf.a35" 2>/dev/null || true
chmod +x "$GAMEDIR/retsurf.a53" 2>/dev/null || true
chmod +x "$GAMEDIR/retsurf.a55" 2>/dev/null || true

CPU_PART="$(grep -m1 -i 'CPU part' /proc/cpuinfo | grep -oiE '0x[0-9a-f]+' | head -1 | tr 'A-Z' 'a-z')"
case "$CPU_PART" in
  0xd05) grep -qw atomics /proc/cpuinfo && BINNAME="retsurf.a55" || BINNAME="retsurf.a53" ;;
  0xd04) BINNAME="retsurf.a35" ;;
  *)     BINNAME="retsurf.a53" ;;
esac
[ -x "$GAMEDIR/$BINNAME" ] || BINNAME="retsurf.a55"
[ -x "$GAMEDIR/$BINNAME" ] || BINNAME="retsurf.a53"
[ -x "$GAMEDIR/$BINNAME" ] || BINNAME="retsurf.a35"
if [ ! -x "$GAMEDIR/$BINNAME" ]; then
  echo "xyjmc: missing retsurf binaries in $GAMEDIR" >&2
  sleep 5
  exit 1
fi
BIN="$GAMEDIR/$BINNAME"
chmod +x "$BIN" 2>/dev/null || true

PORT=18787
URL="http://127.0.0.1:$PORT/engine/play-map.html"
SRV=""
KEY_PID=""
start_server() {
  if command -v busybox >/dev/null 2>&1 && busybox --list 2>/dev/null | grep -qx httpd; then
    busybox httpd -f -p "127.0.0.1:$PORT" -c "$GAMEDIR/httpd.conf" -h "$GAMEDIR/gamedata" >"$GAMEDIR/httpd.log" 2>&1 &
    SRV=$!
    sleep 0.2
    if ! kill -0 "$SRV" 2>/dev/null; then
      busybox httpd -f -p "$PORT" -c "$GAMEDIR/httpd.conf" -h "$GAMEDIR/gamedata" >"$GAMEDIR/httpd.log" 2>&1 &
      SRV=$!
      echo "xyjmc: busybox httpd :$PORT"
    else
      echo "xyjmc: busybox httpd 127.0.0.1:$PORT"
    fi
  elif command -v python3 >/dev/null 2>&1; then
    python3 -u "$GAMEDIR/serve.py" "$PORT" "$GAMEDIR/gamedata" >"$GAMEDIR/httpd.log" 2>&1 &
    SRV=$!
    echo "xyjmc: python3 serve.py :$PORT"
  else
    echo "ERROR: no busybox httpd / python3" >&2
    sleep 5
    exit 1
  fi
}
stop_server() {
  [ -n "$SRV" ] && kill "$SRV" 2>/dev/null || true
  [ -n "$KEY_PID" ] && kill "$KEY_PID" 2>/dev/null || true
}
trap stop_server EXIT INT TERM
start_server
READY=0
if command -v wget >/dev/null 2>&1; then
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    wget -q -O /dev/null "$URL" && { READY=1; break; }
    sleep 0.2
  done
fi
sleep 1
kill -0 "$SRV" 2>/dev/null || { echo "ERROR: local server exited; see httpd.log" >&2; sleep 5; exit 1; }

mkdir -p "$GAMEDIR/retsurf-data"
export HOME="$GAMEDIR"
export XDG_DATA_HOME="$GAMEDIR"
export RETSURF_DATA_DIR="$GAMEDIR/retsurf-data"
export RETSURF_CONFIG="$GAMEDIR/config.toml"
export RETSURF_PANIC_FILE="$GAMEDIR/retsurf-panic.log"
export RETSURF_LOG_FILE="$GAMEDIR/retsurf.log"
export RETSURF_GLES=1
[ -r "$GAMEDIR/controller-env.sh" ] && . "$GAMEDIR/controller-env.sh"

if [ -n "${GPTOKEYB:-}" ]; then
  read -r -a GPTOKEYB_CMD <<< "$GPTOKEYB"
  if [ -x "${GPTOKEYB_CMD[0]}" ]; then
    "${GPTOKEYB_CMD[@]}" "$BINNAME" -c "$GAMEDIR/x35s.gptk" >"$GAMEDIR/gptokeyb.log" 2>&1 &
    KEY_PID=$!
  fi
fi

echo "xyjmc: CPU part ${CPU_PART:-unknown} · $BINNAME · $URL ready=$READY"
command -v pm_platform_helper >/dev/null 2>&1 && pm_platform_helper "$BIN"
if [ "$READY" = 1 ]; then
  "$BIN" "$URL"
else
  echo "xyjmc: URL not ready, opening via home_page"
  "$BIN"
fi
RESULT=$?
command -v pm_finish >/dev/null 2>&1 && pm_finish
exit "$RESULT"
"""

OUTER_SH = """#!/bin/bash
PORTROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
exec "$PORTROOT/西游记vs我的世界/西游记vs我的世界.sh"
"""

HTTPD_CONF = """# busybox httpd：给 Servo 正确的 ESM MIME。默认没有 .html/.mjs，页面空白带鼠标。
A:*
.html:text/html
.css:text/css
.js:application/javascript
.mjs:text/javascript
.json:application/json
.png:image/png
.jpg:image/jpeg
.jpeg:image/jpeg
.webp:image/webp
.gif:image/gif
.svg:image/svg+xml
.ogg:audio/ogg
.mp3:audio/mpeg
.wav:audio/wav
.wasm:application/wasm
.ttf:font/ttf
.woff:font/woff
.woff2:font/woff2
"""

CONFIG_TOML = """[browser]
home_page = "http://127.0.0.1:18787/engine/play-map.html"
search_page = "http://127.0.0.1:18787/engine/play-map.html"
user_agent = "mobile"
persist_site_data = true
restore_tabs = false
max_tabs = 1
page_zoom = 1.0
page_theme = "light"

[experimental]
webgl2 = false
offscreen_canvas = false
webgpu = false
notification = false
async_clipboard = false
permissions = false

[display]
width = 640
height = 480
scale = 1.0
use_gles = true
software_render = false
max_fps = 30

[performance]
memory_profile = "tight"
cpu_boost_on_load = false
layout_threads = 0
worker_pool_max = 0
http_disk_cache_mb = 0

[audio]
enabled = true
max_decode_seconds = 300

[input]
# 默认不要虚拟鼠标。点不到按钮时按 L3（左摇杆按下）切回浏览器光标。
cursor_mode = "scroll"
cursor_speed = 600.0
scroll_speed = 0
deadzone = 0.25
"""

SERVE_PY = '''#!/usr/bin/env python3
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
'''

GPTK = """# Same transport as working plainland / 露营之旅: stick = D-pad, no analog delay.
a = f1
b = f2
x = f3
y = f4
l1 = f5
r1 = f6
l2 = f7
r2 = f8
back = f9
start = "
up = up
down = down
left = left
right = right
left_analog_as_mouse = false
right_analog_as_mouse = false
left_analog_up = up
left_analog_down = down
left_analog_left = left
left_analog_right = right
l3 = "
r3 = "
right_analog_up = "
right_analog_down = "
right_analog_left = "
right_analog_right = "
deadzone_triggers = 3000
"""

BINDINGS = """[gamepad]
a = "none"
b = "none"
"hold:b" = "none"
"hold:l1" = "none"
"hold:r1" = "none"
"hold:select" = "none"
"hold:start" = "none"
"hold:x" = "none"
"hold:y" = "none"
l1 = "none"
"l1+r1" = "none"
l3 = "scroll"
r1 = "none"
"r1+l1" = "none"
r3 = "none"
select = "none"
"select+start" = "quit"
start = "none"
"start+select" = "quit"
x = "none"
y = "none"
[keyboard]
backspace = "cancel"
"ctrl+," = "settings"
"ctrl+-" = "zoom_out"
"ctrl+0" = "zoom_reset"
"ctrl+=" = "zoom_in"
"ctrl+h" = "home"
"ctrl+m" = "menu"
"ctrl+r" = "reload"
# 书戏是 DOM 页，方向键必须进页面；不要让 retsurf 拿去空间导航。
up = "none"
down = "none"
left = "none"
right = "none"
enter = "none"
"""

CONTROLLER_ENV = """# Source after PortMaster control.txt. Never export the full SDL database inline.
unset SDL_GAMECONTROLLERCONFIG
if [ -n "${SDLDBUSERFILE:-}" ] && [ -r "$SDLDBUSERFILE" ]; then
  export SDL_GAMECONTROLLERCONFIG_FILE="$SDLDBUSERFILE"
elif [ -n "${SDL_GAMECONTROLLERCONFIG_FILE:-}" ] && [ -r "$SDL_GAMECONTROLLERCONFIG_FILE" ]; then
  export SDL_GAMECONTROLLERCONFIG_FILE
elif [ -n "${SDLDBFILE:-}" ] && [ -r "$SDLDBFILE" ]; then
  export SDL_GAMECONTROLLERCONFIG_FILE="$SDLDBFILE"
else
  unset SDL_GAMECONTROLLERCONFIG_FILE
fi
"""

GAMEINFO = """<?xml version="1.0" encoding="UTF-8"?>
<gameList>
  <game>
    <path>./西游记vs我的世界.sh</path>
    <name>西游记vs我的世界</name>
    <desc>书戏 / 豆豆龙英语：绘本馆、西游记地图、降妖记。X35S 网页版，不是 APK。不要开 bookplay，也不要开方块学园（那是另一个项目）。</desc>
  </game>
</gameList>
"""

INDEX_HTML = """<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0;url=engine/play-map.html">
  <title>西游记vs我的世界</title>
  <script>location.replace("engine/play-map.html");</script>
</head>
<body>
  <p><a href="engine/play-map.html">进入降妖记选关</a></p>
</body>
</html>
"""

VERSION = "handheld-2026-09-19\n"


def write_lf(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = text.replace("\r\n", "\n").replace("\r", "\n")
    if not data.endswith("\n"):
        data += "\n"
    path.write_bytes(data.encode("utf-8"))


def write_snapshot() -> None:
    SNAP.mkdir(parents=True, exist_ok=True)
    write_lf(SNAP / "西游记vs我的世界.sh", OUTER_SH)
    write_lf(SNAP / "inner-西游记vs我的世界.sh", INNER_SH)
    write_lf(SNAP / "httpd.conf", HTTPD_CONF)
    write_lf(SNAP / "config.toml", CONFIG_TOML)
    write_lf(SNAP / "serve.py", SERVE_PY)
    write_lf(SNAP / "x35s.gptk", GPTK)
    write_lf(SNAP / "bindings.toml", BINDINGS)
    write_lf(SNAP / "controller-env.sh", CONTROLLER_ENV)
    write_lf(SNAP / "gameinfo.xml", GAMEINFO)
    write_lf(SNAP / "VERSION", VERSION)
    write_lf(SNAP / "entrypoint.txt", "index.html\n")
    write_lf(SNAP / "index.html", INDEX_HTML)


def find_ports_root() -> Path | None:
    for letter in ("L", "K"):
        candidate = Path(f"{letter}:/ports")
        if candidate.is_dir():
            return candidate
    return None


def find_bookplay_src(ports: Path) -> Path | None:
    for p in (
        ports / "bookplay",
        Path(r"D:\WorkPlace\X35S\htmljs-to-x35s\build\bookplay"),
    ):
        if (p / "gamedata" / "engine" / "home.html").is_file():
            return p
    return None


def install_card(ports: Path, copy_gamedata: bool) -> None:
    dest = ports / "西游记vs我的世界"
    dest.mkdir(exist_ok=True)
    src = find_bookplay_src(ports)
    if copy_gamedata:
        if src is None:
            raise SystemExit("no BookPlay gamedata source (ports/bookplay or D:\\...\\build\\bookplay)")
        gamedata_src = src / "gamedata"
        gamedata_dst = dest / "gamedata"
        print("copying gamedata from", gamedata_src)
        shutil.copytree(gamedata_src, gamedata_dst, dirs_exist_ok=True)
        for bin_name in ("retsurf.a55", "retsurf.a53", "retsurf.a35"):
            b = src / bin_name
            if b.is_file() and not (dest / bin_name).is_file():
                print("copying", bin_name)
                shutil.copy2(b, dest / bin_name)

    shutil.copy2(SNAP / "西游记vs我的世界.sh", ports / "西游记vs我的世界.sh")
    shutil.copy2(SNAP / "inner-西游记vs我的世界.sh", dest / "西游记vs我的世界.sh")
    for name in (
        "httpd.conf",
        "config.toml",
        "serve.py",
        "x35s.gptk",
        "controller-env.sh",
        "gameinfo.xml",
        "VERSION",
        "entrypoint.txt",
    ):
        shutil.copy2(SNAP / name, dest / name)
    (dest / "retsurf-data").mkdir(exist_ok=True)
    shutil.copy2(SNAP / "bindings.toml", dest / "retsurf-data" / "bindings.toml")
    index_dst = dest / "gamedata" / "index.html"
    if index_dst.parent.is_dir():
        shutil.copy2(SNAP / "index.html", index_dst)
    copy_engine_js(dest)
    copy_map_starter(dest)
    print("installed BookPlay launcher into", dest)


def copy_engine_js(dest: Path) -> None:
    src = ROOT / "prj" / "engine"
    engine_dst = dest / "gamedata" / "engine"
    if not engine_dst.is_dir() or not src.is_dir():
        return
    for name in (
        "handheld-controls.js",
        "native-key.js",
        "handheld.css",
        "play-map.html",
        "play-map.js",
        "play-map.css",
        "game.html",
        "game.js",
        "game-core.js",
        "game.css",
        "game-input.js",
        "game-audio.js",
        "game-feedback.js",
        "battle-core.js",
        "battle.css",
    ):
        s = src / name
        if s.is_file():
            shutil.copy2(s, engine_dst / name)
            print("engine", name)


def copy_map_starter(dest: Path) -> None:
    """Map.js fetches /data/... ; handheld packs previously only shipped data/game."""
    src_root = ROOT / "android" / "app" / "src" / "main" / "assets" / "data"
    dst_root = dest / "gamedata" / "data"
    if not src_root.is_dir():
        print("no android data pack, skip map starter")
        return
    files = [
        "dialogue_stories/collections.json",
        "storybooks/catalog.json",
        "content-manifest.json",
        "achievements/jttw.json",
        "companions/white-dragon.json",
        "assets/collections/normalized/c01.jpg",
        "assets/covers/journey-west-cover.png",
        "assets/covers/ep001.jpg",
        "assets/map_audio/index.json",
    ]
    for rel in files:
        src = src_root / rel
        if not src.is_file():
            print("missing map starter", rel)
            continue
        out = dst_root / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, out)
        print("map data", rel)
    stories = src_root / "dialogue_stories"
    if stories.is_dir():
        for src in stories.iterdir():
            if src.is_file():
                shutil.copy2(src, dst_root / "dialogue_stories" / src.name)


GAMELIST_GAME = """	<game>
		<path>./西游记vs我的世界.sh</path>
		<name>西游记vs我的世界</name>
		<desc>书戏 / 豆豆龙英语：绘本馆、西游记地图、降妖记。X35S 网页版，不是 APK。不要开 bookplay。</desc>
		<genre>Education</genre>
		<releasedate>20260919T000000</releasedate>
		<developer>bookplay</developer>
		<publisher>Open Source</publisher>
	</game>
"""


def patch_gamelist(ports: Path) -> None:
    xml_path = ports / "gamelist.xml"
    if not xml_path.is_file():
        print("no gamelist.xml, skip")
        return
    text = xml_path.read_text(encoding="utf-8")
    if "./西游记vs我的世界.sh" in text:
        print("gamelist already has 西游记vs我的世界.sh")
        return
    if "</gameList>" not in text:
        print("gamelist missing </gameList>, skip")
        return
    xml_path.write_text(text.replace("</gameList>", GAMELIST_GAME + "</gameList>", 1), encoding="utf-8")
    print("inserted 西游记vs我的世界 into gamelist.xml")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--install-card", action="store_true")
    parser.add_argument("--no-gamedata", action="store_true", help="only write launcher files, do not copy gamedata")
    parser.add_argument("--no-gamelist", action="store_true")
    args = parser.parse_args()
    write_snapshot()
    print("wrote", SNAP)
    if args.install_card:
        ports = find_ports_root()
        if ports is None:
            print("SD ports not found on L: or K:", file=sys.stderr)
            return 2
        if (ports / "方块学园").is_dir():
            print("note: leaving 方块学园 untouched (other project)")
        install_card(ports, copy_gamedata=not args.no_gamedata)
        if not args.no_gamelist:
            patch_gamelist(ports)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
