# PiVista

**Turn any HDMI monitor into a smart TV with a Raspberry Pi 4. Your phone is the remote.**

- 📺 10-foot TV interface (1080p) with an animated opening screen
- ▶️ YouTube (TV layout), Netflix, HBO Max and Disney+ via their official web players (Widevine DRM)
- 📱 Phone remote at **http://pivista.local**: pair by scanning the dot pattern on the TV. No app to install, no mouse, no keyboard.
- 🎬 Native media player (mpv, hardware decode) for videos on `~/Videos` or USB drives, **with 4K output** for 4K files
- ⚙️ System apps: Settings, System Info (temperature, throttling, power), Web Browser, Pair Remote
- 🚀 Starts on boot (you can turn that off in Settings)
- 🌡️ Overheat protection, SD-card-friendly tuning, HDMI tuned to work every time

---

## Requirements

| | |
|---|---|
| Board | Raspberry Pi 4 (2 GB works, 4 GB recommended) |
| OS | **Raspberry Pi OS 64-bit (Bookworm or newer)**, Lite or Desktop |
| Power | Official 5V/3A USB-C supply. Under-voltage causes stutter, and PiVista warns you about it. |
| Cooling | A heatsink at least. A case fan is better for long 4K sessions. |
| Network | Phone and Pi on the same Wi-Fi/LAN |

## Install

1. Flash **Raspberry Pi OS (64-bit)** with Raspberry Pi Imager. In the Imager settings, set Wi-Fi, a user and SSH.
2. Boot the Pi and SSH in (or use a keyboard just this once).
3. Run:

```bash
curl -fsSL https://raw.githubusercontent.com/pyrz-tr/PiVista/main/scripts/install.sh | sudo bash
```

4. Reboot:

```bash
sudo reboot
```

On first boot you'll see the PiVista intro and then the **Pair your phone** screen. Open your phone camera, scan the dot pattern, and you're in.

### Other ways to install

**From a checkout:**

```bash
git clone https://github.com/pyrz-tr/PiVista.git && cd PiVista && sudo ./scripts/install.sh
```

**From the .deb** (built by GitHub Actions; download it from *Releases* or the workflow artifacts):

```bash
sudo apt install ./pivista_0.1.0_all.deb
```

Installer options: `--keep-hostname` (don't rename the Pi to `pivista`), `--no-tuning` (skip system tuning).

## Using it

| Phone remote | What it does |
|---|---|
| D-pad / OK | Move and select (hold an arrow to repeat) |
| Back | Go back (inside YouTube too). At the top level of an app, returns Home |
| Home | Back to the PiVista home screen from anywhere |
| Play | Play/pause |
| − 🔇 + | HDMI volume |
| *Type on TV…* | Types into whatever field is focused on the TV: search boxes, logins, URLs |
| Touchpad tab | Mouse pointer for sites that need it (e.g. signing in to Netflix): drag to move, tap to click, two fingers to scroll |
| Apps tab | Jump straight to any app |

Tip: in the phone browser use **Add to Home Screen**, and the remote opens full screen like an app.

If `pivista.local` doesn't open on your phone (some older Android versions can't resolve `.local`), use the IP address shown on the pairing screen.

### Command line

```bash
pivista status     # service status
pivista logs       # follow logs
pivista restart    # restart server + TV interface
pivista disable    # don't start on boot (server + remote keep running)
pivista enable     # start on boot again
pivista uninstall  # remove services and boot tweaks (add --purge via scripts/uninstall.sh to delete everything)
```

---

## How it works

```
                 ┌──────────────── Raspberry Pi 4 ───────────────────┐
  Phone ── Wi-Fi ─▶  pivista.service (Node.js, :80)                    │
  http://pivista.local   • serves phone remote  /                      │
  (WebSocket)            • serves TV interface  /tv/                   │
                         • pairing (dot pattern = styled QR code)      │
                         • thermal guard, volume, HDMI mode, power     │
                         │  Chrome DevTools Protocol (localhost:9222)  │
                         ▼                                             │
                pivista-kiosk.service: cage (Wayland kiosk) ─▶ Chromium full screen ─▶ HDMI
                                                 └─▶ mpv (native 4K player)
```

- **Stack:** Node.js (2 small dependencies: `ws` and `qrcode`) and plain HTML/CSS/JS. Nothing to compile, so it's easy to hack on.
- **Display:** [cage](https://github.com/cage-kiosk/cage) is a minimal Wayland compositor that runs one app full screen. No desktop runs in the background, which leaves more RAM and GPU for video.
- **Remote input:** the server injects key presses, text and pointer events straight into Chromium over the DevTools Protocol. That works the same on PiVista's own UI and on Netflix/YouTube, with no fake input devices.
- **Streaming apps:** each one opens its official web player with a suitable user agent. YouTube gets the TV ("Leanback") layout, built for D-pad navigation. Netflix, Max and Disney+ get a Chrome OS user agent, which unlocks Widevine HD. Change these in `server/apps.js`.
- **Pairing:** the TV shows a one-time 6-digit code as a dot pattern (a QR code drawn with round dots) pointing to `http://pivista.local/#pair=CODE`. The phone trades the code for a long-lived device token. Only the TV itself can read the pattern endpoint. Codes rotate every 5 minutes and work only once.

### Video resolution: the honest version

- **UI: always 1920×1080@60.** It's forced in `cmdline.txt` (`video=HDMI-A-1:1920x1080@60D`) and again by `kiosk.sh` via `wlr-randr`, even on 4K screens. The Pi 4 GPU can't drive a smooth 4K browser UI.
- **Native player: up to 4K.** When a file is taller than 1080p and *Settings → Allow 4K output* is on, PiVista switches HDMI to 3840×2160@30, plays with hardware HEVC decoding, and switches back to 1080p when you exit. For 4K@60, uncomment `hdmi_enable_4kp60=1` in `/boot/firmware/config.txt` (it adds heat).
- **Streaming sites:** these are limited by the service, not by PiVista. DRM'd browser playback on Linux/ARM usually tops out at 720p–1080p, and the Pi 4 has no hardware VP9/AV1 decoder, so YouTube runs best at 1080p or lower.

### HDMI reliability

- `hdmi_force_hotplug=1` and the `D` flag on the kernel `video=` mode keep HDMI driven even if the monitor is off or slow to wake at boot.
- `disable_overscan=1` removes black borders. The UI renders 1:1 at 1920×1080 (`--force-device-scale-factor=1`).
- `cma-512` on the KMS overlay reserves enough contiguous memory for 4K decode buffers.
- Use the HDMI port **next to the USB-C power port** (HDMI0). The script detects whichever port is connected.

### Performance tuning (applied by the installer)

- No desktop environment, just cage + Chromium. GPU rasterization and zero-copy are on, and Chromium's cache lives in RAM (`/dev/shm`).
- zram swap (zstd) replaces SD-card swap. Logs stay in RAM (32 MB cap), the root filesystem uses `noatime`, and unneeded services (cups, ModemManager, triggerhappy, packagekit) are off.
- Wi-Fi power saving is off, which avoids stream stutter. The CPU uses the `ondemand` governor with a quicker ramp-up.
- The server gets a 300 MB memory cap.

### Overheat protection

1. **Firmware:** `temp_limit=82` (default 85 °C).
2. **PiVista thermal guard** (`server/thermal.js`) checks the SoC temperature every 5 s. At the limit set in Settings (default 80 °C) it caps the CPU at 1.2 GHz, and at limit + 5 °C at 1.0 GHz. It restores full speed below limit − 10 °C and shows a notice on screen (including on top of Netflix/YouTube).
3. **Under-voltage detection** through `vcgencmd get_throttled`, with an on-screen warning.
4. Optional lines in `config.txt` for a GPIO fan (`dtoverlay=gpio-fan`) and to drop the 1.8 GHz boost (`arm_boost=0`) on passively cooled boards.

---

## Development

Run it on any computer (the Chromium-control features simply don't do anything without a kiosk browser):

```bash
npm install
npm run dev
```

Then open the TV interface at http://localhost:8080/tv/ (use the arrow keys, Enter and Esc) and the remote at http://localhost:8080/.

To test remote control end to end on a desktop, start Chromium with `--remote-debugging-port=9222` and open the TV URL in it.

```
server/   Node.js server: index.js (HTTP/WS + routing), cdp.js (browser control), pairing.js,
          player.js (mpv), system.js (hardware), thermal.js, apps.js (app catalog), config.js
ui/tv/    TV interface (splash, spatial navigation, system apps)
ui/remote Phone remote (PWA)
system/   systemd units, kiosk launcher, boot config, CLI
scripts/  install / uninstall / CI self-test
packaging Debian package build
```

**Adding an app:** add an entry to `server/apps.js` with `url`, optional `userAgent`, `color`, `icon`, and `back: 'key'` (the site handles Esc itself) or `'history'`.

## CI / packaging

`.github/workflows/build.yml` runs on every push. It runs the self-test, syntax-checks the shell scripts, builds `pivista_<version>_all.deb` (architecture-independent, with `node_modules` bundled) and uploads it as an artifact. Pushing a tag like `v0.1.0` also publishes a GitHub Release with the `.deb`.

## Known limitations (v0.1)

- Streaming services can change their web apps or block unusual user agents at any time. If one breaks, try a different user agent in `server/apps.js`.
- Netflix/Max/Disney+ web players are made for mouse use. Use the D-pad where it works and the touchpad tab for the rest.
- No HDMI-CEC (TV remote) support yet.

## License

MIT
