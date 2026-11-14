#!/bin/bash
# Removes PiVista services and boot tweaks. Keeps the "pivista" user and its files.
set -e
[ "$(id -u)" = 0 ] || { echo "Run as root"; exit 1; }
BOOT=/boot/firmware; [ -d "$BOOT" ] || BOOT=/boot

systemctl disable --now pivista-kiosk.service pivista.service pivista-cpufreq.service 2>/dev/null || true
rm -f /etc/systemd/system/pivista.service /etc/systemd/system/pivista-kiosk.service \
      /etc/systemd/system/pivista-cpufreq.service /etc/pam.d/pivista-kiosk /usr/local/bin/pivista \
      /etc/systemd/journald.conf.d/pivista.conf /etc/NetworkManager/conf.d/pivista-wifi.conf
systemctl daemon-reload
systemctl enable lightdm.service 2>/dev/null || true

if [ -f "$BOOT/config.txt" ]; then
  sed -i '/# >>> PiVista >>>/,/# <<< PiVista <<</d' "$BOOT/config.txt"
  sed -i 's/^#\(dtoverlay=vc4-kms-v3d\)  # replaced by PiVista block below/\1/' "$BOOT/config.txt"
fi
[ -f "$BOOT/cmdline.txt.pivista-backup" ] && cp "$BOOT/cmdline.txt.pivista-backup" "$BOOT/cmdline.txt"

if [ "${1:-}" = "--purge" ]; then rm -rf /opt/pivista /var/lib/pivista; fi
echo "PiVista removed. Reboot to finish. (Use --purge to also delete /opt/pivista and settings.)"
