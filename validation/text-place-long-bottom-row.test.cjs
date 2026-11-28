// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { findBrowser, launch } = require('../services/cardinal/cdp.cjs');

const executable = findBrowser();
const placement = path.join(__dirname, '../web/reader/modules/text-place.js');
const near = (value, expected, label) => assert.ok(Math.abs(value - expected) < 1, `${label}: ${value}, expected ${expected}`);

test('a long centered bottom row fits the native glyph span at the configured font size', { skip: !executable }, async () => {
  const browser = await launch({ executable, viewport: { width: 1280, height: 720 } });
  try {
    const { page } = browser;
    await page.evaluate(() => {
      document.body.innerHTML = `<style>
        .sentence-window { position: fixed; left: 200px; bottom: 0; width: 768px; }
        .sentence-text { font-family: Meiryo, sans-serif; line-height: 1.6; }
        .char-token { display: inline-block; width: 1em; }
      </style><div class="sentence-window tomoyo-hook-reader"><div class="sentence-text"></div></div>`;
      window.__tomoyoChinese = { galLayoutInfo: () => ({ clientX: 0, clientY: 0, clientWidth: 1280, clientHeight: 720 }) };
    });
    await page.addScriptTag({ path: placement });
    const results = await page.evaluate(async () => {
      const bridge = window.__tomoyoChinese;
      const sentence = document.querySelector('.sentence-text');
      let text = 'あいうえおかきくけこさしすせそたちつてとな';
      for (const ch of text) {
        const token = document.createElement('span');
        token.className = 'char-token';
        token.textContent = ch;
        sentence.append(token);
      }
      const sample = async (font, top, anchorDX = 0, anchorDY = 0, clientScale = 1) => {
        bridge.galPreferences = () => ({ anchorDX, anchorDY });
        bridge.galLayoutInfo = () => ({
          clientX: 0, clientY: 0, clientWidth: 1280 * clientScale, clientHeight: 720 * clientScale
        });
        sentence.style.fontSize = font + 'px';
        bridge.textPlace({
          engine: 'gpu', text, client: [1280, 720],
          rects: [...text].map((_, i) => [330 + i * 28, top, 32, 32])
        });
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const boxes = [...sentence.children].map(token => token.getBoundingClientRect());
        return {
          left: boxes[0].left, right: boxes.at(-1).right, top: boxes[0].top,
          rows: new Set(boxes.map(box => box.top)).size,
          font: parseFloat(getComputedStyle(sentence).fontSize),
          lineHeight: parseFloat(getComputedStyle(sentence).lineHeight)
        };
      };
      bridge.textPlaceMode({ on: true });
      bridge.textPlaceAnchor(true);
      const result = {
        bottom: await sample(34, 656),
        fits: await sample(28, 656),
        offset: await sample(34, 656, 4, -2),
        narration: await sample(34, 334),
        windowed: await sample(34, 656, 0, 0, 2 / 3)
      };
      text = 'ふ' + text.slice(1);
      sentence.firstElementChild.textContent = 'ふ';
      sentence.dataset.sequence = '1';
      await sample(34, 605);
      text = 'も' + text.slice(1);
      sentence.firstElementChild.textContent = 'も';
      sentence.dataset.sequence = '2';
      result.retained = await sample(34, 656);
      return result;
    });

    const { bottom, fits, offset, narration, windowed, retained } = results;
    near(bottom.left, 330, 'first glyph in the bottom box');
    near(bottom.right, 922, 'last glyph in the bottom box');
    near(bottom.top, 656, 'native row height');
    assert.equal(bottom.rows, 1);
    assert.equal(bottom.font, 34);
    near(bottom.lineHeight, 34 * 1.6, 'configured line height');

    near(fits.left, 332, 'a row that fits stays centered');
    near(fits.right, 920, 'a row that fits keeps its full width');
    near(offset.left, 330 + 1280 * 0.04, 'horizontal calibration');
    near(offset.top, 656 - 720 * 0.02, 'vertical calibration');
    near(narration.right - narration.left, 714, 'upper narration keeps its width');
    near((narration.left + narration.right) / 2, 626, 'upper narration stays centered');
    near(windowed.left, 330 * 2 / 3, 'first glyph in a scaled client');
    near(windowed.right, 922 * 2 / 3, 'last glyph in a scaled client');
    near(retained.right - retained.left, 714, 'a continued page retains the reader width');
  } finally {
    await browser.close();
  }
});
