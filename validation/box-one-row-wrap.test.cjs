// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* アオイトリ（青鸟）, user 2026-11-28 (「这个文本的出现一闪一闪的」): its text box sits at the bottom, sized to each line and
   centred, every line on one row. After a short centred line, a long line the game types on one row was wrapped at the short
   line's width while it typed, then at the reader box width, and its rows jumped above the box. Replay: an 11-glyph centred row,
   then a 23-glyph line typed on one row of the same box. While it types and when it is complete it stays on one row, on the
   game's row. Headless Edge through playwright-core; skipped when it is not installed (MEGULIT_PLAYWRIGHT). */
const assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
let chromium;
try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch { console.log('SKIP box one-row wrap (no playwright-core)'); process.exit(0); }
const code = fs.readFileSync(path.join(__dirname, '..', 'web', 'reader', 'modules', 'text-place.js'), 'utf8');
const tokens = t => [...t].map(c => '<span class="char-token">' + c + '</span>').join('');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
.sentence-window{position:fixed;left:240px;bottom:20px;width:560px;height:150px}
.sentence-text{font-size:28px;line-height:1.2}</style></head><body>
<main><div class="sentence-window tomoyo-hook-reader"><div class="sentence-text"></div><div class="tomoyo-cn-row"></div></div></main>
<script>window.__tomoyoChinese={};</script></body></html>`;
/* one centred row of n 32 px glyphs at the box's row (client 1280x720, the game's y 656) */
const row = n => Array.from({ length: n }, (_, i) => [640 - n * 16 + i * 32, 656, 32, 32]);
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.setContent(html); await page.addScriptTag({ content: code });
    const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const place = async (text, rects, fresh = true) => { await page.evaluate(([t, h, r, f]) => { const s = document.querySelector('.sentence-text'); if (f) s.innerHTML = h; window.__tomoyoChinese.textPlace({ text: t, client: [1280, 720], rects: r }); }, [text, tokens(text), rects, fresh]); await frame(); };
    const shape = () => page.evaluate(() => { const s = document.querySelector('.sentence-text'), t = [...s.querySelectorAll('.char-token')].map(e => e.getBoundingClientRect());
      return { tops: [...new Set(t.map(r => Math.round(r.top)))].length, top: Math.round(t[0].top), left: Math.round(t[0].left), mid: Math.round((t[0].left + t[t.length - 1].right) / 2), predicted: s.closest('.sentence-window').classList.contains('megulit-rows-predicted') }; });
    await page.evaluate(() => { window.__tomoyoChinese.textPlaceAnchor(false); window.__tomoyoChinese.textPlaceMode({ on: true }); window.__tomoyoChinese.textPlaceAnchor(true); });
    await place('見捨てたわけじゃない。', row(11));
    const short = await shape();
    assert.strictEqual(short.tops, 1, 'the short line is on one row');
    const long = 'ただ、一度でいいから、“普通”になりたかった。', all = row([...long].length);
    const typing = [];
    for (const drawn of [3, 8, 16]) {
      await place(long, [...all.slice(0, drawn), ...Array(all.length - drawn).fill(null)], drawn === 3);
      const s = await shape();
      assert.strictEqual(s.tops, 1, 'a line the game types on one row stays on one row while ' + drawn + ' of its glyphs are drawn (' + JSON.stringify(s) + ')');
      assert.strictEqual(s.top, short.top, 'and on the game\'s row (' + JSON.stringify(s) + ')');
      typing.push(s);
    }
    await place(long, all, false);
    const done = await shape();
    assert.strictEqual(done.tops, 1, 'the complete one-row line stays on one row (' + JSON.stringify(done) + ')');
    assert.strictEqual(done.top, short.top, 'on the game\'s row (' + JSON.stringify(done) + ')');
    assert.ok(Math.abs(done.mid - 640) <= 2, 'centred on the box middle like the game row, though wider than the reader box (' + JSON.stringify(done) + ')');
    for (const s of typing) assert.ok(Math.abs(s.left - done.left) <= 1, 'its first character does not move sideways while it types (' + s.left + ' -> ' + done.left + ')');
    console.log('PASS a one-row box line stays on the game\'s row while it types');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
