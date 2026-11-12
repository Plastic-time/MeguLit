// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-12 art text: a Japanese line outside the text window is located on the picture; MeguLit lays an invisible,
   readable copy and the translation over it while the game keeps drawing it. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const {HookNative}=require('../core/hook-native.cjs');
test('a Japanese line from another stream is located once; the current dialogue, labels with paths and markup are not',()=>{
 const asked=[];let now=1000;const h=Object.create(HookNative.prototype);h.now=()=>now;h.trace=()=>{};h.artLocate=t=>asked.push(t);h.lastSource='「そうか」と彼は言った。';
 h.artCandidate('館がある');h.artCandidate('館がある');h.artCandidate('「そうか」と彼は言った。');h.artCandidate('E:\GAL\a.pak');h.artCandidate('<size=12>メニュー');h.artCandidate('A');
 assert.deepEqual(asked,['館がある']);
 now+=21000;h.artCandidate('館がある');assert.deepEqual(asked,['館がある','館がある'],'again after 20 s');
});
test('the page draws art text as invisible, readable characters plus the translation',()=>{
 const src=read('web/reader/modules/art-text.js');
 assert.match(src,/className='sentence-text megulit-art-row'/);assert.match(src,/className='char-token'/);
 assert.match(src,/color:transparent!important/);assert.match(src,/megulit-art-cn/);
 assert.match(read('web/reader/bootstrap.js'),/artText:'artText'/);
 assert.ok(JSON.parse(read('web/reader/modules.json')).includes('art-text'));assert.match(read('web/reader/module-list.js'),/"art-text"/);
});
test('the art request reaches PageLocator and its answer the page, with a translation',()=>{
 assert.match(read('core/gal-native.cjs'),/this\.hooks\.artLocate=text=>\{[^}]*type:'pageLocate',text,art:true/);
 assert.match(read('core/gal-native.cjs'),/message\.type==='artText'\)\{this\.onEvent\(message\)/);
 assert.match(read('native/GalWindowBridge.cs'),/PageLocate\.Request\(Target,Str\(d,"text"\),Bool\(d,"art"\)\)/);
 assert.match(read('native/PageLocator.cs'),/void LocateArt\(/);
 assert.match(read('services/reader.cjs'),/message\.type==='artText'\)\{this\.artText\(message\)/);
});
