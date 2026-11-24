// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path');
let chromium;
try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch {}

test('a GPU-placed translation stays inside the game client without moving the Japanese', { skip: !chromium && 'no playwright-core' }, async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1150, height: 900 }, deviceScaleFactor: 1.5 });
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
      .sentence-window{position:fixed;left:140px;top:400px;width:485px}
      .sentence-text{font-size:23px;line-height:58px;padding-top:12px}
      .tomoyo-cn-row{margin-top:12px;font-size:20px;line-height:32px}
      .tomoyo-cn-output{display:block}
    </style><body class="tomoyo-gal-bound"><div class="sentence-window tomoyo-hook-reader">
      <div class="sentence-text"></div><div class="tomoyo-cn-row"><span class="tomoyo-cn-output"></span></div>
    </div><script>
      window.__tomoyoChinese={galLayoutInfo:()=>({clientX:300,clientY:377,clientWidth:1280,clientHeight:720,workBottom:1350})};
      window.MeguLitProfile={get:k=>k==='placement.translationGrowsDown'};
      window.packets=[];window.__tomoyoTranslateRequest=s=>packets.push(JSON.parse(s));
    </script></body>`);
    await page.addScriptTag({ path: path.join(__dirname, '..', 'web', 'reader', 'modules', 'text-place.js') });
    await page.addScriptTag({ path: path.join(__dirname, '..', 'web', 'reader', 'modules', 'interaction.js') });
    await page.evaluate(() => window.__tomoyoChinese.textPlaceMode({ on: true }));
    const setLine = (text, y) => page.evaluate(([text, y]) => {
      document.querySelector('.sentence-text').replaceChildren(...[...text].map(c =>
        Object.assign(document.createElement('span'), { className: 'char-token', textContent: c })));
      document.querySelector('.tomoyo-cn-output').textContent = '';
      window.__tomoyoChinese.textPlace({ engine: 'gpu', text, client: [1280, 720], rects: [...text].map((_, i) => [470 + i * 28, y, 32, 32]) });
    }, [text, y]);
    const translate = text => page.evaluate(text => { document.querySelector('.tomoyo-cn-output').textContent = text; }, text);
    const layout = () => page.evaluate(async () => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const rect = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
      const row = document.querySelector('.tomoyo-cn-row');
      return { jp: rect('.sentence-text'), glyph: rect('.char-token'), cn: rect('.tomoyo-cn-output'),
        row: rect('.tomoyo-cn-row'), overflow: getComputedStyle(row).overflowY, offset: row.style.translate };
    });
    const clientTop = 377 / 1.5, clientBottom = (377 + 720) / 1.5;

    await setLine('どうして、私を見捨てたの？', 334);
    await translate('你为什么抛弃我？');
    const middle = await layout();
    assert.ok(middle.cn.top >= middle.jp.bottom && middle.cn.bottom < clientBottom);
    assert.equal(middle.offset, '');

    await setLine('見捨てたわけじゃない。', 656);
    const pending = await layout();
    await translate('我没有抛弃你。'.repeat(7));
    const bottom = await layout();
    assert.ok(bottom.glyph.top > middle.glyph.top + 190);
    assert.equal(bottom.glyph.top, pending.glyph.top);
    assert.ok(bottom.cn.top >= clientTop && bottom.cn.bottom < bottom.jp.top,
      `the full translation should be above the Japanese in the client: ${JSON.stringify(bottom)}`);
    assert.ok(bottom.cn.height > 32, 'the wrapped translation remains fully visible');

    await translate('我没有抛弃你。'.repeat(240));
    const long = await layout();
    assert.ok(long.row.top >= clientTop - .05 && long.row.bottom < long.jp.top, JSON.stringify(long));
    assert.equal(long.overflow, 'auto');
    assert.equal(long.glyph.top, bottom.glyph.top);

    await setLine('そういうことだ。', 190);
    await translate('就是这样。');
    const next = await layout();
    assert.equal(next.offset, '');
    assert.ok(next.cn.top >= next.jp.bottom && next.cn.bottom < clientBottom);
    await translate('就是这样。'.repeat(240));
    const longBelow = await layout();
    assert.ok(longBelow.row.top > longBelow.jp.bottom && longBelow.row.bottom <= clientBottom + .05, JSON.stringify(longBelow));
    assert.equal(longBelow.overflow, 'auto');

    await setLine('もう一度、話してくれませんか。', 370);
    await translate('我没有抛弃你。'.repeat(65));
    const scroll = await layout();
    const hits = await page.evaluate(({ row, jp }) => {
      const x = row.left + 20, inside = row.top + 20, outside = jp.bottom + 60;
      const { regions } = window.packets.findLast(p => p.type === 'galHitRegions');
      const occupied = y => regions.some(r => !r.pass && x * devicePixelRatio >= r.x && x * devicePixelRatio < r.x + r.width &&
        y * devicePixelRatio >= r.y && y * devicePixelRatio < r.y + r.height);
      const wheel = y => { window.__megulitResolveWheel(1, x, y); return window.packets.at(-1).panel; };
      return { visible: occupied(inside), clipped: occupied(outside), wheelInside: wheel(inside), wheelOutside: wheel(outside) };
    }, scroll);
    assert.deepEqual(hits, { visible: true, clipped: false, wheelInside: true, wheelOutside: false });
  } finally { await browser.close(); }
});
