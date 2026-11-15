// Quick smoke test used by CI: boots the server on a spare port and checks the main endpoints.
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const port = 18000 + Math.floor(Math.random() * 1000);
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'pivista-'));
const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], {
  env: { ...process.env, PIVISTA_PORT: port, PIVISTA_DATA: data, PIVISTA_DEV: '1' }, stdio: 'inherit' });

const fail = (m) => { console.error('FAIL:', m); srv.kill(); process.exit(1); };
setTimeout(async () => {
  try {
    const base = `http://127.0.0.1:${port}`;
    const apps = await (await fetch(base + '/api/apps')).json();
    if (!apps.find((a) => a.id === 'youtube')) fail('apps');
    for (const p of ['/', '/tv/', '/tv/tv.js', '/remote/remote.js']) if (!(await fetch(base + p)).ok) fail(p);
    const svg = await (await fetch(base + '/api/pair/pattern.svg')).text();
    if (!svg.includes('<circle')) fail('pattern');
    const bad = await fetch(base + '/api/pair', { method: 'POST', body: JSON.stringify({ code: '000000' }) });
    if (bad.status !== 401) fail('pair should reject bad code');
    const hello = await (await fetch(base + '/api/hello')).json();
    if (!Array.isArray(hello.ips)) fail('hello');
    const up = await fetch(base + '/api/apps/install?name=a.html', { method: 'POST', body: '<p>x</p>' });
    if (up.status !== 401) fail('upload must require a paired token');
    if ((await fetch(base + '/userapps/u00000000/x')).status !== 404) fail('userapps 404');
    for (const p of ['/games/rally.html', '/games/snake.html', '/games/bricks.html', '/games/merge.html', '/games/common.js', '/games/render.js', '/shared/i18n.js', '/games/covers/rally.svg', '/shared/icons/games.svg', '/shared/logo.svg', '/shared/icons/youtube.svg', '/remote/manifest.webmanifest']) if (!(await fetch(base + p)).ok) fail(p);
    const z = await (await fetch(base + '/api/zoom?url=' + encodeURIComponent(base + '/tv/'))).json();
    if (z.zoom !== 1) fail('zoom for TV UI must be 1');
    console.log('selftest OK');
    srv.kill(); process.exit(0);
  } catch (e) { fail(e.message); }
}, 800);
