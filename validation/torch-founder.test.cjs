// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 店主: the founder carries #0 and anonymous bearers read 传火人壹、贰、叁 in Chinese. The monument page must keep #0
   (paging starts below 0, no cursor 0) and name anonymous bearers with the upper-case numerals. */
const test=require('node:test');const assert=require('node:assert');const fs=require('node:fs');const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','web','torch-monument.js'),'utf8');
const grab=name=>{const m=src.match(new RegExp('^const '+name+'=(.*);$','m'));assert.ok(m,name+' is defined');return eval('('+m[1]+')');};
test('upper-case numerals both ways',()=>{const cnNo=grab('cnNo'),cnParse=grab('cnParse');
 for(const [n,s] of [[1,'壹'],[2,'贰'],[3,'叁'],[10,'壹拾'],[101,'壹佰零壹'],[1010,'壹仟零壹拾'],[10001,'壹万零壹'],[12345,'壹万贰仟叁佰肆拾伍']]){assert.equal(cnNo(n),s);assert.equal(cnParse(s),n);}});
test('Chinese anonymous name and the founder label',()=>{assert.match(src,/anon:n=>'传火人'\+cnNo\(n\)/);assert.match(src,/nth:n=>n===0\?'创始'/);});
test('paging keeps #0: no cursor 0, list starts below 0, the start is at 0',()=>{
 assert.ok(!/cursor:String\(Math\.max\(0,/.test(src),'no cursor clamped to 0');
 assert.match(src,/torchNo:-1;/);assert.match(src,/if\(first<=0\)\{state\.atStart=true;/);});
