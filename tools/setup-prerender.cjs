/* Offline render of the installer's one-take 3D scene into the videos the real installer plays (setup\ui-web\video\<theme>\*.mp4, see video\INTERFACE.md).
   The user's machine never creates WebGL: it plays these and draws a light 2D overlay for the real download progress.
   Real GPU (not SwiftShader), MSAA on, shadows and transmissive glass on, 1.28x device scale (1280x820): rendered once, so it can be as good as it gets.
   Frames go straight into ffmpeg's stdin for transitions; loops need N+M frames (cross-dissolved into a seamless loop) and use a small temp folder on E:.
   One-take rules (checked and written to manifest.boundaries):
   - the four camera moves are spaced out in the demo timeline (window.__layout) so none overlaps the next, and every transition runs its move from the first to the last frame
     (t = start .. end inclusive): the last frame of a transition IS the pose of the next loop, the first frame of a transition is the pose of the previous loop;
   - loops have a still camera (window.__still, no breath, no sway); the scene's own activity (floating glass, train) runs on one continuous motion clock (window.__motionT);
     a loop is the clip [T-N/30 .. T+M/30] where the last M frames are dissolved into the first M, so the loop point is the natural continuation of the previous frame;
   - between field (glass unlit, the player lights it from the real progress) and to-unpack the camera pose is pinned (poseP) so only the glass state differs.
   node tools/setup-prerender.cjs [--theme light|dark|both] [--seg all|intro,welcome,...] [--draft] [--fps 30] [--crf 28] [--out setup/ui-web/video] [--preview H:/MeguLit-Work/setup-preview]
   Two themes run as two processes in parallel. A drive below 3 GB free pauses the render. */
const { spawn, execFileSync } = require('child_process'), fs = require('fs'), path = require('path'), http = require('http'), zlib = require('zlib');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const THEME = arg('theme', 'both'), SEGSEL = arg('seg', 'all'), DRAFT = !!arg('draft', false), FPS = +arg('fps', 30), CRF = +arg('crf', DRAFT ? 40 : 23), M = 20;
const OUT = path.resolve(arg('out', path.join(__dirname, '..', 'setup', 'ui-web', 'video'))), TMP = path.resolve(arg('tmp', 'E:/try/prerender-tmp')), PREVIEW = path.resolve(arg('preview', 'H:/MeguLit-Work/setup-preview'));
const W = DRAFT ? 640 : 1920, H = DRAFT ? 410 : 1230, DPR = W / 1000;
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', FFMPEG = process.env.FFMPEG || 'D:/ffmpeg/bin/ffmpeg';
const PAGE = 'file:///' + path.resolve(__dirname, '../setup/ui-web/index.html').replace(/\\/g, '/');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) => http.get(u, (r) => { let d = ''; r.on('data', (x) => d += x); r.on('end', () => res(d)); }).on('error', rej));
const freeGB = (p) => { try { let q = path.resolve(p); while (!fs.existsSync(q)) q = path.dirname(q); const s = fs.statfsSync(q); return s.bavail * s.bsize / 1073741824; } catch (e) { return 99; } };
const LAYOUT = { under: 5.3, dive: 9.0, pull: 11.5 }, MV = { skim: 2.6, under: 3.4, dive: 2.2, pull: 4.4 };

/* T = transition (plays once), L = loop. opt = what Demo.seek gets; the camera of a loop is the end pose of the transition before it */
function segments(D) {
  const T0 = D.t0, P = 0.5, blank = { blank: true, poseP: P }, field = { blank: true, poseP: P };
  const lit = (phase, extra) => Object.assign({ state: 'done', phase }, extra || {});
  return [
    { id: 'intro', kind: 'transition', n: 72, next: 'welcome', glass: true, t0: 0, t1: T0 - 0.001, opt: blank },
    { id: 'welcome', kind: 'loop', n: 120, glass: true, tHold: T0 - 0.001, opt: blank },
    { id: 'to-loc', kind: 'transition', n: 72, next: 'loc', glass: true, t0: T0, t1: T0 + MV.skim, opt: blank },
    { id: 'loc', kind: 'loop', n: 120, glass: true, tHold: T0 + MV.skim + 0.1, opt: blank },
    { id: 'to-field', kind: 'transition', n: 102, next: 'field', glass: true, t0: LAYOUT.under, t1: LAYOUT.under + MV.under, opt: field },
    { id: 'field', kind: 'loop', n: 180, glass: true, tHold: LAYOUT.under + MV.under + 0.1, opt: field },
    { id: 'to-unpack', kind: 'transition', n: 66, next: 'unpack', glass: false, t0: LAYOUT.dive, t1: LAYOUT.dive + MV.dive, opt: field },
    { id: 'unpack', kind: 'loop', n: 90, glass: false, tHold: LAYOUT.dive + MV.dive + 0.1, opt: field },
    { id: 'to-done', kind: 'transition', n: 132, next: 'done', glass: false, t0: LAYOUT.pull, t1: LAYOUT.pull + MV.pull, opt: lit('done') },
    { id: 'done', kind: 'loop', n: 180, glass: false, tHold: LAYOUT.pull + MV.pull + 0.1, opt: lit('done') },
  ];
}
const ffmpegSync = (args) => execFileSync(FFMPEG, ['-y', '-loglevel', 'error'].concat(args), { stdio: ['ignore', 'ignore', 'inherit'] });
function ssim(a, b) { try { const r = require('child_process').spawnSync(FFMPEG, ['-loglevel', 'info', '-i', a, '-i', b, '-lavfi', 'ssim', '-f', 'null', '-'], { encoding: 'utf8' }); const m = /All:([0-9.]+)/.exec(r.stderr || ''); return m ? +m[1] : null; } catch (e) { return null; } }
const encArgs = (outFile) => ['-c:v', 'libx264', '-preset', DRAFT ? 'veryfast' : 'slow', '-crf', String(CRF), '-pix_fmt', 'yuv420p', '-g', '600', '-movflags', '+faststart', '-an', outFile];
const scaleF = `scale=${W}:${H}:flags=lanczos`;

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
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `window.__layout=${JSON.stringify(LAYOUT)};window.__still=false;window.__glassSlow=0.2;` });
  await cdp('Page.navigate', { url: `${PAGE}?theme=${theme === 'dark' ? 'night' : 'edge'}&demo=1&paused=1&prerender=1${DRAFT ? '' : '&aa=1'}` }); await sleep(6000); await ev('document.fonts.ready.then(()=>1)');
  const D = await ev('({t0:Demo.T0,u0:Demo.U0,done:Demo.DONE,dur:Demo.DURATION,gl:!!(window.GL&&GL.ok),dpr:devicePixelRatio})'); if (!D.gl) throw new Error('no WebGL in the render browser');
  const info = await ev('(function(){Demo.seek(4.85,{blank:true});return GL.plateInfo()})()'); log('plates', info.plates.length, 'cores', info.cores);
  const manifest = { version: 1, theme, width: W, height: H, fps: FPS, draft: DRAFT, segments: [], boundaries: [], motion: {}, bytes: 0 };
  const t00 = Date.now(); let G = 1000, prev = null; const ends = {}, motion = manifest.motion;   /* G = motion clock of the next transition's first frame */
  const seek = async (sg, tState, motionT, still, loop, trainOff, optOver) => {
    await ev(`window.__still=${still};window.__motionT=${motionT};window.__trainOff=${trainOff === undefined ? 20000 : trainOff};${loop ? `window.__loopPhi=${loop.phi};window.__loopBase=${loop.base}` : 'delete window.__loopPhi'};Demo.seek(${tState},${JSON.stringify(optOver || sg.opt)});new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
  };
  const shot = async (...args) => { await seek(...args); const r = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 92 }); return Buffer.from(r.result.data, 'base64'); };
  /* mean on-screen speed of the glass plates (video px per frame) of a loop with excursion scale A, measured on ~30 sampled frames without encoding anything */
  const glassSpeed = async (sg, Te, A) => { await ev(`window.__loopA=${A}`); const n = sg.n, step = Math.max(1, Math.floor(n / 30)), pts = []; for (let i = 0; i < n; i += step) { await seek(sg, sg.tHold, Te, true, { phi: 2 * Math.PI * i / n, base: Te }); const o = await ev('GL.outlines(1000,640)'); pts.push((o || []).map((p) => { if (!p) return null; let x = 0, y = 0; for (let q = 0; q < p.length; q += 2) { x += p[q]; y += p[q + 1]; } return [x / (p.length / 2) * 1.28, y / (p.length / 2) * 1.28]; })); } const sp = []; for (let k = 1; k < pts.length; k++) for (let j = 0; j < pts[k].length; j++) if (pts[k][j] && pts[k - 1][j]) sp.push(Math.hypot(pts[k][j][0] - pts[k - 1][j][0], pts[k][j][1] - pts[k - 1][j][1]) / step); return sp.length ? sp.reduce((x, y) => x + y, 0) / sp.length : 0; };
  for (const sg of segments(D)) {
    while (freeGB(TMP) < 3 || freeGB(OUT) < 3) { log('PAUSED: a drive has less than 3 GB free'); await sleep(30000); }
    if (SEGSEL !== 'all' && !SEGSEL.split(',').includes(sg.id)) { if (sg.kind === 'transition') G += sg.n / FPS; continue; }   /* a skipped segment still advances the motion clock like a rendered one */
    const n = sg.n, file = path.join(dir, sg.id + '.mp4'), polys = [], ts = Date.now(); let first, last, second; const cams = [];
    const cent = []; const glassOf = async () => { if (!sg.glass) return; const o = await ev('GL.outlines(1000,640)'); polys.push((o || []).map((p) => p ? p.map((v) => Math.round(v * (1280 / 1000) * 4)) : null)); };
    if (sg.kind === 'transition') {
      const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-vf', scaleF].concat(encArgs(file)), { stdio: ['pipe', 'ignore', 'inherit'] }); const done = new Promise((r) => ff.on('close', r));
      for (let i = 0; i < n; i++) {
        let opt = sg.opt;
        if (sg.id === 'to-done' && i < 0.2 * FPS) {
          const t = i / (0.2 * FPS);
          opt = { ...opt, etchMix: t * t * (3 - 2 * t) };
        }
        const buf = await shot(sg, sg.t0 + (sg.t1 - sg.t0) * i / (n - 1), G + i / FPS, true, null, sg.train ? -6500 + 9000 * i / (n - 1) : undefined, opt); { const q = await ev('(function(){var c=GL.camera;return [c.position.x,c.position.y,c.position.z,c.quaternion.x,c.quaternion.y,c.quaternion.z,c.quaternion.w]})()'); cams.push(q); }
      if (i === 0) first = buf; if (i === 1) second = buf; if (i === n - 1) last = buf; if (i === 0) fs.writeFileSync(path.join(dir, sg.id + '.jpg'), buf); if (!ff.stdin.write(buf)) await new Promise((res) => ff.stdin.once('drain', res)); await glassOf(); }
      ff.stdin.end(); await done; var tEnd = G + (n - 1) / FPS; const lin = [], ang = []; for (let k = 1; k < cams.length; k++) { const a = cams[k - 1], b = cams[k]; lin.push(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])); const dot = Math.abs(a[3] * b[3] + a[4] * b[4] + a[5] * b[5] + a[6] * b[6]); ang.push(2 * Math.acos(Math.min(1, dot))); }
      const stat = (v) => { const avg = v.reduce((x, y) => x + y, 0) / v.length, pk = Math.max(...v); return { avg: +avg.toFixed(4), peak: +pk.toFixed(4), ratio: avg > 1e-9 ? +(pk / avg).toFixed(2) : null }; }; motion[sg.id] = { linear: stat(lin), angular: stat(ang) }; log(`motion ${sg.id}: peak/avg linear ${motion[sg.id].linear.ratio}, angular ${motion[sg.id].angular.ratio}`);
      ends[sg.id] = { first, last, second }; G = tEnd + 1 / FPS;   // the next frame in time
    } else {
      /* loop: n frames of the still camera; the floating glass runs one full periodic cycle that starts from the motion clock value the previous transition ended on, so the loop point is seamless
         without any dissolve and the first frame continues the previous transition */
      const Te = G - 1 / FPS; let A = 0.016 * n / FPS; for (let pass = 0; pass < 2; pass++) { const m = await glassSpeed(sg, Te, A); if (m > 1e-6) A = Math.max(0.005, Math.min(1, A * 0.038 / m)); }   /* every loop gets the same slow on-screen glass speed (0.038 px/frame, what the welcome view has) */
      log(`loop ${sg.id}: glass excursion scale ${A.toFixed(4)}`); await ev(`window.__loopA=${A}`);
      const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-vf', scaleF].concat(encArgs(file)), { stdio: ['pipe', 'ignore', 'inherit'] }); const done = new Promise((r) => ff.on('close', r));
      for (let i = 0; i < n; i++) { const buf = await shot(sg, sg.tHold, Te, true, { phi: 2 * Math.PI * i / n, base: Te }); { const o = await ev('GL.outlines(1000,640)'); cent.push((o || []).map((p) => { if (!p) return null; let x = 0, y = 0; for (let q = 0; q < p.length; q += 2) { x += p[q]; y += p[q + 1]; } return [x / (p.length / 2) * 1.28, y / (p.length / 2) * 1.28]; })); } if (i === 0) { first = buf; fs.writeFileSync(path.join(dir, sg.id + '.jpg'), buf); } last = buf; if (!ff.stdin.write(buf)) await new Promise((res) => ff.stdin.once('drain', res)); await glassOf(); }
      ff.stdin.end(); await done; ends[sg.id] = { first, last };
      { const sp = []; for (let k = 1; k < cent.length; k++) for (let j = 0; j < cent[k].length; j++) if (cent[k][j] && cent[k - 1][j]) sp.push(Math.hypot(cent[k][j][0] - cent[k - 1][j][0], cent[k][j][1] - cent[k - 1][j][1])); const mean = sp.length ? sp.reduce((x, y) => x + y, 0) / sp.length : 0; manifest.glassSpeed = manifest.glassSpeed || {}; manifest.glassSpeed[sg.id] = { meanPxPerFrame: +mean.toFixed(4), peakPxPerFrame: +(sp.length ? Math.max(...sp) : 0).toFixed(3) }; log(`glass speed ${sg.id}: mean ${mean.toFixed(4)} px/frame, peak ${(sp.length ? Math.max(...sp) : 0).toFixed(3)}`); }
        }
    const bytes = fs.statSync(file).size; manifest.bytes += bytes;
    manifest.segments.push({ id: sg.id, kind: sg.kind, frames: n, next: sg.next || null, file: sg.id + '.mp4', poster: sg.id + '.jpg', bytes });
    log(`${sg.id}: ${n} frames, ${(bytes / 1048576).toFixed(2)} MB, ${((Date.now() - ts) / 1000).toFixed(0)} s (total ${((Date.now() - t00) / 1000).toFixed(0)} s, free E: ${freeGB(TMP).toFixed(0)} GB)`);
  }
  /* boundary check: last frame of a segment vs first frame of the next one in play order (a transition's first frame is the frame after a loop's last, and a loop's first frame follows the
     transition's last): SSIM of the raw renders, written to the manifest; a boundary passes when SSIM >= min(0.95, stepRef - 0.03), stepRef being the SSIM between the next segment's own first two frames (one natural frame step) */
  const order = ['intro', 'welcome', 'to-loc', 'loc', 'to-field', 'field', 'to-unpack', 'unpack', 'to-done', 'done'];
  for (let k = 0; k + 1 < order.length; k++) { const a = ends[order[k]], b = ends[order[k + 1]]; if (!a || !b) continue; const fa = path.join(work, 'a.jpg'), fb = path.join(work, 'b.jpg'); fs.writeFileSync(fa, a.last); fs.writeFileSync(fb, b.first); const sUnlit = ssim(fa, fb); let s = sUnlit, note; if (a.lastLit) { fs.writeFileSync(fa, a.lastLit); s = ssim(fa, fb); note = 'compared with the glass lit (the overlay lights it at 100%); unlit video frame: ' + sUnlit; } fs.writeFileSync(fa, b.first); const ref = ends[order[k + 1]].second ? (fs.writeFileSync(fb, ends[order[k + 1]].second), ssim(fa, fb)) : null; manifest.boundaries.push({ from: order[k], to: order[k + 1], ssim: s, stepRef: ref, note, ok: s !== null && s >= (ref !== null ? Math.min(0.95, ref - 0.03) : 0.95) }); }
  log('boundaries:', manifest.boundaries.map((b) => `${b.from}>${b.to} ${b.ssim}`).join(' | '));
  if (SEGSEL === 'all') fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
  /* stitched preview: every segment once (done twice), straight copy of the encoded files */
  if (SEGSEL === 'all') { fs.mkdirSync(PREVIEW, { recursive: true }); const lst = path.join(work, 'concat.txt'); fs.writeFileSync(lst, order.concat(['done']).map((s) => `file '${path.join(dir, s + '.mp4').replace(/\\/g, '/')}'`).join('\n')); ffmpegSync(['-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', path.join(PREVIEW, `installer-${theme}.mp4`)]); }
  log(`done: ${(manifest.bytes / 1048576).toFixed(2)} MB video in ${((Date.now() - t00) / 1000).toFixed(0)} s; boundaries ${manifest.boundaries.every((b) => b.ok) ? 'ALL OK' : 'SOME BELOW 0.95'}`);
  ws.close(); ch.kill(); await sleep(800); try { fs.rmSync(work, { recursive: true, force: true }); } catch (e) { /* busy */ }
  return manifest.bytes;
}
(async () => {
  if (THEME === 'both') {
    const kids = ['light', 'dark'].map((t) => new Promise((res) => { const c = spawn(process.execPath, [__filename, '--theme', t, '--seg', String(SEGSEL), '--fps', String(FPS), '--crf', String(CRF), '--out', OUT, '--tmp', TMP, '--preview', PREVIEW].concat(DRAFT ? ['--draft'] : []), { stdio: 'inherit' }); c.on('close', res); }));
    await Promise.all(kids); process.exit(0);
  }
  await renderTheme(THEME); process.exit(0);
})().catch((e) => { console.error('RENDER FAILED', e); process.exit(1); });
