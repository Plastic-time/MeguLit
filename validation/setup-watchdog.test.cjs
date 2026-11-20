// SPDX-License-Identifier: GPL-3.0-or-later
// The setup window's watchdog (setup\setup-web.ps1): the page has to report its first video frame in time; a page that comes up but
// never shows video (MEGULIT_SETUP_WEB_TEST=stall) is reloaded once, then the classic window takes over. A healthy page never trips it.
// Real setup-runtime.ps1 + WebView2 on HidDesk's hidden desktop (nothing on the user's screen).
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), { spawn, execFileSync } = require('node:child_process');
const repo = path.join(__dirname, '..');
const hiddesk = process.env.MEGULIT_HIDDESK || 'E:\\Apps\\megu-testbed\\HidDesk.exe';
const tmpBase = process.env.MEGULIT_TEST_TMP || (fs.existsSync('H:/MeguLit-Work') ? (fs.mkdirSync('H:/MeguLit-Work/tmp', { recursive: true }), path.resolve('H:/MeguLit-Work/tmp')) : require('node:os').tmpdir());
const skip = process.platform !== 'win32' || !fs.existsSync(hiddesk) ? 'needs Windows and HidDesk.exe' : !fs.existsSync(path.join(repo, 'setup', 'webview2', 'Microsoft.Web.WebView2.Core.dll')) ? 'needs the WebView2 wrapper DLLs' : !fs.existsSync(path.join(repo, 'setup', 'ui-web', 'video', 'light', 'manifest.json')) ? 'needs the rendered videos' : false;
const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function fakeRoot(dir) {
  fs.cpSync(path.join(repo, 'setup'), path.join(dir, 'setup'), { recursive: true }); fs.writeFileSync(path.join(dir, 'MeguLit.exe'), 'not a real exe');
  for (const f of ['node.exe', 'python/python.exe', 'python/Lib/zipfile/__init__.py', 'python/Lib/encodings/__init__.py', 'reading/sudachidict_full/resources/system.dic', 'aivis/run.exe']) { const p = path.join(dir, 'runtime', f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, ''); }
  return dir;
}
const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
async function run(sim, until, ms) {
  const work = fs.mkdtempSync(path.join(tmpBase, 'msw-')), root = fakeRoot(path.join(work, 'MeguLit')), ui = path.join(work, 'ui.log'), ev = path.join(work, 'events.log');
  const env = { ...process.env, MEGULIT_SETUP_TEST: ev, MEGULIT_SETUP_WEB: '1', MEGULIT_SETUP_WEB_HOLD: '1', MEGULIT_SETUP_UILOG: ui, MEGULIT_SETUP_WEBVIEW2_DATA: path.join(work, 'wv2'), MEGULIT_SETUP_STAGING: path.join(work, 'stage'), MEGULIT_SETUP_SUGGEST: root, MEGULIT_SETUP_WATCHDOG_MS: '5000',
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--disable-features=CalculateNativeWinOcclusion --disable-backgrounding-occluded-windows' };
  if (sim) env.MEGULIT_SETUP_WEB_TEST = sim; else delete env.MEGULIT_SETUP_WEB_TEST;
  const out = await new Promise((ok) => { const p = spawn(hiddesk, ['run', ps, '-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA', '-File', path.join(root, 'setup', 'setup-runtime.ps1'), '-Root', root], { env, windowsHide: true }); let o = ''; p.stdout.on('data', (d) => o += d); p.on('exit', () => setTimeout(() => ok(o), 300)); });
  const pid = +out.trim().split(/\s+/)[0]; assert.ok(pid > 0, 'HidDesk run failed: ' + out);
  const t0 = Date.now(); let text = '';
  while (Date.now() - t0 < ms) { text = read(ui) + '\n' + read(ev); if (until(text)) break; await sleep(250); }
  await sleep(500); text = read(ui) + '\n' + read(ev);
  try { execFileSync('taskkill', ['/T', '/F', '/PID', String(pid)], { stdio: 'ignore' }); } catch { /* gone */ }
  await sleep(800); try { fs.rmSync(work, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); } catch { /* WebView2 still closing */ }
  return text;
}

test('a page that never shows video is reloaded once, then the classic window takes over', { skip, timeout: 120000 }, async () => {
  const t = await run('stall', (x) => /watchdog: still no video frame/.test(x) && /classic|fallback/.test(x), 90000);
  assert.match(t, /watchdog: no video frame within 5000 ms, reloading the page/);
  assert.match(t, /watchdog: still no video frame after a reload, using the classic window/);
  assert.match(t, /falling back to the classic window|classic window \(skin not available\)/);
});

test('a healthy page reports its first video frame and the watchdog stays quiet', { skip, timeout: 120000 }, async () => {
  const t = await run('', (x) => /cold-start mark=frame1/.test(x), 60000);
  assert.match(t, /cold-start mark=frame1/);
  assert.doesNotMatch(t, /watchdog:/);
});
