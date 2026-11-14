// Settings + persistent state (paired devices). Plain JSON files, atomic writes.
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.PIVISTA_DATA || '/var/lib/pivista';
const DEV = !!process.env.PIVISTA_DEV;
fs.mkdirSync(DATA_DIR, { recursive: true });

const DEFAULT_SETTINGS = {
  deviceName: 'PiVista',
  autostart: true,          // start the TV interface on boot
  allow4k: true,            // let the native video player switch HDMI to 4K for >1080p content
  uiResolution: '1920x1080',
  thermalLimitC: 80,        // throttle CPU above this temperature
  showSplash: true,
  screensaverMinutes: 15,
};

function load(file, fallback) {
  try { return { ...fallback, ...JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8')) }; }
  catch { return { ...fallback }; }
}

function save(file, obj) {
  const p = path.join(DATA_DIR, file);
  fs.writeFileSync(p + '.tmp', JSON.stringify(obj, null, 2));
  fs.renameSync(p + '.tmp', p);
}

const settings = load('settings.json', DEFAULT_SETTINGS);
const state = load('state.json', { devices: [] });

module.exports = {
  DATA_DIR, DEV,
  settings,
  state,
  saveSettings() { save('settings.json', settings); },
  saveState() { save('state.json', state); },
};
