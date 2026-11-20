'use strict';
/* 2026-11-21 (owner, 千恋＊万花: 「译文后出来的话就会把上面的挤上去」): the translation row keeps room for the translation from the moment the
   Japanese is shown, so a translation that comes 500 ms later never moves the Japanese (the block stands on its bottom edge here, as the
   reader's own place does). Also: read() notes why it does not ask (translateSkip). Headless Edge. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
let chromium; try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch {}
test('a translation arriving 500 ms late never moves the Japanese; skips are noted', { skip: !chromium && 'no playwright-core' }, async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.route('http://megulit.test/**', r => r.fulfill({ contentType: 'text/html', body: '' })); await page.goto('http://megulit.test/');
    await page.setContent('<!doctype html><meta charset="utf-8"><style>.sentence-window{position:fixed;left:100px;bottom:20px;width:900px}.sentence-text{font-size:30px}.tomoyo-cn-output{font-size:26px;line-height:1.4}</style><body><main><div class="sentence-window"><div class="sentence-text"></div></div></main><script>window.__sent=[];window.__tomoyoTranslateRequest=s=>window.__sent.push(JSON.parse(s));</script></body>');
    await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, '..', 'web', 'reader', 'modules', 'inject.js'), 'utf8') });
    const top = () => page.evaluate(() => Math.round(document.querySelector('.sentence-text').getBoundingClientRect().top));
    const line = async (jp, zh) => {
      await page.evaluate(t => { document.querySelector('.sentence-text').textContent = t; window.__tomoyoChinese.refresh(); }, jp); await page.waitForTimeout(200);
      const before = await top(); const id = await page.evaluate(() => window.__tomoyoChinese.serial);
      await page.waitForTimeout(500); await page.evaluate(([id, zh]) => window.__tomoyoChinese.deliver(id, zh, ''), [id, zh]); await page.waitForTimeout(100);
      return [before, await top()]; };
    /* the first line sets the room; the next ones, of one and two rows, never move the Japanese */
    await line('「で？　１人？」', '“所以呢？一个人？”');
    for (const [jp, zh] of [['「ここに来たのは多分……４年ぶりじゃないかな？　俺も問題ないよ。健康そのもの」', '“我来这里大概……是四年来第一次吧？我也没问题哦，健康得很。身体好得不得了，一点毛病都没有呢”'], ['「おかげさまで」', '“托您的福”']]) {
      const [a, b] = await line(jp, zh); assert.equal(b, a, 'the Japanese keeps its place when the translation comes: ' + jp);
    }
    await page.evaluate(() => window.__tomoyoChinese.setTranslationVisible(false)); await page.waitForTimeout(300);
    assert.ok(await page.evaluate(() => window.__sent.some(m => m.type === 'layoutDiagnostic' && m.kind === 'translateSkip' && m.reason === 'translation hidden')), 'skips are noted ' + JSON.stringify(await page.evaluate(() => window.__sent.filter(m => m.kind))));
  } finally { await browser.close(); }
});
