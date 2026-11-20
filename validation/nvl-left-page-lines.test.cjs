// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Owner's STEINS;GATE r25 (2026-11-21): on a left-aligned full NVL page the earlier lines could not be clicked or dragged for
   lookup; only the current line took clicks. Replay in anchor mode: a line, then the next line drawn under it on the same page,
   with the page's earlier line in .tome-page-lines as hook-reader.js builds it (one .tome-page-char per character). The earlier
   line must be shown and inside the reported hit regions; a fresh text box (ADV, the next line at the same top) still shows only
   its own line. Headless Edge (MEGULIT_PLAYWRIGHT). */
const assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
let chromium;
try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch { console.log('SKIP (no playwright-core)'); process.exit(0); }
const dir = path.join(__dirname, '..', 'web', 'reader', 'modules');
const placeCode = fs.readFileSync(path.join(dir, 'text-place.js'), 'utf8'), hitCode = fs.readFileSync(path.join(dir, 'interaction.js'), 'utf8');
const tok = t => [...t].map(c => '<span class="char-token">' + c + '</span>').join('');
const pageLine = t => '<div>' + [...t].map(c => '<span class="tome-page-char">' + c + '</span>').join('') + '</div>';
const html = `<!doctype html><html><head><meta charset="utf-8"><style>.sentence-window{position:fixed;left:40px;bottom:30px;width:1100px}.sentence-text{font-size:30px}</style></head><body class="tomoyo-gal-bound">
<main><div class="sentence-window tomoyo-hook-reader"><div class="sentence-text"></div><div class="tomoyo-cn-row"></div></div></main>
<script>window.__tomoyoChinese={};window.__regions=[];window.__tomoyoTranslateRequest=s=>{const m=JSON.parse(s);if(m.type==='galHitRegions')window.__regions=m.regions;};</script></body></html>`;
const row = (n, x, y) => Array.from({ length: n }, (_, i) => [x + i * 30, y, 30, 34]);
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.setContent(html); await page.addScriptTag({ content: placeCode }); await page.addScriptTag({ content: hitCode });
    await page.evaluate(() => { const b = window.__tomoyoChinese; b.textPlaceAnchor(false); b.textPlaceMode({ on: true }); b.textPlaceAnchor(true); });
    const place = async (earlier, text, rects) => { await page.evaluate(([e, t, r]) => { window.__seq = (window.__seq || 0) + 1; document.querySelector('.sentence-text').dataset.sequence = String(window.__seq); document.querySelector('.sentence-text').innerHTML = (e ? '<div class="tome-page-lines">' + e + '</div>' : '') + r.html; window.__tomoyoChinese.textPlace({ text: t, client: [1280, 720], rects: r.rects }); }, [earlier, text, { html: tok(text), rects }]); await page.waitForTimeout(400); };
    const first = 'すぐに繋がった。', next = '電話をかけるとオートで繋がるようになっているのだ。';
    await place('', first, row([...first].length, 60, 100));
    await place(pageLine(first), next, row([...next].length, 60, 160));
    const r = await page.evaluate(() => { const l = document.querySelector('.tome-page-lines>div'), st = getComputedStyle(document.querySelector('.tome-page-lines')), c = l.querySelector('.tome-page-char').getBoundingClientRect(), x = c.left + c.width / 2, y = c.top + c.height / 2;
      return { shown: st.display !== 'none', hit: (window.__regions || []).some(q => !q.pass && x >= q.x && x < q.x + q.width && y >= q.y && y < q.y + q.height), fresh: document.querySelector('.sentence-window').classList.contains('megulit-page-fresh') }; });
    assert.strictEqual(r.fresh, false, 'the next line under the first is the same page');
    assert.ok(r.shown, 'the page\'s earlier line is shown on a left-aligned page that goes on');
    assert.ok(r.hit, 'and takes clicks (inside the hit regions)');
    /* ADV: the next line at the same top is a fresh box: only its own line */
    const third = '「まゆしぃの声、聞こえてきたー？」';
    await place(pageLine(first) + pageLine(next), third, row([...third].length, 60, 100));
    const adv = await page.evaluate(() => ({ fresh: document.querySelector('.sentence-window').classList.contains('megulit-page-fresh'), shown: getComputedStyle(document.querySelector('.tome-page-lines')).display !== 'none' }));
    assert.deepStrictEqual(adv, { fresh: true, shown: false }, 'a fresh box shows only its own line');
    console.log('PASS earlier lines of a left-aligned page are shown and take clicks; a fresh box shows only its line');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
