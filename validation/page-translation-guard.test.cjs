'use strict';
/* 2026-11-21 (owner: 「检测有没有译文，没有就再查赶紧补上」, the page's earlier lines too): every shown page line still without its translation is
   asked again by its text at 0.6 / 1.5 / 3 s and filled in its own row (hook-reader pageTranslationFill); its room is reserved, so the
   Japanese above it does not move when it fills. Headless Edge for inject.js; hook-reader's fill is checked in its source. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
test('hook-reader fills a page row by its text and keeps it', () => {
  const s = read('web/reader/modules/hook-reader.js');
  assert.match(s, /b\.pageTranslationFill=\(text,tr\)=>\{const k=pageKey\(text\)/);
  assert.match(s, /\.tome-page-lines \.tome-page-tr\{display:block;min-height:/, 'the row keeps its room before it fills');
});
let chromium; try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch {}
test('page lines without a translation are asked by text and filled; the Japanese does not move', { skip: !chromium && 'no playwright-core' }, async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    await page.route('http://megulit.test/**', r => r.fulfill({ contentType: 'text/html', body: '' })); await page.goto('http://megulit.test/');
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>.tome-page-tr{display:block;min-height:32px;font-size:20px;line-height:1.3}.sentence-window{position:fixed;left:50px;bottom:20px;width:900px}</style><body><main><div class="sentence-window"><div class="tome-page-lines">
      <div><span class="tome-page-char">「おかげさまで」</span><div class="tome-page-tr"></div></div><div><span class="tome-page-char">「で？　１人？」</span><div class="tome-page-tr"></div></div></div><div class="sentence-text">「じゃあ、行ってみるか」</div></div></main>
      <script>window.__sent=[];window.__ans={'「おかげさまで」':'「托你的福啦」','「で？　１人？」':'「话说，你是一个人来的？」'};window.__tomoyoTranslateRequest=s=>{const m=JSON.parse(s);window.__sent.push(m);if(m.type==='translateGuard'&&window.__ans[m.text]){const t=m.text;setTimeout(()=>window.__tomoyoChinese.deliverBackfill(t,window.__ans[t],'guard'),50);}};</script></body>`);
    await page.addScriptTag({ content: read('web/reader/modules/inject.js') });
    /* hook-reader's fill, as on main: by text into the row */
    await page.evaluate(() => { window.__tomoyoChinese.pageTranslationFill = (t, tr) => { let hit = false; for (const d of document.querySelectorAll('.tome-page-lines > div')) if (d.querySelector('.tome-page-char').textContent === t) { d.querySelector('.tome-page-tr').textContent = tr; hit = true; } return hit; }; });
    const tops = () => page.evaluate(() => [...document.querySelectorAll('.tome-page-char')].map(c => Math.round(c.getBoundingClientRect().top)));
    const before = await tops(); await page.waitForTimeout(3300); /* within the guard's 3 s */
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.tome-page-tr')].map(n => n.textContent)), ['「托你的福啦」', '「话说，你是一个人来的？」']);
    assert.deepEqual(await tops(), before, 'the Japanese does not move');
    assert.ok(await page.evaluate(() => window.__sent.some(m => m.kind === 'translationGuard' && /page/.test(m.what))), 'noted');
  } finally { await browser.close(); }
});
