// SPDX-License-Identifier: GPL-3.0-or-later
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture,database}=require('./helpers/torch-release.cjs');
const diff=require('../core/game-diff.cjs'),protocol=require('../core/torch-release.cjs');

test('report to durable claim, pause, signed review, scan, release and client changes',async t=>{
 const folder=path.resolve(__dirname,'../relay/migrations'),db=database(fs.readdirSync(folder).filter(n=>n.endsWith('.sql')).sort().map(n=>fs.readFileSync(path.join(folder,n),'utf8')).join('\n'));
 t.after(()=>db.raw.close());
 const f=fixture(),env={...f.env,DB:db,HASH_SALT:'neutral',ENHANCED_HOST_TOKEN:'fixture-host'};
 const root=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'enhanced-peer-'));
 const peer=path.join(root,'b'),exe=path.join(peer,'game.exe'),script=path.join(peer,'data.xp3');
 fs.mkdirSync(peer);fs.writeFileSync(exe,'neutral inert version');fs.writeFileSync(script,'neutral script');
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const receiver=require('../services/torch-receive.cjs'),feed=require('../services/auto-profile-feed.cjs');
 f.identity.exe=await receiver.fileHash(exe,{});f.identity.script=await receiver.fileHash(script,{});
 const {handle}=await import('../relay/src/worker.js');
 let time=new Date(Date.now()-301000);
 const api=async(route,body,token)=>{
   const res=await handle(new Request('https://fixture.invalid/api/'+route,{method:body?'POST':'GET',headers:{'cf-connecting-ip':'127.0.0.1','content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined}),env,time);
   return {...await res.json(),status:res.status};
 };
 const host=(action,body={})=>api('enhanced-seed/'+action,body,env.ENHANCED_HOST_TOKEN);
 const policy=(body)=>api('seed-admin/ordinary-policy',body,env.ADAPTER_ADMIN_TOKEN);
 const upload=(mode,settings={})=>api('game-profile/report',{version:1,profile:{key:f.identity.exe,mode,settings,engine:f.identity.engine},prints:{script:f.identity.script}});
 const posted=await upload('hide');assert.equal(posted.status,201);assert.equal((await upload('hide')).enhanced.id,posted.enhanced.id);
 assert.deepEqual((await policy()).enhanced,{pending:1,active:0,lastSeen:null,host:'waiting'});
 assert.equal((await api('enhanced-seed/claim',{})).status,401);
 const first=(await host('claim')).job;assert.equal((await host('claim')).job,null);
 await policy({enabled:false,revision:1});assert.equal((await host('claim')).job,null);
 await policy({enabled:true,revision:2});assert.equal((await host('renew',first)).status,409);
 const expired=(await host('claim')).job;time=new Date(+time+301000);
 const job=(await host('claim')).job;assert.notEqual(expired.lease,job.lease);
 const data={id:job.id,lease:job.lease};
 assert.equal((await host('ready',data)).error,'AWAITING_RECEIPT');
 assert.equal((await api('torch-release/changes?after=0')).changes.length,0);
 const profile=f.profile(),review=await f.review(profile,null,{torchNo:job.candidate.torchNo});
 assert.equal((await host('receipt',{...data,profile,review:{...review,mean:1}})).error,'TORCH_SIGNATURE');
 const accepted=await host('receipt',{...data,profile,review});assert.ok(accepted.proposal,JSON.stringify(accepted));
 const oldFetch=global.fetch;t.after(()=>{global.fetch=oldFetch;});
 env.ORDINARY_SCAN_URL='https://scanner.invalid/scan';env.ORDINARY_SCAN_TOKEN='fixture';
 global.fetch=async(url,init)=>{
   if(new URL(url).pathname==='/health')return Response.json({scanner:'online'});
   assert.equal(new URL(url).pathname,'/scan-enhanced');assert.equal(init.body,diff.canonical(JSON.parse(init.body)));
   return Response.json({state:'clean',scanner:'ClamAV',version:'1.2.3',definitions:'123',scannedAt:time.toISOString(),subject:await protocol.hash(JSON.parse(init.body))});
 };
 const ready=await host('ready',data);assert.deepEqual(ready.proposal,accepted.proposal,JSON.stringify(ready));
 const release=f.publisher.sign(ready.proposal);
 assert.equal((await host('publish',{...data,release})).status,200);
 assert.equal((await host('publish',{...data,release})).status,409);
 assert.equal((await api('torch-release/changes?after=0')).changes.length,1);
 assert.equal((await host('claim')).job,null);
 await upload('read');const second=(await host('claim')).job;
 const lower=f.publisher.sign({...profile,mode:'read',settings:second.candidate.settings,rev:2});
 const receipt=await f.review(lower,release,{mean:.91,torchNo:second.candidate.torchNo});
 assert.equal((await host('receipt',{...second,profile:lower,review:receipt})).error,'TORCH_NOT_BETTER');
 assert.equal((await host('claim')).job,null);
 assert.deepEqual((await api('torch-release?exe='+profile.key)).release,release);
 assert.equal((await api('torch-release/changes?after=0')).changes.length,1);
 // Exercise the desktop calibration uploader with temporary local data.
 const base='https://fixture.invalid';
 const dispatch=(url,init)=>handle(new Request(url,init),env,time);
 const key=f.identity.exe;
 const sent=await feed.report(root,{key,engine:f.identity.engine,mode:'hide',source:'calibration',
   settings:{page:{presentation:'adv'}},candidates:[]},{prints:{script:f.identity.script},fetcher:dispatch});
 assert.equal(sent.state,'sent');
 const {processOne,createCollector}=require('../tools/enhanced-seed-queue-host.cjs');
 let signedCount=0;
 const hostOptions={base:'https://fixture.invalid',token:env.ENHANCED_HOST_TOKEN,keys:f.keys,
   fetcher:(url,options)=>handle(new Request(url,options),env,time),
   collect:createCollector({samples:[{identity:f.identity,exe:'game.exe'}],policy:f.keys,
     signProfile:p=>f.publisher.sign(p),runHost:async(request,policy,{signal})=>{
       assert.deepEqual(request.baseline,release);assert.equal(signal.aborted,false);
       assert.equal(request.exe,'game.exe');assert.equal(request.candidate.source,'auto');
       return {state:'reviewed',review:await f.review(request.candidate,request.baseline,{mean:.97,torchNo:request.torchNo})};
     }}),sign:p=>{signedCount++;return f.publisher.sign(p);}};
 const {serve}=require('../tools/enhanced-seed-queue-host.cjs');
 const controller=new AbortController(),states=[];
 await serve(async()=>({state:await processOne(hostOptions)?'processed':'empty'}),controller.signal,{
   report:s=>states.push(JSON.parse(s).state),wait:async()=>{if(states.includes('empty'))controller.abort();}
 });
 assert.deepEqual(states,['processed','empty']);
 assert.equal(signedCount,1);assert.equal((await api('torch-release/changes?after=0')).changes.length,2);
 const dbB=require('../services/store.cjs').openStore(peer);
 dbB.prepare("INSERT INTO games(id,title,executable) VALUES('7','Fixture',?)").run(exe);dbB.close();
 feed._trust(f.keys.profileKeys);t.after(()=>feed._trust(null));
 // Install disposable review trust for the normal subscriber without writing shipped trust files.
 const read=fs.readFileSync;
 t.mock.method(fs,'readFileSync',function(file,...args){
   if(file===require.resolve('../services/torch-review-keys.json'))return JSON.stringify({keys:f.keys.reviewKeys});
   return read.call(this,file,...args);
 });
 global.fetch=dispatch;
 const sessions=require('../services/self-check-live.cjs'),applied=[];
 const reader={root:peer,gameId:'7',gal:{hooks:{},setGameProfile:p=>applied.push(p)}};
 const session=sessions.start(reader,exe,null,{exe,engine:f.identity.engine},{key});
 t.after(()=>sessions.stop());
 class Socket { constructor(){setImmediate(()=>this.onopen?.());} close(){} }
 const stop=require('../services/seed-live.cjs').subscribe(peer,{base,Socket,fetcher:dispatch});
 let cached;
 try{
   for(let i=0;i<150&&!cached;i++){
     await new Promise(resolve=>setTimeout(resolve,20));cached=feed.cached(peer,key)?.torchRelease;
   }
 }finally{await stop();}
 assert.equal(cached?.revision,2,JSON.stringify(receiver.status(peer,'7')));
 global.fetch=()=>assert.fail('offline reader issued a request');
 assert.equal(session.seedPending,true);
 reader.gal.hooks.beforeDialogue({hookSequence:1,hookSource:'next'});
 assert.equal(applied.at(-1)?.page.presentation,'adv');
 const layer=feed.layer(feed.cached(peer,key),key,{torchTrust:f.keys,exe});
 assert.equal(layer.version.settings.page.presentation,'adv');
 assert.ok(await receiver.installed(peer,key,{keys:f.keys,exe}));
});
test('one temporary account upload upgrades a scanned Seed in place and preserves its single carving',async t=>{
 const crypto=require('node:crypto'),{signer}=require('./helpers/torch-release.cjs');
 const root=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'same-seed-')),peer=path.join(root,'b');
 fs.mkdirSync(peer);t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const exe=path.join(peer,'game.exe'),script=path.join(peer,'data.xp3');
 fs.writeFileSync(exe,'inert version B');fs.writeFileSync(script,'neutral script');
 const receiver=require('../services/torch-receive.cjs'),feed=require('../services/auto-profile-feed.cjs');
 const f=fixture(),scanner=signer('ordinary-isolated'),now=new Date(),sec=Math.floor(+now/1000);
 const folder=path.resolve(__dirname,'../relay/migrations'),db=database(fs.readdirSync(folder).filter(n=>n.endsWith('.sql')).sort().map(n=>fs.readFileSync(path.join(folder,n),'utf8')).join('\n'));
 t.after(()=>db.raw.close());
 const key=f.identity.exe=await receiver.fileHash(exe,{});f.identity.script=await receiver.fileHash(script,{});
 // Local test catalog and script provider identify the inert sample. No real account or game is used.
 const works=(await import('../relay/src/torch-works.json',{with:{type:'json'}})).default;
 works[key]='v4';t.after(()=>delete works[key]);
 t.mock.method(require('../services/original-text.cjs'),'contributionScript',()=>f.identity.script);
 const token='mgl_'+crypto.randomBytes(32).toString('base64url');
 db.raw.prepare("INSERT INTO accounts(id,email,created_at,last_login_at) VALUES('fixture','a@example.invalid',?,?)").run(sec,sec);
 db.raw.prepare("INSERT INTO account_sessions(id,account_id,token_hash,created_at,last_used_at,rotated_at,expires_at) VALUES('temp','fixture',?,?,?,?,?)")
   .run(crypto.createHash('sha256').update(token).digest('hex'),sec,sec,sec,sec+3600);
 const env={...f.env,DB:db,HASH_SALT:'fixture',ORDINARY_SCAN_URL:'https://scanner.invalid/scan',ORDINARY_SCAN_TOKEN:'fixture',
   ORDINARY_PUBLIC_KEYS:JSON.stringify([scanner.public]),ENHANCED_HOST_TOKEN:'host'};
 const {handle}=await import('../relay/src/worker.js'),base='https://fixture.invalid';
 const dispatch=(url,init)=>handle(new Request(url,init),env,now);
 t.mock.method(global,'fetch',async(url,init)=>{
   if(new URL(url).hostname!=='scanner.invalid')return dispatch(url,init);
   const doc=JSON.parse(init.body),signed=scanner.sign(doc);
   return Response.json({subject:await protocol.hash(doc),state:'clean',scanner:'ClamAV',version:'1.2.3',definitions:'123',
     scannedAt:now.toISOString(),signature:signed.signature,artifact:await protocol.hash(signed)});
 });
 feed._trustOrdinary([scanner.public]);feed._trust(f.keys.profileKeys);
 t.after(()=>{feed._trust(null);feed._trustOrdinary(null);});
 const read=fs.readFileSync;
 t.mock.method(fs,'readFileSync',function(file,...args){
   if(file===require.resolve('../services/torch-review-keys.json'))return JSON.stringify({keys:f.keys.reviewKeys});
   return read.call(this,file,...args);
 });
 const library=require('../services/store.cjs').openStore(peer);
 library.prepare("INSERT INTO games(id,title,executable) VALUES('7','Fixture',?)").run(exe);library.close();
 let submissions=0,ack;
 const sent=await feed.report(root,{key,engine:f.identity.engine,source:'calibration',mode:'hide',settings:{page:{effectFrames:true}}},
   {prints:{script:f.identity.script},fetcher:async(url,init)=>{
     submissions++;const res=await dispatch(url,{...init,headers:{...init.headers,authorization:'Bearer '+token}});
     ack=await res.clone().json();return res;
   }});
 assert.equal(sent.state,'sent',JSON.stringify(ack));assert.equal(submissions,1);assert.ok(ack.ordinary.id&&ack.enhanced.id);
 const carvings=()=>db.raw.prepare('SELECT torch_no,game_key FROM torch_carvings ORDER BY torch_no').all();
 const credit=carvings();assert.equal(credit.length,1);assert.equal(credit[0].torch_no,ack.credit.torchNo);
 const {processJob}=await import('../relay/src/ordinary-seed.js');
 await processJob(env,ack.ordinary.id,now);
 const notices=[],applied=[],sessions=require('../services/self-check-live.cjs');
 const reader={root:peer,gameId:'7',gal:{hooks:{notify:m=>notices.push(m)},setGameProfile:p=>applied.push(p)}};
 const session=sessions.start(reader,exe,null,{exe,engine:f.identity.engine},{key});t.after(()=>sessions.stop());
 const receive=()=>receiver.receive(peer,'7',{fresh:true,liveSync:true,fetcher:dispatch});
 assert.equal((await receive()).receipt.origin,'ordinary-seed');
 reader.gal.hooks.beforeDialogue({hookSequence:1,hookSource:'next'});
 assert.equal(applied.at(-1).page.effectFrames,true);const firstNotices=notices.length;
 const {processOne,createCollector}=require('../tools/enhanced-seed-queue-host.cjs');
 assert.equal(await processOne({base,token:'host',keys:f.keys,fetcher:dispatch,
   collect:createCollector({samples:[{exe:'game.exe',identity:f.identity}],policy:f.keys,signProfile:p=>f.publisher.sign(p),
     runHost:async r=>({state:'reviewed',review:await f.review(r.candidate,null,{torchNo:r.torchNo})})}),sign:p=>f.publisher.sign(p)}),true);
 const enhanced=(await receive()).receipt;
 assert.equal(enhanced.origin,'torch-release');assert.equal(enhanced.credit.torchNo,ack.credit.torchNo);
 reader.gal.hooks.beforeDialogue({hookSequence:2,hookSource:'next'});
 assert.equal(session.seedPending,false);assert.equal(applied.at(-1).page.effectFrames,true);
 await receive();assert.equal(session.seedPending,false);reader.gal.hooks.beforeDialogue({hookSequence:3,hookSource:'next'});
 assert.equal(notices.length,firstNotices);assert.deepEqual(carvings(),credit);
 assert.deepEqual(fs.readdirSync(feed.dir(peer)).filter(n=>n===key+'.json'),[key+'.json']);
 assert.equal((await receiver.installed(peer,key,{keys:f.keys,exe})).hash,enhanced.hash);
});
