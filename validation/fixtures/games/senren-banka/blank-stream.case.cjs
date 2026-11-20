// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* incr9 2026-11-21 (owner, 千恋＊万花, hook-events after 22:53:42: `glyph mode blank stream=e42198:0:0 writable`, then for 「お客さん」
   「……ぁ？」「お客さんってば」 every line `not placed: glyph line N has no hidden glyph yet (the game draws it itself)` and
   `line 100001 is drawn by the game itself (hidden=0)`; on screen the game drew nothing and MeguLit only the translation).
   With the bridge blanking the selected writable stream the line is hidden: the reader draws its Japanese (fallback), a late
   hidden glyph only places it. Without blanking the old rule stays (the game draws it: `visible`). The GPU layer is per frame. */
const { OverlayPlacement } = require('../../../../core/overlay-placement.cjs');
module.exports = async ({ profile, Profiles, assert }) => {
assert.equal(Profiles.get(profile, 'placement.drawWhileBlanking', false), true, 'senren-banka.cjs sets placement.drawWhileBlanking');
function make(blank, prof = profile) {
  const out = [], p = new OverlayPlacement({ send: m => out.push(m), blanking: () => blank }); p.wanted = () => true;
  p.profile = prof; p.configure({}, { bound: true, layout: { clientWidth: 1535, clientHeight: 863 } }); out.length = 0; return { p, out };
}
const shortLines = ['お客さん', '……ぁ？', 'お客さんってば'];
{ const { p, out } = make(true);
  shortLines.forEach((text, k) => p.glyph({ seq: k + 1, text, dots: [] }));
  const lines = out.filter(m => m.type === 'textPlace');
  assert.strictEqual(lines.length, 3, 'every short line goes out');
  for (const m of lines) { assert.strictEqual(m.fallback, true, 'drawn by the reader: ' + JSON.stringify(m)); assert.notStrictEqual(m.visible, true); }
  out.length = 0;
  p.hook({ type: 'hookCharRects', engine: 'krkr', line: 100001, hidden: false, sw: 1535, sh: 863, viewport: [0, 0, 1535, 863], rects: [[374, 707, 31, 31], [405, 707, 31, 31]], text: 'はい' });
  assert.strictEqual(out.shift()?.fallback, true, 'an engine line reported unhidden while the stream is blanked: the reader draws it');
  p.hook({ type: 'hookCharRects', engine: 'gpu', line: 7, hidden: false, sw: 1535, sh: 863, viewport: [0, 0, 1535, 863], rects: [[374, 707, 31, 31]], text: 'え' });
  assert.strictEqual(out.shift()?.visible, true, 'the GPU layer decides per frame: unhidden stays the game\'s');
}
{ const { p, out } = make(false);
  p.glyph({ seq: 1, text: 'お客さん', dots: [] });
  assert.strictEqual(out.find(m => m.type === 'textPlace')?.visible, true, 'no blanking: the game draws it itself (unchanged)');
}
{ const { p, out } = make(true, Profiles.profileFor({ exe: 'Other.exe', title: 'Other' }));
  p.glyph({ seq: 1, text: 'お客さん', dots: [] });
  assert.strictEqual(out.find(m => m.type === 'textPlace')?.visible, true, 'another game: unchanged (the game profile carries drawWhileBlanking)');
}
};
