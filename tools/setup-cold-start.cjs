/* Cold-start regression check for the new setup interface (setup\setup-web.ps1 + setup\ui-web).
   Every run is a real cold start: its own WebView2 user-data folder, its own browser processes, the real setup-runtime.ps1 of a release package on HidDesk's
   hidden desktop. The verdict is data, not screenshots: the page measures its canvas and renderer, the host writes one line to a per-run log
       cold-start attempt=N result=ok|blank|degraded|fallback ms=<window shown -> scene confirmed> renderer="..." std=<pixel spread> errs=<GL errors>
   and this tool only waits for that line, kills the run and starts the next. Parallel runs also model a busy machine.
   node tools/setup-cold-start.cjs [--runs 30] [--parallel 5] [--root <release package folder>] [--work E:\try\cold] [--sim nogl|boom|slow|nodll|noruntime] [--keep]
   Pass criterion for the real interface: every run is "ok". With --sim the expected result is "fallback". */
const fs = require('fs'), path = require('path'), cp = require('child_process');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const RELEASE = !!arg('release', false), REAL = !!arg('real-desktop', false), RUNS = +arg('runs', 30), PAR = Math.max(1, +arg('parallel', 5)), WORK = path.resolve(arg('work', 'E:\\try\\cold')), SIM = arg('sim', ''), KEEP = !!arg('keep', false);
const REPO = path.resolve(__dirname, '..'), HID = process.env.MEGULIT_HIDDESK || 'E:\\Apps\\megu-testbed\\HidDesk.exe';
const ROOT = path.resolve(arg('root', path.join(WORK, 'root')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function killOrphans() { /* leftovers of an earlier (crashed) run: anything started from this tool's work folder, never node itself */
  try { cp.execFileSync('powershell.exe', ['-NoProfile', '-Command', "$w = '" + WORK.replace(/'/g, "''") + "'; Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.Name -ne 'node.exe' -and $_.ProcessId -ne $PID -and $_.CommandLine.Contains($w) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"], { windowsHide: true, stdio: 'ignore' }); } catch (e) { /* none */ }
}
function prepareRoot() {
  killOrphans();
  /* a package folder (MeguLit.exe, web\about.js, ...) with the repo's current setup\ on top and empty runtime marker files, so no pack has to be downloaded */
  if (!fs.existsSync(path.join(ROOT, 'MeguLit.exe'))) { const src = arg('package', 'E:\\try\\smoke-1.4.20\\MeguLit'); if (!fs.existsSync(path.join(src, 'MeguLit.exe'))) throw new Error('no package folder: pass --root <folder with MeguLit.exe> or --package <release package folder>'); fs.mkdirSync(path.dirname(ROOT), { recursive: true }); fs.cpSync(src, ROOT, { recursive: true }); }
  if (!arg('no-overlay', false)) { fs.rmSync(path.join(ROOT, 'setup'), { recursive: true, force: true }); fs.cpSync(path.resolve(arg('setup-src', path.join(REPO, 'setup'))), path.join(ROOT, 'setup'), { recursive: true }); }
  const s = fs.readFileSync(path.join(ROOT, 'setup', 'setup-runtime.ps1'), 'utf8'); const m = /\$markers = @\{([^\n]*)\}/.exec(s); const files = new Set((m ? m[1] : '').match(/runtime\\[A-Za-z0-9_.\\-]+/g) || []);
  for (const f of ['runtime\\node.exe', 'runtime\\python\\python.exe', 'runtime\\python\\Lib\\zipfile\\__init__.py', 'runtime\\python\\Lib\\encodings\\__init__.py', 'runtime\\reading\\sudachidict_full\\resources\\system.dic', 'runtime\\aivis\\run.exe']) files.add(f);
  for (const f of files) { const p = path.join(ROOT, f); fs.mkdirSync(path.dirname(p), { recursive: true }); if (!fs.existsSync(p)) fs.writeFileSync(p, ''); }
}

/* --release: the package is used exactly as shipped (no overlay, it has no cold-start line): the verdict is read from the page over the debug port instead */
const http = require('http');
const getJ = (u) => new Promise((res, rej) => http.get(u, (r) => { let d = ''; r.on('data', (x) => d += x); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej));
async function probePage(port, waitMs) {
  let list; for (let i = 0; i < 100; i++) { try { list = await getJ('http://127.0.0.1:' + port + '/json/list'); if (list.find((x) => x.type === 'page' && /megulit-setup/.test(x.url))) break; } catch (e) { /* wait */ } await sleep(300); }
  const t = list && list.find((x) => x.type === 'page' && /megulit-setup/.test(x.url)); if (!t) return null;
  const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => ws.onopen = r); let id = 0; const pend = new Map(); ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  const ev = (e) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: e, awaitPromise: true, returnByValue: true } })); }).then((r) => r.result && r.result.result && r.result.result.value);
  await sleep(waitMs);
  const code = "(function(){var o={gl:!!(window.GL&&GL.ok),dom:!document.getElementById('gl'),std:-1,renderer:'?'};try{var g=document.getElementById('gl');if(g){var x=g.getContext('webgl2')||g.getContext('webgl');var ex=x&&x.getExtension('WEBGL_debug_renderer_info');if(ex)o.renderer=String(x.getParameter(ex.UNMASKED_RENDERER_WEBGL)).slice(0,80);var c=document.createElement('canvas');c.width=48;c.height=30;var c2=c.getContext('2d');c2.drawImage(g,0,0,48,30);var d=c2.getImageData(0,0,48,30).data,m=0,n=d.length/4,i;for(i=0;i<d.length;i+=4)m+=d[i]+d[i+1]+d[i+2];m/=n*3;var v=0;for(i=0;i<d.length;i+=4){var a=(d[i]+d[i+1]+d[i+2])/3-m;v+=a*a}o.std=+Math.sqrt(v/n).toFixed(2)}}catch(e){o.err=String(e)}return JSON.stringify(o)})()";
  const out = JSON.parse(await ev(code) || '{}'); try { ws.close(); } catch (e) { /* ignore */ } return out;
}
function killTree(pid) { try { cp.execFileSync('taskkill', ['/T', '/F', '/PID', String(pid)], { windowsHide: true, stdio: 'ignore' }); } catch (e) { /* gone */ } }
function readLine(log) { try { const t = fs.readFileSync(log, 'utf8').replace(/^\uFEFF/, ''); const all = t.split(/\r?\n/).filter((x) => /cold-start /.test(x)); const fin = all.filter((x) => !/result=retry/.test(x)).pop(); return fin ? { line: fin, retries: all.filter((x) => /result=retry/.test(x)).length } : null; } catch (e) { return null; } }
function parse(line) { const o = {}; const re = /(\w+)=("([^"]*)"|\S+)/g; let m; while ((m = re.exec(line))) o[m[1]] = m[3] !== undefined ? m[3] : m[2]; return o; }
async function oneRun(i) {
  let dir = path.join(WORK, 'r' + i); try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 300 }); } catch (e) { /* busy: use a fresh name */ } const dirOk = !fs.existsSync(dir) || fs.readdirSync(dir).length === 0; if (!dirOk) { dir = path.join(WORK, 'r' + i + '-' + Date.now()); } fs.mkdirSync(dir, { recursive: true });
  const log = path.join(dir, 'ui.log'); if (RELEASE) { try { fs.rmSync(path.join(process.env.LOCALAPPDATA, 'MeguLit', 'setup-ui.log'), { force: true }); } catch (e) { /* none */ } }
  const env = { MEGULIT_SETUP_TEST: path.join(dir, 'events.log'), MEGULIT_SETUP_WEB: '1', MEGULIT_SETUP_UILOG: log, MEGULIT_SETUP_WEBVIEW2_DATA: path.join(dir, 'wv2'), MEGULIT_SETUP_STAGING: path.join(dir, 'stage') };
  if (SIM) env.MEGULIT_SETUP_WEB_TEST = SIM;
  if (arg('query', '')) env.MEGULIT_SETUP_WEB_QUERY = arg('query', '');
  if (RELEASE) { delete env.MEGULIT_SETUP_UILOG; delete env.MEGULIT_SETUP_WEBVIEW2_DATA; env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=' + (9400 + (i % 50)); }
  const cmd = path.join(dir, 'run.cmd'); fs.writeFileSync(cmd, ['@echo off', ...Object.entries(env).map(([k, v]) => `set "${k}=${v}"`), `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${path.join(ROOT, 'setup', 'setup-runtime.ps1')}" -Root "${ROOT}"`, ''].join('\r\n'));
  const t0 = Date.now(); let pid = 0, h; if (REAL) { /* the user's own desktop (only with --real-desktop, and only when the user agreed): a normal process */ h = cp.spawn('cmd.exe', ['/c', cmd], { stdio: 'ignore', windowsHide: true }); pid = h.pid; } else { h = cp.spawn(HID, ['run', cmd], { windowsHide:true, stdio: ['ignore', 'pipe', 'ignore'] }); h.stdout.on('data', (d) => { const m = /(\d+)/.exec(String(d)); if (m && !pid) pid = +m[1]; }); }
  let line = null;
  if (RELEASE) {
    const UL = path.join(process.env.LOCALAPPDATA, 'MeguLit', 'setup-ui.log'); const port = 9400 + (i % 50);
    const t1 = Date.now(); let sawSkin = false, fb = false; while (Date.now() - t1 < 60000 && !sawSkin && !fb) { await sleep(300); const t = fs.existsSync(UL) ? fs.readFileSync(UL, 'utf8') : ''; sawSkin = /web skin active/.test(t); fb = /classic window/.test(t); }
    let res = 'fallback', info = {}; if (sawSkin) { info = await probePage(port, 3500) || {}; res = info.dom ? 'degraded' : info.std >= 0 && info.std < 4 ? 'blank' : info.gl ? 'ok' : 'degraded'; }
    line = { line: 'cold-start attempt=1 result=' + res + ' ms=' + (Date.now() - t0) + ' renderer="' + (info.renderer || '?') + '" std=' + (info.std === undefined ? '' : info.std) + ' errs=0 dom=' + !!info.dom, retries: 0 };
  } else { while (!line && Date.now() - t0 < 60000) { await sleep(200); line = readLine(log); } }
  const wall = Date.now() - t0; if (pid) killTree(pid); try { h.kill(); } catch (e) { /* ignore */ }
  const r = line ? parse(line.line) : { result: 'timeout' }; r.retries = line ? line.retries : 0; r.run = i; r.wallMs = wall; r.ms = +r.ms || null; r.log = line ? '' : (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').slice(-400) : '(no log)');
  if (!KEEP && r.result === 'ok') { try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch (e) { /* left behind, harmless */ } }
  return r;
}
(async () => {
  fs.mkdirSync(WORK, { recursive: true }); prepareRoot();
  const res = []; let next = 1; const t0 = Date.now();
  await Promise.all(Array.from({ length: PAR }, async () => { while (next <= RUNS) { const i = next++; const r = await oneRun(i); res.push(r); console.log(`run ${i}: ${r.result}${r.retries ? ' (after ' + r.retries + ' reload' + (r.retries > 1 ? 's' : '') + ')' : ''}${r.ms ? ' ' + r.ms + ' ms' : ''}${r.renderer ? ' ' + r.renderer.slice(0, 40) : ''}${r.errs && r.errs !== '0' ? ' errs=' + r.errs : ''}${r.std ? ' std=' + r.std : ''}`); } }));
  const by = (k) => res.filter((r) => r.result === k).length, ms = res.filter((r) => r.ms).map((r) => r.ms).sort((a, b) => a - b), med = ms.length ? ms[Math.floor(ms.length / 2)] : null;
  const hw = res.filter((r) => r.renderer && !/swiftshader|software/i.test(r.renderer)).length;
  console.log(`\n${RUNS} runs (parallel ${PAR}${SIM ? ', sim ' + SIM : ''}): ok ${by('ok')} / blank ${by('blank')} / degraded ${by('degraded')} / fallback ${by('fallback')} / timeout ${by('timeout')}; ` + `window shown -> scene confirmed: median ${med} ms, slowest ${ms.length ? ms[ms.length - 1] : null} ms; first-try success ${res.filter((r) => r.result === 'ok' && !r.retries).length}/${RUNS}; hardware context in ${hw}/${RUNS}; total ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  for (const r of res.filter((x) => x.result !== 'ok')) console.log('not ok: run ' + r.run + ' ' + r.result + ' ' + (r.log || ''));
  process.exit(SIM ? (res.every((r) => r.result === 'fallback') ? 0 : 1) : (res.every((r) => r.result === 'ok') ? 0 : 1));
})();
