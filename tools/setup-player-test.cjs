/* Headless route test of the installer's video player (setup/ui-web/player.js) against fake segments (tools/setup-player-fixture.cjs).
   No installer window, no real desktop: headless Chrome loads index.html with ?vbase=<fixture>, the test sets the target stop with Player.go(...) and reads Player.log.
   Asserts: the clips played are always a chain of ADJACENT clips (intro, welcome, to-loc, loc, to-field, field, to-unpack, unpack, to-done, done; a loop may be skipped
   when the target is further ahead, a transition never is), no fade ever goes to a non-adjacent clip, and the run ends on the target loop.
   node tools/setup-player-test.cjs */
const { spawn, execFileSync } = require('child_process'), fs = require('fs'), path = require('path'), http = require('http');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ROOT = path.resolve(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'setup/ui-web/index.html').replace(/\\/g, '/'), FIX = path.resolve(process.env.PLAYER_FIXTURE || 'E:/try/player-fixture');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), get = (u) => new Promise((res, rej) => http.get(u, (r) => { let d = ''; r.on('data', (x) => d += x); r.on('end', () => res(d)); }).on('error', rej));
const SEQ = ['intro', 'welcome', 'to-loc', 'loc', 'to-field', 'field', 'to-unpack', 'unpack', 'to-done', 'done'];
const LOOPS = ['welcome', 'loc', 'field', 'unpack', 'done'], INTO = { loc: 'to-loc', field: 'to-field', unpack: 'to-unpack', done: 'to-done' };
/* legal moves from clip a to clip b */
const legal = (a, b) => { const i = SEQ.indexOf(a), j = SEQ.indexOf(b); if (i < 0 || j < 0) return false; if (j === i + 1) return true;   /* the next clip */
  if (LOOPS.includes(a) && b === INTO[LOOPS[LOOPS.indexOf(a) + 1]]) return true;   /* a loop into its next transition */
  if (!LOOPS.includes(a) && j === i + 2 && LOOPS.includes(SEQ[i + 1]) && !LOOPS.includes(b)) return true;   /* a transition into the next transition, the loop in between skipped */
  return false; };
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };

async function runCase(name, steps, endAt = 'done') {
  const work = fs.mkdtempSync('E:/try/ptest-'), port = 9970 + Math.floor(Math.random() * 20);
  const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + path.join(work, 'p'), '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--window-size=1000,640', 'about:blank'], { stdio: 'ignore' });
  try {
    let list; for (let i = 0; i < 100; i++) { try { list = JSON.parse(await get(`http://127.0.0.1:${port}/json/list`)); if (list.find((x) => x.type === 'page')) break; } catch (e) { /* wait */ } await sleep(200); }
    const ws = new WebSocket(list.find((x) => x.type === 'page').webSocketDebuggerUrl); await new Promise((r) => ws.onopen = r);
    let id = 0; const pend = new Map(); ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
    const cdp = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = async (e) => { const r = await cdp('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result && r.result.result && r.result.result.value; };
    await cdp('Page.enable'); await cdp('Runtime.enable');
    await cdp('Page.navigate', { url: `${PAGE}?vbase=${encodeURI('file:///' + FIX.replace(/\\/g, '/'))}/&vto=20000` });
    const wait = async (expr, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr)) return true; await sleep(150); } return false; };
    ok(await wait('window.Player&&Player.state.firstFrame', 20000), name + ': first frame shown');
    for (const s of steps) {
      if (s.waitCur) ok(await wait(`Player.state.cur==="${s.waitCur}"`, 60000), `${name}: reached ${s.waitCur}`);
      if (s.go) await ev(`Player.go("${s.go}")`);
    }
    ok(await wait(`Player.state.cur==="${endAt}"&&Player.state.target==="${endAt}"`, 120000), `${name}: ends on the ${endAt} loop`);
    await sleep(500);
    const sw = JSON.parse(await ev('JSON.stringify(Player.log.filter(e=>e.k==="switch").map(e=>({id:e.id,how:e.how,from:e.from})))'));
    console.log(name + ' switches: ' + sw.map((e) => `${e.from || '-'}>${e.id}/${e.how}`).join('  '));
    const bad = sw.filter((e) => e.from && !legal(e.from, e.id)); ok(bad.length === 0, name + ': every switch is between adjacent clips' + (bad.length ? ' BAD ' + JSON.stringify(bad) : ''));
    const tr = sw.map((e) => e.id).filter((x) => /^to-/.test(x)), want = ['to-loc', 'to-field', 'to-unpack', 'to-done'].slice(0, SEQ.indexOf(endAt) / 2);
    ok(JSON.stringify(tr) === JSON.stringify(want), name + ': transitions played once each, in order ' + JSON.stringify(tr));
    const nonAdjFade = sw.filter((e) => e.how === 'fade' && e.from && !legal(e.from, e.id)); ok(nonAdjFade.length === 0, name + ': no fade between non-adjacent clips');
    ok(!(await ev('!!window.__playerFatal')), name + ': no player fatal'); ok(!(await ev('!!document.getElementById("vov")')), name + ': no progress overlay canvas');
    ws.close();
  } finally { try { ch.kill(); } catch (e) { /* gone */ } await sleep(400); try { fs.rmSync(work, { recursive: true, force: true }); } catch (e) { /* busy */ } }
}
(async () => {
  if (!fs.existsSync(path.join(FIX, 'light/manifest.json'))) execFileSync(process.execPath, [path.join(__dirname, 'setup-player-fixture.cjs'), FIX, '--scale', '0.25'], { stdio: 'inherit' });
  await runCase('step-by-step', [{ waitCur: 'welcome', go: 'loc' }, { waitCur: 'loc', go: 'field' }, { waitCur: 'field', go: 'unpack' }, { waitCur: 'unpack', go: 'done' }]);
  await runCase('loc->unpack at once', [{ go: 'loc' }, { waitCur: 'loc', go: 'unpack' }], 'unpack');
  await runCase('loc->done at once', [{ waitCur: 'welcome', go: 'loc' }, { waitCur: 'loc', go: 'done' }]);
  await runCase('field, then done mid-way', [{ go: 'field' }, { waitCur: 'to-field', go: 'done' }]);
  console.log(fail ? `${fail} FAILED` : 'ALL PASS'); process.exit(fail ? 1 : 0);
})();
