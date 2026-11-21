'use strict';
/* 2026-11-21 (owner, 千恋＊万花 中文版: 「電車を降りて、駅前でタクシーを捕まえたものの、いつの間にかうたたねしていたらしい。」 paired with the patch
   (patch-text exact #9) and shown without Chinese). The patch translation is stored under one normal key and found again however the line
   comes back: with ruby/effect markup, with its brackets or blanks, or cut from the 275-character page it was paired on. A line the patch does
   not have goes down the fallback chain (local model, bound API, machine translation). Every lookup is noted. */
const test = require('node:test'), assert = require('node:assert/strict');
const { Reader } = require('../services/reader.cjs');
const JP = '電車を降りて、駅前でタクシーを捕まえたものの、いつの間にかうたたねしていたらしい。';
const ZH = '下了电车，在站前拦了辆出租车，结果不知什么时候打起了瞌睡。';
const make = () => { const r = Object.create(Reader.prototype), traced = [], chained = [];
  Object.assign(r, { displayLanguage: () => 'zh', gal: { hooks: { trace: t => traced.push(t), scriptTranslation: () => '' } }, prefs: () => ({ provider: 'google' }), langOptions: o => o, loadKeys() {},
    chainTranslate: async t => { chained.push(t); return { text: '机翻:' + t.slice(0, 4) }; }, translationRetries: () => ({ add() {} }), stats: { translation() {} }, gameId: '' });
  return { r, traced, chained }; };
test('stored from the patch, found with ruby markup, brackets and blanks', async () => {
  const { r, chained } = make(); r.embedCached(JP, ZH);
  assert.equal(await r.translate({ id: 1, text: '電車を降りて、駅前でタクシーを｜捕《つか》まえたものの、\nいつの間にかうたたねしていたらしい。' }), ZH);
  assert.equal(await r.translate({ id: 2, text: '「' + JP + '」' }), ZH);
  assert.equal(await r.translate({ id: 3, text: JP.replace('、', '、　') }), ZH);
  assert.deepEqual(chained, [], 'no fallback for a paired line');
});
test('paired on the whole page (275 characters), asked as the sentence cut from it', async () => {
  const { r, chained, traced } = make(); const page = 'あ'.repeat(234) + JP; r.embedCached(page, ZH);
  assert.equal([...page].length, 275);
  assert.equal(await r.translate({ id: 4, text: JP }), ZH);
  assert.deepEqual(chained, []); assert.ok(traced.some(t => /^translation near key=/.test(t)), 'the near match is noted');
});
test('a line the patch does not have goes down the fallback chain; the miss is noted with its reason', async () => {
  const { r, chained, traced } = make(); r.embedCached(JP, ZH);
  const other = '「そろそろ着きますけど、どこで止めますか？」';
  assert.equal(await r.translate({ id: 5, text: other }), '机翻:「そろそ');
  assert.deepEqual(chained, [other]); assert.ok(traced.some(t => /^translation miss key=[0-9a-f]+\/\d+ no cached line/.test(t)));
  assert.ok(traced.some(t => /^translation store key=/.test(t)));
});
test('a short unrelated line never borrows a longer one', () => {
  const { r } = make(); r.embedCached(JP, ZH); assert.equal(r.embedCached('いつの間にか'), undefined);
});
test('ファタモルガーナの館: paired on 「あなた死者」 (ruby base and reading together), asked as the hook line 「あなた」に…', async () => {
  const { r, chained, traced } = make(); r.embedCached('「あなた死者」に声をかける人物がいる。', '有人在向「你死者」搭话。');
  assert.equal(await r.translate({ id: 6, text: '「あなた」に声をかける人物がいる。' }), '有人在向「你死者」搭话。');
  assert.deepEqual(chained, []); assert.ok(traced.some(t => /^translation near key=.* similar 0\.\d\d/.test(t)));
});
test('a different line of the same length never borrows by similarity', () => {
  const { r } = make(); r.embedCached('私のすべては、消滅した。', '我的一切都消失了。'); assert.equal(r.embedCached('そう、一度はすべてを失った。'), undefined);
});
