/* Offline render of the installer's 3D scene into the videos the real installer plays (setup\ui-web\video\*.mp4).
   The user's machine never creates WebGL: it plays these and draws a light 2D overlay.
   Real GPU (not SwiftShader), MSAA on, shadows and transmissive glass on, 1.5x device scale: it is rendered once, so it can be as good as it gets.
   node tools/setup-prerender.cjs --seg open|done [--theme edge|night] [--fps 30] [--seconds 8] [--dpr 1.5] [--crf 26] [--out setup/ui-web/video] [--keep]
   Loops are seamless: the camera drift is one full circle over the clip (window.__loopPhase, see scene.js). */
const { spawn, execFileSync } = require('child_process'), fs = require('fs'), path = require('path'), http = require('http');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const SEG = arg('seg', 'open'), THEME = arg('theme', 'edge'), FPS = +arg('fps', 30), SECS = +arg('seconds', 8), DPR = +arg('dpr', 1.5), CRF = +arg('crf', 26), AMP = +arg('amp', SEG === 'open' ? 7 : 1);
const OUT = path.resolve(arg('out', path.join(__dirname, '..', 'setup', 'ui-web', 'video'))), KEEP = !!arg('keep', false);
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', FFMPEG = process.env.FFMPEG || 'D:/ffmpeg/bin/ffmpeg';
const PAGE = 'file:///' + path.resolve(__dirname, '../setup/ui-web/index.html').replace(/\\/g, '/');
const get = (u) => new Promise((res, rej) => http.get(u, (r) => { let d = ''; r.on('data', (x) => d += x); r.on('end', () => res(d)); }).on('error', rej));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  fs.mkdirSync(OUT, { recursive: true }); const work = fs.mkdtempSync(path.join(process.env.WORK || 'E:/try', 'prerender-')), frames = path.join(work, 'f'); fs.mkdirSync(frames);
  const port = 9600 + Math.floor(Math.random() * 300);
  const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + path.join(work, 'profile'), '--allow-file-access-from-files', '--hide-scrollbars', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--mute-audio', '--window-size=1000,640', 'about:blank'], { stdio: 'ignore' });
  let list; for (let i = 0; i < 100; i++) { try { list = JSON.parse(await get(`http://127.0.0.1:${port}/json/list`)); if (list.find((x) => x.type === 'page')) break; } catch (e) { /* wait */ } await sleep(200); }
  const ws = new WebSocket(list.find((x) => x.type === 'page').webSocketDebuggerUrl); await new Promise((r) => ws.onopen = r);
  let id = 0; const pend = new Map(); ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') console.error('PAGE ERROR', JSON.stringify(d.params.exceptionDetails).slice(0, 400)); };
  const cdp = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result && r.result.result && r.result.result.value; };
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1000, height: 640, deviceScaleFactor: DPR, mobile: false }); await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Page.navigate', { url: `${PAGE}?theme=${THEME}&demo=1&paused=1&prerender=1&aa=1` }); await sleep(5000); await ev('document.fonts.ready.then(()=>1)');
  const info = await ev('({tend:Demo.TEND,dur:Demo.DURATION,gl:!!(window.GL&&GL.ok),renderer:(function(){try{var g=GL.renderer.getContext();var e=g.getExtension("WEBGL_debug_renderer_info");return g.getParameter(e.UNMASKED_RENDERER_WEBGL)}catch(e){return "?"}})(),dpr:devicePixelRatio,w:innerWidth,h:innerHeight})');
  console.log('render page:', JSON.stringify(info)); if (!info.gl) throw new Error('no WebGL in the render browser');
  const tHold = SEG === 'open' ? 1.9 : info.dur - 0.3, N = Math.round(FPS * SECS), t0 = Date.now();
  await ev(`window.__loopAmp=${AMP}`);
  for (let i = 0; i < N; i++) {
    await ev(`window.__loopPhase=${i / N};Demo.seek(${tHold},null);new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
    const r = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 92 }); fs.writeFileSync(path.join(frames, String(i).padStart(4, '0') + '.jpg'), Buffer.from(r.result.data, 'base64'));
    if (i % 30 === 0) console.log(`frame ${i}/${N} ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  const base = `${SEG}-${THEME === 'night' ? 'dark' : 'light'}`;
  fs.copyFileSync(path.join(frames, '0000.jpg'), path.join(OUT, base + '.jpg'));   /* poster = the placeholder shown before the video starts */
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(frames, '%04d.jpg'), '-c:v', 'libx264', '-preset', 'slow', '-crf', String(CRF), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', path.join(OUT, base + '.mp4')]);
  const size = fs.statSync(path.join(OUT, base + '.mp4')).size; console.log(`${base}.mp4: ${N} frames, ${(size / 1048576).toFixed(2)} MB, rendered in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  ws.close(); ch.kill(); await sleep(600); if (!KEEP) { try { fs.rmSync(work, { recursive: true, force: true }); } catch (e) { /* busy */ } }
  process.exit(0);
})().catch((e) => { console.error('RENDER FAILED', e); process.exit(1); });
