/* MeguLit logo refinements for the installer's anamorphic scene. NOT a redesign: every version starts from the repo's own vector
   logo (web/assets/megulit-logo.svg: the hat, the script wordmark, the explosion flare) and only cleans and recolours it.
     A  light refinement   : same logo, tidier palette (9 colours -> 6), no dirty tones
     B  medium simplifying : ink + paper + silver + one crimson; golds go silver
     C  mono + one red     : ink and paper only, a single crimson on the explosion flare
   Each has a light-background and a dark-background version (the dark one swaps ink and paper), plus an all-red layer that the
   installer uses for the progress "pour". PROPOSALS ONLY: no repo logo, app top bar or site file is changed.
   node tools/logo-proposals.cjs [sheetDir] -> setup/ui-web/logos/*.svg + logos.js, <sheetDir>/logo-proposals-v3.png */
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const root = path.resolve(__dirname, '..'), svgDir = path.join(root, 'setup/ui-web/logos'), sheetDir = path.resolve(process.argv[2] || 'H:/MeguLit-Work/setup-ui-redesign/logo');
fs.mkdirSync(svgDir, { recursive: true }); fs.mkdirSync(sheetDir, { recursive: true });
for (const f of fs.readdirSync(svgDir)) if (f.endsWith('.svg')) fs.rmSync(path.join(svgDir, f));
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const src = fs.readFileSync(path.join(root, 'web/assets/megulit-logo.svg'), 'utf8');
const VB = [340, 44, 3424, 1452];
const RED = '#c8203c', INK = '#15171c', PAPER = '#f6f2ec';
/* original colours: D79056 gold, EDB56E light gold, F4CB8E pale gold, 301919 / 44292A darks, 7A1F2B dark red, B22730 crimson, F1E0D2 cream, D05B34 flare */
const V = {
  A: { name: '轻度精修', light: { D79056: '#e39a4b', EDB56E: '#efb96b', F4CB8E: '#f6d092', '301919': '#231416', '44292A': '#392325', B22730: RED, '7A1F2B': '#8a1830', F1E0D2: '#f7ede2', D05B34: '#e2472f' },
    dark: { D79056: '#e39a4b', EDB56E: '#efb96b', F4CB8E: '#f6d092', '301919': '#efe6dc', '44292A': '#d8cdc2', B22730: '#e0364f', '7A1F2B': '#b02440', F1E0D2: '#14161b', D05B34: '#f05a3c' } },
  B: { name: '中度简化', light: { D79056: '#b9bec8', EDB56E: '#c9ced6', F4CB8E: '#d8dce3', '301919': INK, '44292A': INK, B22730: RED, '7A1F2B': INK, F1E0D2: PAPER, D05B34: RED },
    dark: { D79056: '#7c8391', EDB56E: '#8b92a0', F4CB8E: '#99a0ad', '301919': '#f3f4f6', '44292A': '#f3f4f6', B22730: '#e0364f', '7A1F2B': '#f3f4f6', F1E0D2: INK, D05B34: '#e0364f' } },
  C: { name: '单色 + 一点红', light: { D79056: INK, EDB56E: INK, F4CB8E: INK, '301919': INK, '44292A': INK, B22730: INK, '7A1F2B': INK, F1E0D2: '#ffffff', D05B34: RED },
    dark: { D79056: '#f3f4f6', EDB56E: '#f3f4f6', F4CB8E: '#f3f4f6', '301919': '#f3f4f6', '44292A': '#f3f4f6', B22730: '#f3f4f6', '7A1F2B': '#f3f4f6', F1E0D2: '#0f1115', D05B34: '#e0364f' } }
};
const recolor = (map) => src.replace(/fill="(#[0-9A-Fa-f]{6})"/g, (m, c) => `fill="${map[c.slice(1).toUpperCase()] || c}"`);
const redLayer = src.replace(/fill="(#[0-9A-Fa-f]{6})"/g, (m, c) => (c.toUpperCase() === '#F1E0D2' ? 'fill="none"' : `fill="${RED}"`));
for (const [k, v] of Object.entries(V)) {
  fs.writeFileSync(path.join(svgDir, `logo-${k}-black.svg`), recolor(v.light));
  fs.writeFileSync(path.join(svgDir, `logo-${k}-white.svg`), recolor(v.dark));
  fs.writeFileSync(path.join(svgDir, `logo-${k}-red.svg`), redLayer);
  /* the etch mask: every inked shape white, the cream letters left clear, so the lettering reads as clear glass inside a frosted mass */
  /* the full silhouette (letters included): the shape of the glass in the shattered-glass logo */
  fs.writeFileSync(path.join(svgDir, 'logo-sil.svg'), src.replace(/fill="(#[0-9A-Fa-f]{6})"/g, 'fill="#ffffff"'));
  fs.writeFileSync(path.join(svgDir, 'logo-etch.svg'), src.replace(/fill="(#[0-9A-Fa-f]{6})"/g, (m, c) => (c.toUpperCase() === '#F1E0D2' ? 'fill="none"' : 'fill="#ffffff"')));
}
/* 8 hand-placed seeds in logo units (viewBox 3424 x 1452): hat, M, e, g, u, L, it, flare. The installer cuts the logo into the 8 cells. */
const SEEDS = [[430, 330], [800, 1050], [1300, 740], [1760, 1130], [2220, 800], [2680, 1040], [3180, 1060], [3000, 250]];
const LG = { w: VB[2], h: VB[3], seeds: SEEDS };
fs.copyFileSync(path.join(root, 'web/assets/megulit-logo.svg'), path.join(svgDir, 'logo-orig.svg'));
fs.writeFileSync(path.join(svgDir, 'logos.js'), 'window.LOGOS=' + JSON.stringify({ A: LG, B: LG, C: LG }) + ';');
/* ---- sheet ---- */
const clipHalf = (poly, a, b, c) => { const out = []; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length], fp = a * p[0] + b * p[1] - c, fq = a * q[0] + b * q[1] - c; if (fp <= 0) out.push(p); if ((fp <= 0) !== (fq <= 0)) { const t = fp / (fp - fq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); } } return out; };
const cells = SEEDS.map((s, i) => { let poly = [[0, 0], [LG.w, 0], [LG.w, LG.h], [0, LG.h]]; SEEDS.forEach((q, j) => { if (j !== i) poly = clipHalf(poly, q[0] - s[0], q[1] - s[1], (q[0] * q[0] + q[1] * q[1] - s[0] * s[0] - s[1] * s[1]) / 2); }); return poly; });
const COL = ['#d6203f', '#2a6df4', '#12a36b', '#e89b1d', '#8a3ffc', '#00a3b4', '#e0457b', '#6b7280'];
const splitSvg = (svg) => svg.replace('</svg>', cells.map((p, i) => `<polygon transform="translate(${VB[0]} ${VB[1]})" points="${p.map((q) => q.map((v) => v.toFixed(0)).join(',')).join(' ')}" fill="${COL[i]}" fill-opacity=".12" stroke="${COL[i]}" stroke-width="10"/>`).join('') + '</svg>');
const iconSvg = (svg) => svg.replace(/viewBox="[^"]*"/, 'viewBox="340 44 1250 1000"');   /* hat + the M: what survives at 16 / 32 px */
function shot(html, png, w, h) { const f = path.join(sheetDir, '_t.html'); fs.writeFileSync(f, `<html><body style="margin:0;background:#fff">${html}</body></html>`); execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${w},${h}`, `--screenshot=${png}`, 'file:///' + f.replace(/\\/g, '/')], { stdio: 'ignore' }); }
const sz = (s, w, h) => s.replace('<svg ', `<svg style="width:${w}px;height:${h || 'auto'};display:block" `);
const tile = (bg, inner) => `<div style="background:${bg};padding:16px;border-radius:12px;display:flex;align-items:center;justify-content:center">${inner}</div>`;
const orig = sz(src, 470);
let rows = `<div style="margin-bottom:26px"><div style="font:700 18px 'Segoe UI','Microsoft YaHei UI';margin-bottom:8px">现有 logo（对照，来自 web/assets/megulit-logo.svg）</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">${tile('#fff', orig)}${tile('#14161b', orig)}</div></div>`;
for (const [k, v] of Object.entries(V)) {
  const L = recolor(v.light), D = recolor(v.dark);
  const ics = (svg, bg) => `<div style="display:flex;gap:16px;align-items:flex-end">${[16, 32, 64, 128].map((n) => `<div style="text-align:center"><div style="width:${n}px;height:${n}px">${iconSvg(svg).replace('<svg ', `<svg width="${n}" height="${n}" `)}</div><div style="font:10px sans-serif;opacity:.5;margin-top:4px">${n}</div></div>`).join('')}</div>`;
  rows += `<div style="margin-bottom:26px"><div style="font:700 18px 'Segoe UI','Microsoft YaHei UI';margin-bottom:8px">版本 ${k} · ${v.name}</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">${tile('#fff', sz(L, 470))}${tile('#14161b', sz(D, 470))}</div>
  <div style="display:grid;grid-template-columns:1fr 1fr 1.3fr;gap:12px;margin-top:12px">${tile('#fff', ics(L))}${tile('#14161b', ics(D))}${tile('#f1f2f5', sz(splitSvg(L), 420))}</div></div>`;
}
const sheet = `<div style="padding:26px;background:#eceef2;width:1000px;font-family:'Segoe UI','Microsoft YaHei UI';color:#111317"><div style="font-size:24px;font-weight:800">MeguLit logo 美化提案 v3 · 在现有 logo 上精修，不是重新设计</div><div style="opacity:.6;margin:4px 0 18px">三个版本都从仓库现有矢量 logo 出发，只整理颜色和层次。每个版本：浅底 / 深底 / 图标 16·32·64·128 / 被分成 8 片错视的示意（右下彩色块只是示意）。仅为提案，未替换任何现有文件</div>${rows}</div>`;
shot(sheet, path.join(sheetDir, 'logo-proposals-v3.png'), 1052, 2100);
fs.rmSync(path.join(sheetDir, '_t.html'), { force: true });
console.log('ok');
