// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-19 (user, windowed 千恋＊万花 1456x819: 「不要再挤压我的汉字了 我窗口化呢 只要显示器上还有位置就不要这样」): the translation
   under an anchored line keeps the user's size and goes below the game window while the monitor's work area has room (the
   overlay spans the desktop); only a sentence that does not fit above the work-area bottom is made smaller, once and never
   under 60 %, and if it still does not fit the block moves up just enough; over the game's own bottom bar it gets a stronger
   outline, no plate. */
const assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
let chromium;
try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch { console.log('SKIP text-place work area (no playwright-core)'); process.exit(0); }
const code = fs.readFileSync(path.join(__dirname, '..', 'web', 'reader', 'modules', 'text-place.js'), 'utf8');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
.sentence-window{position:fixed;left:100px;bottom:20px;width:800px;height:150px;background:rgba(0,0,0,.6);border:2px solid #fff}
.tomoyo-cn-row{display:block;font-size:30px;width:700px}</style></head><body>
<main><div class="sentence-window tomoyo-hook-reader"><div class="sentence-text"><span class="megulit-ruby-base" data-tomoyo-reading="きょう"><span class="char-token">今</span><span class="char-token">日</span></span><span class="char-token">は</span><span class="char-token">晴</span><span class="char-token">れ</span></div><div class="tomoyo-cn-row">今天是晴天</div></div></main>
<script>window.__tomoyoChinese={};</script></body></html>`;
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.setContent(html); await page.addScriptTag({ content: code });
    const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const cn = () => page.evaluate(() => { const r = document.querySelector('.tomoyo-cn-row'); const b = r.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), size: parseFloat(getComputedStyle(r).fontSize), onUi: r.classList.contains('megulit-cn-on-ui') || getComputedStyle(r).textShadow.includes('0px 0px 5px') }; });
    const at = (y, text) => page.evaluate(([y, text]) => { document.querySelector('.tomoyo-cn-row').textContent = text; window.__tomoyoChinese.textPlace({ text: '今日は晴れ', client: [1456, 819], rects: [0, 1, 2, 3, 4].map(i => [300 + i * 40, y, 40, 40]) }); }, [y, text]);
    await page.evaluate(() => { const b = window.__tomoyoChinese; b.galLayoutInfo = () => ({ clientX: 200, clientY: 100, clientWidth: 1456, clientHeight: 819, workBottom: 1040 }); b.textPlaceMode({ on: true }); b.textPlaceAnchor(true); });
    /* the game's text near the bottom of its window (client bottom = 919 on the overlay): the translation goes below it at full size */
    await at(760, '你好，出租车师傅。'); await frame();
    const a = await cn(); assert.strictEqual(a.size, 30, 'full size while the monitor has room ' + JSON.stringify(a)); assert.ok(a.bottom > 919 - 52, 'it may sit over or below the game\'s bottom bar ' + JSON.stringify(a)); assert.ok(a.bottom <= 1040, 'inside the work area');
    assert.strictEqual(a.onUi, false, 'over the game bar too: no automatic shadow, only the user own outline (user: 为啥译文一直有投影，很重很烦还关不掉)');
    /* a long translation that does not fit above the work-area bottom: smaller once, never under 60 %, then moved up just enough */
    await at(700, '在百货商店购物，在餐厅用餐，在公园悠闲地度过……'.repeat(6)); await frame();
    const c = await cn(); assert.ok(c.size >= 18 && c.size < 30, 'smaller, not under 60 % ' + JSON.stringify(c)); assert.ok(c.bottom <= 1032 + 1, 'fully visible ' + JSON.stringify(c));
    /* the next short sentence is back to full size */
    await at(700, '谢谢。'); await frame(); assert.strictEqual((await cn()).size, 30);
    console.log('ok text-place work area');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
/* the bridge reports the work-area bottom of the game's monitor with the layout (overlay px) */
{ const cs = fs.readFileSync(path.join(__dirname, '..', 'native', 'GalWindowBridge.cs'), 'utf8');
  assert.match(cs, /workBottom=WorkBottom\(area\)-box\.Top/); assert.match(cs, /Screen\.FromRectangle\(.*\.WorkingArea\.Bottom/); }
