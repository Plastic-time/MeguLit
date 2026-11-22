// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: 每部游戏按 exe 哈希一份差分；官方差分优先，用户校准兜底；只是数据；签名只在我们本机，客户端验签) relay/src/auto-profile.js
   in-process (D1 on node:sqlite, R2 in a Map), our offline signing tool (tools/sign-profile.cjs) and the app side
   (services/auto-profile-feed.cjs, services/self-check-live.cjs, services/runtime-sample.cjs, services/probe-auto.cjs runtimeOnly,
   core/profiles/domains.cjs, core/game-diff.cjs). No network, no game. */
process.env.MEGULIT_RELAY_BASE='https://relay.test';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),zlib=require('node:zlib'),{pathToFileURL}=require('node:url'),{DatabaseSync}=require('node:sqlite');
const {malwareClean}=require('./helpers/torch-release.cjs');
const relayDir=path.join(__dirname,'..','relay'),MIGRATION=fs.readdirSync(path.join(relayDir,'migrations')).filter(f=>f.endsWith('.sql')).sort().map(f=>fs.readFileSync(path.join(relayDir,'migrations',f),'utf8')).join('');
function d1(){const db=new DatabaseSync(':memory:');db.exec(MIGRATION);const stmt=(sql,args=[])=>({bind:(...a)=>stmt(sql,a),first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>({success:true,meta:{changes:Number(db.prepare(sql).run(...args).changes)}}),_run:()=>({meta:{changes:Number(db.prepare(sql).run(...args).changes)}})});return {prepare:sql=>stmt(sql),raw:db,batch:async statements=>{db.exec('BEGIN IMMEDIATE');try{const results=statements.map(s=>s._run());db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}};}
function r2(){const store=new Map();return {store,put:async(k,b)=>{store.set(k,Buffer.from(b));},get:async k=>store.has(k)?{body:store.get(k)}:null,delete:async k=>{store.delete(k);}};}
let mod;const relay=async()=>mod??=await import(pathToFileURL(path.join(relayDir,'src','worker.js')).href);
const ENV={DB:d1(),BUCKET:r2(),HASH_SALT:'salt',ADAPTER_ADMIN_TOKEN:'admin-token'};
const user=ip=>async(url,init={})=>{const {handle}=await relay();return handle(new Request(url,{method:init.method||'GET',headers:{'cf-connecting-ip':ip,...(init.headers||{})},body:init.body}),ENV,new Date());};
const maint=async(method,route,body)=>{if(route==='/api/game-profile/signed'&&body?.diff?.signature&&require('../core/game-diff.cjs').validate(body.diff).ok)await malwareClean(ENV.DB,body.diff,ENV,new Date());const {handle}=await relay();return handle(new Request('https://relay.test'+route,{method,headers:{authorization:'Bearer admin-token','content-type':'application/json'},body:body?JSON.stringify(body):undefined}),ENV,new Date());};
const tmp=()=>fs.mkdtempSync(path.join(process.env.MEGULIT_TMP||os.tmpdir(),'autoprof-'));
const ap=require('../core/auto-profile.cjs'),feed=require('../services/auto-profile-feed.cjs'),gameDiff=require('../core/game-diff.cjs'),domains=require('../core/profiles/domains.cjs'),tool=require('../tools/sign-profile.cjs');
/* our signing key: a PEM outside the repository, named by the environment, as on our PC */
const KEYDIR=tmp(),PEM=path.join(KEYDIR,'megulit-profile-p1.pem');{const {privateKey,publicKey}=crypto.generateKeyPairSync('ed25519');fs.writeFileSync(PEM,privateKey.export({format:'pem',type:'pkcs8'}));
 feed._trust([{id:'p1',alg:'ed25519',publicKey:publicKey.export({format:'der',type:'spki'}).toString('base64')}]);}
const TOOLENV={MEGULIT_PROFILE_KEY:PEM,MEGULIT_PROFILE_KEY_ID:'p1',MEGULIT_ADMIN_TOKEN:'admin-token'};
const OURS=tool.privateKey(TOOLENV),EVIL=crypto.generateKeyPairSync('ed25519').privateKey;
const toolFetch=async(url,init={})=>{if(new URL(url).pathname==='/api/game-profile/signed'){const d=JSON.parse(init.body).diff;await malwareClean(ENV.DB,d,ENV,new Date());}const {handle}=await relay();return handle(new Request(url,{method:init.method||'GET',headers:init.headers||{},body:init.body}),ENV,new Date());};
const H=c=>c.repeat(64),KA=H('a'),KB=H('b'),KC=H('c');
const HIDE={calibrate:{positionSource:'engine',textBox:{x:374,y:707,w:31,h:31,client:[1535,863]},hideMethod:'hide'},page:{effectFrames:null},hide:{textEffectsRead:false}};
const rec=(key,mode,settings,cost=0,extra={})=>({schema:1,key,engine:'krkr',exe:'senrenbanka.exe',version:'1.4.21',at:new Date().toISOString(),source:'calibration',mode,reason:'',settings,score:{metrics:{dropRate:0},cost},candidates:[],...extra});
const post=(ip,record)=>user(ip)('https://relay.test/api/game-profile/report',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({version:1,profile:ap.diagnostic(record).profile})});
const get=async key=>{const r=await user('9.9.9.9')('https://relay.test/api/game-profile/'+key);return {status:r.status,body:await r.json()};};
const signRun=async()=>tool.signPicks('https://relay.test',path.join(KEYDIR,'signed'),{upload:true,fetcher:toolFetch,env:TOOLENV});

test('domains: every kernel key has a value domain and its default is in it; anything else is dropped',()=>{const D=require('../core/profiles/defaults.cjs');
 for(const leaf of domains.leaves(D)){assert.ok(domains.DOMAINS[leaf],'no domain for '+leaf);const v=leaf.split('.').reduce((o,k)=>o[k],D);assert.ok(domains.okValue(domains.DOMAINS[leaf],v),'default out of domain: '+leaf);}
 const c=domains.clean({placement:{firstLineAnchor:'glyph',lineOffsetY:9999,evil:'x'},choice:{filters:['(a+)+$','^…$']},hide:{textEffectsRead:'yes'},code:{run:'process.exit()'}});
 assert.deepEqual(c.value,{placement:{firstLineAnchor:'glyph'}});assert.deepEqual(c.rejected.sort(),['choice.filters','code.run','hide.textEffectsRead','placement.evil','placement.lineOffsetY'].sort());});

test('signing tool: the private key lives outside the repository, named by the environment only',()=>{
 assert.throws(()=>tool.privateKey({}),/MEGULIT_PROFILE_KEY/);assert.throws(()=>tool.privateKey({MEGULIT_PROFILE_KEY:path.join(__dirname,'x.pem')}),/repository/);
 const out=require('node:child_process').spawnSync(process.execPath,[path.join(__dirname,'..','tools','sign-profile.cjs'),'keygen',path.join(__dirname,'..','keys-here')],{encoding:'utf8'});assert.match(out.stderr,/repository/);assert.ok(!fs.existsSync(path.join(__dirname,'..','keys-here')));
 const keys=JSON.parse(fs.readFileSync(path.join(__dirname,'..','services','profile-keys.json'),'utf8'));assert.ok(Array.isArray(keys.keys));assert.ok(!JSON.stringify(keys).includes('PRIVATE'));});

test('relay: one report is not enough; two agreeing reporters make a pick; the relay signs nothing; our tool signs it and the app accepts it',async()=>{
 assert.equal((await post('1.1.1.1',rec(KA,'hide',HIDE,0.5))).status,201);await post('1.1.1.1',rec(KA,'hide',HIDE,0.4));
 assert.equal((await (await maint('GET','/api/game-profile/picks')).json()).picks.length,0,'one reporter is no pick');
 await post('2.2.2.2',rec(KA,'hide',HIDE,0.2));
 const picks=(await (await maint('GET','/api/game-profile/picks')).json()).picks;assert.equal(picks.length,1);assert.equal(picks[0].signature,undefined,'the relay holds no key');
 assert.equal((await get(KA)).status,404,'nothing is handed out unsigned');
 const done=await signRun();assert.deepEqual(done.map(d=>d.state),['uploaded']);assert.equal((await (await maint('GET','/api/game-profile/picks')).json()).picks.length,0,'signed picks leave the list');
 const r=await get(KA);assert.equal(r.status,200);assert.equal(r.body.schema,'megulit.game-diff-feed');assert.equal(r.body.diff.source,'auto');assert.equal(r.body.diff.agree,2);
 const l=feed.layer(r.body,KA);assert.ok(l,'signature and values check out');assert.deepEqual(l.settings.calibrate,HIDE.calibrate);
 /* poisoned: a value changed after signing, a document signed by another key, a document moved to another exe */
 const bad=JSON.parse(JSON.stringify(r.body));for(const d of [bad.diff,bad.versionLayer?.diff,bad.gameLayer?.diff])if(d)d.settings.calibrate&&(d.settings.calibrate.positionSource='ocr');assert.equal(feed.layer(bad,KA),null);
 {const evil=L=>L&&{...L,diff:tool.signDoc(L.diff,EVIL,'p1')};assert.equal(feed.layer({...r.body,diff:tool.signDoc(r.body.diff,EVIL,'p1'),versionLayer:evil(r.body.versionLayer),gameLayer:evil(r.body.gameLayer)},KA),null);}assert.equal(feed.layer({...r.body,key:KB},KB),null);
 /* an auto document that is not the current pick is refused */
 const stale=tool.signDoc({...gameDiff.unsigned(r.body.diff),settings:{hide:{textEffectsRead:false}}},OURS,'p1');assert.equal((await maint('POST','/api/game-profile/signed',{diff:stale})).status,409);});

test('relay: best agreed score wins, read mode only with a majority, settings reduced to the domain',async()=>{
 const other={...HIDE,page:{effectFrames:true}};
 await post('3.3.3.3',rec(KA,'hide',other,0.05));await post('4.4.4.4',rec(KA,'hide',other,0.05));await signRun();
 let r=await get(KA);assert.equal(r.body.diff.settings.page.effectFrames,true,'lower mean cost');
 await post('5.5.5.5',rec(KA,'read',{}));await post('6.6.6.6',rec(KA,'read',{}));await signRun();
 r=await get(KA);assert.equal(r.body.diff.mode,'hide','2 read of 6 is no majority');
 for(const ip of ['7.7.7.7','8.8.8.8','10.0.0.1'])await post(ip,rec(KA,'read',{}));await signRun();
 r=await get(KA);assert.equal(r.body.diff.mode,'read');assert.equal(r.body.diff.settings.hide.textEffectsRead,true);assert.ok(feed.layer(r.body,KA));
 await post('11.0.0.1',rec(KB,'hide',{...HIDE,evil:{x:1},choice:{filters:['^…$','(a+)+']},placement:{lineOffsetY:'1;rm'}}));
 const s=JSON.parse(ENV.DB.raw.prepare('SELECT settings FROM auto_profile_reports WHERE game_key=?').get(KB).settings);
 assert.equal(s.evil,undefined);assert.equal(s.choice,undefined,'a list with a dangerous RegExp is dropped whole');assert.equal(s.placement,undefined);
 const bad=async body=>(await user('12.0.0.1')('https://relay.test/api/game-profile/report',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})).status;
 assert.equal(await bad({version:1,profile:{key:'fata-morgana',mode:'hide'}}),400,'keys are exe hashes');assert.equal(await bad({version:1,profile:{key:KB,mode:'weird'}}),400);
 assert.equal((await user('1.2.3.4')('https://relay.test/api/game-profile/fata-morgana')).status,404);});

test('relay: official diff wins over auto, is ours only, can be withdrawn; gate reports fill the repair queue',async()=>{
 const doc=tool.signDoc(gameDiff.build({key:KA,rev:50,source:'official',mode:'hide',settings:{placement:{firstLineAnchor:'box'}},exe:'senrenbanka.exe',engine:'krkr'}),OURS,'p1');
 assert.equal((await user('1.1.1.1')('https://relay.test/api/game-profile/signed',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({diff:doc})})).status,401,'ours only');
 assert.equal((await maint('POST','/api/game-profile/signed',{diff:{...doc,settings:{code:{x:'y'}}}})).status,400,'values outside the domain refused');
 assert.equal((await maint('POST','/api/game-profile/signed',{diff:gameDiff.unsigned(doc)})).status,400,'unsigned refused');
 assert.equal((await maint('POST','/api/game-profile/signed',{diff:doc})).status,201);
 let r=await get(KA);assert.equal(r.body.diff.source,'official');const l=feed.layer(r.body,KA);assert.equal(l.source,'official');assert.equal(l.settings.placement.firstLineAnchor,'box');
 /* rev only grows: the same or an older official document is refused, a newer one replaces it */
 assert.equal((await maint('POST','/api/game-profile/signed',{diff:doc})).status,409,'same rev again');
 assert.equal((await maint('POST','/api/game-profile/signed',{diff:tool.signDoc(gameDiff.build({key:KA,source:'official',mode:'hide',settings:{}}),OURS,'p1')})).status,400,'an official document needs a rev');
 const doc2=tool.signDoc(gameDiff.build({key:KA,rev:51,source:'official',mode:'hide',settings:{placement:{firstLineAnchor:'glyph'}}}),OURS,'p1');assert.equal((await maint('POST','/api/game-profile/signed',{diff:doc2})).status,201);
 assert.equal((await get(KA)).body.diff.rev,51);
 assert.equal((await maint('POST','/api/game-profile/withdraw',{key:KA,source:'official'})).status,200);r=await get(KA);assert.equal(r.body.diff.source,'auto');
 const trip=rec(KC,'read',{hide:{textEffectsRead:true}},0,{source:'gate',gate:{window:1,over:['dropRate','choiceMismatch'],metrics:{dropRate:.3}}});
 const q1=await post('20.0.0.1',trip);assert.equal((await q1.json()).queued,true);await post('20.0.0.2',trip);
 const q=await (await maint('GET','/api/game-profile/queue')).json();const row=q.queue.find(x=>x.key===KC);assert.equal(row.reporters,2);assert.deepEqual(row.reasons,['dropRate','choiceMismatch']);
 assert.equal((await maint('POST','/api/game-profile/signed',{diff:tool.signDoc(gameDiff.build({key:KC,rev:50,source:'official',mode:'read',settings:{}}),OURS,'p1')})).status,201);
 assert.ok(!(await (await maint('GET','/api/game-profile/queue')).json()).queue.some(x=>x.key===KC),'an official diff closes the queue entry');});

test('app: uploads on by default (the switch turns them off), hot-updated layer by precedence (step-down > official > own calibration > shared)',async()=>{
 const root=tmp();try{
  assert.equal(feed.sharing(root),true,'calibration uploads are on by default');feed.setSharing(root,false);assert.equal((await feed.report(root,rec(H('f'),'hide',HIDE),{fetcher:user('40.0.0.8')})).state,'skipped','the switch turns them off');feed.setSharing(root,true);require('../services/runtime-sample.cjs').setEnabled(root,false);
  const exe=path.join(root,'Game','game.exe');fs.mkdirSync(path.dirname(exe),{recursive:true});fs.writeFileSync(exe,'MZ-precedence');const key=await ap.exeKey(root,exe);
  assert.equal(key,crypto.createHash('sha256').update('MZ-precedence').digest('hex'));
  await feed.report(root,rec(key,'hide',HIDE,0.1),{fetcher:user('40.0.0.1')});await feed.report(root,rec(key,'hide',HIDE,0.1),{fetcher:user('40.0.0.2')});await signRun();
  const v=await feed.refresh(root,key,{fetcher:user('40.0.0.3')});assert.equal(v.diff.source,'auto');assert.equal(feed.layer(feed.cached(root,key),key).source,'auto');
  let calls=0;await feed.refresh(root,key,{fetcher:async()=>{calls++;throw Error('x');}});assert.equal(calls,0,'a fresh copy is not fetched again');
  const live=require('../services/self-check-live.cjs'),P=require('../core/profiles/index.cjs');const modes=[];
  const gal={setGameProfile(){},textEffectsHold:null,textEffects(on,why){modes.push([on,why]);this.textEffectsHold=on?{why}:null;},hooks:{pageMode:{engine:'krkr'},trace(){}}};
  const reader={root,gal,gameExe:exe,logVisibility(){}};const begin=()=>{live.stop();gal.textEffectsHold=null;modes.length=0;return live.start(reader,exe,P.profileFor({exe}),{exe});};
  let s=begin();assert.equal(s.from,'shared');assert.ok(s.check.recording,'still calibrating here');assert.equal(s.sample,null,'no runtime sample when the player turned it off');
  ap.store(root,key,ap.record({key,engine:'krkr',exe,version:'x',result:{mode:'hide',settings:{...HIDE,placement:{firstLineAnchor:'glyph'}},score:{cost:0}}}));
  s=begin();assert.equal(s.from,'local','own calibration over the shared one');assert.equal(s.layer.placement.firstLineAnchor,'glyph');
  await maint('POST','/api/game-profile/signed',{diff:tool.signDoc(gameDiff.build({key,rev:5,source:'official',mode:'hide',settings:{placement:{firstLineAnchor:'box'}}}),OURS,'p1')});
  await feed.refresh(root,key,{fetcher:user('40.0.0.3'),force:true});s=begin();assert.equal(s.from,'official','official over this PC');assert.equal(s.layer.placement.firstLineAnchor,'box');
  ap.store(root,key,ap.stepDown(ap.load(root,key),{key,engine:'krkr',exe,version:'x',trip:{window:1,over:['dropRate'],metrics:{},reason:'漏句'},window:{lines:20,metrics:{}}}));
  s=begin();assert.equal(s.from,'local-gate','a step-down here wins over everything');assert.equal(modes.length,1);assert.equal(modes[0][1],'漏句');
  live.stop();
  fs.writeFileSync(path.join(root,'data','config','library.json'),JSON.stringify({autoProfileShare:true,sharedAdaptation:false}));assert.equal((await feed.report(root,rec(key,'hide',HIDE),{fetcher:user('40.0.0.9')})).state,'skipped','共享适配 off too');
 }finally{fs.rmSync(root,{recursive:true,force:true});}});

test('runtime sample: on by default, the switch turns it off; first lines, boxes, names, logs, at most 3 JPEG shots; sent alone when the full probe is there',async()=>{const root=tmp();try{
 const rs=require('../services/runtime-sample.cjs');assert.equal(rs.enabled(root),true,'on by default');rs.setEnabled(root,false);assert.equal(rs.enabled(root),false);rs.setEnabled(root,true);
 const sample=new rs.RuntimeSample({exe:'D:\\G\\game.exe',engine:'krkr'});const want=[];
 for(let i=1;i<=25;i++){sample.rawTrace('source chars=10 sequence='+i);const w=sample.event({kind:'line',at:i,seq:i,chars:10},i%2?'綾':'');if(w)want.push(i);sample.event({kind:'box',at:i,line:i,x:1,y:2,w:3,h:4,cw:800,ch:600});}
 sample.rawReader({type:'layoutDiagnostic',text:'C:\\Users\\'+(process.env.USERNAME||'someone')+'\\x'});
 assert.deepEqual(want,[3,10,18]);const jpg=Buffer.concat([Buffer.from([0xff,0xd8]),crypto.randomBytes(500)]).toString('base64');
 assert.ok(sample.shot(jpg));assert.ok(!sample.shot(Buffer.from('x'.repeat(300)).toString('base64')),'only JPEG');
 const exe=path.join(root,'G','game.exe');fs.mkdirSync(path.dirname(exe),{recursive:true});fs.writeFileSync(exe,'MZ-runtime');const K=await ap.exeKey(root,exe);
 /* engine-draw.log: only this run's lines go into the sample */
 fs.mkdirSync(path.join(root,'logs'),{recursive:true});const now=Date.now(),iso=ms=>new Date(ms).toISOString();
 fs.writeFileSync(path.join(root,'logs','engine-draw.log'),[iso(now-3600e3)+' ToMe_CHARS old',iso(now)+' ToMe_CHARS role=1 id=7 box=1,2,3,4 sel=0 emb=1',iso(now+3600e3)+' ToMe_CHARS later'].join('\n')+'\n');
 /* screenshot policy: a window that did not pass attaches its pictures; the pictures always stay in the local temp folder too */
 const d=sample.save(root,K,null,{pass:false,metrics:{dropRate:0.3},thresholds:{dropRate:0.15}});const s=JSON.parse(fs.readFileSync(path.join(d,'sample.json'),'utf8'));assert.equal(s.shotPolicy,'over');assert.ok(fs.existsSync(path.join(rs.localShots(K),'shot-1.jpg')));
 const draw=fs.readFileSync(path.join(d,'engine-draw.log'),'utf8');assert.match(draw,/role=1 id=7/);assert.ok(!/old|later/.test(draw),'only this window');
 assert.equal(s.exe,'game.exe');assert.equal(s.lines[0].name,'綾');assert.deepEqual(s.client,[800,600]);assert.equal(s.shots,1);
 assert.deepEqual(rs.files(d).map(f=>f.name),['engine-draw.log','hook-events.log','reader-host.log','sample.json','shot-1.jpg']);
 if(process.env.USERNAME&&process.env.USERNAME.length>=2)assert.ok(!fs.readFileSync(path.join(d,'reader-host.log'),'utf8').includes(process.env.USERNAME),'logs scrubbed');
 /* a clean pass uploads no picture; a pass at the edge does */
 assert.equal(rs.shotPolicy({pass:true,metrics:{dropRate:0.02,pairRate:0.95},thresholds:{dropRate:0.15,pairRate:0.8}}),'pass');assert.equal(rs.shotPolicy({pass:true,metrics:{dropRate:0.13},thresholds:{dropRate:0.15}}),'edge');
 assert.equal(rs.shotPolicy({pass:true,metrics:{pairRate:0.82},thresholds:{pairRate:0.8}}),'edge');assert.equal(rs.shotPolicy(null),'none');
 {const exe2=path.join(root,'G2','game.exe');fs.mkdirSync(path.dirname(exe2),{recursive:true});fs.writeFileSync(exe2,'MZ-runtime-2');const K2=await ap.exeKey(root,exe2);
  const again=new rs.RuntimeSample({exe:exe2,engine:'kirikiri',app:'1.4.21'});again.shot(jpg);const d2=again.save(root,K2,null,{pass:true,metrics:{dropRate:0},thresholds:{dropRate:0.15}});
  assert.ok(!rs.files(d2).some(f=>f.kind==='shot'),'a passing window sends no picture');
  /* full size stays local, the small copy is what goes up */
  const exe3=path.join(root,'G3','game.exe');fs.mkdirSync(path.dirname(exe3),{recursive:true});fs.writeFileSync(exe3,'MZ-runtime-3');const K3=await ap.exeKey(root,exe3);
  const big=Buffer.concat([Buffer.from([0xff,0xd8]),crypto.randomBytes(400*1024)]).toString('base64'),small=Buffer.concat([Buffer.from([0xff,0xd8]),crypto.randomBytes(50*1024)]).toString('base64');
  const third=new rs.RuntimeSample({exe:exe3});assert.ok(third.shot(big,small));assert.ok(third.shot(big),'a big picture without a small copy is kept locally only');
  const d3=third.save(root,K3,null,{pass:false,metrics:{},thresholds:{}});const sent=rs.files(d3).filter(f=>f.kind==='shot');assert.equal(sent.length,1);assert.equal(sent[0].data.length,Buffer.from(small,'base64').length);
  assert.equal(fs.statSync(path.join(rs.localShots(K3),'shot-1.jpg')).size,Buffer.from(big,'base64').length);
  const gal=fs.readFileSync(path.join(__dirname,'..','core','gal-native.cjs'),'utf8');assert.match(gal,/clientShot\(\{maxEdge=960,maxBytes=150\*1024\}=\{\}\)/);
  const cs=fs.readFileSync(path.join(__dirname,'..','native','GalWindowBridge.cs'),'utf8');assert.match(cs,/type=="clientShot"/);assert.match(cs,/ClientShotSelfTest\(\)\)return 9;/);assert.equal(JSON.parse(fs.readFileSync(path.join(d2,'sample.json'),'utf8')).shotsTaken,1);}
 const src=fs.readFileSync(path.join(__dirname,'..','services','probe-full.cjs'),'latin1');assert.match(src,/runtime-sample\.cjs'\)\.files\(runtime\)/);assert.match(src,/kind!=='shot'&&isMediaBytes/);
 /* the full probe of this game is on the relay already: only the runtime bundle goes, once per sample */
 const pa=require('../services/probe-auto.cjs'),ident={id:H('9')};
 const r1=await pa.runtimeOnly(root,{executable:exe},ident,{state:'sent'},{fetcher:user('50.0.0.1')});assert.equal(r1.state,'sent');
 const r2=await pa.runtimeOnly(root,{executable:exe},ident,{state:'sent',runtime:r1.stamp},{fetcher:user('50.0.0.1')});assert.equal(r2.state,'nothing','the same sample is not sent again');
 const list=(await (await maint('GET','/api/game-profile/runtime/list')).json()).runtime;assert.equal(list[0].key,K);assert.equal(list[0].identity,ident.id);
 const got=await maint('GET','/api/game-profile/runtime/get?key='+K);const bundle=JSON.parse(zlib.gunzipSync(Buffer.from(await got.arrayBuffer())));
 assert.equal(bundle.schema,'megulit.runtime-bundle');assert.deepEqual(bundle.files.map(f=>f.kind).sort(),['runtime','runtime','runtime','runtime','shot']);
 rs.setEnabled(root,false);assert.equal((await pa.runtimeOnly(root,{executable:exe},ident,{state:'sent'},{fetcher:user('50.0.0.1')})).state,'off');
}finally{fs.rmSync(root,{recursive:true,force:true});}});

test('fingerprints: exe, head, pe, main archive, Steam, title from a game folder; only well-formed values pass',()=>{const root=tmp();try{
 const gp=require('../core/game-print.cjs'),dir=path.join(root,'Game');fs.mkdirSync(dir,{recursive:true});
 const exe=Buffer.alloc(0x400);exe.write('MZ',0,'latin1');exe.writeUInt32LE(0x80,0x3c);exe.writeUInt32LE(0x4550,0x80);exe.writeUInt32LE(0x5f3a1b2c,0x88);fs.writeFileSync(path.join(dir,'game.exe'),exe);
 fs.writeFileSync(path.join(dir,'data.xp3'),crypto.randomBytes(3<<20));fs.writeFileSync(path.join(dir,'small.xp3'),crypto.randomBytes(2<<20));fs.writeFileSync(path.join(dir,'steam_appid.txt'),'303310\n');
 const p=gp.prints(path.join(dir,'game.exe'),{title:'ファタモルガーナの館',vndb:'V12402',engine:'krkr'});
 assert.equal(p.exe,crypto.createHash('sha256').update(exe).digest('hex'));assert.match(p.head,/^[0-9a-f]{64}$/);assert.equal(p.pe,'0.0.0.0@5f3a1b2c');assert.match(p.pack,/^[0-9a-f]{64}$/);
 assert.equal(p.steam,'303310');assert.equal(p.vndb,'v12402');assert.equal(p.title,gp.titleHash('ファタモルガーナの館 '));assert.equal(p.engine,'krkr');
 assert.deepEqual(gp.check({exe:'x',steam:'12a',vndb:'v1',title:'../..',pe:'1.2.3.4@zz'}),{vndb:'v1'});
}finally{fs.rmSync(root,{recursive:true,force:true});}});

test('relay: two layers, best match first: exe > head > pe for a build, archive > script > Steam > VNDB > title for the game',async()=>{
 const gp=require('../core/game-print.cjs');const A=H('1'),B=H('2'),C=H('3'),D=H('4'),E=H('5');const P=H('6'),T=gp.titleHash('千恋＊万花'),HEAD=H('7');
 const send=(ip,key,prints,settings=HIDE,cost=0.1)=>user(ip)('https://relay.test/api/game-profile/report',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({version:1,profile:ap.diagnostic(rec(key,'hide',settings,cost)).profile,prints})});
 const look=async qs=>{const r=await user('9.9.9.8')('https://relay.test/api/game-profile?'+qs);return {status:r.status,body:r.status===200?await r.json():null};};
 /* two players of build A (archive P, Steam 1144400, head HEAD); one player of build E who only has the Steam id */
 const g1=await (await send('60.0.0.1',A,{pack:P,steam:'1144400',head:HEAD})).json();const g2=await (await send('60.0.0.2',A,{pack:P,steam:'1144400',head:HEAD})).json();
 assert.ok(g1.game);assert.equal(g1.game,g2.game,'same game identity');
 const g3=await (await send('60.0.0.3',E,{steam:'1144400'})).json();assert.equal(g3.game,g1.game,'a known Steam id joins the same game');
 await signRun();
 let r=await look('exe='+A);assert.equal(r.body.match,'exe');assert.equal(r.body.versionLayer.match,'exe');assert.equal(r.body.gameLayer.match,'exe','the build is filed under its game');assert.ok(feed.layer(r.body,A));
 r=await look('exe='+B+'&head='+HEAD);assert.equal(r.body.match,'head','a re-signed build with the same head');assert.equal(r.body.versionLayer.key,A);
 r=await look('exe='+C+'&pack='+P);assert.equal(r.body.versionLayer,null);assert.equal(r.body.match,'pack');assert.equal(r.body.gameLayer.diff.layer,'game');assert.equal(r.body.gameLayer.key,g1.game);assert.ok(feed.layer(r.body,C),'a game-layer diff serves another build');
 r=await look('exe='+D+'&steam=1144400');assert.equal(r.body.match,'steam');
 assert.equal((await look('exe='+D+'&title='+T)).status,404,'an unknown title alone finds nothing');
 /* an official game diff defined by its title wins over the agreed one for every build */
 const off=tool.signDoc(gameDiff.build({key:g1.game,layer:'game',prints:{title:T,steam:'1144400'},rev:50,source:'official',mode:'hide',settings:{placement:{firstLineAnchor:'box'}}}),OURS,'p1');
 assert.equal((await maint('POST','/api/game-profile/signed',{diff:off})).status,201);
 r=await look('exe='+D+'&title='+T);assert.equal(r.body.match,'title');assert.equal(r.body.gameLayer.diff.source,'official');
 r=await look('exe='+A);assert.equal(r.body.gameLayer.diff.source,'official');assert.equal(r.body.versionLayer.diff.source,'auto','the build layer stays the agreed one');
 /* hot update: the revs the app has */
 const nr=(await user('9.9.9.8')('https://relay.test/api/game-profile?exe='+A+'&have='+r.body.versionLayer.diff.rev+'&haveGame='+r.body.gameLayer.diff.rev));assert.equal(nr.status,304);
 /* a new pick of the build gets the next rev */
 const rev0=r.body.versionLayer.diff.rev;for(const ip of ['61.0.0.1','61.0.0.2','61.0.0.3'])await send(ip,A,{pack:P},{...HIDE,page:{effectFrames:true}},0.01);await signRun();
 r=await look('exe='+A);assert.ok(r.body.versionLayer.diff.rev>rev0);assert.equal(r.body.versionLayer.diff.settings.page.effectFrames,true);
 assert.equal((await look('')).status,400,'no prints, no answer');});

test('relay: a shared candidate that failed its first window queues the build as newVersion; a game-level official diff leaves it open',async()=>{
 const X=H('d'),T=require('../core/game-print.cjs').titleHash('新しい版');
 const send=(ip,extra)=>user(ip)('https://relay.test/api/game-profile/report',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({version:1,profile:ap.diagnostic(rec(X,'read',{hide:{textEffectsRead:true}},0,{source:'gate',gate:{window:1,over:['dropRate'],metrics:{}},...extra})).profile,prints:{title:T}})});
 const g=(await (await send('70.0.0.1',{reason:'同游戏新版本：下发差分（match=title）第一个窗口未过线：漏句'})).json()).game;
 let q=(await (await maint('GET','/api/game-profile/queue')).json()).queue.find(x=>x.key===X);assert.equal(q.kind,'newVersion');assert.match(q.note,/^同游戏新版本/);
 assert.equal((await maint('POST','/api/game-profile/signed',{diff:tool.signDoc(gameDiff.build({key:g,layer:'game',prints:{title:T},rev:1,source:'official',mode:'hide',settings:{}}),OURS,'p1')})).status,201);
 q=(await (await maint('GET','/api/game-profile/queue')).json()).queue.find(x=>x.key===X);assert.ok(q,'still open: the build needs its own version layer');
 await send('70.0.0.2',{reason:'有台词没有画到阅读层（漏句）'});q=(await (await maint('GET','/api/game-profile/queue')).json()).queue.find(x=>x.key===X);assert.equal(q.kind,'broken');});
