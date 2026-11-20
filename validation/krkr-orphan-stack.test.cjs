// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Owner's ファタモルガーナの館 test 2026-11-21 06:48 (r33/22.png: 「屏幕中间不知道是啥」, a clump of characters on one place, and
   「一二行出来的话经常全部叠在一起」). The game's text effect redraws one place again and again; the placement brings each frame's
   text (r33: 「………自分……の自死体…分…の自だ…分。自の死体分だの。体死分だ」 before the clean 「その瞬間、私は死体を見下ろしていた。」).
   The orphan path drew every frame that stayed 450 ms as its own line on the same boxes. Replay on the krkr-hidden-drawn page:
   frames of one line at one place leave one line (the last); an interleaved frame (two characters on one box) is never drawn. */
const assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
let chromium;
try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch { console.log('SKIP krkr orphan stack (no playwright-core)'); process.exit(0); }
const code = fs.readFileSync(process.env.MEGULIT_TEXT_PLACE || path.join(__dirname, '..', 'web', 'reader', 'modules', 'text-place.js'), 'utf8');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>.sentence-window{position:fixed;left:100px;bottom:20px;width:700px;height:150px}
.sentence-text{font-size:22px}.tomoyo-cn-row{display:block;font-size:20px}</style></head><body><main><div class="sentence-window tomoyo-hook-reader">
<div class="sentence-text"></div><div class="tomoyo-cn-row"></div></div></main><script>window.__tomoyoChinese={};</script></body></html>`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.setContent(html); await page.addScriptTag({ content: code });
    await page.evaluate(() => { const b = window.__tomoyoChinese; b.galLayoutInfo = () => ({ clientX: 200, clientY: 100, clientWidth: 804, clientHeight: 604, workBottom: 1000 }); b.textPlaceAnchor(true); b.textPlaceMode({ on: true, game: '1' }); });
    const step = (placed, top, rects) => page.evaluate(([placed, top, rects]) => { const s = document.querySelector('.sentence-text'); s.dataset.sequence = String(Math.random()); s.replaceChildren();
      window.__tomoyoChinese.textPlace({ text: placed, client: [804, 604], rects: rects || [...placed].map((c, i) => [220 + i * 22, top, 20, 22]) }); }, [placed, top, rects]);
    const extra = () => page.evaluate(() => [...document.querySelectorAll('#megulit-place-extras .megulit-place-line')].map(g => g.textContent));
    /* frames of one line on one place, each stable long enough to be drawn */
    for (const f of ['その瞬間、', 'その瞬間、私は死体を', 'その瞬間、私は死体を見下ろしていた。']) { await step(f, 488); await sleep(520); await step(f, 488); await sleep(120); }
    assert.deepStrictEqual(await extra(), ['その瞬間、私は死体を見下ろしていた。'], 'one place, one line: the last frame');
    /* an interleaved frame: characters of two passes on the same boxes */
    const garbled = '自分の自死体分';
    const boxes = [0, 1, 0, 1, 2, 2, 3].map(k => [220 + k * 22, 516, 20, 22]);
    await step(garbled, 516, boxes); await sleep(520); await step(garbled, 516, boxes); await sleep(120);
    assert.ok(!(await extra()).includes(garbled), 'an interleaved frame (two characters on one box) is never drawn');
    console.log('PASS orphan lines: one per place, interleaved frames skipped');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
