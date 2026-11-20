'use strict';
/* 2026-11-21 (owner, 千恋＊万花 r34: fallback answers 1 to 8 s late): each source is timed in the trace; once the 2.5 s budget is spent, machine
   translation runs alongside and its answer is shown first; the slower, better source replaces it when it comes. */
const test = require('node:test'), assert = require('node:assert/strict');
const chain = require('../services/translation-chain.cjs');
const list = [{ provider: 'sakura' }, { provider: 'microsoft' }];
const attempt = delays => async o => { await new Promise(r => setTimeout(r, delays[o.provider])); return o.provider + ':译文'; };
test('a slow local model: machine translation first, the local answer replaces it', async () => {
  const traced = [], late = []; const t0 = Date.now();
  const r = await chain.translate('「？？？　例のイベントって？」', list, attempt({ sakura: 800, microsoft: 30 }), { budgetMs: 200, trace: t => traced.push(t), onLate: x => late.push(x.text) });
  assert.equal(r.text, 'microsoft:译文'); assert.ok(r.early); assert.ok(Date.now() - t0 < 600, 'shown within the budget');
  await new Promise(res => setTimeout(res, 800)); assert.deepEqual(late, ['sakura:译文']);
  assert.ok(traced.some(t => /^chain sakura \d+ ms ok/.test(t)) && traced.some(t => /^chain microsoft \d+ ms ok/.test(t)) && traced.some(t => /budget 200 ms spent/.test(t)), traced.join(' | '));
});
test('a fast first source: no machine translation, no replacement', async () => {
  const late = []; const r = await chain.translate('x', list, attempt({ sakura: 20, microsoft: 20 }), { budgetMs: 200, onLate: x => late.push(x) });
  assert.equal(r.text, 'sakura:译文'); assert.ok(!r.early); await new Promise(res => setTimeout(res, 300)); assert.deepEqual(late, []);
});
test('without a budget the order is as before', async () => {
  const r = await chain.translate('x', list, attempt({ sakura: 50, microsoft: 1 })); assert.equal(r.text, 'sakura:译文');
});
