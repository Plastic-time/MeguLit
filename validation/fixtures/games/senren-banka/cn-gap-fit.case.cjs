// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* incr11 2026-11-21 (owner's recording H:\Record\Desktop\Desktop 2026.11.21 - 08.28.02.39.mp4, 千恋＊万花 full screen, client 1535x863 at
   clientY 102): 「ずっと座っていたせいか、腰の辺りでポキポキと骨が鳴った。」 (hook-events 23:28:06.30 placed) showed its translation as a 3 px
   strip for the whole line (frames 45-70: the translation band 88-90 px instead of 88-110), and 「そしてタクシーを使って約３０分。」 had a
   25 px translation between lines with 22 px ones. Between two lines text-place.js releases the anchor (the clear of the old line) and the
   reader stands on its own place for a moment; game-fit.js measured it there, found it past the client bottom and made the translation
   smaller or cut it to the room left. Its rules then stayed on the next lines, which text-place.js anchors itself. Replay: the same gap,
   then the next line anchored: its translation is whole and at the user's size. */
const fs = require('node:fs'), path = require('node:path');
let chromium;
try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch {}
const mod = f => fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'web', 'reader', 'modules', f), 'utf8');
/* the reader's own place (no anchor) is low: its translation ends past the game client's bottom (102 + 863 = 965) */
const html = `<!doctype html><html><head><meta charset="utf-8"><style>:root{--tomoyo-gal-cn-size:28px}.sentence-window{position:fixed;left:100px;top:930px;width:1100px}
.sentence-text{font-size:29px;line-height:44px}.tomoyo-cn-row{display:block;line-height:38px}.tomoyo-cn-output{font-size:var(--tomoyo-gal-cn-size);display:block}</style></head>
<body class="tomoyo-gal-bound"><main><div class="sentence-window tomoyo-hook-reader"><div class="sentence-text"></div><div class="tomoyo-cn-row"><span class="tomoyo-cn-output"></span></div></div></main>
<script>window.__tomoyoChinese={};</script></body></html>`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const lines = [
  ['息を吐き、両手を腰に当てて、大きく背をのけ反らせる。', '我长吁一口气，双手叉腰，使劲伸展了一下后背。'],
  ['ずっと座っていたせいか、腰の辺りでポキポキと骨が鳴った。', '大概是一直坐着的缘故，腰那一带咯吱咯吱地响了几声。']];
module.exports = async ({ assert }) => {
  if (!chromium) return;
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1040 } });
    await page.setContent(html);
    await page.evaluate(() => { const b = window.__tomoyoChinese; b.galLayoutInfo = () => ({ clientX: 30, clientY: 102, clientWidth: 1535, clientHeight: 863, workBottom: 1040 }); });
    await page.addScriptTag({ content: mod('text-place.js') }); await page.addScriptTag({ content: mod('game-fit.js') });
    await page.evaluate(() => { const b = window.__tomoyoChinese; b.textPlaceAnchor(true); b.textPlaceMode({ on: true, game: 'senren' }); });
    const place = ([jp, cn], seq) => page.evaluate(([jp, cn, seq]) => { let s = document.querySelector('.sentence-text:not(.megulit-old-line)');
      if (!s) { document.querySelector('.megulit-old-line')?.remove(); s = Object.assign(document.createElement('div'), { className: 'sentence-text' }); document.querySelector('.sentence-window').prepend(s); }
      if (s.dataset.sequence !== String(seq)) { s.dataset.sequence = String(seq); s.replaceChildren(...[...jp].map(c => Object.assign(document.createElement('span'), { className: 'char-token', textContent: c }))); document.querySelector('.tomoyo-cn-output').textContent = cn; }
      window.__tomoyoChinese.textPlace({ text: jp, client: [1535, 863], rects: [...jp].map((c, i) => [374 + i * 31, 707, 31, 31]) }); }, [jp, cn, seq]);
    const cn = () => page.evaluate(() => { const o = document.querySelector('.tomoyo-cn-output'), cs = getComputedStyle(o), r = o.getBoundingClientRect();
      return { fs: parseFloat(cs.fontSize), maxHeight: cs.maxHeight, height: r.height, scroll: o.scrollHeight, fit: window.__tomoyoChinese.gameFit.state() }; });
    await place(lines[0], 25); await sleep(80); await place(lines[0], 25); await sleep(80);
    const first = await cn();
    /* the gap: the old line is cleared before the next one is placed; game-fit runs while the reader is on its own place */
    /* the next line's places arrive (placement before the source line, hook-events 23:28:06.303 / 06.518) while the reader has marked the old
       line and not yet built the new one: no current sentence, the anchor is released and the window stands on its own place */
    await page.evaluate(jp => { const b = window.__tomoyoChinese, s = document.querySelector('.sentence-text'); s.classList.add('megulit-old-line'); s.removeAttribute('data-sequence');
      document.querySelector('.tomoyo-cn-output').textContent = '大概是一直坐着的缘故，腰那一带咯吱咯吱地响了几声。';
      b.textPlace({ text: jp, client: [1535, 863], rects: [...jp].map((c, i) => [374 + i * 31, 707, 31, 31]) }); }, lines[1][0]);
    await sleep(40); await page.evaluate(() => window.__tomoyoChinese.gameFit.check());
    const gap = await page.evaluate(() => ({ owns: window.__tomoyoChinese.textPlaceOwns?.(), fit: window.__tomoyoChinese.gameFit.state() }));
    assert.equal(gap.owns, true, 'the anchor outlives the gap: text-place.js still owns the layout');
    assert.deepEqual(gap.fit, { fit: 1, shift: 0, room: 0 }, 'game-fit stands down in the gap: ' + JSON.stringify(gap.fit));
    await place(lines[1], 26); await sleep(80); await place(lines[1], 26); await sleep(120);
    const next = await cn();
    assert.equal(next.maxHeight, 'none', 'the translation is never cut on an anchored line');
    assert.ok(next.scroll <= next.height + 1, 'whole translation visible: ' + JSON.stringify(next));
    assert.equal(next.fs, first.fs, 'the same translation size line to line: ' + first.fs + ' -> ' + next.fs);
    /* even with the fit classes left on the body by an earlier, unanchored line, an anchored line ignores them */
    await page.evaluate(() => { const r = document.documentElement.style, c = document.body.classList; r.setProperty('--megulit-fit', '.6'); r.setProperty('--megulit-fit-room', '3px'); c.add('megulit-fit-on', 'megulit-fit-room'); });
    const stale = await cn();
    assert.equal(stale.maxHeight, 'none', 'stale fit-room ignored on an anchored line'); assert.equal(stale.fs, first.fs, 'stale fit size ignored on an anchored line');
  } finally { await browser.close(); }
};
