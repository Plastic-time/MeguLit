// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// services/runtime-cg.cjs and its card wall source, against a dump folder laid out the way RuntimeCg.cpp writes it (the
// native side, with a stand-in game that shows some CGs and only preloads others, is native/runtimedump/selftest/run.ps1).
// No game is involved.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const PNG=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6364f8ffbf1e000502027fa1d5d9a40000000049454e44ae426082','hex');

function setup(){
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-rtcg-'));process.env.MEGULIT_RUNTIME_DUMP=path.join(base,'dump');
 for(const m of ['../services/runtime-dump.cjs','../services/runtime-cg.cjs','../services/card-wall.cjs'])delete require.cache[require.resolve(m)];
 const rd=require('../services/runtime-dump.cjs'),cg=require('../services/runtime-cg.cjs'),wall=require('../services/card-wall.cjs');
 wall._setRunner(jobs=>jobs.map(j=>{fs.mkdirSync(path.dirname(j.out),{recursive:true});fs.copyFileSync(j.in,j.out);return {ok:true,w:800,h:600};}));
 wall._setSpawnWarm(()=>{});
 const game=path.join(base,'Game');fs.mkdirSync(game);const exe=path.join(game,'game.exe');fs.writeFileSync(exe,'');
 const dir=rd.enable(game);fs.mkdirSync(path.join(dir,'cg'));
 const root=path.join(base,'megulit');fs.mkdirSync(root);
 const db={prepare:()=>({get:id=>id==='g1'?{id:'g1',title:'t',executable:exe,cover:''}:undefined,all:()=>[]})};
 return {base,game,exe,dir,root,db,cg,wall};}
const line=o=>JSON.stringify(o)+'\n';

test('lists recorded CGs once per CRC; skips missing files, bad names and paths out of the cg folder',()=>{
 const {dir,exe,cg}=setup();
 fs.writeFileSync(path.join(dir,'cg','04ff87f9_800x600.png'),PNG);fs.writeFileSync(path.join(dir,'cg','e83e8972_800x600.jpg'),PNG);fs.writeFileSync(path.join(dir,'secret.png'),PNG);
 fs.writeFileSync(path.join(dir,'cg.jsonl'),
  line({file:'cg/04ff87f9_800x600.png',source:'data.pak',how:'inplace',crc:'04ff87f9',w:800,h:600,fmt:'png'})+
  line({file:'cg/04ff87f9_800x600.png',source:'data.pak',how:'alloc',crc:'04ff87f9',w:800,h:600,fmt:'png'})+
  line({file:'cg/e83e8972_800x600.jpg',source:'gallery_c.jpg',how:'plain',crc:'e83e8972',w:800,h:600,fmt:'jpg'})+
  line({file:'cg/deadbeef_800x600.png',crc:'deadbeef',fmt:'png'})+
  line({file:'../secret.png',crc:'11111111',fmt:'png'})+'not json\n');
 const l=cg.list(exe);assert.deepEqual(l.map(x=>x.crc),['04ff87f9','e83e8972']);assert.equal(l[0].how,'inplace');
 assert.deepEqual(cg.sources(exe).map(s=>s.id),['mem:04ff87f9','mem:e83e8972']);
 assert.deepEqual(cg.list(path.join(path.dirname(exe),'..','Other','x.exe')),[]);});

test('card wall: recorded CGs are unlocked and openable; nothing else from memory is',()=>{
 const {dir,root,db,wall}=setup();
 fs.writeFileSync(path.join(dir,'cg','04ff87f9_800x600.png'),PNG);
 fs.writeFileSync(path.join(dir,'cg.jsonl'),line({file:'cg/04ff87f9_800x600.png',source:'data.pak',how:'inplace',crc:'04ff87f9',w:800,h:600,fmt:'png'}));
 const ids=wall.unlocked(db,root,'g1').map(x=>x.id);assert.deepEqual(ids,['mem:04ff87f9']);
 assert.match(wall.image(db,root,'g1','mem:04ff87f9').src,/^data:image\/png/);
 assert.throws(()=>wall.image(db,root,'g1','mem:9dc86319'),/CARD_SOURCE_LOCKED/);});

test('a TLG record (never confirmed by the DLL) is not offered as a picture',()=>{
 const {dir,exe,cg}=setup();fs.writeFileSync(path.join(dir,'cg','aaaaaaaa_800x600.tlg'),Buffer.from('TLG5.0\0raw'));
 fs.writeFileSync(path.join(dir,'cg.jsonl'),line({file:'cg/aaaaaaaa_800x600.tlg',crc:'aaaaaaaa',fmt:'tlg'}));
 assert.equal(cg.list(exe).length,1);assert.deepEqual(cg.sources(exe),[]);});

test('R18 filter: memory CGs (never rated) are left out',()=>{
 const {dir,root,db,wall}=setup();fs.writeFileSync(path.join(dir,'cg','04ff87f9_800x600.png'),PNG);
 fs.writeFileSync(path.join(dir,'cg.jsonl'),line({file:'cg/04ff87f9_800x600.png',crc:'04ff87f9',fmt:'png'}));
 fs.mkdirSync(path.join(root,'data','config'),{recursive:true});fs.writeFileSync(path.join(root,'data','config','native-preferences.json'),JSON.stringify({safe_cg:true}));
 assert.deepEqual(wall.unlocked(db,root,'g1').map(x=>x.id),[]);});

// End to end with the native self-test output, when it has been run on this machine (run.ps1 writes it).
test('native self-test output: shown CGs readable, the preloaded one absent',{skip:!fs.existsSync(path.join(process.env.MEGULIT_WORK||'H:\\MeguLit-Work','runtime-dump-selftest','out64'))},()=>{
 const work=path.join(process.env.MEGULIT_WORK||'H:\\MeguLit-Work','runtime-dump-selftest');
 process.env.MEGULIT_RUNTIME_DUMP=path.join(work,'out64');delete require.cache[require.resolve('../services/runtime-dump.cjs')];delete require.cache[require.resolve('../services/runtime-cg.cjs')];
 const cg=require('../services/runtime-cg.cjs');const l=cg.list(path.join(work,'game64','host.exe'));
 assert.deepEqual(l.map(x=>x.fmt).sort(),['jpg','png']);for(const x of l){assert.equal(x.w,800);assert.equal(x.h,600);}});
