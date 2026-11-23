// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-20 release check (CHAOS;CHILD rig, two-row box line in a window with room below it on the monitor): both rules hold at once.
   MeguLit's Japanese never enters the game's button strip (two glyph rows above the client bottom), and the translation keeps the
   user's size; when it would land on the strip it goes below the window. 84be64e7 skipped the strip rule whole when there was room
   below, and the Japanese third row sat on AUTO/SKIP. Headless Edge; skipped without playwright-core. */
const assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
let chromium;
try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch { console.log('SKIP two-row room below (no playwright-core)'); process.exit(0); }
const code = fs.readFileSync(process.env.MEGULIT_TEXT_PLACE || path.join(__dirname, '..', 'web', 'reader', 'modules', 'text-place.js'), 'utf8');
const text = '欲を言えばもう少し広さが欲しいところだが同じ渋谷でも去年住んでいた家賃のワンルームと比べれば雲泥の差だった';
const tokens = [...text].map(c => `<span class="char-token">${c}</span>`).join('');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
.sentence-window{position:fixed;left:100px;bottom:20px;width:1100px;height:150px}
.sentence-text{font-size:40px}.tomoyo-cn-row{display:block;font-size:30px;width:1000px}</style></head><body>
<main><div class="sentence-window tomoyo-hook-reader"><div class="sentence-text">${tokens}</div><div class="tomoyo-cn-row">要说的话还想再宽敞一点，但和去年住的破旧单间相比简直天壤之别。</div></div></main>
<script>window.__tomoyoChinese={};</script></body></html>`;
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.setContent(html); await page.addScriptTag({ content: code });
    /* game client 1456x819 at (200,100): client bottom 919 on the overlay, button strip from 919 - 2 x 40 = 839; work area down to 1040 */
    await page.evaluate(([n]) => { const b = window.__tomoyoChinese; b.galLayoutInfo = () => ({ clientX: 200, clientY: 100, clientWidth: 1456, clientHeight: 819, workBottom: 1040 }); b.textPlaceMode({ on: true }); b.textPlaceAnchor(true);
      /* two rows the game drew low in its box: 26 + rest characters, 40 px glyphs, rows at 700 and 748 (client) */
      const rects = []; for (let i = 0; i < n; i++) { const r = i < 26 ? 0 : 1; rects.push([150 + (i - r * 26) * 40, 700 + r * 48, 40, 40]); }
      b.textPlace({ text: document.querySelector('.sentence-text').textContent, client: [1456, 819], rects }); }, [[...text].length]);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 300)))));
    const m = await page.evaluate(() => { const s = document.querySelector('.sentence-text').getBoundingClientRect(), c = document.querySelector('.tomoyo-cn-row'), cr = c.getBoundingClientRect(); return { jpBottom: Math.round(s.bottom), cnTop: Math.round(cr.top), cnBottom: Math.round(cr.bottom), cnSize: parseFloat(getComputedStyle(c).fontSize) }; });
    const strip = 839, clientBottom = 919;
    assert.ok(m.jpBottom <= strip + 1, 'the Japanese stays above the button strip ' + JSON.stringify(m));
    assert.strictEqual(m.cnSize, 30, 'the translation keeps the user size while the monitor has room ' + JSON.stringify(m));
    assert.ok(m.cnBottom <= strip + 1 || m.cnTop >= clientBottom, 'the translation is not on the button strip ' + JSON.stringify(m));
    assert.ok(m.cnBottom <= 1040, 'inside the work area ' + JSON.stringify(m));
    console.log('ok two-row room below');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
