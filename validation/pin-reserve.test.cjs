// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Owner 2026-11-21 (千恋＊万花: 「日文被挤上去」): an anchored line near the game's bottom edge; the translation lands 500 ms after the
   Japanese. The fit rules (button strip, below the window) take the row at the reserved room (translationReserve), so the first
   Japanese character is where it was on the first frame when the translation text arrives. */
const assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
let chromium;
try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch { console.log('SKIP pin reserve (no playwright-core)'); process.exit(0); }
const code = fs.readFileSync(process.env.MEGULIT_TEXT_PLACE || path.join(__dirname, '..', 'web', 'reader', 'modules', 'text-place.js'), 'utf8');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>.sentence-window{position:fixed;left:100px;bottom:20px;width:700px}
.sentence-text{font-size:22px;line-height:30px}.tomoyo-cn-row{display:block;font-size:20px;line-height:28px}</style></head><body><main><div class="sentence-window tomoyo-hook-reader">
<div class="sentence-text"></div><div class="tomoyo-cn-row"><span class="tomoyo-cn-output"></span></div></div></main><script>window.__tomoyoChinese={};</script></body></html>`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.setContent(html); await page.addScriptTag({ content: code });
    await page.evaluate(() => { const b = window.__tomoyoChinese; b.galLayoutInfo = () => ({ clientX: 0, clientY: 0, clientWidth: 1280, clientHeight: 700, workBottom: 720 });
      b.translationReserve = 90; b.textPlaceAnchor(true); b.textPlaceMode({ on: true, game: '1' }); });
    const line = '彼女はそう言って笑った。';
    const place = () => page.evaluate(line => { const s = document.querySelector('.sentence-text');
      if (!s.querySelector('.char-token')) { s.dataset.sequence = '1'; s.replaceChildren(...[...line].map(c => Object.assign(document.createElement('span'), { className: 'char-token', textContent: c }))); }
      window.__tomoyoChinese.textPlace({ text: line, client: [1280, 700], rects: [...line].map((c, i) => [200 + i * 24, 560, 22, 24]) }); }, line);
    const y = () => page.evaluate(() => document.querySelector('.sentence-text .char-token').getBoundingClientRect().top);
    await place(); await sleep(80); await place(); await sleep(80); const y0 = await y();
    await sleep(500);
    await page.evaluate(() => { document.querySelector('.tomoyo-cn-output').textContent = '她这么说着笑了。然后她又说了一句很长很长的话，长到要占三行才能放得下，一直说下去。'; });
    await place(); await sleep(120); const y1 = await y();
    assert.ok(Math.abs(y1 - y0) < 1, `first Japanese glyph moved ${y0} -> ${y1}`);
    console.log('PASS pin reserve: Japanese stays when the translation lands late (y=' + y0 + ')');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
