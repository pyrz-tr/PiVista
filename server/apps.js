// App catalog. Streaming "apps" are the official web players, opened full screen
// in Chromium with a user agent that unlocks the TV / 10-foot layouts and DRM.
const TV_UA = 'Mozilla/5.0 (Linux; Tizen 2.3) AppleWebKit/538.1 (KHTML, like Gecko)Version/2.3 TV Safari/538.1';
// Chrome OS UA: streaming services serve higher (720p/1080p) Widevine streams to Chrome OS than to Linux.
const CROS_UA = 'Mozilla/5.0 (X11; CrOS aarch64 15633.69.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

module.exports = [
  { id: 'youtube', name: 'YouTube', type: 'web', url: 'https://www.youtube.com/tv', userAgent: TV_UA,
    back: 'key', color: '#ff0033', icon: '▶' },
  { id: 'netflix', name: 'Netflix', type: 'web', url: 'https://www.netflix.com/browse', userAgent: CROS_UA,
    back: 'history', color: '#e50914', icon: 'N' },
  { id: 'max', name: 'HBO Max', type: 'web', url: 'https://play.hbomax.com/', userAgent: CROS_UA,
    back: 'history', color: '#5822b4', icon: 'max' },
  { id: 'disney', name: 'Disney+', type: 'web', url: 'https://www.disneyplus.com/home', userAgent: CROS_UA,
    back: 'history', color: '#113ccf', icon: 'D+' },
  // Built-in system apps (rendered by the TV UI itself)
  { id: 'media', name: 'Media Player', type: 'system', color: '#0f9d8a', icon: '◉' },
  { id: 'browser', name: 'Web Browser', type: 'system', color: '#2d6cdf', icon: '◎' },
  { id: 'system', name: 'System Info', type: 'system', color: '#6b7280', icon: 'ℹ' },
  { id: 'pair', name: 'Pair Remote', type: 'system', color: '#8b5cf6', icon: '⠿' },
  { id: 'settings', name: 'Settings', type: 'system', color: '#374151', icon: '⚙' },
];
