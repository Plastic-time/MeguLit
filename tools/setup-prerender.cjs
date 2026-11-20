/* Offline render of the installer's one-take 3D scene into the videos the real installer plays (setup\ui-web\video\<theme>\*.mp4, see video\INTERFACE.md).
   The user's machine never creates WebGL: it plays these and draws a light 2D overlay for the real download progress.
   Real GPU (not SwiftShader), MSAA on, shadows and transmissive glass on, 1.28x device scale (1280x820): rendered once, so it can be as good as it gets.
   Frames go straight into ffmpeg's stdin (nothing but the finished files is written under the output folder); temp files live on E:.
   node tools/setup-prerender.cjs [--theme light|dark|both] [--seg all|intro,welcome,...] [--draft] [--fps 30] [--crf 30] [--out setup/ui-web/video]
   Two themes run as two processes in parallel. A drive below 3 GB free pauses the render. */
const { spawn, execFileSync } = require('child_process'), fs = require('fs'), path = require('path'), http = require('http');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const THEME = arg('theme', 'both'), SEGSEL = arg('seg', 'all'), DRAFT = !!arg('draft', false), FPS = +arg('fps', 30), CRF = +arg('crf', DRAFT ? 40 : 30);
const OUT = path.resolve(arg('out', path.join(__dirname, '..', 'setup', 'ui-web', 'video'))), TMP = path.resolve(arg('tmp', 'E:/try/prerender-tmp'));
const W = DRAFT ? 640 : 1280, H = DRAFT ? 410 : 820, DPR = W / 1000;
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', FFMPEG = process.env.FFMPEG || 'D:/ffmpeg/bin/ffmpeg';
const PAGE = 'file:///' + path.resolve(__dirname, '../setup/ui-web/index.html').replace(/\\/g, '/');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) => http.get(u, (r) => { let d = ''; r.on('data', (x) => d += x); r.on('end', () => res(d)); }).on('error', rej));
const freeGB = (p) => { try { let q = path.resolve(p); while (!fs.existsSync(q)) q = path.dirname(q); const s = fs.statfsSync(q); return s.bavail * s.bsize / 1073741824; } catch (e) { return 99; } };

/* segment table: demo-timeline time of each frame (Demo.seek is deterministic); loop = one seamless camera cycle; glass = outlines exported */
function segments(D) {
  const T0 = D.t0, U0 = D.u0, DONE = D.done, mv = { skim: 2.6, under: 3.4, dive: 2.2, pull: 4.4 };
  return [
    { id: 'intro', kind: 'transition', frames: 72, next: 'welcome', glass: true, blank: true, t: (i, n) => (T0 - 0.001) * i / n },
    { id: 'welcome', kind: 'loop', frames: 120, next: null, glass: true, blank: true, t: () => T0 - 0.001 },
    { id: 'to-loc', kind: 'transition', frames: 72, next: 'loc', glass: true, blank: true, t: (i, n) => T0 + (4.8 - T0) * i / n },
    { id: 'loc', kind: 'loop', frames: 120, next: null, glass: true, blank: true, t: () => 4.85 },
    { id: 'to-field', kind: 'transition', frames: 102, next: 'field', glass: true, blank: true, t: (i, n) => 4.9 + mv.under * i / n },
    { id: 'field', kind: 'loop', frames: 180, next: null, glass: true, blank: true, t: () => 4.9 + mv.under + 0.05 },
    { id: 'to-unpack', kind: 'transition', frames: 66, next: 'unpack', glass: false, blank: false, t: (i, n) => U0 - 0.3 + mv.dive * i / n },
    { id: 'unpack', kind: 'loop', frames: 90, next: null, glass: false, blank: false, t: () => U0 - 0.3 + mv.dive + 0.03 },
    { id: 'to-done', kind: 'transition', frames: 132, next: 'done', glass: false, blank: false, t: (i, n) => DONE + mv.pull * i / n },
    { id: 'done', kind: 'loop', frames: 180, next: null, glass: false, blank: false, t: () => DONE + mv.pull + 0.2 },
  ].filter((s) => SEGSEL === 'all' || SEGSEL.split(',').includes(s.id));
}

async function renderTheme(theme) {
  const tag = `[${theme}] `, log = (...a) => console.log(tag + a.join(' ')), dir = path.join(OUT, theme); fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(TMP, { recursive: true });
  const work = fs.mkdtempSync(path.join(TMP, theme + '-')), port = 9700 + Math.floor(Math.random() * 250);
  log(`free space: E: ${freeGB(TMP).toFixed(1)} GB, out drive ${freeGB(OUT).toFixed(1)} GB; ${W}x${H}, crf ${CRF}${DRAFT ? ', DRAFT' : ''}`);
  const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + path.join(work, 'profile'), '--allow-file-access-from-files', '--hide-scrollbars', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--mute-audio', '--window-size=1000,640', 'about:blank'], { stdio: 'ignore' });
  let list; for (let i = 0; i < 100; i++) { try { list = JSON.parse(await get(`http://127.0.0.1:${port}/json/list`)); if (list.find((x) => x.type === 'page')) break; } catch (e) { /* wait */ } await sleep(200); }
  const ws = new WebSocket(list.find((x) => x.type === 'page').webSocketDebuggerUrl); await new Promise((r) => ws.onopen = r);
  let id = 0; const pend = new Map(); ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') console.error(tag + 'PAGE ERROR', JSON.stringify(d.params.exceptionDetails).slice(0, 300)); };
  const cdp = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result && r.result.result && r.result.result.value; };
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1000, height: 640, deviceScaleFactor: DPR, mobile: false }); await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Page.navigate', { url: `${PAGE}?theme=${theme === 'dark' ? 'night' : 'edge'}&demo=1&paused=1&prerender=1${DRAFT ? '' : '&aa=1'}` }); await sleep(6000); await ev('document.fonts.ready.then(()=>1)');
  const D = await ev('({t0:Demo.T0,u0:Demo.U0,done:Demo.DONE,dur:Demo.DURATION,gl:!!(window.GL&&GL.ok),dpr:devicePixelRatio})'); if (!D.gl) throw new Error('no WebGL in the render browser');
  const info = await ev('(function(){Demo.seek(4.85,{blank:true});return GL.plateInfo()})()'); log('plates', info.plates.length, 'cores', info.cores);
  const manifest = { version: 1, theme, width: 1280, height: 820, fps: FPS, draft: DRAFT, segments: [], plates: { cores: info.cores, info: info.plates }, bytes: 0 };
  const t00 = Date.now();
  for (const sg of segments(D)) {
    while (freeGB(TMP) < 3 || freeGB(OUT) < 3) { log('PAUSED: a drive has less than 3 GB free'); await sleep(30000); }
    const n = sg.frames, file = path.join(dir, sg.id + '.mp4'), polys = [];
    const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-vf', `scale=1280:820:flags=lanczos`.replace('1280:820', `${W}:${H}`), '-c:v', 'libx264', '-preset', DRAFT ? 'veryfast' : 'slow', '-crf', String(CRF), '-pix_fmt', 'yuv420p', '-g', '600', '-movflags', '+faststart', '-an', file], { stdio: ['pipe', 'ignore', 'inherit'] });
    const done = new Promise((r) => ff.on('close', r)); const ts = Date.now();
    for (let i = 0; i < n; i++) {
      const t = sg.t(i, n), ph = sg.kind === 'loop' ? i / n : undefined;
      await ev(`window.__loopAmp=${sg.id === 'done' ? 1 : 7};${ph === undefined ? 'delete window.__loopPhase' : 'window.__loopPhase=' + ph};Demo.seek(${t},${sg.blank ? '{blank:true}' : 'null'});new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
      const r = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 92 }); const buf = Buffer.from(r.result.data, 'base64');
      if (i === 0) fs.writeFileSync(path.join(dir, sg.id + '.jpg'), buf);
      if (!ff.stdin.write(buf)) await new Promise((res) => ff.stdin.once('drain', res));
      if (sg.glass) { const o = await ev('GL.outlines(1000,640)'); polys.push((o || []).map((p) => p ? p.map((v) => Math.round(v * (1280 / 1000) * 4)) : null)); }
    }
    ff.stdin.end(); await done;
    /* the camera and the glass are the same in both themes: one gzipped copy, written by the light run, shared by both manifests */
    if (sg.glass && theme === 'light') { fs.mkdirSync(path.join(OUT, 'glass'), { recursive: true }); fs.writeFileSync(path.join(OUT, 'glass', sg.id + '.glass.json.gz'), require('zlib').gzipSync(JSON.stringify({ fps: FPS, frames: n, plates: info.plates.length, scale: 4, polys }), { level: 9 })); }
    const bytes = fs.statSync(file).size; manifest.bytes += bytes;
    manifest.segments.push({ id: sg.id, kind: sg.kind, frames: n, next: sg.next, file: sg.id + '.mp4', poster: sg.id + '.jpg', glass: sg.glass ? '../glass/' + sg.id + '.glass.json.gz' : null, bytes });
    log(`${sg.id}: ${n} frames, ${(bytes / 1048576).toFixed(2)} MB, ${((Date.now() - ts) / 1000).toFixed(0)} s (total ${((Date.now() - t00) / 1000).toFixed(0)} s, free E: ${freeGB(TMP).toFixed(0)} GB)`);
  }
  if (SEGSEL === 'all') fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
  log(`done: ${(manifest.bytes / 1048576).toFixed(2)} MB video in ${((Date.now() - t00) / 1000).toFixed(0)} s`);
  ws.close(); ch.kill(); await sleep(800); try { fs.rmSync(work, { recursive: true, force: true }); } catch (e) { /* busy */ }
  return manifest.bytes;
}
(async () => {
  if (THEME === 'both') {
    const kids = ['light', 'dark'].map((t) => new Promise((res) => { const c = spawn(process.execPath, [__filename, '--theme', t, '--seg', String(SEGSEL), '--fps', String(FPS), '--crf', String(CRF), '--out', OUT, '--tmp', TMP].concat(DRAFT ? ['--draft'] : []), { stdio: 'inherit' }); c.on('close', res); }));
    await Promise.all(kids); process.exit(0);
  }
  await renderTheme(THEME); process.exit(0);
})().catch((e) => { console.error('RENDER FAILED', e); process.exit(1); });
