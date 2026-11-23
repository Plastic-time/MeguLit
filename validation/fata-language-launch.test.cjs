// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-fata-launch-'));
const previousRoot=process.env.MEGULIT_ROOT;
process.env.MEGULIT_ROOT=root;
const {launch}=require('../services/bridge.cjs');
after(()=>{
 if(previousRoot===undefined)delete process.env.MEGULIT_ROOT;
 else process.env.MEGULIT_ROOT=previousRoot;
 assert.equal(path.dirname(fs.realpathSync(root)),fs.realpathSync(os.tmpdir()));
 fs.rmSync(root,{recursive:true,force:true});
});
const {launchTarget}=require('../services/original-engines/krkr-lang.cjs');
const {activeGameForProgram}=require('../services/library.cjs');
const readiness=require('../services/game-readiness.cjs'),processes=require('../services/game-process.cjs');
const {waitForVisibleGame}=readiness;

function fixture(languages=[]){
 const dir=fs.mkdtempSync(path.join(root,'海市蜃楼-'));
 const file=name=>path.join(dir,name);
 const args=languages.map(language=>'-language='+language+'\0').join('');
 const wrapper=Buffer.concat([Buffer.from('MZ'),Buffer.from('fata.exe\0'+args,'utf16le')]);
 for(const lang of ['jp','zh','ru'])fs.writeFileSync(file('fata_'+lang+'.exe'),wrapper);
 for(const name of ['fata.exe','data.xp3','data_jp.xp3'])fs.writeFileSync(file(name),'fixture');
 const game={id:'fata',title:'The House in Fata Morgana',executable:file('fata_jp.exe'),original:JSON.stringify({library:{engine:'KiriKiri',localeMode:'off'}})};
 return {dir,file,game,target:file('fata.exe')};
}

test('recognizes each language launcher that names the shared game executable',()=>{
 const {file,target}=fixture();
 for(const lang of ['jp','zh','ru'])assert.equal(launchTarget(file('fata_'+lang+'.exe'))?.executable,target);
 assert.equal(launchTarget(target),null);
 fs.writeFileSync(file('fata_ru.exe'),'MZ\0unrelated.exe\0');
 assert.equal(launchTarget(file('fata_ru.exe')),null);
 fs.unlinkSync(file('data_jp.xp3'));
 assert.equal(launchTarget(file('fata_jp.exe')),null);
});

function englishSelection(t){
 const {file,game}=fixture(),english=file('fata_en.exe');
 fs.unlinkSync(file('fata.exe'));
 fs.writeFileSync(english,'MZ');
 const db=new DatabaseSync(':memory:');
 t.after(()=>db.close());
 db.exec('CREATE TABLE games(id TEXT, executable TEXT, original TEXT, removed_at INTEGER)');
 db.prepare('INSERT INTO games(id,executable,original) VALUES (?,?,?)').run(game.id,english,game.original);
 return {db,file,game,language:require('../services/game-language.cjs')};
}

test('the English standalone program can switch to the Japanese and Chinese siblings',t=>{
 const {db,file,game,language}=englishSelection(t);
 const status=language.inspect(db,game.id,root);
 assert.deepEqual(status.versions,{ja:file('fata_jp.exe'),zh:file('fata_zh.exe')});
 assert.equal(status.current,'en');
 assert.equal(language.select(db,game.id,'ja',null,root).executable,file('fata_jp.exe'));
});

test('finding the Japanese original from the English standalone program saves the Japanese sibling',t=>{
 const {db,file,game,language}=englishSelection(t);
 assert.equal(language.originalExecutable(db,game.id,root,'find').executable,file('fata_jp.exe'));
 assert.equal(db.prepare('SELECT executable FROM games WHERE id=?').get(game.id).executable,file('fata_jp.exe'));
});

test('similarly named programs without a Japanese release keep their own families',t=>{
 const {db,file,game,language}=englishSelection(t);
 fs.unlinkSync(file('data_jp.xp3'));
 fs.unlinkSync(file('fata_jp.exe'));
 assert.deepEqual(language.inspect(db,game.id,root).versions,{});
});

test('the shared game window maps back to a single library entry even without saved variants',()=>{
 const {game,file,target}=fixture();
 const db=(...rows)=>({prepare:()=>({all:()=>rows})});
 assert.equal(activeGameForProgram(db(game),target),game);
 assert.equal(activeGameForProgram(db(game),fixture().target),null);
 assert.equal(activeGameForProgram(db(game,{...game,id:'ru',executable:file('fata_ru.exe')}),target),null);
 const exact={...game,id:'engine',executable:target};
 assert.equal(activeGameForProgram(db(game,exact),target),exact);
});

const launches=[
 ['direct wheel', {languages:['jp'],direct:true}],
 ['direct wheel with Japanese locale', {languages:['jp'],direct:true,localeMode:'japanese',method:'locale'}],
 ['wrapper without language argument', {}],
 ['wrapper with conflicting language arguments', {languages:['jp','ru']}],
 ['wrapper with forced Windows launch', {languages:['jp'],windowsLaunch:true,method:'shell'}],
 ['wrapper with Japanese locale', {localeMode:'japanese',method:'locale'}],
 ['wrapper requires elevation', {languages:['jp'],elevation:'launcher',method:'shell'}],
 ['shared engine requires elevation', {languages:['jp'],elevation:'engine'}],
 ['library-only wrapper', {languages:['jp'],libraryOnly:true}],
 ['already running with a wheel plan', {languages:['jp'],direct:true,method:'focus'}],
 ['already running without a wheel plan', {method:'focus'}],
];

for(const [mode,options] of launches)test('launch monitors and binds the engine: '+mode,async t=>{
 const {languages,direct=false,localeMode='off',method='start',windowsLaunch=false,elevation,libraryOnly=false}=options;
 const {dir,file,game,target}=fixture(languages),launcher=file('fata_jp.exe');
 game.original=JSON.stringify({library:{engine:'KiriKiri',localeMode,variants:[]}});
 if(elevation)fs.writeFileSync((elevation==='launcher'?launcher:target)+'.manifest','<requestedExecutionLevel level="requireAdministrator"/>');
 if(libraryOnly){
  const config=path.join(root,'data','config','library.json');
  fs.mkdirSync(path.dirname(config),{recursive:true});
  fs.writeFileSync(config,JSON.stringify({libraryOnly:true}));
  t.after(()=>fs.rmSync(config,{force:true}));
 }
 const calls=[],writes=[],record=(...args)=>calls.push(args);
 const db={prepare(sql){
  if(sql.startsWith('SELECT * FROM games'))return {get:()=>({...game})};
  if(sql==='UPDATE games SET last_launched_at=? WHERE id=?')return {run:(...args)=>writes.push(args)};
  throw Error('Unexpected SQL: '+sql);
 }};
 const mock=(module,name,fn)=>t.mock.method(require(module),name,fn);
 mock('../services/import-source.cjs','backfill',()=>{});
 mock('../services/import-source.cjs','targetOf',()=>null);
 mock('../services/background-games.cjs','foreground',async()=>{});
 mock('../services/background-games.cjs','unmute',async()=>{});
 mock('../core/steam-owned.cjs','launchAppid',()=>'');
 mock('../services/game-language.cjs','originalExecutable',()=>({blocked:false}));
 mock('../core/drm-wrap.cjs','plan',()=>null);
 mock('../services/shared-adaptation.cjs','importFor',()=>{});
 mock('../core/japanese-restore.cjs','repairNameColumns',()=>({}));
 mock('../core/japanese-restore.cjs','repairShared',()=>({}));
 mock('../services/japanese-auto-run.cjs','beforeLaunch',()=>{});
 mock('../core/directplay.cjs','prepare',()=>({copied:[],declined:[],missing:[]}));
 mock('../core/windows-features.cjs','prepareDotnet',()=>[]);
 mock('../core/windows-features.cjs','watch',()=>({stop(){},found:[]}));
 mock('../core/locale-emulator.cjs','x86',()=>true);
 mock('../services/launcher-cleanup.cjs','endHidden',()=>{throw Error('Language launcher must not be cleaned up as DRM');});
 const queries=[];
 t.mock.method(processes,'gameProcess',async(_root,exe,{focus})=>{
  record('focus',exe,focus);
  return method==='focus'?'focused':'absent';
 });
 t.mock.method(processes,'gameProcesses',async(_root,exe)=>{
  queries.push(exe);
  return queries.length<3?[]:[{pid:exe===target?42:41,visible:true}];
 });
 t.mock.method(processes,'shellOpen',async(_root,exe)=>record('shell',exe));
 t.mock.method(readiness,'startProcess',async(exe,args,cwd)=>{
  record('start',exe,args,cwd);
  return {pid:41,exit:{code:0,signal:null}};
 });
 t.mock.method(readiness,'waitForVisibleGame',(query,options)=>waitForVisibleGame(query,{...options,sleep:async()=>{}}));
 const runtime={
  async stopReading(){record('reader-stop');},
  prepareGame(exe,options){record('prepare',exe,options);},
  bindLaunched(pid){record('bind',pid);},
  library(){return {locale:{async launch(exe,{args,alsoExe}){record('locale',exe,args,alsoExe);return {gamePid:42};}}};}
 };
 const result=await launch(db,game.id,runtime,windowsLaunch);
 assert.equal(result.action,method==='focus'?'focused':'launched');
 const executable=direct?target:launcher,args=direct?['-language=jp','-wheel=message']:[];
 const expectedLaunch={
  start:[['start',executable,args,dir]],
  shell:[['shell',launcher]],
  locale:[['locale',executable,direct?args:undefined,direct?undefined:target]],
  focus:[],
 };
 assert.deepEqual(calls,[
  ...(libraryOnly?[['reader-stop']]:[]),
  ['prepare',target,{enter:true}],['focus',target,true],
  ...expectedLaunch[method],
  ['prepare',target,undefined],['bind',42],
 ]);
 assert.deepEqual([...new Set(queries)],direct&&method==='locale'?[]:[target]);
 assert.equal(writes.length,1);
 assert.equal(writes[0][1],game.id);
});
