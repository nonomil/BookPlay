#!/bin/bash
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
