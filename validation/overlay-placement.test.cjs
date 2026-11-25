// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const assert = require('node:assert');
const { OverlayPlacement } = require('../core/overlay-placement.cjs');
const sent = [], p = new OverlayPlacement({ send: m => sent.push(m) });
p.wanted = () => true;
p.configure({}, { bound: true, clientWidth: 1280, clientHeight: 720 });
assert.deepStrictEqual(sent.shift(), { type: 'textPlaceMode', on: true });
const rec = { type: 'hookCharRects', engine: 'krkr', line: 3, hidden: true, sw: 1280, sh: 720, viewport: [0, 0, 1280, 720], rects: [[10, 20, 30, 40], [40, 20, 30, 40], [10, 60, 30, 40]], text: 'あい\u001fう' };
p.hook(rec);
const m = sent.shift();
assert.strictEqual(m.type, 'textPlace'); assert.strictEqual(m.text, 'あいう'); assert.deepStrictEqual(m.rects[2], [10, 60, 30, 40]);
p.hook(rec); assert.strictEqual(sent.length, 0, 'same line twice is sent once');
p.hook({ ...rec, rects: rec.rects.slice(0, 2) }); assert.strictEqual(sent.length, 0, 'rect count mismatch is not placeable');
p.hook({ ...rec, hidden: false }); assert.strictEqual(sent.length, 0, '2026-11-16: a repaint of the placed line (focus change) keeps it placed');
p.hook({ ...rec, line: 4, hidden: false, text: 'かき' , rects: rec.rects.slice(0, 2) }); assert.deepStrictEqual(sent.shift(), { type: 'textPlace', visible: true, text: 'かき' }, 'a new line the game draws itself');
p.configure({}, { bound: false }); assert.deepStrictEqual(sent.pop(), { type: 'textPlaceMode', on: false });
/* glyph records (spec 3): client space, memory surface scaled to the client, cache gap filled, g / - not placeable */
p.configure({}, { bound: true, layout: { clientWidth: 1280, clientHeight: 720 } }); sent.length = 0;
p.glyph({ seq: 7, text: 'かきく', dots: [{ i: 0, ch: 'か', h: 30, a: 28, k: 'd', at: { x: 100, y: 500, space: 'c' } }, { i: 2, ch: 'く', h: 30, a: 28, k: 'd', at: { x: 112, y: 300, space: 'm640x360' } }] });
let gm = sent.shift();
assert.deepStrictEqual(gm.rects, [[100, 500, 28, 30], [128, 500, 28, 30], [224, 600, 56, 60]]);
assert.strictEqual(gm.text, 'かきく');
p.glyph({ seq: 8, text: 'さ', dots: [{ i: 0, ch: 'さ', h: 30, a: 28, k: 'd', at: { x: 1, y: 1, space: 'g' } }] });
gm = sent.shift(); assert.strictEqual(gm.approx, true, 'no device position: laid out from the learned anchor');
assert.deepStrictEqual(gm.rects, [[100, 500, 28, 30]], 'anchor = left/top of the last exact line');
{ /* no anchor yet: fallback (reader keeps its own place, no plate); an outside locator gives one */
  const out = [], q = new OverlayPlacement({ send: m => out.push(m) }); q.wanted = () => true;
  q.configure({}, { bound: true, layout: { clientWidth: 1280, clientHeight: 720 } }); out.length = 0;
  const t = { seq: 1, text: 'なにぬねの', dots: [0, 1, 2].map(i => ({ i, ch: 'なにぬねの'[i], h: 24, a: 24, k: 'd' })) };
  q.glyph(t); let o = out.shift(); assert.strictEqual(o.fallback, true); assert.strictEqual(o.rects, undefined);
  q.anchor({ x: 200, y: 560, size: 24, width: 50, pitch: 36 });
  q.glyph({ ...t, seq: 2 }); o = out.shift(); assert.strictEqual(o.approx, true);
  assert.deepStrictEqual(o.rects, [[200, 560, 24, 24], [224, 560, 24, 24], [200, 596, 24, 24], null, null], 'wraps at the anchor width; undrawn characters wait');
}
p.glyph({ seq: 9, text: 'たち', dots: [{ i: 0, ch: 'た', h: 30, a: 28, k: 'd', at: { x: 10, y: 10, space: 'c' } }] });
gm = sent.shift(); assert.deepStrictEqual(gm.rects, [[10, 10, 28, 30], null], 'not yet drawn = not placed (typing)');
/* extra lines: name (n) and choices (o) placed only when complete */
p.extras({ 3: { id: 3, kind: 'n', text: '朋也', dots: [{ i: 0, ch: '朋', h: 30, a: 28, k: 'n', at: { x: 80, y: 450, space: 'c' } }, { i: 1, ch: '也', h: 30, a: 28, k: 'n', at: { x: 108, y: 450, space: 'c' } }] },
  4: { id: 4, kind: 'o', text: 'いいえ', dots: [{ i: 0, ch: 'い', h: 30, a: 28, k: 'o', at: { x: 1, y: 1, space: 'c' } }] } });
let ex = sent.shift(); assert.strictEqual(ex.type, 'textPlaceExtra'); assert.deepStrictEqual(ex.items.map(i => i.text), ['朋也'], 'incomplete option not placed');
assert.deepStrictEqual(ex.items[0].rects[1], [108, 450, 28, 30]);
p.extras({ 5: { id: 5, kind: 'o', text: 'はい', dots: [{ i: 0, ch: 'は', h: 30, a: 28, k: 'o', at: { x: 600, y: 200, space: 'c' } }, { i: 1, ch: 'い', h: 30, a: 28, k: 'o', at: { x: 628, y: 200, space: 'c' } }] } });
sent.shift(); let cb = sent.shift();
assert.deepStrictEqual(cb, { type: 'placeChoiceBoxes', sw: 1280, sh: 720, items: [{ text: 'はい', x0: 600, y0: 200, x1: 656, y1: 230 }] }, 'option boxes for the choice overlay');
assert.strictEqual(p.choicesPlaced, true);
p.extras({}); sent.shift(); cb = sent.shift(); assert.deepStrictEqual(cb.items, [], 'options gone: choice overlay cleared'); assert.strictEqual(p.choicesPlaced, false);
const { HookNative } = require('../core/hook-native.cjs'), hn = Object.create(HookNative.prototype);
hn.state = {}; hn.emit = () => {}; hn.notify = v => { hn.state = { ...hn.state, ...v }; };
hn.glyphDots({ state: 'line', seq: 1, text: 'あ' });
hn.glyphDots({ state: 'dots', seq: 1, path: 'text', dots: [{ i: 0, ch: 'あ', h: 20, b: 16, a: 20, x: 0, y: 0, s: 0, k: 'd', at: { x: 5, y: 6, space: 'c' } }] });
assert.deepStrictEqual(hn.state.hookGlyphDots.dots[0].at, { x: 5, y: 6, space: 'c' }, 'cell origin kept in the line table');
process.env.MEGULIT_CAPTURE_COMPOSITOR = '1';
assert.strictEqual(new OverlayPlacement({}).wanted({ textRenderer: 'compositor' }), false);
delete process.env.MEGULIT_CAPTURE_COMPOSITOR;
assert.strictEqual(new OverlayPlacement({}).wanted({ textRenderer: 'compositor' }), true);
const gd = require('../core/glyph-dots.cjs');
assert.strictEqual(gd.mode(require('node:os').tmpdir()), '', 'no glyph mode without the setting');
/* positions that are not real never reach the reader as boxes (みにくいモジカの子: a centred line without a text box came
   with every rect 0 → the translation was drawn at the monitor's top-left) */
{
  const out = [], q = new OverlayPlacement({ send: m => out.push(m) });
  q.wanted = () => true; q.configure({}, { bound: true, clientWidth: 1280, clientHeight: 720 }); out.length = 0;
  const z = { type: 'hookCharRects', engine: 'unity', line: 9, hidden: true, sw: 1280, sh: 720, viewport: [0, 0, 1280, 720], text: 'あのこが', rects: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]] };
  q.hook(z); let r = out.shift();
  assert.strictEqual(r.fallback, true, 'all-zero rects: fallback, no boxes'); assert.strictEqual(r.rects, undefined);
  q.hook({ ...z, line: 10, rects: [[0, 0, 30, 30], [0, 0, 30, 30], [0, 0, 30, 30], [0, 0, 30, 30]] }); r = out.shift();
  assert.strictEqual(r.fallback, true, 'every character at one origin: fallback');
  q.hook({ ...z, line: 11, rects: [[-50, 300, 30, 30], [1270, 300, 30, 30], [2000, 300, 30, 30], [600, 900, 30, 30]] }); r = out.shift();
  assert.deepStrictEqual(r.rects, [null, [1250, 300, 30, 30], null, null], 'boxes clamped into the client, boxes outside it dropped');
  for (const b of r.rects.filter(Boolean)) assert.ok(b[0] >= 0 && b[1] >= 0 && b[0] + b[2] <= 1280 && b[1] + b[3] <= 720);
  const u = [], w = new OverlayPlacement({ send: m => u.push(m) }); w.wanted = () => true; w.configure({}, { bound: true }); u.length = 0;
  w.hook({ ...z, rects: [[100, 500, 30, 30], [130, 500, 30, 30], [160, 500, 30, 30], [190, 500, 30, 30]] });
  assert.strictEqual(u.shift().fallback, true, 'client size unknown: not placeable');
  assert.ok(!q.anchorBox, 'zero / stacked / lone boxes teach no anchor');
}
{ /* 2026-11-16 glyph cache (死に逝く君: 「間　側　法律　当　　ば…」): characters an earlier line drew have no record */
  const out = [], q = new OverlayPlacement({ send: m => out.push(m) }); q.wanted = () => true;
  q.configure({}, { bound: true, layout: { clientWidth: 1280, clientHeight: 720 } }); out.length = 0;
  const text = 'の人間の側です。', rec = (i, x) => ({ i, ch: [...text][i], h: 26, a: 26, k: 'd', at: { x, y: 600, space: 'c' } });
  /* の人 reused (no record), 間 drawn, の reused, 側 drawn; です。 not typed yet */
  q.glyph({ seq: 40, text, dots: [rec(2, 152), rec(4, 204)] }); let o = out.shift();
  assert.deepStrictEqual(o.rects.slice(0, 5), [[100, 600, 26, 26], [126, 600, 26, 26], [152, 600, 26, 26], [178, 600, 26, 26], [204, 600, 26, 26]], 'reused characters before a drawn one are placed');
  assert.deepStrictEqual(o.rects.slice(5), [null, null, null], 'characters after the last record wait (typing)');
  q.typing.done = true; q.glyph({ seq: 40, text, dots: [rec(2, 152), rec(4, 204)] }); o = out.shift();
  assert.ok(o.rects.every(Boolean), 'complete line: every character placed, none left out');
  assert.deepStrictEqual(o.rects[7], [282, 600, 26, 26]);
  /* the same on an estimated line (no device position): reused characters are not holes */
  const p2 = new OverlayPlacement({ send: m => out.push(m) }); p2.wanted = () => true; p2.configure({}, { bound: true, layout: { clientWidth: 1280, clientHeight: 720 } }); out.length = 0;
  p2.anchor({ x: 100, y: 600, size: 26, width: 900, pitch: 40 });
  p2.glyph({ seq: 41, text, dots: [2, 4].map(i => ({ i, ch: [...text][i], h: 26, a: 26, k: 'd' })) }); o = out.shift();
  assert.deepStrictEqual(o.rects.map(Boolean), [true, true, true, true, true, false, false, false], 'estimate: typed up to the last record');
  p2.stop(); q.stop();
}
{
  // The littlecheese renderer reports the canvas in logical pixels, even in a DPI-scaled client.
  const { formatChars, parseChars } = require('../core/text-paths.cjs');
  const out = [], placed = new OverlayPlacement({ send: m => out.push(m) });
  placed.wanted = () => true;
  placed.configure({}, { bound: true, clientWidth: 1200, clientHeight: 900 });
  const row = (line, text, y, hidden = true) => parseChars(formatChars({ engine: 'littlecheese', line, hidden, sw: 800, sh: 600,
    rects: [...text].map((_, i) => [266 + i * 20, y, 20, 20]), text }));
  const upper = '社会からの脱落。', lower = 'それを皮肉っぽく嘲笑うみたいな言葉。';
  placed.hook(row(1, upper, 468));
  placed.hook(row(2, lower, 494));
  const page = out.filter(m => m.type === 'textPlacePage').pop();
  assert.strictEqual(page.retainedBitmap, true);
  assert.deepStrictEqual(page.lines.map(l => [l.text, l.rects.length, l.rects[0]]),
    [[upper, 8, [399, 702, 30, 30]], [lower, 18, [399, 741, 30, 30]]]);
  placed.hook(row(3, '次のページ。', 468));
  assert.deepStrictEqual(out.at(-1).lines.map(l => l.text), ['次のページ。']);
  placed.hook(row(4, '原文のまま。', 468, false));
  assert.ok(out.some(m => m.type === 'textPlacePage' && m.lines === null), 'read-only draw clears the retained overlay page');
  assert.strictEqual(out.at(-1).visible, true);
  placed.stop();
}
console.log('PASS overlay placement');
