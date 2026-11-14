#!/bin/bash
# Runs inside the cage Wayland kiosk compositor as the "pivista" user.
# Forces a 1080p UI mode, then keeps Chromium running full screen on the TV interface.
PORT="${PIVISTA_PORT:-80}"
URL="http://127.0.0.1:${PORT}/tv/"
CHROMIUM="$(command -v chromium-browser || command -v chromium)"
PROFILE="$HOME/.config/pivista-chromium"
CACHE="/dev/shm/pivista-cache-$USER"   # browser cache in RAM: faster + spares the SD card

# --- HDMI: UI always renders at 1920x1080@60 even on 4K screens (smooth on the Pi 4 GPU).
OUT="$(wlr-randr 2>/dev/null | awk '/^HDMI/ {print $1; exit}')"
if [ -n "$OUT" ]; then
  wlr-randr --output "$OUT" --mode 1920x1080@60 2>/dev/null \
    || wlr-randr --output "$OUT" --mode 1920x1080 2>/dev/null || true
  echo "$OUT" > "$XDG_RUNTIME_DIR/pivista-output"
fi

mkdir -p "$PROFILE" "$CACHE"
until curl -fs "http://127.0.0.1:${PORT}/api/apps" >/dev/null; do sleep 0.5; done

while true; do
  # never show the "Chromium didn't shut down correctly" bubble
  sed -i 's/"exit_type":"Crashed"/"exit_type":"Normal"/; s/"exited_cleanly":false/"exited_cleanly":true/' \
    "$PROFILE/Default/Preferences" 2>/dev/null
  "$CHROMIUM" \
    --kiosk "$URL" \
    --ozone-platform=wayland \
    --user-data-dir="$PROFILE" \
    --disk-cache-dir="$CACHE" --disk-cache-size=134217728 \
    --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1 --remote-allow-origins=http://127.0.0.1 \
    --noerrdialogs --disable-infobars --no-first-run --no-default-browser-check \
    --disable-session-crashed-bubble --disable-translate --password-store=basic \
    --disable-features=Translate,MediaRouter,OptimizationHints,InterestFeedContentSuggestions \
    --enable-features=OverlayScrollbar \
    --ignore-gpu-blocklist --enable-gpu-rasterization --enable-zero-copy \
    --force-device-scale-factor=1 --hide-scrollbars --overscroll-history-navigation=0 \
    --autoplay-policy=no-user-gesture-required \
    --check-for-update-interval=31536000 \
    --renderer-process-limit=4
  sleep 2
done
