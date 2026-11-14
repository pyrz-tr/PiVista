#!/bin/bash
# pivista doctor: checks why the TV screen might be black / PiVista misbehaves.
# Prints a report and saves it to /tmp/pivista-doctor.txt so it can be shared.
REPORT=/tmp/pivista-doctor.txt
KIOSK_USER=pivista
G='\e[1;32m'; R='\e[1;31m'; Y='\e[1;33m'; N='\e[0m'
ok()   { echo -e "${G}  OK  ${N} $*"; }
bad()  { echo -e "${R} FAIL ${N} $*"; }
warn() { echo -e "${Y} WARN ${N} $*"; }
hint() { echo "        → $*"; }

{
echo "PiVista doctor  $(date)"
echo "Model: $(tr -d '\0' </proc/device-tree/model 2>/dev/null)  ·  OS: $(. /etc/os-release; echo "$PRETTY_NAME")  ·  kernel $(uname -r)"
echo

echo "== Services"
for s in pivista pivista-kiosk; do
  st="$(systemctl is-active "$s" 2>/dev/null)"; en="$(systemctl is-enabled "$s" 2>/dev/null)"
  if [ "$st" = active ]; then ok "$s is running (enabled: $en)"; else bad "$s is $st (enabled: $en)"; fi
done
systemctl is-enabled pivista-kiosk >/dev/null 2>&1 || hint "the TV screen is switched off on boot. Turn it on: sudo pivista enable && sudo pivista restart"
for dm in lightdm gdm3 sddm; do systemctl is-active "$dm" >/dev/null 2>&1 && warn "$dm (desktop login) is running and may own the screen" && hint "sudo systemctl disable --now $dm && sudo pivista restart"; done
echo "Default boot target: $(systemctl get-default)"
[ "$(systemctl get-default)" = graphical.target ] || hint "sudo systemctl set-default graphical.target"

echo; echo "== Programs"
for c in cage wlr-randr curl node; do command -v "$c" >/dev/null && ok "$c: $(command -v "$c")" || { bad "$c missing"; hint "sudo apt install $c"; }; done
CH="$(command -v chromium-browser || command -v chromium)"
[ -n "$CH" ] && ok "chromium: $CH" || { bad "chromium missing"; hint "sudo apt install chromium-browser   (newer OS: chromium)"; }
[ -x /opt/pivista/system/start-kiosk.sh ] && ok "start-kiosk.sh present" || { bad "/opt/pivista/system/start-kiosk.sh missing (old install)"; hint "re-run the installer (see README → Updating)"; }
grep -q WLR_LIBINPUT_NO_DEVICES /etc/systemd/system/pivista-kiosk.service 2>/dev/null \
  && ok "kiosk service allows running without keyboard/mouse" \
  || { bad "kiosk service lacks WLR_LIBINPUT_NO_DEVICES=1 (black screen without keyboard/mouse)"; hint "re-run the installer (see README → Updating)"; }

echo; echo "== Display hardware"
ls /dev/dri/ 2>/dev/null | tr '\n' ' '; echo
found=0
for s in /sys/class/drm/card*-HDMI-A-*/status; do
  [ -f "$s" ] || continue; found=1
  d="$(dirname "$s")"; name="$(basename "$d")"; st="$(cat "$s")"
  modes="$(head -3 "$d/modes" 2>/dev/null | tr '\n' ' ')"
  if [ "$st" = connected ]; then ok "$name connected · modes: ${modes:-none reported}"; else echo "        $name: $st"; fi
done
[ $found = 1 ] || { bad "no HDMI connectors found (KMS driver not loaded?)"; hint "config.txt needs dtoverlay=vc4-kms-v3d (the installer adds it), then reboot"; }
grep -l connected /sys/class/drm/card*-HDMI-A-*/status >/dev/null 2>&1 || { warn "no monitor detected right now"; hint "use the HDMI port next to the USB-C power port, check the cable and the monitor input, then: sudo pivista restart"; }
id "$KIOSK_USER" >/dev/null 2>&1 && ok "user $KIOSK_USER: $(id -nG "$KIOSK_USER")" || bad "user $KIOSK_USER missing (re-run installer)"
for grp in video render input; do id -nG "$KIOSK_USER" 2>/dev/null | grep -qw "$grp" || { bad "$KIOSK_USER not in group $grp"; hint "sudo usermod -aG video,render,input $KIOSK_USER && sudo pivista restart"; }; done
BOOT=/boot/firmware; [ -d $BOOT ] || BOOT=/boot
grep -q "PiVista" "$BOOT/config.txt" 2>/dev/null && ok "PiVista block in $BOOT/config.txt" || warn "PiVista block missing from $BOOT/config.txt"
echo "cmdline: $(grep -o 'video=[^ ]*' /proc/cmdline)"
command -v vcgencmd >/dev/null && echo "$(vcgencmd measure_temp) · $(vcgencmd get_throttled)"

echo; echo "== Sessions"
loginctl list-sessions --no-legend 2>/dev/null

echo; echo "== Server"
P=80; curl -fs "http://127.0.0.1/api/hello" >/dev/null && ok "server answers on port $P: $(curl -fs http://127.0.0.1/api/hello)" || bad "server does not answer on port 80"
curl -fs http://127.0.0.1:9222/json/version >/dev/null && ok "kiosk Chromium is up (DevTools on :9222)" || bad "kiosk Chromium is not running (nothing on :9222)"

echo; echo "== Last kiosk log lines (journalctl -u pivista-kiosk)"
journalctl -u pivista-kiosk -b --no-pager -n 40 2>/dev/null | cut -c1-220
echo; echo "== Last server log lines"
journalctl -u pivista -b --no-pager -n 15 2>/dev/null | cut -c1-220
} 2>&1 | tee >(sed 's/\x1b\[[0-9;]*m//g' > "$REPORT")

sleep 0.3
echo
echo "Report saved to $REPORT"
