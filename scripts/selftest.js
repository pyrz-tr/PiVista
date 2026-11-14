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
    console.log('selftest OK');
    srv.kill(); process.exit(0);
  } catch (e) { fail(e.message); }
}, 800);
