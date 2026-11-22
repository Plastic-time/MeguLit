// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
process.env.MEGULIT_RELAY_BASE='https://relay.test';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const R=require('../services/torch-receive.cjs'),feed=require('../services/auto-profile-feed.cjs'),first=require('../services/first-player.cjs'),{fixture}=require('./helpers/torch-release.cjs'),P=require('../core/torch-release.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),reply=v=>new Response(JSON.stringify(v),{status:200,headers:{'content-type':'application/json'}});
async function setup(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'mgl-torch-')),exe=path.join(root,'game.exe'),script=path.join(root,'data.xp3');fs.writeFileSync(exe,'MZ neutral inert fixture');fs.writeFileSync(script,'neutral script container');const f=fixture();f.identity.exe=sha(fs.readFileSync(exe));f.identity.script=sha(fs.readFileSync(script));feed._trust(f.keys.profileKeys);let row={id:'7',title:'Neutral fixture',executable:exe,engine:'KiriKiri'};const getGame=()=>row,db={prepare:()=>({get:getGame})};t.after(()=>{feed._trust(null);fs.rmSync(root,{recursive:true,force:true});});const release=await f.release(),publication={hash:await P.hash(release),at:'2026-11-21T02:00:00.000Z'},options={getGame,resources:()=>true,keys:f.keys,urls:['https://relay.test/api/torch-release'],fetcher:async()=>reply({release,publication,credit:{torchNo:0,name:'Public name'}})};return {...f,root,exe,script,release,publication,options,db,setRow:v=>{row=v;},cache:()=>path.join(feed.dir(root),f.identity.exe+'.json')};}
test('import installs only profile data atomically, binds all signatures and actual exe+whole script hash, shows current before old thanks',async t=>{const f=await setup(t),exe=fs.readFileSync(f.exe),script=fs.readFileSync(f.script);feed.markSent(f.root,f.identity.exe,{torchNo:6,name:'Old self',at:'old'});const got=await R.receive(f.root,'7',f.options);assert.equal(got.state,'received');assert.equal(got.receipt.serverTime,f.publication.at);assert.equal(got.receipt.hash,await P.hash(f.release));assert.equal(got.receipt.credit.torchNo,0);assert.equal(got.receipt.credit.name,'Public name');assert.deepEqual(fs.readFileSync(f.exe),exe);assert.deepEqual(fs.readFileSync(f.script),script);assert.equal(fs.existsSync(path.join(f.root,'data','config','library.json')),false);const card=await first.state(f.db,f.root,'7',{wait:0,hash:async()=>f.identity.exe,torchKeys:f.keys});assert.equal(card.state,'received');assert.equal(card.receipt.hash,got.receipt.hash);assert.equal(feed.layer(feed.cached(f.root,f.identity.exe),f.identity.exe,{torchTrust:f.keys,exe:f.exe}).exact,true);});
test('wrong exe/script/signature/key set cannot install and old cache is unchanged',async t=>{const f=await setup(t);await R.receive(f.root,'7',f.options);const before=fs.readFileSync(f.cache());for(const change of ['script','signature','reviewKey']){const options={...f.options};if(change==='script')fs.writeFileSync(f.script,'different bytes');if(change==='signature'){const release=structuredClone(f.release);release.signature.value='A'.repeat(86)+'==';options.fetcher=async()=>reply({release});}if(change==='reviewKey')options.keys={...f.keys,reviewKeys:[]};assert.equal((await R.receive(f.root,'7',options)).state,'install-failed');assert.deepEqual(fs.readFileSync(f.cache()),before);if(change==='script')fs.writeFileSync(f.script,'neutral script container');}});
test('duplicate imports share one in-flight fetch; late answer after removal/change cannot commit',async t=>{const f=await setup(t);let unblock,calls=0;const gate=new Promise(r=>{unblock=r;}),options={...f.options,fetcher:async()=>{calls++;await gate;return reply({release:f.release,publication:f.publication});}};const a=R.receive(f.root,'7',options),b=R.receive(f.root,'7',options);await new Promise(r=>setTimeout(r,30));assert.equal(calls,1);f.setRow(null);unblock();const both=await Promise.all([a,b]);assert.ok(both.every(v=>v.state==='install-failed'&&v.code==='TORCH_GAME_CHANGED'));assert.equal(fs.existsSync(f.cache()),false);});
test('write failure and cancelled job preserve previous installation, with no false success',async t=>{const f=await setup(t);await R.receive(f.root,'7',f.options);const before=fs.readFileSync(f.cache());const failOptions={...f.options,atomicWrite:()=>{throw Error('simulated disk failure');}};assert.equal((await R.receive(f.root,'7',failOptions)).state,'install-failed');assert.deepEqual(fs.readFileSync(f.cache()),before);const ac=new AbortController();ac.abort();assert.equal((await R.receive(f.root,'7',{...f.options,signal:ac.signal})).state,'install-failed');assert.deepEqual(fs.readFileSync(f.cache()),before);assert.ok(await R.installed(f.root,f.identity.exe,{keys:f.keys,exe:f.exe}));});
test('local container changes invalidate reader layer; stale release cannot roll a newer install back',async t=>{const f=await setup(t);await R.receive(f.root,'7',f.options);const p=f.profile(2),r=f.publisher.sign({...f.release,revision:2,previous:await P.hash(f.release),profile:p,review:await f.review(p,f.release,{mean:.96})});await R.receive(f.root,'7',{...f.options,fetcher:async()=>reply({release:r,publication:{hash:await P.hash(r),at:'2026-11-21T02:00:00.000Z'}})});const before=fs.readFileSync(f.cache());assert.equal((await R.receive(f.root,'7',f.options)).code,'TORCH_ROLLBACK');assert.deepEqual(fs.readFileSync(f.cache()),before);fs.writeFileSync(f.script,'modified');assert.equal(feed.layer(feed.cached(f.root,f.identity.exe),f.identity.exe,{torchTrust:f.keys,exe:f.exe}),null);assert.equal(await R.installed(f.root,f.identity.exe,{keys:f.keys,exe:f.exe}),null);});
test('revocation quarantines active profile and retains antirollback floor; old feed cannot override it',async t=>{const f=await setup(t);await R.receive(f.root,'7',f.options);const no=await R.receive(f.root,'7',{...f.options,fetcher:async()=>new Response('',{status:410})});assert.equal(no.code,'TORCH_REVOKED');assert.equal(feed.layer(feed.cached(f.root,f.identity.exe),f.identity.exe),null);assert.equal((await R.receive(f.root,'7',f.options)).code,'TORCH_ROLLBACK');const old=fs.readFileSync(f.cache());await feed.refresh(f.root,f.identity.exe,{force:true,fetcher:async()=>new Response('',{status:404})});assert.deepEqual(fs.readFileSync(f.cache()),old);});
test('legacy exact signed data auto installs for existing known games without fabricating author/time/cardinal result',async t=>{const f=await setup(t),profile=f.profile();const v={schema:'megulit.game-diff-feed',version:2,key:f.identity.exe,versionLayer:{match:'exe',key:f.identity.exe,diff:profile},credit:{torchNo:3,name:'Unsigned metadata',at:Date.now()}};const got=await R.receive(f.root,'7',{...f.options,fetcher:async()=>new Response('',{status:404}),refresh:async()=>v});assert.equal(got.state,'received');assert.equal(got.receipt.serverTime,null);assert.equal(got.receipt.credit,null);assert.equal(got.receipt.cardinalRev,null);const cached=feed.cached(f.root,f.identity.exe);assert.ok(feed.layer(cached,f.identity.exe).exact);assert.equal(cached.torchInstalled,true);});
test('legacy nonexact or untrusted answers remain candidates, never installed receipts',async t=>{const f=await setup(t),p=f.profile(),v={schema:'megulit.game-diff-feed',version:2,key:f.identity.exe,versionLayer:{match:'head',key:'e'.repeat(64),diff:p}};assert.equal((await R.receive(f.root,'7',{...f.options,fetcher:async()=>new Response('',{status:404}),refresh:async()=>v})).state,'hidden');assert.equal(fs.existsSync(f.cache()),false);});
test('bounded streams and root-relative script descriptors reject oversized bodies/escapes',async t=>{const f=await setup(t);await assert.rejects(R.body(new Response('x'.repeat(P.MAX_BYTES+1))),/TORCH_LIMIT/);await assert.rejects(R.body(new Response('{}',{headers:{'content-length':P.MAX_BYTES+1}})),/TORCH_LIMIT/);for(const relative of ['../data.xp3','C:/data.xp3','x/../data.xp3','data.xp3:bad'])assert.throws(()=>R.scriptPath(f.exe,relative),/TORCH_SCRIPT_PATH/);await assert.rejects(R.fileHash(f.script,{maxBytes:2}),/TORCH_LOCAL_LIMIT/);});
test('ordinary legacy refresh cannot inject a new release or overwrite current signed winner',async t=>{const f=await setup(t);await R.receive(f.root,'7',f.options);const before=fs.readFileSync(f.cache()),out=await feed.refresh(f.root,f.identity.exe,{force:true,fetcher:async()=>reply({schema:'megulit.game-diff-feed',version:1,key:f.identity.exe,diff:f.profile(99)})});assert.deepEqual(fs.readFileSync(f.cache()),before);assert.equal(out.torchRelease.revision,1);});
test('root queue is serial and stop aborts its live fetch, waits for exit and discards queued ids until explicit resume',async t=>{const f=await setup(t),second=path.join(f.root,'second.exe');fs.writeFileSync(second,'MZ another inert fixture');let calls=0,exited=false;const options={...f.options,priority:'user',getGame:(_root,id)=>({id,executable:id==='1'?f.exe:second}),refresh:async()=>null,fetcher:(_url,{signal})=>new Promise((resolve,reject)=>{calls++;signal.addEventListener('abort',()=>{exited=true;reject(signal.reason);},{once:true});})};R.enqueue(f.root,['1','2','2'],options);for(let i=0;i<30&&!calls;i++)await new Promise(r=>setTimeout(r,5));assert.equal(calls,1);assert.deepEqual(await R.stop(f.root),{cleanupConfirmed:true});assert.equal(exited,true);assert.equal(calls,1);assert.equal(R.enqueue(f.root,['2'],options),false);assert.equal((await R.receive(f.root,'2',options)).code,'TORCH_STOPPED');R.resume(f.root);assert.equal((await R.receive(f.root,'2',{...options,fetcher:async()=>new Response('',{status:404})})).state,'hidden');});
test('missing/mismatched/implausible publication record never claims installed winner',async t=>{const f=await setup(t);for(const publication of [undefined,{hash:'f'.repeat(64),at:f.publication.at},{hash:f.publication.hash,at:'1999-01-01T00:00:00.000Z'},{hash:f.publication.hash,at:'2099-01-01T00:00:00.000Z'}]){const out=await R.receive(f.root,'7',{...f.options,fetcher:async()=>reply({release:f.release,publication})});assert.equal(out.code,'TORCH_PUBLICATION');assert.equal(fs.existsSync(f.cache()),false);}});
test('only verified published auto profile derives official precedence; fresh loader rechecks every grant',async t=>{const f=await setup(t),profile=f.publisher.sign({...f.profile(),source:'auto',settings:{placement:{lineOffsetY:3}}}),review=await f.review(profile,null,{torchNo:5}),release=f.publisher.sign({...f.release,profile,review}),publication={hash:await P.hash(release),at:f.publication.at};const legacy={schema:'megulit.game-diff-feed',version:1,key:f.identity.exe,diff:profile};assert.equal(feed.layer(legacy,f.identity.exe).source,'auto');await R.receive(f.root,'7',{...f.options,fetcher:async()=>reply({release,publication})});const answer=feed.cached(f.root,f.identity.exe),layer=feed.layer(answer,f.identity.exe,{torchTrust:f.keys,exe:f.exe});assert.equal(layer.source,'official');assert.equal(answer.diff.source,'auto');const merged=require('../core/profiles/index.cjs').profileFor({engine:'KiriKiri',exeSha256:f.identity.exe,auto:{placement:{lineOffsetY:2}},official:layer.version.settings,officialRev:layer.version.rev});assert.equal(merged.placement.lineOffsetY,3);assert.equal(merged.draw.roles,false);assert.equal(merged.draw.embed,false);assert.equal(feed.layer(answer,f.identity.exe),null,'unconfigured reviewer cannot grant official');for(const part of ['review','profile','local']){const bad=structuredClone(answer);if(part==='review')bad.torchRelease.review.cardinalRev='7';if(part==='profile')bad.diff.source='official';if(part==='local')delete bad.torchLocal;assert.equal(feed.layer(bad,f.identity.exe,{torchTrust:f.keys,exe:f.exe}),null);}});
test('newer bundled seed blocks conflicting downloaded data on install and on future loads',async t=>{const f=await setup(t),S=require('../core/profiles/seed.cjs'),prior=S.versionOf;S.versionOf=()=>({rev:10,settings:{placement:{lineOffsetY:4}}});t.after(()=>{S.versionOf=prior;});assert.equal((await R.receive(f.root,'7',f.options)).code,'TORCH_BUILTIN_NEWER');assert.equal(fs.existsSync(f.cache()),false);S.versionOf=prior;await R.receive(f.root,'7',f.options);const cached=feed.cached(f.root,f.identity.exe);assert.ok(feed.layer(cached,f.identity.exe,{torchTrust:f.keys,exe:f.exe}));S.versionOf=()=>({rev:10,settings:{placement:{lineOffsetY:4}}});assert.equal(feed.layer(cached,f.identity.exe,{torchTrust:f.keys,exe:f.exe}),null);});
test('late legacy response rechecks newest cache at commit and cannot overwrite an intervening higher revision',async t=>{const f=await setup(t);let release,arrived;const gate=new Promise(r=>{release=r;}),ready=new Promise(r=>{arrived=r;}),answer=rev=>({schema:'megulit.game-diff-feed',version:1,key:f.identity.exe,diff:f.profile(rev)});const job=R.receive(f.root,'7',{...f.options,fetcher:async()=>new Response('',{status:404}),refresh:async()=>{arrived();await gate;return answer(2);}});await ready;fs.mkdirSync(feed.dir(f.root),{recursive:true});fs.writeFileSync(f.cache(),JSON.stringify(answer(3)));const before=fs.readFileSync(f.cache());release();assert.equal((await job).code,'TORCH_ROLLBACK');assert.deepEqual(fs.readFileSync(f.cache()),before);const r=await feed.refresh(f.root,f.identity.exe,{force:true,fetcher:async()=>reply(answer(2))});assert.equal(r.diff.rev,3);assert.deepEqual(fs.readFileSync(f.cache()),before);});
test('urgent import preempts task-owned blocked bulk fetch and runs before old queued library ids',async t=>{const f=await setup(t),hashes=[];for(const id of ['old1','old2','new'])fs.writeFileSync(path.join(f.root,id+'.exe'),'MZ '+id);let started,urgent,aborted=false,idle=true;const begun=new Promise(r=>{started=r;}),ready=new Promise(r=>{urgent=r;}),base={...f.options,getGame:(_root,id)=>({id,executable:path.join(f.root,id+'.exe')}),allowedIdle:()=>idle,hashExe:async(file,o)=>{hashes.push(path.basename(file));return R.fileHash(file,o);},refresh:async()=>null};const bulk={...base,fetcher:(_u,{signal})=>new Promise((resolve,reject)=>{started();signal.addEventListener('abort',()=>{aborted=true;idle=false;reject(signal.reason);},{once:true});})};R.enqueue(f.root,['old1','old2'],bulk);await begun;R.enqueue(f.root,['new'],{...base,priority:'user',active:()=>true,fetcher:async()=>{urgent();return new Response('',{status:404});}});await ready;await R.stop(f.root);assert.equal(aborted,true);assert.deepEqual(hashes,['old1.exe','new.exe']);});
test('promoting already queued id wakes idle wait; duplicate active user requests never repeat hash or fetch',async t=>{const f=await setup(t);let hashes=0,fetches=0,release,started;const pending=new Promise(r=>{release=r;}),begun=new Promise(r=>{started=r;}),base={...f.options,allowedIdle:()=>false,hashExe:async(file,o)=>{hashes++;return R.fileHash(file,o);},refresh:async()=>null};R.enqueue(f.root,['old','7','tail'],base);await new Promise(r=>setTimeout(r,10));const user={...base,priority:'user',active:()=>true,fetcher:async()=>{fetches++;started();await pending;return new Response('',{status:404});}};R.enqueue(f.root,['7'],user);await begun;R.enqueue(f.root,['7'],user);release();await new Promise(r=>setTimeout(r,20));await R.stop(f.root);assert.equal(hashes,1);assert.equal(fetches,1);});
test('low resources or lost explicit focus prevents even starting exe hash and never creates an installed cache',async t=>{const f=await setup(t);let hashes=0,fetches=0;for(const patch of [{resources:()=>false},{priority:'user',active:()=>false}]){const result=await R.receive(f.root,'7',{...f.options,...patch,hashExe:async()=>{hashes++;return f.identity.exe;},fetcher:async()=>{fetches++;return reply({release:f.release});}});assert.equal(result.code,'TORCH_DEFERRED');assert.equal(result.state,'hidden');}assert.equal(hashes,0);assert.equal(fetches,0);assert.equal(fs.existsSync(f.cache()),false);assert.throws(()=>R.enqueue(f.root,Array(5001).fill('7'),f.options),/TORCH_QUEUE_LIMIT/);});
test('revoked or ambiguous reviewer keys cannot grant cached official permission',async t=>{const f=await setup(t);await R.receive(f.root,'7',f.options);const answer=feed.cached(f.root,f.identity.exe);for(const reviewKeys of [[{...f.keys.reviewKeys[0],revoked:true}],[...f.keys.reviewKeys,...f.keys.reviewKeys]]){const keys={...f.keys,reviewKeys};assert.equal(feed.layer(answer,f.identity.exe,{torchTrust:keys,exe:f.exe}),null);await assert.rejects(P.checked(f.release,keys),/TORCH_SIGNATURE/);}});
test('resources measures only actual application/game paths, never assumes Windows E/H volumes exist',async t=>{const f=await setup(t),seen=new Set(),known=new Set([f.root,f.exe,f.script]),statfs=file=>{assert.ok(known.has(file),'unexpected volume probe: '+file);seen.add(file);return {bavail:4096,bsize:4096};};const result=await R.receive(f.root,'7',{...f.options,resources:(root,options)=>R.resources(root,{...options,freemem:()=>256*1024**2,statfs})});assert.equal(result.state,'received');assert.deepEqual(seen,known);});
test('resource measurement errors, invalid numbers and real low capacity defer instead of silently allowing a job',()=>{const root='C:/OnlyExistingVolume',good={freemem:()=>256*1024**2,statfs:()=>({bavail:4096,bsize:4096})};assert.equal(R.resources(root,good),true);for(const patch of [{freemem:()=>256*1024**2-1},{freemem:()=>NaN},{statfs:()=>({bavail:4095,bsize:4096})},{statfs:()=>({bavail:NaN,bsize:4096})},{statfs:()=>{throw Error('volume unavailable');}}])assert.equal(R.resources(root,{...good,...patch}),false);assert.equal(R.resources(root,{...good,paths:['D:/actual-game/game.exe'],statfs:file=>{if(file!==root)throw Error('game volume unavailable');return {bavail:4096,bsize:4096};}}),false);});


test('owner launcher can receive an exact signed fire without opening the general relay',async t=>{
 const f=await setup(t),launcher=require('../tools/owner-tests-launch.cjs');
 const env=launcher.environment(f.root,{MEGULIT_RELAY_BASE:'https://ignored.invalid'});
 const previous=Object.fromEntries([...Object.keys(env),'MEGULIT_OFFLINE'].map(key=>[key,process.env[key]]));
 t.after(()=>{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
 Object.assign(process.env,env);
 const urls=[],options={...f.options,urls:undefined,fetcher:async(url,request)=>{
  urls.push(url);
  assert.equal(request.method,'GET');
  assert.equal(request.redirect,'error');
  assert.equal(request.credentials,'omit');
  assert.equal(request.cache,'no-store');
  assert.equal(request.body,undefined);
  if(url.startsWith(relay.CN_RELAY_BASE))return Response.json({ok:false,error:'NOT_FOUND'},{status:404});
  return reply({release:f.release,publication:f.publication});
 }};
 const relay=require('../services/relay-config.cjs');
 assert.deepEqual(relay.endpoints(f.root,'/api/diagnostics'),[]);
 assert.equal(feed.sharing(f.root),false);
 process.env.MEGULIT_OFFLINE='1';
 assert.equal((await R.receive(f.root,'7',options)).state,'hidden');
 assert.deepEqual(urls,[]);
 delete process.env.MEGULIT_OFFLINE;
 const result=await R.receive(f.root,'7',options);
 assert.equal(result.state,'received');
 assert.deepEqual(urls,[relay.CN_RELAY_BASE,relay.DEFAULT_RELAY_BASE].map(base=>base+'/api/torch-release?exe='+f.identity.exe));
 assert.ok(fs.existsSync(f.cache()));
});

test('dual mirrors prefer the newest verified publication and refuse mixed hard failures',async t=>{
 const f=await setup(t),urls=['https://one.test/release','https://two.test/release'];
 const profile=f.profile(2),review=await f.review(profile,f.release,{mean:.96});
 const newer=f.publisher.sign({...f.release,revision:2,previous:f.publication.hash,profile,review});
 const newestPublication={hash:await P.hash(newer),at:f.publication.at};
 const old=()=>reply({release:f.release,publication:f.publication});
 const latest=()=>reply({release:newer,publication:newestPublication});
 const failed=(code,status)=>()=>Response.json({ok:false,error:code},{status});
 const receive=(first,second)=>R.receive(f.root,'7',{
  ...f.options,urls,refresh:async()=>assert.fail('legacy fallback must not run'),
  fetcher:url=>(url===urls[0]?first:second)()
 });
 assert.equal((await receive(failed('NOT_FOUND',404),()=>new Response(null,{status:503}))).code,'TORCH_RELAY_UNAVAILABLE');
 assert.equal((await receive(old,latest)).receipt?.hash,newestPublication.hash);
 const before=fs.readFileSync(f.cache());
 const bad=()=>reply({release:{...newer,signature:{...newer.signature,value:'A'.repeat(86)+'=='}},publication:newestPublication});
 assert.equal((await receive(bad,latest)).code,'TORCH_SIGNATURE');
 assert.equal((await receive(latest,failed('TORCH_SIGNATURE',422))).code,'TORCH_SIGNATURE');
 const alternate=f.publisher.sign({...newer,preparedAt:'2026-11-21T01:01:00.000Z'});
 const alternatePublication={...newestPublication,hash:await P.hash(alternate)};
 assert.equal((await receive(latest,()=>reply({release:alternate,publication:alternatePublication}))).code,'TORCH_RELEASE_CONFLICT');
 assert.deepEqual(fs.readFileSync(f.cache()),before);
});

test('revocation beats a signed mirror and persists through missing relays and legacy refresh',async t=>{
 const f=await setup(t),urls=['https://one.test/release','https://two.test/release'];
 const stale=()=>reply({release:f.release,publication:f.publication});
 const revoked=()=>Response.json({ok:false,error:'TORCH_REVOKED'},{status:410});
 const missing=()=>Response.json({ok:false,error:'NOT_FOUND'},{status:404});
 const receive=(first,second)=>R.receive(f.root,'7',{
  ...f.options,urls,refresh:async()=>assert.fail('legacy fallback must not run'),
  fetcher:url=>(url===urls[0]?first:second)()
 });
 assert.equal((await receive(stale,revoked)).code,'TORCH_REVOKED');
 assert.equal(feed.cached(f.root,f.identity.exe).torchQuarantined.release,null);
 const before=fs.readFileSync(f.cache());
 assert.equal((await receive(missing,stale)).code,'TORCH_REVOKED');
 assert.equal((await receive(missing,missing)).code,'TORCH_REVOKED');
 await feed.refresh(f.root,f.identity.exe,{force:true,fetcher:async()=>reply({
  schema:'megulit.game-diff-feed',version:1,key:f.identity.exe,diff:f.profile()
 })});
 assert.deepEqual(fs.readFileSync(f.cache()),before);
 assert.equal(await R.installed(f.root,f.identity.exe,{keys:f.keys,exe:f.exe}),null);
 const profile=f.profile(2),review=await f.review(profile,f.release,{mean:.96});
 const replacement=f.publisher.sign({...f.release,revision:2,previous:f.publication.hash,profile,review});
 const publication={hash:await P.hash(replacement),at:f.publication.at};
 const latest=()=>reply({release:replacement,publication});
 assert.equal((await receive(stale,latest)).code,'TORCH_REVOKED');
 assert.equal((await receive(latest,latest)).receipt?.hash,publication.hash);
});

test('ordinary legacy refresh cannot revive a release revoked while its request was pending',async t=>{
 const f=await setup(t);
 await R.receive(f.root,'7',f.options);
 const started=Promise.withResolvers(),response=Promise.withResolvers();
 const refresh=feed.refresh(f.root,f.identity.exe,{force:true,fetcher:async()=>{
  started.resolve();return response.promise;
 }});
 await started.promise;
 const revoked=await R.receive(f.root,'7',{...f.options,fetcher:async()=>new Response(null,{status:410})});
 assert.equal(revoked.code,'TORCH_REVOKED');
 response.resolve(new Response(null,{status:304}));
 assert.equal((await refresh).torchQuarantined.release.revision,1);
 assert.equal(await R.installed(f.root,f.identity.exe,{keys:f.keys,exe:f.exe}),null);
});

test('owner launcher to ordinary import, receipt and reader profile with the local database',async t=>{
 const f=await setup(t),root=fs.realpathSync.native(f.root);
 const launcher=require('../tools/owner-tests-launch.cjs'),owner=require('../core/owner-tests.cjs');
 const libraryFile=path.join(root,'data','config','library.json'),onlineFile=path.join(root,'data','config','online.json');
 const library=JSON.stringify({sharedAdaptation:false,autoProfileShare:false,runtimeSampleShare:false});
 const online=JSON.stringify({relayUrl:''});
 fs.mkdirSync(path.dirname(libraryFile),{recursive:true});
 fs.writeFileSync(libraryFile,library);
 fs.writeFileSync(onlineFile,online);
 fs.mkdirSync(path.join(root,'cache'));
 fs.mkdirSync(path.join(root,'logs'));
 fs.writeFileSync(path.join(root,'MeguLit.exe'),'inert launcher fixture');
 fs.writeFileSync(path.join(root,'data','config','owner-tests.json'),JSON.stringify({
  schema:'megulit.owner-tests',version:1,root,entries:[{
   id:'neutral-fixture',engine:'kirikiri',exe:f.exe,sha256:f.identity.exe,
   files:[{path:'data.xp3',bytes:fs.statSync(f.script).size,sha256:f.identity.script}],
   draw:{roles:true},capabilities:['roles']
  }]
 }));
 const prior=process.env;
 process.env=launcher.environment(root,prior);
 const live=require('../services/self-check-live.cjs');
 t.after(async()=>{live.stop();await R.stop(root);process.env=prior;});
 const started=await launcher.launch(root,{spawnProcess:(exe,args,{cwd,env})=>{
  assert.equal(exe,path.join(root,'MeguLit.exe'));
  assert.deepEqual(args,[]);
  assert.equal(cwd,root);
  process.env=env;
  const child=new (require('node:events').EventEmitter)();
  queueMicrotask(()=>child.emit('spawn'));
  return child;
 }});
 assert.equal(started.preparedEntries,1);
 assert.equal(owner.privateMode(root),true);
 const reviewFile=require.resolve('../services/torch-review-keys.json'),read=fs.readFileSync;
 t.mock.method(fs,'readFileSync',(file,...args)=>file===reviewFile?JSON.stringify({keys:f.keys.reviewKeys}):read(file,...args));
 const relay=require('../services/relay-config.cjs'),calls=[];
 assert.deepEqual(relay.endpoints(root,'/api/diagnostics'),[]);
 const profile=f.publisher.sign({...f.profile(2),settings:{placement:{lineOffsetY:77}}});
 const signed=f.publisher.sign({...f.release,profile,review:await f.review(profile)});
 const publication={hash:await P.hash(signed),at:f.publication.at};
 let phase='offline';
 const originalExe=path.join(root,'original.exe');
 fs.writeFileSync(originalExe,'MZ alternate neutral fixture');
 const originalKey=sha(fs.readFileSync(originalExe));
 const pending=Promise.withResolvers(),closingFetch=Promise.withResolvers(),aborted=[];
 const notFound=()=>Response.json({ok:false,error:'NOT_FOUND'},{status:404});
 t.mock.method(globalThis,'fetch',async(url,request)=>{
  const target=new URL(url);
  const release=target.pathname==='/api/torch-release';
  assert.ok(release||target.pathname==='/api/game-profile');
  assert.ok([relay.CN_RELAY_BASE,relay.DEFAULT_RELAY_BASE].includes(target.origin));
  const key=target.searchParams.get('exe');
  assert.deepEqual([...target.searchParams],[['exe',key]]);
  assert.ok([f.identity.exe,originalKey].includes(key));
  assert.equal(request.method,'GET');
  assert.equal(request.redirect,'error');
  assert.equal(request.body,undefined);
  assert.equal(request.headers.authorization,undefined);
  calls.push([target.origin,target.pathname]);
  if((phase==='change'&&key===f.identity.exe)||phase==='close')return new Promise((_,reject)=>{
   request.signal.addEventListener('abort',()=>{aborted.push(key);reject(request.signal.reason);},{once:true});
   (phase==='close'?closingFetch:pending).resolve();
  });
  if(phase==='change')return notFound();
  if(phase==='offline'){
   if(target.origin===relay.CN_RELAY_BASE)throw new TypeError('fixture connection refused');
   return new Response('edge error page',{status:404});
  }
  if(phase==='missing')return notFound();
  if(phase==='legacy')return release||target.origin===relay.CN_RELAY_BASE?notFound():reply({
   schema:'megulit.game-diff-feed',version:2,key:f.identity.exe,
   versionLayer:{match:'exe',key:f.identity.exe,diff:f.profile()},
   gameLayer:{match:'title',key:'unrelated'},credit:{torchNo:999}
  });
  if(target.origin===relay.CN_RELAY_BASE)return new Response(null,{status:503});
  return reply({release:signed,publication});
 });
 const {dispatch}=require('../services/bridge.cjs');
 const imported=await dispatch({action:'save_game',title:'Neutral import fixture',executable:f.exe});
 const id=imported.id,dbFile=path.join(root,'data');
 async function settled(){
  const end=Date.now()+3000;
  while(Date.now()<end){
   const s=R.status(root,id);
   if(s&&s.state!=='installing')return dispatch({action:'first_player',id,poll:true});
   await new Promise(r=>setTimeout(r,10));
  }
  assert.fail('ordinary import did not finish torch lookup');
 }
 assert.equal((await settled()).code,'TORCH_RELAY_UNAVAILABLE');
 assert.deepEqual(calls.map(([,route])=>route),['/api/torch-release','/api/torch-release']);
 assert.equal(fs.existsSync(f.cache()),false);
 async function reimport(next){
  await R.stop(root);
  R.resume(root);
  phase=next;
  const prev=R.status(root,id);
  await dispatch({action:'save_game',id,title:'Neutral import fixture',executable:f.exe});
  for(let i=0;i<300&&R.status(root,id)===prev;i++)await new Promise(r=>setTimeout(r,10));
  assert.notEqual(R.status(root,id),prev);
  return settled();
 }
 assert.equal((await reimport('missing')).state,'not-published');
 assert.equal(fs.existsSync(f.cache()),false);
 const legacy=await reimport('legacy');
 assert.equal(legacy.state,'received');
 assert.equal(legacy.receipt.origin,'legacy-feed');
 assert.equal(legacy.receipt.credit,null);
 assert.equal(legacy.receipt.serverTime,null);
 assert.equal(legacy.receipt.cardinalRev,null);
 assert.equal(feed.cached(root,f.identity.exe).gameLayer,undefined);
 const latest=await reimport('release');
 assert.equal(latest.state,'received');
 assert.equal(latest.receipt.origin,'torch-release');
 assert.equal(latest.receipt.hash,publication.hash);
 assert.equal(latest.receipt.serverTime,publication.at);
 const db=require('../services/store.cjs').openStore(root);
 let game;
 try{game=db.prepare('SELECT * FROM games WHERE id=?').get(id);}finally{db.close();}
 const applied=[];
 const {Reader}=require('../services/reader.cjs');
 Reader.prototype.applyGameProfile.call({root,gameExe:f.exe,gal:{setGameProfile:p=>applied.push(p)}},f.exe,game);
 assert.equal(applied.at(-1)?.placement.lineOffsetY,77);
 assert.equal(live.choose(live.current()).from,'official');
 assert.equal(feed.sharing(root),false);
 assert.equal((await dispatch({action:'first_player_share'})).on,false);
 assert.equal((await feed.report(root,{})).state,'skipped');
 assert.equal((await feed.reportScore(root,{schema:'megulit.cardinal-score',key:f.identity.exe})).state,'skipped');
 assert.equal(fs.readFileSync(libraryFile,'utf8'),library);
 assert.equal(fs.readFileSync(onlineFile,'utf8'),online);
 assert.equal(path.dirname(feed.dir(root)),dbFile);

 phase='change';
 await dispatch({action:'save_game',id,title:'Neutral import fixture',executable:f.exe});
 await pending.promise;
 const selected=await dispatch({action:'game_original_executable',id,mode:'select',executable:originalExe});
 assert.equal(selected.executable,originalExe);
 assert.equal(selected.changed,true);
 const deadline=Date.now()+3000;
 while(R.status(root,id)?.code!=='TORCH_NOT_PUBLISHED'&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));
 const original=await dispatch({action:'first_player',id,poll:true});
 assert.equal(original.key,originalKey);
 assert.equal(original.state,'not-published');
 assert.deepEqual(aborted,[f.identity.exe,f.identity.exe]);
 assert.equal(fs.existsSync(path.join(feed.dir(root),originalKey+'.json')),false);

 phase='close';
 const {Runtime}=require('../services/runtime.cjs');
 const runtime=new Runtime(root);
 await dispatch({action:'save_game',id,title:'Neutral import fixture',executable:originalExe});
 await closingFetch.promise;
 await runtime.stop();
 assert.deepEqual(aborted,[f.identity.exe,f.identity.exe,originalKey,originalKey]);
 assert.equal(fs.existsSync(path.join(feed.dir(root),originalKey+'.json')),false);
});

test('explicit layout enters a version contribution and the reviewed release drives offline Reader resolution',async t=>{
 const f=await setup(t),layout=require('../services/presentation.cjs'),auto=require('../core/auto-profile.cjs');
 const Profiles=require('../core/profiles/index.cjs'),live=require('../services/self-check-live.cjs');
 const key=f.identity.exe,mode='nvl',record=auto.record({key,engine:'kirikiri',exe:f.exe,result:{mode:'hide',settings:{},score:{lines:30}}});
 first.enableSharing(f.root);
 let candidate;
 const submit=()=>feed.report(f.root,record,{fetcher:async(_url,req)=>{candidate=JSON.parse(req.body).profile;return reply({ok:true});}});
 await submit();assert.equal(candidate.settings.page,undefined);
 await layout.confirm(f.db,f.root,{id:'7',key,mode});
 await assert.rejects(layout.confirm(f.db,f.root,{id:'7',key:'d'.repeat(64),mode}),/VERSION_CHANGED/);
 await submit();assert.equal(candidate.settings.page.presentation,mode);
 const relay=await import('../relay/src/auto-profile.js');
 const report=relay.validateReport({version:1,profile:candidate});assert.equal(report.ok,true);
 const settings=report.value.settings;
 const profile=f.publisher.sign({...f.profile(),settings});

 const review=await f.review(profile);
 const published=f.publisher.sign({...f.release,profile,review});
 const got=await R.receive(f.root,'7',{...f.options,fetcher:async()=>reply({release:published,publication:{hash:await P.hash(published),at:f.publication.at}})});
 assert.equal(got.state,'received');
 const shared=feed.layer(feed.cached(f.root,key),key,{torchTrust:f.keys,exe:f.exe});
 const session={reader:{root:f.root},exe:f.exe,input:{exe:f.exe},key,shared};
 const resolve=()=>Profiles.profileFor(live.inputOf(session));
 const hook=Object.create(require('../core/hook-native.cjs').HookNative.prototype);
 hook.profile=resolve();assert.equal(hook.flowPage,true);
 fs.appendFileSync(f.script,'updated script');assert.equal(resolve().page.presentation,null);
 assert.equal(Profiles.profileFor({...session.input,exeSha256:'d'.repeat(64),vndbLayout:'nvl',vndbLayoutKey:key}).vndbLayout,null);
});


test('VNDB presentation hints respect tag evidence and the cached version',async t=>{
 const {layoutFromTags}=require('../services/game-enrichment.cjs'),f=await setup(t);
 const key=f.identity.exe,row={title:'fixture',executable:f.exe};
 const tag=(id,rating=3,lie=false)=>({id,rating,lie});
 assert.equal(layoutFromTags([tag('g32')]),'adv');
 assert.equal(layoutFromTags([tag('g43')]),'nvl');
 assert.equal(layoutFromTags([tag('g355')]),'mixed');
 assert.equal(layoutFromTags([tag('g32'),tag('g43')]),'mixed');
 assert.equal(layoutFromTags([tag('g32',1),tag('g43',3,true)]),'unknown');
 const lib={presentation:{key,vnid:'v123',mode:'mixed'}},known=require('../services/presentation.cjs').known;
 assert.equal(known(f.root,key,row,lib,'v123'),true);
 assert.equal(known(f.root,'f'.repeat(64),row,lib,'v123'),false);
 assert.equal(known(f.root,key,row,lib,'v456'),false);
});
