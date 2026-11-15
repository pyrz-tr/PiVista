// Server-side messages (toasts on the TV / over streaming apps) in the language chosen in Settings.
const cfg = require('./config');
const TR = {
  'Pi is hot ({t}°C) — reducing CPU speed to cool down': 'Pi ısındı ({t}°C) — soğuması için işlemci yavaşlatılıyor',
  'Temperature normal ({t}°C)': 'Sıcaklık normal ({t}°C)',
  'Under-voltage detected — use the official 5V/3A power supply': 'Düşük voltaj algılandı — resmi 5V/3A güç adaptörünü kullanın',
  'Screen locked': 'Ekran kilitli', 'Locked from {name}': '{name} tarafından kilitlendi',
  'Muted': 'Ses kapalı', 'Volume {n}%': 'Ses %{n}', 'Bookmark added': 'Yer imi eklendi',
};
function t(key, vars) {
  let s = (cfg.settings.language === 'tr' && TR[key]) || key;
  if (vars) for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
  return s;
}
module.exports = { t };
