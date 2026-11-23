// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 店主: the founder carries #0 and anonymous bearers read 传火人壹、贰、叁 in Chinese. The monument page must keep #0
   (paging starts below 0, no cursor 0) and name anonymous bearers with the upper-case numerals. */
const test=require('node:test');const assert=require('node:assert');const fs=require('node:fs');const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','web','torch-monument.js'),'utf8');
const grab=name=>{const m=src.match(new RegExp('^const '+name+'=(.*);$','m'));assert.ok(m,name+' is defined');return eval('('+m[1]+')');};
test('upper-case numerals both ways',()=>{const cnNo=grab('cnNo'),cnParse=grab('cnParse');
 for(const [n,s] of [[1,'壹'],[2,'贰'],[3,'叁'],[10,'壹拾'],[101,'壹佰零壹'],[1010,'壹仟零壹拾'],[10001,'壹万零壹'],[12345,'壹万贰仟叁佰肆拾伍']]){assert.equal(cnNo(n),s);assert.equal(cnParse(s),n);}});
test('Chinese anonymous name; #0 is just #0, no founder label',()=>{assert.match(src,/anon:n=>'传火人'\+cnNo\(n\)/);assert.match(src,/nth:n=>n===0\?'#0'/);assert.ok(!/创始|Founder|創始/.test(src),'no founder label');});
test('paging keeps #0: no cursor 0, list starts below 0, the start is at 0',()=>{
 assert.ok(!/cursor:String\(Math\.max\(0,/.test(src),'no cursor clamped to 0');
 assert.match(src,/torchNo:-1;/);assert.match(src,/if\(first<=0\)\{state\.atStart=true;/);});

test('jumping to #0 focuses the founder, while a missing name does not focus another entry',async()=>{
 const start=src.indexOf(' async function jumpTo(item)'),end=src.indexOf('\n /* ---------- UI',start);
 assert.ok(start>=0&&end>start);
 for(const found of [true,false]){
  const state={monthsOn:false,focusNo:null,items:found?[{torchNo:0}]:[],fit:1,layout:{entries:[{item:{torchNo:0}}]}};
  let focused=0;
  const loadAt=async()=>true,layoutNow=()=>{},redraw=()=>{},ahead=async()=>{},scene={lookAtFocus(){focused++;}};
  const jumpTo=eval('('+src.slice(start,end).trim()+')');
  await jumpTo({torchNo:0});
  assert.equal(focused,found?1:0);
  assert.equal(state.focusNo,found?0:null);
 }
});

test('no focus uses null so #0 is not highlighted by default or after a month change',()=>{
 assert.match(src,/offline:false,focusNo:null,/);
 assert.match(src,/state\.focusNo=null;await loadAt\(\{month:b\.month/);
});
