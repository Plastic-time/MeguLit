'use strict';
/* STEINS;GATE 2026-11-21: each earlier line of an NVL page keeps its own translation under it until the page turns; the row's
   height is reserved at once so a late translation never moves the Japanese */
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
const s=fs.readFileSync(path.join(__dirname,'..','web','reader','modules','hook-reader.js'),'utf8');
test('page lines carry their translation in a reserved row',()=>{
 assert.match(s,/const tr=document\.createElement\('div'\);tr\.className='tome-page-tr';[^\n]*tr\.textContent=pageTr\.get\(tr\.__tomeKey\)\|\|'';d\.append\(tr\);/,'one translation row per earlier line, filled from what is known');
 assert.match(s,/o=w\?\.querySelector\('\.tomoyo-cn-output\[data-state=ready\]'\)/,'the current sentence\'s ready translation is remembered by its text');
 assert.match(s,/\.tome-page-lines \.tome-page-tr\{display:block;min-height:calc\(var\(--tomoyo-gal-cn-size,20px\) \* 1\.35\)/,'the row is reserved before its text arrives');
 assert.match(s,/for\(const n of document\.querySelectorAll\('\.tome-page-tr'\)\)\{const t=pageTr\.get\(n\.__tomeKey\)\|\|'';if\(n\.textContent!==t\)n\.textContent=t;\}/,'a late translation only fills its row');
});
test('page lines take their room from the same estimate as the current translation row (inject.js)',()=>{
 const inj=fs.readFileSync(path.join(__dirname,'..','web','reader','modules','inject.js'),'utf8');
 assert.match(inj,/function reserveHeight\(text, el\) \{/);assert.match(inj,/bridge\.translationReserveFor = \(text, el\) => el \? reserveHeight\(text, el\) : 0;/);
 assert.match(inj,/const h = reserveHeight\(text, output\);/,'the current row uses the same function');
 assert.match(s,/translationReserveFor\?\.\(\[\.\.\.\(tr\.parentElement\?\.querySelectorAll\('\.tome-page-char'\)/);
});
