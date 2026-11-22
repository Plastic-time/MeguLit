// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-19 (user, 千恋＊万花, 「電車を降りて、駅前でタクシーを捕まえたものの、いつの間にかうたたねしていたらしい。」): the card for
   うたたね showed its reading but 「＋ Anki」 said 「当前词没有确定读音，无法制卡」. Sudachi cut the line うたた(29-32)｜ねし(32-34,
   ねせる), so the selection 29-33 ended inside a token and LocalLearning.word() found no reading (core/anki.cjs refuses an
   empty one). Old gap, not a regression (word(), the worker and anki.cjs unchanged since v1.4.16).
   Rule: game ruby > context / dictionary reading > never a tokenizer piece. Kana reads as written; a kanji word takes the
   dictionary reading when its entry is spelled as selected and has one reading; a rare word without an entry stays unread.
   Tokens below are the real SudachiDict Full output for that line. */
const test=require('node:test'),assert=require('node:assert/strict');
const {LocalLearning,selectedReading}=require('../core/learning-native.cjs');
const LINE='電車を降りて、駅前でタクシーを捕まえたものの、いつの間にかうたたねしていたらしい。';
const tok=(start,end,surface,reading,base=surface)=>({start,end,surface,reading,base_form:base,pos:'名詞',lexeme:{base,reading},pitch:[0]});
const TOKENS=[tok(10,14,'タクシー','タクシー'),tok(23,25,'いつ','イツ'),tok(25,26,'の','ノ'),tok(26,27,'間','アイダ'),tok(27,28,'に','ニ'),tok(28,29,'か','カ'),tok(29,32,'うたた','ウタタ'),tok(32,34,'ねし','ネシ','ねせる')];
const ENTRIES={'うたたね':{id:1,spellings:['転た寝','うたた寝'],readings:['うたたね'],pos:['n','vs']},'タクシー':{id:2,spellings:['タクシー'],readings:['タクシー']},'いつの間にか':{id:3,spellings:['何時の間にか','いつの間にか'],readings:['いつのまにか']}};
function learning(tokens=TOKENS,entries=ENTRIES){
 const l=Object.create(LocalLearning.prototype);
 l.tokenize=async()=>tokens;
 l.request=async(command,args)=>{const surface=[...args.text].slice(args.start,args.end).join('');return {surface,entries:entries[surface]?[entries[surface]]:[],morphology:{}};};
 return l;
}
const pick=(text,s)=>{const i=[...text].join('').indexOf(s);return {text,start:[...text.slice(0,i)].length,end:[...text.slice(0,i)].length+[...s].length};};

test('うたたね (all hiragana, the selection ends inside a Sudachi token) reads as written and can be mined',async()=>{
 const w=await learning().word(pick(LINE,'うたたね'));
 assert.equal(w.reading,'うたたね');assert.equal(w.ambiguous,false);assert.equal(w.pronunciationForm,'kana');
 assert.ok(!/ネシ|ねせる/.test(w.reading),'no tokenizer piece');
});

test('タクシー (katakana, one token) keeps its own reading',async()=>{
 const w=await learning().word(pick(LINE,'タクシー'));
 assert.equal(w.reading,'タクシー');assert.equal(w.ambiguous,false);
 assert.deepEqual(selectedReading('タクシー',null),{reading:'タクシー',form:'kana'});
});

test('いつの間にか (kanji + kana over five tokens) takes the dictionary reading, not the joined token readings',async()=>{
 const w=await learning().word(pick(LINE,'いつの間にか'));
 assert.equal(w.reading,'いつのまにか');assert.notEqual(w.reading,'イツノアイダニカ');assert.equal(w.ambiguous,false);assert.equal(w.pronunciationForm,'dictionary');
});

test('a rare kanji word without a dictionary reading is still refused, and so is an entry with several readings',async()=>{
 const text='魑魅魍魎が跋扈する',tokens=[tok(0,4,'魑魅魍魎','チミモウリョウ')];
 const w=await learning(tokens,{}).word({text,start:0,end:2});
 assert.equal(w.reading,'');assert.equal(w.ambiguous,true);
 const {Anki}=require('../core/anki.cjs');
 await assert.rejects(()=>new Anki(async()=>{throw Error('no network in tests');}).sync(w,{},null),/当前词没有确定读音/);
 assert.equal(selectedReading('今日',{spellings:['今日'],readings:['きょう','こんにち']}),null,'two readings: no guess');
 assert.equal(selectedReading('今日',{spellings:['今朝'],readings:['けさ']}),null,'an entry spelled otherwise is not this word');
 assert.equal(selectedReading('',null),null);
});

test('an aligned kanji token keeps its sentence-context reading (the fallback only fills a missing one)',async()=>{
 const text='電車を降りて',tokens=[tok(0,2,'電車','デンシャ')];
 const w=await learning(tokens,{'電車':{id:9,spellings:['電車'],readings:['でんしゃ']}}).word({text,start:0,end:2});
 assert.equal(w.reading,'デンシャ');assert.equal(w.pronunciationForm,'surface');
});

test('full-width minute count keeps its counter reading across digit tokens',async()=>{
 const model=learning([tok(0,1,'２','ニ'),tok(1,2,'０','レイ'),tok(2,3,'分','フン')]);
 const word=await model.word({text:'２０分待つ',start:0,end:3});
 assert.equal(word.reading,'ニジュップン');
});
