'use strict';
/* 2026-11-21 (owner, 千恋＊万花 中文版, r26: 21:40:06.292 「translation store key=8b4752d6/34」 and 21:40:10.261 「store key=334de05d/36」 with no lookup after
   them, the line shown without Chinese). A stored patch translation is offered to the line on screen at once (services/reader.cjs ->
   deliverBackfill) and the reader fills the line when it shows none: whether its request was lost, came back empty, or it was written
   another way (brackets, ruby). A line that shows its own translation is left alone. Headless Edge for the reader part. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { Reader } = require('../services/reader.cjs');
const JP = '「ここに来たのは多分……４年ぶりじゃないかな？　俺も問題ないよ。健康そのもの」', ZH = '“我来这里大概……是四年来第一次吧？我也没问题哦，健康得很”';
test('services: a patch store goes to the reader as a fill at once', () => {
  const r = Object.create(Reader.prototype), emitted = []; Object.assign(r, { runtime: { emit: (n, e) => emitted.push(e) }, displayLanguage: () => 'zh', gal: { hooks: { trace() {}, originalText: null } }, stats: { translation() {} } });
  try { r.event({ type: 'hookPatchTranslation', japanese: JP, chinese: ZH, machine: false }); } catch {}
  assert.ok(emitted.some(e => e?.method === 'deliverBackfill' && e.args[0] === JP && e.args[1] === ZH), JSON.stringify(emitted));
  assert.equal(r.embedCached(JP), ZH);
});
let chromium; try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch {}
test('reader: the line on screen is filled from the store (request lost / empty answer / written another way); a translated line stays', { skip: !chromium && 'no playwright-core' }, async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    /* a real origin (localStorage) */ await page.route('http://megulit.test/**', r => r.fulfill({ contentType: 'text/html', body: '' })); await page.goto('http://megulit.test/');
    await page.setContent('<!doctype html><meta charset="utf-8"><body><main><div class="sentence-window"><div class="sentence-text"></div></div></main><script>window.__sent=[];window.__tomoyoTranslateRequest=s=>window.__sent.push(JSON.parse(s));</script></body>');
    await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, '..', 'web', 'reader', 'modules', 'inject.js'), 'utf8') });
    const show = t => page.evaluate(t => { document.querySelector('.sentence-text').textContent = t; window.__tomoyoChinese.refresh(); return new Promise(r => setTimeout(r, 300)); }, t);
    const out = () => page.evaluate(() => document.querySelector('.tomoyo-cn-output')?.textContent || '');
    /* 1: the request for the line was lost (nothing ever comes back), the patch store arrives */
    await show(JP); /* no answer ever comes for it (r26: no lookup at all) */
    await page.evaluate(([j, z]) => window.__tomoyoChinese.deliverBackfill(j, z), [JP, ZH]); await page.waitForTimeout(100);
    assert.equal(await out(), ZH, 'filled from the store');
    /* 2: the next line: asked, the answer is an error (miss), then the store comes, written without the brackets and with ruby */
    const JP2 = '「うん、元気元気～。まー坊の方こそどうしてたの？　あれ？　何年ぶりだっけ？」', ZH2 = '“嗯，好得很～。小将臣你呢？咦？多少年没见了？”';
    await show(JP2); await page.evaluate(() => { const b = window.__tomoyoChinese; b.deliver(b.serial, '', 'TRANSLATION_FAILED'); }); await page.waitForTimeout(100);
    await page.evaluate(([j, z]) => window.__tomoyoChinese.deliverBackfill(j, z), [JP2.slice(1, -1).replace('元気元気', '｜元気《げんき》元気'), ZH2]); await page.waitForTimeout(100);
    assert.equal(await out(), ZH2, 'filled after a miss, written another way');
    /* 3: a line that shows its own translation keeps it; a store for another line changes nothing */
    await page.evaluate(([j]) => window.__tomoyoChinese.deliverBackfill(j, '别的译文'), [JP2]); await page.waitForTimeout(50);
    assert.equal(await out(), ZH2, 'a translated line is left as it is');
    await page.evaluate(() => window.__tomoyoChinese.deliverBackfill('「全然違う別の行です。ここには関係ない」', '无关')); await page.waitForTimeout(50);
    assert.equal(await out(), ZH2);
  } finally { await browser.close(); }
});
