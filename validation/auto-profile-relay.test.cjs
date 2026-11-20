// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: 每部游戏按 exe 哈希一份差分；官方差分优先，自动校准兜底；只是数据，签名下发，客户端验签) relay/src/auto-profile.js
   in-process (D1 on node:sqlite, WebCrypto Ed25519) and the app side (services/auto-profile-feed.cjs, services/self-check-live.cjs,
   core/profiles/domains.cjs, core/game-diff.cjs). No network, no game. */
process.env.MEGULIT_RELAY_BASE='https://relay.test';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url'),{DatabaseSync}=require('node:sqlite');
const relayDir=path.join(__dirname,'..','relay'),MIGRATION=fs.readdirSync(path.join(relayDir,'migrations')).filter(f=>f.endsWith('.sql')).sort().map(f=>fs.readFileSync(path.join(relayDir,'migrations',f),'utf8')).join('');
function d1(){const db=new DatabaseSync(':memory:');db.exec(MIGRATION);const stmt=(sql,args=[])=>({bind:(...a)=>stmt(sql,a),first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>{db.prepare(sql).run(...args);return {success:true};}});return {prepare:sql=>stmt(sql),raw:db};}
let mod;const relay=async()=>mod??=await import(pathToFileURL(path.join(relayDir,'src','worker.js')).href);
const pair=()=>{const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');return {privateKey,secret:privateKey.export({format:'der',type:'pkcs8'}).toString('base64'),publicKey:publicKey.export({format:'der',type:'spki'}).toString('base64')};};
const RELAY=pair(),MAINT=pair(),EVIL=pair();
const ENV={DB:d1(),HASH_SALT:'salt',AUTO_PROFILE_SIGNING_KEY:RELAY.secret,AUTO_PROFILE_KEY_ID:'r1',ADAPTER_ADMIN_TOKEN:'admin-token'};
const user=ip=>async(url,init={})=>{const {handle}=await relay();return handle(new Request(url,{method:init.method||'GET',headers:{'cf-connecting-ip':ip,...(init.headers||{})},body:init.body}),ENV,new Date());};
const maint=async(method,route,body)=>{const {handle}=await relay();return handle(new Request('https://relay.test'+route,{method,headers:{authorization:'Bearer admin-token','content-type':'application/json'},body:body?JSON.stringify(body):undefined}),ENV,new Date());};
const tmp=()=>fs.mkdtempSync(path.join(process.env.MEGULIT_TMP||os.tmpdir(),'autoprof-'));
const ap=require('../core/auto-profile.cjs'),feed=require('../services/auto-profile-feed.cjs'),gameDiff=require('../core/game-diff.cjs'),domains=require('../core/profiles/domains.cjs'),{signDoc}=require('../tools/game-diff.cjs');
feed._trust({official:[{id:'k1',alg:'ed25519',publicKey:MAINT.publicKey}],auto:[{id:'r1',alg:'ed25519',publicKey:RELAY.publicKey},{id:'k1',alg:'ed25519',publicKey:MAINT.publicKey}]});
const KA='x-'+'a'.repeat(64),KB='x-'+'b'.repeat(64),KC='x-'+'c'.repeat(64);
const HIDE={calibrate:{positionSource:'engine',textBox:{x:374,y:707,w:31,h:31,client:[1535,863]},hideMethod:'hide'},page:{effectFrames:null},hide:{textEffectsRead:false}};
const rec=(key,mode,settings,cost=0,extra={})=>({schema:1,key,engine:'krkr',exe:'senrenbanka.exe',version:'1.4.21',at:new Date().toISOString(),source:'calibration',mode,reason:'',settings,score:{metrics:{dropRate:0},cost},candidates:[],...extra});
const post=(ip,record)=>user(ip)('https://relay.test/api/auto-profile/report',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({version:1,profile:ap.diagnostic(record).profile})});
const get=async key=>{const r=await user('9.9.9.9')('https://relay.test/api/auto-profile/'+key);return {status:r.status,body:await r.json()};};

test('domains: every kernel key has a value domain and its default is in it',()=>{const D=require('../core/profiles/defaults.cjs');
 for(const leaf of domains.leaves(D)){assert.ok(domains.DOMAINS[leaf],'no domain for '+leaf);const v=leaf.split('.').reduce((o,k)=>o[k],D);assert.ok(domains.okValue(domains.DOMAINS[leaf],v),'default out of domain: '+leaf);}
 const c=domains.clean({placement:{firstLineAnchor:'glyph',lineOffsetY:9999,evil:'x'},choice:{filters:['(a+)+$','^…$']},hide:{textEffectsRead:'yes'},code:{run:'process.exit()'}});
 assert.deepEqual(c.value,{placement:{firstLineAnchor:'glyph'}});assert.deepEqual(c.rejected.sort(),['choice.filters','code.run','hide.textEffectsRead','placement.evil','placement.lineOffsetY'].sort());});

test('relay: one report is not enough; two agreeing reporters give one signed auto diff the app accepts',async()=>{
 assert.equal((await post('1.1.1.1',rec(KA,'hide',HIDE,0.5))).status,201);
 assert.equal((await get(KA)).status,404,'a single report is never shared');
 await post('1.1.1.1',rec(KA,'hide',HIDE,0.4));assert.equal((await get(KA)).status,404,'the same player again is still one reporter');
 await post('2.2.2.2',rec(KA,'hide',HIDE,0.2));
 const r=await get(KA);assert.equal(r.status,200);assert.equal(r.body.schema,'megulit.game-diff-feed');assert.equal(r.body.diff.source,'auto');assert.equal(r.body.diff.agree,2);
 const l=feed.layer(r.body,KA);assert.ok(l,'signature and values check out');assert.deepEqual(l.settings.calibrate,HIDE.calibrate);
 assert.equal(ENV.DB.raw.prepare('SELECT COUNT(*) n FROM game_diffs WHERE game_key=?').get(KA).n,1,'one diff per exe');
 /* poisoned: a value changed after signing, or a document signed by an unknown key, or under another key */
 const bad=JSON.parse(JSON.stringify(r.body));bad.diff.settings.calibrate.positionSource='ocr';assert.equal(feed.layer(bad,KA),null);
 const evil={...r.body,diff:signDoc(gameDiff.unsigned(r.body.diff),EVIL.privateKey,'r1')};assert.equal(feed.layer(evil,KA),null);
 assert.equal(feed.layer({...r.body,key:KB},KB),null);});

test('relay: best agreed score wins, read mode only with a majority, settings reduced to the domain',async()=>{
 const other={...HIDE,page:{effectFrames:true}};
 await post('3.3.3.3',rec(KA,'hide',other,0.05));await post('4.4.4.4',rec(KA,'hide',other,0.05));
 let r=await get(KA);assert.equal(r.body.diff.settings.page.effectFrames,true,'lower mean cost');
 await post('5.5.5.5',rec(KA,'read',{}));await post('6.6.6.6',rec(KA,'read',{}));
 r=await get(KA);assert.equal(r.body.diff.mode,'hide','2 read of 6 is no majority');
 for(const ip of ['7.7.7.7','8.8.8.8','10.0.0.1'])await post(ip,rec(KA,'read',{}));
 r=await get(KA);assert.equal(r.body.diff.mode,'read');assert.equal(r.body.diff.settings.hide.textEffectsRead,true);assert.ok(feed.layer(r.body,KA));
 await post('11.0.0.1',rec(KB,'hide',{...HIDE,evil:{x:1},choice:{filters:['^…$','(a+)+']},placement:{lineOffsetY:'1;rm'}}));
 const s=JSON.parse(ENV.DB.raw.prepare('SELECT settings FROM auto_profile_reports WHERE game_key=?').get(KB).settings);
 assert.equal(s.evil,undefined);assert.equal(s.choice,undefined,'a list with a dangerous RegExp is dropped whole');assert.equal(s.placement,undefined);
 const bad=async body=>(await user('12.0.0.1')('https://relay.test/api/auto-profile/report',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})).status;
 assert.equal(await bad({version:1,profile:{key:'fata-morgana',mode:'hide'}}),400,'keys are exe hashes');assert.equal(await bad({version:1,profile:{key:KB,mode:'weird'}}),400);
 assert.equal((await user('1.2.3.4')('https://relay.test/api/auto-profile/fata-morgana')).status,404);});

test('relay: official diff wins over auto, is checked, can be withdrawn; gate reports fill the repair queue',async()=>{
 const doc=signDoc(gameDiff.build({key:KA,source:'official',mode:'hide',settings:{placement:{firstLineAnchor:'box'}},exe:'senrenbanka.exe',engine:'krkr'}),MAINT.privateKey,'k1');
 assert.equal((await user('1.1.1.1')('https://relay.test/api/auto-profile/official',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({diff:doc})})).status,401,'maintainer only');
 assert.equal((await maint('POST','/api/auto-profile/official',{diff:{...doc,settings:{code:{x:'y'}}}})).status,400,'values outside the domain refused');
 assert.equal((await maint('POST','/api/auto-profile/official',{diff:doc})).status,201);
 let r=await get(KA);assert.equal(r.body.diff.source,'official');const l=feed.layer(r.body,KA);assert.equal(l.source,'official');assert.equal(l.settings.placement.firstLineAnchor,'box');
 const fake={...r.body,diff:signDoc(gameDiff.unsigned(r.body.diff),RELAY.privateKey,'r1')};assert.equal(feed.layer(fake,KA),null,'the relay key cannot make an official diff');
 assert.equal((await maint('POST','/api/auto-profile/official/withdraw',{key:KA})).status,200);r=await get(KA);assert.equal(r.body.diff.source,'auto');
 const trip=rec(KC,'read',{hide:{textEffectsRead:true}},0,{source:'gate',gate:{window:1,over:['dropRate','choiceMismatch'],metrics:{dropRate:.3}}});
 const q1=await post('20.0.0.1',trip);assert.equal((await q1.json()).queued,true);await post('20.0.0.2',trip);
 const q=await (await maint('GET','/api/auto-profile/queue')).json();const row=q.queue.find(x=>x.key===KC);assert.equal(row.reporters,2);assert.deepEqual(row.reasons,['dropRate','choiceMismatch']);
 assert.equal((await maint('POST','/api/auto-profile/official',{diff:signDoc(gameDiff.build({key:KC,source:'official',mode:'read',settings:{}}),MAINT.privateKey,'k1')})).status,201);
 const q2=await (await maint('GET','/api/auto-profile/queue')).json();assert.ok(!q2.queue.some(x=>x.key===KC),'an official diff closes the queue entry');});

test('relay: without its signing secret nothing automatic is handed out',async()=>{const save=ENV.AUTO_PROFILE_SIGNING_KEY;delete ENV.AUTO_PROFILE_SIGNING_KEY;
 try{const K='x-'+'d'.repeat(64);await post('30.0.0.1',rec(K,'hide',HIDE));await post('30.0.0.2',rec(K,'hide',HIDE));assert.equal((await get(K)).status,404);}finally{ENV.AUTO_PROFILE_SIGNING_KEY=save;}});

test('app: report gated by 共享适配, hot-updated layer by precedence (step-down > official > own calibration > shared)',async()=>{
 const root=tmp();try{
  const exe=path.join(root,'Game','game.exe');fs.mkdirSync(path.dirname(exe),{recursive:true});fs.writeFileSync(exe,'MZ-precedence');const key=await ap.exeKey(root,exe);
  await feed.report(root,rec(key,'hide',HIDE,0.1),{fetcher:user('40.0.0.1')});await feed.report(root,rec(key,'hide',HIDE,0.1),{fetcher:user('40.0.0.2')});
  const v=await feed.refresh(root,key,{fetcher:user('40.0.0.3')});assert.equal(v.diff.source,'auto');assert.equal(feed.layer(feed.cached(root,key),key).source,'auto');
  let calls=0;await feed.refresh(root,key,{fetcher:async()=>{calls++;throw Error('x');}});assert.equal(calls,0,'a fresh copy is not fetched again');
  const live=require('../services/self-check-live.cjs'),P=require('../core/profiles/index.cjs');const modes=[];
  const gal={setGameProfile(){},textEffectsHold:null,textEffects(on,why){modes.push([on,why]);this.textEffectsHold=on?{why}:null;},hooks:{pageMode:{engine:'krkr'},trace(){}}};
  const reader={root,gal,gameExe:exe,logVisibility(){}};const begin=()=>{live.stop();gal.textEffectsHold=null;modes.length=0;return live.start(reader,exe,P.profileFor({exe}),{exe});};
  let s=begin();assert.equal(s.from,'shared');assert.ok(s.check.recording,'still calibrating here');
  ap.store(root,key,ap.record({key,engine:'krkr',exe,version:'x',result:{mode:'hide',settings:{...HIDE,placement:{firstLineAnchor:'glyph'}},score:{cost:0}}}));
  s=begin();assert.equal(s.from,'local','own calibration over the shared one');assert.equal(s.layer.placement.firstLineAnchor,'glyph');
  await maint('POST','/api/auto-profile/official',{diff:signDoc(gameDiff.build({key,source:'official',mode:'hide',settings:{placement:{firstLineAnchor:'box'}}}),MAINT.privateKey,'k1')});
  await feed.refresh(root,key,{fetcher:user('40.0.0.3'),force:true});s=begin();assert.equal(s.from,'official','official over this PC');assert.equal(s.layer.placement.firstLineAnchor,'box');
  ap.store(root,key,ap.stepDown(ap.load(root,key),{key,engine:'krkr',exe,version:'x',trip:{window:1,over:['dropRate'],metrics:{},reason:'漏句'},window:{lines:20,metrics:{}}}));
  s=begin();assert.equal(s.from,'local-gate','a step-down here wins over everything');assert.equal(modes.length,1);assert.equal(modes[0][1],'漏句');
  live.stop();
  fs.writeFileSync(path.join(root,'data','config','library.json'),JSON.stringify({sharedAdaptation:false}));assert.equal((await feed.report(root,rec(key,'hide',HIDE),{fetcher:user('40.0.0.9')})).state,'skipped');
 }finally{fs.rmSync(root,{recursive:true,force:true});}});

test('runtime sample: first lines, boxes, names, at most 3 JPEG shots, packed for the probe',()=>{const root=tmp();try{
 const {RuntimeSample,files,keyDir}=require('../services/runtime-sample.cjs');const rs=new RuntimeSample({exe:'D:\\G\\game.exe',engine:'krkr'});const want=[];
 for(let i=1;i<=25;i++){const w=rs.event({kind:'line',at:i,seq:i,chars:10},i%2?'綾':'');if(w)want.push(i);rs.event({kind:'box',at:i,line:i,x:1,y:2,w:3,h:4,cw:800,ch:600});}
 assert.deepEqual(want,[3,10,18]);const jpg=Buffer.concat([Buffer.from([0xff,0xd8]),crypto.randomBytes(500)]).toString('base64');
 assert.ok(rs.shot(jpg));assert.ok(!rs.shot(Buffer.from('x'.repeat(300)).toString('base64')),'only JPEG');
 const K='x-'+'e'.repeat(64);const d=rs.save(root,K);const s=JSON.parse(fs.readFileSync(path.join(d,'sample.json'),'utf8'));
 assert.equal(s.exe,'game.exe');assert.equal(s.lines[0].name,'綾');assert.deepEqual(s.client,[800,600]);assert.equal(s.shots,1);assert.equal(d,keyDir(root,K));
 assert.deepEqual(files(d).map(f=>f.kind),['runtime','shot']);
 const src=fs.readFileSync(path.join(__dirname,'..','services','probe-full.cjs'),'latin1');assert.match(src,/runtime-sample\.cjs'\)\.files\(runtime\)/);assert.match(src,/kind!=='shot'&&isMediaBytes/);
}finally{fs.rmSync(root,{recursive:true,force:true});}});
