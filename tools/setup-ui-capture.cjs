/* Headless capture of the installer scene (setup/ui-web) without puppeteer: Chrome over CDP.
   node tools/setup-ui-capture.cjs shots <theme> <outDir>       -> <outDir>/<theme>-<state>.png
   node tools/setup-ui-capture.cjs video <theme> <out.mp4>      -> frame-exact render of the demo timeline
   node tools/setup-ui-capture.cjs one <theme> <t> <png> [fail] -> a single frame (camera tuning) */
const { spawn, execFileSync } = require('child_process'), fs = require('fs'), path = require('path'), http = require('http');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PAGE = 'file:///' + path.resolve(__dirname, '../setup/ui-web/index.html').replace(/\\/g, '/');
const W = +process.env.W || 1064, H = +process.env.H || 704;
const [mode, theme, a, b, c] = process.argv.slice(2);
const get = (u) => new Promise((res, rej) => http.get(u, (r) => { let d = ''; r.on('data', (x) => d += x); r.on('end', () => res(d)); }).on('error', rej));
(async () => {
  const dir = fs.mkdtempSync(path.join(process.env.WORK || 'H:/MeguLit-Work/setup-ui-redesign', 'chrome-'));
  const port = 9444 + Math.floor(Math.random() * 400);
  const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + dir, '--allow-file-access-from-files', '--hide-scrollbars', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--mute-audio', `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' });
  let list; for (let i = 0; i < 60; i++) { try { list = JSON.parse(await get(`http://127.0.0.1:${port}/json/list`)); if (list.find((x) => x.type === 'page')) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }
  const ws = new WebSocket(list.find((x) => x.type === 'page').webSocketDebuggerUrl); await new Promise((r) => ws.onopen = r);
  let id = 0; const pend = new Map(); ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.method === 'Runtime.exceptionThrown') console.error('PAGE ERROR', JSON.stringify(d.params.exceptionDetails).slice(0, 1400)); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  const cdp = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result && r.result.exceptionDetails) console.error(JSON.stringify(r.result.exceptionDetails).slice(0, 1400)); return r.result && r.result.result && r.result.result.value; };
  await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: +process.env.DPR || 1, mobile: false });
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Page.navigate', { url: `${PAGE}?theme=${theme}&demo=1&paused=1&desk=1${process.env.LANGQ ? "&lang=" + process.env.LANGQ : ""}${process.env.FLAT ? "&flat=1" : ""}${process.env.MODE ? "&mode=" + process.env.MODE : ""}${process.env.LOGO ? "&logo=" + process.env.LOGO : ""}${process.env.BTN ? "&btn=" + process.env.BTN : ""}${process.env.REDUCE ? '&reduce=1' : ''}` });
  await new Promise((r) => setTimeout(r, 3500)); await ev('document.fonts.ready.then(()=>1)');
  const shot = async (file, t, opt) => { await ev(`Demo.seek(${t},${opt ? JSON.stringify(opt) : 'null'})`); const r = await cdp('Page.captureScreenshot', { format: file.endsWith('.jpg') ? 'jpeg' : 'png', quality: 92 }); fs.writeFileSync(file, Buffer.from(r.result.data, 'base64')); };
  const T = await ev('({tend:Demo.TEND,u0:Demo.U0,done:Demo.DONE,dur:Demo.DURATION,t0:Demo.T0})');
  if (mode === 'one') { fs.mkdirSync(path.dirname(b), { recursive: true }); await shot(b, +a, c ? (c.startsWith('{') ? JSON.parse(c) : { fail: c }) : null); if (process.env.EXPR) console.log(await ev(process.env.EXPR)); }
  if (mode === 'shots') {
    fs.mkdirSync(a, { recursive: true });
    const S = { welcome: [1.9], 'move-whip': [T.t0 + 0.5], location: [4.4], 'move-orbit': [5.9], downloading: [(T.t0 + T.tend) / 2 + 0.6], retry: [null], unpacking: [T.u0 + 1.3], done: [T.dur - 0.3], 'failed-download': [8.0, { fail: 'download' }], 'failed-install': [T.u0 + 1.3, { fail: 'install' }], 'quit-confirm': [7.0, { quit: true }] };
    for (const [k, v] of Object.entries(S)) { let t = v[0]; if (k === 'retry') t = await ev('(()=>{for(let t=3;t<12;t+=.05){const s=Demo.at(t);if(s.st.includes(3))return t}return 8})()'); await shot(path.join(a, `${theme}-${k}.png`), t, v[1]); console.log(k, t); }
  }
  if (mode === 'video') {
    const fr = path.join(dir, 'f'); fs.mkdirSync(fr); const fps = +process.env.FPS || 24, n = Math.floor(T.dur * fps);
    for (let i = 0; i < n; i++) await shot(path.join(fr, String(i).padStart(4, '0') + '.jpg'), i / fps);
    execFileSync(process.env.FFMPEG || 'D:/ffmpeg/bin/ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(fr, '%04d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', a]);
    console.log('video', n, 'frames', T.dur.toFixed(1) + 's');
  }
  if (mode === 'switchvideo') { const fr = path.join(dir, 'f'); fs.mkdirSync(fr); const fps = +process.env.FPS || 24, N = fps * 6, ez = (x) => x * x * (3 - 2 * x); for (let i = 0; i < N; i++) { const tt = i / fps, m = tt < 0.6 ? 0 : tt < 1.5 ? ez((tt - 0.6) / 0.9) : tt < 3.2 ? 1 : tt < 4.1 ? 1 - ez((tt - 3.2) / 0.9) : 0; await shot(path.join(fr, String(i).padStart(4, '0') + '.jpg'), 17.9, { mix: m }); } execFileSync(process.env.FFMPEG || 'D:/ffmpeg/bin/ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(fr, '%04d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', a]); console.log('switch video', N); }
  ws.close(); ch.kill(); await new Promise((r) => setTimeout(r, 500)); try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  process.exit(0);
})();
