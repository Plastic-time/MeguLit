// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner, one MeguLit run: 千恋＊万花 then STEINS;GATE; log: placement for 千恋＊万花 up to 20:39:34, STEINS;GATE from 20:40 with no
   placement at all): STEINS;GATE's lines, which come with no place, were pinned at 千恋＊万花's place (first box 374,707 in 1535x863) on its
   rows, a narrow block over the game's own page. The place belongs to the game it was taken in: another game (or placement turned off)
   starts without one, and its unplaced lines sit at the reader's own place. Headless Edge; skipped without playwright-core. */
const assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
let chromium;
try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch { console.log('SKIP anchor other game (no playwright-core)'); process.exit(0); }
const code = fs.readFileSync(process.env.MEGULIT_TEXT_PLACE || path.join(__dirname, '..', 'web', 'reader', 'modules', 'text-place.js'), 'utf8');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>.sentence-window{position:fixed;left:100px;bottom:20px;width:1100px;height:150px}
.sentence-text{font-size:30px}.tomoyo-cn-row{display:block;font-size:26px}</style></head><body><main><div class="sentence-window tomoyo-hook-reader">
<div class="sentence-text"></div><div class="tomoyo-cn-row">译文</div></div></main><script>window.__tomoyoChinese={};</script></body></html>`;
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.setContent(html); await page.addScriptTag({ content: code });
    const show = (text, placed) => page.evaluate(([text, placed]) => { const s = document.querySelector('.sentence-text'); s.dataset.sequence = String(Math.random());
      s.replaceChildren(...[...text].map(c => { const t = document.createElement('span'); t.className = 'char-token'; t.textContent = c; return t; }));
      window.__tomoyoChinese.textPlace({ text, client: [1535, 863], rects: [...text].map((c, i) => placed ? [374 + i * 31, 707, 31, 31] : null) });
      return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => res({ anchored: document.body.classList.contains('megulit-anchored'), top: Math.round(document.querySelector('.char-token').getBoundingClientRect().top) })))); }, [text, placed]);
    await page.evaluate(() => { const b = window.__tomoyoChinese; b.galLayoutInfo = () => ({ clientX: 192, clientY: 102, clientWidth: 1535, clientHeight: 863, workBottom: 1032 }); b.textPlaceAnchor(true); b.textPlaceMode({ on: true, game: '1111' }); });
    const a = await show('「お客さんってば」', true);
    assert.ok(a.anchored, 'the first game anchors ' + JSON.stringify(a));
    const same = await show('「先生」', false);
    assert.ok(same.anchored, 'the same game keeps its place for an unplaced line ' + JSON.stringify(same));
    await page.evaluate(() => window.__tomoyoChinese.textPlaceMode({ on: true, game: '48964' }));
    const b2 = await show('夏の強烈な日射しを受けて、', false);
    assert.ok(!b2.anchored, 'another game has no place yet: its unplaced line is at the reader\'s own place ' + JSON.stringify(b2));
    // A short placed sentence teaches the host an origin. Its ink width is not the next sentence's wrap width.
    const { OverlayPlacement } = require('../core/overlay-placement.cjs');
    let output;
    const host = new OverlayPlacement({ send: m => { output = m; } });
    host.configure({}, { bound: true, clientWidth: 1535, clientHeight: 863 });
    const dialogue = 'すべての山を切り開けば、どれだけ楽に登校できるだろうか。';
    host.hook({ type: 'hookCharRects', engine: 'native', hidden: true, line: 1, text: '引き上げる。', rects: Array.from({ length: 6 }, (_, i) => [120+i*30,490,30,30]) });
    const table = { seq: 2, text: dialogue, dots: [{ k: 'd', i: 0, ch: dialogue[0], h: 30, a: 30 }] };
    host.glyph(table);
    const fragment = output;
    table.dots.push({ k:'d', i:dialogue.length-1, ch:dialogue.at(-1), h:30, a:30 });
    host.glyph(table);
    const complete = output;
    assert.ok(fragment.approx && complete.approx && new Set(complete.rects.map(r=>r[1])).size>2);
    const frames = await page.evaluate(async ({ fragment, complete }) => {
      const b=window.__tomoyoChinese, win=document.querySelector('.sentence-window'), sentence=win.querySelector('.sentence-text');
      win.style.width='900px';sentence.replaceChildren(...[...complete.text].map(c=>{const t=document.createElement('span');t.className='char-token';t.textContent=c;return t;}));
      const report=async m=>{b.textPlace(m);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        const r=sentence.querySelector('.char-token').getBoundingClientRect();
        return {left:r.left,top:r.top,width:sentence.getBoundingClientRect().width,breaks:sentence.querySelectorAll('br.megulit-row-br').length};};
      const before=await report(fragment);
      const ruby=document.createElement('ruby'),rt=document.createElement('rt'),tok=sentence.firstChild;
      tok.replaceWith(ruby);ruby.append(tok,rt);rt.textContent='よみ';
      win.querySelector('.tomoyo-cn-row').textContent='訳'.repeat(200);
      const after=await report(complete);
      const moved=await report({...complete,approx:false,rects:complete.rects.map((_,i)=>[220+i%12*30,320+Math.floor(i/12)*42,30,30])});
      return {before,after,moved};
    }, { fragment, complete });
    assert.equal(frames.after.breaks,0,'estimated rows leave wrapping to the reader');
    assert.equal(frames.after.width,frames.before.width);
    assert.ok(Math.abs(frames.after.left-frames.before.left)<=1 && Math.abs(frames.after.top-frames.before.top)<=1,JSON.stringify(frames));
    assert.ok(frames.moved.breaks>=1 && frames.moved.left>frames.after.left+60 && frames.moved.top<frames.after.top-100,JSON.stringify(frames));
    host.stop();
    await page.evaluate(() => { window.__tomoyoChinese.textPlaceMode({ on: false }); window.__tomoyoChinese.textPlaceMode({ on: true, game: '48964' }); });
    console.log('ok anchor other game');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
