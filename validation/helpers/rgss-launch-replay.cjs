// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
/* Exercise Bridge.launch with its real grant resolver and preparation code; only OS/game side effects are replaced. */
async function launchReplay({root,exe,L}){
 const game={id:'fixed-vx',title:'VX',executable:exe,original:JSON.stringify({library:{engine:'RPG Maker VX/XP'}})},started=[],bound=[],attached=[],queried=[];let prepared;
 const file=path.join(__dirname,'../../services/bridge.cjs'),req=require('node:module').createRequire(file),mod={exports:{}};
 const modules={
  './store.cjs':{},'./relay-gate.cjs':{install(){}},'./import-source.cjs':{backfill(){},targetOf:()=>''},'./background-games.cjs':{foreground:async()=>{},unmute:async()=>{}},'../core/steam-owned.cjs':{launchAppid:()=>null},'./game-language.cjs':{originalExecutable:()=>({blocked:false})},'../core/drm-wrap.cjs':{plan:()=>null},'../core/library.cjs':{isTranslated:()=>false},'./locale-launch.cjs':{requiresAdministrator:()=>false},'./shared-adaptation.cjs':{importFor(){}},'./japanese-restore-options.cjs':{forExecutable:()=>({})},'../core/japanese-restore.cjs':{repairNameColumns:()=>({}),repairShared:()=>({}),_internal:{yurisPlan:()=>null}},'./japanese-auto-run.cjs':{beforeLaunch(){}},'../core/directplay.cjs':{prepare:()=>({copied:[],declined:[],missing:[]})},'../core/windows-features.cjs':{prepareDotnet:()=>[],watch:()=>({stop(){},found:[]})},'../core/japanese-auto.cjs':{launchResult(){}},
  './game-process.cjs':{gameProcess:async()=> 'absent',gameProcesses:async(_,candidate)=>{queried.push(candidate);return started.some(s=>s.exe===candidate)?[{pid:process.pid,visible:true}]:[];}},
  './game-readiness.cjs':{startProcess:async(candidate,args,cwd)=>{started.push({exe:candidate,args,cwd});return {pid:process.pid,exit:null};},waitForVisibleGame:async query=>{const rows=await query();assert.equal(rows.length,1);return rows[0];}},
  '../core/text-paths-launch.cjs':{...L,prepare:async options=>{assert.equal(options.profile.draw,undefined,'raw catalog has no manual role switch');assert.ok(options.ownerTestGrant,'Bridge resolves the opaque grant before prepare');prepared=await L.prepare(options);return prepared;}}
 };
 new Function('require','module','exports','__dirname','__filename',fs.readFileSync(file,'utf8'))(name=>name in modules?modules[name]:req(name),mod,mod.exports,path.dirname(file),file);
 const db={prepare:()=>({get:()=>game,run(){}})},runtime={reader:{gal:{hooks:{attachTextPath:session=>attached.push(session)}}},prepareGame(){},bindLaunched:pid=>bound.push(pid)};
 const result=await mod.exports.launch(db,game.id,runtime);assert.equal(result.action,'launched');assert.equal(started.length,1);assert.equal(started[0].exe,prepared.exe);assert.equal(started[0].cwd,path.dirname(prepared.exe));assert.deepEqual(bound,[process.pid]);assert.deepEqual(attached,[prepared.session]);assert.ok(queried.includes(prepared.exe));
 return prepared;
}
module.exports={launchReplay};
