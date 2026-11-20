'use strict';
/* 2026-11-21 (千恋＊万花 中文版 r34: 「？？？　例のイベントって？」 missed the patch while the lines around it paired, and got a fallback translation
   7 s later). A hook line carrying the speaker the script keeps apart is looked up again without it; a line without a speaker is never cut. */
const test = require('node:test'), assert = require('node:assert/strict');
const { HookNative } = require('../core/hook-native.cjs');
const table = new Map([['「例のイベントって？」', '“你说的活动是？”'], ['「で？　１人？」', '“所以呢？一个人？”'], ['「１人？」', '“一个人？”']]);
const h = () => ({ originalText: { kind: 'patch', resolve: t => table.has(t) ? { status: 'exact', translation: table.get(t), indices: [1] } : { status: 'none' } }, trace() {}, resolveSource: HookNative.prototype.resolveSource });
test('the r34 line and other speaker forms pair', () => {
  for (const t of ['「？？？　例のイベントって？」', '【？？？】「例のイベントって？」', '？？？　「例のイベントって？」']) assert.equal(h().resolveSource(t)?.translation, '“你说的活动是？”', t);
});
test('a line without a speaker is never cut into another line', () => {
  assert.equal(h().resolveSource('「で？　１人？」').translation, '“所以呢？一个人？”');
  assert.deepEqual(HookNative.speakerless('「で？　１人？」'), []);
});
