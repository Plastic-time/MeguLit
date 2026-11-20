// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner's recording, windowed 千恋＊万花 中文版): two Japanese rows low in the game's box, a one-row translation, the game's
   button strip under the box, room on the monitor below the window. Dragging 原文与译文间距 made the translation jump between right
   under its Japanese and below the window, back and forth. Now: under its Japanese (at the set gap) while that stays off the
   button strip; once it would reach the strip, right against the window's bottom edge; one switch each way over a full drag, with
   hysteresis, and nothing far below the window. Headless Edge; skipped without playwright-core. */
const assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
let chromium;
try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch { console.log('SKIP translation gap slider (no playwright-core)'); process.exit(0); }
const code = fs.readFileSync(process.env.MEGULIT_TEXT_PLACE || path.join(__dirname, '..', 'web', 'reader', 'modules', 'text-place.js'), 'utf8');
const text = 'ですからね……奥まで行くのは勘弁してくださいよ、お客さん';
const tokens = [...text].map(c => `<span class="char-token">${c}</span>`).join('');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>:root{--gap:0px}
.sentence-window{position:fixed;left:100px;bottom:20px;width:1100px;height:150px}
.sentence-text{font-size:32px}.tomoyo-cn-row{display:block;font-size:26px;width:1000px;padding-top:var(--gap)}</style></head><body>
<main><div class="sentence-window tomoyo-hook-reader"><div class="sentence-text">${tokens}</div><div class="tomoyo-cn-row">所以……可不可以不进里面？</div></div></main>
<script>window.__tomoyoChinese={};</script></body></html>`;
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.setContent(html); await page.addScriptTag({ content: code });
    /* game client 1280x720 at (220,140) on a 1080 monitor: client bottom 860, button strip from 860 - 2 x 32 = 796 */
    const n = [...text].length;
    await page.evaluate(() => { const b = window.__tomoyoChinese; b.galLayoutInfo = () => ({ clientX: 220, clientY: 140, clientWidth: 1280, clientHeight: 720, workBottom: 1040 }); b.textPlaceMode({ on: true }); b.textPlaceAnchor(true); });
    const at = gap => page.evaluate(([n, gap]) => { document.documentElement.style.setProperty('--gap', gap + 'px');
      const rects = []; for (let i = 0; i < n; i++) { const r = i < 20 ? 0 : 1; rects.push([80 + (i - r * 20) * 32, 500 + r * 40, 32, 32]); }
      if (!window.__placed) { window.__placed = true; window.__tomoyoChinese.textPlace({ text: document.querySelector('.sentence-text').textContent, client: [1280, 720], rects }); } else dispatchEvent(new Event('resize')); /* a slider re-lays out the same line, it does not deliver it again */
      return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => { const s = document.querySelector('.sentence-text').getBoundingClientRect(), c = document.querySelector('.tomoyo-cn-row'), cr = c.getBoundingClientRect(), pad = parseFloat(getComputedStyle(c).paddingTop) || 0;
        res({ gap, jpBottom: Math.round(s.bottom), cnTop: Math.round(cr.top + pad), cnBottom: Math.round(cr.bottom), size: parseFloat(getComputedStyle(c).fontSize) }); }))); }, [n, gap]);
    const sweep = []; for (let g = 0; g <= 80; g += 2) sweep.push(await at(g)); for (let g = 80; g >= 0; g -= 2) sweep.push(await at(g));
    const clientBottom = 860, strip = 796, under = m => m.cnTop < clientBottom;
    let switches = 0; for (let i = 1; i < sweep.length; i++) if (under(sweep[i]) !== under(sweep[i - 1])) switches++;
    assert.ok(switches <= 2, 'one switch each way over a full drag, got ' + switches + ': ' + JSON.stringify(sweep.map(m => [m.gap, m.cnTop])));
    for (const m of sweep) {
      assert.strictEqual(m.size, 26, 'the translation keeps its size ' + JSON.stringify(m));
      if (under(m)) { assert.ok(Math.abs(m.cnTop - m.jpBottom - m.gap) <= 6, 'under its Japanese at the set gap ' + JSON.stringify(m)); assert.ok(m.cnBottom <= strip + 32 * .25 + 1, 'not on the button strip ' + JSON.stringify(m)); }
      else assert.ok(m.cnTop - m.gap >= clientBottom && m.cnTop - m.gap <= clientBottom + 8, 'right against the window bottom, never further ' + JSON.stringify(m));
    }
    /* continuous while under: each 2 px of gap moves it by about 2 px */
    for (let i = 1; i < sweep.length; i++) if (under(sweep[i]) && under(sweep[i - 1])) assert.ok(Math.abs(Math.abs(sweep[i].cnTop - sweep[i - 1].cnTop) - 2) <= 3, 'continuous ' + JSON.stringify([sweep[i - 1], sweep[i]]));
    /* the owner's drag: small moves back and forth right at the threshold. Without hysteresis every move crossed it and the
       translation jumped each time; now it switches at most once and then stays */
    const up = sweep.findIndex(m => !under(m)); assert.ok(up > 0, 'the drag crosses the threshold');
    const g0 = sweep[up].gap, jitter = [];
    for (let k = 0; k < 10; k++) jitter.push(await at(k % 2 ? g0 : g0 - 2));
    let flips = 0; for (let i = 1; i < jitter.length; i++) if (under(jitter[i]) !== under(jitter[i - 1])) flips++;
    assert.ok(flips <= 1, 'no jumping back and forth at the threshold, flips ' + flips + ': ' + JSON.stringify(jitter.map(m => [m.gap, m.cnTop])));
    console.log('ok translation gap slider: switches ' + switches + ', flips at the threshold ' + flips);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
