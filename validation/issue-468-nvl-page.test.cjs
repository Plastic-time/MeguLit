// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Issue 468 (寒蝉鸣泣之时解, full-page NVL): the game's text fills the window. Not hidden: the translation goes right under the
   current sentence (from its first character, the user's size), never in the reader's own box over the game's lines. Hidden
   (armed page): the page's translation is the user's size, not 60 % of the Japanese. Headless Edge; skipped without playwright-core. */
const assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
let chromium;
try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch { console.log('SKIP (no playwright-core)'); process.exit(0); }
const code = fs.readFileSync(path.join(__dirname, '..', 'web', 'reader', 'modules', 'text-place.js'), 'utf8');
const P = 30, H = 34; let y = 40;
const lay = t => { const r = []; let x = 60; for (const c of t) { if (x + P > 60 + P * 36) { x = 60; y += H * 1.6; } r.push([x, y, P, H]); x += P; } y += H * 1.6; return r; };
const lines = ['雛見沢村は小さな村だ。', '都会から越してきた。', '朝は鳥の声で目を覚ます。', '綿流しの夜が近づく。'].map((t, i) => ({ id: i + 1, text: t, rects: lay(t) }));
const cur = '僕はまだ何も知らなかった。'; lines.push({ id: 9, text: cur, rects: lay(cur) });
const last = lines.at(-1).rects, under = last[0][1] + H;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>:root{--tomoyo-gal-cn-size:24px}.sentence-window{position:fixed;left:40px;bottom:30px;width:1200px}.tomoyo-cn-row{font-size:var(--tomoyo-gal-cn-size)}</style></head><body>
<main><div class="sentence-window tomoyo-hook-reader"><div class="sentence-text">${[...cur].map(c => `<span class="char-token">${c}</span>`).join('')}</div><div class="tomoyo-cn-row">我那时还什么都不知道。</div></div></main><script>window.__tomoyoChinese={};</script></body></html>`;
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const armed of [false, true]) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await page.setContent(html); await page.addScriptTag({ content: code });
      await page.evaluate(([lines, armed]) => { const b = window.__tomoyoChinese; b.textPlaceMode({ on: true }); b.textPlacePage({ awake: true, armed, client: [1280, 720], lines }); }, [lines, armed]);
      await page.waitForTimeout(1600);
      const r = await page.evaluate(() => { const n = document.querySelector('.tomoyo-cn-row'), b = n.getBoundingClientRect(); return { left: b.left, top: b.top, fs: parseFloat(getComputedStyle(n).fontSize) }; });
      assert.strictEqual(r.fs, 24, 'user translation size (' + (armed ? 'hidden page' : 'game-drawn page') + ')');
      assert.ok(r.top >= under && r.top <= under + H, 'right under the current sentence: ' + JSON.stringify(r) + ' expected ~' + under);
      assert.ok(Math.abs(r.left - last[0][0]) <= 2, 'from the sentence\'s first character: ' + r.left);
      await page.close();
    }
    console.log('ok issue 468 nvl page');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
