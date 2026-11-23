// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-16 QQ group: never "the game's text hidden and nothing drawn" (Fate/stay night with a Chinese patch), and
   never MeguLit's Japanese at a guessed place beside the game's unhidden own (WHITE ALBUM). Generic, every engine. */
const test=require('node:test'),assert=require('node:assert/strict');
const {HookNative}=require('../core/hook-native.cjs');
const {OverlayPlacement}=require('../core/overlay-placement.cjs');
const hook=()=>{const h=Object.create(HookNative.prototype);h.state={};h.pid=42;h.trace=()=>{};h.notify=m=>Object.assign(h.state,m);h.configured=0;h.preferences={};h.windowState={};h.configure=()=>{h.configured++;};h.originalText=null;return h;};
test('three kana-less story lines stop hiding; a Japanese line turns it back on',()=>{
 const h=hook();for(let i=0;i<2;i++)h.japaneseGuard('衛宮士郎在這個夜晚遇見了她，命運從此改變');
 assert.notEqual(h.noJapaneseSource,true);h.japaneseGuard('他們說聖杯戰爭已經開始了');
 assert.equal(h.noJapaneseSource,true);assert.equal(h.configured,1);
 h.japaneseGuard('……そうなんだよなあ');assert.equal(h.noJapaneseSource,false);assert.equal(h.configured,2);
});
test('short lines, names and English mapped back to Japanese do not count',()=>{
 const h=hook();for(let i=0;i<5;i++)h.japaneseGuard('【士郎】');assert.notEqual(h.noJapaneseSource,true);
 h.originalText={foreign:()=>'日本語'};h.scriptAllowed=()=>true;for(let i=0;i<5;i++)h.japaneseGuard('The night the war began, I met her.');assert.notEqual(h.noJapaneseSource,true);
});
test('configure keeps the game text when the source has no Japanese',()=>{
 const src=require('node:fs').readFileSync(require('node:path').join(__dirname,'../core/hook-native.cjs'),'utf8');
 assert.match(src,/if\(this\.noJapaneseSource===true&&this\.noJapanesePid===pid\)enabled=false;const route=/);
 assert.match(src,/this\.languageCheck\(m\.text\);this\.japaneseGuard\(m\.text\);/);
});
const place=()=>{const out=[],p=new OverlayPlacement({send:m=>out.push(m)});p.wanted=()=>true;p.configure({},{bound:true,layout:{clientWidth:1280,clientHeight:720}});out.length=0;return {p,out};};
test('no hidden record yet: a guessed place is not drawn over the game, the line is visible',()=>{
 const {p,out}=place();p.anchor({x:200,y:560,size:24,width:400,pitch:36});
 p.glyph({seq:1,text:'…そうなんだよなあ',dots:[]});
 assert.deepEqual(out.shift(),{type:'textPlace',visible:true,text:'…そうなんだよなあ'});
 p.locator=()=>[[1,1,24,24]];p.glyph({seq:2,text:'…そうなんだよなあ',dots:[]});assert.equal(out.length,0,'located guess not drawn either');
});
test('once the game hid a line, guessed places are used again',()=>{
 const {p,out}=place();p.anchor({x:200,y:560,size:24,width:400,pitch:36});p.glyph({seq:1,text:'かき',dots:[{i:0,ch:'か',h:30,a:28,k:'d',at:{x:100,y:500,space:'c'}}]});out.length=0;
 p.glyph({seq:2,text:'さ',dots:[{i:0,ch:'さ',h:30,a:28,k:'d',at:{x:1,y:1,space:'g'}}]});assert.equal(out.shift().approx,true);
 p.glyph({seq:3,text:'すせ',dots:[]});assert.equal(out.shift().approx,true,'a line from the glyph cache (no records) still placed');
});
