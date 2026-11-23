// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const rows = require('./fixtures/games/fata-morgana/ruby-native-rows.json');
let chromium;
try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch {}

const readings = [
  { 大変: 'たいへん', 困: 'こま' },
  { 様: 'さま', 自分: 'じぶん', 思: 'おも', 出: 'だ', 一体: 'いったい', 全体: 'ぜんたい', 誰: 'だれ', 仕: 'つか' },
  { 女: 'おんな', 青白: 'あおじろ', 顔: 'かお' }
];

test('native rows keep each reading over its word and each clickable glyph inside its advance', { skip: !chromium }, async () => {
  const browser = await chromium.launch({ channel: 'msedge', args: ['--mute-audio'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.route('http://reader.test/', route => route.fulfill({ contentType: 'text/html',
      body: `<!doctype html><meta charset="utf-8"><style>.sentence-window{position:fixed}.char-token{display:inline-block}</style>
        <main><div class="sentence-window tomoyo-hook-reader"><div class="sentence-text"></div><div class="tomoyo-cn-row"></div></div></main>` }));
    await page.goto('http://reader.test/');
    await page.evaluate(rows => {
      localStorage.setItem('tomoyo-gal-settings', JSON.stringify({
        furigana: true, rubyScale: .55, rubyOffsetY: 3, rubyFont: 'notoSansJP',
        japaneseFont: 'originalGothic', japaneseSize: 24, japaneseSpacingPx: 0
      }));
      window.__tomoyoChinese = {
        setTranslationVisible() {},
        localLookup: (method, args) => { window.lastLookup = { method, ...args }; },
        localTokenize: async text => rows.find(r => r.text === text).tokens.map(([surface, reading, pos]) =>
          ({ surface, reading, pos, source: 'SudachiDict Full' }))
      };
    }, rows);
    for (const mod of ['furigana', 'ruby-layout', 'game-style', 'gal', 'text-place', 'selection']) {
      await page.addScriptTag({ path: path.join(__dirname, '../web/reader/modules', mod + '.js') });
    }
    await page.evaluate(() => {
      const b = window.__tomoyoChinese;
      b.galStatus({ layout: { clientX: 240, clientY: 0, clientWidth: 1440, clientHeight: 1080,
        readerX: 300, readerY: 820, readerWidth: 1300, readerHeight: 230, surfaceWidth: 1920, surfaceHeight: 1080 } });
      b.textPlaceMode({ on: true });
    });
    for (const [index, row] of rows.entries()) {
      const frames = await page.evaluate(async row => {
        const b = window.__tomoyoChinese, sentence = document.querySelector('.sentence-text');
        const report = lines => b.textPlacePage({ awake: true, armed: true, engineRows: true, client: [800, 600], lines });
        report([]);
        const tokens = [...row.text].map((c, i) => {
          const token = document.createElement('span');
          token.className = 'char-token'; token.dataset.index = i; token.textContent = c;
          return token;
        });
        sentence.replaceChildren(...tokens);
        const line = { id: row.id, text: row.engineText.replace(/\s/g, ''), rects: row.rects };
        report([line]);
        await b.prepareRuby(sentence);
        const glyphs = tokens.filter(t => t.textContent.trim());
        const frames = [];
        const start = performance.now();
        for (let frame = 0; performance.now() - start < 5000; frame++) {
          // A repeated native draw can arrive after the words were wrapped in ruby spans.
          if (frame === 26) report([line]);
          await new Promise(resolve => requestAnimationFrame(resolve));
          const labels = [...sentence.querySelectorAll('.megulit-ruby-base')].flatMap(base => {
            if (!base.firstElementChild.getBoundingClientRect().width) return [];
            const css = getComputedStyle(base, '::before'), r = base.getBoundingClientRect();
            const matrix = new DOMMatrix(css.transform), width = parseFloat(css.width) * matrix.a;
            const center = r.x + parseFloat(css.left) + parseFloat(css.width) / 2 + matrix.e;
            const cells = [...base.querySelectorAll('.char-token')].map(t => row.rects[glyphs.indexOf(t)]);
            const first = cells[0], last = cells.filter(c => c[1] === first[1]).at(-1);
            return [{ word: base.textContent, reading: base.dataset.tomoyoReading,
              left: center - width / 2, right: center + width / 2, center, row: r.y,
              expectedCenter: 240 + (first[0] + last[0] + last[2]) * .9,
              visible: width > 1 && css.visibility === 'visible' && css.content !== 'none' }];
          });
          let count = 0, anchorError = 0, overflow = 0, missedHits = 0;
          for (const [i, token] of glyphs.entries()) {
            const rect = token.getBoundingClientRect();
            if (!rect.width) continue;
            count++;
            const [x, y, w, h] = row.rects[i];
            anchorError = Math.max(anchorError, Math.abs(rect.x - (240 + x * 1.8)), Math.abs(rect.y - y * 1.8),
              Math.abs(rect.width - w * 1.8), Math.abs(rect.height - h * 1.8));
            const range = document.createRange(); range.selectNodeContents(token);
            const ink = range.getBoundingClientRect();
            overflow = Math.max(overflow, ink.right - rect.right, rect.left - ink.left);
            if (document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.closest('.char-token') !== token) missedHits++;
          }
          frames.push({ labels, count, anchorError, overflow, missedHits });
          if (frame >= 30 && count === row.rects.length && performance.now() - start >= 700) break;
        }
        return frames;
      }, row);
      assert.equal(frames.at(-1).count, row.rects.length);
      assert.deepEqual(Object.fromEntries(frames.at(-1).labels.map(l => [l.word, l.reading])), readings[index]);
      // Send the click through selection.js and check its request to the dictionary, including the
      // whitespace in the hook source before and between the two visible rows.
      const lookups = await page.evaluate(() => [...document.querySelectorAll('.megulit-ruby-base')].map(base => {
        const token = base.firstElementChild, r = token.getBoundingClientRect();
        const x = r.x + r.width / 2, y = r.y + r.height / 2;
        window.lastLookup = null;
        document.elementFromPoint(x, y).dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
        return { word: base.textContent, lookup: window.lastLookup };
      }));
      for (const { word, lookup } of lookups) {
        assert.deepEqual(lookup, { method: 'lookup_at_position', text: row.text, position: row.text.indexOf(word) });
      }
      for (const frame of frames) {
        assert.ok(frame.anchorError < 1 && frame.overflow < 1 && frame.missedHits === 0, 'native glyphs on line ' + row.id + ': ' + JSON.stringify(frame));
        for (const [i, label] of frame.labels.entries()) {
          assert.equal(label.reading, readings[index][label.word], 'every revealed word retains its reading');
          assert.ok(label.visible && Math.abs(label.center - label.expectedCenter) < 1, JSON.stringify(label));
          const previous = frame.labels[i - 1];
          if (previous && Math.abs(label.row - previous.row) < 2) assert.ok(label.left >= previous.right - 1, 'overlapping readings ' + JSON.stringify([previous, label]));
        }
      }
    }
  } finally { await browser.close(); }
});
