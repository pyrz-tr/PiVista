/* PiVista phone remote. */
'use strict';
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let token = localStorage.getItem('pv-token');
let ws = null;

const buzz = (ms = 12) => navigator.vibrate && navigator.vibrate(ms);
function send(msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function forgetToken() { localStorage.removeItem('pv-token'); token = null; }

// ---------- pairing ----------
async function pair(code) {
  $('#pair-err').textContent = '';
  const ua = navigator.userAgent;
  const name = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android phone' : 'Browser';
  try {
    const r = await fetch('/api/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, name }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Pairing failed');
    token = j.token; localStorage.setItem('pv-token', token);
    history.replaceState(null, '', '/');
    start();
  } catch (e) { showPair(e.message + ' — check the code on your TV.'); }
}
$('#pair-btn').onclick = () => pair($('#code').value.trim());
$('#code').addEventListener('input', (e) => { if (e.target.value.length === 6) pair(e.target.value); });

// ---------- connection ----------
function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?token=${token}`);
  ws.onopen = () => { $('#conn').textContent = 'connected'; $('#conn').className = 'conn on'; };
  ws.onclose = (e) => {
    $('#conn').textContent = 'reconnecting…'; $('#conn').className = 'conn';
    if (e.code === 4001) { forgetToken(); showPair('This phone is no longer paired. Scan the pattern again.'); return; }
    setTimeout(connect, 1500);
  };
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && token && (!ws || ws.readyState > 1)) connect(); });

function showPair(msg) {
  $('#remote-view').classList.add('hidden'); $('#pair-view').classList.remove('hidden');
  if (msg) $('#pair-err').textContent = msg;
}

async function start() {
  $('#pair-view').classList.add('hidden'); $('#remote-view').classList.remove('hidden');
  connect();
  const apps = await (await fetch('/api/apps')).json();
  $('#apps').innerHTML = '';
  for (const a of apps) {
    const b = document.createElement('button'); b.className = 'app'; b.textContent = a.name;
    b.style.background = `linear-gradient(135deg, ${a.color}, ${a.color}88)`;
    b.onclick = () => { buzz(); send({ t: 'launch', id: a.id }); };
    $('#apps').append(b);
  }
}

// ---------- buttons (with hold-to-repeat for the d-pad) ----------
$$('[data-key]').forEach((b) => {
  let timer = null, rep = null;
  const fire = () => { buzz(); send({ t: 'key', k: b.dataset.key }); };
  const repeatable = ['up', 'down', 'left', 'right'].includes(b.dataset.key);
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault(); fire();
    if (repeatable) timer = setTimeout(() => { rep = setInterval(fire, 110); }, 450);
  });
  const end = () => { clearTimeout(timer); clearInterval(rep); };
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => b.addEventListener(ev, end));
});
$$('[data-vol]').forEach((b) => b.addEventListener('click', () => { buzz(); send({ t: 'volume', v: b.dataset.vol }); }));

// ---------- keyboard ----------
const typeEl = $('#type');
typeEl.addEventListener('input', (e) => {
  if (e.inputType === 'deleteContentBackward') send({ t: 'key', k: 'backspace' });
  else if (e.data) send({ t: 'text', v: e.data });
});
typeEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { send({ t: 'key', k: 'ok' }); typeEl.value = ''; } });
$('#bksp').onclick = () => { buzz(); send({ t: 'key', k: 'backspace' }); typeEl.value = typeEl.value.slice(0, -1); };

// ---------- tabs ----------
$$('.tabs button').forEach((b) => { b.onclick = () => {
  $$('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
  $$('.tab').forEach((t) => t.classList.toggle('hidden', t.id !== 'tab-' + b.dataset.tab));
}; });

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

$('#unpair').onclick = () => { forgetToken(); location.reload(); };

// ---------- boot ----------
const m = location.hash.match(/pair=(\d{6})/);
if (m) pair(m[1]);
else if (token) start();
else showPair();
