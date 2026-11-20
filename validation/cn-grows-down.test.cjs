// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* incr9 2026-11-21 (owner, 千恋＊万花 full screen, hook-events 22:54:35: 「電車を降りて、駅前で…」 placed, 41 characters, first box
   374,707,31,31 in client 1535x863 at clientY 102; reader-host: the Japanese first glyph at 735 instead of 809, over the name box
   【運転手】 at 787). Two Japanese rows + two translation rows near the game's bottom: the Japanese first row stays on the game's own
   text place, the translation grows down (smaller by at most 15 %), the block never moves up for it. */
const assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
let chromium;
try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch { console.log('SKIP cn grows down (no playwright-core)'); process.exit(0); }
const code = fs.readFileSync(process.env.MEGULIT_TEXT_PLACE || path.join(__dirname, '..', 'web', 'reader', 'modules', 'text-place.js'), 'utf8');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>.sentence-window{position:fixed;left:100px;bottom:20px;width:1100px}
.sentence-text{font-size:29px;line-height:44px}.tomoyo-cn-row{display:block;font-size:28px;line-height:38px}</style></head><body><main><div class="sentence-window tomoyo-hook-reader">
<div class="sentence-text"></div><div class="tomoyo-cn-row"><span class="tomoyo-cn-output"></span></div></div></main><script>window.__tomoyoChinese={};</script></body></html>`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const line = '電車を降りて、駅前でタクシーを捕まえたものの、いつの間にかうたたねしていたらしい。';
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await page.setContent(html); await page.addScriptTag({ content: code });
    await page.evaluate(() => { const b = window.__tomoyoChinese; b.galLayoutInfo = () => ({ clientX: 30, clientY: 102, clientWidth: 1535, clientHeight: 863, workBottom: 1000 });
      b.translationReserve = 76; b.textPlaceAnchor(true); b.textPlaceMode({ on: true, game: 'senren' }); });
    /* the game's two rows: 26 characters on the first (374..), the rest on the second, 46 px lower */
    const rects = [...line].map((c, i) => i < 26 ? [374 + i * 31, 707, 31, 31] : [374 + (i - 26) * 31, 753, 31, 31]);
    const place = () => page.evaluate(([line, rects]) => { const s = document.querySelector('.sentence-text');
      if (!s.querySelector('.char-token')) { s.dataset.sequence = '1'; s.replaceChildren(...[...line].map(c => Object.assign(document.createElement('span'), { className: 'char-token', textContent: c }))); }
      window.__tomoyoChinese.textPlace({ text: line, client: [1535, 863], rects }); }, [line, rects]);
    const y = () => page.evaluate(() => document.querySelector('.sentence-text .char-token').getBoundingClientRect().top);
    await place(); await sleep(80); await place(); await sleep(80); const y0 = await y();
    await page.evaluate(() => { document.querySelector('.tomoyo-cn-output').textContent = '下了电车，在站前拦了辆出租车，可不知什么时候好像打起了瞌睡。司机先生似乎在叫我。'; });
    await place(); await sleep(120); const y1 = await y();
    assert.ok(Math.abs(y0 - (102 + 707)) < 4, 'Japanese first row on the game\'s text place (809), got ' + y0);
    assert.ok(Math.abs(y1 - y0) < 1, 'the translation does not push the Japanese up: ' + y0 + ' -> ' + y1);
    console.log('PASS translation grows down: Japanese first row stays at ' + y1);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
