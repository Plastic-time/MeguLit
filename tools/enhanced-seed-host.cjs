// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Runner = require('../services/cardinal-trusted-runner.cjs');
const Release = require('./seed-release-runner.cjs');
const P = require('../core/torch-release.cjs');
const D = require('../core/game-diff.cjs');
const Conditions = require('../core/cold-test/conditions.cjs');

function matches(request, candidate) {
  const profile = request.candidate;
  return profile.key === candidate.key && (!candidate.script || profile.prints?.script === candidate.script) &&
    (!candidate.engine || profile.engine === candidate.engine) && profile.mode === candidate.mode &&
    request.torchNo === candidate.torchNo && P.same(profile.settings, candidate.settings);
}

async function processOne({post, resolveRequest, policy, measure, sign, signal, renewMs = 90000}) {
  const claimed = await post('claim', {}, signal);
  const job = claimed.job;
  if (job === null) return {state:'empty'};
  if (!job || typeof job.id !== 'string' || typeof job.lease !== 'string' || !job.candidate) throw Error('INVALID_CLAIM');
  const lease = {id:job.id, lease:job.lease};
  const controller = new AbortController();
  const active = signal ? AbortSignal.any([signal,controller.signal]) : controller.signal;
  let renewal, lost = false;
  const renew = () => {
    if (!renewal) renewal = post('renew', lease, active).then(answer => {
      if (answer.ok !== true) throw Error('LEASE_LOST');
    }).catch(() => { lost = true; controller.abort(); }).finally(() => { renewal = undefined; });
  };
  const timer = setInterval(renew, renewMs);
  const call = (action, payload = {}) => { active.throwIfAborted(); return post(action,{...lease,...payload},active); };
  async function retry(state) {
    clearInterval(timer);
    await renewal;
    if ((await call('retry')).ok !== true) throw Error('RETRY_UNCONFIRMED');
    return {state};
  }
  try {
    const request = await resolveRequest(job.candidate, !job.proposal);
    if (!request) return await retry('missing-sample');
    if (!matches(request,job.candidate)) throw Error('CANDIDATE_MISMATCH');
    let proposal = job.proposal;
    if (!proposal) {
      const result = await measure(request, active);
      active.throwIfAborted();
      if (result.state !== 'reviewed') return await retry(result.state);
      const reviewed = {profile:request.candidate, review:result.review};
      await Release.candidate(reviewed.profile,reviewed.review,policy);
      proposal = (await call('receipt', reviewed)).proposal;
      if (!P.same(proposal?.review,reviewed.review)) throw Error('RECEIPT_MISMATCH');
    }
    if (!P.same(proposal.profile,request.candidate) || !P.same(proposal.review.identity,request.identity) ||
        proposal.review.torchNo !== request.torchNo || proposal.action !== 'promote') throw Error('PROPOSAL_MISMATCH');
    await Release.candidate(proposal.profile,proposal.review,policy);
    const baseline = request.baseline;
    if (baseline) await P.checked(baseline,policy);
    if (proposal.previous !== (baseline ? await P.hash(baseline) : null) ||
        proposal.revision !== (baseline?.revision || 0)+1 ||
        proposal.reason !== P.promotion(proposal.review,baseline)) throw Error('PROPOSAL_BASELINE');
    let gate;
    try { gate = await call('ready'); }
    catch(error) {
      if (error.code === 'TORCH_MALWARE_PENDING') return await retry('awaiting-malware');
      throw error;
    }
    if (!P.same(gate.proposal,proposal)) throw Error('GATE_PROPOSAL_CHANGED');
    if (!sign) return await retry('awaiting-publisher');
    active.throwIfAborted();
    const approved = D.canonical(proposal);
    const release = await sign(JSON.parse(approved));
    if (D.canonical(D.unsigned(release)) !== approved) throw Error('SIGNER_CHANGED_PROPOSAL');
    const proof = await P.checked(release,policy);
    P.transition(release,baseline);
    const published = await call('publish',{release});
    if (published.status !== 'published' || published.hash !== proof.hash) throw Error('PUBLISH_UNCONFIRMED');
    return {state:'published',hash:proof.hash};
  } catch (error) {
    if (lost) return {state:'lease-lost'};
    throw error;
  } finally {
    clearInterval(timer);
    await renewal;
  }
}

// One scheduled invocation occupies the same exclusive file as other game
// tests on this host. Use the host operator's queue path, never a relay path.
async function main(file) {
  const cfg = Runner.readJSON(file);
  const policy = Runner.readJSON(cfg.policy);
  const token = process.env.ENHANCED_HOST_TOKEN;
  delete process.env.ENHANCED_HOST_TOKEN;
  if (!token || !path.isAbsolute(cfg.queueLock)) throw Error('HOST_CONFIG');
  if (fs.existsSync(path.join(policy.stateRoot,'blocked.json')) || !Runner.resources()) return {state:'unavailable'};
  const status = spawnSync(path.join(policy.appRoot,'native','ColdDesk.exe'),['status'],{
    windowsHide:true,encoding:'utf8',timeout:7000,maxBuffer:16384,
    env:{SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR}
  });
  if (status.status !== 0 || !Conditions.check(JSON.parse(status.stdout)).ok) return {state:'busy'};
  let fd;
  try { fd = fs.openSync(cfg.queueLock,'wx'); }
  catch(error) { if(error.code==='EEXIST')return {state:'busy'}; throw error; }
  const stop = new AbortController();
  const abort = () => stop.abort();
  process.once('SIGTERM',abort); process.once('SIGINT',abort);
  try {
    const base = Release.baseURL(cfg.base);
    const requests = cfg.requests.map(f=>Runner.readJSON(f,Runner.MAX_REQUEST));
    return await processOne({
      post:(action,body,signal)=>Release.jsonRequest(base,'/api/enhanced-seed/'+action,{body,token,signal}),
      resolveRequest:(c,needsSample)=>{
        const hits=requests.filter(r=>matches(r,c));
        if(hits.length>1)throw Error('AMBIGUOUS_SAMPLE');
        return hits.find(r=>!needsSample || fs.existsSync(path.resolve(policy.sampleRoot,r.exe)));
      },
      policy,signal:stop.signal,
      measure:(request,signal)=>Runner.runHost(request,policy,{signal,signing:cfg.reviewer}),
      sign:cfg.publisher && cfg.publisher.store && cfg.publisher.id && cfg.publisher.vault && Release.publisherSigner({...cfg.publisher,keys:policy})
    });
  } finally {
    process.removeListener('SIGTERM',abort); process.removeListener('SIGINT',abort);
    fs.closeSync(fd); fs.unlinkSync(cfg.queueLock);
  }
}
if (require.main === module) main(process.argv[2]).then(r=>console.log(JSON.stringify(r))).catch(e=>{
  console.error(/^[A-Z_]+$/.test(e.message)?e.message:'ENHANCED_HOST_FAILURE'); process.exitCode=2;
});
module.exports={processOne,matches};
