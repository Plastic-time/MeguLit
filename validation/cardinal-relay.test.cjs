// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 Cardinal server side (relay/src/cardinal.js): strict validation (identity -> whole record refused), one vote per
   reporter per key + seedRev, upgrade to verified (>=3 reporters, mean >= .9, none < .6), repair queue (mean < .6, the queue
   /api/game-profile/retest hands out), THE SEED confirmed count and the dashboard panel numbers. Relay in-process, no network. */
process.env.MEGULIT_RELAY_BASE??='off';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),{DatabaseSync}=require('node:sqlite');
const relayDir=path.join(__dirname,'..','relay'),MIGRATION=fs.readdirSync(path.join(relayDir,'migrations')).filter(f=>f.endsWith('.sql')).sort().map(f=>fs.readFileSync(path.join(relayDir,'migrations',f),'utf8')).join('');
function d1(){const db=new DatabaseSync(':memory:');db.exec(MIGRATION);const stmt=(sql,args=[])=>({bind:(...a)=>stmt(sql,a),first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>{const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(r.changes)||0}};}});return {prepare:sql=>stmt(sql),raw:db};}
const mod=name=>import(pathToFileURL(path.join(relayDir,'src',name)).href);
const K1='1'.repeat(64),K2='2'.repeat(64);
const rec=(o={})=>({schema:'megulit.cardinal-score',version:1,key:K1,seedRev:'r7',source:'auto',app:'1.4.23',lines:120,scores:{row:.95,stable:.95,clean:.95,clear:.95,choice:.95,pair:.95,leak:.95},total:.95,cardinalRev:'c1',at:new Date().toISOString(),...o});
const mk=()=>{const ENV={DB:d1(),BUCKET:{},HASH_SALT:'salt',ADAPTER_ADMIN_TOKEN:'adm',LINK_SECRET:'l'};
 const send=async(ip,body,route='/api/cardinal/score')=>{const {handle}=await mod('worker.js');return handle(new Request('https://relay.test'+route,{method:'POST',headers:{'cf-connecting-ip':ip,'content-type':'application/json'},body:typeof body==='string'?body:JSON.stringify(body)}),ENV,new Date());};
 const get=async(route,headers={},ip='9.9.9.9')=>{const {handle}=await mod('worker.js');return handle(new Request('https://relay.test'+route,{headers:{'cf-connecting-ip':ip,...headers}}),ENV,new Date(),{waitUntil(){}});};
 return {ENV,send,get};};
const status=async(ENV,key=K1,rev='r7')=>ENV.DB.raw.prepare('SELECT * FROM cardinal_status WHERE game_key=? AND seed_rev=?').get(key,rev);

test('validation: a good record is stored; anything off is refused',async()=>{
 const {validateScore}=await mod('cardinal.js'),now=new Date();
 assert.equal(validateScore(rec(),now).ok,true);assert.equal(validateScore(rec({seedRev:null}),now).value.seedRev,'');
 const bad={'extra field':{...rec(),note:'x'},'schema':rec({schema:'x'}),'version':rec({version:2}),'key short':rec({key:'ab'}),'key upper':rec({key:'A'.repeat(64)}),'seedRev type':rec({seedRev:5}),'seedRev chars':rec({seedRev:'a b'}),
  'source':rec({source:'cloud'}),'app':rec({app:'v1'}),'lines float':rec({lines:1.5}),'lines neg':rec({lines:-1}),'lines str':rec({lines:'9'}),'total >1':rec({total:1.01}),'total <0':rec({total:-.1}),'total str':rec({total:'.9'}),'total NaN':rec({total:NaN}),
  'score missing':rec({scores:{row:1,stable:1,clean:1,clear:1,choice:1,pair:1}}),'score range':rec({scores:{...rec().scores,leak:2}}),'score extra':rec({scores:{...rec().scores,bonus:1}}),'scores array':rec({scores:[]}),
  'cardinalRev':rec({cardinalRev:''}),'at format':rec({at:'yesterday'}),'at future':rec({at:new Date(Date.now()+3*86400e3).toISOString()}),'array body':[rec()],'null':null};
 for(const [name,b] of Object.entries(bad))assert.equal(validateScore(b,now).ok,false,name);
});

test('identity anywhere refuses the whole record, nothing stored',async()=>{
 const {send,ENV}=mk();
 for(const [i,extra] of [{userId:'u1'},{email:'a@b.c'},{ip:'1.2.3.4'},{installId:'x'},{machine:'PC'},{path:'C:\\Users\\a'},{steamId:'1'},{scores:{...rec().scores,player:1}}].entries()){
  const r=await send('7.7.7.'+i,rec(extra));assert.equal(r.status,400);assert.equal((await r.json()).error,'IDENTITY_NOT_ACCEPTED',JSON.stringify(extra));}
 assert.equal(ENV.DB.raw.prepare('SELECT COUNT(*) n FROM cardinal_scores').get().n,0);
 assert.equal((await send('7.7.7.9','not json')).status,400);
 assert.equal((await send('7.7.7.9',' '.repeat(5000)+JSON.stringify(rec()))).status,413);
});

test('one vote per reporter per key and seedRev; a repeat replaces; raw IP never stored',async()=>{
 const {send,ENV}=mk();
 for(let i=0;i<4;i++)assert.equal((await send('5.5.5.5',rec({total:.5+i/10}))).status,201);
 let rows=ENV.DB.raw.prepare('SELECT * FROM cardinal_scores').all();assert.equal(rows.length,1);assert.equal(rows[0].total,.8,'newest vote wins');
 assert.doesNotMatch(JSON.stringify(rows),/5\.5\.5\.5/);assert.match(rows[0].reporter,/^[0-9a-f]{32}$/);
 await send('5.5.5.5',rec({seedRev:'r8'}));await send('5.5.5.5',rec({key:K2}));await send('6.6.6.6',rec());
 assert.equal(ENV.DB.raw.prepare('SELECT COUNT(*) n FROM cardinal_scores').get().n,4,'other rev / key / reporter are separate votes');
 assert.equal((await status(ENV)).voters,2);
});

test('upgrade: 3 reporters, mean >= .9, nobody under .6 -> verified; one vote under .6 blocks it; official / none votes do not count',async()=>{
 const {send,ENV}=mk();
 await send('1.1.1.1',rec({total:.95}));await send('1.1.1.2',rec({total:.9}));
 assert.equal((await status(ENV)).status,'open','two reporters are not enough');
 await send('1.1.1.3',rec({source:'official',total:1}));await send('1.1.1.4',rec({source:'none',total:1}));
 assert.equal((await status(ENV)).status,'open','official / none do not vote for the auto diff');
 await send('1.1.1.5',rec({total:.5,lines:10}));assert.equal((await status(ENV)).voters,2,'too short a replay does not count');
 const r=await send('1.1.1.6',rec({total:.9}));assert.equal(r.status,201);assert.equal((await r.json()).status,'verified');
 const s=await status(ENV);assert.equal(s.status,'verified');assert.equal(s.voters,3);assert.ok(s.upgraded_at>0);
 /* a fourth vote below the floor takes it back: one is enough to block */
 await send('1.1.1.7',rec({total:.55}));assert.notEqual((await status(ENV)).status,'verified');
 /* mean under .9 with nobody under .6 */
 await send('2.2.2.1',rec({key:K2,total:.85}));await send('2.2.2.2',rec({key:K2,total:.85}));await send('2.2.2.3',rec({key:K2,total:.85}));
 assert.equal((await status(ENV,K2)).status,'open');
});

test('repair queue: mean < .6 -> queued in the retest list; closes when it later verifies',async()=>{
 const {send,ENV,get}=mk();
 await send('3.3.3.1',rec({total:.3}));await send('3.3.3.2',rec({total:.4}));
 assert.equal((await (await get('/api/game-profile/retest')).json()).items.length,0);
 await send('3.3.3.3',rec({total:.5}));
 assert.equal((await status(ENV)).status,'repair');assert.ok((await status(ENV)).repaired_at>0);
 const items=(await (await get('/api/game-profile/retest')).json()).items;assert.deepEqual(items.map(i=>i.key),[K1]);
 assert.ok(!JSON.stringify(items).includes('cardinal'),'hashes only');
 for(const ip of ['3.3.3.1','3.3.3.2','3.3.3.3','3.3.3.4'])await send(ip,rec({total:.97}));/* a repaired diff is replayed again */
 assert.equal((await status(ENV)).status,'verified');
 assert.equal((await (await get('/api/game-profile/retest')).json()).items.length,0,'queue closed after it verified');
 assert.equal((await get('/api/cardinal/verified')).status,401);
 const v=await (await get('/api/cardinal/verified',{authorization:'Bearer adm'})).json();assert.equal(v.items[0].status,'verified');
});

test('rules come from relay vars',async()=>{
 const {verdict,cardinalConfig}=await mod('cardinal.js');const rows=[0.8,0.85].map(total=>({source:'auto',lines:100,total}));
 assert.equal(verdict(rows,cardinalConfig({})).status,'open');
 assert.equal(verdict(rows,cardinalConfig({CARDINAL_VERIFY_VOTERS:'2',CARDINAL_VERIFY_MEAN:'0.8',CARDINAL_VERIFY_FLOOR:'0.7'})).status,'verified');
 assert.deepEqual(cardinalConfig({CARDINAL_VERIFY_MEAN:'9'}).verifyMean,.9,'out of range falls back to the default');
});

test('stats: confirmed includes Cardinal-verified; dashboard panel numbers',async()=>{
 const {send,ENV,get}=mk();
 ENV.DB.raw.exec("INSERT INTO seed_stats(source,data,at) VALUES('github','{\"games\":10,\"versions\":12,\"status\":{\"verified\":2,\"owner-ok\":1,\"read\":3,\"skeleton\":4}}',1)");
 let s=await (await get('/api/seed/stats')).json();assert.equal(s.confirmed,3);
 for(const ip of ['4.4.4.1','4.4.4.2','4.4.4.3'])await send(ip,rec({total:.95}));
 for(const ip of ['4.4.4.1','4.4.4.2','4.4.4.3'])await send(ip,rec({key:K2,total:.2}));
 const c=await import(pathToFileURL(path.join(relayDir,'src','seed-stats.js')).href);
 assert.equal((await c.seedSummary(ENV)).confirmed,4);
 const p=await (await get('/api/probe/stats')).json();
 assert.deepEqual(p.cardinal.today,{scores:6,upgraded:1,repair:1});assert.deepEqual(p.cardinal.total,{scores:6,verified:1,repair:1});assert.equal(p.seed.confirmed,4);
 assert.match(await (await get('/dashboard')).text(),/id="cardinal"/);
});
