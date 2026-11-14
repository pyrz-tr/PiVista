# Changelog

All code is on the `claude/kind-mccarthy-xql5k2` branch.

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
