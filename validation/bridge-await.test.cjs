'use strict';
/* User (v1.4.3): picking a Japanese level on the learning page showed SERVICE_FAILED, and the picker never came back.
   service-errors.log: "learning_level_set Error: database is not open". The bridge returned the handler's promise
   without awaiting it, so its finally closed the database while the handler was still marking grammar points; the
   level file had already been written, so the first-visit picker no longer showed. Every action is now awaited before
   the database closes, and the level is written only after the marking succeeded. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-bridge-await-'));process.env.MEGULIT_ROOT=root;
const {dispatch}=require('../services/bridge.cjs'),{openStore}=require('../services/store.cjs');
test.after(()=>{try{fs.rmSync(root,{recursive:true,force:true});}catch{}});

test('choosing a level through the bridge marks the grammar below it and saves the level',async()=>{
 openStore(root).close();
 for(const level of ['N4','N2','N0']){
  const r=await dispatch({action:'learning_level_set',level,kana:['あ','い']});
  assert.equal(r.level,level);assert.ok(r.applied.grammar>=0);
  assert.equal((await dispatch({action:'learning_level'})).level,level);
 }
 const db=openStore(root);try{const n=db.prepare('SELECT COUNT(*) n FROM grammar_progress WHERE learned_at IS NOT NULL').get().n;assert.ok(n>=21,'N5 points and more are learned: '+n);}finally{db.close();}
});

test('a failed choice saves no level, so the picker shows again',async()=>{
 const fresh=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-level-fail-'));
 try{const L=require('../services/learning-level.cjs');const broken={prepare(){throw Error('database is not open');},exec(){throw Error('database is not open');}};
  await assert.rejects(L.set(broken,fresh,{level:'N3',kana:[]}),/database is not open/);
  assert.equal(L.get(fresh).level,null);}
 finally{fs.rmSync(fresh,{recursive:true,force:true});}
});

test('every bridge action is awaited before the database closes',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','services','bridge.cjs'),'utf8');
 assert.match(src,/try \{return await \(async\(\)=>\{/);assert.match(src,/\}\)\(\);\}finally\{db\.close\(\);\}/);
});

test('a level left behind by the failed v1.4.3 choice shows the picker again; finished choices stay',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-level-old-')),L=require('../services/learning-level.cjs'),file=path.join(dir,'data','learning-level.json');fs.mkdirSync(path.dirname(file),{recursive:true});
 try{
  fs.writeFileSync(file,JSON.stringify({level:'N3',setAt:1}));assert.equal(L.get(dir).level,null,'N4+ without done: the marking never ran');
  fs.writeFileSync(file,JSON.stringify({level:'N5',setAt:1}));assert.equal(L.get(dir).level,'N5','N5 and below never touched the database, so they were fine');
  fs.writeFileSync(file,JSON.stringify({level:'N3',setAt:1,done:true}));assert.equal(L.get(dir).level,'N3');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
