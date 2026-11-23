// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {PassThrough}=require('node:stream');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {HookNative}=require('../core/hook-native.cjs');
const {Matcher}=require('../services/original-text.cjs');
const {Reader}=require('../services/reader.cjs');

function reader(t){
 const events=[];
 const hook=new HookNative({native:__dirname},event=>events.push(event));
 clearInterval(hook.timer);
 hook.trace=()=>{};
 t.after(()=>hook.stop());
 return {hook,events};
}

test('a quick CLANNAD advance cannot publish a vanished script suffix as a body line',t=>{
 const {hook,events}=reader(t);
 const lines=['そう、雪だ。','雪に埋もれた…僕の手。','山を迂回しての登校。','ひとりきりの登校。'];
 const script=new Matcher(lines,lines);
 hook.originalText={near:text=>lines[script.near(text)],ocrSuffix:text=>script.ocrSuffix(text)};
 // The owner scan at 09:44:55.714 and 09:45:03.516 lost each group on its next picture.
 function scan(id,text,y=800){
  hook.ocrLine({source:'ocr',id,visible:true,once:true,text,rows:[{text,x:240,y,w:140,h:30}],sw:1243,sh:933});
  hook.ocrFlush();
 }
 scan(1,'そう、雪だ。');
 scan(2,'・・僕の手。');
 scan(3,'の登校。');
 assert.deepEqual(events.filter(e=>e.hookSource).map(e=>e.hookSource),['そう、雪だ。']);
 assert.equal(hook.state.processAttached,false);
 assert.equal(hook.state.streamSelected,false);
 scan(4,'の登校。',100);
 assert.equal(hook.state.hookSource,'の登校。','picture text outside the dialogue box remains available');
 hook.sourcePage({type:'hookSource',origin:'live',sourceName:'EmbedSiglus',text:lines[1]},'SiglusEngine_Steam');
 assert.equal(hook.state.hookSource,lines[1]);
 assert.equal(hook.state.streamSelected,true);
});

test('an independently scripted short answer is retained even when another line ends with it',()=>{
 const lines=['僕の手。','雪に埋もれた…僕の手。','今日は一緒に登校。'];
 const script=new Matcher(lines,lines);
 assert.equal(script.ocrSuffix('僕の手。'),false);
 assert.equal(script.ocrSuffix('の登校。'),false);
 assert.equal(script.last,-1);
});

test('a bridge completing native teardown and its stdout drain permits the next game to attach',async t=>{
 const {hook}=reader(t);
 t.mock.timers.enable({apis:['setTimeout']});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'siglus-rebind-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 for(const name of ['HookBridge.exe','LunaHost64.dll','LunaHook32.dll','LunaHook64.dll'])fs.writeFileSync(path.join(dir,name),'');
 hook.folder=dir;
 hook.layout={native:dir,hook:dir,logs:dir};
 t.mock.method(HookNative,'fetchRuntimeDump',()=>{});
 const bridge=new EventEmitter();
 bridge.stdin=new PassThrough();
 bridge.exitCode=null;
 bridge.kill=()=>{bridge.signalCode='SIGTERM';bridge.emit('exit',null,bridge.signalCode);};
 hook.process=bridge;
 const stopped=hook.stop(false);
 const prefs={hookAutoStart:true,bindEnabled:true,hookHide:true,maskMode:'hook',hookProfile:'embed'};
 const bound={bound:true,processName:'SiglusEngine_Steam',gameProcessId:19944,gameStarted:'639309374706361754',gameHwnd:'2491706'};
 const child=new EventEmitter();
 child.stdin=new PassThrough();
 child.stdout=new PassThrough();
 child.stdin.on('finish',()=>{child.exitCode=0;child.emit('exit',0);});
 let starts=0;
 hook.spawn=(_exe,args)=>{starts++;assert.equal(args[0],'19944');return child;};
 hook.configure(prefs,bound);
 assert.equal(starts,0);
 // Native disconnect and releasing the hide layers took nearly two seconds in the owner log.
 // ProcessExit may still drain stdout for up to two more seconds.
 t.mock.timers.tick(3200);
 assert.equal(bridge.signalCode,undefined);
 bridge.exitCode=0;
 bridge.emit('exit',0,null);
 await stopped;
 assert.equal(hook.stopError,null);
 hook.tick();
 assert.equal(starts,1);
 const code='EXHWXN0@1DDAA0:SiglusEngine_Steam.exe';
 const message=m=>child.stdout.write(JSON.stringify(m)+'\n');
 message({type:'hookMemory',name:'EmbedSiglus',code});
 message({type:'hookSource',origin:'live',sourceName:'EmbedSiglus',sourceCode:code,text:'一面、白い世界…'});
 assert.equal(hook.remembered.code,code);
 assert.equal(hook.state.hookSource,'一面、白い世界…');
 assert.equal(hook.route,'embed');
 hook.preflight=hook.calibrating=true;
 hook.configure(prefs,bound);
 assert.equal(hook.route,'read');
 hook.preflight=hook.calibrating=false;
 hook.configure(prefs,bound);
 assert.equal(hook.route,'embed');
 assert.equal(starts,1);
 await hook.stop();
});

test('the recorded failed bridge shutdown blocks replacement only until the old game and helper are gone',async t=>{
 const {hook,events}=reader(t);
 t.mock.timers.enable({apis:['setTimeout']});
 let now=20000;
 hook.now=()=>now;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'reader-reopen-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 for(const file of ['HookBridge.exe','LunaHost64.dll','LunaHook32.dll','LunaHook64.dll'])fs.writeFileSync(path.join(dir,file),'');
 hook.folder=dir;
 hook.layout={native:dir,hook:dir,logs:dir};
 t.mock.method(HookNative,'fetchRuntimeDump',()=>{});
 const gone=new Set();
 t.mock.method(HookNative,'gameProcessGone',pid=>gone.has(pid));
 const sessions=[
  {gameProcessId:64212,gameStarted:'639309406000000000',gameHwnd:'100',processName:'SiglusEngine_Steam'},
  {gameProcessId:20668,gameStarted:'639309410009754317',gameHwnd:'4850222',processName:'SiglusEngine_Steam'},
  {gameProcessId:38476,gameStarted:'639309417529370981',gameHwnd:'47976896',processName:'kag'},
  {gameProcessId:75288,gameStarted:'639309411832173120',gameHwnd:'5505582',processName:'SiglusEngine_Steam'},
 ];
 const prefs={hookAutoStart:true,bindEnabled:true,hookHide:false,maskMode:'hook',hookProfile:'read'};
 const bind=(session,preferences=prefs)=>hook.configure(preferences,{...session,bound:true});
 const close=()=>hook.configure(prefs,{bound:false,gameProcessId:0,gameStarted:'',gameHwnd:''});
 const starts=[];
 const requests=[];
 let child;
 hook.spawn=(_exe,args)=>{
  starts.push(Number(args[0]));
  child=Object.assign(new EventEmitter(),{stdin:new PassThrough(),stdout:new PassThrough(),exitCode:null,signalCode:null,kill(){}});
  child.stdin.on('data',data=>requests.push({pid:Number(args[0]),...JSON.parse(data)}));
  if(starts.length>1)child.stdin.on('finish',()=>{child.exitCode=0;child.emit('exit',0,null);});
  return child;
 };
 const push=(m,bridge=child)=>bridge.stdout.write(JSON.stringify(m)+'\n');
 const advance=(text,options={})=>{now+=1500;push({type:'hookSource',sourceName:'scenario',origin:'live',text,...options});};
 const shown=()=>events.filter(event=>typeof event.hookSource==='string').map(event=>event.hookSource);
 const reselect=()=>Reader.prototype.message.call({active:()=>true,gal:{hooks:hook}},{type:'hookReselect'});
 bind(sessions[0]);
 close();
 const old=child;
 const failed=assert.rejects(hook.stopPending,/READER_STOP_INCOMPLETE/);
 t.mock.timers.tick(8000);
 old.signalCode='SIGTERM';
 old.emit('exit',null,'SIGTERM');
 await failed;

 bind(sessions[1]);
 hook.tick();
 assert.deepEqual(starts,[64212],'an abnormal bridge exit can leave hooks in a live game');
 gone.add(64212);
 hook.tick();
 await hook.stopPending;
 hook.tick();
 assert.deepEqual(starts,[64212,20668]);
 assert.equal(hook.stopError,null);
 advance('今なお、それは降り続け、僕の体を白く覆っている。');
 const first=child;
 close();
 await hook.stopPending;
 bind(sessions[2],{...prefs,hookProfile:'embed',hookHide:true});
 assert.equal(hook.route,'embed');
 assert.ok(requests.some(m=>m.pid===38476&&m.type==='enable'));
 advance('ロッキングチェアーに揺られていた。');
 push({type:'hookStatus',processAttached:true,streamSelected:true,receivedText:true,replacementState:'callback-acknowledged'});
 assert.equal(hook.state.replacementState,'callback-acknowledged');
 const second=child;
 close();
 await hook.stopPending;
 bind(sessions[3]);
 assert.deepEqual(starts,[64212,20668,38476,75288]);
 assert.equal(hook.ownedStops.size,0);
 advance('そう、雪だ。');
 await Promise.all([reselect(),reselect()]);
 const probes=()=>requests.filter(m=>m.type==='probeStreams');
 assert.deepEqual(probes(),[{pid:75288,type:'probeStreams',id:1}]);
 assert.equal(hook.state.hookReselectState,'waiting');
 push({type:'hookSource',origin:'live',streamProbe:1,text:'上局迟到的台词。'},second);
 push({type:'hookSource',origin:'live',streamProbe:1,text:'さらに古い台詞。'},first);
 push({type:'hookSource',origin:'history',streamProbe:1,text:'履歴にあった台詞。'});
 push({type:'hookStatus',processAttached:true,streamSelected:true,receivedText:true});
 assert.equal(hook.state.receivedText,false);
 assert.equal(hook.state.hookReselectState,'waiting');
 assert.equal(shown().at(-1),'そう、雪だ。');
 const lines=['俺たちは登り始める。','ひとりきりの登校。','「じゃあ、聴くなっ」'];
 for(const text of lines){
  advance(text,{streamProbe:1});
  assert.equal(shown().at(-1),text);
 }
 assert.equal(hook.state.hookReselectState,'recovered');
 assert.deepEqual(shown().slice(-3),lines);
 assert.equal(hook.preferences,prefs);
 // The same button also resumes an attach that was previously given up, without restarting the reader.
 child.exitCode=1;
 child.emit('exit',1,null);
 hook.gaveUp='75288|639309411832173120';
 hook.retryAt=Infinity;
 await reselect();
 assert.deepEqual(starts,[64212,20668,38476,75288,75288]);
 assert.deepEqual(probes().at(-1),{pid:75288,type:'probeStreams',id:2});
 advance('「こっちです」',{streamProbe:1});
 assert.equal(hook.state.hookReselectState,'waiting');
 advance('もう一度、階段を上った。',{streamProbe:2});
 assert.equal(hook.state.hookReselectState,'recovered');
 await hook.stop();
});
