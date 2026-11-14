// Minimal Chrome DevTools Protocol client.
// The server drives the kiosk Chromium through CDP: it injects remote-control key presses,
// pointer events and text into whatever page is showing (our TV UI or a streaming site),
// and switches user agents per app.
const WebSocket = require('ws');

const CDP_PORT = Number(process.env.PIVISTA_CDP_PORT || 9222);
const KEYS = {
  up: ['ArrowUp', 38], down: ['ArrowDown', 40], left: ['ArrowLeft', 37], right: ['ArrowRight', 39],
  ok: ['Enter', 13, '\r'], back: ['Escape', 27], backspace: ['Backspace', 8],
  space: ['Space', 32, ' ', ' '], playpause: ['MediaPlayPause', 179],
};

class CDP {
  constructor() {
    this.ws = null; this.id = 0; this.pending = new Map();
    this.ua = null; this.defaultUA = null; this.connecting = null;
    this.onNavigate = () => {};
  }

  async connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
      const page = list.find((t) => t.type === 'page');
      if (!page) throw new Error('no page target');
      await new Promise((resolve, reject) => {
        const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
        ws.once('open', () => { this.ws = ws; resolve(); });
        ws.once('error', reject);
        ws.on('close', () => { this.ws = null; });
        ws.on('message', (raw) => {
          const msg = JSON.parse(raw);
          if (msg.id && this.pending.has(msg.id)) {
            const { res, rej } = this.pending.get(msg.id); this.pending.delete(msg.id);
            msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
          } else if (msg.method === 'Page.frameNavigated' && !msg.params.frame.parentId) {
            this.onNavigate(msg.params.frame.url);
          }
        });
      });
      await this.send('Page.enable');
      if (!this.defaultUA) {
        const v = await this.send('Browser.getVersion');
        this.defaultUA = v.userAgent.replace('HeadlessChrome', 'Chrome');
      }
      if (this.ua) await this.send('Emulation.setUserAgentOverride', { userAgent: this.ua });
    })().finally(() => { this.connecting = null; });
    return this.connecting;
  }

  async send(method, params = {}) {
    if (method !== 'Page.enable' && method !== 'Browser.getVersion' && method !== 'Emulation.setUserAgentOverride') {
      await this.connect();
    }
    if (!this.ws) throw new Error('CDP not connected');
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pending.delete(id)) rej(new Error(`CDP timeout: ${method}`)); }, 5000);
    });
  }

  async navigate(url, userAgent) {
    await this.connect();
    this.ua = userAgent || null;
    await this.send('Emulation.setUserAgentOverride', { userAgent: this.ua || this.defaultUA || '' });
    await this.send('Page.navigate', { url });
  }

  async key(name) {
    const k = KEYS[name]; if (!k) return;
    const [key, code, text, codeName] = k;
    const base = { key, code: codeName || key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code };
    await this.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', ...base, ...(text ? { text } : {}) });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }

  async text(str) { await this.send('Input.insertText', { text: str }); }

  async mouse(type, x, y, extra = {}) {
    await this.send('Input.dispatchMouseEvent', { type, x, y, button: 'none', ...extra });
  }

  async click(x, y) {
    await this.mouse('mousePressed', x, y, { button: 'left', clickCount: 1 });
    await this.mouse('mouseReleased', x, y, { button: 'left', clickCount: 1 });
  }

  async scroll(x, y, dy) { await this.mouse('mouseWheel', x, y, { deltaX: 0, deltaY: dy }); }

  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true });
    return r.result && r.result.value;
  }

  async historyBack() {
    const h = await this.send('Page.getNavigationHistory');
    if (h.currentIndex > 0) {
      await this.send('Page.navigateToHistoryEntry', { entryId: h.entries[h.currentIndex - 1].id });
      return true;
    }
    return false;
  }
}

module.exports = new CDP();
