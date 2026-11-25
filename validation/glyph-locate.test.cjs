// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* ① locating marks for GetGlyphOutline engines (core/glyph-locate.cjs), on synthetic captures: a text box on a noisy
   background, the game's own animation elsewhere, a few stray faint changes, and the three marks the DLL leaves
   (coverage 1/64 of the text colour on one pixel). The engine may scale its glyph pixels to the window (k). */
const test = require('node:test'), assert = require('node:assert'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const L = require('../core/glyph-locate.cjs');

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const W = 1280, H = 720;
/* background: gradient + fixed noise; a text box (dark or light) */
function frame(box, seed = 7) {
  const r = rng(seed), f = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = (y * W + x) * 4, inBox = x >= 60 && x < 1220 && y >= 470 && y < 700;
    const v = inBox ? box + Math.floor(r() * 6) : 90 + ((x + y) >> 4) % 60 + Math.floor(r() * 20);
    f[p] = v; f[p + 1] = Math.min(255, v + 3); f[p + 2] = Math.max(0, v - 3); f[p + 3] = 255;
  }
  return f;
}
const copy = f => Uint8Array.from(f);
/* the game composites a glyph pixel of coverage c/64 in the text colour over what is there */
function mark(f, x, y, text) { const p = (y * W + x) * 4; for (let k = 0; k < 3; k++) f[p + k] = Math.round(f[p + k] + (text - f[p + k]) / 64); }
function animate(f, seed) { const r = rng(seed); for (let y = 100; y < 300; y++) for (let x = 900; x < 1100; x++) { const p = (y * W + x) * 4; f[p] = f[p + 1] = f[p + 2] = Math.floor(r() * 255); } }
function strays(f, seed, n, text) { const r = rng(seed); for (let i = 0; i < n; i++) mark(f, 40 + Math.floor(r() * 1200), 20 + Math.floor(r() * 400), text); }

/* a line table as HookNative keeps it (blank-mode GetGlyphOutline records: no position, s = 1 on the marked ones) */
function table(text, adv = c => '、。」！？'.includes(c) ? 28 : 28) {
  const chars = [...text], n = chars.length;
  return {seq: 9, text, dots: chars.map((ch, i) => ({i, ch, h: 28, b: 24, a: adv(ch), x: 1 + (i % 3), y: 2 + (i % 2), s: i === 0 || i === 1 || i === n - 1 ? 1 : 0, k: 'd'}))};
}
/* where the engine puts each glyph: origin, scale k, wrap width W (glyph px), pitch (client px) */
function truth(t, origin, k, Wg, pitch, kinsoku = false) {
  const c = L.cells(t), lay = L.rows(c, Wg, kinsoku);
  return c.map((x, i) => ({x: Math.round(origin[0] + k * (lay[i].pen + x.x)), y: Math.round(origin[1] + lay[i].row * pitch + k * x.y), cell: [origin[0] + k * lay[i].pen, origin[1] + lay[i].row * pitch]}));
}
function scene(t, pos, box, text) {
  const prev = frame(box), cur = copy(prev); animate(prev, 1); animate(cur, 2); strays(cur, 3, 6, text);
  const n = pos.length; for (const i of [0, 1, n - 1]) mark(cur, pos[i].x, pos[i].y, text);
  return {prev, cur};
}

test('marks are at most 4 levels on one pixel, on a dark box (white text) and on a light box (dark text)', () => {
  for (const [box, text] of [[20, 255], [235, 10]]) {
    const f = frame(box), g = copy(f); mark(g, 300, 520, text);
    const p = (520 * W + 300) * 4, d = Math.max(...[0, 1, 2].map(k => Math.abs(g[p + k] - f[p + k])));
    assert.ok(d >= 1 && d <= 4, 'one mark changes one pixel by 1..4 levels, got ' + d);
    let other = 0; for (let i = 0; i < f.length; i++) if (f[i] !== g[i] && Math.floor(i / 4) !== 520 * W + 300) other++; assert.equal(other, 0);
  }
});

test('one-row line, scale 1: origin found despite animation and stray faint pixels', () => {
  const t = table('吾輩は猫である。名前はまだ無い。'), pos = truth(t, [100, 500], 1, 1100, 40);
  const {prev, cur} = scene(t, pos, 20, 255), marks = L.findMarks(prev, cur, W, H);
  assert.ok(marks.length >= 3 && marks.length <= 12, 'marks + strays, not the animation: ' + marks.length);
  const c = L.locate(t, marks); assert.ok(c, 'located');
  assert.ok(Math.abs(c.originX - 100) <= 1.5 && Math.abs(c.originY - 500) <= 1.5 && Math.abs(c.scale - 1) < 0.08, JSON.stringify(c));
  const placed = L.layout(t, c); assert.equal(placed.rects.length, 16);
  for (let i = 0; i < 16; i++) assert.ok(Math.abs(placed.rects[i].x - pos[i].cell[0]) <= 2 && Math.abs(placed.rects[i].y - pos[i].cell[1]) <= 2, 'cell ' + i);
});

test('scaled engine (k = 1.25) on a light box: scale and origin', () => {
  const t = table('どこで生れたかとんと見当がつかぬ。'), pos = truth(t, [140, 520], 1.25, 2000, 50);
  const {prev, cur} = scene(t, pos, 235, 10), c = L.locate(t, L.findMarks(prev, cur, W, H));
  assert.ok(c && Math.abs(c.originX - 140) <= 2 && Math.abs(c.originY - 520) <= 2 && Math.abs(c.scale - 1.25) < 0.1, JSON.stringify(c));
});

test('wrapped line: wrap width and row pitch learned from the last character; layout puts later lines right', () => {
  const t = table('あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめも'), Wg = 560, pos = truth(t, [100, 480], 1, Wg, 40);
  assert.ok(pos[pos.length - 1].cell[1] > 480, 'the test line wraps');
  const {prev, cur} = scene(t, pos, 20, 255), c = L.locate(t, L.findMarks(prev, cur, W, H));
  assert.ok(c && c.pitch && Math.abs(c.pitch - 40) <= 2 && c.wrapMin <= Wg && c.wrapMax > Wg, JSON.stringify(c));
  const other = table('らりるれろわをんアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホ'), want = truth(other, [100, 480], 1, Wg, 40), got = L.layout(other, c);
  for (let i = 0; i < want.length; i++) assert.ok(Math.abs(got.rects[i].x - want[i].cell[0]) <= 2 && Math.abs(got.rects[i].y - want[i].cell[1]) <= 2, 'next line cell ' + i + ' ' + JSON.stringify([got.rects[i], want[i].cell]));
});

test('calibration: merged per game, a moved box replaces it, stored beside the font memory', () => {
  const a = {originX: 100, originY: 480, scale: 1, pitch: 40, wrapMin: 532, wrapMax: 588, kinsoku: false};
  const m = L.merge(a, {originX: 100.5, originY: 480, scale: 1, pitch: null, wrapMin: 448, wrapMax: 560, kinsoku: null});
  assert.equal(m.wrapMin, 532); assert.equal(m.wrapMax, 560); assert.equal(m.pitch, 40);
  assert.equal(L.merge(a, {originX: 300, originY: 100, scale: 1, pitch: null, wrapMin: 10, wrapMax: Infinity}).originX, 300);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'glyph-locate-')); try {
    const exe = path.join(root, 'ゲーム.exe'); fs.writeFileSync(exe, 'MZ' + 'x'.repeat(98));
    assert.ok(L.saveCalib(root, exe, {...a, wrapMax: Infinity})); assert.equal(path.basename(L.calibFile(root, exe)), '___.exe-100.json');
    const back = L.loadCalib(root, exe); assert.equal(back.originX, 100); assert.equal(back.wrapMax, Infinity);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test('nothing to find: no marks, or records without every character', () => {
  const t = table('吾輩は猫'); assert.equal(L.locate(t, []), null);
  const f = frame(20); assert.deepEqual(L.findMarks(f, copy(f), W, H), []);
  assert.equal(L.layout({text: '猫だ', dots: [{i: 0, ch: '猫', a: 28, h: 28, b: 24, x: 0, y: 0, k: 'd'}]}, {originX: 0, originY: 0, scale: 1, wrapMin: 0, wrapMax: Infinity}), null);
});

test('wiring: DLL marks GRAY8 only (first, second, last), bridge and front end switch them; bridge uses the stream flush policy', () => {
  const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const c = read('native/fontprobe/FontProbe.cpp');
  assert.ok(c.includes('if (markable && (f & 0x0f) == GGO_GRAY8_BITMAP && sv.kind == \'d\'') && c.includes('((BYTE *)b)[0] = 1; side = 1;'), 'one pixel, coverage 1/64, GRAY8 only');
  assert.ok(c.includes('if (i == 0 || i == 1) return true;') && c.includes('return i == n - 1;'), 'first, second and last character');
  assert.ok(c.includes('l == "MARK on" || l == "MARK off"') && c.includes('if (MarkLast < 0) MarkLast = seq + 1; ok = seq <= MarkLast;'), 'marks for two lines only');
  assert.ok(c.includes('bool again = ') || c.includes('again = Raster.Rerasterises(cached)'), 'marks only on engines that rasterise again');
  assert.ok(read('native/fontprobe/GlyphMatch.h').includes('bool Rerasterises(bool cached) const { return !cached && chances >= 10 && hits * 10 >= chances * 9; }'));
  assert.ok(read('native/fontprobe/selftest/match.cpp').includes('an engine that rasterises a character once (glyph cache) gets no marks'));
  assert.ok(read('native/HookBridge.cs').includes('status="marks-off"') && read('core/hook-native.cjs').includes("'needs-relaunch','marks-off'"));
  assert.ok(read('native/fontprobe/selftest/dothost.cpp').includes('marks: stop by themselves after two lines'));
  const b = read('native/HookBridge.cs');
  assert.ok(b.includes('GlyphSend(GlyphMarks?"MARK on":"MARK off")') && b.includes('if(GlyphMarks)w.WriteLine("MARK on");'));
  assert.ok(b.includes('want=ReaderFlushDelay(c,GlyphAll,GpuPageOn);') && b.includes('static void GlyphLine(string text){FlushFit();'), 'glyph placement uses the selected stream-level flush policy');
  const h = Object.create(require('../core/hook-native.cjs').HookNative.prototype), sent = []; h.send = m => sent.push(m);
  h.setGlyphMarks(true); h.setGlyphMarks(0); assert.deepEqual(sent, [{type: 'glyphMarks', on: true}, {type: 'glyphMarks', on: false}]);
  assert.ok(read('native/fontprobe/selftest/dothost.cpp').includes('"marks: none in GRAY4 (1/16 would be visible)"'));
});
