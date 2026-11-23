'use strict';
/* Offline Node contracts. No game, app, installer, real relay or release is started */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const u=require('../services/update.cjs');
const load=()=>import('../relay/src/update-policy.js');
const releases=(...vs)=>vs.map(v=>({tag_name:'v'+v,prerelease:false,draft:false}));
const env=(extra={})=>({FORCE_UPDATE_ENABLED:'true',fetch:async()=>Response.json(releases('1.4.23','1.4.22','1.4.21','1.4.20')),DB:{prepare(){throw Error('unexpected D1 access');}},BUCKET:{put(){throw Error('unexpected R2 write');}},...extra});
const request=(route,body,headers={},method='POST')=>new Request('https://api.megulit.com'+route,{method,headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});

test('policy: disabled, latest three, boundaries, override and cross-minor stable history',async()=>{
 const {policyFrom}=await load();
 assert.equal(policyFrom(releases('1.4.23'),{FORCE_UPDATE_ENABLED:'false'}).minVersion,null);
 assert.equal(policyFrom(releases('1.4.23'),env()).minVersion,'1.4.21');
 assert.equal(policyFrom(releases('1.4.22'),env()).minVersion,'1.4.20');
 assert.equal(policyFrom([...releases('1.5.0','1.4.23','1.4.22'),{tag_name:'v1.6.0',prerelease:true}],env()).minVersion,'1.4.22');
 assert.equal(policyFrom(releases('1.5.1','1.5.0','1.4.23'),env()).minVersion,'1.4.23');
 assert.equal(policyFrom(releases('1.5.2','1.4.23','1.4.22'),env()).minVersion,'1.4.22');
 assert.equal(policyFrom(releases('1.5.0'),env()).minVersion,null);
 assert.equal(policyFrom(releases('1.4.23'),env({MIN_APP_VERSION_OVERRIDE:'1.4.19'})).minVersion,'1.4.19');
 assert.equal(policyFrom(releases('1.4.23'),env({MIN_APP_VERSION_OVERRIDE:'1.9.0'})).minVersion,'1.4.21');
});

test('relay: all obsolete upload families get 426 before storage, GitHub or rate-limit writes',async()=>{
 const {handle}=await import('../relay/src/worker.js');
 for(const route of ['/api/feedback','/api/diagnostics','/api/probe','/api/probe/full/start','/api/probe/full/part','/api/probe/full/complete','/api/adapters/report','/api/contrib/chunk','/api/cardinal/score','/api/game-profile/report','/api/game-profile/credit','/api/torch/upload','/api/adaptation']){
  const r=await handle(request(route,{app:'1.4.20'},{'x-megulit-version':'1.4.20'},route.endsWith('/part')?'PUT':'POST'),env());
  assert.equal(r.status,426,route);assert.equal((await r.json()).error,'UPDATE_REQUIRED');assert.equal(r.headers.get('retry-after'),'86400');
 }
});

test('relay: feedback page, probe app, profile.version and in-progress binary upload are identified',async()=>{
 const {updateGuard,requestVersion}=await load(),e=env();
 for(const [route,body] of [['/api/feedback',{page:'app/1.4.16'}],['/api/probe/full/start',{app:'1.4.19'}],['/api/cardinal/score',{app:'1.4.20'}],['/api/game-profile/report',{profile:{version:'1.4.18'}}]])assert.equal((await updateGuard(request(route,body),e,route)).status,426);
 let lookup='';const binaryEnv=env({DB:{prepare(sql){lookup=sql;return {bind(){return {first:async()=>({app:'1.4.16'})};}};}}});
 const r=new Request('https://api.megulit.com/api/probe/full/part?upload=11111111-1111-4111-8111-111111111111',{method:'PUT',body:'part'});
 assert.equal((await updateGuard(r,binaryEnv,'/api/probe/full/part')).status,426);assert.match(lookup,/SELECT app/);
 assert.deepEqual(await requestVersion(request('/api/feedback',{page:'download'}),e,'/api/feedback'),{website:true});
 assert.deepEqual(await requestVersion(request('/api/game-profile/credit',{name:'x'}),e,'/api/game-profile/credit'),{unknown:true});
 assert.deepEqual(await requestVersion(request('/api/probe',null),e,'/api/probe'),{unknown:true});
});

test('relay: switch off and unavailable policy fail open; equal/newer uploads and reads are allowed',async()=>{
 const {updateGuard}=await load();
 const r=request('/api/probe',{app:'1.4.16'});
 assert.equal(await updateGuard(r,env({FORCE_UPDATE_ENABLED:'false',fetch:()=>{throw Error('must not fetch');}}),'/api/probe'),null);
 assert.equal(await updateGuard(r,env({fetch:async()=>{throw Error('offline');}}),'/api/probe'),null);
 for(const version of ['1.4.21','1.4.22','1.4.23','1.5.0'])assert.equal(await updateGuard(request('/api/probe',{app:version}),env(),'/api/probe'),null);
 assert.equal(await updateGuard(new Request('https://api.megulit.com/api/probe/stats'),env(),'/api/probe/stats'),null);
});

test('client: policy fetch failure is optional and minimum uses the updater comparator',async()=>{
 assert.equal(await u.policy(async()=>{throw Error('offline');}),null);
 const p=await u.policy(async()=>Response.json({latest:'1.4.23',minVersion:'1.4.21'}));assert.equal(p.minVersion,'1.4.21');
 for(const v of ['1.4.16','1.4.20'])assert.equal(u.newer(p.minVersion,v),true);
 for(const v of ['1.4.21','1.4.23'])assert.equal(u.newer(p.minVersion,v),false);
});

test('forced mainland download: domestic mirrors are attempted together before relays, GitHub is the last fallback',()=>{
 const rel={name:'MeguLit-v1.4.23-win-x64.zip',url:'https://github.com/ilynthn/MeguLit/releases/download/v1.4.23/MeguLit-v1.4.23-win-x64.zip',digest:'a'.repeat(64)};
 const groups=u.downloadGroups(rel,true,true);assert.equal(groups.length,3);assert.ok(groups[0][0].startsWith('https://cn-dl.megulit.com/'));assert.ok(groups[0][1].startsWith('https://dl.megulit.com/'));assert.ok(groups[1].every(url=>!url.startsWith('https://github.com/')));assert.deepEqual(groups[2],[rel.url]);
});

test('client: check combines policy and release; disabled, offline, equal, above and old',async()=>{
 const rel={tag_name:'v1.4.23',assets:[{name:'MeguLit-v1.4.23-win-x64.zip',size:2,browser_download_url:'https://github.com/ilynthn/MeguLit/releases/download/v1.4.23/MeguLit-v1.4.23-win-x64.zip'}]};
 for(const [version,minVersion,want] of [['1.4.20','1.4.21',true],['1.4.21','1.4.21',false],['1.4.23','1.4.21',false],['1.4.20',null,false]]){
  u.reset();const got=await u.check(version,async url=>url.endsWith('/policy')?Response.json({latest:'1.4.23',minVersion}):url.endsWith('/latest')?Response.json(rel):new Response('',{status:404}));
  assert.equal(got.required,want);assert.equal(got.hot,false);
 }
 const fallback=await u.check('1.4.20',async url=>{if(url.endsWith('/policy'))return Response.json({latest:'1.4.23',minVersion:'1.4.21'});throw Error('release offline');});assert.equal(fallback.required,true);
 await assert.rejects(u.check('1.4.20',async()=>{throw Error('offline');}),/offline/);u.reset();
});

test('forced download: re-reads latest at click, ignores previous release/hot-package and jumps straight to latest',async()=>{
 const root=fs.mkdtempSync(path.join(process.env.TEMP||require('os').tmpdir(),'force-update-'));
 const crypto=require('node:crypto');const bytes=Buffer.from('PK-full-package'),digest='sha256:'+crypto.createHash('sha256').update(bytes).digest('hex');let version='1.4.22',downloads=[];
 const rel=()=>({tag_name:'v'+version,assets:[{name:`MeguLit-v${version}-win-x64.zip`,size:bytes.length,digest,browser_download_url:`https://github.com/ilynthn/MeguLit/releases/download/v${version}/MeguLit-v${version}-win-x64.zip`}]});
 const fetcher=async url=>{if(url.endsWith('/policy'))return Response.json({latest:version,minVersion:'1.4.21'});if(url.endsWith('/latest'))return Response.json(rel());if(url.includes('/tags/'))return new Response('',{status:404});downloads.push(url);return {ok:true,url,headers:new Headers(),arrayBuffer:async()=>bytes};};
 try{u.reset();await u.check('1.4.16',fetcher);version='1.4.23';const ready=await u.start(root,'1.4.16',fetcher,{forceLatest:true});assert.equal(ready.version,'1.4.23');assert.equal(ready.hot,undefined);assert.ok(downloads.every(url=>url.includes('1.4.23')));assert.match(ready.zip,/1\.4\.23/);}
 finally{u.reset();fs.rmSync(root,{recursive:true,force:true});}
});

test('forced download: a previous job cannot be installed by the forced dialog while a fresh full package is queued',async()=>{
 const root=fs.mkdtempSync(path.join(process.env.TEMP||require('os').tmpdir(),'force-queue-')),bytes=Buffer.from('PK-full');let first,reads=0;
 const rel=v=>({tag_name:'v'+v,assets:[{name:`MeguLit-v${v}-win-x64.zip`,size:bytes.length,browser_download_url:`https://github.com/ilynthn/MeguLit/releases/download/v${v}/MeguLit-v${v}-win-x64.zip`}]});
 const fetcher=async url=>{if(url.endsWith('/policy'))return Response.json({latest:'1.4.23',minVersion:'1.4.21'});if(url.endsWith('/latest')){if(++reads===1)return new Promise(resolve=>{first=()=>resolve(Response.json(rel('1.4.22')));});return Response.json(rel('1.4.23'));}return {ok:true,url,headers:new Headers(),arrayBuffer:async()=>bytes};};
 try{u.reset();const previous=u.start(root,'1.4.16',fetcher);const forced=u.start(root,'1.4.16',fetcher,{forceLatest:true});assert.equal(u.status().phase,'downloading');assert.equal(u.status().hot,false);first();await previous;const done=await forced;assert.equal(done.version,'1.4.23');assert.equal(done.phase,'ready');assert.equal(u.status().version,'1.4.23');}
 finally{u.reset();fs.rmSync(root,{recursive:true,force:true});}
});

test('fresh release checks bypass the service GET cache and request fresh relay release metadata',async t=>{
 const {createGate}=require('../services/relay-gate.cjs');let calls=0;
 const gate=createGate(async()=>Response.json({tag_name:'v1.4.'+(22+calls++)}));const url='https://api.megulit.com/api/release/latest';
 assert.equal((await (await gate(url)).json()).tag_name,'v1.4.22');assert.equal((await (await gate(url)).json()).tag_name,'v1.4.22');
 assert.equal((await (await gate(url,{cache:'no-store'})).json()).tag_name,'v1.4.23');
 const {handle}=await import('../relay/src/worker.js');let fetched=0,written=0;const release={tag_name:'v1.4.23',assets:[]};
 t.mock.method(global,'fetch',async()=>{fetched++;return Response.json(release);});
 const e={RL_IP:{limit:async()=>({success:true})},RL_RELEASE:{limit:async()=>({success:true})},DB:{prepare(){return {bind(){return this;},first:async()=>({body:JSON.stringify({tag_name:'v1.4.22',assets:[]}),fetched_at:Math.floor(Date.now()/1000)}),run:async()=>{written++;}};}}};
 const got=await handle(new Request(url,{headers:{'cache-control':'no-cache'}}),e);assert.equal((await got.json()).tag_name,'v1.4.23');assert.equal(fetched,1);assert.equal(written,1);
});

test('startup routing: immediate centered update, manual corner, hot updates also precede onboarding, offline none',async()=>{
 const {checkForUpdates}=await import('../web/update-notice.js');
 for(const manual of [false,true])for(const required of [false,true]){
  const shown=[];await checkForUpdates({api:async action=>action==='contrib_consent'?null:{current:'1.4.20',latest:'1.4.23',newer:true,required,silent:true},invoke:async()=>{},version:'1.4.20',manual,show:(info,options)=>shown.push(options)});
  assert.equal(shown.length,1);assert.equal(shown[0].center,!manual||required);
 }
 let shown=0;await checkForUpdates({api:async()=>{throw Error('offline');},version:'1.4.20',show:()=>shown++});assert.equal(shown,0);
 for(const v of ['1.4.21','1.4.23'])await checkForUpdates({api:async a=>a==='contrib_consent'?null:{newer:false,required:false},version:v,show:()=>shown++});assert.equal(shown,0);
 const src=fs.readFileSync(path.join(__dirname,'../web/app.js'),'utf8');assert.doesNotMatch(src,/setTimeout\([^\n]*checkForUpdates[^\n]*4000/);
 assert.ok(src.indexOf('const updates=checkForUpdates')<src.indexOf('afterStartupUpdate(updates'));
});

test('startup queue: update dismissal precedes development notice, then Seed/tutorial, then first-run folders',async()=>{
 const {afterStartupUpdate}=await import('../web/update-notice.js'),order=[];let release;
 const update=new Promise(resolve=>{release=resolve;}),dialog=new EventTarget();dialog.open=true;
 const job=afterStartupUpdate(update,{notice:()=>{order.push('development + Seed + tutorial');return dialog;},ready:()=>order.push('folders')});
 await Promise.resolve();assert.deepEqual(order,[]);release();await new Promise(r=>setImmediate(r));assert.deepEqual(order,['development + Seed + tutorial']);
 dialog.open=false;dialog.dispatchEvent(new Event('close'));await job;assert.deepEqual(order,['development + Seed + tutorial','folders']);
});

test('relay gate: 426 stops repeat writes locally, leaves policy readable and exposes the forced UI signal',async()=>{
 const {createGate,requiredStatus}=require('../services/relay-gate.cjs');let sent=0;
 const gate=createGate(async(input,init)=>{sent++;assert.equal(init.headers.get('x-megulit-version'),'1.4.20');return Response.json({ok:false,error:'UPDATE_REQUIRED',latest:'1.4.23',minVersion:'1.4.21'},{status:426});},{version:()=> '1.4.20'});
 assert.equal((await gate('https://api.megulit.com/api/feedback',{method:'POST'})).status,426);
 assert.equal((await gate('https://cn-api.megulit.com/api/probe/full/start',{method:'POST'})).status,426);assert.equal(sent,1);assert.equal(requiredStatus().latest,'1.4.23');
 await gate('https://api.megulit.com/api/update/policy');assert.equal(sent,2);
});

test('forced dialog: one initial action, Esc/backdrop do not release it, failure retries then installs and exits',async t=>{
 const old=global.document,raf=global.requestAnimationFrame,doc=require('./helpers/update-dom.cjs').document();global.document=doc;global.requestAnimationFrame=fn=>fn();
 const {render}=await import('../web/update-notice.js');let tries=0,installed=0,exited=0,finished=false;const calls=[];
 const api=async(action,args)=>{calls.push([action,args]);if(action==='update_start'){tries++;return tries===1?{phase:'error',error:'UPDATE_DOWNLOAD_FAILED'}:{phase:'ready',received:20,total:20};}if(action==='update_install'){installed++;return {};}};
 const invoke=async action=>{if(action==='app_exit_for_update')exited++;};
 try{
  const closed=render({required:true,current:'1.4.16',latest:'1.4.23',size:20},{api,invoke,locale:'zh',center:true});closed.then(()=>{finished=true;});
  const modal=doc.querySelector('.upd-card'),go=modal.querySelector('[data-upd-go]');
  assert.equal(modal.open,true);assert.equal(modal.getAttribute('aria-modal'),'true');assert.equal(modal.querySelectorAll('[data-upd-close]').length,0);assert.equal(go.textContent,'立即更新');assert.equal(tries,0);
  const cancel=new Event('cancel',{cancelable:true});modal.dispatchEvent(cancel);modal.click();await Promise.resolve();assert.equal(cancel.defaultPrevented,true);assert.equal(modal.open,true);assert.equal(finished,false);
  go.click();await new Promise(r=>setImmediate(r));assert.equal(modal.querySelector('[data-upd-manual]').hidden,false);assert.equal(go.textContent,'重试');assert.equal(modal.open,true);assert.equal(finished,false);
  go.click();await new Promise(r=>setImmediate(r));assert.equal(tries,2);assert.equal(installed,1);assert.equal(exited,1);assert.ok(calls.filter(([a])=>a==='update_start').every(([,a])=>a.forceLatest===true));
  render({consentOnly:true,current:'1.4.23',latest:'1.4.23'},{api,invoke,locale:'zh',center:true});doc.querySelector('[data-upd-close]').click();await closed;
 }finally{global.document=old;global.requestAnimationFrame=raf;}
});

test('forced dialog: lost progress connection becomes retry/manual download without releasing the modal',async t=>{
 const old=global.document,raf=global.requestAnimationFrame,doc=require('./helpers/update-dom.cjs').document();global.document=doc;global.requestAnimationFrame=fn=>fn();let tick,opened;
 t.mock.method(global,'setInterval',fn=>{tick=fn;return 0;});
 const {render}=await import('../web/update-notice.js');
 const api=async action=>{if(action==='update_start')return {phase:'downloading',total:20,received:1};if(action==='update_status')throw Error('SERVICE_FAILED');};
 const invoke=async(action,args)=>{opened=args?.url;};
 try{render({required:true,current:'1.4.20',latest:'1.4.23',size:20},{api,invoke,locale:'en'});
  doc.querySelector('[data-upd-go]').click();await new Promise(r=>setImmediate(r));await tick();
  const modal=doc.querySelector('.upd-card');assert.equal(modal.open,true);assert.equal(doc.querySelector('[data-upd-go]').textContent,'Retry');assert.equal(doc.querySelector('[data-upd-manual]').hidden,false);
  doc.querySelector('[data-upd-manual]').click();assert.equal(opened,'https://github.com/ilynthn/MeguLit/releases/latest');
  render({consentOnly:true,current:'1.4.23',latest:'1.4.23'},{api,invoke,locale:'en',center:true});doc.querySelector('[data-upd-close]').click();
 }finally{global.document=old;global.requestAnimationFrame=raf;}
});
