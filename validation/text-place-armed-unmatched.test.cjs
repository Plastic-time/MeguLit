// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-16 QQ group (ライムライト・レモネードジャム): ruby and translation on screen, the Japanese nowhere. An armed page hides
   the game's own text, so a reader line the page does not carry must come back in the reader's own box after a short
   grace, never stay hidden as "drawn by the game". Headless Edge through playwright-core; skipped when not installed. */
const assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
let chromium;
try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch { console.log('SKIP (no playwright-core)'); process.exit(0); }
const code = fs.readFileSync(path.join(__dirname, '..', 'web', 'reader', 'modules', 'text-place.js'), 'utf8');
const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><main><div class="sentence-window tomoyo-hook-reader"><div class="sentence-text"><span class="char-token">値</span><span class="char-token">段</span><span class="char-token">は</span></div><div class="tomoyo-cn-row">价格</div></div></main><script>window.__tomoyoChinese={};</script></body></html>`;
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.setContent(html); await page.addScriptTag({ content: code });
    const cls = () => page.evaluate(() => [...document.body.classList].filter(c => c.startsWith('megulit-')).sort().join(' '));
    await page.evaluate(() => { const b = window.__tomoyoChinese; b.textPlaceMode({ on: true });
      b.textPlacePage({ awake: true, armed: true, client: [1280, 720], lines: [{ id: 1, text: '別の行', rects: [[10, 500, 30, 32], [40, 500, 30, 32], [70, 500, 30, 32]] }] }); });
    await page.waitForTimeout(60);
    await page.waitForTimeout(1500);
    const c = await cls();
    assert.doesNotMatch(c, /megulit-place-game-drawn/, 'armed page: the Japanese is never hidden as drawn by the game');
    assert.match(c, /megulit-place-fallback/);
    assert.strictEqual(await page.evaluate(() => getComputedStyle(document.querySelector('.sentence-text')).visibility), 'visible');
    /* the line arrives on the page: placed again */
    await page.evaluate(() => window.__tomoyoChinese.textPlacePage({ awake: true, armed: true, client: [1280, 720], lines: [{ id: 2, text: '値段は', rects: [[10, 500, 30, 32], [40, 500, 30, 32], [70, 500, 30, 32]] }] }));
    await page.waitForTimeout(400);
    assert.match(await cls(), /megulit-placed/); assert.doesNotMatch(await cls(), /megulit-place-fallback|megulit-place-game-drawn/);
    console.log('ok text-place armed unmatched');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
