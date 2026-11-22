// SPDX-License-Identifier: GPL-3.0-or-later
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture,database}=require('./helpers/torch-release.cjs');
const diff=require('../core/game-diff.cjs'),protocol=require('../core/torch-release.cjs');

test('report to durable claim, pause, signed review, scan, release and client changes',async t=>{
 const folder=path.resolve(__dirname,'../relay/migrations'),db=database(fs.readdirSync(folder).filter(n=>n.endsWith('.sql')).sort().map(n=>fs.readFileSync(path.join(folder,n),'utf8')).join('\n'));
 t.after(()=>db.raw.close());
 const f=fixture(),env={...f.env,DB:db,HASH_SALT:'neutral',ENHANCED_HOST_TOKEN:'fixture-host'};
 const {handle}=await import('../relay/src/worker.js');
 let time=new Date();
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
 await upload('hide',{page:{presentation:'adv'}});
 const {processOne}=require('../tools/enhanced-seed-queue-host.cjs');
 let signedCount=0;
 const hostOptions={base:'https://fixture.invalid',token:env.ENHANCED_HOST_TOKEN,keys:f.keys,
   fetcher:(url,options)=>handle(new Request(url,options),env,time),
   collect:async(c,{baseline})=>{
     assert.deepEqual(baseline,release);
     const p=f.publisher.sign({...profile,rev:2,settings:c.settings});
     return {profile:p,review:await f.review(p,baseline,{mean:.97,torchNo:c.torchNo})};
   },sign:p=>{signedCount++;return f.publisher.sign(p);}};
 assert.equal(await processOne(hostOptions),true);assert.equal(await processOne(hostOptions),false);
 assert.equal(signedCount,1);assert.equal((await api('torch-release/changes?after=0')).changes.length,2);
});
