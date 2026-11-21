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

test('identical saved lines only list words collected from the same game',t=>{
 const db=openStore(temp(t)),line='明日は晴れる。';
 try{
  const word=db.prepare("INSERT INTO vocabulary(id,spelling,reading,definitions,created_at,original) VALUES(?,?,'','[]',1,'{}')");
  const example=db.prepare("INSERT INTO examples(word_id,game_id,text,original) VALUES(?,?,?,'{}')");
  for(const [id,game,spelling] of [[1,'a','明日'],[2,'b','晴れる'],[3,null,'は']]){
   saved.save(db,{gameId:game,text:line});
   word.run(id,spelling);
   example.run(id,game,line);
  }
  example.run(2,'a','別の文。');
  example.run(1,'a',line);
  db.prepare('INSERT INTO examples(word_id,game_id,text,original) VALUES(2,NULL,?,?)').run(line,JSON.stringify({sync:true,game:'Élan'}));
  const rows=saved.list(db);
  assert.deepEqual(rows.map(r=>[r.game_id,r.words.map(w=>w.id)]),[[null,[3]],['b',[2]],['a',[1]]]);
  db.prepare('UPDATE saved_sentences SET original=? WHERE game_id IS NULL').run(JSON.stringify({sync:true,game:'élan'}));
  assert.deepEqual(saved.list(db)[0].words.map(w=>w.id),[2]);
  assert.equal(saved.state(db,{gameId:null,text:line}).saved,false);
  assert.equal(saved.save(db,{gameId:null,text:line}).created,true);
  require('../services/learning-insights.cjs').saveWord(db,{id:2},{gameId:null,text:line});
  const pending=saved.list(db).filter(r=>r.game_id==null);
  assert.deepEqual(pending.map(r=>r.words.map(w=>w.id)),[[3,2],[2]]);
 }finally{db.close();}
});

test('mining and syncing the same word in the same line keeps one example per game',async t=>{
 const root=temp(t),db=openStore(root),reader=new Reader({root,folder:path.join(root,'data','config')});
 const entry={id:8,spellings:['明日'],readings:['あした']},ctx={now:Date.now};
 const saveWord=require('../services/learning-insights.cjs').saveWord;
 const sql=(command,query,values)=>require('../services/legacy-reader-sql.cjs').request(root,'plugin:sql|'+command,{db:'sqlite:immersion.db',query,values});
 const check='SELECT id FROM word_sentences WHERE word_id = $1 AND sentence_text = $2 AND media_id IS $3';
 const insert='INSERT INTO word_sentences (word_id,sentence_text,highlight_start,highlight_end,media_id) VALUES ($1,$2,$3,$4,$5)';
 try{
  db.exec("INSERT INTO games(id,title,legacy_id) VALUES('a','First',1),('b','Second',2)");
  for(const [game,media] of [['a',1],['b',2],[null,null]]){
   reader.gameId=game;
   for(let i=0;i<2;i++){
    await reader.mine({entry,args:{text:'明日は晴れ。'},noteId:1});
    saveWord(db,entry,{gameId:game,text:'明日は雨。'});
    assert.equal(sql('select',check,[8,'明日は雪。',media]).length,i);
    assert.equal(sql('execute',insert,[8,'明日は雪。',0,2,media]).rowsAffected,1-i);
   }
  }
  assert.deepEqual(saved.list(db).map(r=>r.words.map(w=>w.id)),[[8],[8],[8]]);
  const [record]=kinds.words.collect(db).values();
  assert.equal(record.examples.length,9);
  db.exec('DELETE FROM examples');
  for(let i=0;i<2;i++)kinds.words.apply(db,'明日\tあした',{data:record},root,ctx);
  const rows=db.prepare('SELECT game_id,COUNT(*) n FROM examples GROUP BY game_id ORDER BY game_id').all();
  assert.deepEqual(rows.map(r=>[r.game_id,r.n]),[[null,3],['a',3],['b',3]]);
 }finally{db.close();}
});

test('the Anki callback schedules sync without re-mining a word saved by the host',async t=>{
 const root=temp(t),delays=[],window={__TAURI_INTERNALS__:{invoke:(command,args)=>{
  return require('../services/legacy-reader-sql.cjs').request(root,command,args);
 }}};
 const context={window,history:{pushState(){},replaceState(){}},location:{hostname:'tauri.localhost',pathname:'/'},localStorage:{getItem:()=>null},
  document:{documentElement:{},body:{},head:{append(){}},createElement:()=>({})},addEventListener(){},
  setTimeout:(f,ms)=>delays.push(ms),clearTimeout(){},setInterval(){},console};
 require('node:vm').runInNewContext(fs.readFileSync(path.join(ROOT,'web/reader/modules/anki-sync.js'),'utf8'),context);
 const entry={id:5,spellings:['晴れ'],readings:['はれ']},args={text:'明日は晴れ。'};
 await window.__tomeAnkiMined({entry,args,noteId:8,wordMined:true});
 assert.equal(delays.at(-1),4000);
 const afterHost=openStore(root);
 try{assert.equal(afterHost.prepare('SELECT COUNT(*) n FROM examples').get().n,0);}finally{afterHost.close();}
 await window.__tomeAnkiMined({entry,args,noteId:8});
 const db=openStore(root);
 try{assert.deepEqual({...db.prepare('SELECT game_id,text FROM examples').get()},{game_id:null,text:args.text});}finally{db.close();}
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

test('source: manual upgrades an auto row, auto never downgrades, and old tables migrate to manual',t=>{
 const root=temp(t);
 const db=openStore(root);try{
  assert.ok(db.prepare('PRAGMA table_info(saved_sentences)').all().some(c=>c.name==='source'));
  db.exec('ALTER TABLE saved_sentences DROP COLUMN source');
  db.prepare("INSERT INTO saved_sentences(game_id,text,translation,created_at,original) VALUES('g1','古い文','',1,'{}')").run();
  saved.migrate(db);
  assert.equal(db.prepare('SELECT source FROM saved_sentences').get().source,'manual');
  assert.equal(saved.save(db,{gameId:'g1',text:'新しい文',source:'auto'}).source,'auto');
  assert.equal(saved.save(db,{gameId:'g1',text:'新しい文',source:'manual'}).source,'manual');
  assert.equal(saved.save(db,{gameId:'g1',text:'新しい文',source:'auto'}).source,'manual');
  assert.equal(saved.save(db,{gameId:'g1',text:'別の文',source:'bogus'}).source,'manual');
 }finally{db.close();}
});

test('every Anki card keeps its line as auto once, and the sentences list carries the words added from it',async t=>{
 const root=temp(t);
 const runtime={root,folder:path.join(root,'data','config'),emit:()=>{},config:()=>({}),learning:()=>({installed:()=>true})};
 const reader=new Reader(runtime);reader.gameId='g1';
 {const db=openStore(root);db.prepare("INSERT INTO games(id,title) VALUES('g1','Fixture')").run();db.close();}
 const line='言葉を覚える';
 assert.deepEqual(await reader.mine({entry:{id:1,spellings:['言葉'],readings:['ことば'],definitions:['word']},args:{text:line,start:0,end:2,translation:'记住词语'},noteId:7}),{sentenceSaved:true});
 assert.deepEqual(await reader.mine({entry:{id:2,spellings:['覚える'],readings:['おぼえる'],definitions:['remember']},args:{text:line,start:3,end:6},noteId:8}),{sentenceSaved:false});
 const db=openStore(root);try{
  const rows=saved.list(db);assert.equal(rows.length,1);
  assert.equal(rows[0].source,'auto');assert.equal(rows[0].translation,'记住词语');assert.equal(rows[0].title,'Fixture');
  assert.deepEqual(rows[0].words.map(w=>w.spelling),['言葉','覚える']);
  assert.equal(saved.list(db,{source:'manual'}).length,0);assert.equal(saved.list(db,{source:'auto'}).length,1);
  /* account sync: auto rows say so; manual rows keep the old record shape (no re-push of every sentence) */
  let rec=[...kinds.sentences.collect(db).values()][0];assert.equal(rec.source,'auto');
  saved.save(db,{gameId:'g1',text:line,source:'manual'});
  rec=[...kinds.sentences.collect(db).values()][0];assert.equal('source' in rec,false);
  /* a synced auto record lands as auto on the other PC */
  db.exec('DELETE FROM saved_sentences');
  kinds.sentences.apply(db,'s:'+require('node:crypto').createHash('sha256').update(line).digest('hex').slice(0,32),{data:{text:line,translation:'',created_at:5,game:'Fixture',source:'auto'}});
  assert.deepEqual(db.prepare('SELECT game_id,source FROM saved_sentences').all().map(r=>({...r})),[{game_id:'g1',source:'auto'}]);
 }finally{db.close();}
});

test('the drag card learns about an auto-kept line without asking again',async()=>{
 const {b,sent}=loadModule(),keep=b.savedSentences,line='今日はいい天気。';
 let changed=0;keep.onChange(()=>changed++);
 keep.markSaved(line);assert.equal(keep.isSaved(line),true);assert.equal(changed,1);assert.equal(sent.length,0);
 const off=keep.remove(line);assert.equal(sent.at(-1).type,'sentenceDelete');b.sentenceState(line,false,'',false);
 assert.deepEqual({...await off},{saved:false,created:false});assert.equal(keep.isSaved(line),false);
 const bad=keep.save(line);assert.equal(sent.at(-1).type,'sentenceSave');b.sentenceState(line,false,'INVALID_SENTENCE');await assert.rejects(bad,/INVALID_SENTENCE/);
});

test('the bridge, drag-selection card and sentences page are wired to the same save path',()=>{
 const bridge=fs.readFileSync(path.join(ROOT,'services/bridge.cjs'),'utf8');
 for(const name of ['sentence_save','sentence_delete','sentence_state'])assert.match(bridge,new RegExp("case '"+name+"'"));
 assert.ok(JSON.parse(fs.readFileSync(path.join(ROOT,'web/reader/modules.json'),'utf8')).includes('save-sentence'));
 assert.match(fs.readFileSync(path.join(ROOT,'web/reader/module-list.js'),'utf8'),/"save-sentence"/);
 const selection=fs.readFileSync(path.join(ROOT,'web/reader/modules/selection.js'),'utf8');
 assert.match(selection,/const drag=!result;/);assert.match(selection,/decorateWordActions\?\.\(card,args,result,\{drag\}\)/);
 const v4=fs.readFileSync(path.join(ROOT,'web/reader/modules/v4.js'),'utf8');
 assert.match(v4,/if\(keep\)\{/,'收藏句子 shows on every lookup card, click lookups too');assert.match(v4,/value\.sentenceSaved&&keep/);
 assert.doesNotMatch(fs.readFileSync(path.join(ROOT,'web/reader/modules/save-sentence.js'),'utf8'),/tomoyo-menu-header|keydown/);
 const app=fs.readFileSync(path.join(ROOT,'web/app.js'),'utf8');
 assert.match(app,/拖动选取一段文字/);assert.match(app,/ドラッグして選択/);assert.match(app,/Drag to select/);
 assert.match(fs.readFileSync(path.join(ROOT,'web/sentences-page.js'),'utf8'),/sentence_delete/);assert.match(app,/data-word-sentence/);
});
