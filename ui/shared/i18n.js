/* PiVista translations. The English text is the key: t('Settings') -> 'Ayarlar' in Turkish.
 * Static HTML: add data-i18n (text), data-i18n-html (keeps markup) or data-i18n-ph (placeholder).
 * The language is a PiVista setting (Settings → Language); the TV, phone remotes and games follow it. */
'use strict';
const PVI18N = (() => {
  const TR = {
    // ---- general / TV
    'No remote': 'Kumanda yok', '{n} remote': '{n} kumanda', '{n} remotes': '{n} kumanda',
    'Welcome': 'Hoş geldiniz', 'Good morning': 'Günaydın', 'Good afternoon': 'İyi günler', 'Good evening': 'İyi akşamlar',
    'What do you want to watch?': 'Ne izlemek istersiniz?', 'Streaming': 'Yayın Servisleri', 'My Apps': 'Uygulamalarım', 'System': 'Sistem',
    'Opening {name}…': '{name} açılıyor…',
    'Media Player': 'Medya Oynatıcı', 'Web Browser': 'Web Tarayıcı', 'Add App': 'Uygulama Ekle', 'Pair Remote': 'Kumanda Eşle',
    'System Info': 'Sistem Bilgisi', 'Settings': 'Ayarlar', 'Games': 'Oyunlar',
    'Videos, music and USB drives · 4K files play in 4K': 'Videolar, müzik ve USB bellekler · 4K dosyalar 4K oynatılır',
    'Browse': 'Gözat', 'Play a link': 'Bağlantı oynat', 'Video or stream URL (type on your phone)': 'Video veya yayın adresi (telefonunuzdan yazın)',
    'Recently played': 'Son oynatılanlar', 'Up': 'Yukarı', 'Folder': 'Klasör', 'Empty folder': 'Boş klasör', 'Nothing played yet': 'Henüz bir şey oynatılmadı',
    'No media yet: copy files to ~/Videos or plug in a USB drive': 'Henüz medya yok: dosyaları ~/Videos klasörüne kopyalayın veya bir USB bellek takın',
    'Select the address bar: your phone opens a keyboard. Press OK to go.': 'Adres çubuğunu seçin: telefonunuzda klavye açılır. Gitmek için OK’e basın.',
    'Search Google or enter an address': 'Google’da arayın veya adres girin', 'Bookmarks': 'Yer imleri', 'Recent': 'Son ziyaretler', 'No recent pages': 'Son ziyaret edilen sayfa yok',
    'Play with your phone: in a game, holding a remote button holds the key.': 'Telefonunuzla oynayın: oyunda kumanda tuşunu basılı tutmak, tuşu basılı tutar.',
    'Install any website or PWA by its address, or upload an <b>.html</b> file or a <b>.zip</b> web app from your phone (Remote → Apps → Add app).':
      'Herhangi bir web sitesini veya PWA’yı adresiyle kurun ya da telefonunuzdan bir <b>.html</b> dosyası veya <b>.zip</b> web uygulaması yükleyin (Kumanda → Uygulamalar → Uygulama ekle).',
    'Install from address': 'Adresten kur', 'e.g. music.youtube.com or squoosh.app': 'örn. music.youtube.com veya squoosh.app', 'Zoom': 'Yakınlaştırma',
    'Install': 'Kur', 'Installed apps': 'Kurulu uygulamalar', 'No apps installed yet': 'Henüz kurulu uygulama yok', 'Remove': 'Kaldır', '{name} removed': '{name} kaldırıldı',
    'Installing…': 'Kuruluyor…', 'Could not install: {err}': 'Kurulamadı: {err}', 'Installed “{name}”. Find it on the home screen.': '“{name}” kuruldu. Ana ekranda bulabilirsiniz.',
    'Model': 'Model', 'Hostname': 'Ağ adı', 'IP address': 'IP adresi', 'Temperature': 'Sıcaklık', 'CPU clock': 'İşlemci hızı', 'Load': 'Yük',
    'Memory free': 'Boş bellek', 'Power': 'Güç', 'Throttling': 'Yavaşlatma', 'Uptime': 'Çalışma süresi', '⚠ Under-voltage': '⚠ Düşük voltaj',
    'Under-voltage occurred': 'Düşük voltaj yaşandı', 'OK': 'Normal', 'Active': 'Etkin', 'Soft temp limit': 'Sıcaklık sınırı', 'None': 'Yok',
    'Pair your phone': 'Telefonunuzu eşleyin', 'Connect your phone to the same Wi‑Fi.': 'Telefonunuzu aynı Wi‑Fi ağına bağlayın.',
    'Open the camera and scan the dot pattern.': 'Kamerayı açın ve nokta desenini okutun.', 'Your phone becomes the remote. That\'s it.': 'Telefonunuz kumanda olur. Bu kadar.',
    'Or open': 'Ya da', 'and enter code': 'adresini açıp şu kodu girin',
    '<b>Page didn\'t open?</b><br>Some phones can\'t open <i>.local</i> addresses.<br>Scan this one instead, or type':
      '<b>Sayfa açılmadı mı?</b><br>Bazı telefonlar <i>.local</i> adreslerini açamaz.<br>Bunun yerine bunu okutun ya da şunu yazın:',
    'Paired: {list}': 'Eşli: {list}', 'No remotes paired yet': 'Henüz eşli kumanda yok', 'Done': 'Tamam',
    'Start PiVista on boot': 'PiVista açılışta başlasın', 'Block YouTube ads': 'YouTube reklamlarını engelle',
    'Turn off if you have YouTube Premium or anything misbehaves': 'YouTube Premium kullanıyorsanız veya sorun olursa kapatın',
    'Allow 4K output for media player': 'Medya oynatıcıda 4K çıkışa izin ver', 'Opening animation': 'Açılış animasyonu', 'Screensaver after': 'Ekran koruyucu',
    'CPU slow-down temperature': 'İşlemci yavaşlatma sıcaklığı', 'Pair a new remote': 'Yeni kumanda eşle', 'Forget all paired remotes': 'Tüm eşli kumandaları unut',
    '{n} paired': '{n} eşli', 'Restart interface': 'Arayüzü yeniden başlat', 'Reboot': 'Yeniden başlat', 'Shut down': 'Kapat', 'Language': 'Dil',
    'On': 'Açık', 'Off': 'Kapalı', 'Never': 'Hiçbir zaman', '{n} min': '{n} dk', 'All remotes removed': 'Tüm kumandalar kaldırıldı',
    '📱 {name} connected as remote': '📱 {name} kumanda olarak bağlandı',
    'Can\'t reach the PiVista server, reconnecting… (check: <b>pivista doctor</b>)': 'PiVista sunucusuna ulaşılamıyor, yeniden bağlanılıyor… (kontrol: <b>pivista doctor</b>)',
    '🏆 Best time {t} s': '🏆 En iyi süre {t} sn', '🏆 Best {n}': '🏆 En iyi {n}',
    'Kart racing on two tracks against three fruity rivals. Grab turbos, hit boost pads, win the cup.': 'İki pistte üç meyveli rakibe karşı kart yarışı. Turboları topla, hız pedlerinden geç, kupayı kazan.',
    'Eat the raspberries and grow. The snake speeds up as you go.': 'Ahududuları ye ve büyü. Yılan gittikçe hızlanır.',
    'Bounce the ball and smash every brick. Levels get tougher.': 'Topu sektir ve tüm tuğlaları kır. Bölümler zorlaşır.',
    'Slide the tiles and merge matching numbers. Reach 2048!': 'Karoları kaydır, aynı sayıları birleştir. 2048’e ulaş!',

    'General': 'Genel', 'Sound': 'Ses', 'Display': 'Ekran', 'Network & time': 'Ağ ve saat', 'Apps': 'Uygulamalar', 'Remotes': 'Kumandalar',
    'Device name': 'Cihaz adı', 'Shown on paired phones.': 'Eşli telefonlarda görünür.', 'Save': 'Kaydet', 'Saving…': 'Kaydediliyor…',
    'Sound output': 'Ses çıkışı', 'HDMI (TV speakers)': 'HDMI (TV hoparlörleri)', 'Audio jack': 'Kulaklık girişi', 'USB speakers': 'USB hoparlör',
    'Bluetooth': 'Bluetooth', 'No sound device found': 'Ses cihazı bulunamadı', 'Sound output: {name}': 'Ses çıkışı: {name}',
    'Press OK to switch between HDMI, audio jack and USB speakers': 'HDMI, kulaklık girişi ve USB hoparlör arasında geçmek için OK’e basın',
    'Plug in USB speakers or use the audio jack to get more choices': 'Daha fazla seçenek için USB hoparlör takın veya kulaklık girişini kullanın',
    'Volume': 'Ses düzeyi', 'Muted': 'Sessiz', 'Screen resolution': 'Ekran çözünürlüğü', 'Monitor default': 'Monitör varsayılanı', '24-hour clock': '24 saat biçimi',
    'Wi‑Fi': 'Wi‑Fi', 'Ethernet': 'Ethernet', 'Not connected': 'Bağlı değil', 'Date & time': 'Tarih ve saat', 'Update PiVista': 'PiVista’yı güncelle',
    'Updating… PiVista restarts by itself when done': 'Güncelleniyor… Bitince PiVista kendiliğinden yeniden başlar',
    'Searching for networks…': 'Ağlar aranıyor…', 'Connected to {ssid}': '{ssid} ağına bağlı', 'Connected with an Ethernet cable': 'Ethernet kablosuyla bağlı',
    'Search again': 'Yeniden ara', 'Wi‑Fi is not available on this system': 'Bu sistemde Wi‑Fi kullanılamıyor', 'No networks found': 'Ağ bulunamadı',
    'Connecting to {ssid}…': '{ssid} ağına bağlanılıyor…', 'Could not connect: {err}': 'Bağlanılamadı: {err}', 'Type the Wi‑Fi password on your phone.': 'Wi‑Fi şifresini telefonunuzdan yazın.',
    'Connect': 'Bağlan', 'Connecting…': 'Bağlanılıyor…', 'Password': 'Şifre', 'Current time': 'Şu anki saat', 'Set time automatically': 'Saati otomatik ayarla',
    'synchronised': 'eşitlendi', 'waiting for internet': 'internet bekleniyor', 'Time zone': 'Saat dilimi', 'Set date & time manually': 'Tarih ve saati elle ayarla',
    'Format: YYYY-MM-DD HH:MM (turns automatic time off)': 'Biçim: YYYY-AA-GG SS:DD (otomatik saati kapatır)', 'No matching time zone': 'Eşleşen saat dilimi yok',
    'Time zone: {tz}': 'Saat dilimi: {tz}', 'Search: city or region (e.g. Istanbul)': 'Ara: şehir veya bölge (örn. Istanbul)', 'No answer from PiVista': 'PiVista yanıt vermedi',
    'Network changed: pair your phone again': 'Ağ değişti: telefonunuzu yeniden eşleyin', 'Use the format YYYY-MM-DD HH:MM': 'YYYY-AA-GG SS:DD biçimini kullanın',
    'Could not set the time': 'Saat ayarlanamadı', 'Unknown time zone': 'Bilinmeyen saat dilimi',
    'Screen locked': 'Ekran kilitli', 'Locked from {name}': '{name} tarafından kilitlendi', 'Unlock': 'Kilidi aç',
    'Only the first paired phone can unlock the TV.': 'TV’nin kilidini yalnızca ilk eşlenen telefon açabilir.',
    'Only the first paired phone can lock the screen': 'Ekranı yalnızca ilk eşlenen telefon kilitleyebilir', 'locked': 'Ekran kilitli',

    'Cancel': 'İptal', 'Please wait…': 'Lütfen bekleyin…', 'Downloads the newest version from GitHub and installs it': 'En yeni sürümü GitHub’dan indirip kurar',
    'Could not check: {err}': 'Kontrol edilemedi: {err}', 'Update available (v{v})': 'Güncelleme var (v{v})', 'v{v} · up to date': 'v{v} · güncel',
    'GitHub access token': 'GitHub erişim anahtarı', 'Only needed if the PiVista repository is private': 'Yalnızca PiVista deposu gizliyse gerekir',
    'Saved': 'Kayıtlı', 'Not set': 'Ayarlanmadı',
    'Paste a fine-grained token with read access to the repository. Leave empty to remove it.': 'Depoyu okuma izni olan bir “fine-grained” anahtar yapıştırın. Silmek için boş bırakın.',
    'Exit to desktop': 'Masaüstüne çık', 'Closes PiVista. The first paired phone can open it again.': 'PiVista’yı kapatır. İlk eşlenen telefon yeniden açabilir.',
    'Exit to desktop?': 'Masaüstüne çıkılsın mı?',
    'PiVista closes and the desktop appears. To come back, press “Open PiVista” on the first paired phone.': 'PiVista kapanır ve masaüstü açılır. Geri dönmek için ilk eşlenen telefonda “PiVista’yı aç”a basın.',
    'Update PiVista now?': 'PiVista şimdi güncellensin mi?', 'Update now': 'Şimdi güncelle', 'Updating…': 'Güncelleniyor…',
    'Version {v} is available. PiVista restarts by itself after the update (about 1–3 minutes).': '{v} sürümü hazır. Güncellemeden sonra PiVista kendiliğinden yeniden başlar (yaklaşık 1–3 dakika).',
    'PiVista seems up to date. Install the newest version again anyway?': 'PiVista güncel görünüyor. En yeni sürüm yine de yeniden kurulsun mu?',
    'PiVista is closed': 'PiVista kapalı', 'The TV is showing the desktop.': 'TV masaüstünü gösteriyor.', 'Open PiVista': 'PiVista’yı aç',
    'Only the first paired phone can open PiVista again.': 'PiVista’yı yalnızca ilk eşlenen telefon yeniden açabilir.',
    'Only the first paired phone can do this': 'Bunu yalnızca ilk eşlenen telefon yapabilir', 'Only the first paired phone can open PiVista again': 'PiVista’yı yalnızca ilk eşlenen telefon yeniden açabilir',
    'That does not look like a GitHub token': 'Bu bir GitHub anahtarına benzemiyor',
    'Repository not found: if it is private, add a GitHub access token': 'Depo bulunamadı: gizliyse bir GitHub erişim anahtarı ekleyin',
    'GitHub refused the token (check that it can read the repository)': 'GitHub anahtarı reddetti (depoyu okuyabildiğini kontrol edin)',

    // ---- phone remote
    'Scan the dot pattern on your TV with your phone camera, or type the 6-digit code shown on screen.': 'TV’deki nokta desenini telefon kameranızla okutun veya ekrandaki 6 haneli kodu yazın.',
    'Pair': 'Eşle', 'Page won\'t load from <i>pivista.local</i>? Use the IP address shown at the top of the TV screen, or scan the small “direct” pattern.':
      'Sayfa <i>pivista.local</i> ile açılmıyor mu? TV ekranının üstündeki IP adresini kullanın veya küçük “doğrudan” deseni okutun.',
    'connecting…': 'bağlanıyor…', 'connected': 'bağlı', 'reconnecting…': 'yeniden bağlanıyor…', '🎮 Game mode': '🎮 Oyun modu',
    'Can\'t reach': 'Ulaşılamıyor:', 'Use direct IP': 'Doğrudan IP kullan', 'Now playing': 'Şimdi oynatılıyor', 'Search or address': 'Ara veya adres gir',
    'Remote': 'Kumanda', 'Screen': 'Ekran', 'Touchpad': 'Dokunmatik', 'Apps': 'Uygulamalar', 'Back': 'Geri', 'Home': 'Ana sayfa', 'Play': 'Oynat', 'Space': 'Boşluk',
    'Tap to press · drag up/down to scroll · video isn\'t streamed to save the Pi\'s power': 'Basmak için dokunun · kaydırmak için sürükleyin · Pi’yi yormamak için video aktarılmaz',
    'Drag to move · tap to click · two fingers to scroll': 'Taşımak için sürükleyin · tıklamak için dokunun · kaydırmak için iki parmak',
    'Unpair this phone': 'Bu telefonun eşleşmesini kaldır', 'Type on TV': 'TV’ye yaz', 'TV: {label}': 'TV: {label}', 'Start typing…': 'Yazmaya başlayın…',
    'Clear': 'Temizle', 'Next field': 'Sonraki alan', 'Enter': 'Enter', 'Text appears on the TV as you type.': 'Yazdıkça metin TV’de görünür.',
    'Add an app': 'Uygulama ekle', 'Add app': 'Uygulama ekle', 'Website or PWA address': 'Web sitesi veya PWA adresi', 'e.g. music.youtube.com': 'örn. music.youtube.com',
    '…or upload an .html file or a .zip web app': '…ya da bir .html dosyası veya .zip web uygulaması yükleyin', 'TV zoom': 'TV yakınlaştırma',
    'Enter an address or choose a file.': 'Bir adres girin veya dosya seçin.', '✓ Installed “{name}”. It\'s on the TV home screen.': '✓ “{name}” kuruldu. TV ana ekranında.',
    'Loading TV screen…': 'TV ekranı yükleniyor…', 'Connecting to the TV screen…': 'TV ekranına bağlanılıyor…',
    '▶ A video is playing on the TV.\nMirroring pauses during video to keep the Pi fast and cool. Use the Remote tab to control playback.':
      '▶ TV’de video oynatılıyor.\nPi’nin hızlı ve serin kalması için video sırasında yansıtma duraklatılır. Oynatmayı Kumanda sekmesinden kontrol edin.',
    '🎬 The media player is in front.\nUse the controls above.': '🎬 Medya oynatıcı açık.\nYukarıdaki kontrolleri kullanın.',
    '🎮 A game is running on the TV.\nMirroring pauses during games so they run smoothly. Use the Remote tab to play.': '🎮 TV’de bir oyun çalışıyor.\nOyunlar akıcı çalışsın diye yansıtma duraklatılır. Oynamak için Kumanda sekmesini kullanın.',
    'The TV browser isn\'t running yet…': 'TV tarayıcısı henüz çalışmıyor…',
    'Invalid or expired code': 'Geçersiz veya süresi dolmuş kod', '{err} — check the code on your TV.': '{err} — TV’deki kodu kontrol edin.',
    'This phone is no longer paired. Scan the pattern again.': 'Bu telefon artık eşli değil. Deseni yeniden okutun.', 'Pairing failed': 'Eşleme başarısız',

    // ---- games
    'Choose your driver': 'Sürücünü seç', 'Track': 'Pist', '◀ ▶ choose · ▲ ▼ switch row · <b>OK</b> start': '◀ ▶ seç · ▲ ▼ satır değiştir · <b>OK</b> başla',
    'The kart accelerates by itself: steer ◀ ▶, brake ▼, <b>OK</b> fires a turbo from an item box': 'Kart kendi hızlanır: ◀ ▶ direksiyon, ▼ fren, <b>OK</b> ödül kutusundan gelen turboyu ateşler',
    'Raspberry · balanced': 'Ahududu · dengeli', 'Lime · great grip': 'Misket limonu · iyi yol tutuş', 'Blueberry · top speed': 'Yaban mersini · en yüksek hız',
    'Plum · heavy & steady': 'Erik · ağır ve sağlam', 'Berry Valley': 'Ahududu Vadisi', 'Sunset Dunes': 'Gün Batımı Kumulları',
    'Paused': 'Duraklatıldı', 'OK to continue · Back to exit': 'Devam için OK · Çıkmak için Geri', 'OK: race again · ▲: menu · Back: exit': 'OK: tekrar yarış · ▲: menü · Geri: çıkış',
    '🏆 1st place!': '🏆 Birinci!', '🥈 2nd place': '🥈 İkinci', '🥉 3rd place': '🥉 Üçüncü', '4th place': 'Dördüncü',
    'Time {t} · Best {b} · 🍓 {n}': 'Süre {t} · En iyi {b} · 🍓 {n}', 'Lap {a}/{b}': 'Tur {a}/{b}', 'FINAL LAP': 'SON TUR', 'LAP {n}': 'TUR {n}', 'GO!': 'BAŞLA!',
    'Score {n}': 'Skor {n}', 'Best {n}': 'En iyi {n}', 'Score {n}  ·  Level {l}': 'Skor {n}  ·  Bölüm {l}',
    'Eat the raspberries, don\'t bite your tail.': 'Ahududuları ye, kuyruğunu ısırma.', '▲ ▼ ◀ ▶ steer · <b>OK</b> start · Back exit': '▲ ▼ ◀ ▶ yönlendir · <b>OK</b> başla · Geri çıkış',
    'Game over · {n} points': 'Oyun bitti · {n} puan', 'Clear every brick. Catch the ball!': 'Tüm tuğlaları kır. Topu kaçırma!',
    '◀ ▶ hold to move · <b>OK</b> launch · Back exit': '◀ ▶ basılı tutarak hareket · <b>OK</b> fırlat · Geri çıkış',
    'Slide with ◀ ▶ ▲ ▼.<br>Matching numbers merge.<br>Reach <b>2048</b> to win the golden berry!<br><br>⏯ Play: restart<br>Back: exit':
      '◀ ▶ ▲ ▼ ile kaydırın.<br>Aynı sayılar birleşir.<br>Altın ahududu için <b>2048</b>’e ulaşın!<br><br>⏯ Oynat: yeniden başlat<br>Geri: çıkış',
    'Game over': 'Oyun bitti', '{n} points': '{n} puan', '🏆 Golden berry!': '🏆 Altın ahududu!', 'You reached 2048': '2048’e ulaştınız', 'OK: new game · Back: exit': 'OK: yeni oyun · Geri: çıkış',
  };
  const DICTS = { en: {}, tr: TR };
  let lang = 'en';
  try { lang = localStorage.getItem('pv-lang') || (navigator.language || '').slice(0, 2); } catch (_) {}
  const q = location.search.match(/[?&]lang=([a-z]{2})/);           // games are opened with ?lang=xx by the TV
  if (q) { lang = q[1]; try { localStorage.setItem('pv-lang', lang); } catch (_) {} }
  if (!DICTS[lang]) lang = 'en';

  function t(key, vars) {
    let s = (DICTS[lang] && DICTS[lang][key]) || key;
    if (vars) for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
    return s;
  }
  function apply(root = document) {
    root.querySelectorAll('[data-i18n]').forEach((el) => { if (el.dataset.en == null) el.dataset.en = el.textContent.trim(); el.textContent = t(el.dataset.en); });
    root.querySelectorAll('[data-i18n-html]').forEach((el) => { if (el.dataset.en == null) el.dataset.en = el.innerHTML.trim(); el.innerHTML = t(el.dataset.en); });
    root.querySelectorAll('[data-i18n-ph]').forEach((el) => { if (el.dataset.enPh == null) el.dataset.enPh = el.placeholder; el.placeholder = t(el.dataset.enPh); });
    document.documentElement.lang = lang;
  }
  function set(l) {
    if (!DICTS[l] || l === lang) { apply(); return false; }
    lang = l; try { localStorage.setItem('pv-lang', l); } catch (_) {}
    apply(); dispatchEvent(new CustomEvent('pv-lang', { detail: l })); return true;
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', () => apply()); else apply();
  return { t, apply, set, get lang() { return lang; }, languages: [{ id: 'en', name: 'English' }, { id: 'tr', name: 'Türkçe' }] };
})();
const t = PVI18N.t;
