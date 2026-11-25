
// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

let chromium;
try {
  ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core'));
} catch {}

test('retained GDI rows leave room for the current translation inside the client', { skip: !chromium }, async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.setContent('<meta charset="utf-8"><style>.sentence-window{position:fixed;width:800px;height:600px}</style>' +
      '<main><div class="sentence-window tomoyo-hook-reader"><div class="sentence-text"><span class="char-token">今</span>' +
      '<span class="char-token">日</span></div><div class="tomoyo-cn-row">今天</div></div></main>');
    await page.evaluate(() => { window.__tomoyoChinese = {}; });
    await page.addScriptTag({ path: path.join(__dirname, '../web/reader/modules/text-place.js') });
    const draw = async (y, nextY) => {
      await page.evaluate(([y, nextY]) => {
        const b = window.__tomoyoChinese;
        b.textPlaceMode({ on: true });
        b.textPlacePage({ awake: true, armed: true, engineRows: true, retainedBitmap: true, client: [800, 600],
          lines: [{ id: 1, text: '今日', rects: [[266, y, 20, 20], [286, y, 20, 20]] },
            { id: 2, text: '明日', rects: [[266, nextY, 20, 20], [286, nextY, 20, 20]] }] });
      }, [y, nextY]);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      return page.locator('.tomoyo-cn-row').evaluate(row => {
        const { top, bottom, left } = row.getBoundingClientRect();
        return { top, bottom, left, visible: row.checkVisibility({ visibilityProperty: true }) };
      });
    };
    const normal = await draw(468, 494);
    assert.equal(normal.left, 266);
    assert.ok(normal.visible && normal.top >= 514 && normal.bottom <= 600, JSON.stringify(normal));
    const bottom = await draw(550, 576);
    assert.equal(bottom.left, 266);
    assert.ok(bottom.visible && bottom.top >= 0 && bottom.bottom <= 550, JSON.stringify(bottom));
  } finally {
    await browser.close();
  }
});
