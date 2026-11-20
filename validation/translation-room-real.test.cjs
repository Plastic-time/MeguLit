// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner's second recording, 千恋＊万花 中文版, window almost the whole screen, real numbers from its log: client 1535x863 at y 135,
   first box 374,707,31,31, one Japanese row): the translation went under the window onto the taskbar and off the screen while the
   gap slider moved between -19 and -28. With room under its Japanese inside the box it stays there for every gap, and is always
   whole on the screen. Headless Edge; skipped without playwright-core. */
const assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
let chromium;
try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch { console.log('SKIP translation gap slider (no playwright-core)'); process.exit(0); }
const code = fs.readFileSync(process.env.MEGULIT_TEXT_PLACE || path.join(__dirname, '..', 'web', 'reader', 'modules', 'text-place.js'), 'utf8');
const text = 'あっ、はい、なんですか？';
const tokens = [...text].map(c => `<span class="char-token">${c}</span>`).join('');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>:root{--gap:0px}
.sentence-window{position:fixed;left:100px;bottom:20px;width:1100px;height:150px}
.sentence-text{font-size:30px}.tomoyo-cn-row{display:block;font-size:26px;width:1000px;margin-top:var(--gap)!important}</style></head><body>
<main><div class="sentence-window tomoyo-hook-reader"><div class="sentence-text">${tokens}</div><div class="tomoyo-cn-row">啊，不好意思。怎么了？</div></div></main>
<script>window.__tomoyoChinese={};</script></body></html>`;
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.setContent(html); await page.addScriptTag({ content: code });
    /* game client 1280x720 at (220,140) on a 1080 monitor: client bottom 860, button strip from 860 - 2 x 32 = 796 */
    const n = [...text].length;
    await page.evaluate(() => { const b = window.__tomoyoChinese; b.galLayoutInfo = () => ({ clientX: 192, clientY: 92, clientWidth: 1535, clientHeight: 863, workBottom: 1032 }); b.textPlaceMode({ on: true }); b.textPlaceAnchor(true); });
    const at = gap => page.evaluate(([n, gap]) => { document.documentElement.style.setProperty('--gap', gap + 'px');
      const rects = []; for (let i = 0; i < n; i++) rects.push([374 + i * 31, 707, 31, 31]);
      if (!window.__placed) { window.__placed = true; window.__tomoyoChinese.textPlace({ text: document.querySelector('.sentence-text').textContent, client: [1535, 863], rects }); } else dispatchEvent(new Event('resize')); /* a slider re-lays out the same line, it does not deliver it again */
      return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => { const s = document.querySelector('.sentence-text').getBoundingClientRect(), c = document.querySelector('.tomoyo-cn-row'), cr = c.getBoundingClientRect(), pad = 0;
        res({ gap, jpBottom: Math.round(s.bottom), cnTop: Math.round(cr.top + pad), cnBottom: Math.round(cr.bottom), size: parseFloat(getComputedStyle(c).fontSize) }); }))); }, [n, gap]);
    const sweep = []; for (let g = -28; g <= 40; g += 1) sweep.push(await at(g)); for (let g = 40; g >= -28; g -= 3) sweep.push(await at(g));
    const clientBottom = 955, strip = 955 - 2 * 30, work = 1032;
    for (const m of sweep) { assert.ok(m.cnBottom <= work - 8 + 1, 'whole on the screen ' + JSON.stringify(m));
      if (m.cnTop < clientBottom) { assert.ok(m.cnBottom <= strip + 30 * .25 + 1, 'off the button strip ' + JSON.stringify(m)); assert.ok(Math.abs(m.cnTop - m.jpBottom - m.gap) <= 6, 'at the set gap ' + JSON.stringify(m)); }
      else assert.ok(Math.abs(m.cnTop - clientBottom - 4) <= 2, 'right against the window bottom ' + JSON.stringify(m)); }
    /* the owner's slider range (-28..-19) and every small gap: room under the Japanese inside the box, so it stays there */
    for (const m of sweep) if (m.gap <= 0) assert.ok(m.cnTop < clientBottom, 'under its Japanese inside the box ' + JSON.stringify(m));
    /* no room under the window (it reaches the work area bottom): never below it */
    await page.evaluate(() => { window.__tomoyoChinese.galLayoutInfo = () => ({ clientX: 192, clientY: 92, clientWidth: 1535, clientHeight: 863, workBottom: 1032 }); });
    /* MeguLit's surface ends 6 px under the game window (it spans the reader and the game, not the desktop): nothing past it is seen */
    await page.setViewportSize({ width: 1920, height: 961 });
    for (let g = -28; g <= 40; g += 4) { const m = await at(g); assert.ok(m.cnBottom <= 961 - 8 + 1, 'whole on the surface ' + JSON.stringify(m)); }
    console.log('ok translation room real: ' + sweep.length + ' gaps');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
