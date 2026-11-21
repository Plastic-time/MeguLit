// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: no game may draw fewer characters once the placement fallback never redraws a line the reader drew): a
   coordinate engine that is not KiriKiri (records engine=unity, this game's own profile: page.engineRows unset = auto) shows two lines of one page, each
   reported hidden with its boxes. Before: the first row came back only through the white fallback layer; now both rows are the
   reader's own (the earlier one an old line on its own boxes, lookups and ruby kept), nothing on the fallback layer, and a line
   that starts the next page takes both away. Real code: core/overlay-placement.cjs (rows) and web/reader/modules/text-place.js. */
const fs = require('node:fs'), path = require('node:path');
module.exports = async ({ assert, root, profile }) => {
  let chromium; try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch { return; }
  const { OverlayPlacement } = require(path.join(root, 'core', 'overlay-placement.cjs')), tp = require(path.join(root, 'core', 'text-paths.cjs'));
  const sent = [], p = new OverlayPlacement({ send: m => sent.push(m) }); p.profile = profile; p.wanted = () => true;
  p.configure({ hookProfile: 'embed', hookHide: true }, { bound: true, clientWidth: 1280, clientHeight: 720 }); sent.length = 0;
  const rec = (n, text, y) => 'ToMe_CHARS engine=unity line=' + n + ' hidden=1 sw=1280 sh=720 vx=0 vy=0 vw=0 vh=0 n=' + [...text].length + ' rects=' + [...text].map((c, i) => (200 + i * 30) + ',' + y + ',28,30').join(';') + ' text=' + text;
  const feed = raw => { const before = sent.length; p.hook(tp.parseChars(raw)); return sent.slice(before); };
  const code = fs.readFileSync(path.join(root, 'web', 'reader', 'modules', 'text-place.js'), 'utf8');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await page.setContent('<!doctype html><meta charset="utf-8"><style>.sentence-window{position:fixed;left:100px;bottom:20px;width:900px}.sentence-text{font-size:24px}</style><main><div class="sentence-window tomoyo-hook-reader"><div class="sentence-text"></div><div class="tomoyo-cn-row"></div></div></main><script>window.__tomoyoChinese={};</script>');
    await page.addScriptTag({ content: code });
    await page.evaluate(() => { const b = window.__tomoyoChinese; b.galLayoutInfo = () => ({ clientX: 100, clientY: 50, clientWidth: 1280, clientHeight: 720, workBottom: 1000 }); b.textPlaceAnchor(true); b.textPlaceMode({ on: true, game: '1' }); });
    const say = async (text, raw) => { await page.evaluate(t => { const s = document.querySelector('.sentence-window:not(.megulit-old-line) .sentence-text:not(.megulit-old-line)'); s.replaceChildren(...[...t].map(c => { const e = document.createElement('span'); e.className = 'char-token'; e.textContent = c; return e; })); window.__tomoyoChinese.hookSourceText = t; }, text);
      const msgs = feed(raw); await page.evaluate(ms => { const b = window.__tomoyoChinese; for (const m of ms) (m.type === 'textPlacePage' ? b.textPlacePage : b.textPlace)(m); }, msgs); await page.waitForTimeout(700); };
    const look = () => page.evaluate(() => ({ rows: [...document.querySelectorAll('.sentence-text')].filter(s => getComputedStyle(s).display !== 'none').map(s => ({ old: s.classList.contains('megulit-old-line'), text: [...s.querySelectorAll('.char-token')].filter(t => getComputedStyle(t).display !== 'none' && t.getBoundingClientRect().width > 0).map(t => t.textContent).join(''), y: Math.round(Math.min(...[...s.querySelectorAll('.char-token')].map(t => t.getBoundingClientRect().top).filter(v => v > 0))), pointer: [...s.querySelectorAll('.char-token')].every(t => getComputedStyle(t).pointerEvents !== 'none') })).filter(r => r.text),
      extras: [...document.querySelectorAll('#megulit-place-extras span')].map(s => s.textContent).join('') }));
    await say('一行目のせりふ', rec(1, '一行目のせりふ', 400));
    await say('二行目のせりふ', rec(2, '二行目のせりふ', 440));
    const two = await look();
    assert.equal(two.extras, '', 'nothing on the fallback layer');
    const first = two.rows.find(r => r.text === '一行目のせりふ'), second = two.rows.find(r => r.text === '二行目のせりふ');
    assert.ok(first && first.old && first.pointer, 'the first row is still drawn, by the reader, clickable: ' + JSON.stringify(two));
    assert.ok(second && !second.old, 'the second row is the current line: ' + JSON.stringify(two));
    assert.equal(first.y, 50 + 400, 'the first row on its own boxes'); assert.equal(second.y, 50 + 440, 'the second row on its own boxes');
    await say('次のページ', rec(3, '次のページ', 400));
    const next = await look();
    assert.deepEqual(next.rows.map(r => r.text), ['次のページ'], 'a new page takes both rows away: ' + JSON.stringify(next));
  } finally { await browser.close(); }
};
