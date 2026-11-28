// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-28 アオイトリ (CMVS): one context of the dialogue hook sends only the glyphs drawn for the first time, its sibling the whole line
   1-10 ms later. HookBridge's first-glyph sibling handling (hold, switch, mark) runs only when the profile turns on
   source.firstGlyphSiblings, which only the CMVS engine layer does. The bridge behaviour itself is checked by HookBridge --self-test
   (CmvsFirstGlyphFlowSelfTest: the lines emitted to MeguLit for each scenario, with the key on and off). */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const P=require('../core/profiles/index.cjs'),{clean}=require('../core/profiles/domains.cjs'),{HookNative}=require('../core/hook-native.cjs');
const bp=profile=>HookNative.prototype.bridgeProfile.call({profile});
const opt=firstGlyphSiblings=>({source:{firstGlyphSiblings}});

test('only the CMVS engine layer hands firstGlyphSiblings to HookBridge',()=>{
 const cmvs=P.profileFor({engine:'CMVS'});
 assert.equal(cmvs.source.firstGlyphSiblings,true);
 assert.equal(bp(cmvs).firstGlyphSiblings,true);
 for(const engine of ['','nexas','kirikiri','mages','yuris']){
  const p=P.profileFor({engine});
  assert.equal(p.source.firstGlyphSiblings,false,engine);
  assert.equal('firstGlyphSiblings' in bp(p),false,engine);
 }
 assert.equal('firstGlyphSiblings' in bp(P.profileFor({engine:'CMVS',official:opt(false)})),false,'a game diff can turn it off');
 assert.deepEqual(clean(opt(true)),{value:opt(true),rejected:[]});
 assert.deepEqual(clean(opt('true')),{value:{},rejected:['source.firstGlyphSiblings']});
});

test('HookBridge reads the key and gates the sibling handling on it',()=>{
 const cs=fs.readFileSync(path.join(__dirname,'..','native','HookBridge.cs'),'utf8');
 assert.match(cs,/ProfileFirstGlyphSiblings=d!=null&&d\.TryGetValue\("firstGlyphSiblings",out av\)&&av is bool&&\(bool\)av/);
 assert.ok(cs.includes('if(!CmvsFirstGlyphFlowSelfTest())return 3;'),'checked by --self-test');
});
