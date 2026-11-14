// Pairing: the TV shows a dot-pattern (a stylised QR code) encoding
// http://<host>.local/#pair=<code>. Scanning it with the phone camera opens the remote,
// which exchanges the one-time code for a long-lived device token.
const crypto = require('crypto');
const os = require('os');
const QRCode = require('qrcode');
const cfg = require('./config');

let code = null; let codeExpires = 0;
const CODE_TTL = 5 * 60 * 1000;

function currentCode() {
  if (!code || Date.now() > codeExpires) {
    code = String(crypto.randomInt(100000, 1000000));
    codeExpires = Date.now() + CODE_TTL;
  }
  return code;
}

// ip given -> direct-IP link (for phones/networks where .local / mDNS doesn't resolve)
function pairUrl(port, ip) {
  const host = `${ip || os.hostname() + '.local'}${port && port !== 80 ? ':' + port : ''}`;
  return `http://${host}/#pair=${currentCode()}`;
}

function pair(submitted, name) {
  if (!submitted || String(submitted) !== currentCode()) return null;
  code = null; // one-time use, a fresh pattern is shown next time
  const device = { id: crypto.randomUUID(), name: String(name || 'Phone').slice(0, 40),
    token: crypto.randomBytes(24).toString('hex'), created: new Date().toISOString() };
  cfg.state.devices.push(device);
  cfg.saveState();
  return device;
}

function check(token) { return !!token && cfg.state.devices.find((d) => d.token === token); }

function forget(id) {
  cfg.state.devices = id ? cfg.state.devices.filter((d) => d.id !== id) : [];
  cfg.saveState();
}

// Render the QR matrix as the PiVista "dot pattern": round dots + rounded finder eyes.
function patternSvg(port, ip) {
  const qr = QRCode.create(pairUrl(port, ip), { errorCorrectionLevel: 'Q' });
  const n = qr.modules.size; const q = 2; const size = n + q * 2;
  const isFinder = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  let dots = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.modules.get(r, c) || isFinder(r, c)) continue;
      dots += `<circle cx="${c + q + 0.5}" cy="${r + q + 0.5}" r="0.43"/>`;
    }
  }
  const eye = (r, c) => `<rect x="${c + q + 0.5}" y="${r + q + 0.5}" width="6" height="6" rx="1.8" fill="none" stroke="url(#g)" stroke-width="1"/>`
    + `<rect x="${c + q + 2}" y="${r + q + 2}" width="3" height="3" rx="0.9" fill="url(#g)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="geometricPrecision">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7a0a3f"/><stop offset="1" stop-color="#3b0764"/></linearGradient></defs>
<rect width="${size}" height="${size}" rx="3" fill="#fff"/>
<g fill="url(#g)">${dots}</g>${eye(0, 0)}${eye(0, n - 7)}${eye(n - 7, 0)}</svg>`;
}

module.exports = { currentCode, pairUrl, pair, check, forget, patternSvg,
  devices: () => cfg.state.devices.map(({ token, ...d }) => d) };
