// PiVista TV zoom: on every navigation, ask the PiVista server which zoom the current app
// wants (e.g. 150% for Netflix) and apply it as real browser zoom. Unlike device-metrics
// emulation, browser zoom re-lays the page out, so it fills the whole TV screen.
const PORTS = [80, 8080];
let port = null;

async function zoomFor(url) {
  for (const p of port ? [port] : PORTS) {
    try {
      const base = p === 80 ? 'http://127.0.0.1' : `http://127.0.0.1:${p}`;
      const r = await fetch(`${base}/api/zoom?url=${encodeURIComponent(url)}`, { cache: 'no-store' });
      if (r.ok) { port = p; return (await r.json()).zoom || 1; }
    } catch (_) { /* try next port */ }
  }
  return null;
}

async function apply(tabId, url) {
  if (!url || !/^https?:/.test(url)) return;
  const z = await zoomFor(url);
  if (!z) return;
  try {
    const cur = await chrome.tabs.getZoom(tabId);
    if (Math.abs(cur - z) > 0.001) await chrome.tabs.setZoom(tabId, z);
  } catch (_) {}
}

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'loading' || info.url) apply(tabId, info.url || tab.url);
});
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try { const t = await chrome.tabs.get(tabId); apply(tabId, t.url); } catch (_) {}
});
