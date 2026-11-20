// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner's third recording, 千恋＊万花 中文版, real numbers from its log: client 1535x863 at y 102, a speaker row 【運転手】 and one
   line, 「先生您醒醒」 under them; he dragged 原文与译文间距 around -24..-26): the translation jumped between the box's free third row and
   below the window. Now it stays under its Japanese inside the box while it ends a glyph row above the client bottom, switches once each
   way over a full drag -30 -> 40 -> -30 (1 px steps), moves with the slider and is always whole on the screen. */
const assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
let chromium;
try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch { console.log('SKIP translation gap slider (no playwright-core)'); process.exit(0); }
const code = fs.readFileSync(process.env.MEGULIT_TEXT_PLACE || path.join(__dirname, '..', 'web', 'reader', 'modules', 'text-place.js'), 'utf8');
const text = '【運転手】「お客さんってば」';
const tokens = [...text].map(c => `<span class="char-token">${c}</span>`).join('');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>:root{--gap:0px}
.sentence-window{position:fixed;left:100px;bottom:20px;width:1100px;height:150px}
.sentence-text{font-size:30px}.tomoyo-cn-row{display:block;font-size:26px;width:1000px;margin-top:var(--gap)!important}</style></head><body>
<main><div class="sentence-window tomoyo-hook-reader"><div class="sentence-text">${tokens}</div><div class="tomoyo-cn-row">「先生您醒醒」</div></div></main>
<script>window.__tomoyoChinese={};</script></body></html>`;
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.setContent(html); await page.addScriptTag({ content: code });
    /* game client 1280x720 at (220,140) on a 1080 monitor: client bottom 860, button strip from 860 - 2 x 32 = 796 */
    const n = [...text].length;
    await page.evaluate(() => { const b = window.__tomoyoChinese; b.galLayoutInfo = () => ({ clientX: 192, clientY: 102, clientWidth: 1535, clientHeight: 863, workBottom: 1032 }); b.textPlaceMode({ on: true }); b.textPlaceAnchor(true); });
    const at = gap => page.evaluate(([n, gap]) => { document.documentElement.style.setProperty('--gap', gap + 'px');
      const rects = []; for (let i = 0; i < n; i++) rects.push(i < 5 ? [374 + i * 31, 707, 31, 31] : [374 + (i - 5) * 31, 747, 31, 31]);
      if (!window.__placed) { window.__placed = true; window.__tomoyoChinese.textPlace({ text: document.querySelector('.sentence-text').textContent, client: [1535, 863], rects }); } else dispatchEvent(new Event('resize')); /* a slider re-lays out the same line, it does not deliver it again */
      return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => { const s = document.querySelector('.sentence-text').getBoundingClientRect(), c = document.querySelector('.tomoyo-cn-row'), cr = c.getBoundingClientRect(), pad = 0;
        res({ gap, jpBottom: Math.round(s.bottom), cnTop: Math.round(cr.top + pad), cnBottom: Math.round(cr.bottom), size: parseFloat(getComputedStyle(c).fontSize) }); }))); }, [n, gap]);
    const sweep = []; for (let g = -30; g <= 40; g++) sweep.push(await at(g)); for (let g = 40; g >= -30; g--) sweep.push(await at(g));
    const clientBottom = 967, work = 1032, inBox = m => m.cnTop < clientBottom;
    let sw = 0; for (let i = 1; i < sweep.length; i++) if (inBox(sweep[i]) !== inBox(sweep[i - 1])) sw++;
    assert.ok(sw <= 2, 'one switch each way, got ' + sw + ' ' + JSON.stringify(sweep.map(m => [m.gap, m.cnTop])));
    for (const m of sweep) { assert.ok(m.cnBottom <= work - 8 + 1, 'whole on the screen ' + JSON.stringify(m)); assert.strictEqual(m.size, 26, 'size kept'); if (inBox(m)) assert.ok(Math.abs(m.cnTop - m.jpBottom - m.gap) <= 6, 'under its Japanese at the set gap ' + JSON.stringify(m)); else assert.ok(Math.abs(m.cnTop - clientBottom - 4) <= 2, 'against the window bottom ' + JSON.stringify(m)); }
    for (const m of sweep.slice(0, 71)) if (m.gap <= 0) assert.ok(inBox(m), 'the owner range (gap <= 0): in the box ' + JSON.stringify(m));
    for (let i = 1; i < 71; i++) assert.ok(sweep[i].cnTop >= sweep[i - 1].cnTop, 'moves down with the slider ' + JSON.stringify([sweep[i - 1], sweep[i]]));
    console.log('ok translation room multi: switches ' + sw);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
