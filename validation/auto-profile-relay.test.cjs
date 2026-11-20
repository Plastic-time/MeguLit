// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: 游戏差分全自动生成, the server half) relay/src/auto-profile.js in-process (D1 on node:sqlite) and the app side
   (services/auto-profile-feed.cjs, services/self-check-live.cjs): reports in, the agreed best result out; one reporter (IP) is one
   row (newest wins); settings are reduced to the tunable keys; a single report is never handed out; read mode wins only with a
   majority; the app uses the shared result while it has no calibration of its own, and its own calibration wins. No network. */
process.env.MEGULIT_RELAY_BASE='https://relay.test';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{pathToFileURL}=require('node:url'),{DatabaseSync}=require('node:sqlite');
const relayDir=path.join(__dirname,'..','relay'),MIGRATION=fs.readdirSync(path.join(relayDir,'migrations')).filter(f=>f.endsWith('.sql')).sort().map(f=>fs.readFileSync(path.join(relayDir,'migrations',f),'utf8')).join('');
function d1(){const db=new DatabaseSync(':memory:');db.exec(MIGRATION);const stmt=(sql,args=[])=>({bind:(...a)=>stmt(sql,a),first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>{db.prepare(sql).run(...args);return {success:true};}});return {prepare:sql=>stmt(sql),raw:db};}
let mod;const relay=async()=>mod??=await import(pathToFileURL(path.join(relayDir,'src','worker.js')).href);
const ENV={DB:d1(),HASH_SALT:'salt'};
/* one player (IP): a fetch that answers from the relay in-process */
const user=ip=>async(url,init={})=>{const {handle}=await relay();return handle(new Request(url,{method:init.method||'GET',headers:{'cf-connecting-ip':ip,...(init.headers||{})},body:init.body}),ENV,new Date());};
const tmp=()=>fs.mkdtempSync(path.join(process.env.MEGULIT_TMP||os.tmpdir(),'autoprof-'));
const ap=require('../core/auto-profile.cjs'),feed=require('../services/auto-profile-feed.cjs');
const HIDE={calibrate:{positionSource:'engine',textBox:{x:374,y:707,w:31,h:31,client:[1535,863]},hideMethod:'hide'},page:{effectFrames:null},hide:{textEffectsRead:false}};
const rec=(key,mode,settings,cost=0,extra={})=>({schema:1,key,engine:'krkr',exe:'senrenbanka.exe',version:'1.4.21',at:new Date().toISOString(),source:'calibration',mode,reason:'',settings,score:{metrics:{dropRate:0},cost},candidates:[],...extra});
const post=(ip,record)=>user(ip)('https://relay.test/api/auto-profile/report',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({version:1,profile:ap.diagnostic(record).profile})});
const get=async key=>{const r=await user('9.9.9.9')('https://relay.test/api/auto-profile/'+key);return {status:r.status,body:await r.json()};};

test('relay: one report is not enough, two agreeing reporters are handed out, one IP is one row',async()=>{
 assert.equal((await post('1.1.1.1',rec('senren-banka','hide',HIDE,0.5))).status,201);
 assert.equal((await get('senren-banka')).status,404,'a single report is never shared');
 assert.equal((await post('1.1.1.1',rec('senren-banka','hide',HIDE,0.4))).status,201);
 assert.equal((await get('senren-banka')).status,404,'the same player again is still one reporter');
 assert.equal(ENV.DB.raw.prepare("SELECT COUNT(*) n FROM auto_profile_reports WHERE game_key='senren-banka'").get().n,1);
 await post('2.2.2.2',rec('senren-banka','hide',HIDE,0.2));
 const r=await get('senren-banka');assert.equal(r.status,200);assert.equal(r.body.schema,'megulit.auto-profile');assert.equal(r.body.mode,'hide');assert.equal(r.body.agree,2);
 assert.deepEqual(r.body.settings.calibrate,HIDE.calibrate);});

test('relay: the best agreed score wins; read mode only with a majority',async()=>{
 const other={...HIDE,page:{effectFrames:true}};
 await post('3.3.3.3',rec('senren-banka','hide',other,0.05));await post('4.4.4.4',rec('senren-banka','hide',other,0.05));
 let r=await get('senren-banka');assert.equal(r.body.settings.page.effectFrames,true,'lower mean cost, as many reporters');
 await post('5.5.5.5',rec('senren-banka','read',{hide:{textEffectsRead:true}}));await post('6.6.6.6',rec('senren-banka','read',{hide:{textEffectsRead:true}}));
 r=await get('senren-banka');assert.equal(r.body.mode,'hide','2 read of 6 is no majority');
 for(const ip of ['7.7.7.7','8.8.8.8','10.0.0.1'])await post(ip,rec('senren-banka','read',{}));
 r=await get('senren-banka');assert.equal(r.body.mode,'read');assert.equal(r.body.settings.hide.textEffectsRead,true);assert.equal(r.body.agree,5);});

test('relay: settings are reduced to the tunable keys, bad reports refused',async()=>{
 await post('11.0.0.1',rec('fata-morgana','hide',{...HIDE,evil:{x:1},choice:{filters:['^…$','(']},hide:{textEffectsRead:'yes'}}));
 const row=ENV.DB.raw.prepare("SELECT settings,exe FROM auto_profile_reports WHERE game_key='fata-morgana'").get();const s=JSON.parse(row.settings);
 assert.equal(s.evil,undefined);assert.deepEqual(s.choice.filters,['^…$'],'a broken RegExp is dropped');assert.equal(s.hide,undefined);assert.equal(row.exe,'senrenbanka.exe');
 const bad=async body=>(await user('12.0.0.1')('https://relay.test/api/auto-profile/report',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})).status;
 assert.equal(await bad({version:1,profile:{key:'../x',mode:'hide'}}),400);assert.equal(await bad({version:1,profile:{key:'abc',mode:'weird'}}),400);assert.equal(await bad({version:2}),400);
 assert.equal((await user('1.2.3.4')('https://relay.test/api/auto-profile/UPPER')).status,404);});

test('app: report gated by 共享适配, cached shared layer, own calibration wins',async()=>{
 const root=tmp();try{
  const sent=await feed.report(root,rec('saya-no-uta','hide',HIDE,0.1),{fetcher:user('20.0.0.1')});assert.equal(sent.state,'sent');
  await feed.report(root,rec('saya-no-uta','hide',HIDE,0.1),{fetcher:user('20.0.0.2')});
  const v=await feed.refresh(root,'saya-no-uta',{fetcher:user('20.0.0.3')});assert.equal(v.mode,'hide');assert.deepEqual(feed.cached(root,'saya-no-uta').settings.calibrate,HIDE.calibrate);
  const none=await feed.refresh(root,'nobody-game',{fetcher:user('20.0.0.3')});assert.equal(none.none,true);assert.equal(feed.layer(none,'nobody-game'),null);
  let calls=0;await feed.refresh(root,'saya-no-uta',{fetcher:async()=>{calls++;throw Error('x');}});assert.equal(calls,0,'a fresh copy is not fetched again');
  /* the live session: shared layer while nothing local, own calibration replaces it */
  const live=require('../services/self-check-live.cjs');const profiles=[],calls2=[];
  const gal={setGameProfile(p){profiles.push(p);},textEffectsHold:null,textEffects(on,why){calls2.push([on,why]);this.textEffectsHold=on?{why}:null;},hooks:{pageMode:{engine:'krkr'},trace(){}}};
  const reader={root,gal,gameExe:'D:\\x\\saya.exe',logVisibility(){}};const P=require('../core/profiles/index.cjs');
  const s=live.start(reader,reader.gameExe,{...P.profileFor({exe:reader.gameExe}),gameKey:'saya-no-uta'},{exe:reader.gameExe});
  assert.deepEqual(s.layer.calibrate,HIDE.calibrate,'the shared hide result is the auto layer');assert.ok(s.check.recording,'and this PC still calibrates');
  ap.store(root,'saya-no-uta',rec('saya-no-uta','read',{hide:{textEffectsRead:true}}));live.stop();
  const s2=live.start(reader,reader.gameExe,{...P.profileFor({exe:reader.gameExe}),gameKey:'saya-no-uta'},{exe:reader.gameExe});assert.equal(s2.shared,null,'own calibration first');assert.equal(s2.layer.hide.textEffectsRead,true);live.stop();
  /* a shared read verdict is followed at once */
  fs.writeFileSync(path.join(feed.dir(root),'read-game.json'),JSON.stringify({schema:'megulit.auto-profile',version:1,key:'read-game',mode:'read',settings:{},agree:3,reporters:4,fetchedAt:Date.now()}));calls2.length=0;gal.textEffectsHold=null;
  const s3=live.start(reader,reader.gameExe,{...P.profileFor({exe:reader.gameExe}),gameKey:'read-game'},{exe:reader.gameExe});assert.equal(s3.layer.hide.textEffectsRead,true);assert.equal(calls2.length,1);assert.equal(s3.check.recording,null);live.stop();
  /* 共享适配 off: nothing is sent */
  const cfg=path.join(root,'data','config');fs.mkdirSync(cfg,{recursive:true});
  fs.writeFileSync(path.join(cfg,'library.json'),JSON.stringify({sharedAdaptation:false}));assert.equal((await feed.report(root,rec('x-game','hide',HIDE),{fetcher:user('20.0.0.9')})).state,'skipped');
 }finally{fs.rmSync(root,{recursive:true,force:true});}});
