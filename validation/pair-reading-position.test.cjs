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
const filler = n => Array.from({ length: n }, (_, i) => '台詞その' + i + 'です。');
const [A, B, C, D] = ['朝が来た。', '昼になった。', '夜が更けた。', '夜中だった。'];

test('the start: a repeated line is guessed by most places, the next line settles the place', () => {
  const rt = ['………', 'あ', B, '………', 'い', C, '………', 'う', D], og = ['……', '啊', B, '……', '咦', C, '………', '呜', D];
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
  const rt = ['「ああ――」', A, B, C, '「ああ――」', D], og = ['「知道了」', A, B, C, '「是啊——」', D];
  const h = reader(provider(rt, og));
  assert.equal(h.resolveSource('「ああ――」').translation, '「知道了」');
  for (const t of [A, B, C]) h.resolveSource(t);
  assert.equal(h.resolveSource('「ああ――」').translation, '「是啊——」');
  assert.equal(h.resolveSource('「ああ――」').translation, '「是啊——」', 'the same line drawn again keeps its answer');
  assert.equal(h.resolveSource(D).indices[0], 5);
});

test('a bare line pairs with the bracketed line at the reading position, not with a bare line far away', () => {
  const rt = [A, '「へ？」', B, ...filler(500), 'へ？'], og = [A, '「诶？」', B, ...filler(500), '嗯？'];
  const h = reader(provider(rt, og)); h.resolveSource(A);
  const r = h.resolveSource('へ？'); assert.equal(r.translation, '「诶？」'); assert.equal(r.indices[0], 1);
  assert.equal(h.resolveSource(B).indices[0], 2, 'the reading goes on from there');
});

test('a bare line pairs with the nearest form: the bracketed line next, not a bare line further on', () => {
  const rt = [A, '「あれ？」', B, C, ...filler(50), 'あれ？'], og = [A, '「咦？」', B, C, ...filler(50), '奇怪？'];
  const h = reader(provider(rt, og)); h.resolveSource(A);
  assert.equal(h.resolveSource('あれ？').indices[0], 1);
});

test('a line the table leaves in Japanese at the reading position stays that line', () => {
  const rt = [A, '「何それ？」', B, ...filler(30), '何それ？'], og = [A, '「何それ？」', B, ...filler(30), '这算啥？'];
  const h = reader(provider(rt, og)); h.resolveSource(A);
  const r = h.resolveSource('何それ？'); assert.equal(r.method, 'untranslated'); assert.equal(r.indices[0], 1);
  assert.equal(h.resolveSource(B).indices[0], 2);
});

test('the next line word for word goes before the two lines just read joined (a grown line)', () => {
  const rt = ['よーし、取るぞ。', '狙って、', '狙って、狙って、', '狙って、狙って、狙って、', 'えいっ！'], og = ['好，要上了。', '瞄准目标，', '瞄准，瞄准，', '瞄准，瞄准，瞄准，', '嘿！'];
  const m = new Matcher(rt, og); for (const t of rt.slice(0, 3)) m.match(t);
  assert.deepEqual(m.match('狙って、狙って、狙って、').indices, [3]);
});

test('a provider without a reading position (mocks, harvested scripts) is looked up as before', () => {
  const table = new Map([['「例のイベントって？」', '“你说的活动是？”']]);
  const h = reader({ kind: 'patch', resolve: t => table.has(t) ? { status: 'exact', translation: table.get(t), indices: [1] } : { status: 'none' } });
  assert.equal(h.resolveSource('例のイベントって？').translation, '“你说的活动是？”');
});
