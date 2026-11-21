// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner, one MeguLit run: 千恋＊万花 then STEINS;GATE; log: placement for 千恋＊万花 up to 20:39:34, STEINS;GATE from 20:40 with no
   placement at all): STEINS;GATE's lines, which come with no place, were pinned at 千恋＊万花's place (first box 374,707 in 1535x863) on its
   rows, a narrow block over the game's own page. The place belongs to the game it was taken in: another game (or placement turned off)
   starts without one, and its unplaced lines sit at the reader's own place. Headless Edge; skipped without playwright-core. */
const assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
let chromium;
try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch { console.log('SKIP anchor other game (no playwright-core)'); process.exit(0); }
const code = fs.readFileSync(process.env.MEGULIT_TEXT_PLACE || path.join(__dirname, '..', 'web', 'reader', 'modules', 'text-place.js'), 'utf8');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>.sentence-window{position:fixed;left:100px;bottom:20px;width:1100px;height:150px}
.sentence-text{font-size:30px}.tomoyo-cn-row{display:block;font-size:26px}</style></head><body><main><div class="sentence-window tomoyo-hook-reader">
<div class="sentence-text"></div><div class="tomoyo-cn-row">译文</div></div></main><script>window.__tomoyoChinese={};</script></body></html>`;
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.setContent(html); await page.addScriptTag({ content: code });
    const show = (text, placed) => page.evaluate(([text, placed]) => { const s = document.querySelector('.sentence-text'); s.dataset.sequence = String(Math.random());
      s.replaceChildren(...[...text].map(c => { const t = document.createElement('span'); t.className = 'char-token'; t.textContent = c; return t; }));
      window.__tomoyoChinese.textPlace({ text, client: [1535, 863], rects: [...text].map((c, i) => placed ? [374 + i * 31, 707, 31, 31] : null) });
      return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => res({ anchored: document.body.classList.contains('megulit-anchored'), top: Math.round(document.querySelector('.char-token').getBoundingClientRect().top) })))); }, [text, placed]);
    await page.evaluate(() => { const b = window.__tomoyoChinese; b.galLayoutInfo = () => ({ clientX: 192, clientY: 102, clientWidth: 1535, clientHeight: 863, workBottom: 1032 }); b.textPlaceAnchor(true); b.textPlaceMode({ on: true, game: '1111' }); });
    const a = await show('「お客さんってば」', true);
    assert.ok(a.anchored, 'the first game anchors ' + JSON.stringify(a));
    const same = await show('「先生」', false);
    assert.ok(same.anchored, 'the same game keeps its place for an unplaced line ' + JSON.stringify(same));
    await page.evaluate(() => window.__tomoyoChinese.textPlaceMode({ on: true, game: '48964' }));
    const b2 = await show('夏の強烈な日射しを受けて、', false);
    assert.ok(!b2.anchored, 'another game has no place yet: its unplaced line is at the reader\'s own place ' + JSON.stringify(b2));
    await page.evaluate(() => { window.__tomoyoChinese.textPlaceMode({ on: false }); window.__tomoyoChinese.textPlaceMode({ on: true, game: '48964' }); });
    console.log('ok anchor other game');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
