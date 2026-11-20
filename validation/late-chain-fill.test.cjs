'use strict';
/* 2026-11-21 (owner, 千恋＊万花 r34: 8 lookups missed the patch, e.g. 「？？？　例のイベントって？」 22:16:15.343 miss; the fallback translation was
   stored at 22:16:22.273, 7 s later, after the next lines had come, and never shown). A late fallback answer is offered to the reader as a fill
   (deliverBackfill), which puts it on the line wherever it is still shown; an answer in time goes the usual way. */
const test = require('node:test'), assert = require('node:assert/strict');
const { Reader } = require('../services/reader.cjs');
const make = delay => { const r = Object.create(Reader.prototype), emitted = [];
  Object.assign(r, { displayLanguage: () => 'zh', gal: { hooks: { trace() {}, scriptTranslation: () => '' } }, prefs: () => ({ provider: 'google' }), langOptions: o => o, loadKeys() {},
    chainTranslate: async t => { await new Promise(res => setTimeout(res, delay)); return { text: '机翻:' + t }; }, translationRetries: () => ({ add() {} }), stats: { translation() {} }, gameId: '', runtime: { emit: (n, e) => emitted.push(e) } });
  return { r, emitted }; };
test('an answer after the reader moved on is offered as a fill', async () => {
  const { r, emitted } = make(300); const p = r.translate({ id: 37, text: '「？？？　例のイベントって？」' });
  r.latest = 38; /* the next line was asked meanwhile */
  await p; assert.ok(emitted.some(e => e.method === 'deliverBackfill' && e.args[0] === '「？？？　例のイベントって？」' && e.args[1] === '机翻:「？？？　例のイベントって？」'), JSON.stringify(emitted));
});
test('an answer in time is not doubled as a fill', async () => {
  const { r, emitted } = make(10); assert.equal(await r.translate({ id: 40, text: '「じゃあ、行ってみるか」' }), '机翻:「じゃあ、行ってみるか」'); assert.deepEqual(emitted, []);
});
