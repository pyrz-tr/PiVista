// PiVista server: serves the TV interface (shown by kiosk Chromium) and the phone
// remote (http://pivista.local), and bridges remote commands to the browser / player.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const cfg = require('./config');
const apps = require('./apps');
const cdp = require('./cdp');
const sys = require('./system');
const thermal = require('./thermal');
const pairing = require('./pairing');
const player = require('./player');

const PORT = Number(process.env.PIVISTA_PORT || 80);
const UI_ROOT = path.join(__dirname, '..', 'ui');
const TV_URL = `http://127.0.0.1:${PORT}/tv/`;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

let currentApp = null; // app object when a streaming app is in front, null for our TV UI
const log = (...a) => console.log(new Date().toISOString(), ...a);
const isLocal = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);

// ---------- HTTP ----------
function sendJSON(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); }

function readBody(req) {
  return new Promise((resolve) => {
    let b = ''; req.on('data', (c) => { b += c; if (b.length > 1e5) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch { resolve({}); } });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  if (p === '/api/pair/pattern.svg') {
    if (!isLocal(req)) return sendJSON(res, 403, { error: 'pattern is only shown on the TV' });
    res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' });
    return res.end(pairing.patternSvg(PORT));
  }
  if (p === '/api/pair' && req.method === 'POST') {
    const body = await readBody(req);
    const dev = pairing.pair(body.code, body.name);
    if (!dev) return sendJSON(res, 401, { error: 'Invalid or expired code' });
    log('paired', dev.name);
    broadcast({ t: 'paired', name: dev.name });
    return sendJSON(res, 200, { token: dev.token, name: cfg.settings.deviceName });
  }
  if (p === '/api/apps') return sendJSON(res, 200, apps);

  // static files: "/" -> phone remote, "/tv/" -> TV interface
  let file = p === '/' ? '/remote/index.html' : p.endsWith('/') ? p + 'index.html' : p;
  file = path.normalize(path.join(UI_ROOT, file));
  if (!file.startsWith(UI_ROOT)) return sendJSON(res, 403, {});
  fs.readFile(file, (err, data) => {
    if (err) return sendJSON(res, 404, { error: 'not found' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// ---------- WebSocket ----------
const wss = new WebSocketServer({ server, path: '/ws' });
const clients = new Set();

function broadcast(msg) { const s = JSON.stringify(msg); for (const c of clients) if (c.readyState === 1) c.send(s); }

// Toasts: our TV UI renders them itself; on streaming sites we inject a small overlay.
function notify(msg) {
  broadcast(msg);
  if (currentApp && msg.message) {
    const text = JSON.stringify(msg.message);
    cdp.eval(`(()=>{let t=document.getElementById('__pv_toast');if(!t){t=document.createElement('div');t.id='__pv_toast';
      t.style.cssText='position:fixed;top:40px;right:40px;z-index:2147483647;background:rgba(15,15,30,.92);color:#fff;font:600 24px system-ui;padding:18px 28px;border-radius:16px;box-shadow:0 10px 40px #0008;transition:opacity .4s';
      document.documentElement.appendChild(t);}t.textContent=${text};t.style.opacity=1;clearTimeout(t._h);t._h=setTimeout(()=>t.style.opacity=0,2500);})()`).catch(() => {});
  }
}

const cursor = { x: 960, y: 540, last: 0 };
async function moveCursor(dx, dy) {
  cursor.x = Math.max(0, Math.min(1919, cursor.x + dx));
  cursor.y = Math.max(0, Math.min(1079, cursor.y + dy));
  await cdp.mouse('mouseMoved', cursor.x, cursor.y);
  if (Date.now() - cursor.last > 30) {
    cursor.last = Date.now();
    cdp.eval(`(()=>{let c=document.getElementById('__pv_cur');if(!c){c=document.createElement('div');c.id='__pv_cur';
      c.style.cssText='position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:#fff;border:3px solid #7c3aed;z-index:2147483647;pointer-events:none;box-shadow:0 0 12px #0009';
      document.documentElement.appendChild(c);}c.style.transform='translate(${cursor.x}px,${cursor.y}px)';})()`).catch(() => {});
  }
}

async function goHome(screen = 'home') {
  player.stop();
  currentApp = null;
  await cdp.navigate(TV_URL + '#' + screen);
}

async function launch(id, url) {
  const app = apps.find((a) => a.id === id);
  if (id === 'url' && url) { currentApp = { id: 'browser', back: 'history' }; return cdp.navigate(url); }
  if (!app) return;
  if (app.type === 'system') return goHome(id);
  currentApp = app;
  log('launch', app.name);
  await cdp.navigate(app.url, app.userAgent);
}

async function back() {
  if (player.active) return player.key('back');
  if (!currentApp) return cdp.key('back'); // TV UI handles its own back stack
  if (currentApp.back === 'key') return cdp.key('back');
  if (!(await cdp.historyBack())) return goHome();
}

const handlers = {
  async key({ k }) {
    if (k === 'back') return back();
    if (k === 'home') return goHome();
    if (player.active) return player.key(k);
    return cdp.key(k);
  },
  text: ({ v }) => cdp.text(String(v || '')),
  mouse: ({ dx, dy }) => moveCursor(Number(dx) || 0, Number(dy) || 0),
  click: () => cdp.click(cursor.x, cursor.y),
  scroll: ({ dy }) => cdp.scroll(cursor.x, cursor.y, Number(dy) || 0),
  async volume({ v }) {
    await sys.volume(v);
    const vol = await sys.getVolume();
    if (vol) notify({ t: 'volume', ...vol, message: vol.muted ? 'Muted' : `Volume ${vol.level}%` });
  },
  launch: ({ id, url }) => launch(id, url),
  home: () => goHome(),
  apps: () => apps,
  info: () => sys.info(),
  settings: () => cfg.settings,
  async setSettings({ patch }) {
    const allowed = ['deviceName', 'autostart', 'allow4k', 'thermalLimitC', 'showSplash', 'screensaverMinutes'];
    for (const k of allowed) if (patch && k in patch) cfg.settings[k] = patch[k];
    cfg.saveSettings();
    if (patch && 'autostart' in patch) await sys.setAutostart(!!patch.autostart);
    broadcast({ t: 'settings', settings: cfg.settings });
    return cfg.settings;
  },
  pairInfo: () => ({ url: pairing.pairUrl(PORT), code: pairing.currentCode(), devices: pairing.devices() }),
  forget: ({ id }) => { pairing.forget(id); return pairing.devices(); },
  mediaList: ({ dir }) => player.list(dir),
  mediaPlay: ({ path: f }) => player.play(f),
  power: ({ v }) => (v === 'reboot' ? sys.reboot() : v === 'shutdown' ? sys.shutdown() : v === 'restart-ui' ? sys.restartUI() : null),
  state: () => ({ app: currentApp && currentApp.id, playing: player.active }),
};
// Commands only the TV itself (localhost) may issue.
const TV_ONLY = new Set(['pairInfo']);

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://x');
  const local = isLocal(req);
  const device = pairing.check(url.searchParams.get('token'));
  if (!local && !device) { ws.close(4001, 'not paired'); return; }
  ws.role = local && !device ? 'tv' : 'remote';
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
  ws.on('message', async (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    const h = handlers[msg.t];
    if (!h || (TV_ONLY.has(msg.t) && ws.role !== 'tv')) return;
    try {
      const data = await h(msg);
      if (msg.id) ws.send(JSON.stringify({ t: 'res', id: msg.id, data }));
    } catch (e) {
      if (msg.id) ws.send(JSON.stringify({ t: 'res', id: msg.id, error: e.message }));
      if (!/CDP|ECONNREFUSED|fetch failed/.test(e.message)) log('error', msg.t, e.message);
    }
  });
  ws.send(JSON.stringify({ t: 'hello', role: ws.role, settings: cfg.settings, state: handlers.state() }));
});

// ---------- wiring ----------
cdp.onNavigate = (u) => {
  if (u.startsWith(TV_URL)) currentApp = null;
  broadcast({ t: 'state', state: handlers.state() });
};
player.onChange = (now) => broadcast({ t: 'player', now, state: handlers.state() });
thermal.start(notify);

server.listen(PORT, () => log(`PiVista listening on :${PORT} (data: ${cfg.DATA_DIR})`));
process.on('unhandledRejection', (e) => log('unhandled', e && e.message));
