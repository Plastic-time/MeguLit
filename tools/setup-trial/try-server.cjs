/* MeguLit setup TRIAL: a runnable preview of the new installer interface on top of the real downloader.
   node tools/setup-trial/try-server.cjs [--home <dir>] [--rate <MB/s>] [--full] [--fixture <dir>] [--no-browser] [--port <n>]
   - serves setup/ui-web and a tiny JSON API; runs tools/setup-trial/try-engine.ps1 (the real MeguFetch engine) and shows its state
   - TRIAL SAFETY: installs only into <home>/try-install/MeguLit by default; refuses any folder that is, or lies inside, a real MeguLit install
     (E:\MeguLit, or any folder with MeguLit.exe); no registry, no uninstall entry, no Start menu entry; shortcuts only go to <home>/try-install/_trial-shortcuts
   - speed: by default the real sources are reached through a local throttle (about 15 MB/s over three listeners) so the ~590 MB download lasts about 40 s;
     --rate <MB/s> changes it, --full removes it.  Reset: tools/setup-trial/reset-trial.cmd (or --reset) wipes the trial folder and the resume cache. */
const http = require('http'), https = require('https'), fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const REPO = path.resolve(__dirname, '../..'), UI = path.join(REPO, 'setup/ui-web');
const HOME = path.resolve(arg('home', fs.existsSync('H:/MeguLit-Work/setup-ui-redesign') ? 'H:/MeguLit-Work/setup-ui-redesign' : path.join(REPO, '..'))), TRIAL = path.join(HOME, 'try-install'), DEFAULT_TARGET = path.join(TRIAL, 'MeguLit'), STATE_DIR = path.join(TRIAL, '_state');
const FULL = !!arg('full', false), FIXTURE = arg('fixture', '') === true ? '' : arg('fixture', '');
const STATE = path.join(STATE_DIR, 'state.json'), CMD = path.join(STATE_DIR, 'cmd.json');
let MANIFEST = FIXTURE ? path.join(FIXTURE, 'runtime.fixture.json') : path.join(REPO, 'setup/runtime.json');
fs.mkdirSync(STATE_DIR, { recursive: true });
let manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8').replace(/^﻿/, ''));
/* real mode: add the PUBLISHED app zip (latest GitHub release, the same asset the updater ships) as a fourth pack, so the trial folder gets a MeguLit.exe that can start */
if (!FIXTURE) {
  let rel = null; try { rel = JSON.parse(cp.execFileSync('curl.exe', ['-s', '--max-time', '10', '-H', 'User-Agent: megulit-setup-trial', 'https://api.github.com/repos/ilynthn/MeguLit/releases/latest'], { encoding: 'utf8' })); } catch (e) { /* offline: fall back */ }
  const a = rel && rel.assets && rel.assets.find((x) => /win-x64\.zip$/.test(x.name));
  const app = a ? { size: a.size, sha256: String(a.digest || '').replace(/^sha256:/, '').toUpperCase(), urls: [a.browser_download_url], tag: rel.tag_name }
    : { size: 30925549, sha256: '74DF832B19128135CA6BC3734787F2430EE7179A7FF79FCA6D645DE826F2740D', urls: ['https://github.com/ilynthn/MeguLit/releases/download/v1.4.19/MeguLit-v1.4.19-win-x64.zip'], tag: 'v1.4.19' };
  app.unpacked = Math.round(app.size * 1.62);
  if (!app.sha256) throw new Error('release asset has no digest, cannot verify the app zip');
  const merged = Object.assign({}, manifest, { packs: Object.assign({ app }, manifest.packs) }); MANIFEST = path.join(STATE_DIR, 'runtime.trial.json'); fs.writeFileSync(MANIFEST, JSON.stringify(merged, null, 1)); manifest = merged; console.log('published app', app.tag, app.size, 'bytes');
}
const packIds = ['app', 'base', 'reading', 'voice'].filter((k) => manifest.packs[k]);
const TOTAL = packIds.reduce((a, k) => a + manifest.packs[k].size, 0), RATE = (+arg('rate', 0) || TOTAL / 40 / 1048576) * 1048576;   /* default: the whole download lasts about 40 s */
const NEED = packIds.reduce((a, k) => a + manifest.packs[k].unpacked, 0) + packIds.reduce((a, k) => a + manifest.packs[k].size, 0);
function reset() { for (const p of [path.join(TRIAL, 'MeguLit'), path.join(TRIAL, '_state'), path.join(TRIAL, '_trial-shortcuts')]) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) { console.error('could not remove', p, e.message); } } console.log('trial folder and resume cache cleared'); }
if (process.argv.includes('--reset')) { reset(); process.exit(0); }
fs.mkdirSync(STATE_DIR, { recursive: true }); for (const f of [STATE, CMD]) { try { fs.rmSync(f, { force: true }); } catch (e) { /* ignore */ } }

/* ---- the folder guard: never the real install ---- */
const REAL = [process.env.MEGULIT_REAL_INSTALL || 'E:\\MeguLit'].map((p) => path.resolve(p).toLowerCase());
function guard(p) {
  const t = path.resolve(p).toLowerCase(); if (!path.isAbsolute(p)) return 'bad';
  for (const r of REAL) if (t === r || t.startsWith(r + path.sep)) return 'protected';
  if (t === path.resolve(DEFAULT_TARGET).toLowerCase()) return 'ok';   /* the trial's own folder may be reinstalled over, also after an interrupted run */
  try { if (fs.existsSync(path.join(p, 'MeguLit.exe')) && !fs.existsSync(path.join(p, '.megulit-trial'))) return 'protected'; } catch (e) { /* ignore */ }
  return 'ok';
}
function writable(p) { try { fs.mkdirSync(p, { recursive: true }); const f = path.join(p, '.w-' + process.pid); fs.writeFileSync(f, 'x'); fs.rmSync(f); return true; } catch (e) { return false; } }
function freeBytes(p) { let q = path.resolve(p); for (let i = 0; i < 6 && !fs.existsSync(q); i++) q = path.dirname(q); try { const s = fs.statfsSync(q); return s.bavail * s.bsize; } catch (e) { return 0; } }
function drives() { const out = []; for (const L of 'DEFGHIJKLMNOPQRSTUVWXYZ') { const root = L + ':\\'; try { if (fs.existsSync(root)) { const f = freeBytes(root); const pth = path.join(root, 'MeguLit-Trial'); if (guard(pth) === 'ok' && f > NEED * 1.1) out.push({ path: pth, free: f }); } } catch (e) { /* skip */ } } return out.slice(0, 3); }

/* ---- throttle: three local listeners, each rate/3, forwarding Range requests to the real sources (or to fixture files) ---- */
const listeners = []; const bucketRate = FULL ? 0 : RATE / 3;
function forward(req, res, port) {
  if (fs.existsSync(path.join(STATE_DIR, 'break.flag'))) { res.writeHead(503); return res.end(); }   /* test hook: simulate a dead network */
  const q = new URL(req.url, 'http://x'); const raw = q.searchParams.get('u') || ''; const url = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  if (FIXTURE) { const bn = path.basename(new URL(url).pathname); var fixtureFile = path.join(FIXTURE, bn); }
  const range = req.headers.range;
  const sendStream = (status, headers, stream) => {
    res.writeHead(status, headers);
    if (!bucketRate) { stream.pipe(res); return; }
    let allowance = bucketRate / 10, last = Date.now(); const pend = [];
    const pump = () => { const now = Date.now(); allowance = Math.min(bucketRate, allowance + (now - last) / 1000 * bucketRate); last = now; while (pend.length && allowance > 0) { const c = pend[0]; const n = Math.min(c.length, Math.max(1, Math.floor(allowance))); res.write(c.subarray(0, n)); allowance -= n; if (n < c.length) pend[0] = c.subarray(n); else pend.shift(); } if (pend.length) setTimeout(pump, 25); else if (ended) res.end(); else stream.resume(); };
    let ended = false; stream.on('data', (c) => { pend.push(c); if (pend.length > 24) stream.pause(); pump(); }); stream.on('end', () => { ended = true; if (!pend.length) res.end(); else pump(); }); stream.on('error', () => res.destroy());
    req.on('close', () => stream.destroy && stream.destroy());
  };
  if (FIXTURE || url.startsWith('file:') || /^[A-Za-z]:[\\/]/.test(url)) {
    const fp = FIXTURE ? fixtureFile : (url.startsWith('file:') ? decodeURIComponent(new URL(url).pathname.replace(/^[\/]/, '')) : url); const sz = fs.statSync(fp).size; let a = 0, b = sz - 1, status = 200;
    if (range) { const m = /bytes=(\d+)-(\d*)/.exec(range); if (m) { a = +m[1]; b = m[2] ? Math.min(+m[2], sz - 1) : sz - 1; status = 206; } }
    const h = { 'Content-Length': b - a + 1, 'Accept-Ranges': 'bytes', 'Content-Type': 'application/octet-stream' }; if (status === 206) h['Content-Range'] = `bytes ${a}-${b}/${sz}`;
    sendStream(status, h, fs.createReadStream(fp, { start: a, end: b })); return;
  }
  const go = (u, hops) => {
    const lib = u.startsWith('https') ? https : http;
    const r = lib.get(u, { headers: Object.assign({ 'User-Agent': 'MeguLit-setup-trial' }, range ? { Range: range } : {}) }, (up) => {
      if ([301, 302, 303, 307, 308].includes(up.statusCode) && up.headers.location && hops < 6) { up.resume(); go(new URL(up.headers.location, u).toString(), hops + 1); return; }
      const h = {}; for (const k of ['content-length', 'content-range', 'accept-ranges', 'content-type']) if (up.headers[k]) h[k] = up.headers[k]; sendStream(up.statusCode, h, up);
    }); r.on('error', () => { try { res.writeHead(502); res.end(); } catch (e) { /* closed */ } }); req.on('close', () => r.destroy());
  };
  go(url, 0);
}
function startProxies() { return Promise.all([0, 1, 2].map((i) => new Promise((ok) => { const s = http.createServer((req, res) => forward(req, res, i)); s.listen(0, '127.0.0.1', () => { listeners.push(s); ok(s.address().port); }); }))); }

/* ---- engine process ---- */
let engine = null, proxyPorts = [], lastTarget = DEFAULT_TARGET;
function spawnEngine() {
  if (engine && !engine.killed) return;
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'try-engine.ps1'), '-Root', REPO, '-Target', DEFAULT_TARGET, '-State', STATE, '-Cmd', CMD, '-ManifestPath', MANIFEST];
  if (!arg('prefetch', false)) args.push('-WaitConfirm');
  if (!FULL || FIXTURE) args.push('-Proxy', proxyPorts.map((p) => 'http://127.0.0.1:' + p).join(','));
  try { fs.rmSync(STATE, { force: true }); } catch (e) { /* ignore */ }
  engine = cp.spawn('powershell.exe', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); engine.stderr.on('data', (d) => process.stderr.write('[engine] ' + d)); engine.stdout.on('data', (d) => process.stdout.write('[engine] ' + d));
  engine.on('exit', () => { engine = null; });
}
function stopEngine() { if (engine) { try { cp.execFileSync('taskkill', ['/T', '/F', '/PID', String(engine.pid)], { stdio: 'ignore' }); } catch (e) { /* gone */ } engine = null; } }
const send = (obj) => fs.writeFileSync(CMD, JSON.stringify(obj));
const readState = () => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { return null; } };

/* ---- HTTP ---- */
let lastConfirm = null, launched = null, browser = null, lastBeat = Date.now(), beaten = false;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css' };
function json(res, o, code) { res.writeHead(code || 200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o)); }
function body(req) { return new Promise((ok) => { let d = ''; req.on('data', (c) => d += c); req.on('end', () => { try { ok(JSON.parse(d || '{}')); } catch (e) { ok({}); } }); }); }
function check(p) { const g = guard(p); if (g !== 'ok') return { state: g, free: 0, need: NEED }; if (!writable(p)) return { state: 'readonly', free: 0, need: NEED }; return { state: 'ok', free: freeBytes(p), need: NEED }; }
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api/info') return json(res, { trial: true, defaultTarget: DEFAULT_TARGET, drives: drives(), need: NEED, rate: FULL ? 0 : RATE, fixture: !!FIXTURE, check: check(DEFAULT_TARGET) });
  if (u.pathname === '/api/state') { lastBeat = Date.now(); beaten = true; return json(res, readState() || { phase: 'probe', n: 0, st: '', fr: [] }); }
  if (u.pathname === '/api/act' && req.method === 'POST') {
    const m = await body(req);
    switch (m.type) {
      case 'checkpath': return json(res, check(m.path || DEFAULT_TARGET));
      case 'install': { const c = check(m.path); if (c.state !== 'ok') return json(res, c); lastTarget = m.path; lastConfirm = { confirm: true, target: m.path, desktop: m.desktop, menu: m.menu }; send(lastConfirm); return json(res, c); }
      case 'retry': stopEngine(); spawnEngine(); if (lastConfirm) setTimeout(() => send(lastConfirm), 800); return json(res, { ok: true });
      case 'browse': { const ps = "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object Windows.Forms.FolderBrowserDialog; $d.Description = 'Choose the trial install folder'; if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath }"; return cp.execFile('powershell.exe', ['-NoProfile', '-STA', '-Command', ps], (e, out) => json(res, { path: (out || '').trim() })); }
      case 'copylog': { let t = 'MeguLit setup trial\r\n'; try { t += fs.readFileSync(path.join(STATE_DIR, 'setup-download.log'), 'utf8').slice(-12000); } catch (e) { t += '(no log yet)'; } const s = readState(); if (s && s.message) t = s.message + '\r\n' + t; const clip = cp.spawn('clip.exe'); clip.stdin.end(Buffer.from('\ufeff' + t, 'utf16le')); return json(res, { ok: true }); }
      case 'manual': cp.exec('start "" https://megulit.com'); return json(res, { ok: true });
      case 'launch': {
        /* start the installed copy from the TRIAL folder, side by side, never the real install */
        const exe = path.join(lastTarget, 'MeguLit.exe'); const g = guard(lastTarget);
        if (!fs.existsSync(exe) || !fs.existsSync(path.join(lastTarget, '.megulit-trial')) || path.resolve(lastTarget).toLowerCase().startsWith('e:\megulit')) { cp.exec(`explorer "${lastTarget}"`); return json(res, { ok: false, opened: 'folder' }); }
        try { launched = cp.spawn(exe, [], { cwd: lastTarget, detached: true, stdio: 'ignore', env: Object.assign({}, process.env, { MEGULIT_SIDE_BY_SIDE: '1' }) }); launched.unref(); fs.writeFileSync(path.join(STATE_DIR, 'launched.json'), JSON.stringify({ pid: launched.pid, exe, time: new Date().toISOString() })); return json(res, { ok: true, pid: launched.pid }); } catch (e) { return json(res, { ok: false, error: String(e) }); }
      }
      case 'minimize': cp.execFile('powershell.exe', ['-NoProfile', '-Command', "Add-Type -Name W -Namespace T -MemberDefinition '[DllImport(\"user32.dll\")] public static extern bool ShowWindow(IntPtr h, int c);[DllImport(\"user32.dll\")] public static extern IntPtr FindWindow(string c, string t);'; $h = [T.W]::FindWindow($null, 'MeguLit installer (trial)'); if ($h -ne [IntPtr]::Zero) { [void][T.W]::ShowWindow($h, 6) }"], () => {}); return json(res, { ok: true });
      case 'close': json(res, { ok: true }); return setTimeout(shutdown, 150);
      default: return json(res, { ok: true });
    }
  }
  let f = u.pathname === '/' ? '/index.html' : u.pathname; f = path.join(UI, decodeURIComponent(f)); if (!f.startsWith(UI)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end('not found'); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(d); });
});
function shutdown() { stopEngine(); try { if (browser) cp.execFileSync('taskkill', ['/T', '/F', '/PID', String(browser.pid)], { stdio: 'ignore' }); } catch (e) { /* gone */ } listeners.forEach((l) => l.close()); server.close(); process.exit(0); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
setInterval(() => { if (beaten && Date.now() - lastBeat > 20000) shutdown(); }, 3000);   /* the window is gone */

(async () => {
  proxyPorts = await startProxies();
  const port = await new Promise((ok) => server.listen(+arg('port', 0) || 0, '127.0.0.1', () => ok(server.address().port)));
  const url = `http://127.0.0.1:${port}/index.html?host=1&desk=1&theme=${arg('theme', 'edge') === 'night' ? 'night' : 'edge'}${arg('lang', '') === 'en' ? '&lang=en' : ''}`;
  spawnEngine();
  fs.writeFileSync(path.join(STATE_DIR, 'server.json'), JSON.stringify({ port, url, pid: process.pid }));
  console.log('MeguLit setup trial on', url, FULL ? '(full speed)' : `(throttled to ${(RATE / 1048576).toFixed(0)} MB/s)`, '\ninstall folder (trial):', DEFAULT_TARGET);
  if (!arg('no-browser', false)) {
    /* real frameless window: a WinForms form with a WebView2 control (no system title bar); falls back to an Edge/Chrome app window only with --appwindow */
    const dll = arg('hostdll', path.join(REPO, 'setup/webview2')), nativeUrl = url + '&native=1';
    if (!arg('appwindow', false) && fs.existsSync(path.join(dll, 'Microsoft.Web.WebView2.Core.dll'))) {
      const hargs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA', '-File', path.join(__dirname, 'try-host.ps1'), '-Url', nativeUrl, '-DllDir', dll, '-UserData', path.join(STATE_DIR, 'webview2'), '-Icon', path.join(REPO, 'setup/logo.png'), '-Log', path.join(STATE_DIR, 'host.log')];
      browser = cp.spawn('powershell.exe', hargs, { windowsHide: true, stdio: 'ignore' }); browser.on('exit', () => setTimeout(shutdown, 300)); fs.writeFileSync(path.join(STATE_DIR, 'host.pid'), String(browser.pid));
    } else {
      const cands = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].filter(fs.existsSync);
      if (cands.length) { browser = cp.spawn(cands[0], ['--app=' + url, '--window-size=1064,730', '--user-data-dir=' + path.join(STATE_DIR, 'browser'), '--no-first-run'], { stdio: 'ignore' }); browser.on('exit', () => setTimeout(shutdown, 300)); }
      else console.log('no frameless host and no Edge/Chrome found: open', url, 'in a browser');
    }
  }
})();
