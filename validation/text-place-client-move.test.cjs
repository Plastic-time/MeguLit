// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

let chromium;
try {
  ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core'));
} catch {}

const html = `<!doctype html><meta charset="utf-8">
  <style>.sentence-window { position: fixed; width: 640px }</style>
  <main><div class="sentence-window tomoyo-hook-reader">
    <div class="sentence-text"><span class="char-token">今</span><span class="char-token">日</span></div>
    <div class="tomoyo-cn-row">今天</div>
  </div></main>`;

test('settled Japanese and Chinese follow client moves without another text report', { skip: !chromium }, async () => {
  const dpr = 1.25;
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const model of ['page', 'anchor', 'cells']) {
      const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: dpr });
      await page.route('http://reader.test/', route => route.fulfill({ contentType: 'text/html', body: html }));
      await page.goto('http://reader.test/');
      await page.evaluate(() => { window.__tomoyoChinese = { setTranslationVisible() {} }; });
      for (const name of ['game-style', 'gal', 'text-place']) {
        await page.addScriptTag({ path: path.join(__dirname, '../web/reader/modules', name + '.js') });
      }
      const move = (x, y) => page.evaluate(([x, y]) => {
        window.__tomoyoChinese.galStatus({ layout: {
          clientX: x, clientY: y, clientWidth: 804, clientHeight: 604,
          readerX: x + 100, readerY: y + 420, readerWidth: 480, readerHeight: 130,
          surfaceWidth: 2000, surfaceHeight: 1125
        } });
      }, [x, y]);
      await move(546, 233);
      await page.evaluate(mode => {
        const bridge = window.__tomoyoChinese;
        const row = { id: 54, text: '今日', rects: [[70, 488, 22, 22], [92, 488, 22, 22]] };
        bridge.textPlaceMode({ on: true });
        bridge.textPlaceAnchor(mode !== 'cells');
        if (mode === 'page') {
          bridge.textPlacePage({ awake: true, armed: true, engineRows: true, client: [800, 600],
            lines: [{ id: 53, text: '前', rects: [[70, 454, 22, 22]] }, row] });
        } else {
          bridge.textPlace({ ...row, client: [800, 600] });
        }
      }, model);
      const positions = () => page.evaluate(mode => {
        const selectors = ['.sentence-text:not(.megulit-old-line) .char-token', '.tomoyo-cn-row'];
        if (mode === 'page') selectors.push('.megulit-old-line .char-token');
        return selectors.map(selector => {
          const el = document.querySelector(selector);
          if (!el?.checkVisibility({ visibilityProperty: true })) throw Error('Expected visible ' + selector);
          const bounds = el.getBoundingClientRect();
          if (!bounds.width) throw Error('Expected nonempty ' + selector);
          return [bounds.x, bounds.y];
        });
      }, model);
      await page.waitForTimeout(350); // Let the initial line finish revealing before moving the game.
      const initial = await positions();
      // Include a move inside the anchor smoothing tolerance and the two moves in the recording.
      for (const [x, y] of [[549, 235], [615, 181], [408, 272], [546, 233]]) {
        await move(x, y);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const points = await positions();
        for (const [index, point] of points.entries()) {
          const label = model + ' element ' + index + ' at client ' + x + ',' + y;
          assert.ok(Math.abs(point[0] - initial[index][0] - (x - 546) / dpr) < 1, label + ' horizontal');
          assert.ok(Math.abs(point[1] - initial[index][1] - (y - 233) / dpr) < 1, label + ' vertical');
        }
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
