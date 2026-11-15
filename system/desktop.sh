#!/bin/bash
# desktop.sh enter  → close the PiVista TV screen and show the normal desktop
#                     (Raspberry Pi OS Desktop) or the login console (Lite).
# desktop.sh leave  → close the desktop and bring the PiVista TV screen back.
# The PiVista server (and so the phone remote) keeps running in both modes.
# Boot behaviour is not changed: after a reboot PiVista starts as usual (if autostart is on).
set -e
DM=""
for d in lightdm gdm3 sddm; do systemctl cat "$d.service" >/dev/null 2>&1 && { DM="$d"; break; }; done
case "$1" in
  enter)
    systemctl stop pivista-kiosk.service
    if [ -n "$DM" ]; then systemctl start "$DM.service"; else systemctl start getty@tty1.service; fi
    echo "desktop:${DM:-console}" ;;
  leave)
    [ -n "$DM" ] && systemctl stop "$DM.service" || true
    systemctl reset-failed pivista-kiosk.service 2>/dev/null || true
    systemctl start pivista-kiosk.service      # Conflicts=getty@tty1 stops the console automatically
    echo "tv" ;;
  *) echo "usage: desktop.sh enter|leave"; exit 1 ;;
esac
