// SPDX-License-Identifier: GPL-3.0-or-later
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const store=require('../services/store.cjs');
const {deleteWord,restoreWord,cleanUiState}=require('../services/bridge.cjs');

function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'tome-final-test-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const snapshot=path.join(root,'migration','baseline-20261103');fs.mkdirSync(path.join(snapshot,'config'),{recursive:true});
 const source=new DatabaseSync(path.join(snapshot,'legacy.sqlite'));
 source.exec(`CREATE TABLE media(id INTEGER PRIMARY KEY,title TEXT,cover_path TEXT,status TEXT);
 CREATE TABLE words(id INTEGER PRIMARY KEY,spelling TEXT,reading TEXT,definitions TEXT,status INTEGER,created_at INTEGER,image_path TEXT);
 CREATE TABLE word_sentences(id INTEGER PRIMARY KEY,word_id INTEGER,media_id INTEGER,sentence_text TEXT,translation TEXT,highlight_start INTEGER,highlight_end INTEGER,created_at INTEGER);
 CREATE TABLE sessions(id INTEGER PRIMARY KEY,media_id INTEGER,started_at INTEGER,ended_at INTEGER,moji_read INTEGER,sentences_read INTEGER);
 CREATE TABLE sentence_read_events(id INTEGER PRIMARY KEY,session_id INTEGER,media_id INTEGER,sentence_text TEXT,read_at INTEGER);
 CREATE TABLE lookup_events(id INTEGER PRIMARY KEY,media_id INTEGER,word_id INTEGER,surface_text TEXT,looked_up_at INTEGER);
 CREATE TABLE tome_anki_links(word_id INTEGER,note_id INTEGER);
 INSERT INTO media VALUES(1,'Test game','cover.png','active');
 INSERT INTO words VALUES(7,'言葉','ことば','["word"]',1,1000,NULL);
 INSERT INTO word_sentences VALUES(9,7,1,'言葉を覚える','Learn words',0,2,1000);
 INSERT INTO sessions VALUES(2,1,1000,1120,30,2);
 INSERT INTO sentence_read_events VALUES(8,2,1,'言葉を覚える',1010);
 INSERT INTO lookup_events VALUES(3,1,7,'言葉',1010);
 INSERT INTO tome_anki_links VALUES(7,1234567890);`);
 source.close();
 fs.writeFileSync(path.join(snapshot,'config','library.json'),JSON.stringify({games:[{mediaId:1,title:'Library title',exe:'C:/Test/Game.exe'},{mediaId:2,title:'Not yet in old media',exe:'C:/Test/Other.exe'}]}));
 return {root,snapshot};
}

test('migration preserves all works and complete per-table archival records',t=>{
 const {root}=fixture(t);const report=store.migrate(root);assert.equal(report.games,2);assert.equal(report.counts.words,1);
 const db=store.openStore(root);try{
  assert.equal(db.prepare('SELECT COUNT(*) n FROM games').get().n,2);
  assert.equal(db.prepare('SELECT text FROM examples').get().text,'言葉を覚える');
  assert.equal(db.prepare('SELECT active_seconds FROM reading_sessions').get().active_seconds,120);
  const link=JSON.parse(db.prepare("SELECT payload FROM preserved_records WHERE collection='tome_anki_links'").get().payload);assert.equal(link.note_id,1234567890);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='_sqlx_migrations' OR name='media'").get().n,0);
 }finally{db.close();}
});
test('migration is idempotent and never resets subsequent edits',t=>{
 const {root}=fixture(t);store.migrate(root);let db=store.openStore(root);db.prepare('UPDATE vocabulary SET status=2 WHERE id=7').run();db.close();
 assert.deepEqual(store.migrate(root),{alreadyMigrated:true});db=store.openStore(root);try{assert.equal(db.prepare('SELECT status FROM vocabulary WHERE id=7').get().status,2);}finally{db.close();}
});
test('a deleted upstream work remains archived but cannot reappear on migration or hide manual games',t=>{
 const {root}=fixture(t);store.migrate(root);const db=store.openStore(root);try{
  assert.deepEqual(store.games(db,root).map(game=>game.id),['game-1']);assert.ok(db.prepare("SELECT removed_at FROM games WHERE id='game-2'").get().removed_at);
  db.prepare("INSERT INTO games(id,title,source) VALUES('manual-1','Manual work','manual')").run();db.prepare("UPDATE games SET removed_at=100 WHERE id='game-1'").run();
 }finally{db.close();}store.migrate(root);const check=store.openStore(root);try{assert.deepEqual(store.games(check,root).map(game=>game.id),['manual-1']);assert.equal(check.prepare('SELECT COUNT(*) n FROM reading_sessions').get().n,1);assert.equal(store.games(check,root,{includeRemoved:true}).length,3);}finally{check.close();}
});
test('a failed import rolls back every imported row',t=>{
 const {root,snapshot}=fixture(t);const source=new DatabaseSync(path.join(snapshot,'legacy.sqlite'));source.prepare('UPDATE words SET spelling=NULL').run();source.close();
 assert.throws(()=>store.migrate(root));const db=store.openStore(root);try{assert.equal(db.prepare('SELECT COUNT(*) n FROM games').get().n,0);assert.equal(db.prepare("SELECT value FROM meta WHERE key='migration-complete'").get(),undefined);}finally{db.close();}
});
test('asset finalization can resume after a failure without reimporting records',t=>{
 const {root}=fixture(t);fs.mkdirSync(path.join(root,'data'),{recursive:true});fs.writeFileSync(path.join(root,'data','assets'),'block asset directory creation');
 assert.throws(()=>store.migrate(root));fs.unlinkSync(path.join(root,'data','assets'));
 const db=store.openStore(root);db.prepare('UPDATE vocabulary SET status=2 WHERE id=7').run();db.close();
 assert.deepEqual(store.migrate(root),{alreadyMigrated:true});assert.ok(fs.existsSync(path.join(root,'data','preferences.json')));assert.ok(fs.existsSync(path.join(root,'migration','migration-report.json')));
 const check=store.openStore(root);try{assert.equal(check.prepare('SELECT COUNT(*) n FROM vocabulary').get().n,1);assert.equal(check.prepare('SELECT status FROM vocabulary').get().status,2);}finally{check.close();}
});
test('local day uses calendar boundaries and splits cross-midnight reading',()=>{
 const date=new Date(2026,10,3,12),{start,end}=store.dayBounds(date);
 assert.equal(new Date(start*1000).getHours(),0);assert.equal(new Date(end*1000).getDate(),4);
 assert.equal(store.activeOnDay({started_at:start-120,ended_at:start+180,active_seconds:300},start,end),180);
 assert.equal(store.activeOnDay({started_at:end-60,ended_at:end+60,active_seconds:120},start,end),60);
 assert.equal(store.activeOnDay({started_at:start,ended_at:start,active_seconds:0},start,end),0);
});
test('word deletion and restoration retain definitions and example highlights',t=>{
 const {root}=fixture(t);store.migrate(root);const db=store.openStore(root);try{
  deleteWord(db,7);assert.equal(db.prepare('SELECT COUNT(*) n FROM vocabulary').get().n,0);
  const entry=db.prepare('SELECT id FROM word_trash').get();restoreWord(db,entry.id);
  assert.equal(db.prepare('SELECT definitions FROM vocabulary WHERE id=7').get().definitions,'["word"]');
  const example=db.prepare('SELECT * FROM examples WHERE word_id=7').get();assert.equal(example.highlight_end,2);assert.equal(example.translation,'Learn words');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM word_trash').get().n,0);
 }finally{db.close();}
});
test('recycle bin keeps the latest 30 complete snapshots',t=>{
 const {root}=fixture(t);store.migrate(root);const db=store.openStore(root);try{
  for(let id=100;id<133;id++){db.prepare('INSERT INTO vocabulary VALUES (?,?,?,?,?,?,?,?)').run(id,'word'+id,'reading','["meaning"]',0,1000,null,'{}');deleteWord(db,id);}
  assert.equal(db.prepare('SELECT COUNT(*) n FROM word_trash').get().n,30);
  assert.equal(db.prepare('SELECT MIN(word_id) n FROM word_trash').get().n,103);
 }finally{db.close();}
});
test('one lookup operation can only contribute one count',t=>{
 const {root}=fixture(t);store.migrate(root);const db=store.openStore(root);try{
  const insert=db.prepare('INSERT OR IGNORE INTO lookup_events(surface,occurred_at,operation_id) VALUES (?,?,?)');
  insert.run('言葉',1000,'operation-1');insert.run('言葉',1000,'operation-1');insert.run('言葉',1000,'operation-2');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM lookup_events WHERE operation_id IS NOT NULL').get().n,2);
 }finally{db.close();}
});
test('home statistics and last-played ordering come from actual stored data',t=>{
 const {root}=fixture(t);store.migrate(root);const db=store.openStore(root);try{
  db.prepare("INSERT INTO games(id,title,last_launched_at) VALUES('manual-new','A new manual game',5000)").run();
  const data=store.home(db,root,new Date(1010*1000));assert.equal(data.games[0].id,'manual-new');assert.equal(data.stats.words,1);assert.equal(data.stats.lookups,1);assert.equal(data.stats.readingSeconds,120);
 }finally{db.close();}
});
test('asset reads cannot escape the dedicated asset directory',t=>{
 const {root}=fixture(t);assert.equal(store.imageData(root,'covers','../private.json'),'');assert.equal(store.imageData(root,'covers','C:\\private.png'),'');
});
test('UI migration retains both namespaces and excludes credential-shaped keys',()=>{
 const values=cleanUiState({'tome-home-bg':'{"blur":8}','tome-log-position':'{"x":10}','tomoyo-ui-language':'ja','tomoyo-api-key':'never-import','tome-token':'never-import','unrelated':'ignore'});
 assert.deepEqual(Object.keys(values).sort(),['tome-home-bg','tome-log-position','tomoyo-ui-language']);
});
