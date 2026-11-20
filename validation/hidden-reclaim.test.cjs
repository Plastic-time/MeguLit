'use strict';
/* 2026-11-21 (owner: 「原地补画不就能二次认领了吗」): a line the game drew hidden (engine path or glyph layer) that no source line carried is
   claimed again: one alone becomes a source line (furigana, translation, lookups), several at once become the options of a choice (drawn as
   choices on their boxes and given to the choice overlay). The placement side offers every placed hidden line with its boxes. */
const test = require('node:test'), assert = require('node:assert/strict');
const { HookNative } = require('../core/hook-native.cjs'), { OverlayPlacement } = require('../core/overlay-placement.cjs');
const fake = () => { const o = { serial: 1, traced: [], delivered: [], choices: [] }; o.trace = t => o.traced.push(t); o.deliverSource = (t, origin) => o.delivered.push([t, origin]); o.onHiddenChoices = items => o.choices.push(items.map(i => i.text)); o.placedHidden = HookNative.prototype.placedHidden; return o; };
const box = (t, y) => [...t].map((c, i) => [300 + i * 22, y, 20, 22]);
test('one hidden line alone becomes a source line', async () => {
  const h = fake(); h.placedHidden('まだ頭がはっきりされてないのかしら。', { rects: box('まだ頭がはっきりされてないのかしら。', 488) });
  await new Promise(r => setTimeout(r, 750)); assert.deepEqual(h.delivered, [['まだ頭がはっきりされてないのかしら。', 'placement']]); assert.deepEqual(h.choices, []);
});
test('options drawn hidden together become a choice, not source lines', async () => {
  const h = fake(); for (const [t, y] of [['扉を開ける', 250], ['引き返す', 300], ['声をかける', 350]]) h.placedHidden(t, { rects: box(t, y) });
  await new Promise(r => setTimeout(r, 750)); assert.deepEqual(h.choices, [['扉を開ける', '引き返す', '声をかける']]); assert.deepEqual(h.delivered, []);
});
test('placement offers every placed hidden line (glyph path included) and draws a hidden choice on its boxes', () => {
  const sent = [], offered = [], p = new OverlayPlacement({ send: m => sent.push(m), hidden: l => offered.push(l.text) });
  p.configure({ textRenderer: 'compositor', hookProfile: 'embed' }, { bound: true, gameProcessId: 1, layout: { clientWidth: 804, clientHeight: 604 } });
  p.emitLine({ id: 'glyph:19', engine: 'glyph', text: '扉を開ける', rects: box('扉を開ける', 250), client: [804, 604] });
  assert.deepEqual(offered, ['扉を開ける']);
  p.hiddenChoices([{ text: '扉を開ける', rects: box('扉を開ける', 250) }, { text: '引き返す', rects: box('引き返す', 300) }]);
  const ex = sent.find(m => m.type === 'textPlaceExtra'), pc = sent.find(m => m.type === 'placeChoiceBoxes');
  assert.deepEqual(ex.items.map(i => [i.kind, i.text]), [['o', '扉を開ける'], ['o', '引き返す']]); assert.equal(pc.items.length, 2);
});
