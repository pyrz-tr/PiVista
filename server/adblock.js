// Optional YouTube ad blocker (Settings → "Block YouTube ads"). Off by default so
// YouTube Premium and normal playback are never affected unless you opt in.
//  1. strips ad fields from YouTube's player JSON before the player sees them
//  2. blocks ad/tracking hosts at the network level
//  3. fallback: skips any ad that still slips through (mute + jump to end + click "Skip")
const SCRIPT = `(() => {
  if (window.__pvAdblock) return; window.__pvAdblock = 1;
  const KEYS = ['adPlacements', 'adSlots', 'playerAds', 'adBreakHeartbeatParams', 'adBreakParams'];
  const prune = (o, depth = 0) => {
    if (!o || typeof o !== 'object' || depth > 3) return o;
    if (Array.isArray(o)) { o.forEach((x) => prune(x, depth + 1)); return o; }
    for (const k of KEYS) if (k in o) delete o[k];
    if (o.playerResponse) prune(o.playerResponse, depth + 1);
    if (o.response) prune(o.response, depth + 1);
    return o;
  };
  const jp = JSON.parse;
  JSON.parse = function () { return prune(jp.apply(this, arguments)); };
  const rj = Response.prototype.json;
  Response.prototype.json = function () { return rj.call(this).then((d) => prune(d)); };
  const desc = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'responseText');
  Object.defineProperty(XMLHttpRequest.prototype, 'responseText', { configurable: true, get() {
    const t = desc.get.call(this);
    if (t && this.responseURL && /\\/youtubei\\/v1\\/(player|next)/.test(this.responseURL)) {
      try { return JSON.stringify(prune(jp(t))); } catch (_) {}
    }
    return t;
  } });
  setInterval(() => {
    document.querySelectorAll('.ytp-ad-skip-button,.ytp-ad-skip-button-modern,.ytp-skip-ad-button,[class*="skip-ad"] button,ytlr-skip-button-renderer')
      .forEach((b) => { try { b.click(); } catch (_) {} });
    const adUI = document.querySelector('.ad-showing, .ad-interrupting, ytlr-ad-badge-renderer, [class*="ad-overlay"]');
    const v = document.querySelector('video');
    if (adUI && v && isFinite(v.duration) && v.duration > 0) { v.muted = true; v.currentTime = Math.max(0, v.duration - 0.1); }
    else if (v && v.muted && v.dataset.pvMuted) { v.muted = false; }
    if (adUI && v) v.dataset.pvMuted = '1'; else if (v) delete v.dataset.pvMuted;
  }, 400);
})();`;

const BLOCKED = [
  '*doubleclick.net*', '*googlesyndication.com*', '*googleadservices.com*', '*google-analytics.com*',
  '*youtube.com/pagead/*', '*youtube.com/api/stats/ads*', '*youtube.com/ptracking*', '*youtube.com/get_midroll_*',
  '*youtube.com/youtubei/v1/log_event*',
];

module.exports = { SCRIPT, BLOCKED };
