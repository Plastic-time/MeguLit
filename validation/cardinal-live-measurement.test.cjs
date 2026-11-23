// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {LiveMeasurement}=require('../services/cardinal-live-measurement.cjs');
const {key}=require('../core/cardinal/display-pairs.cjs');
const game={pid:71,birth:'123456',hwnd:'222',exe:'C:\\game.exe'};
function session(){
 const m=new LiveMeasurement(game,{cardinal:{sampleMs:100}});
 const native=event=>m.frame({kind:'native',wireNs:process.hrtime.bigint().toString(),m:event});
 m.frame({kind:'page',pageId:'a'.repeat(32)});
 native({type:'bound',bound:false,gameAttached:false});
 native({type:'bound',bound:true,gameProcessId:71,gameStarted:game.birth,gameHwnd:game.hwnd});
 m.frame({kind:'profile',exe:game.exe,profile:m.profile});
 return {m,native};
}
test('aggregates thirty distinct occurrences from native source, product ACK and visible page observations',()=>{
 const {m,native}=session();
 for(let sequence=1;sequence<=30;sequence++){
  const text='unit source',translation='unit translation';
  native({type:'hookSource',text,streamProbe:1,hookActive:true});
  const descriptor={episode:'unit:'+sequence,scope:'unit',sourceKey:key(text)};
  m.frame({kind:'episode',descriptor,sequence});
  m.frame({kind:'ack',message:{...descriptor,translation,paired:true,visible:true,observed:true,enabled:true},sequence});
  const dom={sample:{hookSource:text,cn:[{text:translation,rect:{w:50,h:20}}]},pid:'71',birth:game.birth,translation};
  m.frame({kind:'dom',pageId:m.pageId,dom:{...dom,birth:'other'}});
  assert.equal(m.counts.pairs,sequence-1);
  m.frame({kind:'dom',pageId:m.pageId,dom});
 }
 const evidence=m.finish();
 assert.equal(evidence.domAcks.length,30);
 assert.equal(evidence.run.o.sourceEpisodes.length,30);
 assert.equal(m.nativeCounts.bound,2);
});
test('rejects history, changed target and a new source before the prior occurrence was observed',()=>{
 const {native}=session();
 assert.throws(()=>native({type:'hookSource',text:'unit',origin:'history'}),/LIVE_SOURCE_ORIGIN/);
 assert.throws(()=>native({type:'bound',bound:true,gameProcessId:72,gameStarted:game.birth,gameHwnd:game.hwnd}),/LIVE_BOUND_IDENTITY/);
 native({type:'hookSource',text:'unit',origin:'live'});
 assert.throws(()=>native({type:'hookSource',text:'next',origin:'live'}),/LIVE_SOURCE_WITHOUT_DOM_ACK/);
});

test('game callbacks require the selected exporter and contiguous sequence, and cannot mix with hook output',()=>{
 const {m,native}=session();
 const frame={kind:'gameDialogue',sequence:1,wireNs:process.hrtime.bigint().toString(),
  m:{type:'hookSource',origin:'live',text:'callback'}};
 assert.throws(()=>m.frame(frame),/LIVE_DIALOGUE_SESSION/);
 m.game={...m.game,pluginHash:'a'.repeat(64)};
 assert.throws(()=>m.frame({...frame,sequence:2}),/LIVE_DIALOGUE_SESSION/);
 assert.throws(()=>native(frame.m),/LIVE_DIALOGUE_MIXED_SOURCE/);
 m.frame(frame);
 assert.equal(m.counts.sources,1);
 assert.equal(m.counts.pairs,0);
 assert.throws(()=>m.frame(frame),/LIVE_DIALOGUE_SESSION/);
});

test('a Reader policy update binds its new scope only to the active source occurrence',()=>{
 const {m,native}=session();
 const text='policy source',sourceKey=key(text);
 native({type:'hookSource',text,origin:'live'});
 const descriptor={episode:'unit:1',scope:'scope:0',sourceKey};
 m.frame({kind:'episode',sequence:7,descriptor});
 const changed={...descriptor,scope:'scope:1'};
 m.frame({kind:'pairPolicy',sequence:6,descriptor:changed});
 assert.equal(m.current.scope,descriptor.scope);
 m.frame({kind:'pairPolicy',sequence:7,descriptor:changed});
 m.frame({kind:'ack',sequence:7,message:{...changed,observed:true,paired:true,enabled:true,visible:true,translation:'shown'}});
 assert.equal(m.current.accepted.scope,changed.scope);
 m.frame({kind:'pairPolicy',sequence:7,descriptor:{...changed,scope:'scope:2'}});
 assert.equal(m.current.accepted,undefined);
});
