// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/torch-release.cjs');
const {processOne}=require('../tools/enhanced-seed-host.cjs');
const P=require('../core/torch-release.cjs'),D=require('../core/game-diff.cjs');

async function host() {
  const f=fixture(),profile=f.profile(),release=await f.release(profile),proposal=D.unsigned(release);
  const request={candidate:profile,identity:f.identity,torchNo:0,baseline:null};
  const job={id:'one',lease:'lease',proposal:null,candidate:{key:profile.key,script:f.identity.script,
    engine:profile.engine,mode:profile.mode,settings:profile.settings,torchNo:0}};
  const calls=[];
  const post=async(action,body)=>{
    calls.push(action);
    if(action==='claim'){assert.deepEqual(body,{});return {job};}
    assert.equal(body.id,job.id);assert.equal(body.lease,job.lease);
    if(action==='receipt'){assert.deepEqual(body.review,release.review);return {proposal};}
    if(action==='ready')return {proposal};
    if(action==='publish')return {status:'published',hash:await P.hash(body.release)};
    return {ok:true};
  };
  return {calls,job,proposal,options:{post,policy:f.keys,resolveRequest:()=>request,
    measure:async()=>({state:'reviewed',review:release.review}),sign:v=>f.publisher.sign(v)}};
}
test('fresh measurement passes receipt and matching gate before publication',async()=>{
  const h=await host();
  assert.equal((await processOne(h.options)).state,'published');
  assert.deepEqual(h.calls,['claim','receipt','ready','publish']);
});
test('resume a signed receipt without remeasuring',async()=>{
  const h=await host();h.job.proposal=h.proposal;h.options.measure=assert.fail;
  assert.equal((await processOne(h.options)).state,'published');
  assert.deepEqual(h.calls,['claim','ready','publish']);
});
test('missing sample releases the lease',async()=>{
  const h=await host();h.options.resolveRequest=()=>null;
  assert.equal((await processOne(h.options)).state,'missing-sample');
  assert.deepEqual(h.calls,['claim','retry']);
});
test('lease loss aborts capture before receipt',async()=>{
  const h=await host(),post=h.options.post;
  h.options.renewMs=5;h.options.post=(a,b)=>a==='renew'?Promise.reject(Error('lost')):post(a,b);
  h.options.measure=(_,signal)=>new Promise(resolve=>signal.addEventListener('abort',()=>resolve({state:'blocked'}),{once:true}));
  assert.equal((await processOne(h.options)).state,'lease-lost');
  assert.deepEqual(h.calls,['claim']);
});
test('changed malware gate cannot reach publisher',async()=>{
  const h=await host(),post=h.options.post;
  h.options.post=(a,b)=>a==='ready'?{proposal:{...h.proposal,revision:4}}:post(a,b);
  h.options.sign=assert.fail;
  await assert.rejects(processOne(h.options),/GATE_PROPOSAL_CHANGED/);
});
test('resident loop retries transport and empty queues serially with bounded backoff',async()=>{
  const {serve}=require('../tools/enhanced-seed-queue-host.cjs');
  const ctl=new AbortController(), delays=[], states=[];
  let calls=0;
  await serve(async()=>{
    calls++;
    if(calls===1)throw Error('SEED_RUNNER_TRANSPORT');
    return {state:calls===9?'processed':'empty'};
  },ctl.signal,{wait:async ms=>{delays.push(ms);if(calls===9)ctl.abort();},report:s=>states.push(JSON.parse(s).state)});
  assert.deepEqual(delays,[2000,4000,8000,16000,32000,60000,60000,60000,1000]);
  assert.deepEqual(states,['SEED_RUNNER_TRANSPORT','empty','processed']);
});

test('Windows kernel releases only the terminated owner queue lock',{skip:process.platform!=='win32',timeout:10000},async t=>{
  const fs=require('node:fs'),path=require('node:path'),{once}=require('node:events');
  const {lockQueue}=require('../tools/enhanced-seed-queue-host.cjs');
  const root=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'seed-lock-'));
  const file=path.join(root,'queue.lock');
  const script="require(process.argv[1]).lockQueue(process.argv[2]);process.send('ready');setInterval(()=>{},1000)";
  const child=require('node:child_process').spawn(process.execPath,['-e',script,require.resolve('../tools/enhanced-seed-queue-host.cjs'),file],
    {windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
  const exited=once(child,'exit');
  t.after(async()=>{child.kill();await exited;fs.rmSync(root,{recursive:true,force:true});});
  await once(child,'message');
  assert.equal(lockQueue(file),null);
  child.kill();await exited;
  const release=lockQueue(file);assert.equal(typeof release,'function');release();
  assert.equal(fs.existsSync(file),false);
});
