// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 1.4.22 owner test, ファタモルガーナの館 opening (E:\MeguLit-Test-1421\logs\hook-events.log, 2026-11-21T02:25Z): the pictures
   bgimage/聖なるかな…5 (data_jp.xp3) fade in 「聖なるかな」 row by row, three times, then fade out; then 「父よ私を憐れみたまえ」. The log:
     02:25:18.030 ocr page art scan 1/0 型なるかな                     (row 1 fading in, misread)
     02:25:18.564 ocr page art scan 1/0 聖なるかな平なるかな           (rows 1–2)
     02:25:19.077 ocr line "型なるかな"                                -> translated 「我想知道会不会是一份表格。」
     02:25:19.564 ocr page art scan 1/0 型なるかな聖なるかな
     02:25:20.074 ocr line refused (a list) "型なるかな聖なるかな"
     02:25:20.958 ocr page art scan 1/0 型なるかな型なるかな聖なるかな   (rows 1–3)
     02:25:24.829 ocr page art scan 1/0 聖なるかな聖なるかな聖なるかな
     02:25:26.208 ocr page art scan 1/0 叩なるかな叩なるかな叩なるかな   (fading out)
     02:25:28.157 / 28.700 父よ仏をれみたまえ / 父よ私を憐れみたまえ -> 02:25:29.201 ocr line "父よ私を憐れみたまえ"
   Replayed through HookNative.ocrLine / ocrFlush (core/ocr-vote.cjs): the misread single row is never a line, the litany is
   one line 「聖なるかな」, and the next card is read as before. Group ids and row boxes are the picture's places (1, 2, 3 rows). */
const test=require('node:test'),assert=require('node:assert/strict');
const {HookNative}=require('../core/hook-native.cjs'),V=require('../core/ocr-vote.cjs');

function rig(){
 const n=Object.create(HookNative.prototype),sent=[],traces=[];let clock=0;
 Object.assign(n,{now:()=>clock,trace:t=>traces.push(t),source:m=>sent.push(m.text),ocrSnap:()=>'',lastSource:'',engineDialog:undefined,state:{}});
 n.ocrSchedule=()=>{}; /* flushed by the replay at the log's times */
 const rows=(texts,y0=100)=>texts.map((t,i)=>({text:t,x:300,y:y0+i*60,w:200,h:40}));
 const scan=(t,id,texts,y0)=>{clock=t;n.ocrLine({source:'ocr',id,visible:true,text:texts.join(''),rows:rows(texts,y0),sw:800,sh:600});};
 const flush=t=>{clock=t;n.ocrFlush();};
 return {scan,flush,sent,traces};
}

test('the opening litany: no misread line, one line 「聖なるかな」, the next card as before',()=>{
 const {scan,flush,sent,traces}=rig();
 scan(18030,'a',['型なるかな']);
 scan(18564,'b',['聖なるかな','平なるかな']);
 flush(19077);
 scan(19564,'b',['型なるかな','聖なるかな']);
 flush(20074);
 scan(20958,'c',['型なるかな','型なるかな','聖なるかな']);
 scan(24829,'c',['聖なるかな','聖なるかな','聖なるかな']);
 flush(25340);
 scan(26208,'c',['叩なるかな','叩なるかな','叩なるかな']);
 flush(26800);
 scan(28157,'d',['父よ仏をれみたまえ'],300);scan(28700,'d',['父よ私を憐れみたまえ'],300);
 flush(29201);
 assert.ok(!sent.some(t=>/型/.test(t)),'the misread 「型なるかな」 is never a line: '+JSON.stringify(sent));
 assert.deepEqual(sent,['聖なるかな','父よ私を憐れみたまえ']);
 assert.ok(traces.some(t=>/ocr line superseded/.test(t)),'the single row waits for the rows fading in after it');
 assert.ok(!traces.some(t=>/refused \(a list\)/.test(t)),'the litany is no list');
});

test('vote: a litany votes over every row and reading; distinct rows vote row by row; disagreeing single readings are not trusted',()=>{
 assert.deepEqual(V.vote([['聖なるかな','平なるかな'],['型なるかな','聖なるかな']]),{text:'聖なるかな',rows:['聖なるかな'],repeated:true,voices:4});
 const d=V.vote([['今日は晴れ','明日は雨'],['今日は晴れ','明日は南']]);assert.equal(d.repeated,false);assert.equal(d.text,'今日は晴れ明日は雨','rows joined as the group text is');
 assert.equal(V.confident([['型なるかな']],V.vote([['型なるかな']])),true,'a still picture is read once');
 assert.equal(V.confident([['あいう'],['かきくけ']],{voices:1}),false,'readings that disagree and cannot be voted');
 const a={rows:[{x:300,y:100,w:200,h:40}]},b={rows:[{x:300,y:100,w:200,h:40},{x:300,y:160,w:200,h:40}]};
 assert.equal(V.supersedes(b,a),true);assert.equal(V.supersedes(a,b),false);assert.equal(V.supersedes({rows:[{x:0,y:500,w:100,h:40},{x:0,y:560,w:100,h:40}]},a),false,'elsewhere on the picture');
});
