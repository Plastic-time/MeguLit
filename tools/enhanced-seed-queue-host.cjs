// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const path=require('node:path');
const {setTimeout:delay}=require('node:timers/promises');
const {jsonRequest,baseURL,publisherSigner,candidate}=require('./seed-release-runner.cjs');
const protocol=require('../core/torch-release.cjs');
const diff=require('../core/game-diff.cjs');

async function processOne({base,token,keys,collect,sign,signal,fetcher}){
 const request=(route,body,abort=signal)=>jsonRequest(base,route,{token,body,signal:abort,fetcher});
 const job=(await request('/api/enhanced-seed/claim',{})).job;
 if(!job)return false;
 const work=new AbortController(),abort=signal?AbortSignal.any([signal,work.signal]):work.signal;
 const call=(action,fields)=>request('/api/enhanced-seed/'+action,{id:job.id,lease:job.lease,...fields},abort);
 const timer=setInterval(()=>call('renew').catch(()=>work.abort()),60000);
 try{
   let baseline=null;
   try{baseline=(await request('/api/torch-release?exe='+encodeURIComponent(job.candidate.key),undefined,abort)).release;
     await protocol.checked(baseline,keys);
   }catch(e){if(e.status!==404)throw e;}
   let proposal=job.proposal;
   if(!proposal){
     const evidence=await collect(job.candidate,{baseline,signal:abort});
     if(!evidence){await call('retry');return true;}
     proposal=(await call('receipt',{profile:evidence.profile,review:evidence.review})).proposal;
   }
   const ready=(await call('ready')).proposal;
   if(!protocol.same(ready,proposal))throw Error('PROPOSAL_CHANGED');
   const {profile,review}=proposal,c=job.candidate;
   if(!(await candidate(profile,review,keys)).ready||profile.key!==c.key||profile.mode!==c.mode||
     !protocol.same(profile.settings,c.settings)||c.engine&&profile.engine!==c.engine||
     c.script&&profile.prints?.script!==c.script||review.torchNo!==c.torchNo||
     proposal.action!=='promote'||proposal.previous!==(baseline?await protocol.hash(baseline):null))throw Error('CANDIDATE_MISMATCH');
   protocol.transition({...proposal,signature:{...profile.signature}},baseline);
   abort.throwIfAborted();
   const signed=await sign(structuredClone(proposal));
   if(!protocol.same(diff.unsigned(signed),proposal))throw Error('PROPOSAL_CHANGED');
   await protocol.checked(signed,keys);
   await call('publish',{release:signed});
   return true;
 }catch(e){await call('retry').catch(()=>{});throw e;}
 finally{clearInterval(timer);work.abort();}
}

if(require.main===module)(async()=>{
 const [origin,configFile]=process.argv.slice(2),token=process.env.ENHANCED_HOST_TOKEN;
 if(!token||!configFile||!path.isAbsolute(configFile))throw Error('HOST_CONFIGURATION');
 const base=baseURL(origin),runner=require('../services/cardinal-trusted-runner.cjs');
 const {policy,samples}=runner.readJSON(configFile);
 if(!Array.isArray(samples)||!policy?.collector?.file)throw Error('COLLECTOR_CONFIGURATION');
 const keys={profileKeys:policy.profileKeys,reviewKeys:policy.reviewKeys};
 keys.releaseKeys=keys.profileKeys;
 const signing={keys,store:process.env.ENHANCED_KEY_STORE,id:process.env.ENHANCED_PUBLISHER_ID,vault:process.env.ENHANCED_VAULT};
 const sign=publisherSigner(signing),signProfile=publisherSigner({...signing,scope:'profile'});
 const collect=async(c,{baseline,signal})=>{
   const matches=samples.filter(s=>protocol.identity(s.identity)&&s.identity.exe===c.key&&(!c.script||s.identity.script===c.script)&&(!c.engine||s.identity.engine===c.engine));
   if(matches.length!==1)return null;
   const {identity,exe}=matches[0];
   const doc=diff.build({layer:'version',key:c.key,mode:c.mode,settings:c.settings,source:'auto',rev:(baseline?.profile.rev||0)+1,
     engine:identity.engine,prints:{exe:c.key,script:identity.script},issuedAt:c.issuedAt});
   protocol.profileShape({...doc,signature:{alg:'ed25519',keyId:'shape',value:'A'.repeat(86)+'=='}},identity);
   const profile=await signProfile(doc);
   const request={schema:'megulit.cardinal-trusted-request',version:1,exe,identity,candidate:profile,baseline,torchNo:c.torchNo};
   const result=await runner.runHost(request,policy,{signal,signing:signing.store?{store:signing.store,vault:signing.vault,id:process.env.ENHANCED_REVIEWER_ID}:undefined});
   return result.state==='reviewed'?{profile,review:result.review}:null;
 };
 const fs=require('node:fs'),crypto=require('node:crypto');
 if(!path.isAbsolute(policy.collector.file)||fs.statSync(policy.collector.file).size>64*1024**2||
    crypto.createHash('sha256').update(fs.readFileSync(policy.collector.file)).digest('hex')!==policy.collector.sha256)throw Error('COLLECTOR_CONFIGURATION');
 for(;;){
   try{if(await processOne({base,token,keys,collect,sign}))continue;}catch(e){console.error(/^[A-Z_]+$/.test(e.code||'')?e.code:'HOST_RETRY');}
   await delay(15000);
 }
})().catch(()=>{console.error('HOST_CONFIGURATION');process.exitCode=1;});
module.exports={processOne};
