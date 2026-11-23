'use strict';
/* 2026-11-19 (千恋＊万花 maximised with black bars: krkr drew its text invisible, yet the reader stayed in its default style box and
   no log said why). Overlay placement now traces, once per line, whether a reported line was placed (with its first box in
   client px), rejected (boxes vs characters), left to the game (hidden=0) or not placed because placement is off. */
const test=require('node:test'),assert=require('node:assert/strict');
const {OverlayPlacement}=require('../core/overlay-placement.cjs');
test('each placement decision is traced once per line',()=>{
 const traces=[],sent=[];const p=new OverlayPlacement({send:m=>sent.push(m),trace:t=>traces.push(t)});p.wanted=()=>true;
 p.configure({},{bound:true,layout:{clientWidth:1920,clientHeight:1080}});
 const line={type:'hookCharRects',engine:'krkr',line:3,hidden:true,sw:1280,sh:720,viewport:[64,0,1792,1008],rects:[[300,560,28,28],[328,560,28,28]],text:'お客'};
 p.hook(line);p.hook(line);
 assert.equal(traces.filter(t=>t.startsWith('placement placed: line 3, 2 characters')).length,1,JSON.stringify(traces));
 p.hook({...line,line:4,rects:[[300,560,28,28]]});assert.ok(traces.some(t=>t.includes('rejected: line 4 has 1 boxes for 2 characters')));
 p.hook({...line,line:5,hidden:false});assert.ok(traces.some(t=>t.includes('line 5 is drawn by the game itself')));
 p.configure({},{bound:false});p.hook({...line,line:6});assert.ok(traces.some(t=>t.startsWith('placement off: line 6')));
 /* 2026-11-19 (素晴らしき日々, BGI on the GDI glyph path: no trace said why nothing was placed) the glyph path says it too */
 p.glyph({text:'金曜日の昼',seq:7});assert.ok(traces.some(t=>t.startsWith('placement off: glyph line 7')),JSON.stringify(traces));
});
