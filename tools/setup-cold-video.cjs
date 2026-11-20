/* Cold-start check of the video installer on the REAL desktop, without bothering the user: the setup window is started through
   NoAct.exe (created at the bottom of the z-order, never activated), test mode keeps it off the taskbar, the mouse is never touched.
   Every run: fresh WebView2 profile, no WebView2 process left from the run before, the real setup\setup-runtime.ps1 + setup-web.ps1 of a
   package folder. Timing comes from the host log (setup-web.ps1 writes "cold-start mark=poster|frame1 ms=<since window shown>").
   node tools/setup-cold-video.cjs --root <package folder> [--runs 10] [--work H:\MeguLit-Work\setup-player\cold]
     [--flow <feed.json from setup-cold-feed.cjs>]   one full install against a local throttled source, screenshots per stage */
const fs = require('fs'), path = require('path'), cp = require('child_process'), http = require('http');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const ROOT = path.resolve(arg('root', 'H:/MeguLit-Work/setup-player/build/MeguLit')), RUNS = +arg('runs', 10), WORK = path.resolve(arg('work', 'H:/MeguLit-Work/setup-player/cold'));
const NOACT = process.env.MEGULIT_NOACT || 'H:/MeguLit-Work/overlay-place/rig/NoAct.exe', PS = path.join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJ = (u) => new Promise((res, rej) => http.get(u, (r) => { let d = ''; r.on('data', (x) => d += x); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej));
function killTree(pid) { try { cp.execFileSync('taskkill', ['/T', '/F', '/PID', String(pid)], { stdio: 'ignore' }); } catch (e) { /* gone */ } }
function killLeft() { /* WebView2 / PowerShell processes still running from this work folder */
  try { cp.execFileSync('powershell.exe', ['-NoProfile', '-Command', "$w='" + WORK.replace(/'/g, "''") + "';$r='" + ROOT.replace(/'/g, "''") + "';Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and @('powershell.exe','msedgewebview2.exe','NoAct.exe','cmd.exe') -contains $_.Name -and ($_.CommandLine.Contains($w) -or $_.CommandLine.Contains($r)) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"], { stdio: 'ignore' }); } catch (e) { /* none */ }
}
function start(i, extraEnv) {
  const dir = path.join(WORK, 'r' + i); fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); fs.mkdirSync(dir, { recursive: true });
  const port = 9500 + i;
  const env = Object.assign({}, process.env, { MEGULIT_SETUP_TEST: path.join(dir, 'events.log'), MEGULIT_SETUP_WEB: '1', MEGULIT_SETUP_WEB_HOLD: '1', MEGULIT_SETUP_UILOG: path.join(dir, 'ui.log'), MEGULIT_SETUP_WEBVIEW2_DATA: path.join(dir, 'wv2'), MEGULIT_SETUP_STAGING: path.join(dir, 'stage'), MEGULIT_SETUP_SUGGEST: ROOT,
    /* a window at the bottom of the z-order counts as occluded: keep it rendering so the timing is the real one */
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--disable-features=CalculateNativeWinOcclusion --disable-backgrounding-occluded-windows --remote-debugging-port=' + port }, extraEnv || {});
  const p = cp.spawn(NOACT, [PS, '-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA', '-File', path.join(ROOT, 'setup', 'setup-runtime.ps1'), '-Root', ROOT], { env, stdio: 'ignore', windowsHide: true });
  return { p, dir, port, log: path.join(dir, 'ui.log'), t0: Date.now() };
}
const read = (f) => { try { return fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''); } catch (e) { return ''; } };
const ms = (t, what) => { const m = new RegExp('cold-start mark=' + what + ' ms=(-?\\d+)').exec(t); return m ? +m[1] : null; };
async function cdpPage(port) {
  let list; for (let i = 0; i < 60; i++) { try { list = await getJ('http://127.0.0.1:' + port + '/json/list'); if (list.find((x) => x.type === 'page' && /megulit-setup/.test(x.url))) break; } catch (e) { /* wait */ } await sleep(250); }
  const t = list && list.find((x) => x.type === 'page' && /megulit-setup/.test(x.url)); if (!t) return null;
  const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => ws.onopen = r); let id = 0; const pend = new Map(); ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  const cdp = (method, params = {}) => new Promise((res) => { const k = ++id; pend.set(k, res); ws.send(JSON.stringify({ id: k, method, params })); });
  const ev = async (e) => { const r = await cdp('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result && r.result.result && r.result.result.value; };
  const shot = async (file) => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); if (r.result && r.result.data) fs.writeFileSync(file, Buffer.from(r.result.data, 'base64')); };
  return { ev, shot, close: () => { try { ws.close(); } catch (e) { /* gone */ } } };
}
async function coldRuns() {
  const res = [];
  for (let i = 1; i <= RUNS; i++) {
    killLeft(); await sleep(500);
    const r = start(i); let t = '', out = null;
    while (Date.now() - r.t0 < 90000) { await sleep(150); t = read(r.log); if (/cold-start mark=frame1/.test(t) || /classic window|result=fallback/.test(t)) break; }
    await sleep(400); t = read(r.log);
    const fb = /classic window|result=fallback/.test(t);
    out = { run: i, poster: ms(t, 'native-poster') !== null ? ms(t, 'native-poster') : ms(t, 'poster'), pagePoster: ms(t, 'poster'), frame1: ms(t, 'frame1'), fallback: fb, why: fb ? ((/reason="([^"]*)"/.exec(t) || [])[1] || (/classic window[^\n]*/.exec(t) || [''])[0]) : '' };
    out.blank = !fb && (out.poster === null && out.frame1 === null);
    /* boot steps, ms since the process was launched (spawn time here, `at=` epoch ms in the log) */
    out.boot = {}; for (const m of t.matchAll(/boot step=(\S+) since_proc=(-?\d+) at=(\d+)/g)) if (!(m[1] in out.boot)) out.boot[m[1]] = +m[3] - r.t0;
    out.splash = out.boot['splash-shown'] !== undefined ? out.boot['splash-shown'] : null; out.frame1Spawn = out.frame1 !== null && out.boot['skin-window-shown'] !== undefined ? out.boot['skin-window-shown'] + out.frame1 : null;
    { const pg = await cdpPage(r.port); if (pg) { if (i === 1) await pg.shot(path.join(WORK, 'cold-run1.png')); out.nav = await pg.ev('(()=>{const n=performance.getEntriesByType("navigation")[0]||{},p={};performance.getEntriesByType("paint").forEach(e=>p[e.name]=Math.round(e.startTime));return {fetchStart:Math.round(n.fetchStart||0),responseEnd:Math.round(n.responseEnd||0),domInteractive:Math.round(n.domInteractive||0),dcl:Math.round(n.domContentLoadedEventEnd||0),fp:p["first-paint"],fcp:p["first-contentful-paint"],poster:window.__posterAt,m:performance.getEntriesByType("mark").map(e=>e.name+":"+Math.round(e.startTime)).join(" "),res:performance.getEntriesByType("resource").filter(e=>/skin/.test(e.name)).map(e=>Math.round(e.startTime)+"-"+Math.round(e.responseEnd)).join(" ")}})()').catch(() => null); pg.close(); } }
    killTree(r.p.pid); killLeft();
    console.log(`run ${i}: splash ${out.splash} ms after launch; window->poster ${out.poster} ms, window->first video frame ${out.frame1} ms, launch->first video frame ${out.frame1Spawn} ms; boot ${JSON.stringify(out.boot)}${fb ? ' FALLBACK ' + out.why : ''}${out.blank ? ' BLANK' : ''}`);
    res.push(out);
  }
  const med = (k) => { const v = res.map((r) => r[k]).filter((x) => x !== null).sort((a, b) => a - b); return v.length ? v[Math.floor((v.length - 1) / 2)] : null; };
  const mx = (k) => Math.max(...res.map((r) => r[k] === null ? Infinity : r[k]));
  const sum = { splashMedian: med('splash'), splashMax: mx('splash'), launchToFrame1Median: med('frame1Spawn'), runs: RUNS, blank: res.filter((r) => r.blank).length, fallback: res.filter((r) => r.fallback).length, posterMedian: med('poster'), posterMax: mx('poster'), frame1Median: med('frame1'), frame1Max: mx('frame1'), runsDetail: res };
  fs.writeFileSync(path.join(WORK, 'cold.json'), JSON.stringify(sum, null, 1)); console.log(JSON.stringify({ ...sum, runsDetail: undefined }));
}
async function flow() {
  /* one install against a local throttled source (the package's setup\runtime.json was pointed at it by setup-cold-feed.cjs) */
  killLeft(); const shots = path.join(WORK, 'flow'); fs.mkdirSync(shots, { recursive: true });
  const r = start(99, { MEGULIT_SETUP_WEB_HOLD: '1' }); const pg = await cdpPage(r.port); if (!pg) throw new Error('no page');
  const wait = async (expr, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pg.ev(expr).catch(() => false)) return true; await sleep(200); } return false; };
  const st = () => pg.ev('JSON.stringify({s:Player.state,f:window.__playerFrame,sec:Scene.section})');
  await wait('window.Player&&Player.state.cur==="welcome"', 20000); await pg.shot(path.join(shots, '1-welcome.png')); console.log('welcome', await st());
  await wait('Player.state.cur==="loc"', 20000); await sleep(800); await pg.shot(path.join(shots, '2-loc.png')); console.log('loc', await st());
  await pg.ev('document.getElementById("install").click()');   /* a DOM click inside the page: no mouse */
  await wait('Player.state.cur==="field"', 20000); await sleep(4000); await pg.shot(path.join(shots, '3-field-early.png')); console.log('field', await st());
  await sleep(9000); await pg.shot(path.join(shots, '4-field-mid.png'));
  await pg.ev('void Scene.setTheme(true)'); await sleep(1500); await pg.shot(path.join(shots, '5-field-dark.png')); console.log('dark', await st());
  await sleep(6000); await pg.ev('void Scene.setTheme(false)'); await sleep(1200); await pg.shot(path.join(shots, '6-field-light-late.png'));
  await wait('Player.state.cur==="unpack"||Player.state.cur==="to-done"||Player.state.cur==="done"', 90000); await pg.shot(path.join(shots, '7-unpack.png')); console.log('unpack', await st());
  await wait('Player.state.cur==="done"', 90000); await sleep(1500); await pg.shot(path.join(shots, '8-done.png')); console.log('done', await st());
  const switches = await pg.ev('JSON.stringify(Player.log.filter(e=>e.k==="switch"||e.k==="want").map(e=>e.k+":"+(e.id||e.section)+(e.how?"/"+e.how:"")+"@"+e.t))'); console.log('timeline', switches);
  fs.writeFileSync(path.join(WORK, 'flow.json'), switches || '[]');
  pg.close(); killTree(r.p.pid); killLeft();
}
(async () => { fs.mkdirSync(WORK, { recursive: true }); if (arg('flow', false)) await flow(); else await coldRuns(); process.exit(0); })().catch((e) => { console.error(e); killLeft(); process.exit(1); });
