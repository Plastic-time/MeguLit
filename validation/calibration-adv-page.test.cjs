// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
process.env.MEGULIT_RELAY_BASE??='off';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const {HookNative}=require('../core/hook-native.cjs'),{HookControl}=require('../core/hook-control.cjs'),{GameStyleSync}=require('../core/game-style-sync.cjs'),{Reader}=require('../services/reader.cjs');
const A='「中性の第一文です。」',B='「中性の第二文です。」',C='「中性の第三文です。」',D='「中性の第四文です。」';
function hook(){let now=1000;const events=[],h=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-fixture-log'},m=>events.push(m),()=>{},()=>now);clearInterval(h.timer);h.trace=()=>{};h.send=()=>{};h.state={...h.state,hookActive:true,receivedText:true};return {h,events,feed:t=>{now+=1600;h.emitSource(t,'live');}};}
for(const kind of ['redraw','wrapped'])test('an ADV '+kind+' never establishes a multi-sentence page',()=>{
 const {h,events,feed}=hook();feed(A);feed(B);if(kind==='redraw')feed(B);else h.auxPage({text:'「中性の第二\n文です。」',sourceName:'TextRender'});feed(C);feed(D);assert.equal(h.pageText.pages,false,kind);assert.equal(events.filter(m=>m.type==='hookPage').length,0,kind);assert.equal(events.filter(m=>m.hookSource).length,4);
});
test('two retained distinct sentences establish a real page; an established page still reports a turn',()=>{
 const {h,events,feed}=hook();feed(A);feed(B);h.auxPage({text:A+'\n'+B,sourceName:'TMP_Text'});feed(C);assert.equal(h.pageText.pages,true);assert.equal(events.filter(m=>m.type==='hookPage').at(-1).same,true);h.auxPage({text:C+'\n',sourceName:'TMP_Text'});assert.ok(events.some(m=>m.type==='hookPage'&&m.reset===true));
});
test('a previous short line contained in the wrapped current sentence is not a second retained sentence',()=>{
 const {h,events,feed}=hook();feed('「はい」');feed('「はい」、その声に返事をした。');h.auxPage({text:'「はい」、その声に\n返事をした。',sourceName:'TextRender'});feed(C);assert.equal(h.pageText.pages,false);assert.equal(events.filter(m=>m.type==='hookPage').length,0);
});
for(const decoration of ['speaker','speaker-and-suffix','repeated-current'])test('wrapped current sentence with '+decoration+' cannot reuse its contained previous line as NVL evidence',()=>{
 const {h,events,feed}=hook(),prev='「はい」',cur='「はい」、その声に返事をした。';feed(prev);feed(cur);const wrapped='「はい」、その声に\n返事をした。';const text=decoration==='speaker'?'【将臣】\n'+wrapped:decoration==='speaker-and-suffix'?'【将臣】\n'+wrapped+'\n▼':'【将臣】\n'+wrapped+'\n'+wrapped;h.auxPage({text,sourceName:'TextRender'});feed(C);assert.equal(h.pageText.pages,false);assert.equal(events.filter(m=>m.type==='hookPage').length,0);
});
for(const order of ['before','after'])test('an independent previous short line '+order+' the current sentence still establishes a real page',()=>{
 const {h,events,feed}=hook(),prev='「はい」',cur='「はい」、その声に返事をした。';feed(prev);feed(cur);h.auxPage({text:'【将臣】\n'+(order==='before'?prev+'\n'+cur:cur+'\n'+prev),sourceName:'TextRender'});assert.equal(h.pageText.pages,true);feed(C);assert.equal(events.filter(m=>m.type==='hookPage').at(-1).same,true);
});
test('native KiriKiri NVL reports remain authoritative, including real same-page and new-page reports',()=>{
 const {h,events}=hook();for(const [i,text]of[A,B,C].entries())h.pageLine({engine:'krkr',line:i+1,phase:'end',nvl:true,same:i===1,text,sw:1280,sh:720,x0:20,y0:30+i*40,x1:900,y1:60+i*40,size:24,count:text.length});assert.equal(h.pageMode.mode,'nvl');assert.deepEqual(events.filter(m=>m.type==='hookPage'&&m.token!==0).map(m=>m.same),[false,true,false]);
});
function calibration(t){
 t.mock.timers.enable({apis:['setTimeout']});const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-calibration-adv-'));fs.writeFileSync(path.join(dir,'GameStyleProbe.exe'),'fixture');const r=hook(),events=[],child=new EventEmitter();child.stdout=new PassThrough();child.stdin=new PassThrough();child.kill=()=>{child.killed=true;child.emit('exit',0);};
 const style=new GameStyleSync({native:dir,config:dir},m=>{events.push(m);if(m.gameStyleState==='measured')control.finishStyleSync(true);else if(['timeout','unavailable','unmatched'].includes(m.gameStyleState))control.finishStyleSync(false);},()=>child),state={bound:true,gameProcessId:123,gameStarted:'1',gameHwnd:'456',coverEnabled:true},preferences={hookProfile:'embed',hookHide:true,hookAutoStart:true,bindEnabled:true,maskMode:'hook',autoGameStyle:true};
 const host={hooks:r.h,styleSync:style,state,preferences,onEvent:m=>events.push(m),notify(){},send(){},save(){},placement:{current:null}},control=new HookControl(host,()=>1000);control.running=true;control.plan='embed';r.h.ownTextFn=()=>true;r.h.compositedFn=()=>false;r.h.process={};r.h.pid=123;r.h.started='1';r.h.enabled=true;r.h.route='embed';r.h.configure(preferences,state);style.configure(preferences,state);r.feed(A);r.feed(B);style.observe(B);t.after(()=>{control.finishStyleSync(false,true);style.stop();child.stdout.end();child.stdin.end();fs.rmSync(dir,{recursive:true,force:true});});return {...r,style,control,child,events};
}
// Use the installed version identities. The helper reply is controlled so we can put it on either side of the baseline cap.
const manualCases = [
 ['clannad','116a1b6ab5902bb6dc49e25086b1ef6f07d941dbb090b497fb7a158e997dea2d',1050,'glyph'],
 ['senren-banka','fd37d708774f8f45fa32375ec067f58c04038e17fc1c4e5180e9eed9092434d3',2035,'fallback'],
 ['magical-girl-witch-trials','8bccd5415151accc86f2f6e093b45fac29da2a7bfdf06df953e62edf5b17c5be',1355,'none'],
 ['summer-pockets','c9c5d963570f417620a445828c8c66a12718430726e81ad8b7e5d2f4fd0f392a',250,'none'],
 ['doki-doki-literature-club-plus','b17b6a1e21e7beae66b256da045c02a5bf624e0c3ed3d7590167ee4d2f3cb7c5',250,'none']
];
for(const [game,key,advanceMs,placement] of manualCases)test(game+' manual calibration waits for a visible line, measures and restores hiding',async t=>{
 const r=calibration(t),gal=r.control.host;
 r.h.profile=require('../core/profiles/index.cjs').profileFor({exeSha256:key});
 assert.equal(r.h.profile.gameKey,game);
 gal.state.gameStyleKey=key;
 r.style.configure(gal.preferences,gal.state);
 if(placement==='glyph')gal.placement.current={engine:'glyph',text:B,rects:[[20,500,30,30]]};
 if(placement==='fallback')gal.placement.current={fallback:true,text:B};
 const reader={active:()=>true,gal:{...gal,controller:r.control}};
 await Reader.prototype.message.call(reader,{type:'gameStyleSync',key,part:'all',owner:'reader'});
 assert.equal(r.control.styleCalibration,true);
 t.mock.timers.tick(advanceMs);
 assert.equal(r.style.waitNext,true);
 r.control.source(C);r.style.observe(C);
 t.mock.timers.tick(500);
 const capture=r.style.pending;
 assert.equal(capture?.request.source,C);
 assert.equal(capture.sent,true);
 t.mock.timers.tick(advanceMs<1000?300:1200);
 r.child.stdout.write(JSON.stringify({id:capture.id,result:{valid:true,width:1280,height:720,inkLeft:120,inkTop:480,style:{x:9.375,y:66.67,width:48,japaneseSize:30,textColor:'#ffffff'}}})+'\n');
 const measured=r.events.find(m=>m.gameStyleState==='measured');
 assert.equal(measured?.gameStyleOwner,'reader');assert.equal(measured?.gameStyle.inkLeft,120);
 assert.deepEqual(r.events.filter(m=>'gameStyleReveal' in m).map(m=>m.gameStyleReveal),[true,false]);
 assert.equal(r.control.styleCalibration,false);assert.equal(r.h.enabled,true);assert.equal(r.h.route,'embed');
 assert.equal(r.style.profile,null,'preview does not create a saved profile');
 await Reader.prototype.message.call(reader,{type:'gameStyleConfirm',key,part:'position',prefs:{x:9.375,y:66.67,width:60},saveId:'confirmed'});
 const dir=r.style.layout.config;
 fs.writeFileSync(path.join(dir,'gal-preferences.json'),JSON.stringify(gal.preferences));
 const {GalNative}=require('../core/gal-native.cjs');
 const reopened=new GalNative({native:dir,hook:dir,config:dir,logs:dir},0,()=>{});
 clearInterval(reopened.hooks.timer);clearInterval(reopened.artScanTimer);
 // Keep the process boundary offline; configuration and route selection still run in HookNative.
 reopened.hooks.start=()=>{};reopened.hooks.send=()=>{};
 Object.assign(reopened.hooks,{pid:gal.state.gameProcessId,started:'2',process:{kill(){}},enabled:false,route:'read'});
 try{
  reopened.state={...reopened.state,...gal.state,gameStarted:'2'};
  reopened.save(reopened.preferences,false); // bound handler loads the version-keyed profile before attaching
  assert.deepEqual(reopened.styleSync.profile.prefs,{x:9.375,y:66.67,width:60});
  assert.equal(reopened.preferences.width,60);
  assert.equal(reopened.hooks.preflight,false,'saved settings skip the launch baseline');
  reopened.controller.source(D);
  assert.notEqual(reopened.controller.styleCalibration,true);assert.equal(reopened.controller.stage,'hidden');
  assert.equal(reopened.styleSync.latest?.profile,true);
 }finally{reopened.hooks.process=null;await reopened.stop();}
});
for(const terminal of ['give-way-cap','cancel','timeout'])test('wrapped ADV during calibration -> '+terminal+' -> next dialogue; stale helper/capture/timeout cannot apply',t=>{
 const r=calibration(t);r.control.beginStyleSync(terminal!=='give-way-cap','all');r.style.observe(C);r.feed(C);t.mock.timers.tick(500);const pending={...r.style.pending};assert.ok(pending.id);r.h.auxPage({text:'「中性の第三\n文です。」',sourceName:'TextRender'});
 if(terminal==='give-way-cap')t.mock.timers.tick(1500);else if(terminal==='cancel')r.control.finishStyleSync(false,true);else{r.h.preflight=false;clearTimeout(r.h.giveWayTimer);r.h.giveWayTimer=null;t.mock.timers.tick(8000);}
 assert.equal(r.control.styleCalibration,false);assert.equal(r.h.preflight,false);assert.equal(r.h.calibrating,false);assert.equal(r.style.pending,null);assert.ok(r.style.generation>pending.generation);assert.equal(r.style.captureReady(pending.id),false);assert.equal(r.h.enabled,true);
 const before=r.events.filter(m=>m.gameStyleState==='measured').length;r.child.stdout.write(JSON.stringify({id:pending.id,result:{valid:true,width:1280,height:720,style:{x:40,y:30,width:50,textColor:'#ffffff'}}})+'\n');t.mock.timers.tick(10000);assert.equal(r.events.filter(m=>m.gameStyleState==='measured').length,before);r.feed(D);assert.equal(r.h.pageText.pages,false);assert.equal(r.events.filter(m=>m.type==='hookPage').length,0);assert.ok(r.style.latest==null);
});
test('a stale 8s timeout callback cannot kill a later helper request',t=>{
 const r=calibration(t);r.style.begin();let late;const old=setTimeout;global.setTimeout=(fn,ms,...args)=>{if(ms===8000)late=fn;return old(fn,ms,...args);};try{r.style.sample();}finally{global.setTimeout=old;}assert.equal(typeof late,'function');r.style.cancel();r.style.begin();r.style.sample();const next=r.style.pending;late();assert.equal(r.style.pending,next);assert.equal(r.child.killed,undefined);
});
test('explicit speaker-only auxiliary text is metadata, while an ordinary short dialogue is not guessed to be a name',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {h}=hook(),art=[];h.artCandidate=s=>art.push(s);h.auxText({text:'【 女性 】',sourceName:'TextRender',role:0});t.mock.timers.tick(200);assert.equal(h.speaker?.text,'女性');assert.deepEqual(art,[]);h.auxText({text:'待って',sourceName:'TextRender',role:0});t.mock.timers.tick(200);assert.deepEqual(art,['待って']);
});
test('engine name items retain Japanese and lookup rows but never translate; old async art cannot overwrite their empty translation',async()=>{
 let finish,calls=0;const events=[],rows=[{text:'女性',x:10,y:20,w:80,h:24}],r={emit:(type,m)=>events.push(m),targetLanguage:()=> 'zh',embedCached:()=>'',baseOptions:()=>({}),chainTranslate:()=>++calls===1?new Promise(resolve=>{finish=resolve;}):Promise.resolve({text:'名字不应翻译'})};
 const old=Reader.prototype.artText.call(r,{id:'ui:N',visible:true,source:'engine',role:'system',text:'中性テスト'});assert.equal(typeof finish,'function');await Reader.prototype.artText.call(r,{id:'ui:N',visible:true,source:'engine',role:'name',text:'女性',rows});finish({text:'迟到的旧翻译'});await old;const last=events.at(-1);assert.equal(calls,1);assert.equal(last.role,'name');assert.equal(last.text,'女性');assert.equal(last.rows,rows);assert.equal(last.translation,'');assert.deepEqual(last.rowTranslations,[]);assert.ok(!events.some(e=>e.translation==='迟到的旧翻译'));
});
