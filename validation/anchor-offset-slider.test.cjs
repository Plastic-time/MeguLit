// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner's recording, windowed 千恋＊万花: dragging 文本框上边距 from about -24 to 108 threw the Japanese to mid-screen and the
   upper right, and 校准当前句 did not bring it back). On the game's place the box fields are an offset from the game's first character
   (anchorDX/anchorDY). The settings page decided "offset or the reader's own place" from the body class megulit-anchored, which comes
   and goes between lines and while the game draws a line itself, so a drag switched meaning halfway and wrote one into the other.
   Now: the mode is the game's (text-place: placement on and anchored), stable during a drag; the offset moves the line continuously
   and dragging it back to 0 puts it back exactly; calibrating resets the offset to 0. Headless Edge for the replay. */
const assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const gal = read('web/reader/modules/gal.js'), sync = read('web/reader/modules/game-style-sync-ui.js');
assert.match(gal, /const anchoredNow = \(\) => typeof bridge\.textPlaceAnchorActive === 'function'/, 'the settings page asks text-place for the mode');
assert.match(gal, /bridge\.galAnchorOffsetReset = [^\n]*applyGalPreferences\(\{ anchorDX: 0, anchorDY: 0 \}, \{ preview: true \}/, 'a calibration can reset the offset');
assert.match(sync, /galAnchorOffsetReset\?\.\(\);send\(\{type:'hookReselect'/, '校准当前句 resets the offset');
assert.match(sync, /positionButton\.onclick=\(\)=>\{window\.__tomoyoChinese\?\.galAnchorOffsetReset\?\.\(\);resync\('position'\)/, '仅校准位置 resets the offset');
let chromium;
try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch { console.log('ok anchor offset slider (source only, no playwright-core)'); process.exit(0); }
const code = fs.readFileSync(process.env.MEGULIT_TEXT_PLACE || path.join(__dirname, '..', 'web', 'reader', 'modules', 'text-place.js'), 'utf8');
const text = '徒歩で移動できる範囲は大自然ばかりという、山間にある田舎';
const html = `<!doctype html><html><head><meta charset="utf-8"><style>.sentence-window{position:fixed;left:100px;bottom:20px;width:1100px;height:150px}
.sentence-text{font-size:30px}.tomoyo-cn-row{display:block;font-size:26px}</style></head><body><main><div class="sentence-window tomoyo-hook-reader">
<div class="sentence-text">${[...text].map(c => `<span class="char-token">${c}</span>`).join('')}</div><div class="tomoyo-cn-row">徒步能去的地方全是大自然</div></div></main>
<script>window.__tomoyoChinese={};</script></body></html>`;
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.setContent(html); await page.addScriptTag({ content: code });
    const n = [...text].length;
    await page.evaluate(n => { const b = window.__tomoyoChinese; window.__dy = 0; b.galPreferences = () => ({ anchorDX: 0, anchorDY: window.__dy });
      b.galLayoutInfo = () => ({ clientX: 192, clientY: 102, clientWidth: 1535, clientHeight: 863, workBottom: 1032 }); b.textPlaceMode({ on: true }); b.textPlaceAnchor(true);
      const rects = []; for (let i = 0; i < n; i++) rects.push([180 + i * 31, 707, 31, 31]);
      b.textPlace({ text: document.querySelector('.sentence-text').textContent, client: [1535, 863], rects }); }, n);
    const at = dy => page.evaluate(dy => { window.__dy = dy; dispatchEvent(new Event('resize'));
      return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => { const t = document.querySelector('.char-token').getBoundingClientRect();
        res({ dy, top: Math.round(t.top), left: Math.round(t.left), active: window.__tomoyoChinese.textPlaceAnchorActive(), cls: document.body.classList.contains('megulit-anchored') }); }))); }, dy);
    const home = await at(0);
    assert.ok(home.active && home.cls, 'on the game\'s place ' + JSON.stringify(home));
    /* the owner's drag: -24 up to 108 (clamped inside the client) and back */
    const up = []; for (let dy = -24; dy <= 108; dy += 4) up.push(await at(dy));
    for (let i = 1; i < up.length; i++) assert.ok(up[i].top >= up[i - 1].top, 'moves one way with the slider ' + JSON.stringify([up[i - 1], up[i]]));
    for (const m of up) { assert.strictEqual(m.left, home.left, 'the top margin never moves it sideways ' + JSON.stringify(m)); assert.ok(m.top >= 102 && m.top <= 102 + 863 - 40 + 1, 'inside the game client ' + JSON.stringify(m)); }
    const back = await at(0);
    assert.deepStrictEqual([back.top, back.left], [home.top, home.left], 'dragged back to 0: exactly where it started');
    /* between lines the body class goes, the mode does not */
    await page.evaluate(() => document.body.classList.remove('megulit-anchored'));
    assert.strictEqual(await page.evaluate(() => window.__tomoyoChinese.textPlaceAnchorActive()), true, 'the mode holds while the class is gone');
    console.log('ok anchor offset slider: ' + up.length + ' steps, back to ' + back.top);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
