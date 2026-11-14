// Native video player (mpv) for local / USB / network files and stream URLs.
// This is the path that can output true 4K: hardware HEVC decode + HDMI mode switch.
const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn, execFileSync } = require('child_process');
const sys = require('./system');
const cfg = require('./config');

const SOCK = '/tmp/pivista-mpv.sock';
const MEDIA_EXT = /\.(mkv|mp4|m4v|mov|avi|webm|ts|m2ts|mpg|mpeg|wmv|flv|mp3|flac|m4a|aac|ogg|opus|wav)$/i;
const ROOTS = (process.env.PIVISTA_MEDIA || '/home/pivista/Videos:/home/pivista/Music:/media').split(':');
const KIOSK_USER = process.env.PIVISTA_USER || 'pivista';

let proc = null; let switched = false; let now = null; let poll = null;
let onChange = () => {};
if (!cfg.state.recentMedia) cfg.state.recentMedia = [];

function list(dir) {
  if (!dir) return ROOTS.filter((r) => fs.existsSync(r)).map((r) => ({ name: r, path: r, dir: true }));
  const real = path.resolve(dir);
  if (!ROOTS.some((r) => real === r || real.startsWith(r + '/'))) return [];
  try {
    return fs.readdirSync(real, { withFileTypes: true })
      .filter((e) => !e.name.startsWith('.') && (e.isDirectory() || MEDIA_EXT.test(e.name)))
      .map((e) => {
        const p = path.join(real, e.name);
        let size = 0; try { size = e.isDirectory() ? 0 : fs.statSync(p).size; } catch {}
        return { name: e.name, path: p, dir: e.isDirectory(), size };
      })
      .sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  } catch { return []; }
}

const isUrl = (s) => /^(https?|rtsp|rtmp):\/\//i.test(s);

async function videoHeight(file) {
  if (isUrl(file)) return 0;
  const out = await sys.run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=height', '-of', 'csv=p=0', file]);
  return Number(out) || 0;
}

function uidOf() { try { return execFileSync('id', ['-u', KIOSK_USER]).toString().trim(); } catch { return '1000'; } }

async function play(file) {
  if (!isUrl(file)) {
    const real = path.resolve(file);
    if (!ROOTS.some((r) => real.startsWith(r + '/'))) throw new Error('File outside media folders');
  }
  stop();
  const h = await videoHeight(file);
  if (cfg.settings.allow4k && h > 1080) {
    // 4K at 30Hz works on every Pi 4; 60Hz needs hdmi_enable_4kp60=1 (more heat).
    switched = true;
    await sys.setMode('3840x2160@30');
  }
  const args = ['--fs', '--hwdec=auto-safe', '--vo=gpu', '--gpu-context=wayland', '--profile=fast',
    '--input-ipc-server=' + SOCK, '--osd-level=1', '--osd-font-size=42', '--really-quiet', '--cache=yes',
    '--demuxer-max-bytes=150MiB', '--sub-auto=fuzzy', '--ytdl=yes', file];
  proc = process.getuid && process.getuid() === 0
    ? spawn('runuser', ['-u', KIOSK_USER, '--', 'env', 'WAYLAND_DISPLAY=wayland-0', `XDG_RUNTIME_DIR=/run/user/${uidOf()}`, 'mpv', ...args], { stdio: 'ignore' })
    : spawn('mpv', args, { stdio: 'ignore' });
  const mine = proc;
  proc.on('exit', async () => {
    if (proc !== mine) return;
    proc = null; now = null; clearInterval(poll);
    if (switched) { switched = false; await sys.setMode(sys.uiMode()); }
    onChange(null);
  });
  proc.on('error', () => { if (proc === mine) { proc = null; now = null; onChange(null); } });
  now = { title: isUrl(file) ? file : path.basename(file), height: h, pos: 0, duration: 0, paused: false };
  cfg.state.recentMedia = [{ path: file, name: now.title }, ...cfg.state.recentMedia.filter((r) => r.path !== file)].slice(0, 10);
  cfg.saveState();
  clearInterval(poll);
  poll = setInterval(refresh, 1000);
  onChange(now);
}

function ipc(command) {
  return new Promise((resolve) => {
    const c = net.connect(SOCK);
    let buf = '';
    c.on('connect', () => c.write(JSON.stringify({ command, request_id: 1 }) + '\n'));
    c.on('data', (d) => {
      buf += d;
      const line = buf.split('\n').find((l) => l.includes('"request_id":1'));
      if (line) { c.end(); try { resolve(JSON.parse(line).data); } catch { resolve(null); } }
    });
    c.on('error', () => resolve(null));
    setTimeout(() => { c.destroy(); resolve(null); }, 1000);
  });
}

async function refresh() {
  if (!now) return;
  const [pos, duration, paused, title] = await Promise.all([
    ipc(['get_property', 'time-pos']), ipc(['get_property', 'duration']), ipc(['get_property', 'pause']), ipc(['get_property', 'media-title'])]);
  if (!now) return;
  Object.assign(now, { pos: pos || 0, duration: duration || 0, paused: !!paused, title: title || now.title });
  onChange(now);
}

// Remote keys / buttons while the player is in front.
function key(k) {
  const map = {
    ok: ['cycle', 'pause'], playpause: ['cycle', 'pause'], space: ['cycle', 'pause'],
    left: ['seek', -10], right: ['seek', 10], up: ['seek', 60], down: ['seek', -60],
    subs: ['cycle', 'sub'], audio: ['cycle', 'audio'],
  };
  if (k === 'back' || k === 'stop') return stop();
  if (map[k]) ipc(map[k]).then(refresh);
}

function seekTo(seconds) { ipc(['seek', Number(seconds) || 0, 'absolute']).then(refresh); }
function stop() { if (proc) proc.kill('SIGTERM'); }

module.exports = { list, play, stop, key, seekTo, recent: () => cfg.state.recentMedia,
  get active() { return !!proc; }, get now() { return now; }, set onChange(fn) { onChange = fn; } };
