#!/bin/bash
# Starts the cage Wayland kiosk compositor (as the "pivista" user, from pivista-kiosk.service)
# with the environment a keyboard-less, mouse-less TV box needs, then runs kiosk.sh inside it.

# PiVista is controlled from the phone, so usually NO keyboard or mouse is attached.
# Without this, wlroots refuses to start ("libinput initialization failed, no input
# devices") and the screen stays black.
export WLR_LIBINPUT_NO_DEVICES=1

# Raspberry Pi OS exposes two DRM cards (v3d = 3D only, vc4 = display). Point wlroots at the
# card that actually has a connected HDMI output so it never picks one with no screen.
if [ -z "${WLR_DRM_DEVICES:-}" ]; then
  for status in /sys/class/drm/card*-HDMI-A-*/status; do
    [ -f "$status" ] || continue
    if [ "$(cat "$status")" = connected ]; then
      card="$(basename "$(dirname "$status")")"   # e.g. card1-HDMI-A-1
      export WLR_DRM_DEVICES="/dev/dri/${card%%-*}"
      break
    fi
  done
fi

# Some monitors/drivers draw a corrupt or invisible hardware cursor; software cursor is safer.
export WLR_NO_HARDWARE_CURSORS=1

echo "PiVista kiosk: WLR_DRM_DEVICES=${WLR_DRM_DEVICES:-auto} XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-unset}"
for s in /sys/class/drm/card*-HDMI-A-*/status; do [ -f "$s" ] && echo "  $(basename "$(dirname "$s")"): $(cat "$s")"; done

# -s: allow switching VTs (Ctrl+Alt+F2 for a console if a keyboard is ever attached)
exec /usr/bin/cage -s -- /opt/pivista/system/kiosk.sh
