// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {openStore}=require('../services/store.cjs'),{AnkiSync}=require('../services/anki-sync.cjs');

test('later syncs reach words after 300 dictionary misses and still retry earlier misses',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-anki-lookups-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const notes=Array.from({length:301},(_,i)=>({noteId:i+1,word:'word'+i,status:2,reviews:[(i+1)*1000]}));
 const known=new Set(['word300']);let calls=[];
 async function sync(deck='Example',list=notes){
  const db=openStore(root);calls=[];
  try{return await new AnkiSync({db,config:{ankiDeck:deck},anki:{stats:async()=>list},
   resolveEntry:async word=>{calls.push(word);return known.has(word)?{id:notes.find(n=>n.word===word).noteId,spellings:[word]}:null;}
  }).run();}finally{db.close();}
 }
 assert.equal((await sync()).imported,0);assert.deepEqual(calls,notes.slice(0,300).map(n=>n.word));
 assert.equal((await sync('Other')).imported,0);assert.equal(calls[0],'word0');
 known.add('word0');
 const second=await sync();
 assert.equal(calls[0],'word300');assert.equal(calls.length,300);
 assert.equal(second.imported,2);assert.equal(second.reviews,2);
 const third=await sync();assert.equal(third.imported,0);assert.equal(third.reviews,0);
 assert.ok(calls.includes('word299'));
});

test('resuming lookups keeps the original update order for two notes matching the same word',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-anki-note-order-')),db=openStore(root);
 t.after(()=>{db.close();fs.rmSync(root,{recursive:true,force:true});});
 const notes=Array.from({length:301},(_,i)=>({noteId:i+1,word:'entry'+i,status:i===300?1:4}));
 let active=false;
 const sync=new AnkiSync({db,config:{},anki:{stats:async()=>notes},resolveEntry:async word=>
  active&&['entry2','entry300'].includes(word)?{id:10,spellings:['same entry']}:null});
 await sync.run();active=true;await sync.run();
 assert.equal(db.prepare('SELECT note_id FROM anki_links WHERE word_id=10').get().note_id,301);
 assert.equal(db.prepare('SELECT status FROM vocabulary WHERE id=10').get().status,1);
});
