// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E279: the open library wall must never show the same game twice next to each other (user report 2026-11-09).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'web', 'grimoire.js'), 'utf8');
const pick = re => { const m = src.match(re); assert.ok(m, 'missing ' + re); return m[0]; };
const modulo = (value, period) => ((value % period) + period) % period;
const wallStride = new Function('modulo', 'return ' + pick(/\(cols,n\)=>\{for\(let k=0;k<n;k\+\+\)\{[^\n]*?return cols;\}/))(modulo);

test('wall uses the running sequence when not filtered', () => {
  assert.match(src, /modulo\(row\*stride\+col,items\.length\)/);
  assert.match(src, /const stride=wallStride\(cols,items\.length\)/);
});

test('no game sits next to itself, and each run of n covers every game once', () => {
  for (let n = 4; n <= 60; n++) for (let cols = 2; cols <= Math.max(2, n); cols++) {
    const stride = wallStride(cols, n);
    const at = (r, c) => modulo(r * stride + c, n);
    for (let r = -3; r <= 3; r++) for (let c = -3; c <= 3; c++) {
      for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]])
        assert.notStrictEqual(at(r, c), at(r + dr, c + dc), `n=${n} cols=${cols} r=${r} c=${c} d=${dr},${dc}`);
    }
    assert.strictEqual(new Set(Array.from({ length: n }, (_, c) => at(0, c))).size, n);
  }
});
