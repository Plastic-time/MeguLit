// SPDX-License-Identifier: GPL-3.0-or-later
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Reader}=require('../services/reader.cjs'),{ReadingStatistics}=require('../services/reading-statistics.cjs'),{openStore}=require('../services/store.cjs');
function setup(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'tome-reader-'));fs.mkdirSync(path.join(root,'data','config'),{recursive:true});t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const runtime={root,folder:path.join(root,'data','config'),emit:()=>{},config:()=>({}),learning:()=>({installed:()=>true,request:async(command,args)=>({command,text:args.text}),readings:{resolve:tokens=>tokens}}),local:()=>({ensure:async()=>{}})};return {root,runtime,reader:new Reader(runtime)};}
test('reader callbacks use typed JSON replies and local dictionary commands without upstream APIs',async t=>{const {reader}=setup(t);const response=await reader.message({type:'learningRequest',id:42,command:'lookup_exact',args:{text:'日本語',start:0,end:3}});assert.deepEqual(response.replies,[{method:'learningDeliver',args:[42,{command:'lookup_exact',text:'日本語'},'']}]);await assert.rejects(reader.invoke('plugin:sql|execute',{db:'sqlite:immersion.db',query:'DELETE FROM words'}),/LEGACY_SQL_NOT_SUPPORTED/);assert.throws(()=>reader.attach({pid:0,hwnd:'5'}),/INVALID_READER_WINDOW/);});
test('translation requests retain every line of the current page and invalidate old pages',async t=>{const {reader}=setup(t),seen=[];reader.translation={translate:async(text,options,current)=>{seen.push(current);return text+' translated';}};await reader.message({type:'pageTranslationScope',key:'page-1'});assert.equal((await reader.message({id:1,text:'一行',pageKey:'page-1'})).replies[0].args[1],'一行 translated');await reader.message({id:2,text:'二行',pageKey:'page-1'});assert(seen.every(current=>current()));await reader.message({type:'pageTranslationScope',key:'page-2'});assert(seen.every(current=>!current()));});
test('mining writes canonical vocabulary and examples once without a legacy SQL schema',async t=>{const {reader,root}=setup(t),request={entry:{id:123,spellings:['言葉'],readings:['ことば'],definitions:['word']},args:{text:'言葉を覚える',start:0,end:2,translation:'Learn words'},noteId:77};await reader.mine(request);await reader.mine(request);const db=openStore(root);try{assert.equal(db.prepare('SELECT COUNT(*) n FROM vocabulary').get().n,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM examples').get().n,1);assert.equal(db.prepare('SELECT highlight_end FROM examples').get().highlight_end,2);assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name IN ('words','media','word_sentences')").get().n,0);}finally{db.close();}});
test('hook statistics count new live sequences once, cap idle time, and retain real wall-clock bounds',t=>{const {root}=setup(t);let now=1000000;const stats=new ReadingStatistics(root,()=>now);let db=openStore(root);db.prepare("INSERT INTO games(id,title) VALUES('own-game','Fixture')").run();db.close();const line=(sequence,text='台詞'+sequence,extra={})=>stats.line({gameId:'own-game',text,sequence,...extra});assert.equal(line(1),true);assert.equal(line(1),false);now+=600000;assert.equal(line(2),true);assert.equal(line(3,'履歴',{origin:'history'}),false);assert.equal(line(4,'修復',{recovering:true}),false);db=openStore(root);try{const s=db.prepare('SELECT * FROM reading_sessions').get();assert.equal(s.sentences,2);assert.equal(s.active_seconds,180);assert.equal(s.ended_at-s.started_at,600);assert.equal(db.prepare('SELECT COUNT(*) n FROM reading_events').get().n,2);}finally{db.close();}});
test('disabling reading history prevents new events without deleting existing records',t=>{const {root}=setup(t);fs.writeFileSync(path.join(root,'data','config','native-preferences.json'),'{"history_enabled":false}');const stats=new ReadingStatistics(root);assert.equal(stats.line({gameId:'x',text:'台詞',sequence:1}),false);const db=openStore(root);try{assert.equal(db.prepare('SELECT COUNT(*) n FROM reading_events').get().n,0);}finally{db.close();}});

test('the original disable message cancels an in-flight translation without generating an error reply',async t=>{
 const {reader}=setup(t);let current,finish;reader.translation={translate:async(text,options,isCurrent)=>{current=isCurrent;return new Promise(resolve=>{finish=resolve;});}};
 const pending=reader.message({id:10,text:'試験'});await new Promise(resolve=>setImmediate(resolve));assert.equal(current(),true);
 assert.deepEqual(await reader.message({id:11,disabled:true}),{replies:[]});assert.equal(current(),false);finish('test');await pending;
});

test('translation uses the original per-request provider and context options',async t=>{
 const {reader}=setup(t);let received;reader.translation={translate:async(text,options)=>{received=options;return 'test';}};
 await reader.message({id:1,text:'試験',options:{provider:'sakura',baseUrl:'http://127.0.0.1:8080/v1',model:'local-test',contextLines:3}});
 assert.equal(received.provider,'sakura');assert.equal(received.model,'local-test');assert.equal(received.contextLines,3);
});

test('the overlay rejects an API provider without a key and does not save partial settings',async t=>{
 const {reader,root}=setup(t),file=path.join(root,'data/config/preferences.json');fs.writeFileSync(file,JSON.stringify({provider:'google',font:'Fixture'}));
 const response=await reader.message({type:'configure',configureId:7,provider:'gpt',model:'test-model',baseUrl:'https://example.test/v1',settings:{provider:'gpt',model:'test-model',baseUrl:'https://example.test/v1'}});
 assert.equal(response.replies[0].method,'configured');assert.equal(response.replies[0].args[0],false);assert.equal(response.replies[0].args[2],7);assert.equal(JSON.parse(fs.readFileSync(file)).provider,'google');
});

test('native readiness restores saved game-audio capture before the first Anki card',t=>{
 const {reader,runtime}=setup(t),audio=[];runtime.services=()=>({gameEvent:async()=>{}});reader.gal={send:()=>{},setGameAudio:value=>audio.push(value)};
 runtime.config=()=>({ankiGameMedia:true});reader.event({type:'ready'});runtime.config=()=>({ankiGameMedia:false});reader.event({type:'ready'});assert.deepEqual(audio,[true,false]);
});
