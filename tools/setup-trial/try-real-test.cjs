/* Drives the REAL trial window (frameless WebView2 host) over its DevTools port with genuine mouse events, and checks every control.
   The server+host must already be running (tools/setup-trial/Start-Trial.cmd, or run-real.cmd on the hidden desktop) with
   WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333.   node tools/setup-trial/try-real-test.cjs <stage> <home>
   stages: controls | install | resume-close | resume-finish | error */
const fs = require('fs'), path = require('path'), http = require('http'), cp = require('child_process');
const stage = process.argv[2] || 'controls', HOME = path.resolve(process.argv[3] || 'H:/MeguLit-Work/setup-ui-redesign');
const STATE_DIR = path.join(HOME, 'try-install', '_state'), TARGET = path.join(HOME, 'try-install', 'MeguLit'), OUT = path.join(HOME, 'real-test'); fs.mkdirSync(OUT, { recursive: true });
const HID = 'E:/Apps/megu-testbed/HidDesk.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) => http.get(u, (r) => { let d = ''; r.on('data', (x) => d += x); r.on('end', () => res(d)); }).on('error', rej));
const results = []; const ok = (name, pass, info) => { results.push({ name, pass: !!pass, info }); console.log((pass ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); };
const hostLog = () => { try { return fs.readFileSync(path.join(STATE_DIR, 'host.log'), 'utf8'); } catch (e) { return ''; } };
const hostPid = () => { try { return +fs.readFileSync(path.join(STATE_DIR, 'host.pid'), 'utf8'); } catch (e) { return 0; } };
async function connect() {
  let list; for (let i = 0; i < 80; i++) { try { list = JSON.parse(await get('http://127.0.0.1:9333/json/list')); if (list.find((x) => x.type === 'page' && /127\.0\.0\.1/.test(x.url))) break; } catch (e) { /* wait */ } await sleep(500); }
  const t = list.find((x) => x.type === 'page' && /127\.0\.0\.1/.test(x.url)); const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => ws.onopen = r);
  let id = 0; const pend = new Map(); ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  const cdp = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result && r.result.result && r.result.result.value; };
  const shot = async (name) => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, stage + '-' + name + '.png'), Buffer.from(r.result.data, 'base64')); };
  /* a real mouse click at the element's centre: also proves nothing covers it */
  const click = async (sel) => {
    for (let i = 0; i < 200; i++) { const h = await ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return false;var b=e.getBoundingClientRect();var t=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);return !!t&&(t===e||e.contains(t)||t.contains(e))})()`); if (h) break; await sleep(300); }   /* wait until the control is really reachable (cards animate in) */
    const r = await ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;var b=e.getBoundingClientRect();var x=b.left+b.width/2,y=b.top+b.height/2;var top=document.elementFromPoint(x,y);return {x:x,y:y,w:b.width,hit:!!top&&(top===e||e.contains(top)||top.contains(e)),vis:getComputedStyle(e).visibility}})()`);
    if (!r) return { found: false };
    for (const t of ['mouseMoved', 'mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type: t, x: r.x, y: r.y, button: 'left', buttons: t === 'mousePressed' ? 1 : 0, clickCount: 1 });
    await sleep(250); return Object.assign({ found: true }, r);
  };
  return { ws, cdp, ev, shot, click };
}
const waitFor = async (fn, ms, what) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(400); } throw new Error('timeout: ' + what); };
const base = () => JSON.parse(fs.readFileSync(path.join(STATE_DIR, 'server.json'), 'utf8')).url.replace(/\/index\.html.*/, '');
const state = async () => JSON.parse(await get(base() + '/api/state'));
const mb = (n) => (n / 1048576).toFixed(0);
function dirStat(root, skip) { let n = 0, b = 0; (function w(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (skip && skip(p)) continue; if (e.isDirectory()) w(p); else { n++; b += fs.statSync(p).size; } } })(root); return { files: n, bytes: b }; }

(async () => {
  const c = await connect();
  if (stage === 'controls') {
    await waitFor(async () => (await c.ev('window.Scene&&Scene.section')) === 'loc', 40000, 'location screen'); await sleep(1500); await c.shot('1-location');
    ok('host window is frameless', /caption=False thickframe=False/.test(hostLog()) && /rect=1000x640 client=1000x640/.test(hostLog()), hostLog().split('\n').find((l) => /shown/.test(l)));
    const info = JSON.parse(await get(base() + '/api/info')); ok('default target is the trial folder, not E:\\MeguLit', /try-install[\\/]MeguLit$/i.test(info.defaultTarget) && !/^e:\\megulit/i.test(info.defaultTarget), info.defaultTarget);
    const until = async (fn, ms) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(300); } return null; };
    const theme0 = await c.ev('document.documentElement.getAttribute("data-theme")'); let r = await c.click('#btnTheme'); const theme1 = await until(async () => { const v = await c.ev('document.documentElement.getAttribute("data-theme")'); return v !== theme0 ? v : null; }, 45000); await sleep(1500); await c.shot('2-theme-toggled'); await c.click('#btnTheme'); const theme2 = await until(async () => { const v = await c.ev('document.documentElement.getAttribute("data-theme")'); return v === theme0 ? v : null; }, 45000);
    ok('theme switch (real click, both ways)', r.hit && theme1 && theme2 === theme0, [theme0, theme1, theme2]);
    const p0 = await c.ev('document.getElementById("path").value'); const chips = await c.ev('Array.from(document.querySelectorAll("#sugg button")).map(function(b){return b.textContent})'); let chipOk = false, chipInfo = chips;
    for (let i = 0; i < (chips || []).length && !chipOk; i++) { r = await c.click('#sugg button:nth-child(' + (i + 1) + ')'); const p1 = await until(async () => { const v = await c.ev('document.getElementById("path").value'); return v !== p0 ? v : null; }, 9000); if (p1) { chipOk = r.hit; chipInfo = [p0, p1]; } }
    ok('alternative location chip changes the path', chipOk, chipInfo);
    await c.ev(`(function(){var e=document.getElementById("path");e.value=${JSON.stringify(p0)};e.dispatchEvent(new Event("input",{bubbles:true}))})()`); await sleep(1200);
    const tog = async (sel) => { const v0 = await c.ev(`document.querySelector("${sel}").getAttribute("aria-checked")`); const rr = await c.click(sel); const v1 = await until(async () => { const v = await c.ev(`document.querySelector("${sel}").getAttribute("aria-checked")`); return v !== v0 ? v : null; }, 4000); await c.click(sel); await sleep(600); return [rr.hit, v0, v1]; };
    let tg = await tog('#swDesk'); ok('desktop shortcut switch', tg[0] && tg[2], tg); tg = await tog('#swMenu'); ok('start-menu shortcut switch', tg[0] && tg[2], tg);
    await c.ev(`(function(){var e=document.getElementById("path");e.value="E:\\\\MeguLit";e.dispatchEvent(new Event("input",{bubbles:true}))})()`); await sleep(900); await c.shot('3-protected-path');
    const txt = await c.ev('document.getElementById("ui-loc").innerText'); ok('real install folder is refused with a message', /正式|试用版不会动/.test(txt), txt.split('\n').filter((l) => /正式|试用/.test(l))[0]);
    r = await c.click('#install'); await sleep(800); const st1 = await state(); ok('pressing Install on the protected folder does nothing', st1.phase !== 'unpack' && !fs.existsSync(path.join('E:/MeguLit', '.megulit-trial')) && (await c.ev('Scene.section')) === 'loc', st1.phase);
    await c.ev(`(function(){var e=document.getElementById("path");e.value=${JSON.stringify(p0)};e.dispatchEvent(new Event("input",{bubbles:true}))})()`); await sleep(700);
    /* drag: the page asks the host, the host starts the system move loop; no real mouse here, so Escape ends it */
    r = await c.click('#drag'); await sleep(600); const dragLog = /msg drag/.test(hostLog()); try { cp.execFileSync(HID, ['key', String(hostPid()), '1B']); } catch (e) { /* ignore */ } await sleep(800); ok('drag area reaches the host (move loop starts; actual motion needs a real mouse)', dragLog, 'host.log has "msg drag"');
    r = await c.click('#btnMin'); await sleep(900); const minLog = hostLog().split('\n').filter((l) => /minimized/.test(l)).pop() || ''; ok('minimize button minimises the real window', r.hit && /iconic=True/.test(minLog), minLog);
    fs.writeFileSync(path.join(STATE_DIR, 'host.log.restore'), 'x'); const rest = await until(async () => /restored.*iconic=False/.test(hostLog()), 6000); ok('window restores from minimized', !!rest); await sleep(1500);
    r = await c.click('#browse'); await sleep(1200); const dlg = (() => { try { return cp.execFileSync('powershell.exe', ['-NoProfile', '-Command', "@(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'FolderBrowserDialog' }).Count"], { encoding: 'utf8' }).trim(); } catch (e) { return '?'; } })(); ok('change-folder button starts the folder dialog (found by process, then closed unused)', r.hit && +dlg > 0, 'dialog processes: ' + dlg);
    try { cp.execFileSync('powershell.exe', ['-NoProfile', '-Command', "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'FolderBrowserDialog' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"]); } catch (e) { /* ignore */ }
    await c.shot('4-after-controls');
  }
  if (stage === 'install') {
    await waitFor(async () => (await c.ev('window.Scene&&Scene.section')) === 'loc', 40000, 'location screen'); await sleep(1200);
    const t0 = Date.now(); const r = await c.click('#install'); ok('Install button clickable', r.hit);
    await waitFor(async () => (await state()).got > 4e6, 90000, 'first bytes'); const samples = []; let shot1 = false, shot2 = false, st;
    for (;;) { st = await state(); const dt = (Date.now() - t0) / 1000; samples.push({ t: +dt.toFixed(1), phase: st.phase, got: +mb(st.got), speed: +(st.speed / 1048576).toFixed(1), src: st.src, srcN: st.srcN, done: (st.st.match(/2/g) || []).length, running: (st.st.match(/1/g) || []).length, n: st.n });
      if (!shot1 && dt > 12) { await c.shot('1-downloading-12s'); shot1 = true; } if (!shot2 && dt > 28) { await c.shot('2-downloading-28s'); shot2 = true; }
      if (st.phase === 'unpack' || st.phase === 'done' || st.phase === 'failed') break; await sleep(1000); }
    console.log(samples.filter((_, i) => i % 3 === 0).map((s) => JSON.stringify(s)).join('\n')); const dlSecs = ((Date.now() - t0) / 1000).toFixed(0); ok('real download finished', st.phase !== 'failed', 'phase ' + st.phase + ' after ' + dlSecs + ' s, ' + mb(st.got) + ' MB, source ' + st.src);
    fs.writeFileSync(path.join(OUT, 'install-samples.json'), JSON.stringify(samples)); await waitFor(async () => (await state()).phase === 'done', 240000, 'done'); await c.shot('3-unpack-or-done'); await sleep(7000); await c.shot('4-done');
    ok('done screen shown', (await c.ev('Scene.section')) === 'done'); const m = JSON.parse(fs.readFileSync(path.join(STATE_DIR, 'runtime.trial.json'), 'utf8'));
    const app = dirStat(TARGET, (p) => /[\\/]runtime([\\/]|$)/.test(p) || /\.megulit-trial$/.test(p)), rt = dirStat(path.join(TARGET, 'runtime'));
    const wantRt = ['base', 'reading', 'voice'].reduce((a, k) => a + m.packs[k].unpacked, 0);
    ok('installed app files match the published zip (1009 entries listed incl. folders, 49,954,735 bytes)', app.bytes === 49954735, app); ok('installed runtime size matches the packs\' declared unpacked size', rt.bytes === wantRt, { installed: rt.bytes, declared: wantRt, files: rt.files });
    ok('MeguLit.exe present in the trial folder', fs.existsSync(path.join(TARGET, 'MeguLit.exe')));
    const lr = await c.click('#launch'); await sleep(7000); let L = null; try { L = JSON.parse(fs.readFileSync(path.join(STATE_DIR, 'launched.json'), 'utf8')); } catch (e) { /* none */ }
    const alive = L && (() => { try { return cp.execFileSync('powershell.exe', ['-NoProfile', '-Command', `(Get-Process -Id ${L.pid} -ErrorAction SilentlyContinue | ForEach-Object { $_.Path }) -join ''`], { encoding: 'utf8' }).trim(); } catch (e) { return ''; } })();
    ok('"开读" starts MeguLit.exe from the trial folder', lr.hit && L && alive && alive.toLowerCase() === path.join(TARGET, 'MeguLit.exe').toLowerCase(), alive || 'not running');
    if (L) { try { console.log(cp.execFileSync(HID, ['list', String(L.pid)], { encoding: 'utf8' }).trim()); cp.execFileSync(HID, ['shot', String(L.pid), path.join(OUT, 'launched-megulit.png')]); } catch (e) { /* ignore */ } try { cp.execFileSync('taskkill', ['/T', '/F', '/PID', String(L.pid)], { stdio: 'ignore' }); } catch (e) { /* gone */ } }
  }
  if (stage === 'resume-close') {
    await waitFor(async () => (await c.ev('window.Scene&&Scene.section')) === 'loc', 40000, 'location screen'); await sleep(800); await c.click('#install');
    await waitFor(async () => (await state()).got > 150e6, 90000, '150 MB'); await sleep(500);
    let r = await c.click('#btnClose'); await sleep(900); const vis = await c.ev('getComputedStyle(document.getElementById("ui-quit")).visibility'); await c.shot('1-close-confirm'); ok('close during download asks first', r.hit && vis === 'visible', vis);
    r = await c.click('#stay'); await waitFor(async () => (await c.ev('getComputedStyle(document.getElementById("ui-quit")).visibility')) === 'hidden', 30000, 'quit confirm to hide').catch(() => null); const vis2 = await c.ev('getComputedStyle(document.getElementById("ui-quit")).visibility'); ok('"等它到" keeps downloading', vis2 === 'hidden' && (await state()).phase === 'download', vis2);
    const before = (await state()).got; fs.writeFileSync(path.join(OUT, 'closed-at.json'), JSON.stringify({ got: before }));
    await c.click('#btnClose'); await sleep(700); r = await c.click('#leave'); ok('"回头再来" closes the window', r.hit, 'closed at ' + mb(before) + ' MB');
  }
  if (stage === 'resume-finish') {
    const was = JSON.parse(fs.readFileSync(path.join(OUT, 'closed-at.json'), 'utf8')).got; await waitFor(async () => (await c.ev('window.Scene&&Scene.section')) === 'loc', 40000, 'location screen');
    await c.click('#install'); const s0 = await waitFor(async () => { const s = await state(); return s.phase === 'download' && s.got > 0 ? s : null; }, 60000, 'resumed bytes'); ok('after reopening and pressing Install, the download continues from what was kept', s0.got >= was * 0.8, mb(s0.got) + ' MB at the first poll, ' + mb(was) + ' MB when closed'); await c.shot('1-reopened-resumed');
    await waitFor(async () => (await state()).phase === 'done', 240000, 'done'); await sleep(6000); await c.shot('2-done'); ok('finishes after resume', fs.existsSync(path.join(TARGET, 'MeguLit.exe')) && fs.existsSync(path.join(TARGET, 'runtime', 'aivis')));
  }
  if (stage === 'error') {
    await waitFor(async () => (await c.ev('window.Scene&&Scene.section')) === 'loc', 40000, 'location screen'); await sleep(800); fs.writeFileSync(path.join(STATE_DIR, 'break.flag'), 'x'); await c.click('#install');
    await waitFor(async () => (await state()).phase === 'failed', 180000, 'failed'); await sleep(2500); await c.shot('1-error'); const shown = await c.ev('getComputedStyle(document.querySelector(".card.err")||document.body).visibility');
    ok('network failure shows the error card', /visible/.test(shown), shown); let r = await c.click('#copylog'); await sleep(600); ok('copy-log button clickable', r.hit);
    const link = await c.ev('document.getElementById("manual")&&getComputedStyle(document.getElementById("manual")).display'); r = await c.click('#manual'); ok('manual-download button clickable', r.hit, link);
    fs.rmSync(path.join(STATE_DIR, 'break.flag')); r = await c.click('#retry'); ok('retry button clickable', r.hit); await waitFor(async () => { const s = await state(); return s.phase === 'download' && s.got > 4e6; }, 120000, 'download after retry'); await c.shot('2-after-retry'); ok('retry recovers the download', true);
  }
  fs.writeFileSync(path.join(OUT, stage + '-results.json'), JSON.stringify(results, null, 1)); c.ws.close(); console.log('\n' + results.filter((x) => x.pass).length + '/' + results.length + ' passed'); process.exit(results.every((x) => x.pass) ? 0 : 2);
})().catch((e) => { console.error('TEST ERROR', e); process.exit(1); });
