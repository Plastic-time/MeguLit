// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {HookNative}=require('../core/hook-native.cjs'),{HookControl}=require('../core/hook-control.cjs'),Profiles=require('../core/profiles/index.cjs');
const {decide}=require('../core/engine-routes/kirikiri.cjs'),{formatChars,parseChars}=require('../core/text-paths.cjs');
const tape=require('./fixtures/games/fata-morgana/stream-left-native.json');
const fata=()=>Profiles.profileFor({exe:'D:/Games/Fata/fata_jp.exe',engine:'kirikiri',title:'ファタモルガーナの館'});
function rig(profile=fata()){
 let now=tape.page.t;const commands=[],writes=[],notes=[],records=[],sources=[],hooks=Object.create(HookNative.prototype),[pid,started]=tape.game.split('|');
 const host={profile,hooks,state:{bound:true,coverEnabled:true,gameProcessId:Number(pid),gameStarted:started,gameHwnd:'1234',processName:'fata_jp'},preferences:{hookProfile:'embed',hookHide:true,hookFast:true,hookAutoStart:true,bindEnabled:true,maskMode:'hook',autoGameStyle:false},send:m=>commands.push(m),notify:m=>notes.push(m),save(p){this.preferences=p;writes.push(p.hookProfile);hooks.configure(p,this.state);}};
 Object.assign(hooks,{profile,state:{hookThreads:structuredClone(tape.before.hb.hookThreads)},pid:Number(pid),started,identity:tape.game,serial:0,enabled:true,route:'embed',drawPid:Number(pid),windowState:host.state,leftCodes:new Set(),lastSource:'',now:()=>now,process:{stdin:{writable:true,write:s=>commands.push(JSON.parse(s))}},trace(){},emit:r=>records.push(r),emitSource:s=>sources.push(s),learnEngine(){},drawLog(){},engineDrawLine(){},syncMarker(){},syncEmbedMode(){},syncGlyphMode(){},probeHide(){},select(){throw Error('must not reselect a left stream');}});
 const control=new HookControl(host,()=>now);control.plan='embed';control.running=true;
 const page=(m=tape.page.hb)=>{now++;hooks.pageLine(structuredClone(m));};
 const chars=(raw=tape.chars.hb.line)=>{now++;hooks.charRects(raw);};
 const leave=()=>{hooks.leftCodes.add(tape.left.hb.code);hooks.state.hookThreads=structuredClone(tape.after.hb.hookThreads);now=tape.after.t;};
 const phase=()=>{const s=hooks.state.hookThreads.find(x=>x.selected);return decide(control.engineRouteState,{setting:profile.hide.streamFallback,engine:profile.engine,run:host.state.gameProcessId+'|'+host.state.gameStarted,stream:s.id+'|'+s.code,active:host.preferences.hookHide&&control.plan==='embed',hideActive:hooks.enabled===true&&!hooks.preflight,evidence:hooks.engineRouteEvidence}).phase;};
 return {host,hooks,control,commands,writes,notes,records,sources,page,chars,leave,phase};
}
test('real ninth-line stream switch retains the engine route without saving read or sending reader-profile disable',()=>{
 const r=rig();r.page();r.chars();assert.equal(r.phase(),'confirmed');assert.equal(r.hooks.charGates.get('krkr').confirmed,true);r.control.apply();r.leave();r.control.apply();
 assert.equal(r.control.plan,'embed');assert.equal(r.hooks.enabled,true);assert.deepEqual(r.writes,[]);assert.deepEqual(r.commands,[]);assert.equal(r.phase(),'waiting','stream changed: the prior stream proof is not current');assert.ok(r.sources.includes(tape.page.hb.text));
 assert.ok(r.notes.every(x=>x.hookVisualVerified!==true));assert.ok(r.hooks.leftCodes.has(tape.left.hb.code));
});
test('only the explicit game capability changes routing; null and other engines keep the legacy fallback',()=>{
 assert.equal(fata().hide.streamFallback,'engine');
 for(const input of [{exe:'D:/g/Unknown.exe',engine:'kirikiri'},{exe:'D:/g/SenrenBanka.exe',engine:'kirikiri'},{exe:'D:/g/Amakano3.exe',engine:'artemis'}]){
  const profile=Profiles.profileFor(input);assert.equal(profile.hide.streamFallback,null);const r=rig(profile);r.page();r.chars();r.leave();r.control.apply();assert.equal(r.control.plan,'read');assert.deepEqual(r.writes,['read']);assert.ok(r.commands.some(m=>m.type==='disable'&&m.reason==='reader-profile'));assert.equal(r.hooks.engineRouteEvidence,undefined);
 }
 const r=rig({...fata(),engine:'artemis'});r.leave();r.control.apply();assert.equal(r.control.plan,'read');
});
test('new run, stream, page and hidden=0 invalidate old proof while route intent waits; recovery needs fresh matching records',()=>{
 const r=rig();r.page();r.chars();r.leave();r.control.apply();
 const old=structuredClone(r.hooks.engineRouteEvidence);r.host.state.gameStarted='new-start';r.hooks.started='new-start';r.control.apply();assert.equal(r.phase(),'waiting');assert.equal(r.control.engineRouteState.seenPage,false);assert.deepEqual(r.hooks.engineRouteEvidence,old,'cross-run gates were not repurposed as a proof');
 r.page();assert.equal(r.phase(),'waiting');r.chars();assert.equal(r.phase(),'confirmed');
 r.page({...tape.page.hb,phase:'begin',line:10});assert.equal(r.phase(),'waiting');r.page({...tape.page.hb,line:10});assert.equal(r.phase(),'waiting');
 const next={...parseChars(tape.chars.hb.line),line:10,hidden:false};r.chars(formatChars(next));assert.equal(r.phase(),'waiting');assert.equal(r.records.at(-1).hidden,false,'hidden=0 is emitted unchanged');
 r.chars(formatChars({...next,hidden:true}));assert.equal(r.phase(),'confirmed');r.control.apply();assert.deepEqual(r.writes,[]);assert.ok(r.notes.every(x=>x.hookVisualVerified!==true));
});
test('manual read/off, binding/cover switches and preflight remain authoritative',()=>{
 for(const change of [r=>{r.host.preferences.hookHide=false;r.host.preferences.hookProfile='read';r.control.plan='read';r.hooks.enabled=false;},r=>{r.control.plan='off';r.host.preferences.hookProfile='off';r.hooks.enabled=false;},r=>{r.host.state.bound=false;r.hooks.enabled=false;},r=>{r.host.state.coverEnabled=false;r.hooks.enabled=false;},r=>{r.host.preferences.bindEnabled=false;r.hooks.enabled=false;}]){
  const r=rig();r.page();r.chars();r.leave();change(r);const plan=r.control.plan;r.control.apply();assert.equal(r.control.plan,plan);assert.equal(r.hooks.enabled,false);assert.deepEqual(r.writes,[]);assert.ok(!r.commands.some(m=>m.type==='enable'||m.type==='toggleCover'||m.type==='toggleMode'));
 }
 const r=rig();r.page();r.chars();r.leave();r.hooks.enabled=false;r.hooks.calibrating=true;r.hooks.preflight=true;r.control.apply();assert.equal(r.phase(),'waiting');assert.equal(r.hooks.enabled,false);assert.deepEqual(r.writes,[]);assert.deepEqual(r.commands,[]);
});
test('an opted-in route without engine frames waits without claiming a proof',()=>{const r=rig();r.leave();r.control.apply();assert.equal(r.phase(),'waiting');assert.equal(r.control.plan,'embed');assert.deepEqual(r.writes,[]);assert.equal(r.control.engineRouteState.seenPage,false);assert.ok(r.notes.every(x=>x.hookVisualVerified===false));});
test('fallback is a data-only enum and an absent run identity cannot certify a route',()=>{
 const domains=require('../core/profiles/domains.cjs');assert.deepEqual(domains.clean({hide:{streamFallback:'engine'}}).rejected,[]);assert.deepEqual(domains.clean({hide:{streamFallback:null}}).rejected,[]);assert.deepEqual(domains.clean({hide:{streamFallback:'any'}}).rejected,['hide.streamFallback']);
 assert.equal(decide(null,{setting:'engine',engine:'kirikiri',run:'0|',active:true}).keep,false);
});
