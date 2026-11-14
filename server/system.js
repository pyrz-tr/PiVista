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
  run, asKiosk,
};

module.exports = sys;
