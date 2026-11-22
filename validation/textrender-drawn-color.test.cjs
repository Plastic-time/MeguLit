// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-19 live 死に逝く君、館に芽吹く憎悪 (KiriKiri TextRender plugin): read lines are drawn yellow, new ones white, but the
   message layer's chColor stays ffffff and no begin/end record exists for TextRender games, so MeguLit kept the yellow it
   learned on read lines into the unread part. The text path now samples the colour of the drawn glyphs and sends it with
   the line (ToMe_CHARS color=), and the reader paints the line with it. Replay of the recorded order: source, then the
   placed line with its colour; first lines read (yellow), then the first unread line (white). */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const tp=require('../core/text-paths.cjs'),{OverlayPlacement}=require('../core/overlay-placement.cjs');

const rec=(line,text,color)=>'ToMe_CHARS engine=krkr line='+line+' hidden=1 sw=1280 sh=720 vx=0 vy=0 vw=0 vh=0 n='+[...text].length+' rects='+
 [...text].map((c,i)=>(330+30*i)+',610,30,30').join(';')+(color?' color='+color:'')+' text='+text;

test('ToMe_CHARS carries an optional glyph colour; records without one parse as before',()=>{
 const a=tp.parseChars(rec(100001,'器物破損。','f7f77b'));assert.equal(a.color,'#f7f77b');assert.equal(a.text,'器物破損。');
 const b=tp.parseChars(rec(100002,'器物破損。'));assert.ok(b);assert.equal('color' in b,false);
 assert.equal(tp.parseChars(rec(100003,'あ','F7F77B')),null,'lower-case hex only, as the script writes it');
});

test('placement passes the colour on with the placed line',()=>{
 const sent=[],p=new OverlayPlacement({send:m=>sent.push(m)});p.configure({textRenderer:'compositor'},{bound:true,layout:{clientWidth:1280,clientHeight:720}});
 p.hook(tp.parseChars(rec(100004,'すると、突然そこから火の玉が現れた。','ffffff')));
 const line=sent.find(m=>m.type==='textPlace'&&m.text);assert.ok(line,'a placed line');assert.equal(line.color,'#ffffff');
});

function reader(prefs={}){
 const classes=new Set(),vars=new Map(),preferences={textColor:'#f7f77b',autoGameStyle:true,...prefs};
 const document={documentElement:{style:{setProperty:(k,v)=>vars.set(k,v),removeProperty:k=>vars.delete(k)}},head:{append(){}},
  body:{classList:{toggle(c,on){on?classes.add(c):classes.delete(c);},contains:c=>classes.has(c)}},
  querySelector:()=>null,querySelectorAll:()=>[],createElement:()=>({}),addEventListener(){}};
 const b={galStatus(){},galPreferences:()=>preferences,galLayoutInfo:()=>({clientWidth:1280,clientHeight:720}),previewGalPosition(){}};
 const window={__tomoyoChinese:b,devicePixelRatio:1,__tomoyoTranslateRequest(){}};
 const ctx={window,document,MutationObserver:class{observe(){}},getComputedStyle:()=>({getPropertyValue:()=>'',fontSize:'28px'}),Date,setTimeout,clearTimeout};
 vm.createContext(ctx);vm.runInContext(read('web/reader/modules/game-style.js'),ctx);window.TomoyoGameStyle=ctx.TomoyoGameStyle;
 for(const f of ['island-source','text-position'])vm.runInContext(read('web/reader/modules/'+f+'.js'),ctx);
 return {b,color:()=>classes.has('tome-line-color')?vars.get('--tomoyo-gal-line-color'):''};
}

test('replay: read yellow lines, then the first unread line is painted white, whichever of source / placed comes first',()=>{
 const r=reader();
 r.b.lineColorFor('「こういったことは、君達には不可能なことだろう？」',80);r.b.lineColorDrawn('「こういったことは、君達には不可能なことだろう？」','#f7f77b');
 assert.equal(r.color(),'#f7f77b');
 /* placed line first, then its source (with the speaker name and a stage note around it) */
 r.b.lineColorDrawn('「て……手品、ですか？」','#ffffff');assert.equal(r.color(),'#f7f77b','another line\'s colour waits for its own source');
 r.b.lineColorFor('【拓海】「て……手品、ですか？」',81);assert.equal(r.color(),'#ffffff');
 /* a new source with no sample yet never keeps the previous line's colour */
 r.b.lineColorFor('そうとしか思えなかった。',82);assert.equal(r.color(),'');
 r.b.lineColorDrawn('そうとしか思えなかった。','#ffffff');assert.equal(r.color(),'#ffffff');
});

test('an engine draw colour that claimed the line still wins over the sampled one',()=>{
 const r=reader(),b=r.b;
 b.lineColorFor('同じ台詞',1);
 b.textPosition({engine:'krkr_adv_v1',line:7,token:7,phase:'end',x0:10,y0:10,x1:100,y1:10,size:28,sw:1280,sh:720,color:'#9d9d9d',sourceToken:globalThis.undefined});
 b.lineColorDrawn('同じ台詞','#ffffff');
 assert.ok(['#ffffff','#9d9d9d'].includes(r.color()));
});

test('the KiriKiri text path samples the drawn glyphs and the reader is wired to it',()=>{
 const s=read('native/krkrtext/script.inc');
 assert.match(s,/st\.trSample=function\(\)\{/);assert.match(s,/T\.getMainPixel\(x,y\)/);assert.match(s,/try \{this\.trSample\(\);\}/);
 assert.match(s,/this\.trTailA\+' color='\+h\+this\.trTailB/);
 assert.match(read('web/reader/modules/text-place.js'),/b\.lineColorDrawn\?\.\(m\.text, m\.color, draw\)/);
});

test('a source with ruby readings or a stage note still matches the drawn line; an unrelated line does not',()=>{
 const r=reader();
 r.b.lineColorFor('瀕死《ひんし》の女の首筋に食らい付こうとしていた',90);r.b.lineColorDrawn('瀕死の女の首筋に食らい付こうとしていた','#ffffff');
 assert.equal(r.color(),'#ffffff');
 r.b.lineColorFor('全く別の台詞です',91);r.b.lineColorDrawn('瀕死の女の首筋に食らい付こうとしていた','#ffffff');
 assert.equal(r.color(),'');
});

test('a page that grew by a sentence matches that sentence, and the script samples the new sentence only',()=>{
 const r=reader();
 r.b.lineColorFor('瀕死の女の首筋に食らい付こうとしていた。',92);
 r.b.lineColorDrawn('死体から腕をもぎ取って燃やしていた。瀕死の女の首筋に食らい付こうとしていた。','#ffffff');
 assert.equal(r.color(),'#ffffff');
 const s=read('native/krkrtext/script.inc');
 assert.match(s,/else if\(flat\.length>this\.trText\.length\+1 && flat\.indexOf\(this\.trText\)==0\) \{from=this\.trText\.length;this\.trCol=void;this\.trTry=0;\}/);
 assert.match(s,/for\(var i=from;i<all\.count && pts\.count<6;i\+\+\) pts\.add\(all\[i\]\);/);
});
