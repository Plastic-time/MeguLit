/* One still frame of the pre-render scene, for look-development without a full render.
   node tools/prerender-still.cjs --seg done|field|loc|... [--theme light|dark] [--query "ground=0&shadow=0"] --out file.jpg */
const { spawn } = require('child_process'), fs = require('fs'), path = require('path'), http = require('http');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const SEG = arg('seg', 'done'), THEME = arg('theme', 'light'), QUERY = arg('query', ''), OUT = path.resolve(arg('out', 'E:/try/still.jpg'));
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', PAGE = 'file:///' + path.resolve(__dirname, '../setup/ui-web/index.html').replace(/\\/g, '/');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), get = (u) => new Promise((res, rej) => http.get(u, (r) => { let d = ''; r.on('data', (x) => d += x); r.on('end', () => res(d)); }).on('error', rej));
const HOLD = { intro: [0.5, { blank: true, poseP: 0.5 }], welcome: [2.399, { blank: true, poseP: 0.5 }], loc: [5.1, { blank: true, poseP: 0.5 }], field: [8.8, { blank: true, poseP: 0.5 }], unpack: [11.3, { state: 'done', phase: 'unpack' }], done: [16.0, { state: 'done', phase: 'done' }], donenative: [16.0, null], donemotion: [16.0, { state: 'done', phase: 'done', native: true }] };
(async () => {
  const work = fs.mkdtempSync('E:/try/still-'), port = 9990 + Math.floor(Math.random() * 9);
  const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + path.join(work, 'p'), '--allow-file-access-from-files', '--hide-scrollbars', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--mute-audio', '--window-size=1000,640', 'about:blank'], { stdio: 'ignore' });
  let list; for (let i = 0; i < 100; i++) { try { list = JSON.parse(await get(`http://127.0.0.1:${port}/json/list`)); if (list.find((x) => x.type === 'page')) break; } catch (e) { /* wait */ } await sleep(200); }
  const ws = new WebSocket(list.find((x) => x.type === 'page').webSocketDebuggerUrl); await new Promise((r) => ws.onopen = r);
  let id = 0; const pend = new Map(); ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.method === 'Log.entryAdded') console.log('LOG', d.params.entry.level, d.params.entry.text, d.params.entry.url || ''); if (d.method === 'Runtime.exceptionThrown') console.log('EXC', JSON.stringify(d.params.exceptionDetails).slice(0, 300)); });
  const cdp = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (e) => { const r = await cdp('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result && r.result.result && r.result.result.value; };
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1000, height: 640, deviceScaleFactor: 1.28, mobile: false }); await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Log.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__layout={under:5.3,dive:9.0,pull:11.5};window.__still=true;window.__glassSlow=' + arg('slow', '0.2') + ';window.__wall=' + (arg('wall', '0') === '1') + ';' });
  await cdp('Page.navigate', { url: `${PAGE}?theme=${THEME === 'dark' ? 'night' : 'edge'}&demo=1&paused=1&prerender=1&aa=1${QUERY ? '&' + QUERY : ''}` }); await sleep(6000);
  const [t, opt] = HOLD[SEG];
  await ev(`window.__motionT=${SEG === 'donenative' ? 'undefined' : 1000};window.__trainOff=20000;Demo.seek(${t},${JSON.stringify(opt)});new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
  const r = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 90 }); fs.writeFileSync(OUT, Buffer.from(r.result.data, 'base64')); console.log('wrote', OUT);
  ws.close(); ch.kill(); await sleep(500); try { fs.rmSync(work, { recursive: true, force: true }); } catch (e) { /* busy */ }
  process.exit(0);
})();
