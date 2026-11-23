// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-19 1.4.17 live, 千恋＊万花 CHAPTER 1-1 (【将臣】): the selected KiriKiri stream handed over one ruby line 12 times in
   one callback, the copies alternating between the base text (志那都荘) and its reading (しなつ荘). The exact-repeat
   normalizers halved it to 6 copies, the reader drew all six and overflowed the text box. Replay of that frame through the
   real source path: the reader gets the line once, with the base text. */
process.env.MEGULIT_RELAY_BASE??='off';
const test=require('node:test'),assert=require('node:assert/strict');
const {HookNative}=require('../core/hook-native.cjs');
const {collapse}=require('../core/ruby-copies.cjs');
const A='「志那都荘まで行って欲しいんですけど」',B='「しなつ荘まで行って欲しいんですけど」';

function host(t){
 let now=100000;const events=[];
 const hook=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-ruby-copies-log'},m=>events.push(m),()=>{},()=>now);
 hook.trace=()=>{};hook.send=()=>{};t.after(()=>hook.stop());
 return {events,source(text,name='KiriKiriZ',code='HW-8*14:-8*0@F4600:SenrenBanka.exe'){now+=1500;hook.source({text,sourceName:name,sourceCode:code,origin:'live'},'');},
  last:()=>[...events].reverse().find(m=>typeof m.hookSource==='string')?.hookSource};
}

test('replay: one ruby line drawn 12 times (base and reading alternating) reaches the reader once, with its base text',t=>{
 const h=host(t);
 h.source('まだ大雑把な目的地しか伝えていなかったのを思い出した。');
 h.source(A+B+B+A+A+A+A+B+B+A+A+A);
 assert.equal(h.last(),A);
 h.source(B+A+A+B);assert.equal(h.last(),A,'the reading-first order folds the same way');
});

test('kept as written: identical copies are left to the evidence rules, kana-only differences are two sentences',()=>{
 assert.equal(collapse(A+A),null);
 assert.equal(collapse('そうだ。そうか。'),null);
 assert.equal(collapse('彼は言った。彼女は答えた。'),null);
 assert.equal(collapse('今日は雨だ。明日は晴れだ。'),null);
 assert.deepEqual(collapse('明日は東京に行く。あしたはとうきょうに行く。明日は東京に行く。'),{text:'明日は東京に行く。',copies:3},'a line opening with a ruby word');
});
