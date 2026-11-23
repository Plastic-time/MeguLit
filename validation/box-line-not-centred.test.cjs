// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Owner's 千恋＊万花 test 2026-11-21 06:16 (「普通说话以为要居中，结果点一下又左对齐了」). Geometry from release-1421/r21/hook-events.log:
   every line's first box is 374,707 (31 px glyphs) in a 1535x863 client, a text box in the middle of the screen. A full
   one-row line there has its middle on the screen's middle and was taken for a centred line; the next line then started
   centred while it typed and jumped left once drawn. Replay: a two-row left-aligned line, a full one-row line, then the next
   line with its first three boxes drawn. Neither of the last two may be centred. Headless Edge (MEGULIT_PLAYWRIGHT). */
const assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
let chromium;
try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch { console.log('SKIP box line not centred (no playwright-core)'); process.exit(0); }
const code = fs.readFileSync(path.join(__dirname, '..', 'web', 'reader', 'modules', 'text-place.js'), 'utf8');
const tokens = t => [...t].map(c => '<span class="char-token">' + c + '</span>').join('');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
.sentence-window{position:fixed;left:100px;bottom:20px;width:1000px;height:150px}
.sentence-text{font-size:30px;line-height:1.2}</style></head><body>
<main><div class="sentence-window tomoyo-hook-reader"><div class="sentence-text"></div><div class="tomoyo-cn-row"></div></div></main>
<script>window.__tomoyoChinese={};</script></body></html>`;
const CLIENT = [1535, 863], G = 31, X = 374, Y = 707;
const row = (n, y) => Array.from({ length: n }, (_, i) => [X + i * G, y, G, G]);
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1535, height: 863 } });
    await page.setContent(html); await page.addScriptTag({ content: code });
    const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const place = async (text, rects) => { await page.evaluate(([t, h, r, c]) => { document.querySelector('.sentence-text').innerHTML = h; window.__tomoyoChinese.textPlace({ text: t, client: c, rects: r }); }, [text, tokens(text), rects, CLIENT]); await frame(); };
    const state = () => page.evaluate(() => { const w = document.querySelector('.sentence-window'); return { centred: w.classList.contains('megulit-anchor-center'), predicted: w.classList.contains('megulit-rows-predicted') }; });
    await page.evaluate(() => { const b = window.__tomoyoChinese; b.textPlaceAnchor(false); b.textPlaceMode({ on: true }); b.textPlaceAnchor(true); });
    const a = '「ほら、早く行かないと遅れちゃうよ。先生に怒られたら私のせいにしないでね」';
    await place(a, [...row(25, Y), ...row([...a].length - 25, Y + 38)]);
    assert.deepStrictEqual(await state(), { centred: false, predicted: false }, 'a two-row box line is left-aligned');
    const b = '今日はいい天気だから、みんなで外へ出かけようと思'; /* 25 glyphs: 374 + 25 x 31 / 2 = 761.5, the client middle is 767.5 */
    await place(b, row([...b].length, Y));
    assert.deepStrictEqual(await state(), { centred: false, predicted: false }, 'a full one-row line in the box is not a centred line');
    const c = '「えっ、そうなの？　それなら私も一緒に行きたいな」';
    await place(c, [...row(3, Y), ...Array([...c].length - 3).fill(null)]);
    assert.deepStrictEqual(await state(), { centred: false, predicted: false }, 'the next line typing at the box\'s left edge is not centred');
    console.log('PASS a box line in the middle of the screen stays left-aligned while it types');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
