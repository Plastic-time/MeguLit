// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto');
const store=require('../services/store.cjs'),sentences=require('../services/saved-sentences.cjs');
const saved=require('../services/saved-line-voice.cjs'),voices=require('../services/game-voice.cjs');
const clip=require('../core/voice-trim.cjs').wav(new Int16Array(8000),8000);

test('saved and runtime recordings stay independently available as either copy is removed',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'recorded-voice-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const text='今日は晴れています。',db=store.openStore(root);
 let id;try{({id}=sentences.save(db,{text}));}finally{db.close();}
 const runtime=path.join(root,'data','voice-cache','runtime',voices.keyOf(text)+'.wav');
 assert.ok(voices.remember(root,text,clip));
 const items=[{id,text},{id},{text}];
 assert.deepEqual(saved.has(root,items),[true,true,true]);
 const rec=await saved.attach({root},id,text);
 assert.equal(rec.kind,'file');const file=path.join(root,'data','saved-voice',rec.file);
 fs.unlinkSync(runtime);
 assert.deepEqual(saved.has(root,items),[true,true,false]);
 assert.deepEqual((await saved.play(root,{id})).data,clip);
 fs.unlinkSync(file);
 assert.deepEqual(saved.has(root,items),[false,false,false]);
 assert.equal(await saved.play(root,{id}),null);
 assert.ok(voices.remember(root,text,clip));
 assert.deepEqual(saved.has(root,items),[true,true,true]);
 assert.deepEqual((await saved.play(root,{id})).data,clip);
});

test('a quiet sentence cannot fall back to a stale runtime recording',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'quiet-voice-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const text='雨が降っています。',key=voices.keyOf(text);
 assert.ok(voices.remember(root,text,clip));
 const quiet=path.join(root,'data','voice-cache','quiet');fs.mkdirSync(quiet);
 fs.writeFileSync(path.join(quiet,'1234567890abcdef.bin'),Buffer.from(key.slice(0,12),'hex'));
 voices._reset();assert.equal(voices.verdict(root,text),'quiet');
 assert.deepEqual(saved.has(root,[{text}]),[false]);
 assert.equal(await saved.play(root,{text}),null);
});

test('an index entry alone cannot advertise a missing or truncated recording',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'missing-voice-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const text='風が吹いています。';assert.ok(voices.remember(root,text,clip));
 const file=voices.runtimeFile(root,voices.keyOf(text),'.wav');
 fs.truncateSync(file,3);assert.equal(voices.has(root,text),false);
 fs.unlinkSync(file);assert.equal(voices.has(root,text),false);
 fs.mkdirSync(file);assert.equal(voices.has(root,text),false);
 assert.equal(voices.entry(root,text).ref,'runtime');
});

test('a saved script reference plays its cached clip without a text index entry',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'indexed-voice-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const text='花が咲きました。',g='1234567890abcdef',ref='sample',db=store.openStore(root);
 let id;try{
  ({id}=sentences.save(db,{text}));
  db.prepare('UPDATE saved_sentences SET original=? WHERE id=?').run(JSON.stringify({voice:{kind:'scan',g,ref}}),id);
 }finally{db.close();}
 const dir=path.join(root,'data','voice-cache',g);fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,createHash('sha1').update(ref).digest('hex')+'.wav'),clip);
 assert.deepEqual(saved.has(root,[{id},{text}]),[true,false]);
 assert.deepEqual((await saved.play(root,{id})).data,clip);
});
