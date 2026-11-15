// In-app updates through the GitHub API, so they also work when the repository is private
// (with a token saved on the Pi). The actual update runs in system/update.sh via systemd-run,
// so it survives the PiVista server being restarted by the installer.
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const sys = require('./system');

const TOKEN_FILE = path.join(cfg.DATA_DIR, 'github-token');
const COMMIT_FILE = path.join(cfg.DATA_DIR, 'installed-commit');
const STATUS_FILE = path.join(cfg.DATA_DIR, 'update.status');
const LOG_FILE = path.join(cfg.DATA_DIR, 'update.log');
function defaults() {
  const env = {};
  try { for (const l of fs.readFileSync('/etc/default/pivista', 'utf8').split('\n')) { const m = l.match(/^\s*(PIVISTA_\w+)=["']?([^"'#\n]*)/); if (m) env[m[1]] = m[2].trim(); } } catch {}
  return { repo: env.PIVISTA_REPO || 'pyrz-tr/PiVista', branch: env.PIVISTA_BRANCH || 'claude/kind-mccarthy-xql5k2' };
}
const read = (f) => { try { return fs.readFileSync(f, 'utf8').trim(); } catch { return ''; } };
const token = () => process.env.GITHUB_TOKEN || read(TOKEN_FILE);

async function api(url, raw) {
  const t = token();
  const r = await fetch(url, { headers: { Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', 'User-Agent': 'PiVista-updater', ...(t ? { Authorization: `Bearer ${t}` } : {}) }, signal: AbortSignal.timeout(15000) });
  if (r.status === 404 || r.status === 401) throw new Error(t ? 'GitHub refused the token (check that it can read the repository)' : 'Repository not found: if it is private, add a GitHub access token');
  if (!r.ok) throw new Error(`GitHub error ${r.status}`);
  return raw ? r.text() : r.json();
}

async function check() {
  const { repo, branch } = defaults();
  const current = require('../package.json').version;
  const installed = read(COMMIT_FILE);
  const commit = await api(`https://api.github.com/repos/${repo}/commits/${encodeURIComponent(branch).replace(/%2F/g, '/')}`);
  let latest = current;
  try { latest = JSON.parse(await api(`https://api.github.com/repos/${repo}/contents/package.json?ref=${encodeURIComponent(branch)}`, true)).version; } catch {}
  const available = installed ? installed !== commit.sha : latest !== current;
  return { current, latest, available, commit: commit.sha.slice(0, 7), date: commit.commit && commit.commit.committer && commit.commit.committer.date, message: commit.commit && commit.commit.message.split('\n')[0], tokenSet: !!token() };
}

async function start() {
  try { fs.writeFileSync(STATUS_FILE, 'starting'); } catch {}
  const r = await sys.run('systemd-run', ['--unit=pivista-update-' + Date.now(), '--collect', '/opt/pivista/system/update.sh']);
  if (r == null) throw new Error('Could not start the updater');
  return { started: true };
}

function status() { return { status: read(STATUS_FILE) || 'idle', log: read(LOG_FILE).split('\n').slice(-6).join('\n'), tokenSet: !!token() }; }

function setToken(t) {
  t = String(t || '').trim();
  if (!t) { try { fs.unlinkSync(TOKEN_FILE); } catch {} return { tokenSet: false }; }
  if (!/^[A-Za-z0-9_]{20,255}$/.test(t)) throw new Error('That does not look like a GitHub token');
  fs.writeFileSync(TOKEN_FILE, t + '\n', { mode: 0o600 }); fs.chmodSync(TOKEN_FILE, 0o600);
  return { tokenSet: true };
}

module.exports = { check, start, status, setToken, tokenSet: () => !!token() };
