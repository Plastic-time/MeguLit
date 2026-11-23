'use strict';
/* 2026-11-19 (user, 素晴らしき日々 on the installed 1.4.17: 「一说话（有语音的句子）字就飞不见了，位置也一直乱跑」). Every voiced 「」 line
   had its first glyph exactly on the client's top edge (reader layoutDiagnostic firstGlyphTop = clientY, on the test copy too):
   its glyph boxes came from a buffer drawn at its own origin, above or on the client's top row. sane() clamped them into the
   client, the line went to the top of the game and learn() made that the anchor for the next estimated lines. Such boxes have
   no place now: the line keeps the reader's box and the anchor stays where the real lines are. Any engine. */
const test=require('node:test'),assert=require('node:assert/strict');
const {OverlayPlacement}=require('../core/overlay-placement.cjs');
const C=[1280,720];
test('sane: boxes above the client or all on its top row are no place; real boxes still are',()=>{
 assert.equal(OverlayPlacement.sane([[300,-40,28,28],[328,-40,28,28]],C),null,'above the client');
 assert.equal(OverlayPlacement.sane([[300,0,28,28],[328,0,28,28],[356,0,28,28]],C),null,'all on the top row');
 assert.deepEqual(OverlayPlacement.sane([[300,560,28,28],[328,560,28,28]],C),[[300,560,28,28],[328,560,28,28]]);
 assert.deepEqual(OverlayPlacement.sane([[300,0,28,28],[300,36,28,28]],C),[[300,0,28,28],[300,36,28,28]],'a page starting at the top with more rows is kept');
 assert.deepEqual(OverlayPlacement.sane([[300,-3,28,28],[328,-3,28,28],[300,30,28,28]],C)[0],[300,0,28,28],'a few px of bearing above the edge is still clamped');
});
function rig(){const traces=[],sent=[];const p=new OverlayPlacement({send:m=>sent.push(m),trace:t=>traces.push(t)});p.wanted=()=>true;
 p.configure({},{bound:true,layout:{clientWidth:C[0],clientHeight:C[1]}});return {p,traces,lines:()=>sent.filter(m=>m.type==='textPlace'&&!m.clear)};}
const dots=(text,x,y)=>[...text].map((ch,i)=>({i,ch,k:'d',h:28,a:28,at:{x:x+i*28,y,space:'c'}}));
test('glyph path: a voiced line drawn at a buffer origin keeps the reader box, the anchor stays on the real lines',()=>{
 const {p,traces,lines}=rig();
 p.glyph({seq:1,text:'金曜日の昼……。',dots:dots('金曜日の昼……。',300,560)});
 assert.ok(lines().at(-1).rects,'narration placed');const anchor={...p.anchorBox};
 p.glyph({seq:2,text:'「ふぅ……」',dots:dots('「ふぅ……」',40,0)});
 assert.equal(lines().at(-1).fallback,true,'voiced line: not at the top of the game');assert.deepEqual(p.anchorBox,anchor,'anchor not taught the top edge');
 assert.ok(traces.some(t=>t.includes('has no box on the game client')),JSON.stringify(traces));
 p.glyph({seq:3,text:'「ヒラヒラ服だわね」',dots:dots('「ヒラヒラ服だわね」',40,-36)});assert.equal(lines().at(-1).fallback,true,'above the client: no place');
 p.glyph({seq:4,text:'　たばこの銘柄',dots:dots('　たばこの銘柄',300,560)});assert.equal(lines().at(-1).rects[0][1],560,'the next real line is placed as before');
});
test('hook path (char rects from the engine): boxes above the client are no place either',()=>{
 const {p,lines}=rig();
 p.hook({type:'hookCharRects',engine:'krkr',line:1,hidden:true,sw:1280,sh:720,rects:[[300,-60,28,28],[328,-60,28,28]],text:'お客'});
 assert.equal(lines().at(-1).fallback,true);
});
/* the lines of the 13:03Z run on the installed 1.4.17 (texts and order as logged); client 1920x1080, the game's back buffer
   1280x720 (frame-shaped), the voiced lines drawn on a line sprite of their own (1024x96) */
const C2=[1920,1080];
function rig2(){const traces=[],sent=[];const p=new OverlayPlacement({send:m=>sent.push(m),trace:t=>traces.push(t)});p.wanted=()=>true;
 p.configure({},{bound:true,layout:{clientWidth:C2[0],clientHeight:C2[1]}});return {p,traces,last:()=>sent.filter(m=>m.type==='textPlace'&&!m.clear).at(-1)};}
const on=(text,x,y,space)=>[...text].map((ch,i)=>({i,ch,k:'d',h:20,a:20,at:{x:x+i*20,y,space}}));
test('13:03Z run: narration on the back buffer is placed; voiced lines on a line sprite are laid out from its anchor, not at the top',()=>{
 const {p,traces,last}=rig2();
 p.glyph({seq:1,text:'　週の終わり、だからこそ',dots:on('　週の終わり、だからこそ',170,505,'m1280x720')});
 const narr=last();assert.ok(narr.rects&&!narr.approx,'narration: exact');assert.equal(Math.round(narr.rects[0][1]),Math.round(505*1.5));
 p.glyph({seq:2,text:'「ふぅ……」',dots:on('「ふぅ……」',0,0,'m1024x96')});
 const v=last();assert.ok(v.rects&&v.approx,'voiced: laid out from the anchor '+JSON.stringify(v));assert.ok(Math.abs(v.rects[0][1]-narr.rects[0][1])<2,'on the dialogue row, not the top: '+v.rects[0][1]);
 assert.ok(traces.some(t=>t.includes('not the frame (m1024x96')),JSON.stringify(traces));
 p.glyph({seq:3,text:'「やっぱり……いい女には、',dots:on('「やっぱり……いい女には、',0,0,'m1024x96')});assert.ok(last().approx&&last().rects[0][1]>500,'next voiced line too');
 p.glyph({seq:4,text:'　たばこの銘柄はマイナーなもの',dots:on('　たばこの銘柄はマイナーなもの',170,505,'m1280x720')});assert.ok(!last().approx,'narration exact again');
});
test('a scene that starts with a voiced line (no anchor yet) keeps the reader box, never the top of the game',()=>{
 const {p,last}=rig2();
 p.glyph({seq:1,text:'「ねぇ……」',dots:on('「ねぇ……」',0,0,'m1024x96')});assert.equal(last().fallback,true);
});
