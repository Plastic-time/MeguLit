// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-19 user test e6f5def8 (素晴らしき日々 BGI, 11:14Z): 「やっぱり……いい女には、」 had its translation; once the line grew to
   「…たばこと屋上とヒラヒラ服だわね……」」 the translation went and 「翻译暂不可用 · Alt+T」 was shown under it. The grown line's own
   translation never came (the script lookup missed it, services/original-text.cjs, and machine translation was not
   available), and inject.js put the error in place of the translation it was showing.
   Now a grown line that gets no translation keeps the one on screen and asks again, twice at most; a line that did not grow
   still says why it has none. Real reader modules in headless Edge (skipped without playwright-core). */
const assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
let chromium;
try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch { console.log('SKIP growing-translation-retry (no playwright-core)'); process.exit(0); }
const modules = ['typewriter.js', 'line-once.js', 'inject.js', 'hook-reader.js', 'interaction.js', 'text-place.js'].map(n => fs.readFileSync(path.join(__dirname, '..', 'web', 'reader', 'modules', n), 'utf8'));
const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}.sentence-window{position:fixed;left:100px;bottom:20px;width:1200px;height:150px}.sentence-text{font-size:32px}</style></head><body class="tomoyo-gal-bound">
<div class="sentence-window"><div class="sentence-text"></div></div>
<script>window.__requests=[];window.__tomoyoTranslateRequest=s=>{const m=JSON.parse(s);if(m.text&&m.id)window.__requests.push(m);};</script></body></html>`;
const STAGES = ['「やっぱり……いい女には、', '「やっぱり……いい女には、たばこと', '「やっぱり……いい女には、たばこと屋上と', '「やっぱり……いい女には、たばこと屋上と……そして', '「やっぱり……いい女には、たばこと屋上と……そしてヒラヒラ服だわね……」'];
const CN = ['「果然……好女人要有的是，', '「果然……好女人要有的是，烟、', '「果然……好女人要有的是，烟、楼顶', '「果然……好女人要有的是，烟、楼顶……还有', '「果然……好女人要有的是，烟、楼顶……还有轻飘飘的衣服呀……」'];
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await page.route('http://megulit.test/', route => route.fulfill({ contentType: 'text/html', body: html }));
    await page.goto('http://megulit.test/');
    for (const [i, content] of modules.entries()) { await page.addScriptTag({ content }); if (i === 2) await page.evaluate(() => { const b = window.__tomoyoChinese; b.galStatus = () => {}; b.options = () => ({}); }); }
    const r = await page.evaluate(async ({ STAGES, CN }) => {
      const b = window.__tomoyoChinese, sleep = ms => new Promise(f => setTimeout(f, ms)), cn = () => document.querySelector('.tomoyo-hook-reader .tomoyo-cn-output')?.textContent || '';
      window.TomeTypewriter.configure({ enabled: false });
      const last = () => window.__requests.at(-1), out = { stages: [], blanks: 0 };
      let watching = true; (async () => { let seen = false; while (watching) { const t = cn(); if (t) seen = true; if (seen && (!t.trim() || /暂不可用|无法翻译/.test(t))) out.blanks++; await sleep(16); } })();
      for (const [i, s] of STAGES.entries()) {
        b.galStatus({ hookActive: true, hookSource: s, hookSequence: 40 + i });
        await sleep(400);
        const req = last();
        /* stages 2 and 5: the first answer is an error (the lookup missed, machine translation unavailable) */
        if (i === 1 || i === 4) { b.deliver(req.id, '', true, 'MT_UNAVAILABLE'); out.kept = out.kept || []; out.kept.push(cn()); await sleep(1700); const again = last(); out.retried = (out.retried || 0) + (again.id !== req.id && again.text === s ? 1 : 0); b.deliver(again.id, CN[i]); }
        else b.deliver(req.id, CN[i]);
        await sleep(200); out.stages.push(cn());
      }
      watching = false;
      /* a line that did not grow: the error is shown as before */
      b.galStatus({ hookActive: true, hookSource: '　たばこの銘柄はマイナーなもの……', hookSequence: 60 });
      await sleep(400); b.deliver(last().id, '', true, 'MT_UNAVAILABLE'); await sleep(200); out.fresh = cn();
      return out;
    }, { STAGES, CN });
    assert.deepStrictEqual(r.stages, CN, 'every stage ends with its translation; the last is the whole sentence');
    assert.deepStrictEqual(r.kept, [CN[0], CN[3]], 'a failed grown line keeps the translation already shown');
    assert.strictEqual(r.retried, 2, 'and asks again for the grown line');
    assert.strictEqual(r.blanks, 0, 'the translation never goes blank or turns into an error while the line grows');
    assert.match(r.fresh, /暂不可用|无法翻译|MT_UNAVAILABLE/, 'a new line with no translation still says so');
    console.log('ok growing-translation-retry');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
