// PiVista server: serves the TV interface (shown by kiosk Chromium) and the phone
// remote (http://pivista.local or http://<ip>), and bridges remote commands to the browser / player.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { WebSocketServer } = require('ws');
const cfg = require('./config');
const builtins = require('./apps');
const cdp = require('./cdp');
const sys = require('./system');
const thermal = require('./thermal');
const pairing = require('./pairing');
const player = require('./player');
const adblock = require('./adblock');
const userapps = require('./userapps');
const { t: T } = require('./i18n');
const updater = require('./updater');

const PORT = Number(process.env.PIVISTA_PORT || 80);
const UI_ROOT = path.join(__dirname, '..', 'ui');
// Browsers drop the default port, so on port 80 the kiosk reports http://127.0.0.1/tv/ (no :80).
const TV_URL = PORT === 80 ? 'http://127.0.0.1/tv/' : `http://127.0.0.1:${PORT}/tv/`;
const TV_ORIGIN = new URL(TV_URL).origin;
const MAX_UPLOAD = 100 * 1024 * 1024;
const MIME = { '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8' };

if (!cfg.state.bookmarks) {
  cfg.state.bookmarks = [
    { name: 'Google', url: 'https://www.google.com' }, { name: 'Wikipedia', url: 'https://www.wikipedia.org' },
    { name: 'Twitch', url: 'https://www.twitch.tv' }, { name: 'Spotify', url: 'https://open.spotify.com' },
  ];
}
if (!cfg.state.browserHistory) cfg.state.browserHistory = [];

let currentApp = null; // app object when a web app is in front, null for our TV UI / games
let lastUrl = '';      // last top-level URL in the kiosk browser
const log = (...a) => console.log(new Date().toISOString(), ...a);
const isLocal = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
const allApps = () => [...builtins, ...userapps.asApps(PORT)];
const lanIPs = () => Object.values(os.networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal).map((n) => n.address);
const portSuffix = PORT === 80 ? '' : ':' + PORT;

// ---------- HTTP ----------
function sendJSON(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); }

function readBody(req, limit = 1e5) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('Upload too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
const readJSON = async (req) => { try { return JSON.parse((await readBody(req)).toString() || '{}'); } catch { return {}; } };

function serveFile(res, file, type) {
  fs.readFile(file, (err, data) => {
    if (err) return sendJSON(res, 404, { error: 'not found' });
    res.writeHead(200, { 'Content-Type': type || MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (p === '/api/pair/pattern.svg') {
      if (!isLocal(req)) return sendJSON(res, 403, { error: 'pattern is only shown on the TV' });
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' });
      return res.end(pairing.patternSvg(PORT, url.searchParams.get('via') === 'ip' ? lanIPs()[0] : null));
    }
    if (p === '/api/pair' && req.method === 'POST') {
      const body = await readJSON(req);
      const dev = pairing.pair(body.code, body.name);
      if (!dev) return sendJSON(res, 401, { error: 'Invalid or expired code' });
      log('paired', dev.name);
      broadcast({ t: 'paired', name: dev.name });
      return sendJSON(res, 200, { token: dev.token, name: cfg.settings.deviceName });
    }
    // Public: lets the remote learn the direct IP address(es) for when .local (mDNS) fails.
    if (p === '/api/hello') return sendJSON(res, 200, { name: cfg.settings.deviceName, host: `${os.hostname()}.local${portSuffix}`, ips: lanIPs().map((ip) => ip + portSuffix) });
    if (p === '/api/apps') return sendJSON(res, 200, allApps());
    // Emergency unlock from the Pi's terminal (sudo pivista unlock). The custom header makes
    // browsers send a CORS preflight, which we never answer, so web pages can't call this.
    if (p === '/api/unlock' && req.method === 'POST') {
      if (!isLocal(req) || req.headers['x-pivista-cli'] !== '1') return sendJSON(res, 403, {});
      await setLock(false, 'terminal'); return sendJSON(res, 200, { ok: true });
    }
    // Asked by the kiosk's zoom extension on every navigation: which browser zoom fits this page on a TV?
    if (p === '/api/zoom') {
      if (!isLocal(req)) return sendJSON(res, 403, {});
      const u = url.searchParams.get('url') || '';
      const zoom = u.startsWith(TV_URL) || u.startsWith(new URL(TV_URL).origin + '/games/') ? 1 : (currentApp && currentApp.scale) || (currentApp && currentApp.browser ? builtins.BROWSER_SCALE : 1);
      return sendJSON(res, 200, { zoom });
    }

    // App install by file upload (from the phone): raw body, ?name=<filename>&scale=<zoom>
    if (p === '/api/apps/install' && req.method === 'POST') {
      if (!pairing.check(req.headers['x-pivista-token'])) return sendJSON(res, 401, { error: 'not paired' });
      const buf = await readBody(req, MAX_UPLOAD);
      const app = await userapps.installFile(url.searchParams.get('name'), buf, { scale: url.searchParams.get('scale') });
      log('installed app', app.name);
      broadcast({ t: 'apps', apps: allApps() });
      return sendJSON(res, 200, app);
    }

    if (p.startsWith('/userapps/')) {
      const [, , id, ...rest] = p.split('/');
      const r = userapps.resolveFile(id, decodeURIComponent(rest.join('/')));
      return r ? serveFile(res, r.file, r.type) : sendJSON(res, 404, {});
    }

    // static files: "/" -> phone remote, "/tv/" -> TV interface
    let file = p === '/' ? '/remote/index.html' : p.endsWith('/') ? p + 'index.html' : p;
    file = path.normalize(path.join(UI_ROOT, decodeURIComponent(file)));
    if (!file.startsWith(UI_ROOT + path.sep)) return sendJSON(res, 403, {});
    serveFile(res, file);
  } catch (e) {
    sendJSON(res, 400, { error: e.message });
  }
});

// ---------- WebSocket ----------
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1e6 });
const clients = new Set();

function broadcast(msg, filter = () => true) {
  const s = JSON.stringify(msg);
  for (const c of clients) if (c.readyState === 1 && filter(c)) c.send(s);
}
const toRemotes = (msg) => broadcast(msg, (c) => c.role === 'remote');

// Toasts: our TV UI renders them itself; on web apps we inject a small overlay.
function notify(msg) {
  broadcast(msg);
  if (currentApp && msg.message) {
    const text = JSON.stringify(msg.message);
    cdp.eval(`(()=>{let t=document.getElementById('__pv_toast');if(!t){t=document.createElement('div');t.id='__pv_toast';
      t.style.cssText='position:fixed;top:32px;right:32px;z-index:2147483647;background:rgba(20,10,25,.92);color:#fff;font:600 20px system-ui;padding:14px 22px;border-radius:14px;box-shadow:0 10px 40px #0008;transition:opacity .4s;pointer-events:none';
      document.documentElement.appendChild(t);}t.textContent=${text};t.style.opacity=1;clearTimeout(t._h);t._h=setTimeout(()=>t.style.opacity=0,2500);})()`).catch(() => {});
  }
}

// ---------- pointer (touchpad / mirror taps). Stored in screen px, sent to Chromium in CSS px.
const cursor = { x: 960, y: 540, last: 0 };
function drawCursor() {
  if (Date.now() - cursor.last < 30) return;
  cursor.last = Date.now();
  const s = cdp.scale;
  cdp.eval(`(()=>{let c=document.getElementById('__pv_cur');if(!c){c=document.createElement('div');c.id='__pv_cur';
    c.style.cssText='position:fixed;left:0;top:0;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;background:#fff;border:3px solid #e0115f;z-index:2147483647;pointer-events:none;box-shadow:0 0 12px #0009';
    document.documentElement.appendChild(c);}c.style.transform='translate(${cursor.x / s}px,${cursor.y / s}px)';})()`).catch(() => {});
}
async function moveCursor(dx, dy) {
  cursor.x = Math.max(0, Math.min(cdp.SCREEN.w - 1, cursor.x + dx));
  cursor.y = Math.max(0, Math.min(cdp.SCREEN.h - 1, cursor.y + dy));
  await cdp.mouse('mouseMoved', cursor.x / cdp.scale, cursor.y / cdp.scale);
  drawCursor();
}

// ---------- screen mirror: phone sees the TV UI / web page, but never video
// (video frames are paused out of the stream to keep the Pi's CPU and RAM free).
const mirror = { running: false, paused: null, meta: null };
const mirrorClients = () => [...clients].filter((c) => c.mirror && c.readyState === 1);
const VIDEO_CHECK = `(() => [...document.querySelectorAll('video')].some((v) => !v.paused && !v.ended && v.readyState > 2 && v.offsetWidth * v.offsetHeight > 120000))()`;

async function mirrorTick() {
  const viewers = mirrorClients();
  if (!viewers.length) {
    if (mirror.running) { mirror.running = false; await cdp.stopScreencast(); }
    return;
  }
  let reason = null;
  if (player.active) reason = 'player';
  else if (stateNow().game) reason = 'game';    // games animate every frame: streaming them would steal CPU from the game
  else if (cdp.connected) { try { if (await cdp.eval(VIDEO_CHECK)) reason = 'video'; } catch {} }
  else reason = 'offline';
  if (reason !== mirror.paused) {
    mirror.paused = reason;
    for (const c of viewers) c.send(JSON.stringify({ t: 'mirror', paused: reason }));
  }
  if (reason && mirror.running) { mirror.running = false; await cdp.stopScreencast(); }
  if (!reason && !mirror.running) {
    try { await cdp.startScreencast(); mirror.running = true; if (process.env.PIVISTA_DEBUG) log('screencast start'); } catch (e) { if (process.env.PIVISTA_DEBUG) log('sc fail', e.message); }
  }
}
setInterval(() => mirrorTick().catch(() => {}), 1000).unref();

cdp.on('frame', (f) => {
  mirror.meta = f.metadata;
  if (process.env.PIVISTA_DEBUG) log('frame', f.sessionId, Math.round(f.metadata.deviceWidth), mirrorClients().length);
  const jpg = Buffer.from(f.data, 'base64');
  for (const c of mirrorClients()) if (c.bufferedAmount < 400000) c.send(jpg, { binary: true });
  setTimeout(() => cdp.ackFrame(f.sessionId), 150); // caps the stream at ~6 fps
});
cdp.on('disconnected', () => { mirror.running = false; });

// Screencast metadata is in screen (DIP) pixels; CDP mouse events use the page's CSS pixels,
// which are smaller by the browser zoom (cdp.scale) when an app is zoomed for the TV.
async function mirrorPoint(fx, fy) {
  const m = mirror.meta || { deviceWidth: cdp.SCREEN.w, deviceHeight: cdp.SCREEN.h };
  const sx = Math.max(0, Math.min(1, fx)) * m.deviceWidth; const sy = Math.max(0, Math.min(1, fy)) * m.deviceHeight;
  cursor.x = sx; cursor.y = sy;
  return { x: sx / cdp.scale, y: sy / cdp.scale };
}

// ---------- navigation ----------
async function goHome(screen = 'home') {
  player.stop();
  currentApp = null;
  await cdp.navigate(TV_URL + '#' + screen);
}

function webOptions(app) {
  const opts = { userAgent: app.userAgent, scale: app.scale || 1 };
  if (app.id === 'youtube' && cfg.settings.youtubeAdblock) { opts.scripts = [adblock.SCRIPT]; opts.blocked = adblock.BLOCKED; }
  return opts;
}

async function openUrl(url) {
  if (!/^https?:\/\//i.test(url)) {
    url = /^[^\s]+\.[a-z]{2,}(\/|$)/i.test(url) ? 'https://' + url : 'https://www.google.com/search?q=' + encodeURIComponent(url);
  }
  currentApp = { id: 'browser', name: 'Web Browser', back: 'history', browser: true, scale: builtins.BROWSER_SCALE };
  await cdp.navigate(url, { scale: builtins.BROWSER_SCALE });
}

async function launch(id, url) {
  if (id === 'url' && url) return openUrl(String(url));
  const app = allApps().find((a) => a.id === id);
  if (!app) return;
  if (app.type === 'system') return goHome(id);
  player.stop();
  currentApp = app;
  log('launch', app.name);
  await cdp.navigate(app.url, webOptions(app));
}

async function back() {
  if (player.active) return player.key('back');
  if (!currentApp) return cdp.key('back'); // TV UI handles its own back stack
  if (currentApp.back === 'key') return cdp.key('back');
  if (await cdp.eval('document.fullscreenElement ? (document.exitFullscreen(), true) : false')) return;
  if (!(await cdp.history(-1))) return goHome();
}

function stateNow() {
  return { app: currentApp && currentApp.id, appName: currentApp && currentApp.name, browser: !!(currentApp && currentApp.browser),
    playing: player.active, now: player.now, game: !currentApp && /\/games\/[a-z]+\.html/.test(lastUrl) };
}

const handlers = {
  async key({ k }) {
    if (k === 'back') return back();
    if (k === 'home') return goHome();
    if (player.active) return player.key(k);
    return cdp.key(k);
  },
  keydown: ({ k }) => (player.active ? null : cdp.keyDown(k)),
  keyup: ({ k }) => (player.active ? null : cdp.keyUp(k)),
  text: ({ v }) => cdp.text(String(v || '')),
  setText: ({ v }) => cdp.setFieldText(String(v || '')),
  mouse: ({ dx, dy }) => moveCursor(Number(dx) || 0, Number(dy) || 0),
  click: () => cdp.click(cursor.x / cdp.scale, cursor.y / cdp.scale),
  scroll: ({ dy }) => cdp.scroll(cursor.x / cdp.scale, cursor.y / cdp.scale, Number(dy) || 0),
  async tap({ fx, fy }) { const { x, y } = await mirrorPoint(fx, fy); await cdp.click(x, y); drawCursor(); },
  async mscroll({ fx, fy, dy }) { const { x, y } = await mirrorPoint(fx, fy); await cdp.scroll(x, y, Number(dy) || 0); },
  mirror(msg, ws) { ws.mirror = !!msg.on; mirror.paused = undefined; return mirrorTick(); },
  async volume({ v }) {
    await sys.volume(v);
    const vol = await sys.getVolume();
    if (vol) notify({ t: 'volume', ...vol, message: vol.muted ? T('Muted') : T('Volume {n}%', { n: vol.level }) });
  },
  launch: ({ id, url }) => launch(id, url),
  home: () => goHome(),
  apps: () => allApps(),
  async installUrl({ url, scale }) {
    const app = await userapps.installUrl(url, { scale });
    log('installed app', app.name);
    broadcast({ t: 'apps', apps: allApps() });
    return app;
  },
  removeApp({ id }) { userapps.remove(id); broadcast({ t: 'apps', apps: allApps() }); return allApps(); },
  info: () => sys.info(),
  settings: () => cfg.settings,
  async setSettings({ patch }) {
    const allowed = ['deviceName', 'autostart', 'allow4k', 'thermalLimitC', 'showSplash', 'screensaverMinutes', 'youtubeAdblock', 'language', 'clock24'];
    for (const k of allowed) if (patch && k in patch) cfg.settings[k] = patch[k];
    cfg.saveSettings();
    if (patch && 'autostart' in patch) await sys.setAutostart(!!patch.autostart);
    broadcast({ t: 'settings', settings: cfg.settings });
    return cfg.settings;
  },
  pairInfo: () => ({ networkChanged, url: pairing.pairUrl(PORT), ipUrl: lanIPs()[0] ? pairing.pairUrl(PORT, lanIPs()[0]) : null,
    code: pairing.currentCode(), devices: pairing.devices(), ips: lanIPs().map((ip) => ip + portSuffix) }),
  forget: ({ id }) => {
    pairing.forget(id);
    if (lock.on && (!cfg.state.devices.length || !id)) setLock(false, '');   // nobody left who could unlock
    return pairing.devices();
  },
  // media player
  mediaList: ({ dir }) => player.list(dir),
  mediaRecent: () => player.recent(),
  mediaPlay: ({ path: f }) => player.play(String(f || '')),
  mediaKey: ({ k }) => player.key(k),
  mediaSeek: ({ s }) => player.seekTo(s),
  // browser
  bookmarks: () => ({ bookmarks: cfg.state.bookmarks, history: cfg.state.browserHistory.slice(0, 12) }),
  async addBookmark() {
    const cur = currentApp && currentApp.browser ? await cdp.current() : null;
    if (!cur) return null;
    if (!cfg.state.bookmarks.find((b) => b.url === cur.url)) cfg.state.bookmarks.push({ name: (cur.title || cur.url).slice(0, 40), url: cur.url });
    cfg.saveState(); notify({ t: 'info', message: T('Bookmark added') });
    return cfg.state.bookmarks;
  },
  removeBookmark({ url }) { cfg.state.bookmarks = cfg.state.bookmarks.filter((b) => b.url !== url); cfg.saveState(); return cfg.state.bookmarks; },
  async browserNav({ v }) {
    if (v === 'back') return back();
    if (v === 'forward') return cdp.history(1);
    if (v === 'reload') return cdp.reload();
  },
  // ---- sound
  async audioOutputs() { return sys.audioOutputs(); },
  async setAudioOutput({ id }) {
    const outs = await sys.audioOutputs(); const o = outs.find((x) => x.id === Number(id));
    if (!o) throw new Error('No such output');
    await sys.setAudioOutput(o.id); cfg.settings.audioOutput = o.name; cfg.saveSettings();
    return sys.audioOutputs();
  },
  async getVolume() { return sys.getVolume(); },
  async setVolume({ p }) { await sys.setVolumePercent(Number(p) || 0); return sys.getVolume(); },
  // ---- Wi-Fi / network
  wifiScan: () => sys.wifiScan(),
  wifiConnect: ({ ssid, password }) => sys.wifiConnect(String(ssid || ''), password ? String(password) : ''),
  network: () => sys.network(),
  // ---- date & time
  timeInfo: () => sys.timeInfo(),
  async timezones({ q }) {
    const all = await sys.timezones(); const f = String(q || '').toLowerCase().replace(/\s+/g, '_');
    return (f ? all.filter((z) => z.toLowerCase().includes(f)) : all).slice(0, 60);
  },
  async setTimezone({ tz }) { const all = await sys.timezones(); if (!all.includes(tz)) throw new Error('Unknown time zone'); await sys.setTimezone(tz); return sys.timeInfo(); },
  async setNtp({ on }) { await sys.setNtp(!!on); return sys.timeInfo(); },
  async setTime({ v }) { await sys.setTime(String(v || '').trim()); return sys.timeInfo(); },
  // ---- display / maintenance
  async setResolution({ v }) {
    if (!['auto', '1920x1080', '1280x720'].includes(v)) throw new Error('Unsupported resolution');
    cfg.settings.uiResolution = v; cfg.saveSettings(); await sys.setResolution(v === 'auto' ? 'auto' : v + '@60Hz'); return cfg.settings;
  },
  // ---- updates (GitHub API; works for private repos with a token saved on the Pi)
  checkUpdate: () => updater.check(),
  startUpdate: () => updater.start(),
  updateStatus: () => updater.status(),
  setGithubToken: ({ token }) => updater.setToken(token),
  // ---- desktop mode: close the TV screen and show the normal desktop; the owner phone can bring PiVista back
  async exitToDesktop(msg, ws) {
    if (ws.role === 'remote' && !(ws.device && isOwner(ws.device))) throw new Error('Only the first paired phone can do this');
    desktop.on = true; broadcast({ t: 'desktop', on: true });
    log('exit to desktop');
    setTimeout(() => sys.run('/opt/pivista/system/desktop.sh', ['enter']), 300);
    return { on: true };
  },
  async returnToTv(msg, ws) {
    if (ws.role === 'remote' && !(ws.device && isOwner(ws.device))) throw new Error('Only the first paired phone can open PiVista again');
    log('back to the TV screen');
    await sys.run('/opt/pivista/system/desktop.sh', ['leave']);
    desktop.on = false; broadcast({ t: 'desktop', on: false });
    return { on: false };
  },
  ackNetwork() { networkChanged = false; },
  // ---- screen lock (owner phone only)
  lock(msg, ws) {
    if (!ws.device || !isOwner(ws.device)) throw new Error('Only the first paired phone can lock the screen');
    return setLock(!!msg.on, ws.device.name);
  },
  power: ({ v }) => (v === 'reboot' ? sys.reboot() : v === 'shutdown' ? sys.shutdown() : v === 'restart-ui' ? sys.restartUI() : null),
  state: () => stateNow(),
};
// Commands only the TV itself may issue.
const TV_ONLY = new Set(['pairInfo', 'ackNetwork']);
// While the screen is locked, phones may only read state (and the owner may unlock).
const LOCK_ALLOWED = new Set(['returnToTv', 'state', 'apps', 'info', 'settings', 'lock', 'mirror', 'getVolume', 'network', 'timeInfo', 'audioOutputs']);

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://x');
  const device = pairing.check(url.searchParams.get('token'));
  // The TV role needs a localhost connection *from the TV page's origin* — installed
  // apps run on http://localhost/... and therefore can't take over the TV role.
  const tv = isLocal(req) && req.headers.origin === TV_ORIGIN;
  if (!tv && !device) { ws.close(4001, 'not paired'); return; }
  ws.role = device ? 'remote' : 'tv';
  ws.device = device || null;
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
  ws.on('message', async (raw, isBinary) => {
    if (isBinary) return;
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    const h = handlers[msg.t];
    if (!h || (TV_ONLY.has(msg.t) && ws.role !== 'tv')) return;
    if (lock.on && ws.role === 'remote' && !LOCK_ALLOWED.has(msg.t)) {
      if (msg.id) ws.send(JSON.stringify({ t: 'res', id: msg.id, error: 'locked' }));
      return;
    }
    try {
      const data = await h(msg, ws);
      if (msg.id) ws.send(JSON.stringify({ t: 'res', id: msg.id, data }));
    } catch (e) {
      if (msg.id) ws.send(JSON.stringify({ t: 'res', id: msg.id, error: e.message }));
      if (!/CDP|ECONNREFUSED|fetch failed/.test(e.message)) log('error', msg.t, e.message);
    }
  });
  ws.send(JSON.stringify({ t: 'hello', role: ws.role, settings: cfg.settings, state: stateNow(), owner: !!(device && isOwner(device)), lock: lockInfo(), desktop: desktop.on }));
});

// ---------- screen lock: the first paired phone (the owner) can lock the TV.
// Pauses video / media player / games, covers the screen and blocks every remote until unlocked.
const lock = { on: !!(cfg.state.lock && cfg.state.lock.on), by: (cfg.state.lock && cfg.state.lock.by) || '' };
const isOwner = (d) => cfg.state.devices.length && cfg.state.devices[0].id === d.id;
const lockInfo = () => ({ on: lock.on, by: lock.by });
function lockScript() {
  const title = JSON.stringify(T('Screen locked')); const sub = JSON.stringify(T('Locked from {name}', { name: lock.by }));
  return `(() => {
    window.__pvLocked = ${lock.on};
    let o = document.getElementById('__pv_lock');
    if (${lock.on}) {
      if (!o) { o = document.createElement('div'); o.id = '__pv_lock';
        o.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(10,5,14,.93);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font:700 52px system-ui,sans-serif;text-align:center';
        document.documentElement.appendChild(o); }
      o.innerHTML = '<div style="font-size:150px;line-height:1.2">🔒</div><div></div><div style="font-size:28px;font-weight:400;opacity:.75;margin-top:18px"></div>';
      o.children[1].textContent = ${title}; o.children[2].textContent = ${sub};
      window.__pvPaused = window.__pvPaused || [];
      const pauseAll = () => document.querySelectorAll('video,audio').forEach((v) => { if (!v.paused) { v.pause(); if (!window.__pvPaused.includes(v)) window.__pvPaused.push(v); } });
      pauseAll(); clearInterval(window.__pvLockT); window.__pvLockT = setInterval(pauseAll, 400);
    } else {
      if (o) o.remove(); clearInterval(window.__pvLockT);
      (window.__pvPaused || []).forEach((v) => { try { v.play(); } catch (_) {} }); window.__pvPaused = [];
    }
  })()`;
}
async function applyLock() {
  player.lock(lock.on, T('Screen locked'));
  try { await cdp.eval(lockScript()); } catch {}
}
async function setLock(on, by) {
  lock.on = on; lock.by = by || lock.by;
  cfg.state.lock = { on: lock.on, by: lock.by }; cfg.saveState();
  log(on ? 'screen locked by' : 'screen unlocked by', by);
  await applyLock();
  broadcast({ t: 'lock', ...lockInfo() });
  return lockInfo();
}

// ---------- desktop mode (TV screen closed, desktop / console shown). Reconciled at start-up:
// if the kiosk isn't running while a desktop session is, we are in desktop mode.
const desktop = { on: false };
setTimeout(async () => {
  const kiosk = await sys.run('systemctl', ['is-active', 'pivista-kiosk.service']);
  const other = await sys.run('sh', ['-c', 'systemctl is-active lightdm gdm3 sddm getty@tty1 2>/dev/null || true']);
  desktop.on = kiosk !== 'active' && /(^|\n)active/.test(other || '');
  if (desktop.on) broadcast({ t: 'desktop', on: true });
}, 4000).unref();

// ---------- network changes: new Wi-Fi / new IP -> show the pairing screen again
let networkChanged = false;
async function checkNetwork() {
  const n = await sys.network();
  const key = (n.ssid || '') + '|' + n.ips.join(',');
  if (!n.ips.length) return;                              // offline for a moment: wait
  const prev = cfg.state.networkKey;
  if (prev === key) return;
  cfg.state.networkKey = key; cfg.saveState();
  if (!prev) return;                                      // first run: nothing to compare with
  networkChanged = true;
  log('network changed:', prev, '->', key);
  broadcast({ t: 'network-changed', network: n }, (c) => c.role === 'tv');
  if (currentApp || player.active) goHome('pair').catch(() => {});
}
setInterval(() => checkNetwork().catch(() => {}), 10000).unref();
checkNetwork().catch(() => {});

// ---------- sound: prefer HDMI (the TV's speakers) unless the user picked another output
async function applyAudio(tries = 12) {
  const outs = await sys.audioOutputs();
  if (!outs.length) { if (tries > 0) setTimeout(() => applyAudio(tries - 1), 10000); return; }
  const want = cfg.settings.audioOutput ? outs.find((o) => o.name === cfg.settings.audioOutput) : outs.find((o) => o.kind === 'hdmi');
  if (want && !want.default) { await sys.setAudioOutput(want.id); log('sound output ->', want.name); }
}
setTimeout(() => applyAudio().catch(() => {}), 5000);

// ---------- wiring ----------
cdp.on('navigate', (u) => {
  if (lock.on) setTimeout(() => applyLock(), 600);
  lastUrl = u;
  // a navigation can move the page to a new renderer process: restart the mirror stream
  if (mirror.running) { mirror.running = false; cdp.stopScreencast().then(() => mirrorTick()).catch(() => {}); }
  if (u.startsWith(TV_URL)) { currentApp = null; cdp.resetApp().catch(() => {}); }
  else if (currentApp && currentApp.browser && /^https?:/.test(u)) {
    cfg.state.browserHistory = [{ url: u }, ...cfg.state.browserHistory.filter((h) => h.url !== u)].slice(0, 30);
    cfg.saveState();
  }
  toRemotes({ t: 'kbd', focus: false });
  broadcast({ t: 'state', state: stateNow() });
});
// A text field got focus on the TV → phones pop up their keyboard sheet.
cdp.on('focus', (f) => toRemotes({ t: 'kbd', ...f }));
player.onChange = () => broadcast({ t: 'state', state: stateNow() });
thermal.start(notify);
cdp.on('connected', () => {
  if (lock.on) setTimeout(() => applyLock(), 1500);
  if (cfg.settings.uiResolution && cfg.settings.uiResolution !== '1920x1080') {
    sys.setResolution(cfg.settings.uiResolution === 'auto' ? 'auto' : cfg.settings.uiResolution + '@60Hz').catch(() => {});
  }
});
cdp.connect().catch(() => {});
setInterval(() => { if (!cdp.connected) cdp.connect().catch(() => {}); }, 3000).unref();

server.listen(PORT, () => log(`PiVista listening on :${PORT} (data: ${cfg.DATA_DIR})`));
process.on('unhandledRejection', (e) => log('unhandled', e && e.message));
