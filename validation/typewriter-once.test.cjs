// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 1.4.17 candidate (user: 「打字机效果总会有点很奇怪的问题，像运行了两遍一样；有的时候像被啃了一块走又恢复一样；所有游戏都这样」).
   The real reader modules (typewriter, line-once, hook-reader, interaction, text-place) in headless Edge through
   playwright-core (skipped when it is not installed: MEGULIT_PLAYWRIGHT=<path to playwright-core>). One line arrives and
   the game reports its character boxes in batches, then the same line gets every later update a live game sends: the same
   text again, its places again, a part appended, ruby wrapped round its characters, the translation, the line's colour.
   Every frame and every window-region report is checked:
     - each character is typed once: it loses its pending mark at most once, and a shown character never hides again;
     - the appended part is typed after the characters already shown, not from the start;
     - every character already let in is inside the window region the reader reports (the reader paints only there;
       a revealed character left out for one report was the hole that swept along behind the typing). */
const assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
let chromium;
try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch { console.log('SKIP typewriter-once (no playwright-core)'); process.exit(0); }
const modules = ['typewriter.js', 'line-once.js', 'hook-reader.js', 'interaction.js', 'text-place.js'].map(n => fs.readFileSync(path.join(__dirname, '..', 'web', 'reader', 'modules', n), 'utf8'));
const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}.sentence-window{position:fixed;left:100px;bottom:20px;width:1200px;height:150px}.sentence-text{font-size:32px}</style></head><body class="tomoyo-gal-bound">
<div class="sentence-window"><div class="sentence-text"></div><div class="tomoyo-cn-row"><div class="tomoyo-cn-output"></div></div></div>
<script>window.__regions=[];window.__miss=[];window.__tomoyoTranslateRequest=s=>{const m=JSON.parse(s);if(m.type!=='galHitRegions')return;window.__regions.push(m);
 for(const t of document.querySelectorAll('.tomoyo-hook-reader .sentence-text .char-token')){const cs=getComputedStyle(t);if(cs.display==='none'||t.classList.contains('tome-typewriter-pending'))continue;const r=t.getBoundingClientRect(),y=r.top+r.height/2;
  if(![.1,.3,.5,.7,.9].every(f=>{const x=r.left+r.width*f;return m.regions.some(q=>x>=q.x&&x<q.x+q.width&&y>=q.y&&y<q.y+q.height);}))window.__miss.push(t.dataset.index+':'+t.textContent+'@'+cs.opacity);}};
window.__tomoyoChinese={galStatus(){}};</script></body></html>`;
const A = '全く意味のわからない話だったが、', B = 'それが今起こっている事の一端だった';
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await page.setContent(html);
    for (const content of modules) await page.addScriptTag({ content });
    const result = await page.evaluate(async ({ A, B }) => {
      const b = window.__tomoyoChinese, frame = () => new Promise(r => requestAnimationFrame(() => r()));
      const wait = async ms => { const end = performance.now() + ms; while (performance.now() < end) { await frame(); watch(); } };
      window.TomeTypewriter.configure({ enabled: true, speed: 35 });
      const rect = i => [300 + (i % 20) * 33, 640 + Math.floor(i / 20) * 46, 33, 34];
      const place = (text, n, extra = {}) => b.textPlace({ text, client: [1600, 900], rects: [...text].map((c, i) => i < n ? rect(i) : null), ...extra });
      /* per character (by index and letter): times it was let in, when it was first seen, whether it hid again */
      const typed = new Map(), first = new Map(), lost = [];
      new MutationObserver(list => { for (const m of list) { const t = m.target; if (!t.classList?.contains('char-token') || !t.closest('.tomoyo-hook-reader')) continue; const was = String(m.oldValue || '').split(/\s+/).includes('tome-typewriter-pending'); if (was && !t.classList.contains('tome-typewriter-pending')) { const k = t.dataset.index + ':' + t.textContent; typed.set(k, (typed.get(k) || 0) + 1); } } }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
      function watch() {
        const now = performance.now(), seen = new Set();
        for (const t of document.querySelectorAll('.tomoyo-hook-reader .sentence-text .char-token')) { const cs = getComputedStyle(t), k = t.dataset.index + ':' + t.textContent; if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue; seen.add(k); if (!first.has(k)) first.set(k, now); }
        for (const k of first.keys()) if (!seen.has(k) && !lost.includes(k)) lost.push(k);
      }
      b.textPlaceAnchor?.(false); b.textPlaceMode({ on: true });
      b.galStatus({ hookActive: true, hookSource: A, hookSequence: 1 });
      /* the game types the line: its places arrive two at a time */
      for (let n = 2; n <= [...A].length; n += 2) { place(A, n); await wait(40); }
      place(A, [...A].length); await wait(120);
      /* the same text again, several times, and its places again */
      for (let i = 0; i < 3; i++) { b.galStatus({ hookActive: true, hookSource: A, hookSequence: 1 }); place(A, [...A].length); await wait(30); }
      const shownA = [...A].map((c, i) => first.get(i + ':' + c));
      /* a part appended to the same line (one message, a continuation): typed after what is shown */
      const AB = A + B, lenA = [...A].length;
      b.galStatus({ hookActive: true, hookSource: AB, hookSequence: 1 }); place(AB, lenA);
      await wait(30);
      const keptRightAway = [...A].every((c, i) => { const t = document.querySelector('.tomoyo-hook-reader .char-token[data-index="' + i + '"]'); return t && !t.classList.contains('tome-typewriter-pending') && getComputedStyle(t).display !== 'none'; });
      for (let n = lenA + 2; n <= [...AB].length; n += 2) {
        place(AB, n); await wait(30);
        /* ruby arrives while it types: tokens are wrapped in place (gal.js), the translation lands, the line gets its colour */
        if (n === lenA + 6) { const s = document.querySelector('.tomoyo-hook-reader .sentence-text'), t = [...s.querySelectorAll('.char-token')]; const base = document.createElement('span'); base.className = 'megulit-ruby-base'; base.dataset.tomoyoReading = 'いみ'; t[2].before(base); base.append(t[2], t[3]); }
        if (n === lenA + 10) window.TomeTypewriter.text(document.querySelector('.tomoyo-hook-reader .tomoyo-cn-output') || document.querySelector('.tomoyo-cn-output'), '完全听不懂的话，但那正是现在发生之事的一端');
        if (n === lenA + 12) place(AB, n, { color: '#ffffff' });
      }
      place(AB, [...AB].length); await wait(1500);
      return {
        typedTwice: [...typed].filter(([, n]) => n > 1).map(([k]) => k), lost, miss: window.__miss.slice(0, 20), missCount: window.__miss.length,
        allShown: [...AB].every((c, i) => first.has(i + ':' + c)), keptRightAway,
        aKeptTimes: [...A].every((c, i) => first.get(i + ':' + c) === shownA[i]),
        bAfterA: Math.min(...[...B].map((c, i) => first.get((lenA + i) + ':' + c))) >= Math.max(...shownA),
        regions: window.__regions.length
      };
    }, { A, B });
    /* 千恋＊万花 08:42:31 (seq 31): the frame held 「で？　１人？」 twice and the start of a third copy; the game placed 7 characters.
       Then the same line redrawn from its start (a shorter piece, same sequence). The reader shows the sentence once, whole. */
    const repeat = await page.evaluate(async () => {
      const b = window.__tomoyoChinese, frame = () => new Promise(r => requestAnimationFrame(() => r())), wait = async ms => { const end = performance.now() + ms; while (performance.now() < end) await frame(); };
      const L = '「で？　１人？」', shown = () => [...document.querySelectorAll('.tomoyo-hook-reader .sentence-text .char-token')].map(t => t.textContent).join('');
      const rects = n => [...L.replace(/\s|　/g, '')].map((c, i) => i < n ? [300 + i * 30, 640, 29, 29] : null);
      b.galStatus({ hookActive: true, hookSource: L + L + '「で？', hookSequence: 31 }); b.textPlace({ text: L.replace(/　/g, ''), client: [1600, 900], rects: rects(7) }); await wait(600);
      const first = shown();
      b.galStatus({ hookActive: true, hookSource: '「で？', hookSequence: 31 }); await wait(200);
      return { first, redrawn: shown(), status: b.hookReaderStatus() };
    });
    assert.strictEqual(repeat.first, '「で？　１人？」', 'a frame holding the line twice and a piece is the line once');
    assert.strictEqual(repeat.redrawn, '「で？　１人？」', 'the same line redrawn from its start keeps the whole line');
    assert.ok(result.allShown, 'every character of the line was shown');
    assert.deepStrictEqual(result.typedTwice, [], 'each character is typed once');
    assert.deepStrictEqual(result.lost, [], 'a shown character never hides again');
    assert.ok(result.keptRightAway, 'appended part: the characters already shown stay shown (no retype from the start)');
    assert.ok(result.aKeptTimes && result.bAfterA, 'appended part types after the shown ones');
    assert.ok(result.regions > 0, 'the reader reported its window region');
    assert.deepStrictEqual(result.miss, [], 'every character let in is inside every window region reported');
    console.log('ok typewriter-once', JSON.stringify({ regions: result.regions }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
