// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 1.4.22 test pack v2 (owner, ファタモルガーナの館, E:\MeguLit-Test-1421\logs 02:44-02:48Z): the self-check kept the seed's hide
   mode ("selfCheck seed kept ... over=pairRate"), yet at 02:45:51.577Z reader-host.log has readMode reason=text-effects paired=5
   orphan=3: three orphans within 30 ms (a backlog burst after a click) made text-place.js send galTextEffects, the reader took read
   mode and hook-events.log shows "render mode switched in place embed -> read": the Japanese stayed, no translation replaced it.
   For an owner-ok / verified seed in hide mode no text-effects verdict (reader, core, or one remembered from an earlier run) switches
   to read mode any more: a layoutDiagnostic keptHide is logged instead. Replayed here with that run's reader-host lines. */
process.env.MEGULIT_RELAY_BASE??='off';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {Reader}=require('../services/reader.cjs'),Profiles=require('../core/profiles/index.cjs');
const EXE='D:/Games/Fata/fata_jp.exe';
/* reader-host.log 02:45:50.712-02:45:51.577Z of that run */
const RUN=[{kind:'textEffects',line:'paired',orphan:0,paired:4},{kind:'textEffects',line:'paired',orphan:0,paired:5},{kind:'textEffects',line:'orphan',orphan:1,paired:5},
 {kind:'textEffects',line:'orphan',orphan:2,paired:5},{kind:'textEffects',line:'orphan',orphan:3,paired:5}];

function rig(profile){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-fata-keep-')),calls=[],logs=[],traces=[];
 const r=Object.create(Reader.prototype);Object.assign(r,{root,gameExe:EXE,runtime:{config:()=>({}),emit(){}},logVisibility:m=>logs.push(m),
  gal:{profile,textEffectsHold:false,textEffects:(on,why)=>calls.push([on,why]),hooks:{trace:t=>traces.push(t)},send(){}}});
 return {r,root,calls,logs,traces};
}

test('Fata seed: owner-ok, hide, effectJudge off',()=>{
 const p=Profiles.profileFor({exe:EXE,engine:'KiriKiri',title:'ファタモルガーナの館'});
 assert.equal(p.gameKey,'fata-morgana');assert.equal(p.seedStatus,'owner-ok');assert.equal(p.hide.textEffectsRead,false);assert.equal(p.safeMode.effectJudge,false);
});

test('02:45Z replay: the reader text-effects verdict keeps hide mode (no read, no give way)',async()=>{
 const p=Profiles.profileFor({exe:EXE});const {r,calls,logs,root}=rig(p);
 for(const d of RUN)r.logVisibility({type:'layoutDiagnostic',...d});
 await r.message({type:'galTextEffects',paired:5,orphan:3});
 assert.deepEqual(calls,[],'no textEffects(true): hide mode stays');
 assert.ok(!logs.some(l=>l.type==='readMode'),'no readMode');
 assert.ok(logs.some(l=>l.what==='keptHide'&&l.by==='reader'&&l.seed==='fata-morgana'&&l.orphan===3),'the diagnostic is logged');
 assert.equal(require('../services/text-effects.cjs').has(root,EXE),false,'nothing remembered for the next run');
});

test('core effectJudge verdict and a remembered verdict keep hide mode too',()=>{
 const p=Profiles.profileFor({exe:EXE});const {r,calls,logs,root}=rig(p);
 r.event({type:'hookTextEffects',paired:5,orphan:3});
 assert.deepEqual(calls,[]);assert.ok(logs.some(l=>l.what==='keptHide'&&l.by==='core'));
 require('../services/text-effects.cjs').set(root,EXE,{paired:1,orphan:9});
 assert.equal(r.seedKeepsHide(EXE,'remembered'),true,'the bind-time remembered verdict is ignored under the seed');
 const src=fs.readFileSync(path.join(__dirname,'..','services','reader.cjs'),'utf8');
 for(const by of ['remembered','core','reader'])assert.ok(src.includes("seedKeepsHide("+(by==='remembered'?'exe':'this.gameExe')+",'"+by+"'"),by+' path is gated');
});

test('a game without such a seed still takes read mode on the verdict (unchanged)',async()=>{
 const p=Profiles.profileFor({exe:'D:/g/Unknown.exe',engine:'kirikiri'});const {r,calls,logs}=rig(p);r.gameExe='D:/g/Unknown.exe';
 await r.message({type:'galTextEffects',paired:5,orphan:3});
 assert.deepEqual(calls.map(c=>c[0]),[true]);assert.ok(logs.some(l=>l.type==='readMode'));
});
