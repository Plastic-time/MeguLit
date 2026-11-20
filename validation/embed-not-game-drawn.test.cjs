'use strict';
/* 2026-11-21 (owner, STEINS;GATE (MAGES, embed/write-back): 「每次校准才出来一下日文」; log 21:11-21:13: every line
   「placement not placed: glyph line N has no hidden glyph yet (the game draws it itself)」 while the write-back had the original replaced
   and verified). The glyph path told the reader the game draws the line itself (`visible`, `hiding`), the reader hid its Japanese for it,
   and only a calibration (embed -> read) showed it for a moment. A glyph line the glyph layer never saw hidden is the game's own only
   while nothing else replaced the original. */
const test = require('node:test'), assert = require('node:assert/strict');
const { OverlayPlacement } = require('../core/overlay-placement.cjs');
const run = replaced => { const sent = [], p = new OverlayPlacement({ send: m => sent.push(m), replaced: () => replaced });
  p.configure({ textRenderer: 'compositor', hookProfile: 'embed' }, { bound: true, gameProcessId: 29400, layout: { clientWidth: 1280, clientHeight: 720 } });
  p.glyph({ seq: 2, text: '夏の強烈な日射しを受けて、', dots: [] }); return sent.filter(m => m.type === 'textPlace'); };
test('write-back replaced the original: no "the game draws it itself" note, the reader keeps its Japanese', () => {
  assert.deepEqual(run(true), []);
});
test('nothing replaced the original: the note goes out as before (the game really draws its line)', () => {
  const s = run(false); assert.equal(s.length, 1); assert.equal(s[0].visible, true); assert.equal(s[0].hiding, true);
});
test('r29 千恋＊万花 (KiriKiri engine reports its lines): the note goes out as before even with the write-back replacing', () => {
  const sent = [], p = new OverlayPlacement({ send: m => sent.push(m), replaced: () => true });
  p.configure({ textRenderer: 'compositor', hookProfile: 'embed' }, { bound: true, gameProcessId: 1, layout: { clientWidth: 1535, clientHeight: 863 } });
  p.hook({ type: 'hookCharRects', engine: 'krkr', line: 100069, hidden: false, text: '「で？　１人？」', sw: 1535, sh: 863, rects: [...'「で？　１人？」'].filter(c => c !== '　').map((c, i) => [374 + i * 31, 707, 31, 31]) });
  p.glyph({ seq: 112, text: '「で？　１人？」', dots: [] });
  assert.ok(sent.some(m => m.type === 'textPlace' && m.visible === true), JSON.stringify(sent));
});
