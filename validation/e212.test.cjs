// SPDX-License-Identifier: GPL-3.0-or-later
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const {openStore}=require('../services/store.cjs'),{originalExecutable}=require('../services/game-language.cjs');
const {waitForVisibleGame}=require('../services/game-readiness.cjs'),{reconcile}=require('../services/library.cjs');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-e212-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 function file(rel){const value=path.join(root,rel);fs.mkdirSync(path.dirname(value),{recursive:true});fs.writeFileSync(value,'fixture');return value;}
 function service(action,values={}){
  const result=spawnSync(process.execPath,[path.join(__dirname,'../services/bridge.cjs')],{env:{...process.env,MEGULIT_ROOT:root},input:JSON.stringify({action,...values}),encoding:'utf8',windowsHide:true});
  assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);
 }
 return {root,file,service};
}
test('translation line breaks decode in Chinese, English and HTML-style provider output',()=>{
 const {normalizeTranslation}=require('../core/translation-format.cjs');
 assert.equal(normalizeTranslation('「走吧……\\n回去吧」<br />Next\\r\\nLast'),'「走吧……\n回去吧」\nNext\nLast');
 assert.equal(normalizeTranslation('first\\nsecond'),'first\nsecond');
 assert.equal(normalizeTranslation('行距\n已经正常'),'行距\n已经正常');
});
test('a Steam dispatch helper exit does not outrun the game window or a replacement startup process',async()=>{
 const frames=[[],[{pid:1,visible:false}],[],[{pid:2,visible:true}],[{pid:2,visible:true}]],trace=[];
 assert.deepEqual(await waitForVisibleGame(async()=>frames.shift(),{helper:true,indirect:true,stableSamples:2,exit:()=>({code:1}),sleep:async()=>{},trace:stage=>trace.push(stage)}),{pid:2});
 assert.deepEqual(trace,['launch-helper-exited','game-process-seen']);
 await assert.rejects(waitForVisibleGame(async()=>[],{attempts:2,helper:true,indirect:true,exit:()=>({code:1}),sleep:async()=>{}}),/GAME_WINDOW_NOT_READY/);
});
test('find the original sibling across casing and subfolders, excluding tools and backups',t=>{
 const {root,file}=fixture(t),exe=file('game/stOrY_ChS.exe'),expected=file('game/bin/STORY.EXE');
 file('game/Story_chspatch_v2.exe');file('game/Uninstall.EXE');file('game/backup/Story_ja.exe');file('game/Other.exe');
 const db=openStore(root);try{
  db.prepare('INSERT INTO games(id,title,executable) VALUES(?,?,?)').run('game','Story',exe);
  assert.equal(originalExecutable(db,'game',root).blocked,true);
  assert.equal(originalExecutable(db,'game',root,'find').executable,expected);
  assert.equal(originalExecutable(db,'game',root).directory,path.dirname(exe));
  assert.equal(fs.readFileSync(exe,'utf8'),'fixture');
 }finally{db.close();}
});
test('ambiguous and missing originals stay unselected; manual pick rejects marked translations',t=>{
 const {root,file}=fixture(t),exe=file('game/story_zh.exe'),pick=file('game/bin/story.exe');
 file('game/story.exe');file('game/backup/story_jp.exe');
 const db=openStore(root);try{
  db.prepare('INSERT INTO games(id,title,executable) VALUES(?,?,?)').run('game','Story',exe);
  assert.throws(()=>originalExecutable(db,'game',root,'find'),/JAPANESE_EXECUTABLE_REQUIRED/);
  assert.throws(()=>originalExecutable(db,'game',root,'select',exe),/JAPANESE_EXECUTABLE_REQUIRED/);
  assert.equal(originalExecutable(db,'game',root,'select',pick).executable,pick);
 }finally{db.close();}
});
test('refresh restores temporary removal and its history; privacy hiding survives refresh',t=>{
 const {root,file,service}=fixture(t),exe=file('sample/fixture.exe');
 const db=openStore(root);try{
  db.prepare('INSERT INTO games(id,legacy_id,title,executable) VALUES(?,?,?,?)').run('game-33',33,'Fixture',exe);
  db.prepare('INSERT INTO reading_sessions(game_id,started_at,active_seconds,characters) VALUES(?,?,?,?)').run('game-33',1,12,30);
  assert.equal(service('remove_game',{id:'game-33'}).ok,true);
  reconcile(root,[],{restoreRemoved:true});
  assert.equal(service('home').data.games[0].readingSeconds,12);
  assert.equal(service('set_game_hidden',{id:'game-33',hidden:true}).ok,true);
  reconcile(root,[],{restoreRemoved:true});
  assert.deepEqual(service('home').data.games,[]);
  assert.equal(service('hidden_games').data[0].id,'game-33');
  assert.equal(service('set_game_hidden',{id:'game-33',hidden:false}).ok,true);
  fs.renameSync(exe,exe+'.off');
  assert.equal(service('home').data.games[0].available,false);
  assert.equal(service('game_detail',{id:'game-33',locale:'zh'}).data.counts.sessions,1);
 }finally{db.close();}
});
test('permanent deletion clears only the chosen game records and retains the installed executable',t=>{
 const {root,file,service}=fixture(t),exe=file('games/fixture.exe'),db=openStore(root);
 try{
  db.prepare('INSERT INTO games(id,legacy_id,title,executable) VALUES(?,?,?,?)').run('game-7',7,'Fixture',exe);
  db.prepare('INSERT INTO games(id,legacy_id,title,executable) VALUES(?,?,?,?)').run('game-8',8,'Other','');
  for(const id of ['game-7','game-8']){
   db.prepare('INSERT INTO reading_sessions(game_id,started_at) VALUES(?,1)').run(id);
   db.prepare("INSERT INTO reading_events(game_id,text,read_at) VALUES(?,'line',1)").run(id);
   db.prepare("INSERT INTO saved_sentences(game_id,text,created_at,original) VALUES(?,'sentence',1,'{}')").run(id);
  }
  db.prepare('INSERT INTO preserved_records VALUES(?,?,?)').run('sessions','0',JSON.stringify({media_id:7}));
  assert.equal(service('remove_game',{id:'game-7',permanent:true}).ok,true);
  for(const table of ['reading_sessions','reading_events','saved_sentences'])assert.deepEqual(db.prepare('SELECT game_id FROM '+table).all().map(row=>row.game_id),['game-8']);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM preserved_records').get().n,0);
  assert.equal(fs.readFileSync(exe,'utf8'),'fixture');
  reconcile(root,[{title:'Fixture',exe,dir:path.dirname(exe)}],{restoreRemoved:true});
  assert.equal(service('home').data.games.find(game=>game.title==='Fixture').readingSeconds,0);
 }finally{db.close();}
});
