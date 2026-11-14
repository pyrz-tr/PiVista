// Built-in app catalog. Streaming "apps" are the official web players, opened full screen
// in Chromium with a user agent that unlocks the TV / 10-foot layouts and DRM.
//   scale: TV zoom. Desktop sites render at 1920/scale x 1080/scale CSS px, enlarged to fill
//          the 1080p screen, so text and buttons are readable from the couch.
//   back:  'key'     -> the site handles Esc itself (YouTube TV)
//          'history' -> leave fullscreen, then browser back; at the first page -> PiVista home
const TV_UA = 'Mozilla/5.0 (Linux; Tizen 2.3) AppleWebKit/538.1 (KHTML, like Gecko)Version/2.3 TV Safari/538.1';
// Chrome OS UA: streaming services serve higher (720p/1080p) Widevine streams to Chrome OS than to Linux.
const CROS_UA = 'Mozilla/5.0 (X11; CrOS aarch64 15633.69.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

module.exports = [
  { id: 'youtube', name: 'YouTube', type: 'web', url: 'https://www.youtube.com/tv', userAgent: TV_UA, scale: 1,
    back: 'key', color: '#ff0033', icon: '/shared/icons/youtube.svg' },
  { id: 'netflix', name: 'Netflix', type: 'web', url: 'https://www.netflix.com/browse', userAgent: CROS_UA, scale: 1.5,
    back: 'history', color: '#b20710', icon: '/shared/icons/netflix.svg' },
  { id: 'max', name: 'HBO Max', type: 'web', url: 'https://play.hbomax.com/', userAgent: CROS_UA, scale: 1.5,
    back: 'history', color: '#4b1fa8', icon: '/shared/icons/max.svg' },
  { id: 'disney', name: 'Disney+', type: 'web', url: 'https://www.disneyplus.com/home', userAgent: CROS_UA, scale: 1.5,
    back: 'history', color: '#0b2a8f', icon: '/shared/icons/disney.svg' },
  // Built-in system apps (screens of the TV UI itself)
  { id: 'media', name: 'Media Player', type: 'system', color: '#0f9d8a', icon: '/shared/icons/media.svg' },
  { id: 'browser', name: 'Web Browser', type: 'system', color: '#2d6cdf', icon: '/shared/icons/browser.svg' },
  { id: 'addapp', name: 'Add App', type: 'system', color: '#374151', icon: '/shared/icons/add.svg' },
  { id: 'pair', name: 'Pair Remote', type: 'system', color: '#c0135a', icon: '/shared/icons/pair.svg' },
  { id: 'system', name: 'System Info', type: 'system', color: '#4b5563', icon: '/shared/icons/system.svg' },
  { id: 'settings', name: 'Settings', type: 'system', color: '#1f2937', icon: '/shared/icons/settings.svg' },
];
module.exports.BROWSER_SCALE = 1.25;
