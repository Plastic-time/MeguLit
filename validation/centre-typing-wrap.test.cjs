// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Owner's CHAOS;CHILD recording 2026-11-21 05:44 (centred narration): while the game typed a new centred line, MeguLit showed
   it on one row and only wrapped and centred it when the line was complete. Replay: a centred two-row line is drawn whole,
   then the next centred line arrives with only its first boxes drawn. The whole line must already wrap at the page's row
   width and be centred (two rows, not one), in anchor mode, before the game draws its second row.
   Headless Edge through playwright-core; skipped when it is not installed (MEGULIT_PLAYWRIGHT). */
const assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
let chromium;
try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch { console.log('SKIP centre typing wrap (no playwright-core)'); process.exit(0); }
const code = fs.readFileSync(path.join(__dirname, '..', 'web', 'reader', 'modules', 'text-place.js'), 'utf8');
const tokens = t => [...t].map(c => '<span class="char-token">' + c + '</span>').join('');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
.sentence-window{position:fixed;left:100px;bottom:20px;width:1000px;height:150px}
.sentence-text{font-size:30px;line-height:1.2}</style></head><body>
<main><div class="sentence-window tomoyo-hook-reader"><div class="sentence-text"></div><div class="tomoyo-cn-row"></div></div></main>
<script>window.__tomoyoChinese={};</script></body></html>`;
/* a centred page: rows of n glyphs of 30 px, centred on x=640 */
const row = (n, y, from = 0) => Array.from({ length: n }, (_, i) => [640 - n * 15 + (from + i) * 30 - from * 30, y, 30, 32]);
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.setContent(html); await page.addScriptTag({ content: code });
    const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const place = async (text, rects) => { await page.evaluate(([t, h, r]) => { document.querySelector('.sentence-text').innerHTML = h; window.__tomoyoChinese.textPlace({ text: t, client: [1280, 720], rects: r }); }, [text, tokens(text), rects]); await frame(); };
    await page.evaluate(() => { window.__tomoyoChinese.textPlaceAnchor(false); window.__tomoyoChinese.textPlaceMode({ on: true }); window.__tomoyoChinese.textPlaceAnchor(true); });
    /* line 1, complete: 20 + 12 glyphs on two centred rows */
    const first = '流行を創り出していた高層建造物はその役目を諦めたように倒壊し';
    await place(first, [...row(20, 300), ...row([...first].length - 20, 340)]);
    /* line 2 typing: 32 characters, the game has drawn 4 of them on its first row */
    const next = '黒い火災は仲間を求めて勢いを広げ続け、混乱した人たちは集団心理から恐怖';
    await place(next, [...row(20, 400).slice(0, 4), ...Array(next.length - 4).fill(null)]);
    const r = await page.evaluate(() => { const w = document.querySelector('.sentence-window'), s = w.querySelector('.sentence-text'), b = s.getBoundingClientRect();
      return { predicted: w.classList.contains('megulit-rows-predicted'), rows: Math.round(b.height / (parseFloat(getComputedStyle(s).lineHeight) || 36)), mid: Math.round(b.left + b.width / 2), width: Math.round(b.width) }; });
    assert.ok(r.width <= 600 + 40, 'a centred line the game is still typing wraps at the page row width (600 px + one glyph), not the reader box (width=' + r.width + ')');
    assert.ok(r.rows >= 2, 'the whole line takes its final rows before the game draws them (rows=' + r.rows + ', width=' + r.width + ')');
    assert.ok(Math.abs(r.mid - 640) <= 40, 'and is centred on the page middle (mid=' + r.mid + ')');
    console.log('PASS centred typing line wraps and centres from its first character');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
