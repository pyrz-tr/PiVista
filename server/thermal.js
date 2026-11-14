// Anti-overheat guard. Polls the SoC temperature and progressively limits CPU clocks
// before the firmware's own hard throttling (85°C) kicks in, and warns on screen.
const sys = require('./system');
const { settings } = require('./config');

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
          message: level ? `Pi is hot (${t}°C) — reducing CPU speed to cool down` : `Temperature normal (${t}°C)` });
      }
    }
    const th = await sys.throttled();
    if (th && th.underVoltage !== lastUV) {
      lastUV = th.underVoltage;
      if (lastUV) notify({ type: 'thermal', level: -1, message: 'Under-voltage detected — use the official 5V/3A power supply' });
    }
  };
  tick();
  setInterval(tick, 5000).unref();
}

module.exports = { start, get level() { return level; } };
