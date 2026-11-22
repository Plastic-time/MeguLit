// SPDX-License-Identifier: GPL-3.0-or-later
import {wakeClients} from './seed-notifications.js';
import protocol from '../../core/torch-release.cjs';
import gameDiff from '../../core/game-diff.cjs';
import {cleanForProfile} from './seed-malware.js';
import {cleanName} from './torch-credit.js';
import {blockedProfile,blockedProposal,profileBlock} from './seed-admin.js';
const keys=(env,name)=>{try{const v=JSON.parse(env[name]||'[]');return Array.isArray(v)?v:[];}catch{return [];}};
const trust=env=>({profileKeys:keys(env,'PROFILE_PUBLIC_KEYS'),reviewKeys:keys(env,'CARDINAL_REVIEW_PUBLIC_KEYS'),releaseKeys:keys(env,'TORCH_RELEASE_PUBLIC_KEYS')});
const row=async(db,key)=>db.prepare('SELECT h.* FROM torch_release_winners w JOIN torch_release_history h ON h.hash=w.hash WHERE w.game_key=?').bind(key).first();
const history=async(db,hash)=>db.prepare('SELECT * FROM torch_release_history WHERE hash=?').bind(hash).first();
const revoked=async db=>(await db.prepare('SELECT profile_hash FROM torch_release_revocations').all()).results.map(r=>r.profile_hash);
const parse=r=>r?JSON.parse(r.body):null;
const reject=code=>{throw Object.assign(new Error(code),{code});};
async function checkedRow(r,env){if(!r)return null;const v=parse(r),proof=await protocol.checked(v,trust(env));if(proof.hash!==r.hash)reject('TORCH_HISTORY');return v;}
async function candidate(profile,review,env){protocol.reviewShape(review);protocol.profileShape(profile,review.identity);if(await protocol.hash(profile)!==review.candidateHash||!await protocol.verify(profile,trust(env).profileKeys)||!await protocol.verify(review,trust(env).reviewKeys))reject('TORCH_SIGNATURE');}
export async function propose(db,input,env,now=new Date()){
 if(!input||Object.keys(input).some(k=>!['profile','review','targetHash','rollbackReason'].includes(k)))reject('TORCH_REQUEST');
 let profile=input.profile,review=input.review,target=null,action='promote',reason;
 if(input.targetHash!==undefined){if(!gameDiff.KEY.test(input.targetHash)||!protocol.ROLLBACK_REASONS.includes(input.rollbackReason))reject('TORCH_ROLLBACK');target=await checkedRow(await history(db,input.targetHash),env);if(!target)reject('TORCH_ROLLBACK');profile=target.profile;review=target.review;action='rollback';reason=input.rollbackReason;}
 await candidate(profile,review,env);
 if(await blockedProfile(db,profile)||await blockedProposal(db,{key:review.identity.exe,profile}))reject('TORCH_REVOKED');
 const currentRow=await row(db,review.identity.exe),current=await checkedRow(currentRow,env),blocked=await revoked(db);
 if(blocked.includes(review.candidateHash))reject('TORCH_REVOKED');
 if(action==='promote')reason=protocol.promotion(review,current);
 if(action==='promote'&&await db.prepare('SELECT hash FROM torch_release_history WHERE profile_hash=?').bind(review.candidateHash).first())reject('TORCH_REPLAY');
 if(review.torchNo!==0){const credit=await db.prepare('SELECT torch_no FROM torch_credits WHERE torch_no=? AND game_key=?').bind(review.torchNo,review.identity.exe).first();if(!credit)reject('TORCH_CREDIT');}
 else if(profile.source!=='official')reject('TORCH_CREDIT');
 const proposal={schema:'megulit.torch-release',version:1,key:review.identity.exe,revision:(current?.revision||0)+1,previous:currentRow?.hash||null,preparedAt:now.toISOString(),action,reason,targetHash:action==='rollback'?input.targetHash:null,profile,review};
 // Reuse the exact transition validator without manufacturing a valid signature.
 const shaped={...proposal,signature:{alg:'ed25519',keyId:'proposal',value:'A'.repeat(86)+'=='}};
 protocol.transition(shaped,current,{target,revoked:blocked});
 const hash=await protocol.hash(proposal);
 await db.prepare('INSERT OR IGNORE INTO torch_release_pending(hash,game_key,previous_hash,body,created_at) VALUES(?,?,?,?,?)').bind(hash,proposal.key,proposal.previous,gameDiff.canonical(proposal),proposal.preparedAt).run();
 return {hash,proposal,status:'awaiting-offline-signature'};
}
export async function enhancedBaseline(db,proposal){
 if(proposal.previous)return null;
 const prior=await db.prepare("SELECT body FROM game_diffs WHERE layer='version' AND game_key=? AND withdrawn_at IS NULL ORDER BY (source='official') DESC LIMIT 1").bind(proposal.key).first();
 if(!prior)return null;
 const doc=JSON.parse(prior.body);
 if(doc.mode!==proposal.profile.mode||!protocol.same(doc.settings,proposal.profile.settings))reject('TORCH_BASELINE_UNREVIEWED');
 return prior.body;
}
export async function publish(db,release,env,now=new Date(),job=null){
 if(await blockedProfile(db,release.profile)||await blockedProposal(db,release))reject('TORCH_REVOKED');
 const proof=await protocol.checked(release,trust(env)),unsigned=gameDiff.unsigned(release),pendingHash=await protocol.hash(unsigned),pending=await db.prepare('SELECT * FROM torch_release_pending WHERE hash=?').bind(pendingHash).first();
 if(!pending||pending.body!==gameDiff.canonical(unsigned)||now.getTime()-Date.parse(pending.created_at)>7*86400000||Date.parse(pending.created_at)>now.getTime())reject('TORCH_PENDING');
 const existing=await history(db,proof.hash);if(existing){await checkedRow(existing,env);return {hash:proof.hash,status:'published',duplicate:true};}
 const currentRow=await row(db,release.key),current=await checkedRow(currentRow,env);if((currentRow?.hash||null)!==release.previous)reject('TORCH_STALE');
 const blocked=await revoked(db),target=release.targetHash?await checkedRow(await history(db,release.targetHash),env):null;
 protocol.transition(release,current,{target,revoked:blocked});
 if(release.action==='promote'&&await db.prepare('SELECT hash FROM torch_release_history WHERE profile_hash=?').bind(proof.profileHash).first())reject('TORCH_REPLAY');
 const malware=await cleanForProfile(db,release.profile),tombstone=await profileBlock(release.profile),body=gameDiff.canonical(release),args=[proof.hash,release.key,release.revision,release.previous,proof.profileHash,body,now.toISOString(),release.key,release.previous,release.previous];
 const priorBody=job?await enhancedBaseline(db,release):null;
 const jobGuard=job?" AND EXISTS(SELECT 1 FROM enhanced_seed_jobs j JOIN seed_admin_items i ON i.id=j.id WHERE j.id=? AND j.lease=? AND j.state='pending' AND j.available_at>? AND i.state<>'deleted' AND j.proposal=? AND (json_extract(j.proposal,'$.previous') IS NOT NULL OR (SELECT body FROM game_diffs WHERE layer='version' AND game_key=? AND withdrawn_at IS NULL ORDER BY (source='official') DESC LIMIT 1) IS ?) AND (SELECT enabled FROM ordinary_publish_policy WHERE id=1)=1)":"";
 const result=await db.batch([
  db.prepare('INSERT INTO torch_release_history(hash,game_key,revision,previous_hash,profile_hash,body,published_at) SELECT ?,?,?,?,?,?,? WHERE (SELECT hash FROM torch_release_winners WHERE game_key=?) IS ? AND NOT EXISTS(SELECT 1 FROM torch_release_revocations WHERE profile_hash=?) AND NOT EXISTS(SELECT 1 FROM seed_admin_items WHERE '+tombstone.sql+') AND EXISTS(SELECT 1 FROM seed_malware_current m JOIN seed_admin_items i ON i.id=m.item_id WHERE m.artifact_key=? AND m.state=? AND m.revision=? AND m.identity_hash=? AND m.profile_hash=? AND m.item_id=? AND i.state<>? AND i.body=?)'+jobGuard).bind(...args.slice(0,9),proof.profileHash,...tombstone.args,malware.artifactKey,'clean',malware.revision,malware.identityHash,malware.profileHash,malware.itemId,'deleted',malware.sourceBody,...(job?[job.id,job.lease,job.time,job.proposal,release.key,priorBody]:[])),
  db.prepare('INSERT INTO torch_release_winners(game_key,hash) SELECT ?,? WHERE EXISTS(SELECT 1 FROM torch_release_history WHERE hash=?) ON CONFLICT(game_key) DO UPDATE SET hash=excluded.hash WHERE torch_release_winners.hash IS ?').bind(release.key,proof.hash,proof.hash,release.previous),
 ]);
 if(!result[0]?.meta?.changes||!result[1]?.meta?.changes)reject('TORCH_STALE');
 return {hash:proof.hash,status:'published'};
}
export async function lookup(db,key,env){if(!gameDiff.KEY.test(key||''))return null;const r=await row(db,key);if(!r)return null;const release=await checkedRow(r,env);const withdrawal=await db.prepare('SELECT body FROM torch_release_revocations WHERE profile_hash=?').bind(release.review.candidateHash).first();
 if(withdrawal)throw Object.assign(new Error('TORCH_REVOKED'),{code:'TORCH_REVOKED',withdrawal:{release,revocation:JSON.parse(withdrawal.body)}});
 if(await blockedProfile(db,release.profile))reject('TORCH_REVOKED');
 const n=release.review.torchNo,c=await db.prepare('SELECT c.name,c.alias FROM torch_credits r JOIN torch_roster_links l ON l.torch_no=r.torch_no JOIN torch_carvings c ON c.torch_no=l.carving_no WHERE r.torch_no=? AND r.game_key=? AND c.name_key IS NOT NULL').bind(n,key).first(),cleaned=c?cleanName(c.name,env):null;
 const name=cleaned?.ok?cleaned.name:null;
 return {release,publication:{hash:r.hash,at:r.published_at},credit:{torchNo:n,name,...(!name&&c?.alias?{alias:c.alias}:{})}};
}
export async function exportHistory(db,key){if(!gameDiff.KEY.test(key||''))reject('TORCH_KEY');const rows=(await db.prepare('SELECT hash,body,published_at FROM torch_release_history WHERE game_key=? ORDER BY revision LIMIT 1001').bind(key).all()).results;if(rows.length>1000||rows.reduce((n,r)=>n+r.body.length,0)>8*1024*1024)reject('TORCH_LIMIT');const winner=await row(db,key);return {schema:'megulit.torch-history-export',version:1,key,winner:winner?.hash||null,releases:rows.map(r=>({hash:r.hash,release:JSON.parse(r.body),publishedAt:r.published_at})),revoked:await revoked(db)};}
export async function revoke(db,document,env,now=new Date()){if(!document||Object.keys(document).sort().join(',')!=='profileHash,reason,schema,signature,version'||document.schema!=='megulit.torch-revocation'||document.version!==1||!gameDiff.KEY.test(document.profileHash)||!['compatibility-failed','review-withdrawn','signature-revoked'].includes(document.reason)||!await protocol.verify(document,trust(env).releaseKeys))reject('TORCH_REVOCATION');await db.prepare('INSERT OR IGNORE INTO torch_release_revocations(profile_hash,revoked_at,body) VALUES(?,?,?)').bind(document.profileHash,now.toISOString(),gameDiff.canonical(document)).run();return {status:'revoked'};}
async function input(request){if(Number(request.headers.get('content-length'))>protocol.MAX_BYTES||!request.body)reject('TORCH_LIMIT');const reader=request.body.getReader(),chunks=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>protocol.MAX_BYTES)reject('TORCH_LIMIT');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}const all=new Uint8Array(size);let at=0;for(const c of chunks){all.set(c,at);at+=c.length;}try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all));}catch{reject('TORCH_REQUEST');}}
export async function torchReleaseRoute(request,env,now,url,path,{json,fail}){
 try{
  if(path==='/api/torch-release'&&request.method==='GET'){const got=await lookup(env.DB,url.searchParams.get('exe'),env);return got?json(got):fail('NOT_FOUND',404);}
  if(path==='/api/torch-release/changes'&&request.method==='GET'){
   const after=Number(url.searchParams.get('after'));
   if(!Number.isSafeInteger(after)||after<0)return fail('TORCH_CURSOR',400);
   const {results}=await env.DB.prepare('SELECT seq,game_key FROM torch_changes WHERE seq>? ORDER BY seq LIMIT 128').bind(after).all();
   return json({changes:results});
  }
  if(!path.startsWith('/api/torch-release/'))return null;
  if(!env.ADAPTER_ADMIN_TOKEN||request.headers.get('authorization')!=='Bearer '+env.ADAPTER_ADMIN_TOKEN)return fail('UNAUTHORIZED',401);
  if(['/api/torch-release/propose','/api/torch-release/publish','/api/torch-release/revoke'].includes(path)&&request.method==='POST'){
   const result=await (path.endsWith('/propose')?propose:path.endsWith('/revoke')?revoke:publish)(env.DB,await input(request),env,now);
   if(!path.endsWith('/propose'))await wakeClients(env);
   return json(result);
  }
  if(path==='/api/torch-release/history'&&request.method==='GET')return json(await exportHistory(env.DB,url.searchParams.get('exe')));
  return fail('NOT_FOUND',404);
 }catch(e){if(e.withdrawal)return json({ok:false,error:'TORCH_REVOKED',...e.withdrawal},410);return fail(/^TORCH_[A-Z_]+$/.test(e?.code||'')?e.code:'TORCH_REJECTED',e?.code==='TORCH_REVOKED'?410:e?.code==='TORCH_MALWARE_UNAVAILABLE'?503:/^TORCH_MALWARE_/.test(e?.code||'')?409:422);}
}
