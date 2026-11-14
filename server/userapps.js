// User-installed apps:
//  - website / PWA by URL  (reads the web app manifest for name, icon, colour, start URL)
//  - single .html file
//  - .zip web app bundle   (index.html at the root or in one top folder; optional manifest.json)
// Local apps are served from http://localhost/userapps/<id>/ — a different origin from the
// TV UI (127.0.0.1), so an installed app can't impersonate the TV.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const cfg = require('./config');

const ROOT = path.join(cfg.DATA_DIR, 'apps');
fs.mkdirSync(ROOT, { recursive: true });
if (!cfg.state.customApps) cfg.state.customApps = [];
const COLORS = ['#e0115f', '#7c3aed', '#0891b2', '#16a34a', '#ea580c', '#2563eb', '#db2777'];

const newId = () => 'u' + crypto.randomBytes(4).toString('hex');
const UA = { 'User-Agent': 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' };

async function fetchText(url) {
  const r = await fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return { text: await r.text(), url: r.url };
}

function pickIcon(icons = []) {
  const size = (i) => Math.max(...String(i.sizes || '0x0').split(/\s+/).map((s) => parseInt(s, 10) || (s === 'any' ? 999 : 0)));
  return [...icons].filter((i) => i && i.src && !/monochrome/.test(i.purpose || '')).sort((a, b) => size(b) - size(a))[0];
}

async function saveIcon(dir, iconUrl) {
  try {
    const r = await fetch(iconUrl, { headers: UA, signal: AbortSignal.timeout(10000) });
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !/image/.test(type)) return false;
    fs.writeFileSync(path.join(dir, '__icon'), Buffer.from(await r.arrayBuffer()));
    fs.writeFileSync(path.join(dir, '__icon.type'), type.split(';')[0]);
    return true;
  } catch { return false; }
}

function record(app) {
  cfg.state.customApps.push(app); cfg.saveState(); return app;
}

async function installUrl(rawUrl, opts = {}) {
  let url = String(rawUrl || '').trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  const id = newId(); const dir = path.join(ROOT, id); fs.mkdirSync(dir, { recursive: true });
  let name = new URL(url).hostname.replace(/^www\./, ''); let start = url; let color = null; let icon = false;
  try {
    const page = await fetchText(url);
    const title = page.text.match(/<title[^>]*>([^<]{1,60})/i);
    if (title) name = title[1].trim();
    const link = page.text.match(/<link[^>]+rel=["']?manifest["']?[^>]*>/i);
    const href = link && link[0].match(/href=["']?([^"' >]+)/i);
    if (href) {
      const mUrl = new URL(href[1], page.url).href;
      const m = JSON.parse((await fetchText(mUrl)).text);
      name = m.short_name || m.name || name;
      if (m.start_url) start = new URL(m.start_url, mUrl).href;
      color = m.theme_color || m.background_color || null;
      const ic = pickIcon(m.icons);
      if (ic) icon = await saveIcon(dir, new URL(ic.src, mUrl).href);
    }
    if (!icon) {
      const touch = page.text.match(/<link[^>]+rel=["'](?:apple-touch-icon|icon)["'][^>]*>/i);
      const th = touch && touch[0].match(/href=["']?([^"' >]+)/i);
      icon = await saveIcon(dir, th ? new URL(th[1], page.url).href : new URL('/apple-touch-icon.png', page.url).href);
    }
  } catch (e) { /* site unreachable or no manifest — still install as a plain bookmark app */ }
  return record({ id, name: opts.name || name, kind: 'url', url: start, icon, color: color || COLORS[id.charCodeAt(2) % COLORS.length],
    scale: Number(opts.scale) || 1.25, created: new Date().toISOString() });
}

function unzip(file, dir) {
  return new Promise((res, rej) => execFile('unzip', ['-q', '-o', file, '-d', dir], { timeout: 60000 }, (e) => (e ? rej(new Error('Could not unzip (is "unzip" installed?)')) : res())));
}

async function installFile(filename, buf, opts = {}) {
  const id = newId(); const dir = path.join(ROOT, id); fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(filename || '').toLowerCase();
  let entry = 'index.html'; let name = path.basename(filename || 'App', ext); let icon = false; let color = null;
  try {
    if (ext === '.html' || ext === '.htm') {
      fs.writeFileSync(path.join(dir, 'index.html'), buf);
      const t = buf.toString('utf8').match(/<title[^>]*>([^<]{1,60})/i); if (t) name = t[1].trim();
    } else if (ext === '.zip') {
      const tmp = path.join(dir, '__upload.zip'); fs.writeFileSync(tmp, buf);
      await unzip(tmp, dir); fs.unlinkSync(tmp);
      // allow a single wrapping folder
      if (!fs.existsSync(path.join(dir, 'index.html'))) {
        const sub = fs.readdirSync(dir).filter((f) => fs.statSync(path.join(dir, f)).isDirectory() && fs.existsSync(path.join(dir, f, 'index.html')));
        if (!sub.length) throw new Error('No index.html found in the zip');
        entry = sub[0] + '/index.html';
      }
      const base = path.dirname(path.join(dir, entry));
      const mf = ['manifest.json', 'manifest.webmanifest', 'app.webmanifest'].map((f) => path.join(base, f)).find((f) => fs.existsSync(f));
      if (mf) {
        const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
        name = m.short_name || m.name || name; color = m.theme_color || null;
        if (m.start_url && !/^https?:/.test(m.start_url)) entry = path.relative(dir, path.join(base, m.start_url.split('?')[0])) || entry;
        const ic = pickIcon(m.icons);
        const icPath = ic && path.join(base, ic.src);
        if (icPath && icPath.startsWith(dir) && fs.existsSync(icPath)) {
          fs.copyFileSync(icPath, path.join(dir, '__icon'));
          fs.writeFileSync(path.join(dir, '__icon.type'), ic.type || (icPath.endsWith('.svg') ? 'image/svg+xml' : 'image/png'));
          icon = true;
        }
      }
    } else {
      throw new Error('Unsupported file. Use .html or .zip (or install a website/PWA by URL).');
    }
  } catch (e) { fs.rmSync(dir, { recursive: true, force: true }); throw e; }
  return record({ id, name: opts.name || name, kind: 'local', entry, icon, color: color || COLORS[id.charCodeAt(2) % COLORS.length],
    scale: Number(opts.scale) || 1, created: new Date().toISOString() });
}

function remove(id) {
  cfg.state.customApps = cfg.state.customApps.filter((a) => a.id !== id);
  cfg.saveState();
  if (/^u[0-9a-f]{8}$/.test(id)) fs.rmSync(path.join(ROOT, id), { recursive: true, force: true });
}

// Shape used by the launcher.
function asApps(port) {
  const host = `http://localhost${port === 80 ? '' : ':' + port}`;
  return cfg.state.customApps.map((a) => ({
    id: a.id, name: a.name, type: 'web', custom: true, kind: a.kind, scale: a.scale, back: 'history', color: a.color,
    url: a.kind === 'url' ? a.url : `${host}/userapps/${a.id}/${a.entry}`,
    icon: a.icon ? `/userapps/${a.id}/__icon` : null, letter: a.name.slice(0, 1).toUpperCase(),
  }));
}

// Static file for /userapps/<id>/<path>
function resolveFile(id, rel) {
  if (!/^u[0-9a-f]{8}$/.test(id)) return null;
  const base = path.join(ROOT, id);
  const f = path.normalize(path.join(base, rel || 'index.html'));
  if (!f.startsWith(base + path.sep)) return null;
  let type = null;
  if (rel === '__icon') { try { type = fs.readFileSync(f + '.type', 'utf8'); } catch {} }
  return { file: f, type };
}

module.exports = { installUrl, installFile, remove, asApps, resolveFile };
