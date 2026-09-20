# Source after PortMaster control.txt. Never export the full SDL database inline.
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
