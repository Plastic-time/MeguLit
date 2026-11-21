// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Owner's STEINS;GATE r25 (2026-11-21, 「所有上去的文字没办法点读和拖动来查」): on a full NVL page only the current sentence took
   clicks (618 clicks, the 30 taken all on the current row); the page's earlier lines, drawn by MeguLit, let clicks through to
   the game. Replay: an armed page (earlier lines + the current one) placed by text-place.js, interaction.js reporting the hit
   regions as the overlay does. Every line's first character must be inside a reported region. Headless Edge. */
const assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
let chromium;
try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch { console.log('SKIP (no playwright-core)'); process.exit(0); }
const dir = path.join(__dirname, '..', 'web', 'reader', 'modules');
const placeCode = fs.readFileSync(path.join(dir, 'text-place.js'), 'utf8'), hitCode = fs.readFileSync(path.join(dir, 'interaction.js'), 'utf8');
const P = 30, H = 34; let y = 40;
const lay = t => { const r = []; let x = 60; for (const c of t) { if (x + P > 60 + P * 36) { x = 60; y += H * 1.6; } r.push([x, y, P, H]); x += P; } y += H * 1.6; return r; };
const lines = ['すぐに繋がった。', '電話をかけるとオートで繋がるようになっているのだ。', '流れてきたのはまゆりによる音声ガイダンスだ。'].map((t, i) => ({ id: i + 1, text: t, rects: lay(t) }));
const cur = '「まゆしぃの声、聞こえてきたー？」'; lines.push({ id: 9, text: cur, rects: lay(cur) });
const html = `<!doctype html><html><head><meta charset="utf-8"><style>.sentence-window{position:fixed;left:40px;bottom:30px;width:1200px}</style></head><body class="tomoyo-gal-bound">
<main><div class="sentence-window tomoyo-hook-reader"><div class="sentence-text">${[...cur].map(c => `<span class="char-token">${c}</span>`).join('')}</div><div class="tomoyo-cn-row">“我听到真由志的声音了？”</div></div></main>
<script>window.__tomoyoChinese={};window.__regions=[];window.__tomoyoTranslateRequest=s=>{const m=JSON.parse(s);if(m.type==='galHitRegions')window.__regions=m.regions;};</script></body></html>`;
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.setContent(html); await page.addScriptTag({ content: placeCode }); await page.addScriptTag({ content: hitCode });
    await page.evaluate(lines => { const b = window.__tomoyoChinese; b.textPlaceMode({ on: true }); b.textPlacePage({ awake: true, armed: true, client: [1280, 720], lines }); }, lines);
    await page.waitForTimeout(1600);
    const got = await page.evaluate(lines => {
      const regions = window.__regions || [], inside = (x, y) => regions.some(r => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height);
      return lines.map(l => { const [x, y, w, h] = l.rects[0]; return { text: l.text.slice(0, 6), hit: inside(x + w / 2, y + h / 2) }; });
    }, lines);
    const shown = await page.evaluate(() => [...document.querySelectorAll('.megulit-old-line')].map(n => getComputedStyle(n).display + '/' + getComputedStyle(n).visibility).join(','));
    for (const g of got) assert.ok(g.hit, 'line 「' + g.text + '」 takes the click (regions ' + JSON.stringify(got) + ', old lines ' + shown + ')');
    console.log('PASS every line of the page takes clicks');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
