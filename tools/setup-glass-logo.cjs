/* Builds setup/glass-logo.png: the MeguLit logo as translucent pale-cyan glass fragments with rim highlights and fracture seams (the look of the installer video's closing
   logo), on a transparent background, 2x resolution, for the exe's native loading screen (desktop/src/runtime_setup.rs, per-pixel alpha).
   Headless Chrome 2D canvas does the compositing; the shape is setup/ui-web/logos/logo-A-white.svg, seams are a seeded Voronoi so the result is reproducible.
   node tools/setup-glass-logo.cjs [--out setup/glass-logo.png] [--preview H:/MeguLit-Work/setup-preview/glass-logo.png] [--width 1000] */
const { spawn } = require('child_process'), fs = require('fs'), path = require('path'), http = require('http');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const OUT = path.resolve(arg('out', path.join(__dirname, '../setup/glass-logo.png'))), PREVIEW = arg('preview', ''), W = +arg('width', 1000);
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const svg = fs.readFileSync(path.join(__dirname, '../setup/ui-web/logos/logo-A-white.svg'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), get = (u) => new Promise((res, rej) => http.get(u, (r) => { let d = ''; r.on('data', (x) => d += x); r.on('end', () => res(d)); }).on('error', rej));
const PAGE = `<!doctype html><meta charset=utf-8><body style="margin:0;background:transparent"><script>
window.build = async function (svgText, W, seed, wantPreview) {
  const vb = svgText.match(/viewBox="([\\d.\\s-]+)"/)[1].split(/\\s+/).map(Number), H = Math.round(W * vb[3] / vb[2]), PAD = Math.round(W * 0.04), CW = W + 2 * PAD, CH = H + 2 * PAD;
  const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText.replace('<svg ', '<svg width="' + W + '" height="' + H + '" ')); await img.decode();
  const mk = () => { const c = document.createElement('canvas'); c.width = CW; c.height = CH; return c; };
  const M = mk(), mx = M.getContext('2d'); mx.drawImage(img, PAD, PAD, W, H);   /* the shape (alpha) */
  const md = mx.getImageData(0, 0, CW, CH).data;
  /* seeded random */ let s = seed >>> 0; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  /* Voronoi cells over the logo: ~22 seeds, a little jittered grid so the pieces are even */
  const seeds = []; const cols = 7, rows = 3; for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) seeds.push([PAD + (i + 0.15 + rnd() * 0.7) * W / cols, PAD + (j + 0.15 + rnd() * 0.7) * H / rows, 0.82 + rnd() * 0.3]);
  const cell = new Int16Array(CW * CH), seam = new Float32Array(CW * CH);
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) { if (md[(y * CW + x) * 4 + 3] < 8) continue; let b = 1e18, b2 = 1e18, bi = 0; for (let k = 0; k < seeds.length; k++) { const dx = x - seeds[k][0], dy = y - seeds[k][1], d = dx * dx + dy * dy; if (d < b) { b2 = b; b = d; bi = k; } else if (d < b2) b2 = d; } cell[y * CW + x] = bi; const gap = Math.sqrt(b2) - Math.sqrt(b); seam[y * CW + x] = gap; }
  /* base glass: per-cell pale cyan with a diagonal sheen, alpha ~ .55-.8 */
  const out = mk(), ox = out.getContext('2d'), id = ox.createImageData(CW, CH), o = id.data;
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) { const p = y * CW + x, a0 = md[p * 4 + 3] / 255; if (a0 <= 0.02) continue; const sd = seeds[cell[p]], t = (x + y * 0.6) / (CW + CH * 0.6);
    let r = 205 + 30 * (1 - t) + (sd[2] - 1) * 40, g = 238 + 12 * (1 - t) + (sd[2] - 1) * 20, b = 250, a = 0.58 + 0.2 * (sd[2] - 0.82) + 0.1 * Math.sin(t * 9 + cell[p]);
    const gap = seam[p]; if (gap < 3.2) { const k = 1 - gap / 3.2; r += (255 - r) * k * 0.9; g += (255 - g) * k * 0.9; b = 255; a = Math.min(0.97, a + 0.4 * k); }   /* bright fracture seam */
    else if (gap < 6.5) { const k = (6.5 - gap) / 3.3; r -= 34 * k; g -= 22 * k; a = Math.min(0.95, a + 0.1 * k); }   /* its soft shadow edge */
    o[p * 4] = Math.max(0, Math.min(255, r)); o[p * 4 + 1] = Math.max(0, Math.min(255, g)); o[p * 4 + 2] = Math.max(0, Math.min(255, b)); o[p * 4 + 3] = Math.max(0, Math.min(255, a * a0 * 255)); }
  ox.putImageData(id, 0, 0);
  /* rim: top-left white edge light, bottom-right cool shadow edge, from the shape against itself shifted */
  const rim = (dx, dy, color, alpha) => { const L = mk(), lx = L.getContext('2d'); lx.drawImage(M, 0, 0); lx.globalCompositeOperation = 'destination-out'; lx.drawImage(M, dx, dy); lx.globalCompositeOperation = 'source-in'; lx.fillStyle = color; lx.fillRect(0, 0, CW, CH); ox.globalAlpha = alpha; ox.drawImage(L, 0, 0); ox.globalAlpha = 1; };
  const e = Math.max(2, Math.round(W / 330)); rim(e, e, '#ffffff', 0.95); rim(-e, -e, '#6fa9c8', 0.55); rim(Math.round(e * 0.5), Math.round(e * 0.5), '#ffffff', 0.7);
  /* soft outer glow so the glass reads on any wallpaper */
  const fin = mk(), fx = fin.getContext('2d'); fx.filter = 'blur(' + Math.round(W / 140) + 'px)'; fx.globalAlpha = 0.5; fx.drawImage(M, 0, 0); fx.filter = 'none'; fx.globalCompositeOperation = 'source-in'; fx.fillStyle = 'rgba(190,225,245,1)'; fx.fillRect(0, 0, CW, CH); fx.globalCompositeOperation = 'source-over'; fx.globalAlpha = 1; fx.drawImage(out, 0, 0);
  const res = { w: CW, h: CH, png: fin.toDataURL('image/png') };
  if (wantPreview) { const P = document.createElement('canvas'); P.width = CW; P.height = Math.round(CH * 1.2); const px = P.getContext('2d'); const g = px.createLinearGradient(0, 0, CW, P.height); g.addColorStop(0, '#3b5a82'); g.addColorStop(0.5, '#8aa8c6'); g.addColorStop(1, '#2b2f45'); px.fillStyle = g; px.fillRect(0, 0, CW, P.height); px.drawImage(fin, 0, Math.round(CH * 0.1)); res.preview = P.toDataURL('image/png'); }
  return res;
};
</script>`;
(async () => {
  const work = fs.mkdtempSync(path.join(require('os').tmpdir(), 'mgl-')), port = 9960 + Math.floor(Math.random() * 20), page = path.join(work, 'p.html'); fs.writeFileSync(page, PAGE);
  const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + path.join(work, 'p'), '--allow-file-access-from-files', '--window-size=1400,700', 'about:blank'], { stdio: 'ignore' });
  try {
    let list; for (let i = 0; i < 100; i++) { try { list = JSON.parse(await get(`http://127.0.0.1:${port}/json/list`)); if (list.find((x) => x.type === 'page')) break; } catch (e) { /* wait */ } await sleep(200); }
    const ws = new WebSocket(list.find((x) => x.type === 'page').webSocketDebuggerUrl); await new Promise((r) => ws.onopen = r);
    let id = 0; const pend = new Map(); ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
    const cdp = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
    await cdp('Page.enable'); await cdp('Page.navigate', { url: 'file:///' + page.replace(/\\/g, '/') }); await sleep(800);
    const r = await cdp('Runtime.evaluate', { expression: `window.build(${JSON.stringify(svg)}, ${W}, 20261121, ${PREVIEW ? 'true' : 'false'})`, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400));
    const v = r.result.result.value; fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, Buffer.from(v.png.split(',')[1], 'base64')); console.log('wrote', OUT, v.w + 'x' + v.h, (fs.statSync(OUT).size / 1024).toFixed(0) + ' KB');
    if (PREVIEW) { fs.mkdirSync(path.dirname(PREVIEW), { recursive: true }); fs.writeFileSync(PREVIEW, Buffer.from(v.preview.split(',')[1], 'base64')); fs.writeFileSync(PREVIEW.replace(/\.png$/, '-alpha.png'), Buffer.from(v.png.split(',')[1], 'base64')); console.log('preview', PREVIEW); }
    ws.close();
  } finally { try { ch.kill(); } catch (e) { /* gone */ } await sleep(400); try { fs.rmSync(work, { recursive: true, force: true }); } catch (e) { /* busy */ } }
  process.exit(0);
})();
