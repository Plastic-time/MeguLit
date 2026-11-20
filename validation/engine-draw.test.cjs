// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* engine-draw kernel (core/engine-draw.cjs, docs/engine-draw-protocol.md): routing by role, the replacement table and its
   KiriKiri control file, UI items as art-text items, and the hook-native / placement wiring. No game, no app. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const ED=require('../core/engine-draw.cjs'),TP=require('../core/text-paths.cjs'),Profiles=require('../core/profiles/index.cjs');
const prof=draw=>{const p=Profiles.profileFor({});return {...p,draw:{...p.draw,...draw}};};
const fake=()=>{const calls=[];return {calls,write:(cfg,entries)=>calls.push(['write',{...cfg},[...entries.keys()]]),stop:()=>calls.push(['stop'])};};

test('profile defaults: draw.roles / draw.embed off = the behaviour before engine-draw',()=>{
 assert.deepEqual(ED.settings(Profiles.profileFor({})),{roles:false,embed:false,zh:true});
 const t=fake();const d=new ED.EngineDraw({profile:Profiles.profileFor({}),transport:t});
 assert.deepEqual(t.calls,[['stop']],'nothing written, a stale control file removed');
 assert.equal(d.line({text:'今日は',engine:'krkr'}),false,'no replacement asked');
});

test('replacement table: one ask per sentence, newest 64 kept, written through the transport',()=>{
 const t=fake(),asks=[];const d=new ED.EngineDraw({profile:prof({roles:true,embed:true}),transport:t,onAsk:a=>asks.push(a)});
 assert.equal(d.line({text:'今日は\n晴れ',engine:'krkr'}),true);assert.equal(d.line({text:'今日は晴れ',engine:'krkr'}),false,'same key');
 assert.equal(d.line({text:'別',engine:'krkr',emb:2}),false,'the game already drew it');
 assert.deepEqual(asks,[{key:'今日は晴れ',text:'今日は晴れ',engine:'krkr'}]);
 d.put('今日は晴れ',{ruby:[[0,2,'きょう']],zh:'今天晴朗'});
 assert.deepEqual(t.calls.at(-1),['write',{roles:true,embed:true,zh:true},['今日は晴れ']]);
 for(let i=0;i<70;i++)d.put('文'+i,{zh:'x'});assert.equal(d.entries.size,ED.MAX);assert.equal(d.entries.has('今日は晴れ'),false);
});

test('KiriKiri control file: UTF-16LE with BOM, #cfg first, ruby as start:len:reading, Chinese newlines as U+001F',()=>{
 const txt=ED.krkrControlText({roles:true,embed:true,zh:true},new Map([['今日は晴れ',{ruby:[[0,2,'きょう'],[3,4,'は'],[1,1,'bad|']],zh:'今天\n晴朗'}],['a\tb',{zh:'x'}]]));
 assert.equal(txt,'#cfg roles=1 embed=1 zh=1\r\n今日は晴れ\t0:2:きょう|3:1:は\t今天\u001f晴朗\r\n');
 assert.equal(ED.krkrControlText({roles:false,embed:true,zh:false},new Map([['あ',{zh:'啊'}]])),'#cfg roles=0 embed=1 zh=0\r\nあ\t\t\r\n','zh off: the reader draws the Chinese');
 const tmp=fs.mkdtempSync(path.join(process.env.MEGULIT_TEST_TMP||os.tmpdir(),'megulit-ed-'));
 const tr=new ED.KrkrTransport(4242,{tmp});tr.flush({roles:true,embed:false,zh:true},new Map());
 const b=fs.readFileSync(path.join(tmp,'MeguLit','draw','4242.txt'));assert.deepEqual([...b.subarray(0,2)],[0xff,0xfe]);
 assert.equal(b.subarray(2).toString('utf16le'),'#cfg roles=1 embed=0 zh=1\r\n');
 assert.equal(ED.krkrControlPath(4242,tmp),path.join(tmp,'MeguLit','draw','4242.txt'),'the path KrkrText.cpp builds from GetTempPath');
 tr.stop();assert.equal(fs.existsSync(path.join(tmp,'MeguLit','draw','4242.txt')),false,'removed when the game goes');
});

test('UI items: rows from rects or box, a newer snapshot replaces the older one, an empty one clears the group',()=>{
 const later=[],defer=[];const t=new ED.UiTracker({defer:fn=>defer.push(fn)});
 const rec=s=>TP.parseChars(s);
 const a=t.feed(rec('ToMe_CHARS engine=krkr line=1 hidden=0 sw=1280 sh=720 vx=0 vy=0 vw=0 vh=0 n=2 rects=100,560,28,28;128,560,28,28 role=choice id=L0:0 box=100,560,56,28 text=はい'),g=>later.push(...g));
 const b=t.feed(rec('ToMe_CHARS engine=krkr line=1 hidden=0 sw=1280 sh=720 vx=0 vy=0 vw=0 vh=0 n=3 rects=100,600,28,28;128,600,28,28;156,600,28,28 role=choice id=L0:1 box=100,600,84,28 text=いいえ'),g=>later.push(...g));
 assert.deepEqual(a[0],{type:'artText',id:'ui:choice:L0:L0:0',visible:true,source:'engine',role:'choice',text:'はい',rows:[{text:'はい',x:100,y:560,w:56,h:28}],sw:1280,sh:720});
 assert.equal(b[0].rows[0].w,84);
 const btn=t.feed(rec('ToMe_CHARS engine=krkr line=2 hidden=0 sw=1280 sh=720 vx=0 vy=0 vw=0 vh=0 n=0 rects= role=button id=B0 box=1100,20,120,40 text=セーブ'),g=>later.push(...g));
 assert.deepEqual(btn[0].rows,[{text:'セーブ',x:1100,y:20,w:120,h:40}],'a box-only item is one row over its box');
 assert.equal(t.feed(rec('ToMe_CHARS engine=krkr line=2 hidden=0 sw=1280 sh=720 vx=0 vy=0 vw=0 vh=0 n=0 rects= role=button id=B0 box=1100,20,120,40 text=セーブ')).length,0,'unchanged: nothing new');
 /* the next snapshot of the choices keeps only はい */
 t.feed(rec('ToMe_CHARS engine=krkr line=3 hidden=0 sw=1280 sh=720 vx=0 vy=0 vw=0 vh=0 n=2 rects=100,560,28,28;128,560,28,28 role=choice id=L0:0 box=100,560,56,28 text=はい'),g=>later.push(...g));
 defer.splice(0).forEach(f=>f());
 assert.deepEqual(later,[{type:'artText',id:'ui:choice:L0:L0:1',visible:false}]);
 t.feed(rec('ToMe_CHARS engine=krkr line=4 hidden=0 sw=1280 sh=720 vx=0 vy=0 vw=0 vh=0 n=0 rects= role=choice id=L0: box=0,0,0,0 text='),g=>later.push(...g));
 defer.splice(0).forEach(f=>f());
 assert.deepEqual(later.at(-1),{type:'artText',id:'ui:choice:L0:L0:0',visible:false},'empty snapshot clears the group');
});

test('hook-native: UI records never reach the dialogue path; a KiriKiri line asks for its replacement only with draw.embed',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','core','hook-native.cjs'),'utf8');
 const {HookNative}=require('../core/hook-native.cjs');
 const proto=HookNative.prototype,events=[];
 const h=Object.create(proto);Object.assign(h,{emit:e=>events.push(e),now:()=>1,state:{gameProcessId:0},profile:Profiles.profileFor({})});
 h.charRects('ToMe_CHARS engine=krkr line=1 hidden=0 sw=1280 sh=720 vx=0 vy=0 vw=0 vh=0 n=0 rects= role=button id=B0 box=1,2,3,4 text=セーブ');
 assert.equal(events[0].type,'hookDrawUi');assert.equal(events.length,1);
 h.charRects('ToMe_CHARS engine=krkr line=2 hidden=1 sw=1280 sh=720 vx=0 vy=0 vw=0 vh=0 n=1 rects=1,2,3,4 text=あ');
 assert.equal(events[1].type,'hookCharRects');assert.equal(h.engineDraw,undefined,'no game process: nothing kept');
 assert.ok(src.includes("onAsk:a=>this.emit({type:'hookDrawEmbed',...a})"));
 const gal=fs.readFileSync(path.join(__dirname,'..','core','gal-native.cjs'),'utf8');assert.ok(gal.includes("message.type==='hookDrawEmbed'||message.type==='hookDrawUi'"));
});

test('placement: a line the game drew with MeguLit\'s replacement goes to the reader as embedded, once per emb level',()=>{
 const {OverlayPlacement}=require('../core/overlay-placement.cjs');
 const sent=[],p=new OverlayPlacement({send:m=>sent.push(m)});p.configure({textRenderer:'compositor'},{bound:true,layout:{clientWidth:1280,clientHeight:720}});
 const line='ToMe_CHARS engine=krkr line=5 hidden=0 sw=1280 sh=720 vx=0 vy=0 vw=0 vh=0 n=2 rects=60,520,28,28;88,520,28,28 text=今日';
 p.hook(TP.parseChars(line));p.hook(TP.parseChars(line.replace(' text=',' emb=2 text=')));p.hook(TP.parseChars(line.replace(' text=',' emb=2 text=')));
 const vis=sent.filter(m=>m.type==='textPlace'&&m.visible);
 assert.deepEqual(vis.map(m=>m.embedded),[undefined,2]);
 const place=fs.readFileSync(path.join(__dirname,'..','web','reader','modules','text-place.js'),'utf8');
 assert.ok(place.includes("body.megulit-place-game-drawn.megulit-game-embedded .sentence-window.tomoyo-hook-reader .tomoyo-cn-row{visibility:hidden!important}"));
});
