// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { GalNative } = require('../core/gal-native.cjs');
const { HookNative } = require('../core/hook-native.cjs');
const { OverlayPlacement } = require('../core/overlay-placement.cjs');

function rig() {
  const output = [], noop = () => {};
  const gal = Object.assign(Object.create(GalNative.prototype), {
    state: {}, preferences: { textRenderer: 'compositor', hookProfile: 'embed', hookHide: true },
    hooks: { configure: noop, enabled: true, preferences: { hookHide: true },
      state: { replacementState: 'callback-acknowledged' }, originalReplaced: HookNative.prototype.originalReplaced },
    controller: { modeChanged: noop, apply: noop }, styleSync: { configure: noop },
    send: noop, rebindProcess: noop, onEvent: noop
  });
  gal.placement = new OverlayPlacement({ send: m => output.push(m), replaced: () => gal.hooks.originalReplaced() });
  const bind = (pid, birth) => gal.notify({ type: 'bound', gameProcessId: pid, gameStarted: birth, bound: true, clientWidth: 800, clientHeight: 600 });
  const close = () => gal.notify({ type: 'gameClosed', bound: false, gameProcessId: 0, gameStarted: '', gameHwnd: '' });
  const boxes = engine => gal.hookEvent({ type: 'hookCharRects', engine, hidden: true, line: 1, text: '空', sw: 800, sh: 600, rects: [[80, 420, 24, 24]] });
  const glyph = () => {
    gal.hooks.state.hookGlyphDots = { seq: 1, text: '空', dots: [] };
    gal.hookEvent({ type: 'hookGlyphDots' });
  };
  return { bind, close, boxes, glyph, output, gal };
}

for (const engine of ['renpy', 'krkr']) {
  test(engine + ' coordinates must not suppress Reader Japanese in the next write-back game', () => {
    const r = rig();
    r.bind(10, '100'); r.boxes(engine);
    assert.ok(r.output.some(e => e.type === 'textPlace' && e.rects?.length));
    r.close(); r.bind(20, '200'); r.output.length = 0; r.glyph();
    const fresh = rig();
    fresh.bind(20, '200'); fresh.output.length = 0; fresh.glyph();
    assert.deepEqual(fresh.output, []);
    assert.deepEqual(r.output, fresh.output);
    r.gal.hooks.state.replacementState = '';
    r.glyph();
    assert.equal(r.output.at(-1).visible, true);
  });
}

test('redraw deduplication belongs to one binding, including when the OS reuses the pid', () => {
  const r = rig();
  r.bind(10, '100'); r.boxes('renpy'); r.output.length = 0;
  r.bind(10, '100'); r.boxes('renpy');
  assert.deepEqual(r.output, []);
  r.bind(10, '200'); r.output.length = 0; r.boxes('renpy');
  assert.ok(r.output.some(e => e.type === 'textPlace' && e.rects?.length));
});

test('a pending glyph completion cannot publish the previous line after rebinding', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const r = rig();
  r.bind(10, '100');
  r.gal.hooks.state.hookGlyphDots = { seq: 9, text: '青空', dots: [
    { i: 0, ch: '青', k: 'd', h: 24, a: 24, at: { x: 80, y: 420, space: 'c' } }
  ] };
  r.gal.hookEvent({ type: 'hookGlyphDots' });
  assert.ok(r.output.some(e => e.text === '青空' && e.rects[1] === null));
  r.close(); r.bind(20, '200'); r.output.length = 0;
  t.mock.timers.tick(OverlayPlacement.DoneAfter);
  assert.deepEqual(r.output, []);
});

test('a new binding releases page ownership and its previous line coordinates', () => {
  const r = rig();
  r.bind(10, '100');
  r.gal.hookEvent({ type: 'hookGpuPage', awake: true, armed: true, sw: 800, sh: 600,
    lines: [{ id: 1, text: '空', rects: [[80, 420, 24, 24]] }] });
  assert.ok(r.gal.placement.paged);
  r.close(); r.bind(20, '200');
  assert.equal(r.gal.placement.paged, false);
  assert.equal(r.gal.placement.anchorBox, null);
  assert.ok(r.output.some(e => e.type === 'textPlacePage' && e.lines === null));
});

test('the same GPU line is submitted again when frame ownership returns to the Reader', () => {
  const r = rig();
  r.bind(10, '100');
  const frame = { type: 'hookCharRects', engine: 'gpu', line: 7, sw: 800, sh: 600,
    rects: [[80, 420, 24, 24]], text: '空' };
  r.gal.hookEvent({ ...frame, hidden: true });
  r.gal.hookEvent({ ...frame, hidden: false });
  assert.equal(r.output.at(-1).visible, true);
  r.output.length = 0;
  r.gal.hookEvent({ ...frame, hidden: true });
  assert.ok(r.output.some(e => e.type === 'textPlace' && e.rects?.length));
  r.output.length = 0;
  r.gal.hookEvent({ ...frame, hidden: true });
  assert.deepEqual(r.output, []);
});

test('a late glyph table cannot replace confirmed GPU coordinates for a moved line', () => {
  const r = rig();
  r.bind(10, '100');
  const rects = [[300, 540, 28, 28], [328, 540, 28, 28]];
  r.gal.hookEvent({ type: 'hookCharRects', engine: 'gpu', line: 5, hidden: true,
    sw: 800, sh: 600, text: '青空', rects });
  assert.deepEqual(r.output.at(-1).rects, rects);
  const glyph = (seq, text) => {
    r.gal.hooks.state.hookGlyphDots = { seq, text, dots: [...text].map((ch, i) => ({
      i, ch, k: 'd', h: 28, a: 28, at: { x: 180 + i * 28, y: 230, space: 'c' }
    })) };
    r.gal.hookEvent({ type: 'hookGlyphDots' });
  };
  r.output.length = 0;
  glyph(5, '青空');
  assert.deepEqual(r.output, []);
  assert.deepEqual(r.gal.placement.current.rects, rects);
  glyph(6, '翌朝');
  assert.equal(r.output.at(-1).text, '翌朝');
  assert.equal(r.output.at(-1).rects[0][1], 230);
});
