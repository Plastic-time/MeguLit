// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 owner incr9 (千恋＊万花, KiriKiri Z TextRender, E:\MeguLit-Test-1421 22:53:50Z-22:57Z): the opening lost its Japanese.
   The engine hide's trial line was the scene label ■自動車（車内／走行）, which the game never draws; the trial failed, every line was
   written back blank, TextRender laid out spaces and sent no ToMe_CHARS, and the reader only had "glyph line N has no hidden glyph
   yet" notes. Replayed here: the engine trial skips labels and name plates (HookBridge --self-test runs the behaviour), the TJS side
   counts blank layouts, and once the engine placed a hidden line the glyph path is only the fallback. */
const assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..');
const bridge = fs.readFileSync(path.join(root, 'native', 'HookBridge.cs'), 'utf8');
assert.match(bridge, /static bool EngineAside\(string text\)\{return text\.Length>0&&\(EngineNamePlate\.IsMatch\(text\)\|\|EmbedTextPolicy\.Label\(text\)&&!SpokenPiece\(text\)\);\}/);
assert.match(bridge, /static bool EngineAllOk\(string text\)\{text=text\?\?"";DateTime now=DateTime\.UtcNow;\r?\n  if\(ProfileTrial==0\)return false;[^\r\n]*\r?\n  if\(ProfileSkipAside&&Volatile\.Read\(ref EngineHideOn\)>0&&!EngineTrialFailed&&EngineAside\(text\)\)return true;/, 'a label or name passes before any trial or click is counted');
assert.match(bridge, /EngineAllOk\("■自動車（車内／走行）"\)\|\|EngineTrialText!=null\)return false;/, 'self-test: the label alone starts no trial');
const tjs = fs.readFileSync(path.join(root, 'native', 'krkrtext', 'script.inc'), 'utf8');
assert.match(tjs, /if\(n==0\) \{this\.trClear\(L\);this\.trNote\('blank'\);return;\}/);
assert.match(tjs, /'\/blank'\+\(\+this\.trWhy\.blank\)/);

const { OverlayPlacement } = require('../core/overlay-placement.cjs');
const sent = [], trace = [], p = new OverlayPlacement({ send: m => sent.push(m), trace: t => trace.push(t) });
p.wanted = () => true;
p.configure({ hookProfile: 'embed' }, { bound: true, clientWidth: 1535, clientHeight: 863, gameProcessId: 42 }); sent.length = 0;
const glyphLine = seq => ({ seq, text: '「え？　あ、そうでしたね」', dots: [] });
/* before any engine line: the glyph note keeps the reader's Japanese off a line the game may still draw (unchanged) */
p.glyph(glyphLine(1));
assert.strictEqual(sent.shift()?.visible, true, 'no engine line yet: glyph note as before');
/* the KiriKiri line arrives hidden at the game's own place (incr9 log: first box 374,707,31,31 in client 1535x863) */
const text = '電車を降りて', rects = [...text].map((c, i) => [374 + i * 31, 707, 31, 31]);
p.hook({ type: 'hookCharRects', engine: 'krkr', line: 100004, hidden: true, sw: 1535, sh: 863, viewport: [0, 0, 1535, 863], rects, text });
const placed = sent.shift();
assert.strictEqual(placed.type, 'textPlace'); assert.deepStrictEqual(placed.rects[0], [374, 707, 31, 31]);
/* glyph lines 7-25 of the log: no visible note, no clear: the engine place stands */
for (const seq of [7, 8, 9, 10]) p.glyph(glyphLine(seq));
assert.deepStrictEqual(sent, [], 'glyph lines are only the fallback once the engine placed a line hidden');
assert.ok(trace.some(t => /skipped: glyph line 7 \(the engine path/.test(t)));
/* another game in the same run starts without the engine flag */
p.configure({ hookProfile: 'embed' }, { bound: true, clientWidth: 1280, clientHeight: 720, gameProcessId: 43 }); sent.length = 0;
p.glyph(glyphLine(30));
assert.strictEqual(sent.shift()?.visible, true, 'a new game: the glyph path decides again');
console.log('krkr engine primary: ok');
