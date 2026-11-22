// SPDX-License-Identifier: GPL-3.0-or-later
import diff from '../../core/game-diff.cjs';
import protocol from '../../core/torch-release.cjs';
import {propose,publish,enhancedBaseline} from './torch-release.js';
import {cleanForProfile,saveScan} from './seed-malware.js';
import {wakeClients} from './seed-notifications.js';
import {boundedJSON} from './ordinary-seed.js';

const enabled="(SELECT enabled FROM ordinary_publish_policy WHERE id=1)=1";
const live="EXISTS(SELECT 1 FROM seed_admin_items WHERE id=enhanced_seed_jobs.id AND state<>'deleted')";
const owned="id=? AND lease=? AND state='pending' AND available_at>? AND "+enabled+" AND "+live;
const leaseSeconds=300;

export async function enqueueEnhanced(db,id,r,torchNo,now){
  const candidate={key:r.key,script:r.prints.script||null,engine:r.engine||null,mode:r.mode,settings:r.settings,torchNo,issuedAt:now.toISOString()};
  await db.prepare('INSERT OR IGNORE INTO enhanced_seed_jobs(id,candidate) VALUES(?,?)').bind(id,JSON.stringify(candidate)).run();
  return db.prepare('SELECT id,state FROM enhanced_seed_jobs WHERE id=?').bind(id).first();
}

async function ensureScan(env,proposal,now){
  try{return await cleanForProfile(env.DB,proposal.profile);}
  catch(e){if(e.code!=='TORCH_MALWARE_PENDING')throw e;}
  if(!env.ORDINARY_SCAN_URL||!env.ORDINARY_SCAN_TOKEN)throw Object.assign(Error(),{code:'TORCH_MALWARE_UNAVAILABLE'});
  const url=new URL('scan-enhanced',env.ORDINARY_SCAN_URL);
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&url.hostname==='127.0.0.1')||url.username||url.password)throw Error('scanner configuration');
  const response=await fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(25000),
    headers:{authorization:'Bearer '+env.ORDINARY_SCAN_TOKEN,'content-type':'application/json'},body:diff.canonical(proposal.profile)});
  if(!response.ok){await response.body?.cancel();throw Object.assign(Error(),{code:'TORCH_MALWARE_UNAVAILABLE'});}
  const {value:r}=await boundedJSON(response,2048);
  if(!r||r.subject!==proposal.review.candidateHash||!['clean','infected'].includes(r.state)||r.scanner!=='ClamAV'||
    !/^\d+\.\d+\.\d+$/.test(r.version)||!/^\d{1,12}$/.test(r.definitions)||!protocol.iso(r.scannedAt)||
    Math.abs(now-Date.parse(r.scannedAt))>300000)throw Error('invalid scan receipt');
  await saveScan(env.DB,proposal,r,now);
  return cleanForProfile(env.DB,proposal.profile);
}

export async function enhancedRoute(request,env,now,action,{json,fail}){
  if(request.method!=='POST')return fail('METHOD_NOT_ALLOWED',405);
  if(!env.ENHANCED_HOST_TOKEN||request.headers.get('authorization')!=='Bearer '+env.ENHANCED_HOST_TOKEN)return fail('UNAUTHORIZED',401);
  const db=env.DB,time=Math.floor(now.getTime()/1000);
  const {value:v,error}=await boundedJSON(request,protocol.MAX_BYTES*2);
  if(error||!v||typeof v!=='object')return fail('INVALID_JSON',400);
  if(action==='claim'){
    await db.prepare('INSERT OR REPLACE INTO enhanced_seed_host(id,seen_at) VALUES(1,?)').bind(time).run();
    const job=await db.prepare(`UPDATE enhanced_seed_jobs SET lease=?,available_at=?,attempts=attempts+1
      WHERE id=(SELECT id FROM enhanced_seed_jobs WHERE state='pending' AND available_at<=? AND ${enabled} AND ${live}
        ORDER BY available_at,id LIMIT 1) RETURNING id,candidate,lease,proposal,available_at`)
      .bind(crypto.randomUUID(),time+leaseSeconds,time).first();
    return json({job:job?{id:job.id,lease:job.lease,expires:job.available_at,candidate:JSON.parse(job.candidate),proposal:JSON.parse(job.proposal)}:null});
  }
  if(typeof v.id!=='string'||typeof v.lease!=='string')return fail('INVALID_JOB',400);
  const args=[v.id,v.lease,time];
  const job=await db.prepare('SELECT * FROM enhanced_seed_jobs WHERE '+owned).bind(...args).first();
  if(!job)return fail('LEASE_LOST',409);
  const update=async(sql,...values)=>(await db.prepare('UPDATE enhanced_seed_jobs SET '+sql+' WHERE '+owned).bind(...values,...args).run()).meta.changes;
  try{
    if(action==='renew'||action==='retry'){
      const retry=action==='retry';
      const changed=await update('lease=?,available_at=?',retry?null:v.lease,time+(retry?60:leaseSeconds));
      if(changed&&!retry)await db.prepare('UPDATE enhanced_seed_host SET seen_at=? WHERE id=1').bind(time).run();
      return changed?json({ok:true}):fail('LEASE_LOST',409);
    }
    if(action==='receipt'){
      const c=JSON.parse(job.candidate),p=v.profile,r=v.review;
      if(!p||!r||p.key!==c.key||c.script&&p.prints?.script!==c.script||c.engine&&p.engine!==c.engine||p.mode!==c.mode||
        diff.canonical(p.settings)!==diff.canonical(c.settings)||r.torchNo!==c.torchNo)return fail('CANDIDATE_MISMATCH',422);
      const saved=JSON.parse(job.proposal);
      if(saved&&protocol.same(saved.profile,p)&&protocol.same(saved.review,r)&&now-Date.parse(saved.preparedAt)<7*86400000)return json({proposal:saved});
      const {proposal}=await propose(db,{profile:p,review:r},env,now);
      const savedChange=await db.prepare('UPDATE enhanced_seed_jobs SET proposal=? WHERE '+owned+' AND proposal IS ?').bind(JSON.stringify(proposal),...args,job.proposal).run();
      return savedChange.meta.changes?json({proposal}):fail('LEASE_LOST',409);
    }
    const proposal=JSON.parse(job.proposal);
    if(!proposal)return fail('AWAITING_RECEIPT',409);
    if(action==='ready'){
      const current=await db.prepare('SELECT hash FROM torch_release_winners WHERE game_key=?').bind(proposal.key).first();
      if((current?.hash||null)!==proposal.previous||now-Date.parse(proposal.preparedAt)>=7*86400000){
        await update("proposal=NULL,lease=NULL,available_at=0");
        return fail('TORCH_STALE',409);
      }
      await enhancedBaseline(db,proposal);
      await ensureScan(env,proposal,now);
      if(!await db.prepare('SELECT id FROM enhanced_seed_jobs WHERE '+owned+' AND proposal=?').bind(...args,job.proposal).first())return fail('LEASE_LOST',409);
      return json({proposal});
    }
    if(action==='publish'){
      if(!v.release||!protocol.same(diff.unsigned(v.release),proposal))return fail('PROPOSAL_MISMATCH',422);
      const result=await publish(db,v.release,env,now,{id:v.id,lease:v.lease,time,proposal:job.proposal});
      if(!result.duplicate)await wakeClients(env);
      return json(result);
    }
    return fail('NOT_FOUND',404);
  }catch(e){
    if(['TORCH_NOT_BETTER','TORCH_INCOMPARABLE'].includes(e.code)){
      if(!await update("proposal=NULL,reason=?,lease=NULL,available_at=?",e.code,time+86400))return fail('LEASE_LOST',409);
    }
    return fail(/^TORCH_[A-Z_]+$/.test(e.code)?e.code:'ENHANCED_PROCESSING_FAILED',422);
  }
}
