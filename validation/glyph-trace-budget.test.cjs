// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-19 1.4.17 live, 千恋＊万花: with MeguLit the title went "not responding" for ~35 s (menu at 64 s instead of 24 s).
   Sampling the game's UI thread put every sample in MeguLitGpu32 GlyphTrace::Find: each whole-texture write searched every
   pending glyph (up to 256) at every texel (up to 4M) on the game thread. A write now gets 4 ms; the rest waits. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const s=fs.readFileSync(path.join(__dirname,'../native/gpuhide/GlyphTrace.h'),'utf8');
test('the glyph search on a texture write is bounded in time and the rest of the glyphs stay pending',()=>{
 assert.match(s,/const Deadline deadline = std::chrono::steady_clock::now\(\) \+ std::chrono::milliseconds\(4\);/);
 assert.match(s,/for \(size_t i = 0; i < pending\.size\(\);\) \{ if \(Late\(&deadline\)\) break;/);
 assert.match(s,/if \(Find\(g, read, x, y, w, h, fx, fy, &taken, &deadline\)\)/);
 assert.equal((s.match(/\{ if \(Late\(deadline\)\) return false;/g)||[]).length,2,'both search loops stop at the deadline');
});
