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
