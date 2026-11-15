// Anti-overheat guard. Polls the SoC temperature (every 30 s, every 10 s when warm) and progressively limits CPU clocks
// before the firmware's own hard throttling (85°C) kicks in, and warns on screen.
const sys = require('./system');
const { settings } = require('./config');
const { t: T } = require('./i18n');

let level = 0; // 0 = normal, 1 = capped, 2 = heavily capped
let lastUV = false;

function start(notify) {
  const tick = async () => {
    const t = sys.tempC();
    if (t != null) {
      const limit = settings.thermalLimitC;
      let next = level;
      if (t >= limit + 5) next = 2;
      else if (t >= limit) next = Math.max(level, 1);
      else if (t < limit - 10) next = 0; // hysteresis
      if (next !== level) {
        level = next;
        sys.setMaxFreq(level === 2 ? 1000000 : level === 1 ? 1200000 : null);
        notify({ type: 'thermal', level, tempC: t,
          message: level ? T('Pi is hot ({t}°C) — reducing CPU speed to cool down', { t }) : T('Temperature normal ({t}°C)', { t }) });
      }
    }
    const th = await sys.throttled();
    if (th && th.underVoltage !== lastUV) {
      lastUV = th.underVoltage;
      if (lastUV) notify({ type: 'thermal', level: -1, message: T('Under-voltage detected — use the official 5V/3A power supply') });
    }
  };
  // Every 30 s normally; every 10 s once the Pi is getting warm (within 5 °C of the limit) or throttled.
  const loop = async () => {
    await tick().catch(() => {});
    const t = sys.tempC();
    const warm = level > 0 || (t != null && t >= settings.thermalLimitC - 5);
    setTimeout(loop, warm ? 10000 : 30000).unref();
  };
  loop();
}

module.exports = { start, get level() { return level; } };
