#!/bin/bash
# pivista autostart on|off — toggles the kiosk on boot. When off, the normal desktop
# (if Raspberry Pi OS Desktop is installed) or the console login comes back.
set -e
if [ "$1" = on ]; then
  systemctl enable pivista-kiosk.service
  systemctl disable lightdm.service 2>/dev/null || true
else
  systemctl disable pivista-kiosk.service
  systemctl enable lightdm.service 2>/dev/null || true
fi
