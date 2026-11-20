// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner, ファタモルガーナの館 (KiriKiri, 804x604): 「选项直接没了，而且对话一直少很多很多」; log: engine pass-through proven at
   20:50:41, then the game drew every message-layer line hidden while its hook text came garbled by the text effects
   (「いき、い、き」「き起て…き起…て」) and 16 hook lines were dropped). The reader drew only lines it could align, so the box
   stayed empty. Now a line the game drew hidden that the reader does not draw is drawn from the placement (its own text on its
   own boxes) after a short wait; a line the reader draws is never doubled; a new page clears them. Headless Edge. */
const assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
let chromium;
try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch { console.log('SKIP krkr hidden drawn (no playwright-core)'); process.exit(0); }
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
    /* the reader's sentence (from the hook) and the game's hidden line (placement) */
    const step = (reader, placed, top) => page.evaluate(([reader, placed, top]) => { const s = document.querySelector('.sentence-text'); s.dataset.sequence = String(Math.random());
      s.replaceChildren(...[...reader].map(c => { const t = document.createElement('span'); t.className = 'char-token'; t.textContent = c; return t; }));
      window.__tomoyoChinese.textPlace({ text: placed, client: [804, 604], rects: [...placed].map((c, i) => [220 + i * 22, top, 20, 22]) }); }, [reader, placed, top]);
    const extra = () => page.evaluate(() => [...document.querySelectorAll('#megulit-place-extras .megulit-place-line')].map(g => g.textContent));
    /* real lines of the log: the hook line dropped (garbled by the effect: 「いき、い、き」), the game's own line hidden */
    await step('', '呼吸をひとつする度に、指先に感覚が宿る。', 488); await sleep(700);
    assert.deepStrictEqual(await extra(), ['呼吸をひとつする度に、指先に感覚が宿る。'], 'the hidden line nobody drew is drawn from the placement');
    await step('', 'どこかで雨の音を聞いた。', 516); await sleep(700);
    assert.deepStrictEqual(await extra(), ['呼吸をひとつする度に、指先に感覚が宿る。', 'どこかで雨の音を聞いた。'], 'the page keeps its earlier hidden lines');
    /* a line the reader aligns is drawn by the reader, never also from the placement */
    await step('そして火の爆ぜる音。', 'そして火の爆ぜる音。', 544); await sleep(700);
    assert.ok(!(await extra()).includes('そして火の爆ぜる音。'), 'no double for a line the reader draws');
    assert.ok(await page.evaluate(() => document.body.classList.contains('megulit-anchored')), 'the reader draws it on the game\'s place');
    /* a new page (a line at the top again): the old hidden lines are gone */
    await step('xx', '…………。…………………。………ここは………？', 488); await sleep(200);
    assert.ok(!(await extra()).includes('呼吸をひとつする度に、指先に感覚が宿る。'), 'a new page clears the old lines');
    console.log('ok krkr hidden drawn ' + JSON.stringify(await page.evaluate(() => window.__tomoyoChinese.textPlaceOrphans)));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
