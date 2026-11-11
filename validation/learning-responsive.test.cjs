'use strict';
/* E459 (user, v1.4.3): 学习 → 单词 / 句子 / 读过的词 / 学习统计 stayed on 「…」 while 语法 and 五十音 opened. The
   service answers every page from one thread; the grammar report scanned ~20 000 lines synchronously for about 8 s
   (and the grammar page asks again every two seconds), so the other pages' requests timed out and the page kept the
   previous tab's placeholder. Long loops now give way, results are cached until the data changes, and a page whose
   data does not arrive says so with a retry button. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-responsive-'));process.env.MEGULIT_ROOT=root;
const {dispatch}=require('../services/bridge.cjs'),{openStore}=require('../services/store.cjs'),{breather}=require('../services/cooperative.cjs');
test.after(()=>{try{fs.rmSync(root,{recursive:true,force:true});}catch{}});

function seed(n){const db=openStore(root);try{db.prepare("INSERT OR IGNORE INTO games(id,title) VALUES('g1','テスト')").run();const add=db.prepare('INSERT INTO reading_events(session_id,game_id,text,read_at,original) VALUES(1,?,?,?,?)');
 const words=['雨が降っている','先輩を待っていた','学校へ行きたい','静かな部屋でした','誰も来ないけれど','一緒に帰りましょう','窓を開けてください'];
 db.exec('BEGIN');for(let i=0;i<n;i++)add.run('g1',`${words[i%words.length]}、その${i}番目の夜だった。`,1794300000+i,'{"translation":""}');db.exec('COMMIT');}finally{db.close();}}
/* the longest time the thread was held while `run` was going on */
async function longestBlock(run){let last=Date.now(),worst=0;const iv=setInterval(()=>{const n=Date.now();worst=Math.max(worst,n-last);last=n;},5);try{await run();await new Promise(r=>setTimeout(r,15));}finally{clearInterval(iv);}return worst;}

test('breather gives way after the slice and not before',async()=>{
 const b=breather(10);let turns=0;const t=Date.now();while(Date.now()-t<60){await b();turns++;}assert.ok(turns>1000,'cheap when not due');
 let ran=false;setImmediate(()=>ran=true);const b2=breather(0);await b2();assert.equal(ran,true,'other work runs when a slice is over');
});

test('the grammar report on 4 000 recorded lines never holds the service for long, and asking again is cached',async()=>{
 seed(4000);
 const first=await longestBlock(()=>dispatch({action:'grammar_report',count:false},null));
 assert.ok(first<600,'longest block '+first+' ms');
 const t=Date.now();const r=await dispatch({action:'grammar_report',count:false},null);assert.ok(Date.now()-t<400,'second report from the cache: '+(Date.now()-t)+' ms');assert.ok(r.lines.history>0);
 /* a page's own request gets through while the report runs */
 const started=Date.now();let vocabAt=0;const report=dispatch({action:'grammar_report',count:false},null);
 await new Promise(r=>setTimeout(r,1));await dispatch({action:'vocabulary'},null);vocabAt=Date.now()-started;await report;
 assert.ok(vocabAt<600,'vocabulary answered after '+vocabAt+' ms');
});

test('new recorded lines refresh the cached report',async()=>{
 const before=(await dispatch({action:'grammar_report',count:false},null)).lines.history;
 const db=openStore(root);try{db.prepare('INSERT INTO reading_events(session_id,game_id,text,read_at,original) VALUES(1,?,?,?,?)').run('g1','新しく読んだ台詞がここにある。',1794399999,'{}');}finally{db.close();}
 assert.equal((await dispatch({action:'grammar_report',count:false},null)).lines.history,before+1);
});

test('the learning pages show an error with retry instead of the previous tab, and slow reads time out',()=>{
 const app=fs.readFileSync(path.join(__dirname,'..','web','app.js'),'utf8');
 assert.match(app,/function learningFailed\(target,error,token\)/);
 assert.match(app,/catch\(error\)\{learningFailed\(target,error,token\);if\(token===pageToken\)commit\(\);return;\}/,'单词 / 回收站');
 assert.match(app,/catch\(error\)\{learningFailed\(target,error,token\);\}if\(token===pageToken\)commit\(\);return;\}/,'句子');
 assert.match(app,/catch\(error\)\{learningFailed\(main,error,token\);\}/,'学习统计');
 assert.match(app,/if\(slot\.dataset\.tab!==tab\)\{slot\.innerHTML=loading\(\);slot\.dataset\.tab=tab;\}/,'a new tab shows its own loading state at once');
 assert.match(app,/slowReads=new Set\(\['reading_insights','grammar_report'/);
 assert.match(fs.readFileSync(path.join(__dirname,'..','core','anki.cjs'),'utf8'),/AbortSignal\.timeout\(15000\)/,'AnkiConnect calls have a time limit');
});
