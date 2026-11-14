/* PiVista TV interface: splash, spatial navigation, screens and system apps. */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// ---------------------------------------------------------------- server link
const rpc = (() => {
  let ws, seq = 0; const pending = new Map(); const listeners = [];
  function open() {
    ws = new WebSocket(`ws://${location.host}/ws`);
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.t === 'res' && pending.has(m.id)) { pending.get(m.id)(m.data); pending.delete(m.id); return; }
      listeners.forEach((fn) => fn(m));
    };
    ws.onclose = () => setTimeout(open, 1500);
  }
  open();
  return {
    call(t, args = {}) {
      return new Promise((res) => {
        if (!ws || ws.readyState !== 1) return setTimeout(() => res(rpc.call(t, args)), 300);
        const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ t, id, ...args }));
        setTimeout(() => { if (pending.delete(id)) res(null); }, 8000);
      });
    },
    on(fn) { listeners.push(fn); },
  };
})();

let settings = {};

// ---------------------------------------------------------------- splash
function splash() {
  const cv = $('#splash');
  if (sessionStorage.getItem('pv-splash') || location.hash.length > 1) { cv.remove(); return Promise.resolve(); }
  sessionStorage.setItem('pv-splash', '1');
  const W = cv.width = 1920, H = cv.height = 1080; const ctx = cv.getContext('2d');

  // sample the logo text into target points
  const off = document.createElement('canvas'); off.width = W; off.height = H;
  const o = off.getContext('2d');
  o.fillStyle = '#fff'; o.font = '800 260px Inter, "DejaVu Sans", sans-serif'; o.textAlign = 'center'; o.textBaseline = 'middle';
  o.fillText('PiVista', W / 2, H / 2 - 20);
  const img = o.getImageData(0, 0, W, H).data; const pts = []; const step = 9;
  for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) if (img[(y * W + x) * 4 + 3] > 128) pts.push([x, y]);

  // pre-rendered glowing dot sprites, tinted violet -> cyan across the logo (cheap on the Pi GPU)
  const TINTS = 12;
  const sprites = Array.from({ length: TINTS }, (_, i) => {
    const f = i / (TINTS - 1); const r = Math.round(139 + (34 - 139) * f), gg = Math.round(92 + (211 - 92) * f), bb = Math.round(246 + (238 - 246) * f);
    const sp = document.createElement('canvas'); sp.width = sp.height = 24; const s = sp.getContext('2d');
    const g = s.createRadialGradient(12, 12, 0, 12, 12, 12);
    g.addColorStop(0, '#fff'); g.addColorStop(.3, `rgb(${r},${gg},${bb})`); g.addColorStop(1, `rgba(${r},${gg},${bb},0)`);
    s.fillStyle = g; s.fillRect(0, 0, 24, 24); return sp;
  });
  const minX = Math.min(...pts.map((q) => q[0])), maxX = Math.max(...pts.map((q) => q[0]));

  const P = pts.map(([tx, ty], i) => {
    const a = Math.random() * Math.PI * 2, r = 700 + Math.random() * 600;
    return { tx, ty, sx: W / 2 + Math.cos(a) * r, sy: H / 2 + Math.sin(a) * r, d: Math.random() * 0.35,
      sp: sprites[Math.round(((tx - minX) / (maxX - minX || 1)) * (TINTS - 1))] };
  });
  const ease = (t) => 1 - Math.pow(1 - t, 4);
  const T0 = performance.now(), DUR = 3600;
  return new Promise((done) => {
    function frame(now) {
      const t = (now - T0) / DUR;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(4,4,11,0.35)'; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      const sweep = (t - 0.62) * 2.6 * W; // light sweep across the logo
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
        ctx.fillStyle = `rgba(200,200,255,${Math.min(1, (t - 0.7) * 4) * 0.8})`;
        ctx.font = '400 34px Inter, "DejaVu Sans", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('your screen, smarter', W / 2, H / 2 + 170);
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
  return scr ? $$('.focusable', scr).filter((el) => el.offsetParent !== null) : [];
}
function focusFirst() { const el = visibleFocusables()[0]; if (el) el.focus(); }
function moveFocus(dir) {
  const cur = document.activeElement; const all = visibleFocusables();
  if (!all.includes(cur)) return focusFirst();
  const a = cur.getBoundingClientRect(); const ac = { x: a.left + a.width / 2, y: a.top + a.height / 2 };
  let best = null, bestScore = Infinity;
  for (const el of all) {
    if (el === cur) continue;
    const b = el.getBoundingClientRect(); const bc = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    const dx = bc.x - ac.x, dy = bc.y - ac.y;
    const ok = { left: dx < -5, right: dx > 5, up: dy < -5, down: dy > 5 }[dir];
    if (!ok) continue;
    const main = dir === 'left' || dir === 'right' ? Math.abs(dx) : Math.abs(dy);
    const cross = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    const score = main + cross * 2.5;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (best) { best.focus(); best.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
}

// ---------------------------------------------------------------- screens
const stack = [];
const screens = {};
function show(id, push = true) {
  if (!$('#' + id)) id = 'home';
  const cur = $('.screen.active');
  if (cur && cur.id === id) return;
  if (cur && push) stack.push(cur.id);
  $$('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  history.replaceState(null, '', '#' + id);
  (screens[id] && screens[id].enter ? screens[id].enter() : Promise.resolve()).then(focusFirst);
  if (cur && screens[cur.id] && screens[cur.id].leave) screens[cur.id].leave();
}
function back() { show(stack.pop() || 'home', false); }

function tile(app, small) {
  const el = document.createElement('div');
  el.className = 'tile focusable' + (small ? ' small' : ''); el.tabIndex = 0;
  el.style.background = `linear-gradient(145deg, ${app.color}, ${app.color}99 60%, #0005)`;
  el.innerHTML = `<div class="icon"></div><div class="name"></div>`;
  $('.icon', el).textContent = app.icon; $('.name', el).textContent = app.name;
  el.onclick = () => (app.type === 'system' ? show(app.id) : (toast(`Opening ${app.name}…`), rpc.call('launch', { id: app.id })));
  return el;
}

screens.home = {
  async enter() {
    if ($('#row-stream').children.length) return;
    const apps = await rpc.call('apps') || [];
    apps.filter((a) => a.type === 'web').forEach((a) => $('#row-stream').append(tile(a)));
    apps.filter((a) => a.type === 'system').forEach((a) => $('#row-system').append(tile(a, true)));
  },
};

screens.media = {
  dir: null, trail: [],
  async enter() { await this.load(this.dir); },
  async load(dir, up) {
    if (!up && dir !== this.dir && dir) this.trail.push(this.dir);
    this.dir = dir;
    $('#media-path').textContent = dir || 'Videos and USB drives';
    const items = await rpc.call('mediaList', { dir }) || [];
    const list = $('#media-list'); list.innerHTML = '';
    if (dir) items.unshift({ name: '⬑  Up', dir: true, up: true });
    if (!items.length) list.innerHTML = '<div class="item">No media found. Copy videos to ~/Videos or plug in a USB drive.</div>';
    for (const it of items) {
      const el = document.createElement('div'); el.className = 'item focusable'; el.tabIndex = 0;
      el.innerHTML = `<span></span><span class="val">${it.dir ? 'Folder' : ''}</span>`;
      el.firstChild.textContent = (it.dir && !it.up ? '📁  ' : it.up ? '' : '🎬  ') + it.name;
      el.onclick = () => (it.up ? this.load(this.trail.pop() || null, true).then(focusFirst)
        : it.dir ? this.load(it.path).then(focusFirst) : rpc.call('mediaPlay', { path: it.path }));
      list.append(el);
    }
  },
};

screens.browser = {
  enter() {
    const sites = [
      ['Google', 'https://www.google.com', '#4285f4', 'G'], ['Wikipedia', 'https://www.wikipedia.org', '#555', 'W'],
      ['Twitch', 'https://www.twitch.tv', '#9146ff', 'T'], ['Spotify', 'https://open.spotify.com', '#1db954', 'S'],
    ];
    const row = $('#row-sites');
    if (!row.children.length) {
      for (const [name, url, color, icon] of sites) {
        const t = tile({ name, color, icon }, true);
        t.onclick = () => rpc.call('launch', { id: 'url', url }); row.append(t);
      }
    }
    return Promise.resolve();
  },
};
$('#url').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  let v = e.target.value.trim(); if (!v) return;
  if (!/^https?:\/\//.test(v)) v = /\.[a-z]{2,}(\/|$)/i.test(v) && !v.includes(' ') ? 'https://' + v : 'https://www.google.com/search?q=' + encodeURIComponent(v);
  rpc.call('launch', { id: 'url', url: v });
});

screens.system = {
  timer: null,
  async enter() { await this.refresh(); this.timer = setInterval(() => this.refresh(), 2000); },
  leave() { clearInterval(this.timer); },
  async refresh() {
    const i = await rpc.call('info'); if (!i) return;
    const th = i.throttled;
    const rows = [
      ['Model', i.model], ['Hostname', i.hostname + '.local'], ['IP address', i.ip.join(', ') || '—'], ['PiVista', 'v' + i.version],
      ['Temperature', i.tempC != null ? i.tempC + ' °C' : '—'], ['CPU clock', i.cpuFreqMHz ? Math.round(i.cpuFreqMHz) + ' MHz' : '—'],
      ['Load', i.load.join('  ')], ['Memory free', `${i.memFreeMB} / ${i.memTotalMB} MB`],
      ['Power', th ? (th.underVoltage ? '⚠ Under-voltage' : th.underVoltageOccurred ? 'Under-voltage occurred' : 'OK') : '—'],
      ['Throttling', th ? (th.throttled ? 'Active' : th.softTempLimit ? 'Soft temp limit' : 'None') : '—'], ['Uptime', i.uptimeH + ' h'],
    ];
    $('#stats').innerHTML = rows.map(([k]) => `<div class="stat"><div class="k">${k}</div><div class="v"></div></div>`).join('');
    $$('#stats .v').forEach((el, n) => { el.textContent = rows[n][1]; });
  },
};

screens.pair = {
  timer: null,
  async enter() {
    const load = async () => {
      const p = await rpc.call('pairInfo'); if (!p) return;
      $('#pattern').src = '/api/pair/pattern.svg?' + Date.now();
      $('#pair-code').textContent = p.code;
      $('#pair-url').textContent = p.url.split('/#')[0].replace('http://', '');
      const info = await rpc.call('info');
      $('#pair-ip').textContent = info && info.ip.length ? `If .local doesn't open, use http://${info.ip[0]}${location.port && location.port !== '80' ? ':' + location.port : ''}` : '';
      $('#pair-devices').textContent = p.devices.length ? `Paired: ${p.devices.map((d) => d.name).join(', ')}` : 'No remotes paired yet';
    };
    await load();
    this.timer = setInterval(load, 4 * 60 * 1000);
  },
  leave() { clearInterval(this.timer); },
};

screens.settings = {
  async enter() {
    settings = await rpc.call('settings') || settings;
    const p = await rpc.call('pairInfo');
    const yes = (v) => (v ? 'On' : 'Off');
    const cycle = (key, opts) => () => this.set({ [key]: opts[(opts.indexOf(settings[key]) + 1) % opts.length] });
    const rows = [
      ['Start PiVista on boot', yes(settings.autostart), () => this.set({ autostart: !settings.autostart })],
      ['Allow 4K output for video player', yes(settings.allow4k), () => this.set({ allow4k: !settings.allow4k })],
      ['Opening animation', yes(settings.showSplash), () => this.set({ showSplash: !settings.showSplash })],
      ['Screensaver after', settings.screensaverMinutes ? settings.screensaverMinutes + ' min' : 'Never', cycle('screensaverMinutes', [5, 15, 30, 60, 0])],
      ['CPU slow-down temperature', settings.thermalLimitC + ' °C', cycle('thermalLimitC', [70, 75, 80])],
      ['Pair a new remote', '', () => show('pair')],
      ['Forget all paired remotes', `${p ? p.devices.length : 0} paired`, async () => { await rpc.call('forget', {}); toast('All remotes removed'); this.enter(); }],
      ['Restart interface', '', () => rpc.call('power', { v: 'restart-ui' })],
      ['Reboot', '', () => rpc.call('power', { v: 'reboot' }), 'danger'],
      ['Shut down', '', () => rpc.call('power', { v: 'shutdown' }), 'danger'],
    ];
    const focusedIdx = $$('#settings-list .item').indexOf(document.activeElement);
    const list = $('#settings-list'); list.innerHTML = '';
    rows.forEach(([label, val, fn, cls], n) => {
      const el = document.createElement('div'); el.className = 'item focusable ' + (cls || ''); el.tabIndex = 0;
      el.innerHTML = '<span></span><span class="val"></span>';
      el.children[0].textContent = label; el.children[1].textContent = val; el.onclick = fn; list.append(el);
      if (n === focusedIdx) setTimeout(() => el.focus());
    });
  },
  async set(patch) { settings = await rpc.call('setSettings', { patch }); await this.enter(); },
};

// ---------------------------------------------------------------- toasts, clock, screensaver
function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  $('#toasts').append(t); setTimeout(() => t.remove(), 3000);
}
function tick() {
  const d = new Date();
  const hh = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  $('#clock').textContent = hh; $('#ss-clock').textContent = hh;
  const h = d.getHours();
  $('#greeting').textContent = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
let idle = 0;
setInterval(() => {
  tick();
  idle += 1;
  const lim = (settings.screensaverMinutes || 0) * 60;
  if (lim && idle > lim && !$('#screensaver').classList.contains('on')) $('#screensaver').classList.add('on');
  if (idle % 20 === 0) { const c = $('#ss-clock'); c.style.left = Math.random() * 1300 + 'px'; c.style.top = Math.random() * 850 + 'px'; }
}, 1000);

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

rpc.on((m) => {
  if (m.t === 'hello') settings = m.settings;
  if (m.t === 'settings') settings = m.settings;
  if (m.t === 'paired') { toast(`📱 ${m.name} connected as remote`); $('#remote-status').textContent = 'Remote paired'; $('#remote-status').className = 'pill ok'; if ($('#pair.active')) back(); }
  if (m.t === 'thermal') {
    if (m.message) toast(m.message);
    $('#temp').className = 'pill' + (m.level > 0 ? ' hot' : '');
  }
  if (m.t === 'volume' && m.message) toast(m.message);
});
setInterval(async () => { const i = await rpc.call('info'); if (i && i.tempC != null) $('#temp').textContent = i.tempC + '°C'; }, 10000);

// ---------------------------------------------------------------- boot
(async () => {
  tick();
  const s = await rpc.call('settings'); if (s) settings = s;
  if (settings.showSplash !== false) await splash(); else $('#splash').remove();
  const p = await rpc.call('pairInfo');
  if (p && p.devices.length) { $('#remote-status').textContent = `${p.devices.length} remote${p.devices.length > 1 ? 's' : ''}`; $('#remote-status').className = 'pill ok'; }
  const start = location.hash.slice(1) || (p && !p.devices.length ? 'pair' : 'home');
  if (start !== 'home') { $$('.screen').forEach((x) => x.classList.remove('active')); stack.push('home'); }
  show(start, false);
  screens.home.enter();
})();
