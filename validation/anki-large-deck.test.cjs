// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Anki}=require('../core/anki.cjs'),{AnkiSync,link}=require('../services/anki-sync.cjs');
const {openStore}=require('../services/store.cjs');

function deck(count){
 const ids=Array.from({length:count},(_,i)=>i+1),batches=[];
 const anki=new Anki(async(_url,options)=>{
  const {action,params}=JSON.parse(options.body);let result;
  if(action==='findNotes')result=ids;
  else if(action==='notesInfo'){
   batches.push(params.notes.length);
   result=params.notes.map(id=>({noteId:id,cards:id===1||id===count?[id]:[]}));
  }else if(action==='cardsInfo')result=params.cards.map(cardId=>({cardId,type:2,queue:2,interval:21}));
  else if(action==='getReviewsOfCards')result=Object.fromEntries(params.cards.map(id=>[id,[{id:Number(id)*1000}]]));
  else throw Error('unexpected action '+action);
  return Response.json({result,error:null});
 });
 return {anki,batches};
}

test('empty and exactly full batches only request the notes present',async()=>{
 for(const count of [0,5000]){
  const {anki,batches}=deck(count);
  assert.equal((await anki.stats({})).length,count);assert.deepEqual(batches,count?[5000]:[]);
 }
});

test('the last note in a 5001-note deck syncs and a failed later batch can be retried',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-anki-large-')),db=openStore(root);
 t.after(()=>{db.close();fs.rmSync(root,{recursive:true,force:true});});
 for(const id of [1,5001]){
  db.prepare('INSERT INTO vocabulary VALUES(?,?,?,?,?,?,?,?)').run(id,'w'+id,'','[]',0,123,null,'{}');
  link(db,id,id);
 }
 const {anki,batches}=deck(5001),sync=new AnkiSync({db,config:{},anki});
 const fetcher=anki.fetch;
 anki.fetch=async(url,options)=>JSON.parse(options.body).params.notes?.[0]===5001?Response.json({error:'second batch unavailable'}):fetcher(url,options);
 await assert.rejects(sync.run(),/second batch unavailable/);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM review_events').get().n,0);
 anki.fetch=fetcher;batches.length=0;
 const first=await sync.run();
 assert.deepEqual(batches,[5000,1]);assert.equal(first.reviews,2);assert.equal(first.status,2);
 assert.equal(db.prepare('SELECT status FROM vocabulary WHERE id=5001').get().status,4);
 assert.equal((await sync.run()).reviews,0);
});
