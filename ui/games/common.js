/* Shared helpers for PiVista games.
   Input arrives as real key events (from the phone remote via the server, or a keyboard):
   arrows, Enter (OK), Space, Escape (Back). In games the remote's d-pad sends key *down*
   and key *up* separately, so holding a button on the phone holds the key. */
'use strict';

// Fit the fixed 1920x1080 layout to whatever mode the monitor ended up in (720p TVs, 1366x768, 4K…)
(function fitScreen() {
  const apply = () => { document.body.style.zoom = Math.min(innerWidth / 1920, innerHeight / 1080); };
  addEventListener('resize', apply);
  if (document.body) apply(); else addEventListener('DOMContentLoaded', apply);
})();
const PV = (() => {
  const held = new Set();
  const pressHandlers = [];
  const MAP = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'ok', ' ': 'ok', Spacebar: 'ok',
    w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right', p: 'pause', P: 'pause', MediaPlayPause: 'pause' };
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); PV.exit(); return; }
    const k = MAP[e.key]; if (!k) return;
    e.preventDefault();
    if (!held.has(k) || !e.repeat) pressHandlers.forEach((fn) => fn(k));
    held.add(k);
  });
  addEventListener('keyup', (e) => { const k = MAP[e.key]; if (k) held.delete(k); });
  addEventListener('blur', () => held.clear());

  return {
    held: (k) => held.has(k),
    onPress: (fn) => pressHandlers.push(fn),
    exit() { location.href = '/tv/#games'; },
    best(game, score) {
      const key = 'pv-best-' + game; let b = 0;
      try { b = Number(localStorage.getItem(key)) || 0; if (score != null && score > b) { localStorage.setItem(key, score); b = score; } } catch (_) {}
      return b;
    },
    // fixed-timestep loop (keeps game speed identical on a busy Pi)
    loop(update, render, step = 1 / 60) {
      let last = performance.now(), acc = 0;
      const frame = (now) => {
        acc += Math.min(0.25, (now - last) / 1000); last = now;
        if (window.__pvLocked) acc = 0;            // screen locked from the owner's phone: freeze the game
        while (acc >= step) { update(step); acc -= step; }
        render(); requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    },
    $: (s) => document.querySelector(s),
  };
})();
