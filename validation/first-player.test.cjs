// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* The card distinguishes a local Seed, a verified receipt and a confirmed absence of public adaptation. */
process.env.MEGULIT_RELAY_BASE='https://relay.test';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const fp=require('../services/first-player.cjs'),feed=require('../services/auto-profile-feed.cjs'),auto=require('../core/auto-profile.cjs');
function setup(engine='KiriKiri'){const root=fs.mkdtempSync(path.join(process.env.MEGULIT_TMP||os.tmpdir(),'firstplayer-'));const dir=path.join(root,'game');fs.mkdirSync(dir);
 const exe=path.join(dir,'unseen-'+Math.random().toString(36).slice(2)+'.exe');fs.writeFileSync(exe,Buffer.from('MZ'+Math.random()));
 const db={prepare:()=>({get:id=>id==='7'?{id:'7',title:'Never Seen Before',executable:exe,engine}:undefined})};return {root,exe,db};}
const receiver=require('../services/torch-receive.cjs');
const none=async()=>Response.json({ok:false,error:'NOT_FOUND'},{status:404});
const lookup=(root,db,fetcher=none)=>receiver.receive(root,'7',{getGame:()=>db.prepare().get('7'),resources:()=>true,fetcher});
test('both public routes confirm absence + engine known = first',async()=>{const {root,db}=setup();const routes=[];await lookup(root,db,url=>{routes.push(new URL(url).pathname);return none();});
 const r=await fp.state(db,root,'7');assert.equal(r.state,'first');assert.equal(r.eligible,true);assert.match(r.key,/^[0-9a-f]{64}$/);assert.deepEqual(routes,['/api/torch-release','/api/game-profile']);});
test('the result is available to polls until it expires',async t=>{const {root,db}=setup();const missing=await lookup(root,db);const opts={wait:0,fetcher:()=>assert.fail('poll opened a network request')};
 assert.equal((await fp.state(db,root,'7',opts)).state,'first');
 t.mock.method(Date,'now',()=>missing.checkedAt+6*3600000);
 assert.equal((await fp.state(db,root,'7',opts)).state,'hidden');});
test('sharing switched off -> off; the switch brings first back',async()=>{const {root,db}=setup();fs.mkdirSync(path.join(root,'data','config'),{recursive:true});fs.writeFileSync(path.join(root,'data','config','library.json'),JSON.stringify({autoProfileShare:false}));
 await lookup(root,db);assert.equal((await fp.state(db,root,'7')).state,'off');assert.equal(fp.enableSharing(root),true);assert.equal((await fp.state(db,root,'7',{wait:0})).state,'first');
 fs.writeFileSync(path.join(root,'data','config','library.json'),JSON.stringify({sharedAdaptation:false}));assert.equal((await fp.state(db,root,'7',{wait:0})).state,'off');});
test('engine not recognised -> hidden even with confirmed absence',async()=>{const {root,db}=setup('');await lookup(root,db);assert.equal((await fp.state(db,root,'7')).state,'hidden');const b=setup('Totally Unknown Engine 9');await lookup(b.root,b.db);assert.equal((await fp.state(b.db,b.root,'7')).state,'hidden');});
test('the relay has a diff (not none) -> hidden',async()=>{const {root,db,exe}=setup();const key=await auto.exeKey(root,exe);feed.keep?.(root,key,{});fs.mkdirSync(feed.dir(root),{recursive:true});fs.writeFileSync(path.join(feed.dir(root),key+'.json'),JSON.stringify({schema:'megulit.game-diff-feed',key,version:2,fetchedAt:Date.now()}));
 const r=await fp.state(db,root,'7',{wait:0,fetcher:()=>{throw Error('no network');}});assert.equal(r.state,'hidden');});
test('a pending receiver lookup returns immediately without claiming eligibility',async()=>{
 const {root,db}=setup();let start,finish;
 const started=new Promise(resolve=>{start=resolve;}),response=new Promise(resolve=>{finish=resolve;});
 const work=lookup(root,db,async()=>{start();await response;return none();});
 try{await started;const result=await fp.state(db,root,'7',{wait:0});assert.equal(result.state,'installing');assert.equal(result.eligible,undefined);}
 finally{finish();await work;}
});
test('an edge 404 or an unavailable legacy route cannot establish eligibility',async()=>{
 const {root,db}=setup();
 await lookup(root,db,url=>url.includes('/api/torch-release?')?new Response('edge error',{status:404}):none());
 assert.equal((await fp.state(db,root,'7')).state,'hidden');
 await lookup(root,db,url=>url.includes('/api/torch-release?')?none():new Response(null,{status:503}));
 const result=await fp.state(db,root,'7');assert.equal(result.code,'TORCH_RELAY_UNAVAILABLE');assert.equal(result.eligible,undefined);
});
for(const isolated of [false,true])test('Fata exact Seed and public eligibility with '+(isolated?'isolated':'ordinary')+' submission rules',async t=>{
 const {root,exe}=setup(),key='17b5941ae0fe1e46894c34e7f1c5bae9a2ef7cdc85fb490c52e305e2c84bde42';
 if(isolated){
  const previous=process.env;
  process.env=require('../tools/owner-tests-launch.cjs').environment(root,{...previous});
  t.after(()=>{process.env=previous;});
  t.mock.method(require('../services/relay-config.cjs'),'endpoints',()=>assert.fail('isolated lookup used general relay'));
 }
 const row={id:'7',title:'Fata',executable:exe,original:'{}'},db={prepare:()=>({get:()=>row})};
 const opts={wait:0,hash:async()=>key};
 assert.deepEqual(await fp.state(db,root,'7',opts),{state:'bundled',key,bundled:{source:'official',revision:require('../core/profiles/seed.cjs').versionOf(key).rev}});
 const receive=fetcher=>receiver.receive(root,'7',{getGame:()=>row,hashExe:opts.hash,resources:()=>true,fetcher});
 if(isolated){
  process.env.MEGULIT_OFFLINE='1';
  await receive(()=>assert.fail('offline test opened a connection'));
  assert.equal((await fp.state(db,root,'7',opts)).state,'bundled');
  delete process.env.MEGULIT_OFFLINE;
  assert.equal(fp.enableSharing(root),false);
 }
 await receive((url,request)=>{assert.equal(new URL(url).search,'?exe='+key);assert.equal(request.method,'GET');return none();});
 const result=await fp.state(db,root,'7',opts);
 assert.deepEqual(result,{state:'not-published',key,bundled:{source:'official',revision:require('../core/profiles/seed.cjs').versionOf(key).rev},eligible:true,submission:isolated?'isolated-sharing':'bundled'});
 assert.equal(fs.existsSync(feed.dir(root)),false);
});
test('this PC uploaded its calibration -> thanks, whatever the relay says now',async()=>{const {root,db,exe}=setup();const key=await auto.exeKey(root,exe);assert.equal(feed.sent(root,key),false);feed.markSent(root,key);
 assert.equal((await fp.state(db,root,'7',{wait:0})).state,'thanks');});
/* 传火署名: the credit of this PC's upload, kept here and sent to the relay; a relay without the routes never breaks the card */
const json=(status,body)=>async()=>({status,ok:status>=200&&status<300,json:async()=>body,text:async()=>JSON.stringify(body)});
test('credit: PUT sends {key,name}, the answer is kept and shown; null withdraws',async()=>{const {root,db,exe}=setup();const key=await auto.exeKey(root,exe);feed.markSent(root,key,{torchNo:7,name:null,at:'2026-11-21T01:00:00Z'});
 let seen=null;const f=async(url,init)=>{seen={url,method:init.method,body:JSON.parse(init.body)};return {status:200,ok:true,json:async()=>({torchNo:7,name:seen.body.name,at:'2026-11-21T01:00:00Z'})};};
 let r=await fp.setCredit(db,root,'7','  Megu  '.padEnd(50,'x'),{fetcher:f});assert.equal(r.state,'saved');assert.equal(seen.method,'PUT');assert.match(seen.url,/\/api\/game-profile\/credit$/);assert.equal(seen.body.key,key);assert.equal([...seen.body.name].length,30);
 assert.equal(r.credit.torchNo,7);assert.equal(r.credit.synced,true);assert.equal((await fp.state(db,root,'7',{wait:0})).credit.name,r.credit.name);
 r=await fp.setCredit(db,root,'7',null,{fetcher:f});assert.equal(seen.body.name,null);assert.equal(r.credit.name,null);assert.equal(r.credit.torchNo,7);});
test('credit: a relay without the route keeps the name here and retries at the next ask',async()=>{const {root,db,exe}=setup();const key=await auto.exeKey(root,exe);feed.markSent(root,key,{torchNo:2,name:null,at:'x'});
 let r=await fp.setCredit(db,root,'7','小明',{fetcher:json(404,{})});assert.equal(r.state,'local');assert.equal(r.credit.name,'小明');assert.equal(r.credit.synced,false);
 r=await fp.setCredit(db,root,'7','小明',{fetcher:async()=>{throw Error('offline');}});assert.equal(r.state,'local');
 const s=await fp.state(db,root,'7',{wait:500,fetcher:json(200,{torchNo:2,name:'小明',at:'x'})});assert.equal(s.state,'thanks');assert.equal(s.credit.synced,true);assert.equal(s.credit.name,'小明');});
test('credit: nothing to name before an upload; the report carries a name and keeps the relay answer',async()=>{const {root,db}=setup();assert.equal((await fp.setCredit(db,root,'7','a',{fetcher:json(200,{})})).state,'failed');
 assert.equal(feed.cleanName(null),null);assert.equal(feed.cleanName('   '),null);assert.equal(feed.cleanName('a‮b\nc'),'a b c');assert.deepEqual(feed.cleanCredit({torchNo:0}),{torchNo:0,name:null,at:'',alias:'ユージオ'});assert.deepEqual(feed.cleanCredit({torchNo:3,name:'<i>x</i>',at:'t'}),{torchNo:3,name:'<i>x</i>',at:'t'});});
test('received: a relay diff with a credit shows who passed it on; no credit, nothing',async()=>{const {root,db,exe}=setup();const key=await auto.exeKey(root,exe);
 const write=extra=>{fs.mkdirSync(feed.dir(root),{recursive:true});fs.writeFileSync(path.join(feed.dir(root),key+'.json'),JSON.stringify({schema:'megulit.game-diff-feed',key,version:2,fetchedAt:Date.now(),...extra}));};
 const orig=feed.layer;write({credit:{torchNo:5,name:'A',at:'2026-11-20T10:00:00Z'}});
 /* an unsigned document is no diff: the card stays hidden even with a credit on it */
 assert.equal((await fp.state(db,root,'7',{wait:0})).state,'hidden');
 feed.layer=()=>({source:'agreed'});try{const r=await fp.state(db,root,'7',{wait:0});assert.equal(r.state,'received');assert.deepEqual(r.credit,{torchNo:5,name:'A',at:'2026-11-20T10:00:00Z'});
  write({});assert.equal((await fp.state(db,root,'7',{wait:0})).state,'hidden');write({credit:{torchNo:9,name:null,at:'t'}});assert.equal((await fp.state(db,root,'7',{wait:0})).credit.name,null);}finally{feed.layer=orig;}});
