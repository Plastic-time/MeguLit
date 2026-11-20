// SPDX-License-Identifier: GPL-3.0-or-later
// Pre-rendered installer player (setup/ui-web/player.js) in ONE headless Chrome over CDP, against fake segments built by
// tools/setup-player-fixture.cjs (every frame carries its segment id + frame number, same files/manifest as video/INTERFACE.md).
// Checks: poster before the first video frame, intro -> welcome loop, stage changes driven by Scene.goTo (the installer's real
// events), transitions entered at the loop point (cut) or cross-faded, only ever along the chain of ADJACENT clips (no progress overlay
// on the video any more), light/dark cross-fade on the same clip, and the fatal paths (missing files, broken video) that make
// the host fall back to the classic window.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http'), { spawn, execFileSync } = require('node:child_process');
const repo = path.join(__dirname, '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', FFMPEG = process.env.FFMPEG || 'D:/ffmpeg/bin/ffmpeg';
const SRC = process.env.MEGULIT_PLAYER_SRC || 'E:/try/prerender-test/open-light.mp4';
const tmpBase = process.env.MEGULIT_TEST_TMP || (fs.existsSync('H:/MeguLit-Work') ? (fs.mkdirSync('H:/MeguLit-Work/tmp', { recursive: true }), path.resolve('H:/MeguLit-Work/tmp')) : require('node:os').tmpdir());
const skip = !fs.existsSync(CHROME) ? 'needs Chrome' : !fs.existsSync(FFMPEG + '.exe') && !fs.existsSync(FFMPEG) ? 'needs ffmpeg' : !fs.existsSync(SRC) ? 'needs a source clip (MEGULIT_PLAYER_SRC)' : false;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileUrl = (p) => 'file:///' + path.resolve(p).replace(/\\/g, '/');
const get = (u) => new Promise((res, rej) => http.get(u, (r) => { let d = ''; r.on('data', (x) => d += x); r.on('end', () => res(d)); }).on('error', rej));

let work, fixture, chrome, ws, cdp, ev;
test.before(async () => {
  if (skip) return;
  work = fs.mkdtempSync(path.join(tmpBase, 'msp-')); fixture = path.join(work, 'fixture');
  execFileSync(process.execPath, [path.join(repo, 'tools', 'setup-player-fixture.cjs'), fixture, '--src', SRC], { stdio: 'ignore' });
  /* broken copy: valid manifest, the welcome clip is garbage */
  fs.cpSync(fixture, path.join(work, 'broken'), { recursive: true }); fs.writeFileSync(path.join(work, 'broken', 'light', 'intro.mp4'), Buffer.alloc(4096, 7));
  const port = 9300 + Math.floor(Math.random() * 400);
  chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + path.join(work, 'profile'), '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--no-first-run', '--window-size=1000,640', 'about:blank'], { stdio: 'ignore' });
  let list; for (let i = 0; i < 100; i++) { try { list = JSON.parse(await get(`http://127.0.0.1:${port}/json/list`)); if (list.find((x) => x.type === 'page')) break; } catch { /* starting */ } await sleep(150); }
  ws = new WebSocket(list.find((x) => x.type === 'page').webSocketDebuggerUrl); await new Promise((r) => ws.onopen = r);
  let id = 0; const pend = new Map(); ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  cdp = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result && r.result.result && r.result.result.value; };
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Emulation.setDeviceMetricsOverride', { width: 1000, height: 640, deviceScaleFactor: 1, mobile: false });
});
test.after(() => { try { ws && ws.close(); } catch { /* gone */ } try { chrome && chrome.kill(); } catch { /* gone */ } if (work) setTimeout(() => { try { fs.rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch { /* chrome still closing */ } }, 800); });

const page = (vbase, extra = '') => fileUrl(path.join(repo, 'setup', 'ui-web', 'index.html')) + '?lang=zh&vbase=' + encodeURIComponent(fileUrl(vbase) + '/') + extra;
async function open(vbase, extra) { await ev('try{localStorage.clear()}catch(e){}'); await cdp('Page.navigate', { url: page(vbase, extra) }); for (let i = 0; i < 100; i++) { if (await ev('!!(window.Player&&window.Scene)').catch(() => false)) return; await sleep(50); } throw new Error('page did not load'); }
async function until(expr, ms = 15000, what = expr) { const t0 = Date.now(); for (;;) { const v = await ev(expr).catch(() => null); if (v) return v; if (Date.now() - t0 > ms) throw new Error('timed out waiting for ' + what + '\n' + JSON.stringify(await ev("({s:Player.state,log:Player.log.filter(e=>e.k!==\"want\").slice(-12),v:Player.layers.light.vids.map(v=>({id:v.dataset.id,t:v.currentTime,d:v.duration,p:v.paused,e:v.ended,rs:v.readyState,on:v.classList.contains(\"on\"),err:v.error&&v.error.code}))})"))); await sleep(40); } }
const on = (id) => until(`Player.state.cur===${JSON.stringify(id)}&&window.__playerFrame&&__playerFrame.id===${JSON.stringify(id)}`, 20000, 'clip ' + id);
const switches = () => ev('Player.log.filter(e=>e.k==="switch").map(e=>e.id+":"+e.how)');
/* (Scene.goTo returns a GSAP timeline: `void` it, returning it by value over CDP takes seconds) */
/* a snapshot like host.js builds from the engine: N segments, the first `done` finished, the next one half way */
const feed = (N, done, prog) => ev(`(function(){const N=${N},st=new Int8Array(N),fr=new Float32Array(N),da=new Float32Array(N);for(let i=0;i<N;i++){if(i<${done}){st[i]=2;da[i]=0.1}else if(i===${done}){st[i]=1;fr[i]=0.5}}
  Scene.render({t:performance.now()/1000,phase:'download',st,fr,doneAt:da,got:${prog}*100,total:100,speed:1,eta:1,pack:'base',src:'x',dir:'',unpack:0});return true})()`);

test('poster first, then intro, then the welcome loop', { skip, timeout: 60000 }, async () => {
  await open(fixture);
  const early = await ev('({v:Player.verdict(),poster:[...document.querySelectorAll("#vstage img.vp.on")].map(i=>i.src.split("/").slice(-2).join("/"))})');
  assert.equal(early.v.result, 'ok', 'something on screen before the first video frame: ' + JSON.stringify(early));
  await on('intro'); assert.equal(await ev('document.querySelector("#vstage .vl[data-theme=dark]").style.opacity'), '0', 'light by default');
  await on('welcome');
  assert.deepEqual((await switches()).slice(0, 2), ['intro:cut', 'welcome:cut']);
  assert.equal(await ev('Player.state.dead'), false);
});

test('stage changes follow Scene.goTo: transition at the loop point, then the next loop; no overlay canvas', { skip, timeout: 90000 }, async () => {
  await ev('void Scene.goTo("loc","skim")'); await on('to-loc'); await on('loc');
  await ev('void Scene.goTo("field","under")'); await on('to-field'); await on('field');
  const sw = await switches(); assert.ok(sw.includes('to-loc:cut') && sw.includes('to-field:cut'), 'loops end on the transition\'s first pose: ' + sw);
  assert.equal(await ev('!!document.getElementById("vov")'), false, 'progress is not drawn on the video');
  const f = await ev('__playerFrame'); assert.equal(f.id, 'field');
});

test('light/dark cross-fade on the same clip; the covered theme sleeps', { skip, timeout: 60000 }, async () => {
  await ev('Scene.setTheme(true)'); await until('document.querySelector("#vstage .vl[data-theme=dark]").style.opacity==="1"', 5000, 'dark on top');
  await until('(()=>{const L=Player.layers.dark,v=L.vids[L.front];return L.id==="field"&&!v.paused&&v.classList.contains("on")})()', 8000, 'dark clip playing');
  await until('Player.layers.light.vids.every(v=>v.paused)', 3000, 'light asleep');
  await ev('void Scene.goTo("unpack","dive")'); await on('to-unpack'); await on('unpack');
  assert.equal(await ev('Player.layers.dark.id'), 'unpack', 'the visible theme follows the stages');
  await ev('Scene.setTheme(false)'); await until('document.querySelector("#vstage .vl[data-theme=dark]").style.opacity==="0"', 5000, 'light back');
  await until('(()=>{const L=Player.layers.light,v=L.vids[L.front];return L.id==="unpack"&&!v.paused})()', 8000, 'light clip playing again');
  await ev('void Scene.goTo("done","pull")'); await on('to-done'); await on('done');
  assert.equal(await ev('Player.state.dead'), false);
});

test('a jump over stages (location -> done) chains the transitions in between, every step adjacent', { skip, timeout: 60000 }, async () => {
  await open(fixture); await on('welcome'); await ev('void Scene.goTo("loc","skim")'); await on('loc');
  await ev('void Scene.goTo("done","pull")'); await on('to-done');
  await on('done');
  const sw = (await switches()).map((s) => s.split(':')[0]), a = sw.indexOf('to-field'), b = sw.indexOf('to-unpack'), c = sw.indexOf('to-done');
  assert.ok(a >= 0 && b > a && c > b, 'to-field, to-unpack, to-done in order: ' + sw.join(' ')); assert.ok(!(await switches()).some((s) => /:fade$/.test(s) && !/^to-/.test(s)), 'no fade into a loop');
});

test('installer asks for the next stage during a transition: no extra loop is played', { skip, timeout: 60000 }, async () => {
  await open(fixture); await on('intro'); await ev('void Scene.goTo("loc","skim")');
  await on('loc'); const sw = await switches(); assert.deepEqual(sw.slice(0, 3), ['intro:cut', 'to-loc:cut', 'loc:cut'], sw.join(' '));
});

test('missing videos or a broken clip: fatal (the host shows the classic window), never a blank page', { skip, timeout: 60000 }, async () => {
  await open(path.join(work, 'nothing-here')); await until('window.__playerFatal', 10000, 'fatal for missing manifest');
  await open(path.join(work, 'broken')); await until('window.__playerFatal', 12000, 'fatal for a broken clip');
  assert.match(await ev('window.__playerFatal'), /error|frame|load/);
  await open(fixture, '&vto=1'); await until('window.__playerFatal', 5000, 'fatal when no frame arrives in time');
});

test('reduced motion: no transitions are played, stages fade between loops', { skip, timeout: 60000 }, async () => {
  await open(fixture, '&reduce=1'); await on('welcome'); await ev('void Scene.goTo("loc","skim")'); await on('loc');
  const sw = await switches(); assert.ok(!sw.some((s) => s.startsWith('intro') || s.startsWith('to-')), sw.join(' '));
});

test('the real renders in setup/ui-web/video: poster, intro, field, dark theme', { skip: skip || (!fs.existsSync(path.join(repo, 'setup', 'ui-web', 'video', 'light', 'manifest.json')) && 'no renders yet'), timeout: 120000 }, async () => {
  const shots = process.env.MEGULIT_PLAYER_SHOTS, shot = async (n) => { if (!shots) return; fs.mkdirSync(shots, { recursive: true }); const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(shots, n + '.png'), Buffer.from(r.result.data, 'base64')); };
  await ev('try{localStorage.clear()}catch(e){}'); await cdp('Page.navigate', { url: fileUrl(path.join(repo, 'setup', 'ui-web', 'index.html')) + '?lang=zh' });
  await until('!!(window.Player&&window.Scene)', 10000); await shot('0-poster');
  await on('intro'); await on('welcome'); await shot('1-welcome');
  await ev('void Scene.goTo("loc","skim")'); await on('loc'); await shot('2-loc');
  await ev('void Scene.goTo("field","under")'); await on('field');
  await ev('Scene.setTheme(true)'); await until('(()=>{const L=Player.layers.dark;return L.id==="field"&&!L.vids[L.front].paused})()', 8000, 'dark field'); await sleep(1000); await shot('4-field-dark');
  await ev('void Scene.goTo("unpack","dive")'); await on('to-unpack'); await on('unpack'); await ev('void Scene.goTo("done","pull")'); await on('done'); await sleep(800); await shot('5-done-dark');
  assert.equal(await ev('Player.state.dead'), false); assert.equal(await ev('Player.layers.light.man.draft'), false);
});

test('responsiveness: the install click shows press feedback in the same frame; the drag zone is reachable in every stage', { skip, timeout: 90000 }, async () => {
  await open(fixture); await on('welcome');
  /* press feedback does not wait for anything the host does */
  const t = await ev('(()=>{const b=document.getElementById("install");const t0=performance.now();b.click();return {busy:b.classList.contains("busy"),ms:performance.now()-t0}})()');
  assert.ok(t.busy && t.ms < 100, 'the button is busy at once: ' + JSON.stringify(t));
  /* the title drag zone is on top at its probe point in every stage (a covered drag zone = a window that cannot be moved) */
  const probe = '(()=>{const r=document.getElementById("drag").getBoundingClientRect(),e=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return e&&e.id})()';
  for (const [stage, move] of [['welcome', ''], ['loc', 'skim'], ['field', 'under'], ['unpack', 'dive'], ['done', 'pull']]) {
    if (stage !== 'welcome') { await ev(`void Scene.goTo(${JSON.stringify(stage)},${JSON.stringify(move)})`); await sleep(300); }
    assert.equal(await ev(probe), 'drag', 'drag zone reachable in ' + stage);
  }
});

test('the host answers the install request at once and runs the heavy work from a timer tick (never inside the web-message callback)', () => {
  const src = fs.readFileSync(path.join(repo, 'setup', 'setup-web.ps1'), 'utf8');
  const a = src.indexOf("'install' {"), b = src.indexOf("'retry' {");
  const block = src.slice(a, b);
  const lines = block.split('\n');
  const direct = lines.filter((l) => /PerformClick\(\)/.test(l) && !/add_Tick/.test(l) && !lines[lines.indexOf(l) - 1].includes('add_Tick'));
  assert.ok(/add_Tick/.test(block) && /\$script:installTimer\.Start\(\)/.test(block), 'a one-shot timer runs the confirm');
  assert.ok(block.indexOf('Web-Post @{ t = \'reply\'') > block.indexOf('installTimer.Start()'), 'the reply is posted right after the timer was armed');
  const tick = block.slice(block.indexOf('add_Tick'), block.indexOf('$script:installTimer.Start()'));
  assert.equal((block.match(/PerformClick\(\)/g) || []).length, 1, 'confirm is clicked exactly once, inside the tick: ' + direct.length);
  assert.ok(tick.includes('PerformClick()'), 'and that click is inside the tick handler');
  assert.match(src, /'resize' \{.*\$script:win\.SizeFrom/, 'the page can start the system size loop');
});

test('window edge hot zones take the mouse (native mode): every edge and corner point hits a .rz, widths follow the zoom', { skip, timeout: 60000 }, async () => {
  await open(fixture); await on('welcome');
  await ev('document.documentElement.classList.add("native");document.documentElement.style.setProperty("--M","0px")'); await sleep(200);
  const hits = await ev('(()=>{const W=innerWidth,H=innerHeight,pts={l:[2,H/2],r:[W-2,H/2],t:[W/2-120,2],b:[W/2,H-2],tl:[2,2],tr:[W-2,2],bl:[2,H-2],br:[W-2,H-2]},o={};for(const k in pts){const e=document.elementFromPoint(pts[k][0],pts[k][1]);o[k]=e&&e.dataset&&e.dataset.e||(e&&(e.id||e.tagName))}return o})()');
  for (const k of ['l', 'r', 't', 'b', 'tl', 'tr', 'bl', 'br']) assert.equal(hits[k], k, 'edge point ' + k + ' hits its zone: ' + JSON.stringify(hits));
  /* zones are sized in physical px: at a zoom below 1 the CSS width grows */
  const px = await ev('(()=>{document.documentElement.style.setProperty("--rz","9px");return getComputedStyle(document.querySelector(".rz[data-e=l]")).width})()'); assert.equal(px, '9px');
});
