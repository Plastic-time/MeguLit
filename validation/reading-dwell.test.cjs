// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {ReadingStatistics}=require('../services/reading-statistics.cjs'),{openStore}=require('../services/store.cjs');
function chars(root){const db=openStore(root);try{return db.prepare('SELECT SUM(characters) n FROM reading_sessions').get().n;}finally{db.close();}}
test('a rejected or rolled-back line preserves pending characters and can be retried',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-dwell-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const db=openStore(root);
 try{
  db.exec("INSERT INTO games(id,title) VALUES('a','A')");
  let now=1e12;
  const stats=new ReadingStatistics(root,()=>now);
  const line=(gameId,sequence,text)=>stats.line({gameId,sequence,text});
  assert.equal(line('a',1,'最初の文'),true);
  now+=5000;
  assert.equal(line('missing',2,'別の文'),false);
  db.exec("CREATE TRIGGER busy_write BEFORE INSERT ON reading_events BEGIN SELECT RAISE(ABORT,'write failed'); END");
  assert.throws(()=>line('a',2,'次の文'),/write failed/);
  assert.equal(chars(root),0);
  db.exec('DROP TRIGGER busy_write');
  assert.equal(line('a',2,'次の文'),true);
  assert.equal(line('a',2,'次の文'),false);
  now+=5000;
  stats.flush();stats.flush();
  assert.deepEqual({...db.prepare('SELECT COUNT(*) sessions,SUM(active_seconds) seconds,SUM(characters) chars,SUM(sentences) lines FROM reading_sessions').get()},
    {sessions:1,seconds:5,chars:7,lines:2});
 }finally{db.close();}
});
test('skipped lines are not credited as read characters (#79)',t=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-dwell-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const db=openStore(root);db.prepare('INSERT INTO games(id,title) VALUES(?,?)').run('a','A');db.close();let now=1e12;const stats=new ReadingStatistics(root,()=>now);
 const line='あいうえおかきくけこ';for(let i=1;i<=20;i++){stats.line({gameId:'a',text:line+i,sequence:i});now+=80;}
 assert.equal(chars(root),0);
 stats.line({gameId:'a',text:'ゆっくり読む文です',sequence:100});now+=10000;stats.line({gameId:'a',text:'次の文',sequence:101});
 assert.equal(chars(root),9);now+=5000;stats.reset();assert.equal(chars(root),12);});
