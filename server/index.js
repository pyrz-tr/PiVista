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

const PORT = Number(process.env.PIVISTA_PORT || 80);
const UI_ROOT = path.join(__dirname, '..', 'ui');
const TV_URL = `http://127.0.0.1:${PORT}/tv/`;
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

async function mirrorPoint(fx, fy) {
  const m = mirror.meta || { deviceWidth: cdp.SCREEN.w / cdp.scale, deviceHeight: cdp.SCREEN.h / cdp.scale };
  const x = Math.max(0, Math.min(1, fx)) * m.deviceWidth; const y = Math.max(0, Math.min(1, fy)) * m.deviceHeight;
  cursor.x = x * cdp.scale; cursor.y = y * cdp.scale;
  return { x, y };
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
  currentApp = { id: 'browser', name: 'Web Browser', back: 'history', browser: true };
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
    if (vol) notify({ t: 'volume', ...vol, message: vol.muted ? 'Muted' : `Volume ${vol.level}%` });
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
    const allowed = ['deviceName', 'autostart', 'allow4k', 'thermalLimitC', 'showSplash', 'screensaverMinutes', 'youtubeAdblock'];
    for (const k of allowed) if (patch && k in patch) cfg.settings[k] = patch[k];
    cfg.saveSettings();
    if (patch && 'autostart' in patch) await sys.setAutostart(!!patch.autostart);
    broadcast({ t: 'settings', settings: cfg.settings });
    return cfg.settings;
  },
  pairInfo: () => ({ url: pairing.pairUrl(PORT), ipUrl: lanIPs()[0] ? pairing.pairUrl(PORT, lanIPs()[0]) : null,
    code: pairing.currentCode(), devices: pairing.devices(), ips: lanIPs().map((ip) => ip + portSuffix) }),
  forget: ({ id }) => { pairing.forget(id); return pairing.devices(); },
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
    cfg.saveState(); notify({ t: 'info', message: 'Bookmark added' });
    return cfg.state.bookmarks;
  },
  removeBookmark({ url }) { cfg.state.bookmarks = cfg.state.bookmarks.filter((b) => b.url !== url); cfg.saveState(); return cfg.state.bookmarks; },
  async browserNav({ v }) {
    if (v === 'back') return back();
    if (v === 'forward') return cdp.history(1);
    if (v === 'reload') return cdp.reload();
  },
  power: ({ v }) => (v === 'reboot' ? sys.reboot() : v === 'shutdown' ? sys.shutdown() : v === 'restart-ui' ? sys.restartUI() : null),
  state: () => stateNow(),
};
// Commands only the TV itself may issue.
const TV_ONLY = new Set(['pairInfo']);

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://x');
  const device = pairing.check(url.searchParams.get('token'));
  // The TV role needs a localhost connection *from the TV page's origin* — installed
  // apps run on http://localhost/... and therefore can't take over the TV role.
  const tv = isLocal(req) && req.headers.origin === TV_ORIGIN;
  if (!tv && !device) { ws.close(4001, 'not paired'); return; }
  ws.role = device ? 'remote' : 'tv';
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
  ws.on('message', async (raw, isBinary) => {
    if (isBinary) return;
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    const h = handlers[msg.t];
    if (!h || (TV_ONLY.has(msg.t) && ws.role !== 'tv')) return;
    try {
      const data = await h(msg, ws);
      if (msg.id) ws.send(JSON.stringify({ t: 'res', id: msg.id, data }));
    } catch (e) {
      if (msg.id) ws.send(JSON.stringify({ t: 'res', id: msg.id, error: e.message }));
      if (!/CDP|ECONNREFUSED|fetch failed/.test(e.message)) log('error', msg.t, e.message);
    }
  });
  ws.send(JSON.stringify({ t: 'hello', role: ws.role, settings: cfg.settings, state: stateNow() }));
});

// ---------- wiring ----------
cdp.on('navigate', (u) => {
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
cdp.connect().catch(() => {});
setInterval(() => { if (!cdp.connected) cdp.connect().catch(() => {}); }, 3000).unref();

server.listen(PORT, () => log(`PiVista listening on :${PORT} (data: ${cfg.DATA_DIR})`));
process.on('unhandledRejection', (e) => log('unhandled', e && e.message));
