// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-15 (user group, 1.4.10, 時計仕掛けのレイライン / SoftPal: "只有翻译了，要替换的原文没了"). Layer 4 reports the text
   window (awake=1) while it is not armed, because the writable dialogue stream is hidden by write-back. That page must
   not make the reader drop its Japanese: core/overlay-placement.cjs sends it as `elsewhere` when another path hides the
   line (hook-native originalReplaced), and web/reader/modules/text-place.js then shows the line as without a page.
   An unarmed page with nothing else hiding the line, or a line the source says the game still draws, sends the reader
   back to its own window, bilingual: the Japanese is never dropped. */
const assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
const { OverlayPlacement } = require('../core/overlay-placement.cjs');
{
  const sent = [], p = new OverlayPlacement({ send: m => sent.push(m) }); p.wanted = () => true;
  p.configure({}, { bound: true, clientWidth: 1280, clientHeight: 720 }); sent.length = 0;
  const unarmed = { type: 'hookGpuPage', sw: 1280, sh: 720, awake: true, armed: false, own: 0, ownRects: [], lines: [] };
  p.page(unarmed, { replaced: true });
  assert.deepStrictEqual(sent.shift(), { type: 'textPlacePage', awake: true, armed: false, elsewhere: true, lines: [], client: [1280, 720] });
  p.page(unarmed, { replaced: false });
  const own = sent.shift(); assert.strictEqual(own.elsewhere, undefined, 'nothing else hides the line: the page stays the game\'s word'); assert.strictEqual(own.awake, true);
  p.page({ ...unarmed, armed: true, lines: [{ id: 1, text: 'あ', rects: [[10, 10, 20, 20]] }] }, { replaced: true });
  const armed = sent.shift(); assert.strictEqual(armed.elsewhere, undefined, 'an armed layer owns the page'); assert.strictEqual(armed.lines.length, 1);
  p.page({ ...unarmed, awake: false }, { replaced: true });
  assert.strictEqual(sent.shift().elsewhere, undefined, 'text window gone: not elsewhere');
}
const gal = fs.readFileSync(path.join(__dirname, '..', 'core', 'gal-native.cjs'), 'utf8');
assert.ok(/placement\?\.page\(message,\{replaced:this\.hooks\?\.originalReplaced\?\.\(\)===true\}\)/.test(gal), 'gal-native passes whether the original is replaced');
let chromium;
try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch { console.log('PASS page elsewhere (node; DOM skipped: no playwright-core)'); process.exit(0); }
const code = fs.readFileSync(path.join(__dirname, '..', 'web', 'reader', 'modules', 'text-place.js'), 'utf8');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>.sentence-window{background:rgb(60,80,100)}</style></head><body>
<main><div class="sentence-window tomoyo-hook-reader"><div class="sentence-text"><span class="char-token">紙</span><span class="char-token">か</span><span class="char-token">ら</span></div><div class="tomoyo-cn-row">从信纸</div></div></main>
<script>window.__tomoyoChinese={};</script></body></html>`;
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.setContent(html); await page.addScriptTag({ content: code });
    const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const jp = () => page.evaluate(() => getComputedStyle(document.querySelector('.sentence-text')).visibility);
    const cn = () => page.evaluate(() => getComputedStyle(document.querySelector('.tomoyo-cn-row')).visibility);
    const bg = () => page.evaluate(() => getComputedStyle(document.querySelector('.sentence-window')).backgroundColor);
    await page.evaluate(() => (window.__tomoyoChinese.textPlaceAnchor?.(false), window.__tomoyoChinese.textPlaceMode({ on: true }))); await frame();
    /* unarmed page, nothing else hides the line = the game draws it: the reader is not placed over it, it goes back to its
       own window bilingual (Japanese on top, clickable), never on a plate */
    await page.evaluate(() => window.__tomoyoChinese.textPlacePage({ type: 'textPlacePage', awake: true, armed: false, lines: [], client: [1280, 720] })); await frame();
    assert.strictEqual(await jp(), 'visible', 'game draws its own line: Japanese stays clickable in the reader window'); assert.strictEqual(await cn(), 'visible', 'translation under it'); assert.strictEqual(await bg(), 'rgba(0, 0, 0, 0)', 'never a plate');
    assert.strictEqual(await page.evaluate(() => document.body.classList.contains('megulit-placed')), false, 'not placed over the game line');
    /* the same for a ③ line the source says the game still draws */
    await page.evaluate(() => window.__tomoyoChinese.textPlacePage(null)); await page.evaluate(() => window.__tomoyoChinese.textPlace({ visible: true, text: '紙から' })); await frame();
    assert.strictEqual(await page.evaluate(() => document.body.classList.contains('megulit-place-game-drawn')), true);
    assert.strictEqual(await jp(), 'visible', 'visible note: Japanese stays clickable'); assert.strictEqual(await cn(), 'visible'); assert.strictEqual(await bg(), 'rgba(0, 0, 0, 0)', 'never a plate');
    /* the fix: the line is hidden by write-back, the page only says the window is open */
    await page.evaluate(() => window.__tomoyoChinese.textPlacePage({ type: 'textPlacePage', awake: true, armed: false, elsewhere: true, lines: [], client: [1280, 720] })); await frame();
    assert.strictEqual(await jp(), 'visible', 'Japanese stays when the game line is hidden elsewhere'); assert.strictEqual(await cn(), 'visible', 'translation stays under it');
    assert.strictEqual(await page.evaluate(() => document.body.classList.contains('megulit-place-game-drawn')), false);
    /* a later placed line (glyph records) is still placed: the elsewhere page does not swallow it */
    await page.evaluate(() => window.__tomoyoChinese.textPlace({ text: '紙から', rects: [[200, 600, 30, 30], [230, 600, 30, 30], [260, 600, 30, 30]], client: [1280, 720] })); await frame();
    assert.strictEqual(await page.evaluate(() => document.body.classList.contains('megulit-placed')), true, 'line placed on its boxes');
    assert.strictEqual(await jp(), 'visible');
    for (const clear of ['empty', 'elsewhere', 'off']) {
      await page.evaluate(() => {
        const bridge = window.__tomoyoChinese;
        bridge.textPlaceAnchor(true);
        bridge.textPlaceMode({ on: true });
        bridge.textPlacePage({ awake: true, armed: false, lines: [], client: [1280, 720] });
      });
      await frame();
      assert.strictEqual(await jp(), 'hidden', clear + ': original is already drawn by the game');
      assert.strictEqual(await cn(), 'visible');
      await page.evaluate(action => {
        const bridge = window.__tomoyoChinese;
        if (action === 'off') bridge.textPlaceMode({ on: false });
        else bridge.textPlacePage(action === 'empty' ? null : { elsewhere: true });
      }, clear);
      await frame();
      assert.strictEqual(await jp(), 'visible', clear + ': original returns when the page gives up ownership');
    }
    console.log('PASS page elsewhere (node + DOM)');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
