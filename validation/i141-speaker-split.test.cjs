// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* #141 (CLANNAD, v1.4.9-beta.1): speaker names reached the text flow. Names are split into the speaker field for every engine. */
const test=require('node:test'),assert=require('node:assert');
const {splitSpeaker}=require('../core/hook-native.cjs');
const K=new Set(['朋也','渚']);
test('bracketed name alone or before the line goes to the speaker field',()=>{
 assert.deepEqual(splitSpeaker('【朋也】'),{name:'朋也',text:''});
 assert.deepEqual(splitSpeaker('【朋也】「よう」'),{name:'朋也',text:'「よう」'});
 assert.deepEqual(splitSpeaker('［渚］\n「はい」'),{name:'渚',text:'「はい」'});
 assert.deepEqual(splitSpeaker('[春原]「おい」'),{name:'春原',text:'「おい」'});});
test('name separated by a line break, ideographic space or colon',()=>{
 assert.deepEqual(splitSpeaker('朋也\n「よう」'),{name:'朋也',text:'「よう」'});
 assert.deepEqual(splitSpeaker('朋也　「よう」'),{name:'朋也',text:'「よう」'});
 assert.deepEqual(splitSpeaker('朋也：「よう」'),{name:'朋也',text:'「よう」'});
 assert.deepEqual(splitSpeaker('　渚　「はい」'),{name:'渚',text:'「はい」'});});
test('known names: glued prefix and a bare name line',()=>{
 assert.deepEqual(splitSpeaker('朋也「よう」',K),{name:'朋也',text:'「よう」'});
 assert.deepEqual(splitSpeaker('渚',K),{name:'渚',text:''});});
test('narration and quotes are left alone',()=>{
 for(const s of ['坂の下で立ち止まる。','「よう」','彼は「よう」と言った。','そして「よう」','【注意】本作品はフィクションです。','　町は春だった。','あ「',''])
  assert.equal(splitSpeaker(s).name,'',s);
 assert.equal(splitSpeaker('朋也「よう」').name,'','unknown glued name stays (the reader guesses it)');});
test('HookNative: a name line becomes the speaker of the next line instead of a text-flow line',()=>{
 const {HookNative}=require('../core/hook-native.cjs');const out=[];
 const h=Object.create(HookNative.prototype);Object.assign(h,{state:{hookSequence:0},now:()=>1000,trace(){},notify(p){out.push(p);},clearChoices(){},emit(){},palFlush(){}});
 h.emitSource('【朋也】','live');h.emitSource('「よう」','live');
 const src=out.filter(p=>'hookSource' in p);assert.equal(src.length,1);assert.equal(src[0].hookSource,'「よう」');assert.equal(src[0].hookSpeaker,'朋也');
 h.emitSource('朋也「またな」','live');const last=out.filter(p=>'hookSource' in p).pop();assert.equal(last.hookSource,'「またな」');assert.equal(last.hookSpeaker,'朋也');});
