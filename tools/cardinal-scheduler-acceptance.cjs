// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {setTimeout: delay} = require('node:timers/promises');
async function exercise(config, post, now = Date.now, wait = delay) {
  const call = async (route,body) => {
    const response = await post(route,body);
    assert.ok(response.ok,route + ' HTTP ' + response.status);
    return response.body;
  };
  async function denied(route,body,expected) {
    const res = await post(route,body);
    assert.deepEqual([res.status,res.body?.[expected.field]],[expected.status,expected.value],route);
  }
  const claims = await Promise.all([call('claim',{}),call('claim',{})]);
  const jobs = claims.map(c=>c.job);
  assert.equal(jobs.filter(j=>j===null).length,1,'duplicate or missing claim');
  const job = jobs.find(Boolean);
  assert.equal(job.id,config.jobId);
  const old = {id:job.id,lease:job.lease};
  function expiry(value) {
    const ms = typeof value === 'number' ? value * 1000 : Date.parse(value);
    assert.ok(Number.isFinite(ms) && ms > now() && ms <= now()+310000,'invalid lease expiry');
    return ms;
  }
  const first = expiry(job.expires);
  await wait(2000);
  const renewed = await call('renew',old);
  assert.equal(renewed.ok,true);
  const end = now()+300000;
  assert.ok(end > first,'renew did not extend lease');
  await wait(Math.max(0,first+350-now()));
  assert.equal((await call('claim',{})).job,null,'renewed job redelivered early');
  await wait(Math.max(0,end+350-now()));
  const evidence = {profile:config.profile,review:config.review};
  await denied('receipt',{...old,...evidence},config.expired);
  const next = (await call('claim',{})).job;
  assert.equal(next.id,job.id);
  assert.ok(next.lease && next.lease!==old.lease);
  const lease = {id:next.id,lease:next.lease};
  await denied('receipt',{...old,...evidence},config.expired);
  const receipt = await call('receipt',{...lease,...evidence});
  assert.ok(receipt.proposal);
  assert.deepEqual((await call('receipt',{...lease,...evidence})).proposal,receipt.proposal);
  const {signature,...signedBody} = config.release;
  assert.ok(signature);
  assert.deepEqual(signedBody,receipt.proposal);
  await denied('ready',lease,config.unready);
  await denied('publish',{...lease,release:config.release},config.unpublished);
  assert.equal((await call('claim',{})).job,null);
}
async function main(file) {
  const config = JSON.parse(fs.readFileSync(file,'utf8'));
  const base = new URL(config.base);
  assert.ok(base.protocol==='http:' && base.hostname==='127.0.0.1' && config.disposable===true);
  assert.ok(config.jobId && config.profile && config.review && config.release && process.env.ENHANCED_HOST_TOKEN);
  for (const key of ['expired','unready','unpublished']) {
    const expected = config[key];
    assert.ok(expected && expected.field==='error');
    if (key==='expired') assert.deepEqual([expected.status,expected.value],[409,'LEASE_LOST']);
    else assert.ok(expected.status>=400 && /^TORCH_MALWARE_(INFECTED|PENDING|UNAVAILABLE)$/.test(expected.value));
  }
  await exercise(config,async(route,body)=>{
    const res = await fetch(new URL('/api/enhanced-seed/'+route,base),{method:'POST',redirect:'error',
      headers:{authorization:'Bearer '+process.env.ENHANCED_HOST_TOKEN,'content-type':'application/json'},
      signal:AbortSignal.timeout(8000),body:JSON.stringify(body)});
    return {status:res.status,ok:res.ok,body:await res.json()};
  });
  console.log('disposable scheduler checks passed');
}
module.exports={exercise};
if(require.main===module) main(process.argv[2]).catch(e=>{console.error(e.message);process.exitCode=2;});
