#!/bin/bash
# Runs inside the cage Wayland kiosk compositor as the "pivista" user.
# Forces a 1080p UI mode, then keeps Chromium running full screen on the TV interface.
# Everything printed here ends up in:  journalctl -u pivista-kiosk   (or: pivista doctor)
PORT="${PIVISTA_PORT:-80}"
if [ "$PORT" = 80 ]; then URL="http://127.0.0.1/tv/"; else URL="http://127.0.0.1:${PORT}/tv/"; fi
PROFILE="$HOME/.config/pivista-chromium"
CACHE="/dev/shm/pivista-cache-$USER"   # browser cache in RAM: faster + spares the SD card
log() { echo "PiVista kiosk: $*"; }

# --- HDMI: UI always renders at 1920x1080@60 even on 4K screens (smooth on the Pi 4 GPU).
OUT="$(wlr-randr 2>/dev/null | awk '/^HDMI/ {print $1; exit}')"
if [ -n "$OUT" ]; then
  wlr-randr --output "$OUT" --mode 1920x1080@60 2>/dev/null \
    || wlr-randr --output "$OUT" --mode 1920x1080 2>/dev/null \
    || log "could not set 1920x1080 on $OUT, keeping the monitor's preferred mode"
  echo "$OUT" > "$XDG_RUNTIME_DIR/pivista-output"
  log "display $OUT: $(wlr-randr 2>/dev/null | awk '/current/ {print $1, $3; exit}')"
else
  log "WARNING: no HDMI output reported by the compositor (is the monitor connected and on?)"
fi

mkdir -p "$PROFILE" "$CACHE"

# wait for the PiVista server (Chromium would otherwise show an error page)
n=0
until curl -fs "http://127.0.0.1:${PORT}/api/apps" >/dev/null; do
  n=$((n + 1)); [ $((n % 20)) = 0 ] && log "waiting for the PiVista server on port $PORT… (pivista.service running?)"
  sleep 0.5
done

fails=0
while true; do
  CHROMIUM="$(command -v chromium-browser || command -v chromium)"
  if [ -z "$CHROMIUM" ]; then
    log "ERROR: Chromium is not installed. Fix: sudo apt install chromium-browser  (or: chromium)"
    sleep 10; continue
  fi
  # never show the "Chromium didn't shut down correctly" bubble
  sed -i 's/"exit_type":"Crashed"/"exit_type":"Normal"/; s/"exited_cleanly":false/"exited_cleanly":true/' \
    "$PROFILE/Default/Preferences" 2>/dev/null

  GPU_FLAGS=(--ignore-gpu-blocklist --enable-gpu-rasterization --enable-zero-copy)
  if [ "$fails" -ge 3 ]; then
    # Safe mode: Chromium keeps crashing (often a GPU driver problem) -> software rendering.
    GPU_FLAGS=(--disable-gpu --disable-gpu-compositing)
    log "Chromium crashed $fails times in a row: starting in safe mode (GPU disabled)"
  fi

  start=$(date +%s)
  log "starting $CHROMIUM -> $URL"
  # shellcheck disable=SC2086  # PIVISTA_CHROMIUM_FLAGS (from /etc/default/pivista) may hold several flags
  "$CHROMIUM" \
    --kiosk "$URL" \
    --ozone-platform=wayland \
    --user-data-dir="$PROFILE" \
    --disk-cache-dir="$CACHE" --disk-cache-size=134217728 \
    --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1 --remote-allow-origins=http://127.0.0.1 \
    --noerrdialogs --disable-infobars --no-first-run --no-default-browser-check \
    --disable-session-crashed-bubble --disable-translate --password-store=basic \
    --disable-features=Translate,MediaRouter,OptimizationHints,InterestFeedContentSuggestions,DisableLoadExtensionCommandLineSwitch \
    --load-extension=/opt/pivista/system/zoom-extension \
    --enable-features=OverlayScrollbar \
    "${GPU_FLAGS[@]}" \
    --force-device-scale-factor=1 --hide-scrollbars --overscroll-history-navigation=0 \
    --autoplay-policy=no-user-gesture-required \
    --check-for-update-interval=31536000 \
    --renderer-process-limit=4 \
    ${PIVISTA_CHROMIUM_FLAGS:-}
  code=$?
  if [ $(( $(date +%s) - start )) -lt 20 ]; then fails=$((fails + 1)); else fails=0; fi
  log "Chromium exited with code $code (quick failures in a row: $fails)"
  sleep 2
done
