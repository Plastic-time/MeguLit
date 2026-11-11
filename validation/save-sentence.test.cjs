// SPDX-License-Identifier: GPL-3.0-or-later
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {openStore}=require('../services/store.cjs'),saved=require('../services/saved-sentences.cjs'),{Reader}=require('../services/reader.cjs'),{kinds}=require('../services/account.cjs');
const ROOT=path.join(__dirname,'..');
function temp(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'tome-sentence-'));fs.mkdirSync(path.join(root,'data','config'),{recursive:true});t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}

test('saving a line keeps one row per game and original text, and fills a missing translation',t=>{
 const db=openStore(temp(t));try{
  db.prepare("INSERT INTO games(id,title) VALUES('g1','Fixture')").run();
  const a=saved.save(db,{gameId:'g1',text:' 好きだよ。 ',translation:''},1000000);
  assert.equal(a.created,true);
  const b=saved.save(db,{gameId:'g1',text:'好きだよ。',translation:'喜欢你'});
  assert.equal(b.created,false);assert.equal(b.id,a.id);
  saved.save(db,{gameId:'g1',text:'好きだよ。',translation:'别的译文'});
  assert.deepEqual(db.prepare('SELECT text,translation FROM saved_sentences').all().map(r=>({...r})),[{text:'好きだよ。',translation:'喜欢你'}]);
  saved.save(db,{gameId:'g2',text:'好きだよ。'});
  assert.equal(db.prepare('SELECT COUNT(*) n FROM saved_sentences').get().n,2);
  assert.equal(saved.state(db,{gameId:'g1',text:'好きだよ。'}).saved,true);
  assert.equal(saved.remove(db,{gameId:'g1',text:'好きだよ。'}).deleted,true);
  assert.equal(saved.state(db,{gameId:'g1',text:'好きだよ。'}).saved,false);
  assert.equal(saved.remove(db,{id:saved.find(db,'g2','好きだよ。').id}).deleted,true);
  assert.throws(()=>saved.save(db,{gameId:'g1',text:'   '}),/INVALID_SENTENCE/);
  assert.throws(()=>saved.save(db,{text:'あ'.repeat(3001)}),/INVALID_SENTENCE/);
 }finally{db.close();}
});

test('the reader saves the shown line for the attached game and toggles it off again',async t=>{
 const root=temp(t),events=[];
 const runtime={root,folder:path.join(root,'data','config'),emit:(name,payload)=>events.push(payload),config:()=>({}),learning:()=>({installed:()=>true})};
 const reader=new Reader(runtime);reader.gameId='g1';
 {const db=openStore(root);db.prepare("INSERT INTO games(id,title) VALUES('g1','Fixture')").run();db.close();}
 let r=await reader.message({type:'sentenceState',text:'台詞です'});
 assert.deepEqual(r.replies,[{method:'sentenceState',args:['台詞です',false,'']}]);
 r=await reader.message({type:'sentenceSave',text:'台詞です',translation:'这是台词'});
 assert.deepEqual(r.replies,[{method:'sentenceState',args:['台詞です',true,'']}]);
 assert.ok(events.some(e=>e?.type==='sentence-saved'));
 await reader.message({type:'sentenceSave',text:'台詞です',translation:'这是台词'});
 let db=openStore(root);try{assert.deepEqual({...db.prepare('SELECT game_id,text,translation FROM saved_sentences').get()},{game_id:'g1',text:'台詞です',translation:'这是台词'});assert.equal(db.prepare('SELECT COUNT(*) n FROM saved_sentences').get().n,1);
  /* the account sync record carries the new sentence with its game title */
  const records=[...kinds.sentences.collect(db).values()];assert.equal(records.length,1);assert.equal(records[0].game,'Fixture');assert.equal(records[0].translation,'这是台词');
 }finally{db.close();}
 r=await reader.message({type:'sentenceDelete',text:'台詞です'});
 assert.deepEqual(r.replies,[{method:'sentenceState',args:['台詞です',false,'']}]);
 db=openStore(root);try{assert.equal(db.prepare('SELECT COUNT(*) n FROM saved_sentences').get().n,0);}finally{db.close();}
 r=await reader.message({type:'sentenceSave',text:''});
 assert.equal(r.replies[0].args[2],'INVALID_SENTENCE');
});

test('the app bridge, reader module and sentences page are wired to the same save path',()=>{
 const bridge=fs.readFileSync(path.join(ROOT,'services/bridge.cjs'),'utf8');
 for(const name of ['sentence_save','sentence_delete','sentence_state'])assert.match(bridge,new RegExp("case '"+name+"'"));
 assert.ok(JSON.parse(fs.readFileSync(path.join(ROOT,'web/reader/modules.json'),'utf8')).includes('save-sentence'));
 assert.match(fs.readFileSync(path.join(ROOT,'web/reader/module-list.js'),'utf8'),/"save-sentence"/);
 const mod=fs.readFileSync(path.join(ROOT,'web/reader/modules/save-sentence.js'),'utf8');
 for(const type of ['sentenceSave','sentenceDelete','sentenceState'])assert.match(mod,new RegExp("type:[^,]*'"+type+"'"));
 assert.match(mod,/tomoyo-menu-header/);
 const app=fs.readFileSync(path.join(ROOT,'web/app.js'),'utf8');
 assert.match(app,/收藏这一句/);assert.match(app,/この台詞を保存/);assert.match(app,/Save this line/);
 assert.match(app,/sentence_delete/);
});
