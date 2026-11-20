'use strict';
/* 2026-11-21 (pair-uncertain, owner: 汉化组译文必须 100% 配对): the pairing self-test read every script line in order and found
   - repeated lines with different translations left unpaired at the start (PureStation, みにくいモジカの子 「くらい。」「どこ？」),
   - a repeated line given the translation of an earlier place by the reader's line cache (「ああ――」 #487 got #131's),
   - a line handed over without its brackets paired with a bare line thousands of lines away (素晴らしき日々 「へ？」 → へ？ #4877),
   - a line the table leaves in Japanese paired with another line that has the same words bracketed or bare.
   Matcher (services/original-text.cjs) keeps every place a guess can be at and settles it with the next lines; resolveSource
   (core/hook-native.cjs) keeps a repeated line's answer only while the reading position is on it and prefers the form found nearest. */
const test = require('node:test'), assert = require('node:assert/strict');
const { Matcher } = require('../services/original-text.cjs'), { HookNative } = require('../core/hook-native.cjs');
const provider = (rt, og) => {
  const m = new Matcher(rt, og);
  return { m, kind: 'patch', position: () => m.last, save: () => m.save(), load: v => m.load(v), resolve: t => {
    const r = m.match(t); if (r.japanese === undefined) return r;
    if (r.indices.some(i => og[i] === rt[i] && /[぀-ヿ]/.test(rt[i]))) return { status: 'none', method: 'untranslated', indices: r.indices };
    return { ...r, translation: r.japanese };
  } };
};
const reader = p => ({ originalText: p, trace() {}, resolveSource: HookNative.prototype.resolveSource });
const filler = n => Array.from({ length: n }, (_, i) => 'f' + i);

test('the start: a repeated line is guessed by most places, the next line settles the place', () => {
  const rt = ['………', 'あ', 'b', '………', 'い', 'c', '………', 'う', 'd'], og = ['……', '啊', 'b', '……', '咦', 'c', '………', '呜', 'd'];
  const m = new Matcher(rt, og), r = m.match('………');
  assert.equal(r.status, 'high'); assert.equal(r.method, 'guess'); assert.equal(r.japanese, '……', 'the translation most places have');
  assert.deepEqual(m.maybe, [0, 3, 6]);
  assert.equal(m.match('う').indices[0], 7); assert.equal(m.maybe, null, 'a line found once fixes the place');
});

test('the start: a repeated block is followed from its open places and settled where it parts', () => {
  const rt = ['くらい。', 'どこ？', 'ここだ', 'x', 'くらい。', 'どこ？', 'そこだ'], og = ['好黑。', '在哪？', '在这', 'x', '真暗。', '哪里？', '在那'];
  const m = new Matcher(rt, og);
  assert.equal(m.match('くらい。').method, 'guess');
  assert.equal(m.match('どこ？').status, 'high'); assert.deepEqual(m.maybe, [1, 5], 'both places still open');
  assert.equal(m.match('そこだ').indices[0], 6);
  const rt2 = ['くらい。', 'あ', ...filler(20), 'あ', 'くらい。', 'い'], m2 = new Matcher(rt2, rt2.map((t, i) => t + i));
  m2.match('くらい。'); const a = m2.match('あ'); assert.equal(a.method, 'anchored', 'of the two あ only one goes on from a place くらい。 can be at'); assert.equal(a.indices[0], 1);
});

test('a repeated line read again later is looked up at the new reading position, not answered from the cache', () => {
  const rt = ['「ああ――」', 'a', 'b', 'c', '「ああ――」', 'd'], og = ['「知道了」', 'a', 'b', 'c', '「是啊——」', 'd'];
  const h = reader(provider(rt, og));
  assert.equal(h.resolveSource('「ああ――」').translation, '「知道了」');
  for (const t of ['a', 'b', 'c']) h.resolveSource(t);
  assert.equal(h.resolveSource('「ああ――」').translation, '「是啊——」');
  assert.equal(h.resolveSource('「ああ――」').translation, '「是啊——」', 'the same line drawn again keeps its answer');
  assert.equal(h.resolveSource('d').indices[0], 5);
});

test('a bare line pairs with the bracketed line at the reading position, not with a bare line far away', () => {
  const rt = ['a', '「へ？」', 'b', ...filler(500), 'へ？'], og = ['a', '「诶？」', 'b', ...filler(500), '嗯？'];
  const h = reader(provider(rt, og)); h.resolveSource('a');
  const r = h.resolveSource('へ？'); assert.equal(r.translation, '「诶？」'); assert.equal(r.indices[0], 1);
  assert.equal(h.resolveSource('b').indices[0], 2, 'the reading goes on from there');
});

test('a bare line pairs with the nearest form: the bracketed line next, not a bare line further on', () => {
  const rt = ['a', '「あれ？」', 'b', 'c', ...filler(50), 'あれ？'], og = ['a', '「咦？」', 'b', 'c', ...filler(50), '奇怪？'];
  const h = reader(provider(rt, og)); h.resolveSource('a');
  assert.equal(h.resolveSource('あれ？').indices[0], 1);
});

test('a line the table leaves in Japanese at the reading position stays that line', () => {
  const rt = ['a', '「何それ？」', 'b', ...filler(30), '何それ？'], og = ['a', '「何それ？」', 'b', ...filler(30), '这算啥？'];
  const h = reader(provider(rt, og)); h.resolveSource('a');
  const r = h.resolveSource('何それ？'); assert.equal(r.method, 'untranslated'); assert.equal(r.indices[0], 1);
  assert.equal(h.resolveSource('b').indices[0], 2);
});

test('a provider without a reading position (mocks, harvested scripts) is looked up as before', () => {
  const table = new Map([['「例のイベントって？」', '“你说的活动是？”']]);
  const h = reader({ kind: 'patch', resolve: t => table.has(t) ? { status: 'exact', translation: table.get(t), indices: [1] } : { status: 'none' } });
  assert.equal(h.resolveSource('例のイベントって？').translation, '“你说的活动是？”');
});
