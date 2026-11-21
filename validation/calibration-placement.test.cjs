process.env.MEGULIT_RELAY_BASE??='off';/* tests never reach the real relay */
// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-15 regression (1.4.9 / 1.4.10, 死に逝く君、館に芽吹く憎悪, KiriKiri): 校准当前句 / 仅校准文字 / 仅校准位置 ended every time with
   「本次校准未完成，已恢复阅读，可手动调整或重试」. Overlay placement (文字显示 = 画进游戏画面, the default since 2026-11-14) kept the game's
   replacement on through the calibration, so the KiriKiri DLL kept drawing the line invisible and the style probe, which measures the
   game's own pixels, never saw the original. 1.4.8 switched the hook to read while calibrating (preflight); that is restored for every
   text path. The Alt+T calibration page also said 「未绑定」 for a bound game when the game was bound before the menu was opened. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {HookNative}=require('../core/hook-native.cjs');
const {HookControl}=require('../core/hook-control.cjs');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

function rig({placement=true,compositor=false,engine='krkr'}={}){
 const sent=[],hook=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-fixture-log'},()=>{},()=>{},()=>1000);
 clearInterval(hook.timer);
 hook.send=m=>sent.push(m);hook.trace=()=>{};
 hook.ownTextFn=()=>placement;hook.compositedFn=()=>compositor;hook.pageMode={engine};
 const state={bound:true,gameProcessId:123,gameStarted:'1',gameHwnd:'456',coverEnabled:true};
 const preferences={hookProfile:'embed',hookHide:true,hookAutoStart:true,bindEnabled:true,maskMode:'hook',autoGameStyle:true};
 hook.process={kill(){}};hook.pid=123;hook.started='1';hook.enabled=true;hook.route='embed';
 const style={statuses:[],status(s){this.statuses.push(s);},begin(){},request(){},publish(){return true;},cancel(){this.cancelled=true;}};
 const host={state,preferences,hooks:hook,styleSync:style,onEvent(){},notify(){},send(){},save(){}};
 const control=new HookControl(host,()=>1000);control.plan='embed';control.running=true;
 hook.configure(preferences,state);sent.length=0;
 return {hook,control,style,sent,switches:()=>sent.filter(m=>m.type==='enable'||m.type==='disable')};
}

/* 2026-11-21 (owner, test pack v5 ファタ: calibration gave way and never came back): a KiriKiri page reports every character's box,
   calibration follows those boxes and never shows the original; the give-way path is kept for engines without boxes */
for(const purpose of ['all','text','position'])test('KiriKiri page: a '+purpose+' calibration follows the engine boxes, no give way',()=>{
 const r=rig();r.control.beginStyleSync(true,purpose);assert.deepEqual(r.switches(),[]);assert.equal(r.hook.enabled,true);assert.equal(r.style.statuses.at(-1),'following');assert.equal(r.control.styleCalibration,false);});
for(const purpose of ['all','text','position']){
 test('overlay placement without engine boxes: a '+purpose+' calibration shows the original, then hiding resumes',()=>{
  const r=rig({engine:''});r.hook.placement=null;
  r.control.beginStyleSync(true,purpose);
  assert.deepEqual(r.switches(),[{type:'disable',reason:'reader-preflight'}],'the game must draw its original while the probe measures it');
  assert.equal(r.hook.enabled,false);
  r.sent.length=0;r.control.finishStyleSync(true);
  assert.deepEqual(r.switches(),[{type:'enable'}],'hiding comes back after the calibration');
  assert.equal(r.style.statuses.at(-1),'applied');
 });
}

test('a cancelled calibration hides again at once',()=>{
 const r=rig({engine:''});r.control.beginStyleSync(true,'all');r.sent.length=0;
 r.control.finishStyleSync(false,true);
 assert.equal(r.style.cancelled,true);
 assert.deepEqual(r.switches(),[{type:'enable'}]);
});

test('capture compositor and plain embed pause the same way; placement between calibrations stays on',()=>{
 for(const opt of [{placement:false,compositor:true,engine:''},{placement:false,engine:''}]){const r=rig(opt);r.control.beginStyleSync(true,'all');assert.deepEqual(r.switches(),[{type:'disable',reason:'reader-preflight'}]);}
 const r=rig();r.hook.preflight=true;/* a KiriKiri baseline preflight outside a calibration does not apply (E472) */r.hook.configure(r.control.host.preferences,r.control.host.state);
 assert.deepEqual(r.switches(),[],'placement keeps the line hidden outside a calibration');
});

test('Alt+T calibration page: the bound window is tracked even while the menu is closed',()=>{
 const gal=read('web/reader/modules/gal.js');
 const status=gal.slice(gal.indexOf('bridge.galStatus = message =>'),gal.indexOf('const paintBoundWindow'));
 assert.match(status,/bridge\.galBoundTitle = message\.gameTitle/,'title kept from every bound message');
 assert.doesNotMatch(status,/if \(boundLabel\) \{[^}]*galBoundTitle = message\.gameTitle/,'never only while the label exists');
 assert.match(gal,/pickLabel\(false\); bridge\.paintBoundWindow\?\.\(\);/,'the label is painted when the menu is built');
 /* run the tracking on its own: bound before the menu opened, then normal interface (bound:false, window still attached), then closed */
 const body=status.slice(status.indexOf('/* 2026-11-15 (1.4.10'),status.lastIndexOf('paintBoundWindow();'));
 const bridge={};const track=new Function('bridge','message',body);
 track(bridge,{type:'bound',bound:true,gameAttached:true,gameHwnd:'456',gameTitle:'死に逝く君、館に芽吹く憎悪'});
 assert.equal(bridge.galBoundTitle,'死に逝く君、館に芽吹く憎悪');
 track(bridge,{type:'bound',bound:false,gameAttached:true,interfaceMode:'normal'});
 assert.equal(bridge.galBoundTitle,'死に逝く君、館に芽吹く憎悪','normal interface keeps the window');
 track(bridge,{type:'bound',bound:false,gameAttached:false});
 assert.equal(bridge.galBoundTitle,'');
 track(bridge,{type:'bound',bound:false,gameProcessId:7,gameHwnd:'99',gameTitle:'x'});
 assert.equal(bridge.galBoundTitle,'x','a window bound in the normal interface is bound');
 track(bridge,{type:'gameClosed',bound:false});
 assert.equal(bridge.galBoundTitle,'');
});
