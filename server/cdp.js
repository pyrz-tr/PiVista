// Minimal Chrome DevTools Protocol client.
// The server drives the kiosk Chromium through CDP: it injects remote-control key presses,
// pointer events and text into whatever page is showing (our TV UI or a streaming site),
// and applies per-app settings (user agent, zoom, injected scripts, blocked URLs).
const WebSocket = require('ws');
const EventEmitter = require('events');

const CDP_PORT = Number(process.env.PIVISTA_CDP_PORT || 9222);
const SCREEN = { w: 1920, h: 1080 };
const KEYS = {
  up: ['ArrowUp', 38], down: ['ArrowDown', 40], left: ['ArrowLeft', 37], right: ['ArrowRight', 39],
  ok: ['Enter', 13, '\r'], back: ['Escape', 27], backspace: ['Backspace', 8],
  space: [' ', 32, ' ', 'Space'], playpause: ['MediaPlayPause', 179], tab: ['Tab', 9],
};

// Injected into every page: reports focused text fields (so the phone keyboard pops up)
// and keeps everything in one tab (kiosk = one window).
const BASE_SCRIPT = `(() => {
  if (window.__pv) return; window.__pv = 1;
  const editable = (e) => e && (e.isContentEditable || e.tagName === 'TEXTAREA' ||
    (e.tagName === 'INPUT' && !/^(button|checkbox|radio|range|submit|reset|file|color|image|hidden)$/i.test(e.type || '')));
  const report = (o) => { try { window.pvFocus && window.pvFocus(JSON.stringify(o)); } catch (_) {} };
  document.addEventListener('focusin', (e) => { const t = e.composedPath ? e.composedPath()[0] : e.target;
    if (editable(t)) report({ focus: true, value: t.value || t.textContent || '', type: t.type || 'text',
      label: t.getAttribute('aria-label') || t.placeholder || t.name || '' }); }, true);
  document.addEventListener('focusout', (e) => { if (editable(e.target)) report({ focus: false }); }, true);
  window.open = function (u) { if (u) location.href = u; return window; };
  document.addEventListener('click', (e) => { const a = e.target.closest && e.target.closest('a[target]');
    if (a && a.target !== '_self') a.target = '_self'; }, true);
})();`;

class CDP extends EventEmitter {
  constructor() {
    super();
    this.ws = null; this.id = 0; this.pending = new Map(); this.connecting = null;
    this.defaultUA = null;
    // per-app session state, re-applied whenever we (re)connect
    this.app = { ua: null, scale: 1, scripts: [], blocked: [] };
    this.scriptIds = [];
  }

  get scale() { return this.app.scale || 1; }
  get connected() { return !!(this.ws && this.ws.readyState === WebSocket.OPEN); }

  async connect() {
    if (this.connected) return;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
      const page = list.find((t) => t.type === 'page');
      if (!page) throw new Error('CDP: no page target');
      await new Promise((resolve, reject) => {
        const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
        ws.once('open', () => { this.ws = ws; resolve(); });
        ws.once('error', reject);
        ws.on('close', () => { if (this.ws === ws) { this.ws = null; this.scriptIds = []; this.emit('disconnected'); } });
        ws.on('message', (raw) => this._onMessage(JSON.parse(raw)));
      });
      await this._raw('Page.enable');
      await this._raw('Runtime.enable');
      await this._raw('Network.enable');
      await this._raw('Runtime.addBinding', { name: 'pvFocus' });
      // focus events fire even if the compositor window isn't "active" (keeps the phone keyboard reliable)
      await this._raw('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
      await this._raw('Page.addScriptToEvaluateOnNewDocument', { source: BASE_SCRIPT });
      await this._raw('Runtime.evaluate', { expression: BASE_SCRIPT }).catch(() => {});
      if (!this.defaultUA) this.defaultUA = (await this._raw('Browser.getVersion')).userAgent.replace('HeadlessChrome', 'Chrome');
      await this._applyApp();
      this.emit('connected');
    })().finally(() => { this.connecting = null; });
    return this.connecting;
  }

  _onMessage(msg) {
    if (msg.id && this.pending.has(msg.id)) {
      const { res, rej } = this.pending.get(msg.id); this.pending.delete(msg.id);
      return msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
    }
    if (msg.method === 'Page.frameNavigated' && !msg.params.frame.parentId) this.emit('navigate', msg.params.frame.url);
    else if (msg.method === 'Runtime.bindingCalled' && msg.params.name === 'pvFocus') {
      try { this.emit('focus', JSON.parse(msg.params.payload)); } catch {}
    } else if (msg.method === 'Page.screencastFrame') this.emit('frame', msg.params);
  }

  _raw(method, params = {}) {
    if (!this.ws) return Promise.reject(new Error('CDP not connected'));
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pending.delete(id)) rej(new Error(`CDP timeout: ${method}`)); }, 8000);
    });
  }

  async send(method, params = {}) { await this.connect(); return this._raw(method, params); }

  async _applyApp() {
    const { ua, scale, scripts, blocked } = this.app;
    await this._raw('Emulation.setUserAgentOverride', { userAgent: ua || this.defaultUA || '' });
    // TV-friendly sizing: render desktop sites at e.g. 1280x720 CSS px, scaled 1.5x to fill 1080p.
    if (scale && scale !== 1) {
      await this._raw('Emulation.setDeviceMetricsOverride', { width: Math.round(SCREEN.w / scale), height: Math.round(SCREEN.h / scale),
        deviceScaleFactor: scale, mobile: false, screenWidth: Math.round(SCREEN.w / scale), screenHeight: Math.round(SCREEN.h / scale) });
    } else {
      await this._raw('Emulation.clearDeviceMetricsOverride');
    }
    for (const id of this.scriptIds) await this._raw('Page.removeScriptToEvaluateOnNewDocument', { identifier: id }).catch(() => {});
    this.scriptIds = [];
    for (const source of scripts) this.scriptIds.push((await this._raw('Page.addScriptToEvaluateOnNewDocument', { source })).identifier);
    await this._raw('Network.setBlockedURLs', { urls: blocked });
  }

  // Open a URL with per-app settings: { userAgent, scale, scripts, blocked }
  async navigate(url, opts = {}) {
    await this.connect();
    this.app = { ua: opts.userAgent || null, scale: opts.scale || 1, scripts: opts.scripts || [], blocked: opts.blocked || [] };
    await this._applyApp();
    await this._raw('Page.navigate', { url });
  }

  // Back on the TV UI by any route: drop per-app UA/zoom/scripts.
  async resetApp() {
    const a = this.app;
    if (!a.ua && (a.scale || 1) === 1 && !a.scripts.length && !a.blocked.length) return;
    this.app = { ua: null, scale: 1, scripts: [], blocked: [] };
    await this._applyApp();
  }

  async key(name) {
    const k = KEYS[name]; if (!k) return;
    const [key, code, text, codeName] = k;
    const base = { key, code: codeName || key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code };
    await this.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', ...base, ...(text ? { text } : {}) });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }

  async text(str) { await this.send('Input.insertText', { text: str }); }

  // Replace the focused field's content (used by the phone keyboard sheet).
  async setFieldText(str) {
    await this.eval(`(() => { const e = document.activeElement; if (!e) return;
      if (e.isContentEditable) { document.execCommand('selectAll'); } else if (e.select) { e.select(); } })()`);
    await this.text(str);
  }

  // Coordinates are CSS px of the (possibly zoomed) page.
  async mouse(type, x, y, extra = {}) { await this.send('Input.dispatchMouseEvent', { type, x, y, button: 'none', ...extra }); }
  async click(x, y) {
    await this.mouse('mouseMoved', x, y);
    await this.mouse('mousePressed', x, y, { button: 'left', clickCount: 1 });
    await this.mouse('mouseReleased', x, y, { button: 'left', clickCount: 1 });
  }
  async scroll(x, y, dy) { await this.mouse('mouseWheel', x, y, { deltaX: 0, deltaY: dy }); }

  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return r.result && r.result.value;
  }

  async history(delta) {
    const h = await this.send('Page.getNavigationHistory');
    const e = h.entries[h.currentIndex + delta];
    if (!e) return false;
    await this.send('Page.navigateToHistoryEntry', { entryId: e.id });
    return true;
  }
  reload() { return this.send('Page.reload'); }
  async current() { const h = await this.send('Page.getNavigationHistory'); const e = h.entries[h.currentIndex]; return e ? { url: e.url, title: e.title } : null; }

  startScreencast() {
    return this.send('Page.startScreencast', { format: 'jpeg', quality: 45, maxWidth: 960, maxHeight: 540, everyNthFrame: 2 });
  }
  stopScreencast() { return this.connected ? this._raw('Page.stopScreencast').catch(() => {}) : Promise.resolve(); }
  ackFrame(sessionId) { return this.connected ? this._raw('Page.screencastFrameAck', { sessionId }).catch(() => {}) : Promise.resolve(); }
}

module.exports = new CDP();
module.exports.SCREEN = SCREEN;
