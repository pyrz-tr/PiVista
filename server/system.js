// Hardware / OS integration: temperature, throttling, volume, display mode, power.
// Every call degrades gracefully when not running on a Pi (dev mode on a laptop).
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const { settings } = require('./config');

const KIOSK_USER = process.env.PIVISTA_USER || 'pivista';
const HDMI_OUTPUT = process.env.PIVISTA_HDMI || 'HDMI-A-1';

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 8000, ...opts }, (err, stdout) => resolve(err ? null : stdout.trim()));
  });
}

function readNum(p) { try { return Number(fs.readFileSync(p, 'utf8').trim()); } catch { return null; } }

function kioskEnv() {
  let uid = 1000;
  try { uid = Number(require('child_process').execFileSync('id', ['-u', KIOSK_USER]).toString().trim()); } catch {}
  return { ...process.env, XDG_RUNTIME_DIR: `/run/user/${uid}`, WAYLAND_DISPLAY: 'wayland-0' };
}

// Run a command as the kiosk user inside its Wayland/PipeWire session.
function asKiosk(cmd, args) {
  if (process.getuid && process.getuid() === 0) {
    return run('runuser', ['-u', KIOSK_USER, '--', 'env', `XDG_RUNTIME_DIR=${kioskEnv().XDG_RUNTIME_DIR}`, 'WAYLAND_DISPLAY=wayland-0', cmd, ...args]);
  }
  return run(cmd, args, { env: kioskEnv() });
}

function outputName() {
  try { return fs.readFileSync(`${kioskEnv().XDG_RUNTIME_DIR}/pivista-output`, 'utf8').trim() || HDMI_OUTPUT; } catch { return HDMI_OUTPUT; }
}

const sys = {
  tempC() { const t = readNum('/sys/class/thermal/thermal_zone0/temp'); return t == null ? null : Math.round(t / 100) / 10; },

  async throttled() {
    const out = await run('vcgencmd', ['get_throttled']); // throttled=0x50000
    if (!out) return null;
    const v = parseInt(out.split('=')[1], 16);
    return { raw: out.split('=')[1], underVoltage: !!(v & 0x1), throttled: !!(v & 0x4), softTempLimit: !!(v & 0x8),
      underVoltageOccurred: !!(v & 0x10000), throttledOccurred: !!(v & 0x40000) };
  },

  async info() {
    const nets = Object.values(os.networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal);
    const load = os.loadavg();
    return {
      hostname: os.hostname(), ip: nets.map((n) => n.address), tempC: sys.tempC(), throttled: await sys.throttled(),
      cpuFreqMHz: (readNum('/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq') || 0) / 1000 || null,
      load: load.map((l) => l.toFixed(2)), memTotalMB: Math.round(os.totalmem() / 1048576),
      memFreeMB: Math.round(os.freemem() / 1048576), uptimeH: (os.uptime() / 3600).toFixed(1),
      model: (() => { try { return fs.readFileSync('/proc/device-tree/model', 'utf8').replace(/\0/g, ''); } catch { return os.platform(); } })(),
      version: require('../package.json').version,
    };
  },

  // Cap CPU frequency when hot; restore when cool. (Writes need root.)
  setMaxFreq(khz) {
    for (let i = 0; i < os.cpus().length; i++) {
      const p = `/sys/devices/system/cpu/cpu${i}/cpufreq/scaling_max_freq`;
      try {
        const max = readNum(`/sys/devices/system/cpu/cpu${i}/cpufreq/cpuinfo_max_freq`);
        fs.writeFileSync(p, String(khz ? Math.min(khz, max) : max));
      } catch {}
    }
  },

  volume(dir) {
    const arg = dir === 'up' ? '5%+' : dir === 'down' ? '5%-' : null;
    if (dir === 'mute') return asKiosk('wpctl', ['set-mute', '@DEFAULT_AUDIO_SINK@', 'toggle']);
    return asKiosk('wpctl', ['set-volume', '-l', '1.0', '@DEFAULT_AUDIO_SINK@', arg]);
  },
  async getVolume() {
    const out = await asKiosk('wpctl', ['get-volume', '@DEFAULT_AUDIO_SINK@']); // "Volume: 0.40 [MUTED]"
    if (!out) return null;
    return { level: Math.round(parseFloat(out.split(' ')[1]) * 100), muted: out.includes('MUTED') };
  },

  // Switch the HDMI output mode (UI is 1080p, native player can request 4K).
  setMode(mode) {
    let out = HDMI_OUTPUT; // kiosk.sh records the connected HDMI port (HDMI-A-1 or HDMI-A-2)
    try { out = fs.readFileSync(`${kioskEnv().XDG_RUNTIME_DIR}/pivista-output`, 'utf8').trim() || out; } catch {}
    return asKiosk('wlr-randr', ['--output', out, '--mode', mode]);
  },
  uiMode() { return `${settings.uiResolution}@60Hz`; },

  async setAutostart(enabled) {
    await run(require('path').join(__dirname, '..', 'system', 'autostart.sh'), [enabled ? 'on' : 'off']);
  },

  reboot() { return run('systemctl', ['reboot']); },
  shutdown() { return run('systemctl', ['poweroff']); },
  restartUI() { return run('systemctl', ['restart', 'pivista-kiosk.service']); },
  // ---------------- sound outputs (PipeWire): HDMI, audio jack, USB speakers, Bluetooth…
  async audioOutputs() {
    const out = await asKiosk('wpctl', ['status']);
    if (!out) return [];
    const lines = out.split('\n'); const sinks = []; let inAudio = false, inSinks = false;
    for (const raw of lines) {
      const line = raw.replace(/[│├└─]/g, ' ');
      if (/^\S/.test(raw)) { inAudio = /^Audio/.test(raw); inSinks = false; continue; }
      if (!inAudio) continue;
      if (/:\s*$/.test(line)) { inSinks = /^\s*Sinks:\s*$/.test(line); continue; }   // section header
      if (!inSinks) continue;
      const m = line.match(/^\s*(\*)?\s*(\d+)\.\s+(.+?)(?:\s+\[vol:[^\]]*\])?\s*$/);
      if (m) {
        const name = m[3].trim();
        const kind = /hdmi/i.test(name) ? 'hdmi' : /usb/i.test(name) ? 'usb' : /headphone|analog|bcm2835|jack/i.test(name) ? 'jack' : /blue|bluez/i.test(name) ? 'bluetooth' : 'other';
        sinks.push({ id: Number(m[2]), name, kind, default: !!m[1] });
      }
    }
    return sinks;
  },
  setAudioOutput(id) { return asKiosk('wpctl', ['set-default', String(id)]); },
  async setVolumePercent(p) { return asKiosk('wpctl', ['set-volume', '-l', '1.0', '@DEFAULT_AUDIO_SINK@', (Math.max(0, Math.min(100, p)) / 100).toFixed(2)]); },

  // ---------------- Wi-Fi (NetworkManager)
  async wifiScan() {
    const out = await run('nmcli', ['-t', '-f', 'IN-USE,SSID,SIGNAL,SECURITY', 'dev', 'wifi', 'list', '--rescan', 'auto'], { timeout: 20000 });
    if (out == null) return null;
    const seen = new Map();
    for (const line of out.split('\n')) {
      const f = line.split(/(?<!\\):/).map((x) => x.replace(/\\:/g, ':'));
      if (f.length < 4 || !f[1]) continue;
      const n = { ssid: f[1], signal: Number(f[2]) || 0, secure: !!f[3] && f[3] !== '--', active: f[0] === '*' };
      const prev = seen.get(n.ssid);
      if (!prev || n.active || n.signal > prev.signal) seen.set(n.ssid, { ...n, active: n.active || (prev && prev.active) });
    }
    return [...seen.values()].sort((a, b) => (b.active - a.active) || (b.signal - a.signal));
  },
  async wifiConnect(ssid, password) {
    const args = ['dev', 'wifi', 'connect', ssid]; if (password) args.push('password', password);
    return new Promise((resolve) => execFile('nmcli', args, { timeout: 45000 }, (err, stdout, stderr) =>
      resolve(err ? { ok: false, error: (stderr || err.message).trim().split('\n').pop() } : { ok: true })));
  },
  async network() {
    const ssid = await run('nmcli', ['-t', '-f', 'ACTIVE,SSID', 'dev', 'wifi']);
    const active = ssid && ssid.split('\n').find((l) => l.startsWith('yes:'));
    const nets = Object.values(os.networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal);
    return { ssid: active ? active.slice(4).replace(/\\:/g, ':') : null, ips: nets.map((n) => n.address).sort(),
      ethernet: Object.keys(os.networkInterfaces()).some((k) => /^(eth|en)/.test(k) && os.networkInterfaces()[k].some((n) => n.family === 'IPv4')) };
  },

  // ---------------- date & time (systemd-timedated)
  async timeInfo() {
    const out = (await run('timedatectl', ['show'])) || '';
    const kv = Object.fromEntries(out.split('\n').map((l) => l.split('=')).filter((x) => x.length >= 2).map(([k, ...v]) => [k, v.join('=')]));
    return { timezone: kv.Timezone || Intl.DateTimeFormat().resolvedOptions().timeZone, ntp: kv.NTP === 'yes', synced: kv.NTPSynchronized === 'yes', now: new Date().toISOString() };
  },
  async timezones() { const out = await run('timedatectl', ['list-timezones']); return out ? out.split('\n') : Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : []; },
  setTimezone(tz) { return run('timedatectl', ['set-timezone', tz]); },
  setNtp(on) { return run('timedatectl', ['set-ntp', on ? 'true' : 'false']); },
  async setTime(str) {          // "YYYY-MM-DD HH:MM"
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(str)) throw new Error('Use the format YYYY-MM-DD HH:MM');
    await run('timedatectl', ['set-ntp', 'false']);
    const r = await run('timedatectl', ['set-time', str + ':00']);
    if (r == null) throw new Error('Could not set the time');
  },

  // ---------------- display + updates
  setResolution(res) { return res === 'auto' ? asKiosk('wlr-randr', ['--output', outputName(), '--preferred']) : sys.setMode(res); },
  run, asKiosk,
};

module.exports = sys;
