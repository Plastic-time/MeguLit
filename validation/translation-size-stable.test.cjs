// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* User 2026-11-19 (千恋*万花): the translation's size is the user's setting for every line; it is made smaller only when
   that line's translation does not fit, once, and is kept for the line. 20 lines of different box heights and translation
   lengths through text-place.js in headless Edge (skipped without playwright-core: MEGULIT_PLAYWRIGHT=<path>). */
const assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
let chromium;
try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch { console.log('SKIP translation-size (no playwright-core)'); process.exit(0); }
const code = fs.readFileSync(path.join(__dirname, '..', 'web', 'reader', 'modules', 'text-place.js'), 'utf8');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>:root{--tomoyo-gal-cn-size:24px}
.sentence-window{position:fixed;left:100px;bottom:20px;width:800px;height:150px}.tomoyo-cn-row{display:block}</style></head><body>
<main><div class="sentence-window tomoyo-hook-reader"><div class="sentence-text"><span class="char-token">今</span><span class="char-token">日</span><span class="char-token">は</span><span class="char-token">晴</span><span class="char-token">れ</span></div><div class="tomoyo-cn-row">x</div></div></main>
<script>window.__tomoyoChinese={};</script></body></html>`;
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.setContent(html); await page.addScriptTag({ content: code });
    const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.evaluate(() => { window.__tomoyoChinese.textPlaceAnchor(false); window.__tomoyoChinese.textPlaceMode({ on: true }); });
    const sizeOf = () => page.evaluate(() => parseFloat(document.querySelector('.tomoyo-cn-row').style.fontSize));
    const put = async (h, y, text, pass = 1) => { for (let i = 0; i < pass; i++) { await page.evaluate(([h, y, text]) => { document.querySelector('.tomoyo-cn-row').textContent = text;
      window.__tomoyoChinese.textPlace({ text: '今日は晴れ', client: [1280, 720], rects: [0, 1, 2, 3, 4].map(i => [100 + i * h, y, h, h]) }); }, [h, y, text]); await frame(); } return sizeOf(); };
    const sizes = [];
    for (let i = 0; i < 20; i++) sizes.push(await put([22, 28, 32, 40, 48][i % 5], 300 + (i % 4) * 20, '这是第' + i + '句译文，' + '长短不一'.repeat(i % 6 + 1), 2));
    assert.deepStrictEqual([...new Set(sizes)], [24], 'one size for every line that fits: ' + sizes);
    /* a line that cannot fit near the bottom: smaller once, stable over repeated placing and a streaming (growing) Japanese box, the next line is standard again */
    const long = '衣服破破烂烂，皮肤上满是擦伤，连续走了好几个小时的双腿已经开始失去知觉。'.repeat(3);
    const first = await put(32, 640, long), again = [];
    for (let i = 0; i < 5; i++) again.push(await put(32, 640, long));
    assert.ok(first < 24 && first >= 14, 'shrunk within the floor: ' + first);
    assert.deepStrictEqual([...new Set(again)], [first], 'shrunk once, not again: ' + again);
    assert.strictEqual(await put(32, 300, '短句'), 24, 'the next line is standard again');
    console.log('PASS translation size stable');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
