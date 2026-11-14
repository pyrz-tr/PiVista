// Native video player (mpv) for local / USB / network files.
// This is the path that can output true 4K: hardware HEVC decode + HDMI mode switch.
const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const sys = require('./system');
const { settings } = require('./config');

const SOCK = '/tmp/pivista-mpv.sock';
const VIDEO_EXT = /\.(mkv|mp4|m4v|mov|avi|webm|ts|m2ts|mp3|flac|m4a|ogg|wav)$/i;
const ROOTS = (process.env.PIVISTA_MEDIA || '/home/pivista/Videos:/media').split(':');

let proc = null; let switched = false; let onChange = () => {};

function list(dir) {
  if (!dir) return ROOTS.filter((r) => fs.existsSync(r)).map((r) => ({ name: r, path: r, dir: true }));
  const real = path.resolve(dir);
  if (!ROOTS.some((r) => real === r || real.startsWith(r + '/'))) return [];
  try {
    return fs.readdirSync(real, { withFileTypes: true })
      .filter((e) => !e.name.startsWith('.') && (e.isDirectory() || VIDEO_EXT.test(e.name)))
      .map((e) => ({ name: e.name, path: path.join(real, e.name), dir: e.isDirectory() }))
      .sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name));
  } catch { return []; }
}

async function videoHeight(file) {
  const out = await sys.run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=height', '-of', 'csv=p=0', file]);
  return Number(out) || 0;
}

async function play(file) {
  stop();
  const h = await videoHeight(file);
  if (settings.allow4k && h > 1080) {
    // 4K at 30Hz works on every Pi 4; 60Hz needs hdmi_enable_4kp60=1 (more heat).
    switched = true;
    await sys.setMode('3840x2160@30');
  }
  const args = ['--fs', '--hwdec=auto-safe', '--vo=gpu', '--gpu-context=wayland', '--profile=fast',
    '--input-ipc-server=' + SOCK, '--osd-level=1', '--really-quiet', '--cache=yes', '--demuxer-max-bytes=150MiB', file];
  proc = process.getuid && process.getuid() === 0
    ? spawn('runuser', ['-u', process.env.PIVISTA_USER || 'pivista', '--', 'env', 'WAYLAND_DISPLAY=wayland-0',
      `XDG_RUNTIME_DIR=/run/user/${uidOf()}`, 'mpv', ...args], { stdio: 'ignore' })
    : spawn('mpv', args, { stdio: 'ignore' });
  proc.on('exit', async () => {
    proc = null;
    if (switched) { switched = false; await sys.setMode(sys.uiMode()); }
    onChange(null);
  });
  proc.on('error', () => { proc = null; onChange(null); });
  onChange({ file: path.basename(file), height: h });
}

function uidOf() {
  try { return require('child_process').execFileSync('id', ['-u', process.env.PIVISTA_USER || 'pivista']).toString().trim(); }
  catch { return '1000'; }
}

function command(cmd) {
  const c = net.connect(SOCK, () => { c.end(JSON.stringify({ command: cmd }) + '\n'); });
  c.on('error', () => {});
}

// Remote keys while the player is in front.
function key(k) {
  const map = {
    ok: ['cycle', 'pause'], playpause: ['cycle', 'pause'], space: ['cycle', 'pause'],
    left: ['seek', -10], right: ['seek', 10], up: ['seek', 60], down: ['seek', -60],
  };
  if (k === 'back') return stop();
  if (map[k]) command(map[k]);
}

function stop() { if (proc) { proc.kill('SIGTERM'); } }

module.exports = { list, play, stop, key, command, get active() { return !!proc; },
  set onChange(fn) { onChange = fn; } };
