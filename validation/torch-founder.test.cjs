// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* The monument keeps founder #0 addressable and displays anonymous aliases. */
const test=require('node:test');const assert=require('node:assert');const fs=require('node:fs');const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','web','torch-monument.js'),'utf8');
const grab=name=>{const m=src.match(new RegExp('^const '+name+'=(.*);$','m'));assert.ok(m,name+' is defined');return eval('('+m[1]+')');};
test('legacy upper-case numerals still navigate',()=>{const cnParse=grab('cnParse');
 for(const [n,s] of [[0,'零'],[1,'壹'],[10,'壹拾'],[101,'壹佰零壹'],[12345,'壹万贰仟叁佰肆拾伍']])assert.equal(cnParse(s),n);
});
test('monument labels prefer a signature then the assigned alias and omit numbers beneath names',()=>{
 assert.match(src,/item\.name\|\|item\.alias\|\|t\.anon/);
 assert.match(src,/it\.name\|\|it\.alias\|\|t\.anon/);
 assert.doesNotMatch(src,/t\.nth|创始|Founder|創始/);
});
test('paging keeps #0: no cursor 0, list starts below 0, the start is at 0',()=>{
 assert.ok(!/cursor:String\(Math\.max\(0,/.test(src),'no cursor clamped to 0');
 assert.match(src,/torchNo:-1;/);assert.match(src,/if\(first<=0\)\{state\.atStart=true;/);});

test('jumping to #0 focuses the founder, while a missing name does not focus another entry',async()=>{
 const start=src.indexOf(' async function jumpTo(item)'),end=src.indexOf('\n /* ---------- UI',start);
 assert.ok(start>=0&&end>start);
 for(const found of [true,false]){
  const state={monthsOn:false,focusNo:null,items:found?[{torchNo:0}]:[],fit:1,layout:{entries:[{item:{torchNo:0}}]}};
  const mounted=true,visit=1,isVisit=id=>id===visit;
  let focused=0;
  const loadAt=async()=>true,layoutNow=()=>{},redraw=()=>{},ahead=async()=>{},scene={lookAtFocus(){focused++;}};
  const jumpTo=eval('('+src.slice(start,end).trim()+')');
  await jumpTo({torchNo:0});
  assert.equal(focused,found?1:0);
  assert.equal(state.focusNo,found?0:null);
 }
});

test('no focus uses null so #0 is not highlighted by default or after a month change',()=>{
 assert.match(src,/focusNo:null,/);
 assert.match(src,/await loadAt\(\{month:b\.month,cursor:''\},valid\);\s*if\(!ok\|\|!valid\(\)\)return;\s*state\.focusNo=null;/);
});
