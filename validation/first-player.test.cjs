// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 首位玩家 card (services/first-player.cjs): shows only when the relay says none, the built-in The Seed has nothing and the
   engine is recognised; off when sharing is off; thanks once the calibration went out; never blocks on a slow relay. No network, no game. */
process.env.MEGULIT_RELAY_BASE='https://relay.test';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const fp=require('../services/first-player.cjs'),feed=require('../services/auto-profile-feed.cjs'),auto=require('../core/auto-profile.cjs');
function setup(engine='KiriKiri'){const root=fs.mkdtempSync(path.join(process.env.MEGULIT_TMP||os.tmpdir(),'firstplayer-'));const dir=path.join(root,'game');fs.mkdirSync(dir);
 const exe=path.join(dir,'unseen-'+Math.random().toString(36).slice(2)+'.exe');fs.writeFileSync(exe,Buffer.from('MZ'+Math.random()));
 const db={prepare:()=>({get:id=>id==='7'?{id:'7',title:'Never Seen Before',executable:exe,engine}:undefined})};return {root,exe,db};}
const none=async()=>({status:404,ok:false,text:async()=>''});
const slow=()=>new Promise(()=>{});
test('relay says none + no seed + engine known = first',async()=>{const {root,db}=setup();const r=await fp.state(db,root,'7',{fetcher:none});assert.equal(r.state,'first');assert.match(r.key,/^[0-9a-f]{64}$/);});
test('the answer is cached: a poll (wait 0) needs no network',async()=>{const {root,db}=setup();await fp.state(db,root,'7',{fetcher:none});const r=await fp.state(db,root,'7',{wait:0,fetcher:()=>{throw Error('no network');}});assert.equal(r.state,'first');});
test('sharing switched off -> off; the switch brings first back',async()=>{const {root,db}=setup();fs.mkdirSync(path.join(root,'data','config'),{recursive:true});fs.writeFileSync(path.join(root,'data','config','library.json'),JSON.stringify({autoProfileShare:false}));
 assert.equal((await fp.state(db,root,'7',{fetcher:none})).state,'off');assert.equal(fp.enableSharing(root),true);assert.equal((await fp.state(db,root,'7',{wait:0})).state,'first');
 fs.writeFileSync(path.join(root,'data','config','library.json'),JSON.stringify({sharedAdaptation:false}));assert.equal((await fp.state(db,root,'7',{wait:0})).state,'off');});
test('engine not recognised -> hidden',async()=>{const {root,db}=setup('');assert.equal((await fp.state(db,root,'7',{fetcher:none})).state,'hidden');const b=setup('Totally Unknown Engine 9');assert.equal((await fp.state(b.db,b.root,'7',{fetcher:none})).state,'hidden');});
test('the relay has a diff (not none) -> hidden',async()=>{const {root,db,exe}=setup();const key=await auto.exeKey(root,exe);feed.keep?.(root,key,{});fs.mkdirSync(feed.dir(root),{recursive:true});fs.writeFileSync(path.join(feed.dir(root),key+'.json'),JSON.stringify({schema:'megulit.game-diff-feed',key,version:2,fetchedAt:Date.now()}));
 const r=await fp.state(db,root,'7',{wait:0,fetcher:()=>{throw Error('no network');}});assert.equal(r.state,'hidden');});
test('a slow relay hides the card and does not block',async()=>{const {root,db}=setup();const t=Date.now();const r=await fp.state(db,root,'7',{wait:200,fetcher:slow});assert.equal(r.state,'hidden');assert.ok(Date.now()-t<1500);});
test('a game the built-in The Seed knows -> hidden',async()=>{const S=require('../core/profiles/seed.cjs');const v=[...S.seeds().versions.entries()][0];if(!v)return;const {root,exe}=setup();const key=v[0];
 const row={id:'7',title:'x',executable:exe,engine:v[1].engine||'KiriKiri'};const db={prepare:()=>({get:()=>row})};assert.equal(fp.engineKnown(row.engine)!=='',true);
 const r=await fp.state(db,root,'7',{fetcher:none,hash:async()=>key});assert.equal(r.state,'hidden');});
test('this PC uploaded its calibration -> thanks, whatever the relay says now',async()=>{const {root,db,exe}=setup();const key=await auto.exeKey(root,exe);assert.equal(feed.sent(root,key),false);feed.markSent(root,key);
 assert.equal((await fp.state(db,root,'7',{wait:0})).state,'thanks');});
/* 传火署名: the credit of this PC's upload, kept here and sent to the relay; a relay without the routes never breaks the card */
const json=(status,body)=>async()=>({status,ok:status>=200&&status<300,json:async()=>body,text:async()=>JSON.stringify(body)});
test('credit: PUT sends {key,name}, the answer is kept and shown; null withdraws',async()=>{const {root,db,exe}=setup();const key=await auto.exeKey(root,exe);feed.markSent(root,key,{torchNo:7,name:null,at:'2026-11-21T01:00:00Z'});
 let seen=null;const f=async(url,init)=>{seen={url,method:init.method,body:JSON.parse(init.body)};return {status:200,ok:true,json:async()=>({torchNo:7,name:seen.body.name,at:'2026-11-21T01:00:00Z'})};};
 let r=await fp.setCredit(db,root,'7','  Megu  '.padEnd(40,'x'),{fetcher:f});assert.equal(r.state,'saved');assert.equal(seen.method,'PUT');assert.match(seen.url,/\/api\/game-profile\/credit$/);assert.equal(seen.body.key,key);assert.equal([...seen.body.name].length,20);
 assert.equal(r.credit.torchNo,7);assert.equal(r.credit.synced,true);assert.equal((await fp.state(db,root,'7',{wait:0})).credit.name,r.credit.name);
 r=await fp.setCredit(db,root,'7',null,{fetcher:f});assert.equal(seen.body.name,null);assert.equal(r.credit.name,null);assert.equal(r.credit.torchNo,7);});
test('credit: a relay without the route keeps the name here and retries at the next ask',async()=>{const {root,db,exe}=setup();const key=await auto.exeKey(root,exe);feed.markSent(root,key,{torchNo:2,name:null,at:'x'});
 let r=await fp.setCredit(db,root,'7','小明',{fetcher:json(404,{})});assert.equal(r.state,'local');assert.equal(r.credit.name,'小明');assert.equal(r.credit.synced,false);
 r=await fp.setCredit(db,root,'7','小明',{fetcher:async()=>{throw Error('offline');}});assert.equal(r.state,'local');
 const s=await fp.state(db,root,'7',{wait:500,fetcher:json(200,{torchNo:2,name:'小明',at:'x'})});assert.equal(s.state,'thanks');assert.equal(s.credit.synced,true);assert.equal(s.credit.name,'小明');});
test('credit: nothing to name before an upload; the report carries a name and keeps the relay answer',async()=>{const {root,db}=setup();assert.equal((await fp.setCredit(db,root,'7','a',{fetcher:json(200,{})})).state,'failed');
 assert.equal(feed.cleanName(null),null);assert.equal(feed.cleanName('   '),null);assert.equal(feed.cleanName('a‮b\nc'),'a b c');assert.equal(feed.cleanCredit({torchNo:0}),null);assert.deepEqual(feed.cleanCredit({torchNo:3,name:'<i>x</i>',at:'t'}),{torchNo:3,name:'<i>x</i>',at:'t'});});
test('received: a relay diff with a credit shows who passed it on; no credit, nothing',async()=>{const {root,db,exe}=setup();const key=await auto.exeKey(root,exe);
 const write=extra=>{fs.mkdirSync(feed.dir(root),{recursive:true});fs.writeFileSync(path.join(feed.dir(root),key+'.json'),JSON.stringify({schema:'megulit.game-diff-feed',key,version:2,fetchedAt:Date.now(),...extra}));};
 const orig=feed.layer;write({credit:{torchNo:5,name:'A',at:'2026-11-20T10:00:00Z'}});
 /* an unsigned document is no diff: the card stays hidden even with a credit on it */
 assert.equal((await fp.state(db,root,'7',{wait:0})).state,'hidden');
 feed.layer=()=>({source:'agreed'});try{const r=await fp.state(db,root,'7',{wait:0});assert.equal(r.state,'received');assert.deepEqual(r.credit,{torchNo:5,name:'A',at:'2026-11-20T10:00:00Z'});
  write({});assert.equal((await fp.state(db,root,'7',{wait:0})).state,'hidden');write({credit:{torchNo:9,name:null,at:'t'}});assert.equal((await fp.state(db,root,'7',{wait:0})).credit.name,null);}finally{feed.layer=orig;}});
