// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-19 (user, 千恋＊万花, hide mode, no calibration): "有时候原文还是会出来一下，就一下，然后又没了"; the screenshot has the game's line and
   MeguLit's Japanese on each other. Log (portable, 11:20:44-48Z):
     11:20:44.415 dialogScene visible=false "text window hidden"   -> the reader layer leaves (shown=false 44.660)
     11:20:46.225 krkr draws its text itself (MeguLit's reading layer is not shown above the game)
     11:20:47.173 placement not placed: line 100085 is drawn by the game itself (hidden=0)
     11:20:47.758 reader layer shown again, with that line
     11:20:48.318 krkr draws its text invisible (MeguLit draws it)   -> 48.384 placement placed: line 100085
   For 0.6 s both drew the same Japanese (1.5 s at 11:20:37, 0.5 s at 11:21:49). While MeguLit is hiding the game's text, a line the
   game draws itself is only there until the hide is back: the reader is told and leaves the Japanese to the game for that time. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { OverlayPlacement } = require('../core/overlay-placement.cjs');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const rig = prefs => { const sent = [], p = new OverlayPlacement({ send: m => sent.push(m) }); p.wanted = () => true; p.configure(prefs, { bound: true, clientWidth: 1424, clientHeight: 801 }); sent.length = 0; return { p, sent }; };
const hide = { hookProfile: 'embed', hookHide: true }, text = '「みたいな感じでさ。子供にそういう脅しを使う」', rects = [...text].map((c, i) => [347 + i * 29, 656, 29, 29]);
const record = (hidden, engine = 'krkr') => ({ type: 'hookCharRects', engine, line: 100085, hidden, sw: 1424, sh: 801, viewport: [0, 0, 1424, 801], rects, text });

test('hide mode: a line the game draws itself is marked as brief, and the same line placed once the hide is back', () => {
  const { p, sent } = rig(hide);
  p.hook(record(false));
  assert.deepEqual(sent.shift(), { type: 'textPlace', visible: true, text, hiding: true }, 'the reader leaves the Japanese to the game');
  p.hook(record(false)); assert.equal(sent.length, 0, 'said once');
  p.hook(record(true)); const placed = sent.shift();
  assert.equal(placed.type, 'textPlace'); assert.equal(placed.visible, undefined); assert.equal(placed.text, text); assert.equal(placed.rects.length, rects.length, 'now MeguLit draws it, on the game\'s characters');
});
test('the engine does not matter: the same for a Ren\'Py record', () => {
  const { p, sent } = rig(hide); p.hook(record(false, 'renpy'));
  assert.deepEqual(sent.shift(), { type: 'textPlace', visible: true, text, hiding: true });
});
test('reading without hiding keeps the reader\'s own Japanese beside the game\'s: no mark', () => {
  for (const prefs of [{ hookProfile: 'read', hookHide: true }, { hookProfile: 'embed', hookHide: false }, {}]) {
    const { p, sent } = rig(prefs); p.hook(record(false));
    assert.deepEqual(sent.shift(), { type: 'textPlace', visible: true, text }, JSON.stringify(prefs));
  }
});
test('switching hiding on or off while bound changes the mark for the next line', () => {
  const { p, sent } = rig({ hookProfile: 'read' });
  p.configure(hide, { bound: true, clientWidth: 1424, clientHeight: 801 }); p.hook(record(false));
  assert.equal(sent.pop().hiding, true);
});
test('reader: the Japanese line steps aside only while the mark is on, the translation stays, and a placed line ends it', () => {
  const js = read('web/reader/modules/text-place.js');
  assert.ok(js.includes("'body.megulit-place-game-drawn.megulit-game-line-brief .sentence-window.tomoyo-hook-reader .sentence-text:not(.megulit-old-line){visibility:hidden!important}',"), 'tied to the game-drawn state, so every path that ends that state ends this too');
  assert.ok(js.includes("'body.megulit-place-game-drawn .sentence-window.tomoyo-hook-reader .tomoyo-cn-row{visibility:visible!important}',"), 'the translation is still drawn');
  /* a86e4913 computes the game-drawn text once as vis (same filter) before its page-clear check */assert.ok(js.includes("const vis = [...String(m.text || '')].filter(c => !blank(c)).join('')"));assert.ok(js.includes("drawnByGame = vis; drawnHiding = m.hiding === true; schedule(); return; }"));
  assert.ok(js.includes('briefSync(drawn && drawnHiding);'));
  /* b7a0cbef: the same branch also drops the line from the advance's stale set */assert.match(js, /if \(m && Array\.isArray\(m\.rects\) && m\.text\) \{? ?drawnByGame = '';/, 'a placed line (hidden again) clears it');
  assert.ok(!/SenrenBanka|BGI|krkr/i.test(js.slice(js.indexOf('megulit-game-line-brief') - 300, js.indexOf('megulit-game-line-brief') + 300)), 'no engine or game name');
});
