/* PiVista phone remote. */
'use strict';
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
  del(k) { try { localStorage.removeItem(k); } catch (_) {} },
};

let token = store.get('pv-token');
let ws = null; let seq = 0; let fails = 0; let tab = 'pad';
const pending = new Map();

const buzz = (ms = 12) => navigator.vibrate && navigator.vibrate(ms);
function send(msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function call(t, args = {}, timeout = 20000) {
  return new Promise((res) => {
    if (!ws || ws.readyState !== 1) return res({ error: 'Not connected' });
    const id = ++seq; pending.set(id, res); send({ t, id, ...args });
    setTimeout(() => { if (pending.delete(id)) res({ error: 'Timed out' }); }, timeout);
  });
}
function forgetToken() { store.del('pv-token'); token = null; }

// ---------- pairing ----------
async function pair(code) {
  $('#pair-err').textContent = '';
  const ua = navigator.userAgent;
  const name = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android phone' : 'Browser';
  try {
    const r = await fetch('/api/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, name }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Pairing failed');
    token = j.token; store.set('pv-token', token);
    history.replaceState(null, '', '/');
    start();
  } catch (e) { showPair(e.message + ' — check the code on your TV.'); }
}
$('#pair-btn').onclick = () => pair($('#code').value.trim());
$('#code').addEventListener('input', (e) => { if (e.target.value.length === 6) pair(e.target.value); });

function showPair(msg) {
  $('#remote-view').classList.add('hidden'); $('#pair-view').classList.remove('hidden');
  if (msg) $('#pair-err').textContent = msg;
}

// ---------- connection (+ direct-IP fallback when .local / mDNS fails) ----------
function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?token=${token}`);
  ws.binaryType = 'blob';
  ws.onopen = () => {
    fails = 0;
    $('#conn').textContent = 'connected'; $('#conn').className = 'conn on';
    $('#ip-banner').classList.add('hidden');
    if (tab === 'screen') send({ t: 'mirror', on: true });
    fetch('/api/hello').then((r) => r.json()).then((h) => store.set('pv-ips', JSON.stringify(h.ips || []))).catch(() => {});
    loadApps();
  };
  ws.onmessage = (e) => {
    if (typeof e.data !== 'string') return showFrame(e.data);
    const m = JSON.parse(e.data);
    if (m.t === 'res' && pending.has(m.id)) { pending.get(m.id)(m.error ? { error: m.error } : (m.data ?? {})); pending.delete(m.id); return; }
    if (m.t === 'hello' || m.t === 'state') setState(m.state);
    if (m.t === 'apps') renderApps(m.apps);
    if (m.t === 'kbd') onTvField(m);
    if (m.t === 'mirror') mirrorPaused(m.paused);
  };
  ws.onclose = (e) => {
    $('#conn').textContent = 'reconnecting…'; $('#conn').className = 'conn';
    if (e.code === 4001) { forgetToken(); showPair('This phone is no longer paired. Scan the pattern again.'); return; }
    fails += 1;
    maybeOfferIp();
    setTimeout(connect, Math.min(5000, 1000 + fails * 500));
  };
}
function maybeOfferIp() {
  let ips = []; try { ips = JSON.parse(store.get('pv-ips') || '[]'); } catch (_) {}
  if (fails >= 3 && /\.local$/i.test(location.hostname) && ips.length) {
    $('#ip-banner-host').textContent = location.hostname;
    $('#ip-banner').classList.remove('hidden');
    // the token is handed over in the URL fragment (never sent to the server in a request line)
    $('#ip-switch').onclick = () => { location.href = `http://${ips[0]}/#token=${token}`; };
  }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && token && (!ws || ws.readyState > 1)) connect(); });

async function start() {
  $('#pair-view').classList.add('hidden'); $('#remote-view').classList.remove('hidden');
  connect();
}

// ---------- apps ----------
async function loadApps() { renderApps(await (await fetch('/api/apps')).json()); }
function renderApps(apps) {
  const box = $('#apps'); box.innerHTML = '';
  for (const a of apps.filter((x) => x.id !== 'addapp')) {
    const b = document.createElement('button'); b.className = 'app';
    b.style.background = `linear-gradient(135deg, ${a.color}, ${a.color}99)`;
    if (a.icon) { const i = document.createElement('img'); i.src = a.icon; i.alt = ''; b.append(i); }
    else { const l = document.createElement('div'); l.className = 'letter'; l.textContent = a.letter || a.name[0]; b.append(l); }
    const s = document.createElement('span'); s.textContent = a.name; b.append(s);
    b.onclick = () => { buzz(); send({ t: 'launch', id: a.id }); };
    box.append(b);
  }
  const add = document.createElement('button'); add.className = 'app add';
  add.innerHTML = '<div class="letter">+</div><span>Add app</span>';
  add.onclick = () => openAddApp(apps);
  box.append(add);
  renderCustomList(apps);
}

// ---------- context bars (media player / browser) ----------
const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
let seeking = false;
function setState(s) {
  if (!s) return;
  gameMode = !!s.game;
  $('#game-pill').classList.toggle('hidden', !gameMode);
  $('#ctx-media').classList.toggle('hidden', !s.playing);
  $('#ctx-browser').classList.toggle('hidden', !s.browser || s.playing);
  if (s.playing && s.now) {
    $('#np-title').textContent = s.now.title;
    $('#np-pp').textContent = s.now.paused ? '▶' : '⏸';
    $('#np-pos').textContent = fmt(s.now.pos); $('#np-dur').textContent = fmt(s.now.duration);
    if (!seeking) { $('#np-seek').max = Math.max(1, Math.floor(s.now.duration)); $('#np-seek').value = Math.floor(s.now.pos); }
  }
}
$$('[data-mk]').forEach((b) => { b.onclick = () => { buzz(); send({ t: 'mediaKey', k: b.dataset.mk }); }; });
$('#np-seek').addEventListener('input', () => { seeking = true; $('#np-pos').textContent = fmt($('#np-seek').value); });
$('#np-seek').addEventListener('change', () => { send({ t: 'mediaSeek', s: Number($('#np-seek').value) }); seeking = false; });
$$('[data-bn]').forEach((b) => { b.onclick = () => { buzz(); send({ t: 'browserNav', v: b.dataset.bn }); }; });
$('#br-url').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.value.trim()) { send({ t: 'launch', id: 'url', url: e.target.value.trim() }); e.target.value = ''; e.target.blur(); }
});
$('#br-star').onclick = async () => { buzz(); await call('addBookmark'); $('#br-star').textContent = '★'; setTimeout(() => { $('#br-star').textContent = '☆'; }, 1500); };

// ---------- buttons ----------
// Normal mode: tap = key press, hold an arrow = auto-repeat.
// Game mode (a PiVista game is on screen): press = key down, release = key up,
// so holding a direction on the phone keeps steering in Raspberry Rally.
let gameMode = false;
const HOLDABLE = ['up', 'down', 'left', 'right', 'ok'];
$$('[data-key]').forEach((b) => {
  let timer = null, rep = null, down = null;
  const k = b.dataset.key;
  const fire = () => { buzz(); send({ t: 'key', k }); };
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { b.setPointerCapture(e.pointerId); } catch (_) {}
    if (gameMode && HOLDABLE.includes(k)) { buzz(8); down = k; send({ t: 'keydown', k }); return; }
    fire();
    if (['up', 'down', 'left', 'right'].includes(k)) timer = setTimeout(() => { rep = setInterval(fire, 110); }, 450);
  });
  const end = () => { clearTimeout(timer); clearInterval(rep); if (down) { send({ t: 'keyup', k: down }); down = null; } };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => b.addEventListener(ev, end));
});
$$('[data-vol]').forEach((b) => b.addEventListener('click', () => { buzz(); send({ t: 'volume', v: b.dataset.vol }); }));

// ---------- keyboard sheet ----------
// Opens automatically when a text field gets focus on the TV, or with the ⌨ button.
// The phone field mirrors the TV field: every change replaces the TV field's text.
const kbdInput = $('#kbd-input');
let kbdAuto = false; let kbdTimer = null;
function openKbd(label, value, auto) {
  kbdAuto = auto;
  $('#kbd-label').textContent = label ? `TV: ${label}` : 'Type on TV';
  kbdInput.value = value || '';
  $('#kbd').classList.remove('hidden');
  kbdInput.focus(); // opens the phone keyboard where the browser allows it
  if (auto) buzz(30);
}
function closeKbd() { $('#kbd').classList.add('hidden'); kbdInput.blur(); }
function onTvField(m) {
  if (m.focus) openKbd(m.label, m.value, true);
  else if (kbdAuto) closeKbd();
}
function pushText() { clearTimeout(kbdTimer); kbdTimer = setTimeout(() => send({ t: 'setText', v: kbdInput.value }), 90); }
kbdInput.addEventListener('input', pushText);
kbdInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); send({ t: 'key', k: 'ok' }); } });
$('#kbd-btn').onclick = () => openKbd('', '', false);
$('#kbd-close').onclick = closeKbd;
$('#kbd').addEventListener('click', (e) => { if (e.target.id === 'kbd') closeKbd(); });
$('#kbd-bksp').onclick = () => { kbdInput.value = kbdInput.value.slice(0, -1); pushText(); };
$('#kbd-clear').onclick = () => { kbdInput.value = ''; pushText(); kbdInput.focus(); };
$('#kbd-tab').onclick = () => { send({ t: 'key', k: 'tab' }); kbdInput.value = ''; };
$('#kbd-go').onclick = () => { send({ t: 'key', k: 'ok' }); };

// ---------- tabs ----------
$$('.tabs button').forEach((b) => { b.onclick = () => {
  const prev = tab; tab = b.dataset.tab;
  $$('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
  $$('.tab').forEach((t) => t.classList.toggle('hidden', t.id !== 'tab-' + tab));
  if (tab === 'screen' && prev !== 'screen') { $('#mirror-msg').textContent = 'Loading TV screen…'; send({ t: 'mirror', on: true }); }
  if (prev === 'screen' && tab !== 'screen') send({ t: 'mirror', on: false });
}; });

// ---------- screen mirror ----------
let frameUrl = null;
function showFrame(blob) {
  const url = URL.createObjectURL(blob);
  const img = $('#mirror-img');
  img.onload = () => { if (frameUrl && frameUrl !== url) URL.revokeObjectURL(frameUrl); frameUrl = url; };
  img.src = url;
  $('#mirror-msg').textContent = '';
}
function mirrorPaused(reason) {
  const msgs = {
    video: '▶ A video is playing on the TV.\nMirroring pauses during video to keep the Pi fast and cool. Use the Remote tab to control playback.',
    player: '🎬 The media player is in front.\nUse the controls above.',
    offline: 'The TV browser isn\'t running yet…',
  };
  $('#mirror-msg').textContent = reason ? msgs[reason] || '' : '';
  $('#mirror-msg').style.whiteSpace = 'pre-line';
}
(() => {
  const box = $('#mirror'); let start = null, lastY = 0, moved = 0;
  const frac = (x, y) => {
    const img = $('#mirror-img'); const r = box.getBoundingClientRect();
    const iw = img.naturalWidth || 16, ih = img.naturalHeight || 9;
    const s = Math.min(r.width / iw, r.height / ih); const w = iw * s, h = ih * s;
    return { fx: (x - r.left - (r.width - w) / 2) / w, fy: (y - r.top - (r.height - h) / 2) / h };
  };
  box.addEventListener('pointerdown', (e) => { start = { x: e.clientX, y: e.clientY, t: Date.now() }; lastY = e.clientY; moved = 0; box.setPointerCapture(e.pointerId); });
  box.addEventListener('pointermove', (e) => {
    if (!start) return;
    const dy = lastY - e.clientY; moved += Math.abs(dy) + Math.abs(e.movementX || 0);
    if (moved > 12 && Math.abs(dy) > 4) { const f = frac(start.x, start.y); send({ t: 'mscroll', fx: f.fx, fy: f.fy, dy: Math.round(dy * 4) }); lastY = e.clientY; }
  });
  box.addEventListener('pointerup', (e) => {
    if (start && moved < 12 && Date.now() - start.t < 500) { const f = frac(e.clientX, e.clientY); buzz(); send({ t: 'tap', fx: f.fx, fy: f.fy }); }
    start = null;
  });
})();

// ---------- touchpad ----------
(() => {
  const pad = $('#pad'); let last = null, startT = 0, moved = 0, acc = { dx: 0, dy: 0 }, raf = null, twoY = null;
  const flush = () => { raf = null; if (acc.dx || acc.dy) send({ t: 'mouse', dx: Math.round(acc.dx), dy: Math.round(acc.dy) }); acc = { dx: 0, dy: 0 }; };
  pad.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (e.touches.length === 2) { twoY = (e.touches[0].clientY + e.touches[1].clientY) / 2; return; }
    last = { x: e.touches[0].clientX, y: e.touches[0].clientY }; startT = Date.now(); moved = 0;
  }, { passive: false });
  pad.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length === 2 && twoY != null) {
      const y = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      send({ t: 'scroll', dy: Math.round((twoY - y) * 4) }); twoY = y; moved = 99; return;
    }
    if (!last) return;
    const t = e.touches[0]; const dx = t.clientX - last.x, dy = t.clientY - last.y;
    last = { x: t.clientX, y: t.clientY }; moved += Math.abs(dx) + Math.abs(dy);
    const speed = 1.6 + Math.min(2.5, Math.hypot(dx, dy) / 12); // pointer acceleration
    acc.dx += dx * speed; acc.dy += dy * speed;
    if (!raf) raf = requestAnimationFrame(flush);
  }, { passive: false });
  pad.addEventListener('touchend', (e) => {
    if (e.touches.length === 0) {
      if (Date.now() - startT < 250 && moved < 10) { buzz(); send({ t: 'click' }); }
      last = null; twoY = null;
    }
  });
})();

// ---------- add app (website / PWA / .html / .zip) ----------
let addZoom = 1.25;
function openAddApp(apps) { $('#add-msg').textContent = ''; renderCustomList(apps); $('#addapp').classList.remove('hidden'); }
$('#add-close').onclick = () => $('#addapp').classList.add('hidden');
$$('#add-zoom button').forEach((b) => { b.onclick = () => { addZoom = Number(b.dataset.z); $$('#add-zoom button').forEach((x) => x.classList.toggle('active', x === b)); }; });
function renderCustomList(apps) {
  const box = $('#add-list'); box.innerHTML = '';
  const mine = apps.filter((a) => a.custom);
  if (mine.length) { const l = document.createElement('label'); l.className = 'lbl'; l.textContent = 'Installed apps'; box.append(l); }
  for (const a of mine) {
    const r = document.createElement('div'); r.className = 'row-app';
    const n = document.createElement('span'); n.textContent = a.name;
    const x = document.createElement('button'); x.textContent = 'Remove';
    x.onclick = async () => { const res = await call('removeApp', { id: a.id }); if (Array.isArray(res)) renderApps(res); };
    r.append(n, x); box.append(r);
  }
}
$('#add-go').onclick = async () => {
  const url = $('#add-url').value.trim(); const file = $('#add-file').files[0];
  if (!url && !file) { $('#add-msg').textContent = 'Enter an address or choose a file.'; return; }
  $('#add-msg').textContent = 'Installing…'; $('#add-go').disabled = true;
  try {
    let app;
    if (file) {
      const r = await fetch(`/api/apps/install?name=${encodeURIComponent(file.name)}&scale=${addZoom}`, { method: 'POST', headers: { 'x-pivista-token': token }, body: file });
      app = await r.json(); if (!r.ok) throw new Error(app.error);
    } else {
      app = await call('installUrl', { url, scale: addZoom }); if (app.error) throw new Error(app.error);
    }
    $('#add-msg').textContent = `✓ Installed “${app.name}”. It's on the TV home screen.`;
    $('#add-url').value = ''; $('#add-file').value = '';
  } catch (e) { $('#add-msg').textContent = 'Could not install: ' + e.message; }
  $('#add-go').disabled = false;
};

$('#unpair').onclick = () => { forgetToken(); location.reload(); };

// ---------- boot ----------
const pm = location.hash.match(/pair=(\d{6})/);
const tm = location.hash.match(/token=([0-9a-f]{48})/);
if (tm) { token = tm[1]; store.set('pv-token', token); history.replaceState(null, '', '/'); }
if (pm) pair(pm[1]);
else if (token) start();
else showPair();
