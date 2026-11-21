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
