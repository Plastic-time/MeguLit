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
 assert.deepEqual(r.replies,[{method:'sentenceState',args:['台詞です',false,'',false]}]);
 r=await reader.message({type:'sentenceSave',text:'台詞です',translation:'这是台词'});
 assert.deepEqual(r.replies,[{method:'sentenceState',args:['台詞です',true,'',true]}]);
 assert.ok(events.some(e=>e?.type==='sentence-saved'));
 await reader.message({type:'sentenceSave',text:'台詞です',translation:'这是台词'});
 let db=openStore(root);try{assert.deepEqual({...db.prepare('SELECT game_id,text,translation FROM saved_sentences').get()},{game_id:'g1',text:'台詞です',translation:'这是台词'});assert.equal(db.prepare('SELECT COUNT(*) n FROM saved_sentences').get().n,1);
  /* the account sync record carries the new sentence with its game title */
  const records=[...kinds.sentences.collect(db).values()];assert.equal(records.length,1);assert.equal(records[0].game,'Fixture');assert.equal(records[0].translation,'这是台词');
 }finally{db.close();}
 r=await reader.message({type:'sentenceDelete',text:'台詞です'});
 assert.deepEqual(r.replies,[{method:'sentenceState',args:['台詞です',false,'',false]}]);
 db=openStore(root);try{assert.equal(db.prepare('SELECT COUNT(*) n FROM saved_sentences').get().n,0);}finally{db.close();}
 r=await reader.message({type:'sentenceSave',text:''});
 assert.equal(r.replies[0].args[2],'INVALID_SENTENCE');
});

function loadModule(){
 const sent=[],listeners={};
 const window={__tomoyoChinese:{},__tomoyoTranslateRequest:m=>sent.push(JSON.parse(m)),__tomeI18n:{get:()=>'zh'}};
 const context={window,document:{querySelectorAll:()=>[]},addEventListener:(n,f)=>{listeners[n]=f;},setTimeout:()=>0,Error,Promise,Map,Set,Number,String,Math};
 require('node:vm').runInNewContext(fs.readFileSync(path.join(ROOT,'web/reader/modules/save-sentence.js'),'utf8'),context);
 return {b:window.__tomoyoChinese,sent,listeners};
}

test('a short word or phrase inside a longer line counts as a phrase; whole lines and sentence ends do not',()=>{
 const {b}=loadModule(),p=b.isPhraseSelection,line='今日はとても良い天気ですね。';
 assert.equal(p(line,3,6),true);
 assert.equal(p(line,0,[...line].length),false);
 assert.equal(p(line,8,14),false);
 assert.equal(p(line,0,12),false);
 assert.equal(p('',0,1),false);assert.equal(p(line,5,5),false);
 assert.equal(p('𠮷野家に行こう',0,3),true);
});

test('Anki from a drag-selected phrase saves its line once; whole-line selections are left alone',async()=>{
 const {b,sent}=loadModule(),keep=b.savedSentences,line='今日はとても良い天気ですね。';
 assert.deepEqual({...await keep.autoSave({text:line,start:0,end:[...line].length})},{saved:false,created:false});
 assert.equal(sent.length,0);
 const first=keep.autoSave({text:line,start:3,end:6});
 assert.equal(sent.at(-1).type,'sentenceSave');assert.equal(sent.at(-1).text,line);
 b.sentenceState(line,true,'',true);
 assert.deepEqual({...await first},{saved:true,created:true});
 assert.deepEqual({...await keep.autoSave({text:line,start:6,end:8})},{saved:true,created:false});
 assert.equal(sent.length,1);
 const off=keep.remove(line);assert.equal(sent.at(-1).type,'sentenceDelete');b.sentenceState(line,false,'',false);
 assert.deepEqual({...await off},{saved:false,created:false});assert.equal(keep.isSaved(line),false);
 const bad=keep.save(line);b.sentenceState(line,false,'INVALID_SENTENCE');await assert.rejects(bad,/INVALID_SENTENCE/);
});

test('the bridge, drag-selection card and sentences page are wired to the same save path',()=>{
 const bridge=fs.readFileSync(path.join(ROOT,'services/bridge.cjs'),'utf8');
 for(const name of ['sentence_save','sentence_delete','sentence_state'])assert.match(bridge,new RegExp("case '"+name+"'"));
 assert.ok(JSON.parse(fs.readFileSync(path.join(ROOT,'web/reader/modules.json'),'utf8')).includes('save-sentence'));
 assert.match(fs.readFileSync(path.join(ROOT,'web/reader/module-list.js'),'utf8'),/"save-sentence"/);
 const selection=fs.readFileSync(path.join(ROOT,'web/reader/modules/selection.js'),'utf8');
 assert.match(selection,/const drag=!result;/);assert.match(selection,/decorateWordActions\?\.\(card,args,result,\{drag\}\)/);
 const v4=fs.readFileSync(path.join(ROOT,'web/reader/modules/v4.js'),'utf8');
 assert.match(v4,/if\(opts\.drag&&keep\)\{/);assert.match(v4,/keep\.autoSave\(args\)/);
 assert.doesNotMatch(fs.readFileSync(path.join(ROOT,'web/reader/modules/save-sentence.js'),'utf8'),/tomoyo-menu-header|keydown/);
 const app=fs.readFileSync(path.join(ROOT,'web/app.js'),'utf8');
 assert.match(app,/拖动选取一段文字/);assert.match(app,/ドラッグして選択/);assert.match(app,/Drag to select/);
 assert.match(app,/sentence_delete/);
});
