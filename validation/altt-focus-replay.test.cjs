'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Immersion}=require('../core/immersion.cjs');
const {Reader}=require('../services/reader.cjs');
const {GalNative}=require('../core/gal-native.cjs');

function replayHost(){
 let now=1000;
 const visibility=[],native=[],configured=[];
 const immersion=new Immersion(m=>visibility.push(m),()=>now);
 immersion.configure({immersion:true,dialogDetection:'marker'});immersion.bind('game-window');
 immersion.source('同じ台詞を読み続けている','krkr');
 const gal={preferences:{hookProfile:'embed',hookHide:true,hookAutoStart:true,hookFast:true,bindEnabled:true,gameProcess:'fixture',x:10,y:25,width:90},state:{bound:true},previewPreferences:null,
  hooks:{configure:p=>configured.push(p.hookProfile)},styleSync:{configure(){}},compositor:{configure(){}},placement:{configure(){}},send:m=>native.push(m)};
 gal.hookPrefs=GalNative.prototype.hookPrefs.bind(gal);gal.preview=GalNative.prototype.preview.bind(gal);gal.endPreview=GalNative.prototype.endPreview.bind(gal);
 const reader=Object.assign(Object.create(Reader.prototype),{immersion,gal,runtime:{config:()=>({immersion:true,dialogDetection:'marker'}),services:()=>({gameEvent:async()=>{}}),emit(){}}});
 return {reader,immersion,visibility,native,configured,advance(ms){now+=ms;immersion.tick();},event(message){reader.event(message);}};
}

test('20 focus-loss / focus-return / Alt+T open-close cycles never hide the current subtitle',async()=>{
 const h=replayHost();h.advance(500);h.event({type:'markerPresence',present:true});
 for(let round=0;round<20;round++){
  h.event({type:'readerInput',complete:true,skipHeld:false});
  h.event({type:'markerPresence',present:false});
  h.event({type:'readerContext',active:false});
  h.advance(10000);
  h.event({type:'markerPresence',present:true});
  h.event({type:'waitMarkerDrawn'});
  h.event({type:'readerContext',active:true});
  h.event({type:'markerPresence',present:false});
  h.advance(1000);
  await h.reader.message({type:'galMenu',open:true});
  h.event({type:'readerContext',active:false});
  await h.reader.message({type:'galPreview',settings:{...h.reader.gal.preferences,hookProfile:'read',x:40}});
  h.event({type:'markerPresence',present:true});
  h.event({type:'waitMarkerDrawn'});h.advance(10000);
  const ended=await h.reader.message({type:'galPreviewEnd'});
  assert.equal(ended.replies[0].method,'restoreGalSettings');
  assert.equal(ended.replies[0].args[0].hookProfile,'embed');
  await h.reader.message({type:'galMenu',open:false});
  h.event({type:'readerContext',active:true});
  h.event({type:'markerPresence',present:false});h.advance(10000);
  assert.equal(h.immersion.visible,true,`round ${round+1}`);
  assert.equal(h.reader.gal.preferences.hookProfile,'embed');
  assert.equal(h.reader.gal.previewPreferences,null);
  h.event({type:'markerPresence',present:true});
 }
 assert.deepEqual(h.visibility,[],'neither the page nor native layer receives a hide');
 assert.equal(h.native.filter(m=>m.type==='menu'&&m.open).length,20);
 assert.equal(h.native.filter(m=>m.type==='menu'&&!m.open).length,20);
 assert.ok(h.configured.length>=40);assert.ok(h.configured.every(p=>p==='embed'));
});

test('a pending visual/auto hide from the old context cannot expire under the menu',async()=>{
 const h=replayHost();h.immersion.evidence(false,'visual');h.advance(200);
 await h.reader.message({type:'galMenu',open:true});h.advance(10000);
 h.event({type:'readerContext',active:true});h.advance(10000);
 assert.equal(h.immersion.visible,true);assert.deepEqual(h.visibility,[]);
});

test('fresh marker loss after returning still hides, explicit engine and scene hides still apply',()=>{
 const h=replayHost();h.event({type:'readerContext',active:false});h.advance(10000);
 h.event({type:'readerContext',active:true});h.event({type:'markerPresence',present:false});h.advance(10000);
 assert.equal(h.immersion.visible,true,'no positive observation since returning');
 h.event({type:'markerPresence',present:true});h.advance(1000);
 h.event({type:'readerInput',complete:true,skipHeld:false});h.event({type:'markerPresence',present:false});h.advance(650);
 assert.deepEqual(h.visibility.at(-1),{dialogVisible:false,reason:'marker'});
 h.event({type:'markerPresence',present:true});assert.equal(h.immersion.visible,true);
 h.event({type:'readerContext',active:false});h.event({type:'hookDialog',visible:false,engine:'cs2'});h.advance(650);
 assert.deepEqual(h.visibility.at(-1),{dialogVisible:false,reason:'engine'});
 /* a scene probe is an inference: refused while the context is frozen, applied once the game is back and settled */
 h.immersion.scene(true);h.immersion.scene(false,'game-ui settings');
 assert.deepEqual(h.visibility.at(-1),{dialogVisible:false,reason:'engine'});
 h.event({type:'readerContext',active:true});h.advance(600);
 h.immersion.scene(true);h.immersion.scene(false,'game-ui settings');
 assert.deepEqual(h.visibility.at(-1),{dialogVisible:false,reason:'game-ui settings'});
});

test('compiled bridge reports 20 focus/menu cycles without activating any window',{skip:process.platform!=='win32'||!require('node:fs').existsSync(require('node:path').join(__dirname,'../native/GalWindowBridge.exe'))},async()=>{
 const exe=require('node:path').join(__dirname,'../native/GalWindowBridge.exe');
 const script=`$a=[Reflection.Assembly]::LoadFrom($env:MEGULIT_REPLAY_BRIDGE);$t=$a.GetType('GalWindowBridge');$flags=[Reflection.BindingFlags]'NonPublic,Static';$a.GetType('ReaderLayerPolicy').GetField('SettleMs',[Reflection.BindingFlags]'Public,Static').SetValue($null,0);$tick=$t.GetMethod('ReaderInputTick',$flags);$menu=$t.GetField('MenuOpen',$flags);for($i=0;$i -lt 20;$i++){$menu.SetValue($null,$false);$null=$tick.Invoke($null,@($false));$null=$tick.Invoke($null,@($true));$menu.SetValue($null,$true);$null=$tick.Invoke($null,@($true));$menu.SetValue($null,$false);$null=$tick.Invoke($null,@($true))}`;
 const r=require('node:child_process').spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',windowsHide:true,timeout:20000,env:{...process.env,MEGULIT_REPLAY_BRIDGE:exe}});
 assert.equal(r.status,0,r.stderr);
 const events=r.stdout.trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line)).filter(e=>e.type==='readerContext');
 assert.equal(events.length,80);
 const h=replayHost();
 for(const event of events){h.event(event);h.event({type:'markerPresence',present:false});h.advance(10000);}
 assert.ok(events.every((e,i)=>e.active===(i%2===1)));assert.equal(h.immersion.visible,true);
});
