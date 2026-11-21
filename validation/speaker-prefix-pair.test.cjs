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
  assert.ok(HookNative.speakerless('「で？　１人？」').every(v => v.includes('で？　１人？')), 'never cut');
});
test('r34 the other way round: the script keeps 「？？？　…」, the hook gives the line without the speaker', () => {
  const t2 = new Map([['「？？？　例のイベントって？」', '「？？？什么活动？」']]);
  const h2 = { originalText: { kind: 'patch', resolve: t => t2.has(t) ? { status: 'exact', translation: t2.get(t), indices: [337] } : { status: 'none' } }, trace() {}, resolveSource: HookNative.prototype.resolveSource };
  assert.equal(h2.resolveSource('「例のイベントって？」').translation, '「？？？什么活动？」');
});
test('a line handed over without its brackets pairs with the script\'s bracketed line', () => {
  const t3 = new Map([['「（サービスの悪い運転手だ……）」', '「（这什么服务态度啊……）」'], ['「『なんだ』とはどういう意味だ？」', '「“什么啊”是什么意思？」']]);
  const h3 = { originalText: { kind: 'patch', resolve: t => t3.has(t) ? { status: 'exact', translation: t3.get(t), indices: [14] } : { status: 'none' } }, trace() {}, resolveSource: HookNative.prototype.resolveSource };
  assert.equal(h3.resolveSource('（サービスの悪い運転手だ……）').translation, '「（这什么服务态度啊……）」');
  assert.equal(h3.resolveSource('『なんだ』とはどういう意味だ？').translation, '「“什么啊”是什么意思？」');
  assert.deepEqual(HookNative.speakerless('犯　罪　だ！').filter(v => !/^[「『]/.test(v)), [], 'a line is never cut at a space');
});
