'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const installer=require('../core/python-installer.cjs');
const {LocalLearning}=require('../core/learning-native.cjs');

let root,previousRoot;
test.before(()=>{
 previousRoot=process.env.MEGULIT_ROOT;
 root=fs.mkdtempSync(path.join(os.tmpdir(),'dictionary-install-'));process.env.MEGULIT_ROOT=root;
});
test.after(()=>{
 if(previousRoot===undefined)delete process.env.MEGULIT_ROOT;else process.env.MEGULIT_ROOT=previousRoot;
 fs.rmSync(root,{recursive:true,force:true});
});

function learning(){
 const status=[];
 const service=Object.assign(Object.create(LocalLearning.prototype),{
  python:()=>path.join(root,'absent-python'),runtimeFolder:()=>root,pending:new Map(),cache:new Map(),onStatus:event=>status.push(event)
 });
 return {service,status};
}

test('concurrent installs share preparation failures and an explicit retry can succeed',async t=>{
 const {service,status}=learning();let installed=false;
 const probe=t.mock.method(installer,'dictionariesReady',async()=>installed);
 const pip=t.mock.method(installer,'ensurePip',async()=>{throw Error('pip unavailable');});
 const first=service.install(true),second=service.install(true);
 const errors=await Promise.allSettled([first,second]);
 assert.deepEqual(errors.map(r=>r.reason?.message),['pip unavailable','pip unavailable']);
 assert.equal(probe.mock.callCount(),1);assert.equal(pip.mock.callCount(),1);
 assert.equal(service.progress.stage,'error');assert.equal(status.at(-1).learningMessage,'pip unavailable');
 installed=true;
 const passive=service.install(),retry=service.install(true);
 await assert.rejects(passive,/pip unavailable/);await retry;
 assert.equal(service.progress.stage,'ready');assert.equal(probe.mock.callCount(),2);
 await service.install();assert.equal(probe.mock.callCount(),3);
 assert.ok(!service.installing);
});

test('a repair requested during a successful readiness check still runs',async t=>{
 const {service}=learning(),gate=Promise.withResolvers();
 t.mock.method(installer,'dictionariesReady',()=>gate.promise);
 const pip=t.mock.method(installer,'ensurePip',async()=>{throw Error('repair attempted');});
 const check=service.install(),repair=service.install(true,true,['unidic']);
 gate.resolve(true);
 const [a,b]=await Promise.allSettled([check,repair]);
 assert.equal(a.status,'fulfilled');assert.equal(b.reason?.message,'repair attempted');
 assert.equal(pip.mock.callCount(),1);
});

test('equal repair requests share one installer and a different dictionary is repaired afterwards',async t=>{
 const {service}=learning(),gate=Promise.withResolvers();
 const pip=t.mock.method(installer,'ensurePip',()=>gate.promise);
 const requests=[['sudachi'],['sudachi'],['unidic']].map(ids=>service.install(true,true,ids));
 assert.ok(service.installing);
 assert.equal(pip.mock.callCount(),1);
 gate.resolve();
 const results=await Promise.allSettled(requests);
 assert.ok(results.every(r=>r.status==='rejected'&&/Python/.test(r.reason.message)));
 assert.equal(pip.mock.callCount(),2);
 const log=fs.readFileSync(path.join(root,'logs','dictionary-install.log'),'utf8');
 assert.deepEqual([...log.matchAll(/pip install \(repair\) (\S+)/g)].map(m=>m[1].split('==')[0]),['sudachidict_full','unidic-lite']);
 assert.ok(!service.installer&&!service.installing);
});

test('closing during the readiness check prevents installation and pending lookups from starting',async t=>{
 const {service}=learning(),gate=Promise.withResolvers();
 const probe=t.mock.method(installer,'dictionariesReady',()=>gate.promise);
 const pip=t.mock.method(installer,'ensurePip',async()=>{});
 service.installed=()=>true;
 const worker=t.mock.method(service,'spawnWorker',async()=>{});
 const pending=[service.install(),service.ready()];
 service.stop();gate.resolve(false);
 for(const result of await Promise.allSettled(pending))assert.match(result.reason?.message,/已关闭/);
 assert.equal(pip.mock.callCount(),0);assert.equal(worker.mock.callCount(),0);
 await assert.rejects(service.install(true),/已关闭/);assert.equal(probe.mock.callCount(),1);
});

test('closing after pip preparation has started prevents launching the installer',async t=>{
 const {service}=learning(),gate=Promise.withResolvers();
 t.mock.method(installer,'ensurePip',()=>gate.promise);
 const pending=service.install(true,true);
 service.stop();gate.resolve();
 await assert.rejects(pending,/已关闭/);
 assert.ok(!service.installer);
});

test('closing rejects new requests immediately and skips checks queued before closing',async t=>{
 const {service}=learning(),gate=Promise.withResolvers();
 const probe=t.mock.method(installer,'dictionariesReady',async()=>true);
 t.mock.method(installer,'ensurePip',()=>gate.promise);
 const active=service.install(true,true),queued=service.install(true);
 service.stop();const late=service.install(true);
 const settled=await Promise.race([late.catch(e=>e.message),new Promise(r=>setImmediate(()=>r('still waiting')))]);
 gate.resolve();await Promise.allSettled([active,queued]);
 assert.match(settled,/已关闭/);assert.equal(probe.mock.callCount(),0);
});

test('a ready reading worker is reused',async t=>{
 const {service}=learning();service.installed=()=>true;service.worker={};service.starting=Promise.resolve();
 const spawn=t.mock.method(service,'spawnWorker',async()=>{});
 await service.ready();assert.equal(spawn.mock.callCount(),0);
});

test('repairing both dictionaries still leaves the engines for a complete repair',async t=>{
 const {service}=learning(),gate=Promise.withResolvers();
 t.mock.method(installer,'ensurePip',()=>gate.promise);
 const logfile=path.join(root,'logs','dictionary-install.log');
 const prior=fs.existsSync(logfile)?fs.readFileSync(logfile,'utf8'):'';
 const dbs=service.install(true,true,['sudachi','unidic']),all=service.install(true,true);
 gate.resolve();await Promise.allSettled([dbs,all]);
 const attempts=fs.readFileSync(logfile,'utf8').slice(prior.length).split('\n').filter(s=>s.includes('pip install'));
 assert.equal(attempts.length,2);assert.doesNotMatch(attempts[0],/fugashi/);
 assert.match(attempts[1],/sudachipy==.*fugashi==/);
});

test('an ordinary install checks readiness after a selected repair',async t=>{
 const {service}=learning(),gate=Promise.withResolvers();
 const probe=t.mock.method(installer,'dictionariesReady',async()=>true);
 t.mock.method(installer,'ensurePip',()=>gate.promise);
 const db=service.install(true,true,['sudachi']),all=service.install(true);
 assert.equal(probe.mock.callCount(),0);gate.resolve();
 const results=await Promise.allSettled([db,all]);
 assert.equal(results[0].status,'rejected');assert.equal(results[1].status,'fulfilled');
 assert.equal(probe.mock.callCount(),1);
});

test('a queued background check retries a failed repair only on explicit request',async t=>{
 for(const retry of [false,true])await t.test(retry?'explicit retry':'background only',async t=>{
 const {service}=learning(),gate=Promise.withResolvers();
 const probe=t.mock.method(installer,'dictionariesReady',async()=>true);
 t.mock.method(installer,'ensurePip',()=>gate.promise);
 const first=service.install(true,true,['sudachi']),passive=service.install();
 const requests=[first,passive];if(retry)requests.push(service.install(true));
 gate.reject(Error('repair failed'));
 const results=await Promise.allSettled(requests);
 assert.deepEqual(results.map(r=>r.status),retry?['rejected','fulfilled','fulfilled']:['rejected','rejected']);
 assert.equal(probe.mock.callCount(),retry?1:0);
 });
});

test('the reading worker waits for both repairs regardless of when the lookup arrived',async t=>{
 for(const lookupFirst of [true,false])await t.test(lookupFirst?'lookup before second repair':'lookup after second repair',async t=>{
  const {service}=learning(),first=Promise.withResolvers(),second=Promise.withResolvers();
  const started=Promise.withResolvers();let calls=0;
  t.mock.method(installer,'ensurePip',()=>{if(++calls===1)return first.promise;started.resolve();return second.promise;});
  service.installed=()=>true;const worker=t.mock.method(service,'spawnWorker',async()=>{});
  const one=service.install(true,true,['sudachi']).catch(()=>{});
  let lookup;if(lookupFirst)lookup=service.ready();
  const two=service.install(true,true,['unidic']).catch(()=>{});
  if(!lookupFirst)lookup=service.ready();
  first.resolve();await one;await started.promise;await new Promise(resolve=>setImmediate(resolve));
  const early=worker.mock.callCount();second.resolve();await Promise.all([two,lookup]);
  assert.equal(early,0);assert.equal(worker.mock.callCount(),1);
 });
});
