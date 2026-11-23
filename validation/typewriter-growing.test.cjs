// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 素晴らしき日々 (BGI, user 2026-11-19 17:45): 「やっぱり……いい女には、」「たばこと」「屋上と」「……そして」「ヒラヒラ服だわね……」」 is one
   sentence the game adds to its box piece by piece; the source (core/sentence-pieces.cjs) sends every stage as the grown line
   with a new sequence. The real reader modules (typewriter, line-once, hook-reader, inject, interaction, text-place) in
   headless Edge through playwright-core (skipped when it is not installed: MEGULIT_PLAYWRIGHT=<path to playwright-core>):
     - five stages, sequence + 1 each: every character is typed once, a shown one never hides, each stage types after the
       characters already shown;
     - the translation stays on screen while the line grows and the grown line's translation keeps what it shares with it;
     - the same in another engine form (KiriKiri: name in the source, new lines held for the page report);
     - not growth: a box cleared in between, another speaker, or a line already finished types the new line from the start. */
const assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
let chromium;
try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch { console.log('SKIP typewriter-growing (no playwright-core)'); process.exit(0); }
/* inject.js makes the bridge (as in the app); the rest attach to it */
const modules = ['typewriter.js', 'line-once.js', 'inject.js', 'hook-reader.js', 'interaction.js', 'text-place.js'].map(n => fs.readFileSync(path.join(__dirname, '..', 'web', 'reader', 'modules', n), 'utf8'));
const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}.sentence-window{position:fixed;left:100px;bottom:20px;width:1200px;height:150px}.sentence-text{font-size:32px}</style></head><body class="tomoyo-gal-bound">
<div class="sentence-window"><div class="sentence-text"></div></div>
<script>window.__requests=[];window.__tomoyoTranslateRequest=s=>{const m=JSON.parse(s);if(m.text&&m.id)window.__requests.push(m);};</script></body></html>`;
const PIECES = ['「やっぱり……いい女には、', 'たばこと', '屋上と', '……そして', 'ヒラヒラ服だわね……」'];
const STAGES = PIECES.map((p, i) => PIECES.slice(0, i + 1).join(''));
const CN = ['「果然……对好女人，', '「果然……对好女人，烟和', '「果然……对好女人，烟和屋顶', '「果然……对好女人，烟和屋顶……还有', '「果然……对好女人来说，烟、屋顶……还有轻飘飘的衣服啊……」'];
async function open(browser) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.route('http://megulit.test/', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto('http://megulit.test/');
  for (const [i, content] of modules.entries()) { await page.addScriptTag({ content }); if (i === 2) await page.evaluate(() => { const b = window.__tomoyoChinese; b.galStatus = () => {}; b.options = () => ({}); }); }
  await page.evaluate(() => {
    const b = window.__tomoyoChinese; window.TomeTypewriter.configure({ enabled: true, speed: 60 });
    window.__typed = new Map(); window.__first = new Map(); window.__lost = []; window.__cnEmpty = 0;
    new MutationObserver(list => { for (const m of list) { const t = m.target; if (!t.classList?.contains('char-token') || !t.closest('.tomoyo-hook-reader')) continue; if (String(m.oldValue || '').split(/\s+/).includes('tome-typewriter-pending') && !t.classList.contains('tome-typewriter-pending')) { const k = t.dataset.index + ':' + t.textContent; window.__typed.set(k, (window.__typed.get(k) || 0) + 1); } } }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
    window.__frame = () => new Promise(r => requestAnimationFrame(() => r()));
    window.__watch = () => {
      const now = performance.now(), seen = new Set();
      for (const t of document.querySelectorAll('.tomoyo-hook-reader .sentence-text .char-token')) { const cs = getComputedStyle(t), k = t.dataset.index + ':' + t.textContent; if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue; seen.add(k); if (!window.__first.has(k)) window.__first.set(k, now); }
      for (const k of window.__first.keys()) if (!seen.has(k) && !window.__lost.includes(k)) window.__lost.push(k);
      const cn = document.querySelector('.tomoyo-hook-reader .tomoyo-cn-output'); if (window.__cnShown && cn && !cn.textContent.trim()) window.__cnEmpty++; if (cn?.textContent.trim()) window.__cnShown = true;
    };
    window.__wait = async ms => { const end = performance.now() + ms; while (performance.now() < end) { await window.__frame(); window.__watch(); } };
    window.__answer = cn => { const r = window.__requests.at(-1); if (r) b.deliver(r.id, cn[r.text] ?? ''); };
    b.textPlaceAnchor?.(false); b.textPlaceMode({ on: true });
  });
  return page;
}
const shownNow = page => page.evaluate(() => window.__tomoyoChinese.hookReaderStatus().typing?.shown ?? -1);
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    /* the five stages */
    let page = await open(browser);
    const grow = await page.evaluate(async ({ STAGES, CN }) => {
      const b = window.__tomoyoChinese, cn = Object.fromEntries(STAGES.map((s, i) => [s, CN[i]])), starts = [];
      for (const [i, s] of STAGES.entries()) {
        b.galStatus({ hookActive: true, hookSource: s, hookSequence: 40 + i });
        b.textPlace({ text: s, client: [1600, 900], rects: [...s].map((c, j) => [200 + (j % 30) * 33, 640 + Math.floor(j / 30) * 46, 33, 34]) });
        starts.push(window.__tomoyoChinese.hookReaderStatus().typing?.shown ?? [...s].length);
        await window.__wait(300); window.__answer(cn); await window.__wait(700);
      }
      const typedTwice = [...window.__typed].filter(([, n]) => n > 1).map(([k]) => k);
      const order = STAGES.slice(1).every((s, i) => { const prev = [...STAGES[i]], next = [...s]; const t = k => window.__first.get(k + ':' + next[k]); return Math.min(...next.slice(prev.length).map((c, k) => t(prev.length + k))) >= Math.max(...prev.map((c, k) => t(k))); });
      return { typedTwice, lost: window.__lost, starts, order, cnEmpty: window.__cnEmpty, cn: document.querySelector('.tomoyo-hook-reader .tomoyo-cn-output')?.textContent, shown: [...document.querySelectorAll('.tomoyo-hook-reader .sentence-text .char-token')].map(t => t.textContent).join(''), requests: window.__requests.map(r => r.text) };
    }, { STAGES, CN });
    assert.strictEqual(grow.shown, STAGES.at(-1), 'the whole sentence is on screen');
    assert.deepStrictEqual(grow.typedTwice, [], 'each character is typed once over the five stages');
    assert.deepStrictEqual(grow.lost, [], 'a shown character never hides again');
    assert.deepStrictEqual(grow.starts, STAGES.map((s, i) => i ? [...STAGES[i - 1]].length : 0), 'each stage starts typing after the characters already shown');
    assert.ok(grow.order, 'the new piece appears after the shown ones');
    assert.deepStrictEqual(grow.requests, STAGES, 'every stage asks for its own whole-line translation');
    assert.strictEqual(grow.cn, CN.at(-1), 'the last translation is the whole sentence');
    assert.strictEqual(grow.cnEmpty, 0, 'the translation never goes blank while the line grows');
    await page.close();
    /* another engine form: KiriKiri-style source (【name】 in the text, engine krkr whose new lines wait for the page report),
       the line grown in three steps with sequence + 1 each; the same rule, no engine branch */
    page = await open(browser);
    const krkr = await page.evaluate(async () => {
      const b = window.__tomoyoChinese, steps = ['「で？', '「で？　１人？', '「で？　１人？　ほんとに？」'];
      b.galStatus({ hookActive: true, hookSourceEngine: 'krkr' });
      const starts = [];
      for (const [i, t] of steps.entries()) { b.galStatus({ hookActive: true, hookSource: '【芦花】' + t, hookSequence: 70 + i }); starts.push(b.hookReaderStatus().typing?.shown ?? -1); await window.__wait(1400); }
      return { starts, typedTwice: [...window.__typed].filter(([, n]) => n > 1).map(([k]) => k), lost: window.__lost, shown: [...document.querySelectorAll('.tomoyo-hook-reader .sentence-text .char-token')].map(t => t.textContent).join('') };
    });
    assert.strictEqual(krkr.shown, '「で？　１人？　ほんとに？」', 'krkr form: the whole grown line, without the name');
    assert.deepStrictEqual(krkr.starts.slice(1), [3, 7], 'krkr form: each step types after the shown characters');
    assert.deepStrictEqual(krkr.typedTwice, [], 'krkr form: each character typed once');
    assert.deepStrictEqual(krkr.lost, [], 'krkr form: a shown character never hides');
    await page.close();
    /* not growth: the box cleared in between */
    page = await open(browser);
    await page.evaluate(async S => { const b = window.__tomoyoChinese; b.galStatus({ hookActive: true, hookSource: S[0], hookSequence: 1 }); await window.__wait(500); b.galStatus({ dialogVisible: false, reason: 'window' }); b.galStatus({ dialogVisible: true }); b.galStatus({ hookActive: true, hookSource: S[1], hookSequence: 2 }); }, STAGES);
    assert.strictEqual(await shownNow(page), 0, 'box cleared in between: a new line, typed from the start');
    await page.close();
    /* not growth: another speaker */
    page = await open(browser);
    await page.evaluate(async S => { const b = window.__tomoyoChinese; b.galStatus({ hookActive: true, hookSource: '【皆守】' + S[0], hookSequence: 1 }); await window.__wait(500); b.galStatus({ hookActive: true, hookSource: '【由岐】' + S[1], hookSequence: 2 }); }, STAGES);
    assert.strictEqual(await shownNow(page), 0, 'another speaker: a new line, typed from the start');
    await page.close();
    /* not growth: the line on screen was finished */
    page = await open(browser);
    await page.evaluate(async () => { const b = window.__tomoyoChinese; b.galStatus({ hookActive: true, hookSource: '「そうか」', hookSequence: 1 }); await window.__wait(400); b.galStatus({ hookActive: true, hookSource: '「そうか」と彼は言った。', hookSequence: 2 }); });
    assert.strictEqual(await shownNow(page), 0, 'a finished line followed by one that starts with it: a new line');
    await page.close();
    console.log('ok typewriter-growing');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
