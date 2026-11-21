'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {openStore,migrate}=require('../services/store.cjs');
const {dialogue,HistoryTranslations}=require('../services/history-view.cjs');

test('history reuses migrated translations with no game while keeping other games separate',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'history-translation-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const dir=path.join(root,'migration','fixture');fs.mkdirSync(dir,{recursive:true});
 const source=new DatabaseSync(path.join(dir,'legacy.sqlite'));
 try{source.exec(`CREATE TABLE sentences(id,media_id,sentence_text,translation,created_at);
  CREATE TABLE word_sentences(id,word_id,media_id,sentence_text,translation,highlight_start,highlight_end,created_at);
  CREATE TABLE sentence_read_events(id,session_id,media_id,sentence_text,read_at);
  INSERT INTO sentences VALUES(1,7,'こんにちは','Other game',1),(2,NULL,'こんにちは','Saved greeting',2),(3,NULL,'明日の天気','　',3);
  INSERT INTO word_sentences VALUES(1,1,NULL,'明日の天気','Forecast',0,1,1);
  INSERT INTO sentence_read_events VALUES(1,NULL,NULL,'こんにちは',1),(2,NULL,NULL,'明日の天気',2),
    (3,NULL,8,'こんにちは',3),(4,NULL,NULL,'晴れた',4);`);
 }finally{source.close();}
 migrate(root,dir);
 const db=openStore(root);
 try{
  const account=require('../services/account.cjs'),ctx={now:()=>1000};account.ensureState(db);
  const key='s:'+require('node:crypto').createHash('sha256').update('こんにちは').digest('hex').slice(0,32);
  const remote={key,updated_at:1000,data:{text:'こんにちは',translation:'Synced greeting',game:'Pending game'}};
  account.applyRemote(db,root,'sentences',[remote],ctx);
  assert.equal(db.prepare("SELECT translation FROM saved_sentences WHERE json_extract(original,'$.game')='Pending game'").get()?.translation,'Synced greeting');
  db.prepare('INSERT INTO saved_sentences(text,translation,original,created_at) VALUES(?,?,?,1)').run('晴れた','Pending game','{"game":"Other game"}');
  db.prepare('INSERT INTO examples(word_id,text,translation,original) VALUES(1,?,?,?)').run('晴れた','Pending example','{"game":"Other game"}');
  db.prepare('INSERT INTO examples(word_id,text,translation,original) VALUES(1,?,?,?)').run('晴れた','\t　\n','{}');
  const byId=new Map(dialogue(db).map(row=>[row.id,row.translation]));
  assert.equal(byId.get(1),'Saved greeting');assert.equal(byId.get(2),'Forecast');
  assert.equal(byId.get(3),'');assert.equal(byId.get(4),'');
 }finally{db.close();}
 let calls=0;const translations=new HistoryTranslations(root,async()=>{calls++;return 'New translation';});
 assert.deepEqual(await translations.ensure(1),{id:1,text:'Saved greeting',cached:true});
 assert.deepEqual(await translations.ensure(2),{id:2,text:'Forecast',cached:true});
 assert.equal(calls,0);assert.equal((await translations.ensure(4)).cached,false);assert.equal(calls,1);
});

test('sync updates the full legacy sentence when the transmitted text is truncated',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'history-sync-')),db=openStore(root);
 t.after(()=>{db.close();fs.rmSync(root,{recursive:true,force:true});});
 const account=require('../services/account.cjs'),short='原'.repeat(3000),long=short+'本';
 const add=db.prepare('INSERT INTO saved_sentences(text,translation,created_at,original) VALUES(?,?,1,?)');
 add.run(short,'Short','{}');add.run(long,'Long','{}');
 const [key,data]=[...account.kinds.sentences.collect(db)].find(([,d])=>d.translation==='Long');
 assert.equal(data.text,short);
 account.ensureState(db);account.applyRemote(db,root,'sentences',[{key,updated_at:1000,data:{...data,translation:'Revised'}}],{now:()=>1000});
 assert.deepEqual(db.prepare('SELECT translation FROM saved_sentences ORDER BY id').all().map(r=>r.translation),['Short','Revised']);
});
