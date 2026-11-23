// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* #299 / #307 / #311 (Strawberry Nauts, Fate/stay night REMASTERED, ライムライト・レモネードジャム; diagnostics 1.4.14-1.4.15):
   layer 4 sent "ToMe_PAGE ... awake=0 armed=1 gh=0" with every line although it never located a page (the game draws its
   text another way). hook-native took that for "text window gone" and hid the reader 0.1 s after each line came
   (dialogVisibility false reason engine), so the box and, under the hide, the game's own text were both gone.
   A page the layer never located says nothing; a located page that goes to sleep (gh>0) still hides the reader. */
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const tmp=p=>fs.mkdtempSync(path.join(os.tmpdir(),p));

function rig(){
 const {HookNative}=require('../core/hook-native.cjs'),events=[];
 const out=new PassThrough(),child=Object.assign(new EventEmitter(),{stdout:out,stdin:{write:()=>true,on(){}},kill(){}});
 const native=tmp('n-'),hook=tmp('h-');fs.writeFileSync(path.join(native,'HookBridge.exe'),'');for(const n of ['LunaHost64.dll','LunaHook32.dll','LunaHook64.dll'])fs.writeFileSync(path.join(hook,n),'');
 const h=new HookNative({native,hook,logs:tmp('l-')},e=>events.push(e),()=>child,()=>Date.now());clearInterval(h.timer);
 h.start({pid:process.pid,hwnd:'1',name:'Game',started:'1234567890123'});h.process=child;h.send=()=>{};
 const page=line=>out.write(JSON.stringify({type:'hookGpuPage',line})+'\n');
 return {h,events,page,settle:()=>new Promise(r=>setTimeout(r,50))};
}
const TAB='\t';

test('a page the layer never located (gh=0) neither hides the reader nor clears its placed text',async()=>{
 const {events,page,settle}=rig();
 page('ToMe_PAGE sw=1280 sh=720 awake=0 armed=1 gh=0 own=0 ownr='+TAB+'3'+TAB+'46'+TAB+''+TAB+'まだ新しめの学園なだけあって');
 page('ToMe_PAGE sw=1280 sh=720 awake=0 armed=0 gh=0 own=0 ownr=');
 await settle();
 assert.ok(!events.some(e=>e.type==='hookDialog'),'no window state from an unlocated page: '+JSON.stringify(events));
 assert.ok(!events.some(e=>e.type==='hookGpuPage'),'no page for the placement either');
});

test('a located page that goes to sleep still hides the reader (title, text window gone)',async()=>{
 const {events,page,settle}=rig();
 page('ToMe_PAGE sw=1280 sh=720 awake=0 armed=1 gh=41 own=0 ownr=');
 await settle();
 const d=events.find(e=>e.type==='hookDialog');
 assert.ok(d&&d.visible===false&&d.engine==='gpupage',JSON.stringify(events));
 assert.ok(events.some(e=>e.type==='hookGpuPage'));
});

test('a stream with no Japanese keeps the game text and tells the user why, once',()=>{
 const {HookNative}=require('../core/hook-native.cjs');
 const h=Object.create(HookNative.prototype);h.state={};h.pid=42;h.trace=()=>{};h.notify=m=>Object.assign(h.state,m);h.configure=()=>{};h.preferences={};h.windowState={};h.originalText=null;
 for(const l of ['衛宮士郎在這個夜晚遇見了她，命運從此改變','他們說聖杯戰爭已經開始了','少女從魔法陣中走了出來'])h.japaneseGuard(l);
 assert.equal(h.noJapaneseSource,true);assert.equal(h.state.sourceChinese,true);assert.match(h.state.hookMessage,/不会隐藏游戏原字/);
 const g=Object.create(HookNative.prototype);g.state={sourceForeign:true,hookMessage:'x'};g.pid=1;g.trace=()=>{};g.notify=m=>Object.assign(g.state,m);g.configure=()=>{};g.originalText=null;
 for(const l of ['衛宮士郎在這個夜晚遇見了她，命運從此改變','他們說聖杯戰爭已經開始了','少女從魔法陣中走了出來'])g.japaneseGuard(l);
 assert.equal(g.state.hookMessage,'x','an earlier language notice is kept');
});
