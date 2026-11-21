// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {HookNative}=require('../core/hook-native.cjs'),{HookControl}=require('../core/hook-control.cjs'),Profiles=require('../core/profiles/index.cjs');
const {formatChars,parseChars}=require('../core/text-paths.cjs'),tape=require('./fixtures/games/fata-morgana/stream-left-native.json');
const fata=()=>Profiles.profileFor({exe:'D:/Games/Fata/fata_jp.exe',engine:'kirikiri',title:'ファタモルガーナの館'});
function rig(profile=fata()){
 let now=tape.page.t;const commands=[],writes=[],notes=[],records=[],sources=[],hooks=Object.create(HookNative.prototype),[pid,started]=tape.game.split('|');
 const host={profile,hooks,state:{bound:true,coverEnabled:true,gameProcessId:Number(pid),gameStarted:started,gameHwnd:'1234',processName:'fata_jp'},preferences:{hookProfile:'embed',hookHide:true,hookFast:true,hookAutoStart:true,bindEnabled:true,maskMode:'hook',autoGameStyle:false},send:m=>commands.push(m),notify:m=>notes.push(m),save(p){this.preferences=p;writes.push(p.hookProfile);hooks.configure(p,this.state);}};
 Object.assign(hooks,{profile,state:{hookThreads:structuredClone(tape.before.hb.hookThreads)},pid:Number(pid),started,identity:tape.game,serial:0,enabled:true,route:'embed',drawPid:Number(pid),windowState:host.state,leftCodes:new Set(),lastSource:'',now:()=>now,process:{stdin:{writable:true,write:s=>commands.push(JSON.parse(s))}},trace(){},emit:r=>records.push(r),emitSource:s=>sources.push(s),learnEngine(){},drawLog(){},engineDrawLine(){},syncMarker(){},syncEmbedMode(){},syncGlyphMode(){},probeHide(){},select(){throw Error('must not reselect a left stream');}});
 const control=new HookControl(host,()=>now);control.plan='embed';control.running=true;
 const page=(m=tape.page.hb)=>{now++;hooks.pageLine(structuredClone(m));};
 const chars=(raw=tape.chars.hb.line)=>{now++;hooks.charRects(raw);};
 const leave=()=>{hooks.leftCodes.add(tape.left.hb.code);hooks.state.hookThreads=structuredClone(tape.after.hb.hookThreads);now=tape.after.t;};
 return {host,hooks,control,commands,writes,notes,records,sources,page,chars,leave};
}

// This preserves the unresolved real failure evidence; it is not a successful hiding acceptance test.
test('real ninth-line stream switch still records the unresolved read fallback after removing out-of-scope plumbing',()=>{
 const r=rig();r.page();r.chars();assert.equal(r.hooks.charGates.get('krkr').confirmed,true);r.control.apply();assert.equal(r.control.plan,'embed');r.leave();r.control.apply();
 assert.equal(r.control.plan,'read');assert.equal(r.hooks.enabled,false);assert.deepEqual(r.writes,['read']);assert.ok(r.commands.some(m=>m.type==='disable'&&m.reason==='reader-profile'));assert.ok(r.sources.includes(tape.page.hb.text));assert.ok(r.hooks.leftCodes.has(tape.left.hb.code));assert.ok(r.notes.every(x=>x.hookVisualVerified!==true));
});
test('Fata, unknown games, other engines and a forged removed setting all retain the original default route',()=>{
 for(const input of [{exe:'D:/Games/Fata/fata_jp.exe',engine:'kirikiri',title:'ファタモルガーナの館'},{exe:'D:/g/Unknown.exe',engine:'kirikiri'},{exe:'D:/g/SenrenBanka.exe',engine:'kirikiri'},{exe:'D:/g/Amakano3.exe',engine:'artemis'}]){
  const profile=Profiles.profileFor(input);assert(!Object.hasOwn(profile.hide,'streamFallback'));const r=rig(profile);r.page();r.chars();r.leave();r.control.apply();assert.equal(r.control.plan,'read');assert.deepEqual(r.writes,['read']);assert.equal(r.hooks.engineRouteEvidence,undefined);
 }
 const r=rig({...fata(),hide:{...fata().hide,streamFallback:'engine'}});r.leave();r.control.apply();assert.equal(r.control.plan,'read');
});
test('new runs, pages and hidden zero cannot manufacture a removed route proof',()=>{
 const r=rig();r.page();r.chars();r.host.state.gameStarted='new-start';r.hooks.started='new-start';r.page({...tape.page.hb,phase:'begin',line:10});r.page({...tape.page.hb,line:10});
 const next={...parseChars(tape.chars.hb.line),line:10,hidden:false};r.chars(formatChars(next));assert.equal(r.records.at(-1).hidden,false);assert.equal(r.hooks.engineRouteEvidence,undefined);
 r.chars(formatChars({...next,hidden:true}));assert.equal(r.hooks.engineRouteEvidence,undefined);r.leave();r.control.apply();assert.equal(r.control.plan,'read');assert.ok(r.notes.every(x=>x.hookVisualVerified!==true));
});
test('manual read/off, binding/cover switches and preflight never enable hiding through the removed fallback',()=>{
 for(const change of [r=>{r.host.preferences.hookHide=false;r.host.preferences.hookProfile='read';r.control.plan='read';},r=>{r.control.plan='off';r.host.preferences.hookProfile='off';r.host.preferences.hookAutoStart=false;},r=>{r.host.state.bound=false;},r=>{r.host.state.coverEnabled=false;},r=>{r.host.preferences.bindEnabled=false;},r=>{r.hooks.calibrating=true;r.hooks.preflight=true;}]){
  const r=rig();r.page();r.chars();r.leave();r.hooks.enabled=false;change(r);r.control.apply();assert.equal(r.hooks.enabled,false);assert.ok(!r.commands.some(m=>['enable','toggleCover','toggleMode'].includes(m.type)));assert.equal(r.hooks.engineRouteEvidence,undefined);
 }
});
test('no engine frames cannot claim an independent route or visual verification',()=>{const r=rig();r.leave();r.control.apply();assert.equal(r.control.plan,'read');assert.deepEqual(r.writes,['read']);assert.equal(r.control.engineRouteState,undefined);assert.ok(r.notes.every(x=>x.hookVisualVerified!==true));});
test('removed fallback setting is rejected by the data contract and has no executable helper',()=>{
 const D=require('../core/profiles/domains.cjs');for(const value of ['engine',null,'any'])assert.deepEqual(D.clean({hide:{streamFallback:value}}).rejected,['hide.streamFallback']);
 assert(!Object.hasOwn(Profiles.DEFAULTS.hide,'streamFallback'));assert.equal(HookNative.prototype.noteEngineRoute,undefined);assert(!fs.existsSync(path.join(__dirname,'../core/engine-routes/kirikiri.cjs')));
});
