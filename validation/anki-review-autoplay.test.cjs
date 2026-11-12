'use strict';
/* 2026-11-12 regression: a half-applied patch left frame() reading `auto` that was never declared, so every Anki review
   and practice card threw and showed "Anki 暂时无法完成此操作" for every user. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('Anki review: the auto-play setting the card frame reads is declared and mounted',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','web','anki-review.js'),'utf8');
 assert.match(src,/let auto=\{flip:'off',next:'off'\}/);assert.match(src,/function mountAutoplay\(toolbar\)/);assert.match(src,/mountAutoplay\(toolbar\)/);
 assert.ok(src.indexOf('let auto=')<src.indexOf('function frame('),'declared before the frame uses it');
});
