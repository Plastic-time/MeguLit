/* End-to-end check of the trial in a headless Chrome (nothing appears on the desktop): the real engine downloads a fixture package set
   through the throttle, the page is driven like a user would (press Install, close during the download, reopen and resume).
   node tools/setup-trial/try-test.cjs <fixtureDir> <testHome> [rateMBps] */
const { spawn, execFileSync } = require('child_process'), fs = require('fs'), path = require('path'), http = require('http');
const FIX = path.resolve(process.argv[2]), HOME = path.resolve(process.argv[3]), RATE = process.argv[4] || '24';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe', SERVER = path.join(__dirname, 'try-server.cjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) => http.get(u, (r) => { let d = ''; r.on('data', (x) => d += x); r.on('end', () => res(d)); }).on('error', rej));
const shots = path.join(HOME, 'shots'); fs.mkdirSync(shots, { recursive: true });
async function session(name, body) {
  const srv = spawn(process.execPath, [SERVER, '--fixture', FIX, '--home', HOME, '--rate', RATE, '--no-browser', '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] }); let out = ''; srv.stdout.on('data', (d) => out += d); srv.stderr.on('data', (d) => out += d);
  let url = null; for (let i = 0; i < 100 && !url; i++) { await sleep(300); const m = /on (http:\/\/127\.0\.0\.1:\d+\/index\.html\?[^\s]+)/.exec(out); if (m) url = m[1]; }
  if (!url) throw new Error('server did not start: ' + out);
  const dir = fs.mkdtempSync(path.join(HOME, 'chrome-')), port = 9500 + Math.floor(Math.random() * 300);
  const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + dir, '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio', '--window-size=1064,730', 'about:blank'], { stdio: 'ignore' });
  let list; for (let i = 0; i < 60; i++) { try { list = JSON.parse(await get(`http://127.0.0.1:${port}/json/list`)); if (list.find((x) => x.type === 'page')) break; } catch (e) { /* wait */ } await sleep(200); }
  const ws = new WebSocket(list.find((x) => x.type === 'page').webSocketDebuggerUrl); await new Promise((r) => ws.onopen = r);
  let id = 0; const pend = new Map(); ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  const cdp = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result && r.result.result && r.result.result.value; };
  const shot = async (f) => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(shots, name + '-' + f + '.png'), Buffer.from(r.result.data, 'base64')); };
  await cdp('Page.enable'); await cdp('Emulation.setDeviceMetricsOverride', { width: 1064, height: 730, deviceScaleFactor: 1, mobile: false }); await cdp('Page.navigate', { url });
  const base = url.replace(/\/index\.html.*/, '');
  const state = async () => JSON.parse(await get(base + '/api/state'));
  const ctx = { ev, shot, state, sleep, base, srv, log: (...a) => console.log('[' + name + ']', ...a) };
  try { await body(ctx); } finally { ws.close(); ch.kill(); try { await get(base + '/api/info'); await fetch(base + '/api/act', { method: 'POST', body: JSON.stringify({ type: 'close' }) }); } catch (e) { /* gone */ } await sleep(800); try { srv.kill(); } catch (e) { /* gone */ } await sleep(300); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* busy */ } }
}
const waitFor = async (fn, ms, what) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(400); } throw new Error('timeout waiting for ' + what); };
(async () => {
  try { fs.rmSync(path.join(HOME, 'try-install'), { recursive: true, force: true }); } catch (e) { /* new */ }
  await session('run1-normal', async (c) => {
    await waitFor(async () => (await c.ev('window.Scene && Scene.section')) === 'loc', 30000, 'location screen'); c.log('location screen reached'); await c.sleep(1500); await c.shot('1-location');
    const info = JSON.parse(await get(c.base + '/api/info')); c.log('default target', info.defaultTarget);
    await c.ev("document.getElementById('install').click()"); c.log('install pressed');
    await waitFor(async () => (await c.state()).got > 15e6, 40000, 'download bytes'); await c.sleep(2500); const s1 = await c.state(); c.log('mid download', JSON.stringify({ phase: s1.phase, got: s1.got, speed: s1.speed, src: s1.src, srcN: s1.srcN, done: (s1.st.match(/2/g) || []).length, running: (s1.st.match(/1/g) || []).length, n: s1.n })); await c.shot('2-downloading');
    const dn = await waitFor(async () => { const s = await c.state(); return s.phase === 'unpack' || s.phase === 'done' ? s : null; }, 180000, 'unpack'); c.log('phase', dn.phase); await c.shot('3-unpack');
    await waitFor(async () => (await c.state()).phase === 'done', 120000, 'done'); await c.sleep(6500); await c.shot('4-done'); c.log('section', await c.ev('Scene.section'));
    const root = info.defaultTarget; const has = ['base', 'reading', 'voice'].map((k) => fs.existsSync(path.join(root, 'runtime', k, 'README.txt'))); c.log('unpacked folders present', JSON.stringify(has)); if (!has.every(Boolean)) throw new Error('unpack incomplete');
    c.log('real E:\\MeguLit touched? ', fs.existsSync('E:\\MeguLit') ? 'exists (not written by the trial)' : 'absent');
  });
  try { fs.rmSync(path.join(HOME, 'try-install'), { recursive: true, force: true }); } catch (e) { /* new */ }
  let gotBefore = 0;
  await session('run2-close-resume', async (c) => {
    await waitFor(async () => (await c.ev('window.Scene && Scene.section')) === 'loc', 30000, 'location screen');
    await c.ev("document.getElementById('install').click()");
    await waitFor(async () => (await c.state()).got > 60e6, 60000, 'some download'); await c.sleep(600);
    await c.ev("document.getElementById('btnClose').click()"); await c.sleep(1200); await c.shot('1-close-confirm'); const q = await c.ev("getComputedStyle(document.getElementById('ui-quit')).visibility"); c.log('close confirm visible:', q);
    const s = await c.state(); gotBefore = s.got; c.log('closing at', (s.got / 1048576).toFixed(0), 'MB');
    await c.ev("document.getElementById('leave').click()"); await c.sleep(2500);
  });
  await session('run2b-resume', async (c) => {
    await waitFor(async () => (await c.ev('window.Scene && Scene.section')) === 'loc', 30000, 'location screen');
    const s0 = await waitFor(async () => { const s = await c.state(); return s.n && s.got > 0 ? s : null; }, 20000, 'resumed state'); c.log('after reopening, already have', (s0.got / 1048576).toFixed(0), 'MB (was', (gotBefore / 1048576).toFixed(0), 'MB when closed), resumed flag:', s0.resumed); await c.shot('2-reopened-keeps-progress');
    await c.ev("document.getElementById('install').click()");
    await waitFor(async () => (await c.state()).phase === 'done', 240000, 'done after resume'); await c.sleep(6500); await c.shot('3-done-after-resume');
    const root = path.join(HOME, 'try-install', 'MeguLit'); const has = ['base', 'reading', 'voice'].map((k) => fs.existsSync(path.join(root, 'runtime', k, 'README.txt'))); c.log('unpacked folders present', JSON.stringify(has)); if (!has.every(Boolean)) throw new Error('unpack incomplete after resume');
  });
  console.log('ALL TRIAL TESTS PASSED');
  process.exit(0);
})().catch((e) => { console.error('TRIAL TEST FAILED', e); process.exit(1); });
