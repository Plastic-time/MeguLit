// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner, ファタモルガーナの館: 「一直挂着一个文本」): the player's advance (readerInput complete, from GalWindowBridge) cancels
   the orphans still waiting from before it (stale until the game places them again); orphans already drawn stay (a click may move
   nothing on), a choice screen stays; a line placed after the click is drawn as before. Replayed on text-place.js. */
const assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
let chromium;
try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch { console.log('SKIP advance cancels orphans (no playwright-core)'); process.exit(0); }
const code = fs.readFileSync(path.join(__dirname, '..', 'web', 'reader', 'modules', 'text-place.js'), 'utf8');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>.sentence-window{position:fixed;left:100px;bottom:20px;width:700px}
.sentence-text{font-size:22px}.tomoyo-cn-row{display:block;font-size:20px}</style></head><body><main><div class="sentence-window tomoyo-hook-reader">
<div class="sentence-text"></div><div class="tomoyo-cn-row"></div></div></main>
<script>window.__sent=[];window.__tomoyoTranslateRequest=s=>window.__sent.push(JSON.parse(s));window.__tomoyoChinese={galStatus(){}};</script></body></html>`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const place = (page, t, y = 488) => page.evaluate(([t, y]) => window.__tomoyoChinese.textPlace({ text: t, client: [804, 604], rects: [...t].map((c, k) => [220 + k * 22, y, 20, 22]) }), [t, y]);
const shown = page => page.evaluate(() => [...document.querySelectorAll('#megulit-place-extras .megulit-place-line')].map(n => n.textContent.replace(/\s/g, '')));
const click = page => page.evaluate(() => window.__tomoyoChinese.galStatus({ type: 'readerInput', complete: true }));
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.setContent(html); await page.addScriptTag({ content: code });
    await page.evaluate(() => { const b = window.__tomoyoChinese; b.galLayoutInfo = () => ({ clientX: 200, clientY: 100, clientWidth: 804, clientHeight: 604, workBottom: 1000 }); b.textPlaceAnchor(true); b.textPlaceMode({ on: true, game: 'fata' }); });
    assert.ok(await page.evaluate(() => window.__tomoyoChinese.textPlaceAdvanceBound === true), 'bound to readerInput');
    /* 1. an orphan drawn, then a click: it stays (the safety net never takes down what is drawn) */
    const A = 'その瞬間、私は死体を見下ろしていた。';
    await place(page, A); await sleep(520); await place(page, A); await sleep(150);
    assert.deepStrictEqual(await shown(page), [A], 'the orphan is drawn as before');
    await click(page); await sleep(500);
    assert.deepStrictEqual(await shown(page), [A], 'a drawn orphan stays');
    await page.evaluate(() => { const b = window.__tomoyoChinese; b.textPlaceMode({ on: false }); b.textPlaceMode({ on: true, game: 'fata' }); });
    /* 2. a line waiting when the player advanced is never drawn */
    const B = '館の扉が静かに開いた。';
    await place(page, B); await sleep(250); await click(page); await sleep(600);
    await page.evaluate(() => window.__tomoyoChinese.textPlaceAnchor(true)); await sleep(100);
    assert.deepStrictEqual(await shown(page), [], 'the stale line is not drawn after the advance');
    /* 3. the line placed after the click is drawn as before */
    const C = '彼女はそう言って笑った。';
    await place(page, C); await sleep(520); await place(page, C); await sleep(150);
    assert.deepStrictEqual(await shown(page), [C], 'the next line is drawn');
    /* 4. the stale line placed again by the game is drawn as before */
    await place(page, B); await sleep(520); await place(page, B); await sleep(150);
    assert.ok((await shown(page)).includes(B), 'placed again: drawn ' + JSON.stringify(await shown(page)));
    /* 5. a choice screen (several orphans) stays on a click beside the options */
    await page.evaluate(() => { const b = window.__tomoyoChinese; b.textPlaceMode({ on: false }); b.textPlaceMode({ on: true, game: 'fata' }); });
    const O = ['……おはよう……', '……おやすみ……'];
    await place(page, O[0], 262); await place(page, O[1], 320); await sleep(520); await page.evaluate(() => window.__tomoyoChinese.textPlaceAnchor(true)); await sleep(150);
    const before = await shown(page); assert.strictEqual(before.length, 2, 'both options drawn ' + JSON.stringify(before));
    await click(page); await sleep(500);
    assert.deepStrictEqual((await shown(page)).sort(), before.sort(), 'the choice screen stays');
    console.log('PASS advance cancels orphans');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
