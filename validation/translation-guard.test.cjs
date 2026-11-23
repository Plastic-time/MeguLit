'use strict';
/* 2026-11-21 (owner: 「再加个兜底的检测有没有译文，没有的话就再查赶紧补上」). The reader's translation guard: a line still without a translation
   600 ms / 1.5 s / 3 s after it is shown is asked again by its text, past "already asked" and the request serial, and filled when the answer
   comes; after 3 s a faint 「翻译中…」 stands there, never an empty row. Timelines of r26 (the request lost) and r34 (the answer comes after
   the next request was sent). The service side answers from the cache, the script, then the fallback chain. Headless Edge for the reader. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { Reader } = require('../services/reader.cjs');
test('service: a guard request is answered from the cache or the fallback chain and filled by text', async () => {
  const r = Object.create(Reader.prototype), emitted = [];
  Object.assign(r, { displayLanguage: () => 'zh', gal: { hooks: { trace() {}, scriptTranslation: () => '' } }, runtime: { emit: (n, e) => emitted.push(e) }, baseOptions: () => ({}), chainTranslate: async t => ({ text: '机翻:' + t }) });
  r.embedCached('「うん、元気元気～」', '“嗯，好得很～”');
  for (const text of ['「うん、元気元気～」', '「？？？　例のイベントって？」']) await r.message({ type: 'translateGuard', text });
  await new Promise(res => setTimeout(res, 50));
  assert.ok(emitted.some(e => e.args?.[0] === '「うん、元気元気～」' && e.args[1] === '“嗯，好得很～”' && e.args[2] === 'guard'), JSON.stringify(emitted));
  assert.ok(emitted.some(e => e.args?.[0] === '「？？？　例のイベントって？」' && e.args[1].startsWith('机翻:')));
});
let chromium; try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch {}
test('reader: every line has a translation within 3 s (request lost, answer late, no answer at all -> faint placeholder)', { skip: !chromium && 'no playwright-core' }, async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    await page.route('http://megulit.test/**', r => r.fulfill({ contentType: 'text/html', body: '' })); await page.goto('http://megulit.test/');
    await page.setContent('<!doctype html><meta charset="utf-8"><body><main><div class="sentence-window"><div class="sentence-text"></div></div></main><script>window.__sent=[];window.__answer={};window.__tomoyoTranslateRequest=s=>{const m=JSON.parse(s);window.__sent.push(m);if(m.type==="translateGuard"&&window.__answer[m.text])setTimeout(()=>window.__tomoyoChinese.deliverBackfill(m.text,window.__answer[m.text],"guard"),100);};</script></body>');
    await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, '..', 'web', 'reader', 'modules', 'inject.js'), 'utf8') });
    const show = t => page.evaluate(t => { document.querySelector('.sentence-text').textContent = t; window.__tomoyoChinese.refresh(); }, t);
    const out = () => page.evaluate(() => [document.querySelector('.tomoyo-cn-output')?.textContent || '', document.querySelector('.tomoyo-cn-output')?.style.opacity]);
    /* r26: the request goes nowhere; the guard asks by text and fills it */
    await page.evaluate(() => { window.__answer['「ここに来たのは多分……４年ぶりじゃないかな？」'] = '“我来这里大概……是四年来第一次吧？”'; });
    await show('「ここに来たのは多分……４年ぶりじゃないかな？」'); await page.waitForTimeout(1000);
    assert.equal((await out())[0], '“我来这里大概……是四年来第一次吧？”');
    /* r34: no answer at all for 3 s: a faint placeholder, then the late answer fills it */
    await show('「？？？　例のイベントって？」'); await page.waitForTimeout(3300);
    assert.deepEqual(await out(), ['翻译中…', '0.45']);
    await page.evaluate(() => window.__tomoyoChinese.deliverBackfill('「？？？　例のイベントって？」', '“你说的活动是？”', 'late')); await page.waitForTimeout(100);
    assert.equal((await out())[0], '“你说的活动是？”');
    assert.ok(await page.evaluate(() => window.__sent.filter(m => m.kind === 'translationGuard').length >= 3), 'guard steps noted');
  } finally { await browser.close(); }
});
