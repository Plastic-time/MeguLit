// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-19 (千恋＊万花 with its Chinese patch shown, user: MeguLit's Japanese at the left edge, over the name plate): the game
   draws another language than the reader's text, so no character can be aligned and every line fell back to the reader's own
   box. In anchored mode only the place is needed: the reader's first character goes to the game line's top-left (windowed
   and on a scaled, letterboxed surface), with the reader's own font size; a line drawn by the game itself is not taken. */
const assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
let chromium;
try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch { console.log('SKIP text-place foreign (no playwright-core)'); process.exit(0); }
const code = fs.readFileSync(path.join(__dirname, '..', 'web', 'reader', 'modules', 'text-place.js'), 'utf8');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
.sentence-window{position:fixed;left:100px;bottom:20px;width:800px;height:150px;background:rgba(0,0,0,.6);border:2px solid #fff}
.tomoyo-cn-row{display:block;background:rgba(0,0,0,.5)}</style></head><body>
<main><div class="sentence-window tomoyo-hook-reader"><div class="sentence-text"><span class="megulit-ruby-base" data-tomoyo-reading="きょう"><span class="char-token">今</span><span class="char-token">日</span></span><span class="char-token">は</span><span class="char-token">晴</span><span class="char-token">れ</span></div><div class="tomoyo-cn-row">今天是晴天</div></div></main>
<script>window.__tomoyoChinese={};</script></body></html>`;
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.setContent(html); await page.addScriptTag({ content: code });
    const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const firstTok = () => page.evaluate(() => { const r = document.querySelector('.sentence-text .char-token').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), getComputedStyle(document.querySelector('.sentence-text .char-token')).fontSize]; });
    const chinese = (rects, client = [1280, 720]) => page.evaluate(([rects, client]) => window.__tomoyoChinese.textPlace({ text: '我这才想起来', client, rects }), [rects, client]);
    const row = (x, y, n = 6, w = 40) => Array.from({ length: n }, (_, i) => [x + i * w, y, w, w]);
    await page.evaluate(() => { const b = window.__tomoyoChinese; b.textPlaceMode({ on: true }); b.textPlaceAnchor(true); });
    /* windowed 1280x720 at the surface origin */
    await page.evaluate(() => { window.__tomoyoChinese.galLayoutInfo = () => ({ clientX: 0, clientY: 0, clientWidth: 1280, clientHeight: 720 }); });
    await chinese(row(430, 560)); await frame();
    const w = await firstTok(); assert.deepStrictEqual(w.slice(0, 2), [430, 560], 'windowed: on the game line\'s top-left ' + JSON.stringify(w));
    assert.notStrictEqual(w[2], '40px', 'the size stays the reader\'s own setting');
    /* the next line of the same box: kept on the same anchor */
    await page.evaluate(() => window.__tomoyoChinese.textPlace({ text: '出租车司机笑着说', client: [1280, 720], rects: Array.from({ length: 8 }, (_, i) => [432 + i * 40, 561, 40, 40]) })); await frame();
    assert.deepStrictEqual((await firstTok()).slice(0, 2), [430, 560], 'same text box: no jitter');
    /* maximised 1920x1080 with black bars: the game's 1280x720 canvas scaled 1.5 inside the client (the record is game-client px) */
    await page.evaluate(() => { window.__tomoyoChinese.galLayoutInfo = () => ({ clientX: 0, clientY: 0, clientWidth: 1920, clientHeight: 1080 }); });
    await chinese(row(430, 360)); await frame();
    const m = await firstTok(); assert.deepStrictEqual(m.slice(0, 2), [645, 540], 'maximised: scaled with the client ' + JSON.stringify(m));
    /* a line the game draws itself (visible): never placed over it */
    await page.evaluate(() => window.__tomoyoChinese.textPlace({ visible: true, text: '我这才想起来' })); await frame();
    assert.strictEqual(await page.evaluate(() => document.body.classList.contains('megulit-placed')), false);
    console.log('ok text-place foreign');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
