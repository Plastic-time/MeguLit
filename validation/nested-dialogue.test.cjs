// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { SentencePieces } = require('../core/sentence-pieces.cjs');
const { PageText } = require('../core/page-text.cjs');

const first = '「この本を『春』と呼んで、';
const rest = '次に進みます」';

test('a closed inner quotation leaves the speaker’s sentence open', () => {
  const pieces = new SentencePieces();
  pieces.take('dialogue', first, 'A');
  assert.equal(pieces.take('dialogue', rest, 'A'), first + rest);
  assert.deepEqual(pieces.piecesOf(first + rest), [first, rest]);

  pieces.reset();
  const inner = '「題名は『春』';
  const page = new PageText();
  page.shown(inner, pieces.take('dialogue', inner), 1000);
  const grown = pieces.take('dialogue', 'です」');
  assert.deepEqual(page.take(grown, 2000), { text: inner + 'です」' });
  assert.equal(page.pages, false);
  assert.equal(pieces.take('dialogue', 'おしまい。'), 'おしまい。');
});

test('page narration leaves an open outer quotation to its own speaker', () => {
  const page = new PageText();
  page.shown(first, first, 1000);
  assert.equal(page.continuation('別の人の台詞。', 2000), null);

  const narration = '本に「春」と書いて、';
  page.shown(narration, narration, 3000);
  assert.equal(page.continuation('棚に戻す。', 4000).text, narration + '棚に戻す。');
});

test('replaying older lines still extracts only the new part of the page', () => {
  const older = '朝になりました。';
  const page = new PageText();
  page.shown(older, older, 1000);
  page.shown(first, first, 2000);
  assert.deepEqual(page.take(older + first + rest, 3000), { text: rest, page: 2 });

  page.reset();
  page.shown(first, first, 4000);
  page.shown(older, older, 5000);
  assert.deepEqual(page.take(first + rest, 6000), { text: rest, page: 1 });
});
