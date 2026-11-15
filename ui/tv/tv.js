/* PiVista TV interface: splash, spatial navigation, screens and system apps. */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

// ---------------------------------------------------------------- server link
const rpc = (() => {
  let ws, seq = 0; const pending = new Map(); const listeners = [];
  function open() {
    ws = new WebSocket(`ws://${location.host}/ws`);
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.t === 'res' && pending.has(m.id)) { pending.get(m.id)(m.error ? { error: m.error } : m.data); pending.delete(m.id); return; }
      listeners.forEach((fn) => fn(m));
    };
    ws.onopen = () => { const b = document.getElementById('offline'); if (b) b.classList.remove('on'); };
    ws.onclose = () => {
      // never leave the TV black: show a notice and keep retrying
      const b = document.getElementById('offline'); if (b) b.classList.add('on');
      setTimeout(open, 1500);
    };
  }
  open();
  return {
    // Waits up to `timeout` ms for the server, then resolves null so the UI still renders.
    call(t, args = {}, timeout = 8000, waited = 0) {
      return new Promise((res) => {
        if (!ws || ws.readyState !== 1) {
          if (waited >= Math.min(timeout, 4000)) return res(null);
          return setTimeout(() => res(rpc.call(t, args, timeout, waited + 300)), 300);
        }
        const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ t, id, ...args }));
        setTimeout(() => { if (pending.delete(id)) res(null); }, timeout);
      });
    },
    on(fn) { listeners.push(fn); },
  };
})();

let settings = {};
let apps = [];

// Fit the fixed 1920x1080 layout to whatever mode the monitor ended up in (720p TVs, 1366x768, 4K…)
(function fitScreen() {
  const apply = () => { document.body.style.zoom = Math.min(innerWidth / 1920, innerHeight / 1080); };
  addEventListener('resize', apply);
  if (document.body) apply(); else addEventListener('DOMContentLoaded', apply);
})();


// ---------------------------------------------------------------- splash
// Glowing dots fly in and assemble the raspberry logo + wordmark, then a light sweep.
async function splash() {
  const cv = $('#splash');
  if (sessionStorage.getItem('pv-splash') || location.hash.length > 1) { cv.remove(); return; }
  sessionStorage.setItem('pv-splash', '1');
  const W = cv.width = 1920, H = cv.height = 1080; const ctx = cv.getContext('2d');

  const off = document.createElement('canvas'); off.width = W; off.height = H;
  const o = off.getContext('2d');
  const logo = new Image(); logo.src = '/shared/logo.svg';
  try { await logo.decode(); } catch (_) {}
  o.font = '800 230px Inter, "DejaVu Sans", sans-serif'; o.textBaseline = 'middle';
  const tw = o.measureText('PiVista').width; const ls = 300; const total = ls + 30 + tw; const x0 = (W - total) / 2;
  if (logo.complete && logo.naturalWidth) o.drawImage(logo, x0, H / 2 - 175, ls, ls);
  const grad = o.createLinearGradient(x0 + ls, 0, x0 + total, 0);
  grad.addColorStop(0, '#ff4d8d'); grad.addColorStop(1, '#a855f7');
  o.fillStyle = grad; o.fillText('PiVista', x0 + ls + 30, H / 2 - 10);

  const img = o.getImageData(0, 0, W, H).data; const pts = []; const step = 8;
  for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) {
    const i = (y * W + x) * 4;
    if (img[i + 3] > 140) pts.push([x, y, img[i], img[i + 1], img[i + 2]]);
  }
  // one pre-rendered glow sprite per (quantised) colour: cheap to draw on the Pi GPU
  const sprites = new Map();
  const sprite = (r, g, b) => {
    const k = `${r >> 4},${g >> 4},${b >> 4}`;
    if (sprites.has(k)) return sprites.get(k);
    const sp = document.createElement('canvas'); sp.width = sp.height = 24; const s = sp.getContext('2d');
    const gr = s.createRadialGradient(12, 12, 0, 12, 12, 12);
    gr.addColorStop(0, '#fff'); gr.addColorStop(.3, `rgb(${r},${g},${b})`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
    s.fillStyle = gr; s.fillRect(0, 0, 24, 24); sprites.set(k, sp); return sp;
  };
  const P = pts.map(([tx, ty, r, g, b]) => {
    const a = Math.random() * Math.PI * 2, rad = 700 + Math.random() * 600;
    return { tx, ty, sx: W / 2 + Math.cos(a) * rad, sy: H / 2 + Math.sin(a) * rad, d: Math.random() * 0.35, sp: sprite(r, g, b) };
  });
  const ease = (t) => 1 - Math.pow(1 - t, 4);
  const T0 = performance.now(), DUR = 3600;
  await new Promise((done) => {
    function frame(now) {
      const t = (now - T0) / DUR;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(7,4,10,0.35)'; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      const sweep = (t - 0.62) * 2.6 * W;
      for (const p of P) {
        const k = ease(Math.min(1, Math.max(0, (t * 1.6 - p.d) / 0.9)));
        const x = p.sx + (p.tx - p.sx) * k, y = p.sy + (p.ty - p.sy) * k;
        const near = Math.max(0, 1 - Math.abs(x - sweep) / 120);
        ctx.globalAlpha = 0.35 + 0.65 * k;
        const size = 9 + near * 12;
        ctx.drawImage(p.sp, x - size / 2, y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
      if (t > 0.7) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = `rgba(240,210,230,${Math.min(1, (t - 0.7) * 4) * 0.75})`;
        ctx.font = '400 34px Inter, "DejaVu Sans", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('your screen, smarter', W / 2, H / 2 + 200);
        ctx.textAlign = 'start';
      }
      if (t < 1) requestAnimationFrame(frame);
      else { cv.classList.add('done'); setTimeout(() => { cv.remove(); done(); }, 800); }
    }
    requestAnimationFrame(frame);
  });
}

// ---------------------------------------------------------------- spatial navigation
function visibleFocusables() {
  const scr = $('.screen.active');
  return scr ? $$('.focusable', scr).filter((e) => e.offsetParent !== null) : [];
}
function focusFirst() { const e = visibleFocusables()[0]; if (e) e.focus({ preventScroll: true }); }
function moveFocus(dir) {
  const cur = document.activeElement; const all = visibleFocusables();
  if (!all.includes(cur)) return focusFirst();
  const a = cur.getBoundingClientRect(); const ac = { x: a.left + a.width / 2, y: a.top + a.height / 2 };
  let best = null, bestScore = Infinity;
  for (const e of all) {
    if (e === cur) continue;
    const b = e.getBoundingClientRect(); const bc = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    const dx = bc.x - ac.x, dy = bc.y - ac.y;
    const ok = { left: dx < -5, right: dx > 5, up: dy < -5, down: dy > 5 }[dir];
    if (!ok) continue;
    const horiz = dir === 'left' || dir === 'right';
    const score = (horiz ? Math.abs(dx) : Math.abs(dy)) + (horiz ? Math.abs(dy) : Math.abs(dx)) * 2.5;
    if (score < bestScore) { bestScore = score; best = e; }
  }
  if (best) { best.focus({ preventScroll: true }); best.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); }
}

// ---------------------------------------------------------------- screens
const stack = [];
const screens = {};
function show(id, push = true) {
  if (!$('#' + id)) id = 'home';
  const cur = $('.screen.active');
  if (cur && cur.id === id) return;
  if (cur && push) stack.push(cur.id);
  if (cur && screens[cur.id] && screens[cur.id].leave) screens[cur.id].leave();
  $$('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  history.replaceState(null, '', '#' + id);
  Promise.resolve(screens[id] && screens[id].enter ? screens[id].enter() : null).then(focusFirst);
}
function back() { show(stack.pop() || 'home', false); }
// the server opens screens by navigating to /tv/#<screen> (same document → hashchange)
window.addEventListener('hashchange', () => {
  scrollTo(0, 0); document.body.scrollTop = 0;
  const id = location.hash.slice(1) || 'home';
  if (id === 'home') { stack.length = 0; show('home', false); } else show(id);
});

const appName = (app) => (app.type === 'system' ? t(app.name) : app.name);
function tile(app, small) {
  const t = el('div', 'tile focusable' + (small ? ' small' : '')); t.tabIndex = 0;
  const c = app.color || '#333';
  t.style.background = `linear-gradient(145deg, ${c}, ${c}aa 60%, #0006)`;
  if (app.icon) { const i = el('img', 'icon'); i.src = app.icon; i.alt = ''; i.onerror = () => { i.replaceWith(el('div', 'letter', app.name[0])); }; t.append(i); }
  else t.append(el('div', 'letter', (app.letter || app.name[0] || '?')));
  t.append(el('div', 'name', appName(app)));
  t.onclick = () => openApp(app);
  return t;
}
function openApp(app) {
  if (app.type === 'system') return show(app.id);
  toast(t('Opening {name}…', { name: appName(app) }));
  rpc.call('launch', { id: app.id });
}
function item(label, val, onclick, cls) {
  const i = el('div', 'item focusable' + (cls ? ' ' + cls : '')); i.tabIndex = 0;
  const l = el('span'); if (typeof label === 'string') l.textContent = label; else l.append(...label);
  i.append(l, el('span', 'val', val || '')); i.onclick = onclick; return i;
}

async function loadApps() { apps = (await rpc.call('apps')) || apps; renderHome(); }
function renderHome() {
  const fill = (row, list, small) => { row.innerHTML = ''; list.forEach((a) => row.append(tile(a, small))); };
  fill($('#row-stream'), apps.filter((a) => a.type === 'web' && !a.custom));
  fill($('#row-custom'), [...apps.filter((a) => a.custom), apps.find((a) => a.id === 'addapp')].filter(Boolean), true);
  fill($('#row-system'), apps.filter((a) => a.type === 'system' && a.id !== 'addapp'), true);
}
screens.home = { enter() { if (!apps.length) return loadApps(); } };

// ---------- Media Player
screens.media = {
  dir: null, trail: [],
  async enter() {
    await this.load(this.dir, true);
    const rec = (await rpc.call('mediaRecent')) || [];
    const box = $('#media-recent'); box.innerHTML = '';
    if (!rec.length) box.append(el('div', 'item empty', t('Nothing played yet')));
    rec.forEach((r) => box.append(item('▶  ' + r.name, '', () => rpc.call('mediaPlay', { path: r.path }))));
  },
  async load(dir, keep) {
    if (!keep && dir !== this.dir && dir) this.trail.push(this.dir);
    this.dir = dir;
    $('#media-path').textContent = dir || t('Videos, music and USB drives · 4K files play in 4K');
    const items = (await rpc.call('mediaList', { dir })) || [];
    const list = $('#media-list'); list.innerHTML = '';
    if (dir) list.append(item('⬑  ' + t('Up'), '', () => this.load(this.trail.pop() || null, true).then(focusFirst)));
    if (!items.length) list.append(el('div', 'item empty', dir ? t('Empty folder') : t('No media yet: copy files to ~/Videos or plug in a USB drive')));
    const size = (b) => (b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b > 1e6 ? Math.round(b / 1e6) + ' MB' : '');
    for (const it of items) {
      list.append(item((it.dir ? '📁  ' : /\.(mp3|flac|m4a|aac|ogg|opus|wav)$/i.test(it.name) ? '🎵  ' : '🎬  ') + it.name, it.dir ? t('Folder') : size(it.size),
        () => (it.dir ? this.load(it.path).then(focusFirst) : rpc.call('mediaPlay', { path: it.path }))));
    }
  },
};
$('#media-url').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.value.trim()) { rpc.call('mediaPlay', { path: e.target.value.trim() }); e.target.value = ''; }
});

// ---------- Web Browser
screens.browser = {
  async enter() {
    const d = (await rpc.call('bookmarks')) || { bookmarks: [], history: [] };
    const row = $('#row-bookmarks'); row.innerHTML = '';
    d.bookmarks.forEach((b) => {
      let host = ''; try { host = new URL(b.url).hostname; } catch (_) {}
      const colors = ['#e0115f', '#7c3aed', '#0891b2', '#16a34a', '#ea580c', '#2563eb'];
      const t = tile({ name: b.name, color: colors[(host.length + b.name.length) % colors.length], letter: b.name[0] }, true);
      t.onclick = () => rpc.call('launch', { id: 'url', url: b.url });
      row.append(t);
    });
    const hist = $('#browser-history'); hist.innerHTML = '';
    if (!d.history.length) hist.append(el('div', 'item empty', t('No recent pages')));
    d.history.slice(0, 6).forEach((h) => hist.append(item(h.url.replace(/^https?:\/\//, ''), '', () => rpc.call('launch', { id: 'url', url: h.url }))));
  },
};
$('#url').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.value.trim()) { rpc.call('launch', { id: 'url', url: e.target.value.trim() }); e.target.value = ''; }
});

// ---------- Games (each game is a page under /games/, Back returns here)
const GAMES = [
  { id: 'rally', name: 'Raspberry Rally', desc: 'Kart racing on two tracks against three fruity rivals. Grab turbos, hit boost pads, win the cup.', best: 'rally-0-time-inv' },
  { id: 'snake', name: 'Berry Snake', desc: 'Eat the raspberries and grow. The snake speeds up as you go.', best: 'snake' },
  { id: 'bricks', name: 'Brick Blaster', desc: 'Bounce the ball and smash every brick. Levels get tougher.', best: 'bricks' },
  { id: 'merge', name: 'Berry Merge', desc: 'Slide the tiles and merge matching numbers. Reach 2048!', best: 'merge' },
];
screens.games = {
  enter() {
    const box = $('#game-list'); box.innerHTML = '';
    for (const g of GAMES) {
      const c = el('div', 'game-card focusable'); c.tabIndex = 0;
      const img = el('img'); img.src = `/games/covers/${g.id}.svg`; img.alt = '';
      const t = el('div'); t.append(el('h3', '', g.name), el('p', '', PVI18N.t(g.desc)));
      let best = 0; try { best = Number(localStorage.getItem('pv-best-' + g.best)) || 0; } catch (_) {}
      if (best) t.append(el('div', 'best', g.id === 'rally' ? PVI18N.t('🏆 Best time {t} s', { t: (1e6 / best).toFixed(1) }) : PVI18N.t('🏆 Best {n}', { n: best })));
      c.append(img, t);
      c.onclick = () => { location.href = `/games/${g.id}.html?lang=${PVI18N.lang}`; };
      box.append(c);
    }
  },
};

// ---------- Add App
let zoom = 1.25;
screens.addapp = {
  enter() {
    const list = $('#custom-list'); list.innerHTML = '';
    const mine = apps.filter((a) => a.custom);
    if (!mine.length) list.append(el('div', 'item empty', t('No apps installed yet')));
    mine.forEach((a) => list.append(item(a.name, t('Remove'), async () => {
      await rpc.call('removeApp', { id: a.id }); toast(t('{name} removed', { name: a.name })); await loadApps(); this.enter(); focusFirst();
    }, 'danger')));
  },
};
$$('#app-zoom .chip').forEach((c) => { c.onclick = () => { zoom = Number(c.dataset.z); $$('#app-zoom .chip').forEach((x) => x.classList.toggle('active', x === c)); }; });
async function installFromField() {
  const v = $('#app-url').value.trim(); if (!v) { $('#app-url').focus(); return; }
  $('#app-msg').textContent = t('Installing…');
  const r = await rpc.call('installUrl', { url: v, scale: zoom }, 20000);
  if (!r || r.error) { $('#app-msg').textContent = t('Could not install: {err}', { err: (r && r.error) || 'timeout' }); return; }
  $('#app-msg').textContent = t('Installed “{name}”. Find it on the home screen.', { name: r.name });
  $('#app-url').value = ''; await loadApps(); screens.addapp.enter();
}
$('#app-install').onclick = installFromField;
$('#app-url').addEventListener('keydown', (e) => { if (e.key === 'Enter') installFromField(); });

// ---------- System Info
screens.system = {
  timer: null,
  async enter() { await this.refresh(); this.timer = setInterval(() => this.refresh(), 5000); },
  leave() { clearInterval(this.timer); },
  async refresh() {
    const i = await rpc.call('info'); if (!i) return;
    const th = i.throttled;
    const rows = [
      ['Model', i.model], ['Hostname', i.hostname + '.local'], ['IP address', i.ip.join(', ') || '—'], ['PiVista', 'v' + i.version],
      ['Temperature', i.tempC != null ? i.tempC + ' °C' : '—'], ['CPU clock', i.cpuFreqMHz ? Math.round(i.cpuFreqMHz) + ' MHz' : '—'],
      ['Load', i.load.join('  ')], ['Memory free', `${i.memFreeMB} / ${i.memTotalMB} MB`],
      ['Power', th ? (t(th.underVoltage ? '⚠ Under-voltage' : th.underVoltageOccurred ? 'Under-voltage occurred' : 'OK')) : '—'],
      ['Throttling', th ? (t(th.throttled ? 'Active' : th.softTempLimit ? 'Soft temp limit' : 'None')) : '—'], ['Uptime', i.uptimeH + ' h'],
    ];
    const box = $('#stats'); box.innerHTML = '';
    rows.forEach(([k, v]) => { const s = el('div', 'stat'); s.append(el('div', 'k', t(k)), el('div', 'v', v)); box.append(s); });
  },
};

// ---------- Pairing
screens.pair = {
  timer: null,
  async enter() {
    const load = async () => {
      const p = await rpc.call('pairInfo'); if (!p) return;
      $('#pattern').src = '/api/pair/pattern.svg?' + Date.now();
      $('#pair-code').textContent = p.code;
      $('#pair-url').textContent = p.url.split('/#')[0].replace('http://', '');
      $('#direct').style.display = p.ipUrl ? '' : 'none';
      if (p.ipUrl) { $('#pattern-ip').src = '/api/pair/pattern.svg?via=ip&' + Date.now(); $('#pair-ip').textContent = p.ips[0]; }
      $('#pair-devices').textContent = p.devices.length ? t('Paired: {list}', { list: p.devices.map((d) => d.name).join(', ') }) : t('No remotes paired yet');
    };
    await load();
    this.timer = setInterval(load, 4 * 60 * 1000);
  },
  leave() { clearInterval(this.timer); },
};

// ---------- Settings
screens.settings = {
  async enter() {
    settings = (await rpc.call('settings')) || settings;
    const p = await rpc.call('pairInfo');
    const yes = (v) => t(v ? 'On' : 'Off');
    const cycle = (key, opts) => () => this.set({ [key]: opts[(opts.indexOf(settings[key]) + 1) % opts.length] });
    const withHint = (a, h) => { const s = el('span', '', t(a)); s.append(el('span', 'hint', t(h))); return [s]; };
    const rows = [
      ['Language', (PVI18N.languages.find((l) => l.id === (settings.language || 'en')) || {}).name, cycle('language', PVI18N.languages.map((l) => l.id))],
      ['Start PiVista on boot', yes(settings.autostart), () => this.set({ autostart: !settings.autostart })],
      [withHint('Block YouTube ads', 'Turn off if you have YouTube Premium or anything misbehaves'), yes(settings.youtubeAdblock), () => this.set({ youtubeAdblock: !settings.youtubeAdblock })],
      ['Allow 4K output for media player', yes(settings.allow4k), () => this.set({ allow4k: !settings.allow4k })],
      ['Opening animation', yes(settings.showSplash), () => this.set({ showSplash: !settings.showSplash })],
      ['Screensaver after', settings.screensaverMinutes ? t('{n} min', { n: settings.screensaverMinutes }) : t('Never'), cycle('screensaverMinutes', [5, 15, 30, 60, 0])],
      ['CPU slow-down temperature', settings.thermalLimitC + ' °C', cycle('thermalLimitC', [70, 75, 80])],
      ['Pair a new remote', '', () => show('pair')],
      ['Forget all paired remotes', t('{n} paired', { n: p ? p.devices.length : 0 }), async () => { await rpc.call('forget', {}); toast(t('All remotes removed')); this.enter(); }],
      ['Restart interface', '', () => rpc.call('power', { v: 'restart-ui' })],
      ['Reboot', '', () => rpc.call('power', { v: 'reboot' }), 'danger'],
      ['Shut down', '', () => rpc.call('power', { v: 'shutdown' }), 'danger'],
    ];
    const focusedIdx = $$('#settings-list .item').indexOf(document.activeElement);
    const list = $('#settings-list'); list.innerHTML = '';
    rows.forEach(([label, val, fn, cls], n) => {
      const i = item(typeof label === 'string' ? t(label) : label, val, fn, cls); list.append(i);
      if (n === focusedIdx) setTimeout(() => i.focus({ preventScroll: true }));
    });
  },
  async set(patch) { settings = await rpc.call('setSettings', { patch }); await this.enter(); },
};

// ---------------------------------------------------------------- toasts, clock, screensaver
function toast(msg) {
  const t = el('div', 'toast', msg);
  $('#toasts').append(t); setTimeout(() => t.remove(), 3000);
}
function tick() {
  const d = new Date();
  const hh = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  $('#clock').textContent = hh; $('#ss-clock').textContent = hh;
  const h = d.getHours();
  $('#greeting').textContent = t(h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening');
}
let idle = 0;
setInterval(() => {
  tick();
  idle += 1;
  const lim = (settings.screensaverMinutes || 0) * 60;
  if (lim && idle > lim && !$('#screensaver').classList.contains('on')) $('#screensaver').classList.add('on');
  if (idle % 20 === 0) { const c = $('#ss-clock'); c.style.left = Math.random() * 1300 + 'px'; c.style.top = Math.random() * 850 + 'px'; }
}, 1000);
['pointermove', 'click'].forEach((ev) => document.addEventListener(ev, () => { idle = 0; $('#screensaver').classList.remove('on'); }));

// ---------------------------------------------------------------- input
document.addEventListener('keydown', (e) => {
  idle = 0;
  if ($('#screensaver').classList.contains('on')) { $('#screensaver').classList.remove('on'); e.preventDefault(); return; }
  const inInput = document.activeElement && document.activeElement.tagName === 'INPUT';
  const dirs = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
  if (dirs[e.key] && !(inInput && (e.key === 'ArrowLeft' || e.key === 'ArrowRight'))) { e.preventDefault(); moveFocus(dirs[e.key]); }
  else if (e.key === 'Enter' && !inInput && document.activeElement) { e.preventDefault(); document.activeElement.click(); }
  else if (e.key === 'Escape' || (e.key === 'Backspace' && !inInput)) { e.preventDefault(); back(); }
});
document.addEventListener('click', (e) => { const a = e.target.closest('[data-action="back"]'); if (a) back(); });

let remoteCount = 0;
// Language follows Settings → Language (stored on the server, shared with phones and games)
function setLanguage(l) {
  if (!PVI18N.set(l || 'en')) return;
  tick(); setRemotes(remoteCount); renderHome();
  const cur = $('.screen.active');
  if (cur && screens[cur.id] && screens[cur.id].enter && cur.id !== 'home') Promise.resolve(screens[cur.id].enter()).then(() => {});
}
function setRemotes(n) {
  $('#remote-status').textContent = n ? t(n > 1 ? '{n} remotes' : '{n} remote', { n }) : t('No remote');
  remoteCount = n;
  $('#remote-status').className = 'pill' + (n ? ' ok' : '');
}
rpc.on((m) => {
  if (m.t === 'hello' || m.t === 'settings') { settings = m.settings; setLanguage(settings.language); }
  if (m.t === 'apps') { apps = m.apps; renderHome(); }
  if (m.t === 'paired') {
    toast(t('📱 {name} connected as remote', { name: m.name }));
    rpc.call('pairInfo').then((p) => p && setRemotes(p.devices.length));
    if ($('#pair.active')) back();
  }
  if (m.t === 'thermal') { if (m.message) toast(m.message); $('#temp').className = 'pill' + (m.level > 0 ? ' hot' : ''); }
  if ((m.t === 'volume' || m.t === 'info') && m.message) toast(m.message);
});
async function refreshStatus() {
  const i = await rpc.call('info');
  if (!i) return;
  if (i.tempC != null) $('#temp').textContent = i.tempC + '°C';
  // direct address, always visible: the fallback when pivista.local doesn't resolve
  $('#ip').textContent = i.ip.length ? i.ip[0] + (location.port && location.port !== '80' ? ':' + location.port : '') : '';
}
setInterval(refreshStatus, 30000);

// ---------------------------------------------------------------- boot
(async () => {
  tick();
  const s = await rpc.call('settings'); if (s) { settings = s; PVI18N.set(s.language || 'en'); }
  if (settings.showSplash !== false) await splash(); else $('#splash').remove();
  refreshStatus();
  const p = await rpc.call('pairInfo');
  if (p) setRemotes(p.devices.length);
  await loadApps();
  const start = location.hash.slice(1) || (p && !p.devices.length ? 'pair' : 'home');
  if (start !== 'home') stack.push('home');
  show(start, false);
})();
