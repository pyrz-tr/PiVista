# Changelog

All code is on the `claude/kind-mccarthy-xql5k2` branch.

## 0.5.0

- **Sound output**: HDMI (the TV's speakers) is used by default. Settings → Sound output switches to the audio jack, USB speakers or Bluetooth (any PipeWire output), and the choice is remembered. The audio jack is enabled in the boot config (`dtparam=audio=on`). Volume is adjustable in Settings too.
- **Wi‑Fi settings**: scan and connect (NetworkManager); the password is typed on the phone
- **Date & time**: automatic time on/off, searchable time-zone list, manual date/time, 24-hour clock
- **More settings**, grouped into sections: device name, screen resolution (1080p / 720p / monitor default), Update PiVista
- **Screen lock** (first paired phone only): pauses video, the media player and games, shows a lock screen on the TV and blocks all remotes until unlocked. `sudo pivista unlock` as an emergency fallback.
- **Network change** (new Wi‑Fi or new IP, also across reboots) → the TV shows the pairing screen again

## 0.4.0

- **Fix: Netflix, HBO Max, Disney+ (and other zoomed apps) only filled the top-left of the screen, with white around it.** The per-app TV zoom used device-metrics emulation, which in a real window only shrinks the page. It now uses real browser zoom through a small built-in Chromium extension (`system/zoom-extension`, asks `GET /api/zoom`), so pages re-layout and fill the screen. Phone Screen-tab taps are mapped for the zoom.
- **Turkish (Türkçe)**: Settings → Language. The TV interface, phone remotes, games and server notices follow it.
- **Faster games**: new WebGL batch renderer (`ui/games/render.js`): one GPU draw call per frame from a texture atlas, with an automatic Canvas-2D fallback when only software WebGL exists. Raspberry Rally, Berry Snake and Brick Blaster use it, and Berry Merge animates with GPU transforms.
- Screen mirroring pauses while a game is running, so the Pi's CPU goes to the game
- Temperature is checked every 30 s (every 10 s when the Pi is within 5 °C of the limit) instead of every 5 s; the TV's status bar refreshes every 30 s

## 0.3.2

- **Fix: black screen after installing with the one-line `curl … | sudo bash` command.** The installer downloaded into a root-only temp folder and `rsync` copied that `700` mode onto `/opt/pivista`, so the kiosk (running as user `pivista`) couldn't start its launcher (`status=203/EXEC`). The installer now makes `/opt/pivista` world-readable.
- `pivista doctor` detects this permission problem and shows the one-line fix

## 0.3.1

- **Fix: black screen when no keyboard/mouse is attached.** cage/wlroots refused to start without input devices; the kiosk now sets `WLR_LIBINPUT_NO_DEVICES=1` (new `system/start-kiosk.sh`, which also picks the DRM card with the connected HDMI monitor)
- Kiosk service waits for logind/dbus and never stops retrying; Chromium falls back to a GPU-disabled safe mode after repeated crashes; clearer kiosk log messages
- TV interface and games scale to fit any screen mode (720p, 1366×768, 4K) instead of being cut off
- TV interface no longer stays black if it can't reach the server: it shows the home screen and a "reconnecting" notice
- Fix: on port 80 the server didn't recognise its own TV page URL (browsers drop `:80`)
- New `pivista doctor` (diagnostics report) and `pivista update` commands; the installer restarts the screen right away, so updates need no reboot
- Optional `/etc/default/pivista` for extra Chromium flags (`PIVISTA_CHROMIUM_FLAGS`)

## 0.3.0

- **Games** app on the home screen, with four original games playable with the phone remote:
  - **Raspberry Rally**: pseudo-3D kart racer with 4 fruit drivers, 2 tracks, AI rivals, boost pads, berry pickups and turbo item boxes
  - **Berry Snake**, **Brick Blaster**, **Berry Merge**
- Phone **Game mode**: in a game, holding a remote button holds the key on the TV (press = key down, release = key up), so you can steer
- Screenshot gallery in `docs/screenshots` and in the README
- Installer downloads the `claude/kind-mccarthy-xql5k2` branch explicitly (override with `PIVISTA_BRANCH`)

## 0.2.0

- Raspberry logo (TV, remote, opening animation, browser tab icon) and an icon for every app
- Per-app TV zoom so desktop sites fill 1080p with readable text (Netflix/Max/Disney+ 150%, browser 125%)
- Optional **YouTube ad blocker** in Settings, off by default (YouTube Premium is unaffected)
- Phone **Screen tab**: live view of the TV with tap and scroll; paused while video plays to save the Pi's CPU and RAM
- Phone **keyboard** that opens automatically when a text field gets focus on the TV
- **Install your own apps**: website/PWA by address, single `.html` file, or `.zip` web app
- **Direct-IP fallback** when `.local` (mDNS) fails: IP in the TV top bar, a second "direct" pairing pattern, automatic switch on the phone
- Media Player: recently played, play a link, now-playing controls on the phone
- Web Browser: bookmarks, history, and back/forward/reload/address bar on the phone
- Security: only the TV page itself can act as the TV; installed apps run on a separate origin

## 0.1.0

- First version: Node.js server, TV interface (cage + Chromium kiosk) and phone remote at `http://pivista.local`
- Dot-pattern pairing, animated opening screen, home screen with YouTube, Netflix, HBO Max and Disney+
- System apps: Media Player (mpv, 4K output for 4K files), Web Browser, System Info, Pair Remote, Settings
- Starts on boot (can be turned off), HDMI configured for a reliable 1080p UI, overheat protection and performance tuning
- Installer, uninstaller, `pivista` command, `.deb` packaging and a GitHub Actions build
