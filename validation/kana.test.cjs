'use strict';
/* SPDX-License-Identifier: GPL-3.0-or-later
   Kana module: progress file hygiene and achievement scoring. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const kana=require('../services/kana.cjs');

test('kana progress: unknown fields and bad values are dropped, prefs are clamped',()=>{
 const clean=kana.clean({mastery:{あ:3,い:9,toolong:2},boxes:{あ:{box:2,due:1},い:{box:7,due:1}},runs:[{id:1,log:[]},{id:'x'}],prefs:{volume:3,speed:5},extra:1});
 assert.deepEqual(clean.mastery,{あ:3});
 assert.deepEqual(clean.boxes,{あ:{box:2,due:1}});
 assert.equal(clean.runs.length,1);
 assert.equal(clean.prefs.volume,1);
 assert.equal(clean.prefs.speed,1.3);
 assert.equal('extra' in clean,false);
});

test('kana progress: save then read round-trips through data/kana-progress.json',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'kana-'));
 try{
  kana.save(root,{mastery:{か:2},lessons:{h0:123},prefs:{volume:0.5}});
  const back=kana.read(root);
  assert.deepEqual(back.mastery,{か:2});
  assert.deepEqual(back.lessons,{h0:123});
  assert.equal(back.prefs.volume,0.5);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('kana game words: a word inside a longer hiragana run does not count',()=>{
 const rows=[{text:'「うん」',read_at:1,title:'A'},{text:'うんめいだね',read_at:2,title:'B'},{text:'ありがとう、うん。',read_at:3,title:'C'}];
 const db={prepare:()=>({all:()=>rows})};
 const out=kana.gameWords(db,['うん','ありがとう','漢字']).words;
 assert.equal(out['うん'].count,2);
 assert.equal(out['ありがとう'].count,1);
 assert.equal('漢字' in out,false);
});

test('kana examples count standalone occurrences and center long excerpts on a real match',async()=>{
 const history=lines=>({prepare:()=>({all:()=>lines.map(text=>({text,title:'Fixture',read_at:1}))})});
 const long='うんめい。'+'空'.repeat(75)+'「うん、うん。」'+'星'.repeat(40);
 const hit=kana.gameWords(history([long]),['うん']).words['うん'];
 assert.deepEqual([hit.count,hit.example.text],[2,'…'+'空'.repeat(19)+'「うん、うん。」'+'星'.repeat(19)+'…']);
 const short='「うんめい、うん。うん！」';
 const mixed=kana.gameWords(history([long,short]),['うん']).words['うん'];
 assert.equal(mixed.count,4);
 assert.equal(mixed.example.text,short);
 assert.deepEqual(mixed.example.matches,[short.indexOf('、')+1,short.indexOf('。')+1]);
 const {exampleHTML}=await import('../web/kana/views/lesson.js');
 const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;');
 assert.equal(exampleHTML(null,'うん',esc),'<mark>うん</mark>');
 const olderLong=long.replace('「うん','古うん');
 assert.equal(kana.gameWords(history([long,olderLong]),['うん']).words['うん'].example.text,hit.example.text);
 assert.equal(kana.gameWords(history([short,'古「うん」']),['うん']).words['うん'].example.text,short);
 assert.equal(exampleHTML(mixed.example,'うん',esc),'うんめい、<mark>うん</mark>。<mark>うん</mark>！');
 assert.equal(exampleHTML(hit.example,'うん',esc),'…'+'空'.repeat(19)+'「<mark>うん</mark>、<mark>うん</mark>。」'+'星'.repeat(19)+'…');
 const quoted='「<うん>&」',escaped=kana.gameWords(history([quoted]),['うん']).words['うん'];
 assert.equal(exampleHTML(escaped.example,'うん',esc),'&lt;<mark>うん</mark>>&amp;');
});

test('decomposed kana keep the same word boundaries and highlights as composed kana',async()=>{
 const composed='めがね。ありがとう！';
 const decomposed=composed.normalize('NFD');
 const history=text=>({prepare:()=>({all:()=>[{text,title:'Fixture',read_at:1}]})});
 const words=['ね','ありがとう'],a=kana.gameWords(history(composed),words).words,b=kana.gameWords(history(decomposed),words).words;
 assert.equal(b['ね'],undefined);
 assert.deepEqual(b,a);
 const {exampleHTML}=await import('../web/kana/views/lesson.js');
 assert.equal(exampleHTML(b['ありがとう'].example,'ありがとう',String),'めがね。<mark>ありがとう</mark>！');
});

test('achievement: all CRITICAL PERFECT shows 101.0% with AP and no letter rank',async()=>{
 const D=await import('../web/kana/data.js');
 const fast=['か','シ','き'].map(show=>({show,ok:true,t:1,limit:10}));
 assert.equal(D.achievement(fast).pct,101);assert.equal(D.achievement(fast).rank,undefined);assert.equal(D.achievement(fast).ap,true);
 assert.equal(D.fmtPct(101),'101.0%');
 const miss=D.achievement([{show:'か',ok:false,t:3,limit:10}]);
 assert.equal(miss.pct,0);assert.equal(miss.ap,false);
 assert.equal(D.judge({ok:true,hint:true,t:1}),'GOOD');
});
