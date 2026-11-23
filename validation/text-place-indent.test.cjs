// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-19 (audit of 528a2bae): a game that indents narration by one full-width space and starts dialogue at the margin gave
   two anchors one character apart; the anchored line jumped sideways at every change between narration and dialogue. On the
   same row a start up to about one and a half characters off is the same text box: the line stays put (at the leftmost). */
const assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
let chromium;
try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch { console.log('SKIP text-place indent (no playwright-core)'); process.exit(0); }
const code = fs.readFileSync(path.join(__dirname, '..', 'web', 'reader', 'modules', 'text-place.js'), 'utf8');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
.sentence-window{position:fixed;left:100px;bottom:20px;width:800px;height:150px}
.tomoyo-cn-row{display:block}</style></head><body>
<main><div class="sentence-window tomoyo-hook-reader"><div class="sentence-text"><span class="char-token">今</span><span class="char-token">日</span><span class="char-token">は</span><span class="char-token">晴</span><span class="char-token">れ</span></div><div class="tomoyo-cn-row">今天是晴天</div></div></main>
<script>window.__tomoyoChinese={};</script></body></html>`;
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.setContent(html); await page.addScriptTag({ content: code });
    const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const first = () => page.evaluate(() => { const r = document.querySelector('.sentence-text .char-token').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; });
    const send = (text, x, y = 560) => page.evaluate(([text, x, y]) => { const b = window.__tomoyoChinese; b.textPlace({ text, client: [1280, 720], rects: [...text].map((c, i) => [x + i * 40, y, 40, 40]) }); }, [text, x, y]);
    await page.evaluate(() => { const b = window.__tomoyoChinese; b.galPreferences = () => ({}); b.galLayoutInfo = () => ({ clientX: 0, clientY: 0, clientWidth: 1280, clientHeight: 720 }); b.textPlaceMode({ on: true }); b.textPlaceAnchor(true); });
    /* narration: one full-width space, its characters from 470 */
    await send('　今日は晴れ', 430); await frame(); assert.deepStrictEqual(await first(), [470, 560], 'narration on its own place');
    /* dialogue at the margin (430): one move to the leftmost, then still */
    await send('今日は晴れ', 430); await frame(); assert.deepStrictEqual(await first(), [430, 560]);
    await send('　今日は晴れ', 430); await frame(); assert.deepStrictEqual(await first(), [430, 560], 'back to narration: no jump');
    await send('今日は晴れ', 430); await frame(); assert.deepStrictEqual(await first(), [430, 560]);
    /* another text box (a real move) still moves the line */
    await send('今日は晴れ', 200, 300); await frame(); assert.deepStrictEqual(await first(), [200, 300], 'another box moves it');
    await send('今日は晴れ', 430 + 200, 300); await frame(); assert.deepStrictEqual(await first(), [630, 300], 'far on the same row moves it');
    console.log('ok text-place indent');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
