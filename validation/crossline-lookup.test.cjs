// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (user group, screenshot: 「…じっとりと汗」 / 「ばんでいた。…」 wrapped by the game after 汗; clicking 汗 showed 汗 and ばんで
   apart, 汗ばむ never): core/learning-native.cjs request() with the real SudachiDict Full tokens of the whole sentences
   (validation/helpers/crossline-fixture.cjs, captured from the reading worker) and the real JMdict entries.
   - the tokenizer is only ever asked for the whole sentence (a line break inside it is the game's layout): the stub throws otherwise;
   - a click on either side of the break finds the whole word, its range runs over the break;
   - a word SudachiDict splits into a stem and a suffix (汗 + ばむ) is found by its dictionary form, broken or not;
   - a drag selection over the break finds the word too. */
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path');
const { LocalLearning } = require('../core/learning-native.cjs');
const fx = require('./helpers/crossline-fixture.cjs');
function learning() {
  const L = new LocalLearning(path.join(require('node:os').tmpdir(), 'megulit-crossline'));
  L.asked = [];
  L.tokenize = async text => { L.asked.push(text); const t = fx.tokens[text]; if (!t) throw Error('tokenizer asked for a broken sentence: ' + JSON.stringify(text)); return L.dictionaryWords(JSON.parse(JSON.stringify(t))); };
  L.load = function () { if (this.index) return; this.index = new Map(); this.byId = new Map(); this.english = new Map(); for (const e of fx.entries) { this.byId.set(e.id, e); for (const k of [...e.spellings, ...e.readings]) { const ids = this.index.get(k) || []; ids.push(e.id); this.index.set(k, ids); } } };
  return L;
}
const at = (text, ch, from = 0) => [...text].indexOf(ch, from);
const ids = r => (r?.entries || []).map(e => e.id);
const CASES = [
  /* the user's line, wrapped after 汗 */
  { text: '彼女の呼吸はひどく乱れ、全身はじっとりと汗\nばんでいた。悪夢を見たせいだろう。', word: '汗ばむ', id: 1213070, reading: 'あせばむ', clicks: ['汗', 'ば', 'ん'], first: '汗' },
  { text: '古い壁はすっかり黒\nずんでいた。', word: '黒ずむ', id: 1287450, reading: 'くろずむ', clicks: ['黒', 'ず'], first: '黒' },
  { text: '少女は頬を赤\nらめて俯いた。', word: '赤らめる', id: 1383290, reading: 'あからめる', clicks: ['赤', 'ら'], first: '赤' },
  { text: '彼はじっと彼女を見つ\nめていた。', word: '見つめる', id: 1604580, reading: 'みつめる', clicks: ['見', 'つ', 'め'], first: '見' }
];
for (const c of CASES) test('across the game\'s line break: ' + c.word, async () => {
  const L = learning(), chars = [...c.text], nl = chars.indexOf('\n');
  const toks = await L.request('tokenize_text', { text: c.text });
  assert.deepEqual(L.asked, [c.text.replace(/\n/g, '')], 'the tokenizer gets the whole sentence');
  assert.equal(toks.map(t => t.surface).join(''), c.text, 'tokens still spell the text as given (the break a blank token)');
  for (const t of toks) assert.equal(chars.slice(t.start, t.end).join(''), t.surface, 'indices on the text as given');
  for (const ch of c.clicks) {
    const pos = at(c.text, ch, at(c.text, c.first)), r = await L.request('lookup_at_position', { text: c.text, position: pos });
    assert.ok(ids(r).includes(c.id), c.word + ' from a click on 「' + ch + '」: ' + JSON.stringify({ surface: r?.surface, ids: ids(r) }));
    assert.ok(r.start <= at(c.text, c.first) && r.end > nl + 1, 'its range runs over the break: ' + r.start + '..' + r.end);
  }
  const sel = await L.request('lookup_exact', { text: c.text, start: at(c.text, c.first), end: nl + 3 });
  assert.ok(ids(sel).includes(c.id), 'a drag over the break: ' + JSON.stringify({ surface: sel?.surface, ids: ids(sel) }));
});
test('a stem + suffix word on one row is found by its dictionary form (汗 + ばむ)', async () => {
  const L = learning(), text = '彼女の呼吸はひどく乱れ、全身はじっとりと汗ばんでいた。悪夢を見たせいだろう。';
  for (const ch of ['汗', 'ば']) { const r = await L.request('lookup_at_position', { text, position: at(text, ch) }); assert.ok(ids(r).includes(1213070), '汗ばむ from 「' + ch + '」: ' + r?.surface); }
  const one = await L.request('lookup_at_position', { text, position: at(text, '悪') });
  assert.equal(one.surface, '悪夢', 'other words stay as they were');
});
