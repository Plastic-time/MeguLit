// SPDX-License-Identifier: GPL-3.0-or-later
// 2026-11-21 tools/diff-maker: probe -> game diff draft + replay fixture + report, and the draw roles (core/draw-role.cjs).
// The sample probes under validation/helpers/diff-maker/probes/ (KiriKiri: the owner's incr9 run of 千恋＊万花 and
// ファタモルガーナの館, trimmed; RPG Maker MZ: a made-up sample game) must regenerate exactly the committed diffs and fixtures,
// and every generated probe fixture must replay green.
'use strict';
process.env.MEGULIT_RELAY_BASE??='off';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const Profiles=require('../core/profiles/index.cjs'),Role=require('../core/draw-role.cjs');
const Maker=require('../tools/diff-maker/index.cjs'),Probe=require('../tools/diff-maker/probe.cjs'),Samples=require('../tools/diff-maker/samples.cjs');
const PROBES=path.join(__dirname,'helpers','diff-maker','probes'),FIX=path.join(__dirname,'fixtures','games');
const SAMPLES=[['senren-banka','','hide'],['fata-morgana','','read'],['rpgm-sample','rpgm-sample','hide']];

test('draw roles: kernel default is unchanged, engine diffs classify by the engine identity',()=>{
 const k=Profiles.profileFor({});assert.deepEqual({...k.role.map},{});assert.equal(k.role.fallback,null);assert.equal(Role.classify(k,{hook:'TextRender'}).role,null,'no engine: the kernel decides as before');
 const r=Profiles.profileFor({engine:'RPG Maker MV'});assert.equal(r.engine,'rpgmaker');
 assert.equal(Role.classify(r,{cls:['Window_Message','Window_Base']}).role,'dialogue');
 assert.equal(Role.classify(r,{cls:['Window_ChoiceList','Window_Command','Window_Selectable','Window_Base']}).role,'ui');
 assert.deepEqual(Role.classify(r,{cls:['Window_MyChoice','Window_ChoiceList','Window_Command']}),{role:'ui',by:'class:Window_ChoiceList'},'a plugin subclass inherits its base role');
 assert.equal(Role.classify(r,{cls:['Window_ShopBuy','Window_Selectable']}).role,'ui');assert.equal(Role.classify(r,{cls:['Window_Gold','Window_Base']}).role,'system');
 assert.equal(Role.classify(r,{cls:['Window_QuestLog']}).role,null,'an unknown class with no chain has no role');
 assert.equal(Role.treat(r,'ui'),'annotate');assert.equal(Role.treat(r,'dialogue'),'embed');
 const s=Profiles.profileFor({exe:'D:/g/SenrenBanka.exe'});assert.equal(s.gameKey,'senren-banka');
 assert.equal(Role.classify(s,{hook:'TextRender'}).role,'dialogue');assert.equal(Role.classify(s,{call:'selectLink',hook:'TextRender'}).role,'ui','the call wins over the hook');
 assert.equal(Role.classify(s,{cls:['MyButton','LinkButtonLayer','ButtonLayer']}).role,'ui');assert.equal(Role.classify(s,{hook:'tTVPNativeBaseBitmap::DrawText'}).role,'system');
 /* a game diff adds to the engine's open map, it does not replace it */
 const g=Profiles.apply(r,{role:{map:{'class:Window_QuestLog':'ui','class:Window_Gold':'ui'}}},'diff');
 assert.equal(Role.classify(g,{cls:['Window_QuestLog']}).role,'ui');assert.equal(Role.classify(g,{cls:['Window_Gold']}).role,'ui');assert.equal(Role.classify(g,{cls:['Window_Message']}).role,'dialogue');
 assert.equal(Role.classify(r,{cls:['Window_Gold']}).role,'system','the engine profile itself is untouched');
 assert.deepEqual(Profiles.unknownKeys({role:{map:{'class:X':'ui'},patterns:[['^hook:Foo','system']],treat:{ui:'annotate'}}}),[]);assert.deepEqual(Profiles.unknownKeys({role:{nope:1}}),['role.nope']);
 const p=Profiles.apply(k,{role:{patterns:[['^hook:Krkr','dialogue']],fallback:'system'}},'diff');
 assert.deepEqual(Role.classify(p,{hook:'KrkrFoo'}),{role:'dialogue',by:'pattern:^hook:Krkr'});assert.deepEqual(Role.classify(p,{hook:'x'}),{role:'system',by:'fallback'});
});

test('engine detection: manifest, then runtime samples, then files',()=>{
 const none={hookEvents:'',draws:''};
 assert.equal(Probe.detectEngine({detected:'KiriKiri Z'},none,[]).engine,'kirikiri');
 assert.equal(Probe.detectEngine({},{hookEvents:'',draws:'{"t":"draw","cls":["Window_Message"]}'},[]).engine,'rpgmaker');
 assert.equal(Probe.detectEngine({},{hookEvents:'2026-11-20T22:51:55.204Z krkr page: hook line drawn nowhere',draws:''},[]).engine,'kirikiri');
 assert.equal(Probe.detectEngine({},none,[{path:'www/js/rpg_core.js'}]).engine,'rpgmaker');assert.equal(Probe.detectEngine({},none,['data.xp3']).engine,'kirikiri');
 assert.equal(Probe.detectEngine({},none,['a.dat']).engine,'');
});

test('RPG Maker draws: per-character message draws fold into one line; a line MeguLit never showed is a drop',()=>{
 const prof=Profiles.profileFor({engine:'rpgmaker'}),roleOf=id=>Role.classify(prof,id).role,M=['Window_Message','Window_Base'];
 const rows=[...'こんにちは'].map((c,i)=>({t:'draw',at:100+i*20,cls:M,text:c})).concat([{t:'shown',at:300,cls:M,text:'こんにちは'},{t:'page',at:400,cls:M}],
  [...'さようなら'].map((c,i)=>({t:'draw',at:1000+i*20,cls:M,text:c})),[{t:'choice',at:2000,cls:['Window_ChoiceList','Window_Command'],items:['はい','いいえ'],shown:1}]);
 const r=Samples.fromDraws(rows.map(x=>JSON.stringify(x)).join('\n'),{roleOf});
 assert.deepEqual(r.events.filter(e=>e.kind==='line').map(e=>e.chars),[5,5]);assert.equal(r.events.filter(e=>e.kind==='drop').length,1);
 assert.deepEqual(r.events.find(e=>e.kind==='choice'),{kind:'choice',at:2000,raw:2,shown:1});
 assert.deepEqual(r.draws.filter(d=>d.kind==='line').map(d=>d.text),['こんにちは','さようなら']);
});

for(const [name,key,mode] of SAMPLES){
 test('sample probe '+name+' regenerates the committed diff and fixture ('+mode+')',()=>{
  const m=Maker.make(path.join(PROBES,name),{key});assert.equal(m.result.best.params.hideMethod,mode);
  const diff=JSON.parse(fs.readFileSync(path.join(root,'core','profiles','diffs',m.probe.exe.hash+'.json'),'utf8'));
  assert.deepEqual(JSON.parse(JSON.stringify(m.diff)),diff,'core/profiles/diffs/'+m.probe.exe.hash+'.json is stale: node tools/diff-maker/index.cjs '+path.relative(root,path.join(PROBES,name))+' --write-repo');
  const rep=JSON.parse(fs.readFileSync(path.join(FIX,m.key,m.name+'.replay.json'),'utf8'));assert.deepEqual(JSON.parse(JSON.stringify(m.replay)),rep,m.name+'.replay.json is stale');
  assert.deepEqual(Profiles.unknownKeys(diff.settings),[]);assert.equal(diff.exeHash,m.probe.exe.hash);assert.match(diff.exeHash,/^[0-9a-f]{64}$/);
  for(const r of m.result.roles)if(r.id.src!=='kernel')assert.ok(m.replay.expect.roles[r.label]!==undefined);
 });
}

test('KiriKiri samples: the verdicts of the live gate (Fata read, Senren hide) and the roles of their hooks',()=>{
 const f=Maker.make(path.join(PROBES,'fata-morgana')),s=Maker.make(path.join(PROBES,'senren-banka'));
 assert.ok(f.result.hideBest.over.includes('dropRate'),'Fata: lines drawn nowhere');assert.equal(f.diff.settings.hide.textEffectsRead,true);
 assert.equal(s.result.best.pass,true);assert.equal(s.diff.settings.placement.drawWhileBlanking,true,'the hand-written game diff is carried into the draft');
 const roles=Object.fromEntries(s.result.roles.map(r=>[r.label,r.role]));assert.equal(roles['hook:TextRender'],'dialogue');assert.equal(roles['hook:tTVPNativeBaseBitmap::DrawText'],'system');
 assert.ok(!('hook:ocr' in (s.diff.settings.role?.map||{})),'OCR lines are MeguLit\'s own source, never an engine identity in a diff');
});

test('every generated probe fixture replays green',async()=>{let n=0;
 for(const key of fs.readdirSync(FIX)){const dir=path.join(FIX,key);for(const f of fs.readdirSync(dir).filter(f=>/^probe-[0-9a-f]{12}\.case\.cjs$/.test(f))){n++;
  await require(path.join(dir,f))({assert,root,fixture:dir,name:f,Profiles,profile:null});}}
 assert.ok(n>=3,'the three sample fixtures exist');
});
