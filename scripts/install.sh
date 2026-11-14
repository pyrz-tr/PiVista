#!/bin/bash
# PiVista installer for Raspberry Pi 4 on Raspberry Pi OS (Bookworm or newer, 64-bit).
#
#   curl -fsSL https://raw.githubusercontent.com/pyrz-tr/PiVista/claude/kind-mccarthy-xql5k2/scripts/install.sh | sudo bash
#   or, from a checkout:  sudo ./scripts/install.sh
#
# Options:
#   --keep-hostname   don't rename the Pi to "pivista" (remote URL becomes http://<hostname>.local)
#   --no-tuning       skip performance tuning (zram, journald, services, Wi-Fi power save)
#   --from-deb        used by the .deb package (files already in /opt/pivista, deps installed by apt)
#
# Environment:
#   PIVISTA_BRANCH    git branch to download when not run from a checkout (default below)
set -euo pipefail

APP_DIR=/opt/pivista
DATA_DIR=/var/lib/pivista
KIOSK_USER=pivista
REPO=https://github.com/pyrz-tr/PiVista.git
BRANCH="${PIVISTA_BRANCH:-claude/kind-mccarthy-xql5k2}"   # the code lives on this branch (there is no main branch)
KEEP_HOSTNAME=0; TUNING=1; FROM_DEB=0
for a in "$@"; do case "$a" in
  --keep-hostname) KEEP_HOSTNAME=1 ;; --no-tuning) TUNING=0 ;; --from-deb) FROM_DEB=1 ;;
esac; done

say() { echo -e "\e[1;35m[PiVista]\e[0m $*"; }
[ "$(id -u)" = 0 ] || { echo "Run as root: sudo $0"; exit 1; }
[ "$(uname -m)" = aarch64 ] || say "WARNING: not a 64-bit ARM system ($(uname -m)). PiVista targets Raspberry Pi OS 64-bit."

BOOT=/boot/firmware; [ -d "$BOOT" ] || BOOT=/boot

# ------------------------------------------------------------------ packages
if [ "$FROM_DEB" = 0 ]; then
  say "Installing packages (Chromium, Widevine DRM, cage, mpv, PipeWire)…"
  apt-get update
  CHROMIUM_PKG=chromium-browser
  apt-cache show chromium >/dev/null 2>&1 && ! apt-cache show chromium-browser >/dev/null 2>&1 && CHROMIUM_PKG=chromium
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    nodejs npm git curl rsync "$CHROMIUM_PKG" libwidevinecdm0 cage wlr-randr mpv ffmpeg \
    pipewire pipewire-pulse wireplumber pipewire-alsa avahi-daemon libnss-mdns \
    fonts-noto-core fonts-noto-color-emoji zram-tools unzip yt-dlp
fi

# ------------------------------------------------------------------ app files
if [ "$FROM_DEB" = 0 ]; then
  SRC="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." 2>/dev/null && pwd || true)"
  if [ -z "$SRC" ] || [ ! -f "$SRC/server/index.js" ]; then
    say "Downloading PiVista ($BRANCH)…"
    SRC="$(mktemp -d)"; git clone --depth 1 -b "$BRANCH" "$REPO" "$SRC"
  fi
  say "Copying app to $APP_DIR"
  mkdir -p "$APP_DIR"
  rsync -a --delete --exclude .git --exclude node_modules --exclude .data "$SRC/" "$APP_DIR/"
  (cd "$APP_DIR" && npm install --omit=dev --no-audit --no-fund)
fi
chmod +x "$APP_DIR"/system/*.sh "$APP_DIR"/system/pivista-cli "$APP_DIR"/scripts/*.sh

# ------------------------------------------------------------------ user + services
if ! id "$KIOSK_USER" >/dev/null 2>&1; then
  say "Creating kiosk user '$KIOSK_USER'"
  useradd -m -s /bin/bash "$KIOSK_USER"
fi
usermod -aG video,audio,render,input "$KIOSK_USER"
mkdir -p "/home/$KIOSK_USER/Videos" && chown "$KIOSK_USER:" "/home/$KIOSK_USER/Videos"
loginctl enable-linger "$KIOSK_USER" || true     # PipeWire user session for audio/volume
mkdir -p "$DATA_DIR"

install -m 644 "$APP_DIR/system/pivista.service" /etc/systemd/system/pivista.service
install -m 644 "$APP_DIR/system/pivista-kiosk.service" /etc/systemd/system/pivista-kiosk.service
install -m 644 "$APP_DIR/system/pam-pivista-kiosk" /etc/pam.d/pivista-kiosk
ln -sf "$APP_DIR/system/pivista-cli" /usr/local/bin/pivista
sudo -u "$KIOSK_USER" XDG_RUNTIME_DIR="/run/user/$(id -u "$KIOSK_USER")" systemctl --user enable pipewire pipewire-pulse wireplumber 2>/dev/null || true

# ------------------------------------------------------------------ HDMI / boot config
say "Configuring HDMI (1080p UI, 4K-capable video), quiet boot and thermal limits"
CFG="$BOOT/config.txt"
if [ -f "$CFG" ]; then
  cp -n "$CFG" "$CFG.pivista-backup" || true
  sed -i '/# >>> PiVista >>>/,/# <<< PiVista <<</d' "$CFG"
  # the stock vc4-kms-v3d line is replaced by ours (with a bigger CMA pool for 4K decode)
  sed -i 's/^dtoverlay=vc4-kms-v3d$/#&  # replaced by PiVista block below/' "$CFG"
  cat "$APP_DIR/system/boot-config.txt" >> "$CFG"
fi
CMD="$BOOT/cmdline.txt"
if [ -f "$CMD" ]; then
  cp -n "$CMD" "$CMD.pivista-backup" || true
  line="$(head -n1 "$CMD")"
  for opt in "video=HDMI-A-1:1920x1080@60D" quiet loglevel=3 logo.nologo vt.global_cursor_default=0 consoleblank=0; do
    key="${opt%%=*}"
    if [ "$key" = video ]; then line="$(echo "$line" | sed -E 's/ ?video=HDMI-A-1:[^ ]*//')"; fi
    echo " $line " | grep -q " $opt " || line="$line $opt"
  done
  echo "$line" > "$CMD"
fi

# ------------------------------------------------------------------ hostname
if [ "$KEEP_HOSTNAME" = 0 ] && [ "$(hostname)" != pivista ]; then
  say "Setting hostname to 'pivista' → remote at http://pivista.local"
  old="$(hostname)"
  echo pivista > /etc/hostname
  sed -i "s/127\.0\.1\.1.*/127.0.1.1\tpivista/" /etc/hosts
  grep -q "127.0.1.1" /etc/hosts || echo -e "127.0.1.1\tpivista" >> /etc/hosts
  hostname pivista || true
  say "(old hostname was '$old')"
fi
systemctl enable avahi-daemon >/dev/null 2>&1 || true

# ------------------------------------------------------------------ performance tuning
if [ "$TUNING" = 1 ]; then
  say "Applying performance tuning"
  # compressed RAM swap instead of SD-card swap
  if [ -f /etc/default/zramswap ]; then
    sed -i 's/^#\?ALGO=.*/ALGO=zstd/; s/^#\?PERCENT=.*/PERCENT=50/' /etc/default/zramswap
    systemctl enable zramswap >/dev/null 2>&1 || true
  fi
  if systemctl list-unit-files | grep -q dphys-swapfile; then
    systemctl disable --now dphys-swapfile >/dev/null 2>&1 || true
  fi
  # keep logs in RAM, capped
  mkdir -p /etc/systemd/journald.conf.d
  printf '[Journal]\nStorage=volatile\nRuntimeMaxUse=32M\n' > /etc/systemd/journald.conf.d/pivista.conf
  # services a TV doesn't need
  for s in cups cups-browsed ModemManager triggerhappy packagekit; do
    systemctl disable --now "$s" >/dev/null 2>&1 || true
  done
  # Wi-Fi power saving causes stutter while streaming
  if [ -d /etc/NetworkManager/conf.d ]; then
    printf '[connection]\nwifi.powersave = 2\n' > /etc/NetworkManager/conf.d/pivista-wifi.conf
  fi
  # fewer writes to the SD card
  sed -i -E '/\s\/\s/ s/(defaults)(,noatime)?/\1,noatime/' /etc/fstab || true
  # responsive CPU scaling
  cat > /etc/systemd/system/pivista-cpufreq.service <<'EOF'
[Unit]
Description=PiVista CPU governor
[Service]
Type=oneshot
ExecStart=/bin/sh -c 'for c in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do echo ondemand > $c; done; echo 50 > /sys/devices/system/cpu/cpufreq/ondemand/up_threshold 2>/dev/null || true'
[Install]
WantedBy=multi-user.target
EOF
  systemctl enable pivista-cpufreq >/dev/null 2>&1 || true
fi

# ------------------------------------------------------------------ enable
systemctl daemon-reload
systemctl enable pivista.service
"$APP_DIR/system/autostart.sh" on
systemctl set-default graphical.target >/dev/null
systemctl restart pivista.service

say "Done! Reboot to start PiVista:  sudo reboot"
say "After reboot, scan the dot pattern on the TV with your phone (same Wi-Fi), or open http://$(hostname).local"
