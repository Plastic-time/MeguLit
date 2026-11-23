// SPDX-License-Identifier: GPL-3.0-or-later
import {pendingSeeds} from './seed-lifecycle.js';
import ordinary from '../../core/ordinary-seed.cjs';
import diff from '../../core/game-diff.cjs';
import protocol from '../../core/torch-release.cjs';
import {wakeClients} from './seed-notifications.js';
import {profileBlock} from './seed-admin.js';

export async function boundedJSON(message, limit) {
  if (Number(message.headers.get('content-length')) > limit) return {error:'PAYLOAD_TOO_LARGE'};
  const reader = message.body?.getReader();
  if (!reader) return {error:'INVALID_JSON'};
  const bytes = new Uint8Array(limit);
  let size = 0;
  try {
    for (;;) {
      const {done,value} = await reader.read();
      if (done) break;
      if (value.length > limit - size) { await reader.cancel(); return {error:'PAYLOAD_TOO_LARGE'}; }
      bytes.set(value,size);
      size += value.length;
    }
    return {value:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,size)))};
  } catch { return {error:'INVALID_JSON'}; }
  finally { reader.releaseLock(); }
}
export async function enqueue(db, data, now, seedId=null) {
  const id = await protocol.hash(data), body = diff.canonical(data);
  await db.prepare(`INSERT INTO ordinary_seed_jobs(id,game_key,candidate,issued_at,seed_id,revision)
    SELECT ?,?,?,?,?,1+max(coalesce((SELECT max(revision) FROM ordinary_seed_jobs WHERE game_key=?),0),
      coalesce((SELECT max(rev) FROM game_diffs WHERE layer='version' AND game_key=?),0),
      coalesce((SELECT rev FROM auto_profile_picks WHERE layer='version' AND game_key=?),0))
    WHERE true ON CONFLICT(id) DO UPDATE SET seed_id=excluded.seed_id
      WHERE ordinary_seed_jobs.seed_id IS NULL AND excluded.seed_id IS NOT NULL`).bind(id,data.key,body,now.toISOString(),seedId,data.key,data.key,data.key).run();
  return status(db,id);
}
export const status = (db,id) => db.prepare('SELECT id,state,revision,retry_reason AS retryReason FROM ordinary_seed_jobs WHERE id=?').bind(id).first();

export async function scan(env, doc) {
  const url = URL.canParse(env.ORDINARY_SCAN_URL) ? new URL(env.ORDINARY_SCAN_URL) : null;
  if (!url || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1','[::1]'].includes(url.hostname))) ||
      url.username || url.password || url.search || url.hash || !env.ORDINARY_SCAN_TOKEN) throw Error('scan configuration');
  const res = await fetch(url,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(25000),
    headers:{authorization:'Bearer '+env.ORDINARY_SCAN_TOKEN,'content-type':'application/json'},body:diff.canonical(doc)});
  if (!res.ok) { await res.body?.cancel(); throw Error('scanner unavailable'); }
  const {value:r} = await boundedJSON(res,2048);
  if (r?.subject !== await protocol.hash(doc) || r.scanner !== 'ClamAV' ||
      typeof r.version!=='string' || !/^\d+\.\d+\.\d+$/.test(r.version) ||
      typeof r.definitions!=='string' || !/^\d{1,12}$/.test(r.definitions) ||
      !protocol.iso(r.scannedAt) || Math.abs(Date.now()-Date.parse(r.scannedAt))>300000)
    throw Error('unknown scan result');
  const receipt = JSON.stringify({subject:r.subject,scanner:r.scanner,version:r.version,definitions:r.definitions,scannedAt:r.scannedAt});
  if (r.state === 'infected') return {receipt};
  const signed = {...doc,signature:r.signature};
  if (r.state !== 'clean' || !ordinary.signed(signed) || r.artifact !== await protocol.hash(signed) ||
      !await protocol.verify(signed,JSON.parse(env.ORDINARY_PUBLIC_KEYS || '[]'))) throw Error('scan signature');
  return {receipt,signed,hash:r.artifact};
}

export async function processJob(env,id,now=new Date()) {
  const db = env.DB, time = Math.floor(now.getTime()/1000), lease = crypto.randomUUID();
  const row = await db.prepare(`UPDATE ordinary_seed_jobs SET lease=?,retry_at=?,retry_reason=NULL
    WHERE id=? AND state='pending' AND retry_at<=? AND (SELECT enabled FROM ordinary_publish_policy WHERE id=1)=1
    RETURNING *`).bind(lease,time+120,id,time).first();
  if (!row) return;
  try {
    const input = JSON.parse(row.candidate), doc = ordinary.document(input,row.revision,row.issued_at);
    if (!doc || doc.key !== row.game_key || await protocol.hash(input) !== id) throw Error('invalid stored seed');
    const result = await scan(env,doc);
    if (!result.signed) {
      await db.prepare("UPDATE ordinary_seed_jobs SET state='quarantined',scan=?,lease=NULL WHERE id=? AND lease=?").bind(result.receipt,id,lease).run();
      return;
    }
    const block = await profileBlock(result.signed,{profileHash:result.hash}), body = diff.canonical(result.signed);
    const [,stored] = await db.batch([
      db.prepare(`UPDATE ordinary_seed_jobs SET state=CASE
        WHEN EXISTS(SELECT 1 FROM seed_lifecycle_block b WHERE b.id=ordinary_seed_jobs.seed_id) OR EXISTS(SELECT 1 FROM torch_release_revocations WHERE profile_hash=?) OR
             EXISTS(SELECT 1 FROM seed_malware_current WHERE profile_hash=? AND state='infected') OR
             EXISTS(SELECT 1 FROM seed_admin_items WHERE ${block.sql}) THEN 'blocked'
        WHEN EXISTS(SELECT 1 FROM torch_release_winners WHERE game_key=?) OR
             EXISTS(SELECT 1 FROM game_diffs d WHERE d.layer='version' AND d.game_key=? AND
               (d.rev>=? OR (d.withdrawn_at IS NULL AND (d.source='official' OR NOT EXISTS
                 (SELECT 1 FROM ordinary_seed_jobs j WHERE j.game_key=d.game_key AND j.revision=d.rev AND j.state IN ('published','blocked')
                  AND json_extract(d.body,'$.signature.keyId') LIKE 'ordinary-%'))))) THEN 'superseded'
        ELSE 'published' END, scan=?,profile_hash=? WHERE id=? AND lease=? AND state='pending'
          AND (SELECT enabled FROM ordinary_publish_policy WHERE id=1)=1`)
        .bind(result.hash,result.hash,...block.args,doc.key,doc.key,doc.rev,result.receipt,result.hash,id,lease),
      db.prepare(`INSERT INTO game_diffs(layer,game_key,source,body,rev,updated_at)
        SELECT 'version',?,'auto',?,?,? FROM ordinary_seed_jobs WHERE id=? AND lease=? AND state='published'
        ON CONFLICT(layer,game_key,source) DO UPDATE SET body=excluded.body,rev=excluded.rev,updated_at=excluded.updated_at,withdrawn_at=NULL`)
        .bind(doc.key,body,doc.rev,time,id,lease),
      db.prepare('UPDATE ordinary_seed_jobs SET lease=NULL WHERE id=? AND lease=?').bind(id,lease)
    ]);
    if(stored.meta.changes)await wakeClients(env);
  } catch (error) {
    const reason=['scan configuration','scanner unavailable','unknown scan result','scan signature','invalid stored seed'].includes(error.message)?error.message:'processing unavailable';
    await db.prepare("UPDATE ordinary_seed_jobs SET lease=NULL,retry_at=?,retry_reason=? WHERE id=? AND lease=? AND state='pending'").bind(time+300,reason,id,lease).run();
  }
}
export async function retryJobs(env,now=new Date()) {
  if (!env.ORDINARY_SCAN_URL) return;
  const rows = await env.DB.prepare("SELECT id FROM ordinary_seed_jobs WHERE state='pending' AND retry_at<=? AND (SELECT enabled FROM ordinary_publish_policy WHERE id=1)=1 ORDER BY retry_at,id LIMIT 2").bind(Math.floor(now.getTime()/1000)).all();
  await Promise.all(rows.results.map(row=>processJob(env,row.id,now)));
}

async function scannerState(env){
  if(!env.ORDINARY_SCAN_URL||!env.ORDINARY_SCAN_TOKEN)return 'unconfigured';
  try{
    const url=new URL('health',env.ORDINARY_SCAN_URL);
    if(url.protocol!=='https:'||url.username||url.password)return 'unknown';
    const response=await fetch(url,{headers:{authorization:'Bearer '+env.ORDINARY_SCAN_TOKEN},redirect:'manual',signal:AbortSignal.timeout(4500)});
    if(!response.ok){await response.body?.cancel();return 'unknown';}
    const {value}=await boundedJSON(response,256);
    return ['online','offline','busy','unready'].includes(value?.scanner)?value.scanner:'unknown';
  }catch{return 'unknown';}
}
export async function ordinaryPolicyRoute(request,env,now,ctx,{json,fail,readJSON}){
  const db=env.DB;
  if(request.method==='POST'){
    const body=await readJSON(request,512),v=body.value;
    if(body.error||!v||typeof v.enabled!=='boolean'||!Number.isSafeInteger(v.revision)||v.revision<1||Object.keys(v).length!==2)return fail('INVALID_POLICY',400);
    const change=await db.prepare('UPDATE ordinary_publish_policy SET enabled=?, revision=revision+1, changed_at=? WHERE id=1 AND revision=? AND enabled<>?')
      .bind(+v.enabled,Math.floor(now.getTime()/1000),v.revision,+v.enabled).run();
    if(!change.meta.changes){
      const current=await db.prepare('SELECT enabled FROM ordinary_publish_policy WHERE id=1').first();
      if(current?.enabled!==+v.enabled)return fail('REVISION_CONFLICT',409);
    }else if(v.enabled&&ctx?.waitUntil)ctx.waitUntil(retryJobs(env,now));
    return json({ok:true});
  }
  if(request.method!=='GET')return fail('METHOD_NOT_ALLOWED',405);
  const time=Math.floor(now.getTime()/1000);
  const enhanced=await db.prepare(`SELECT count(*) AS pending,count(CASE WHEN lease IS NOT NULL AND available_at>? THEN 1 END) AS active,(SELECT seen_at FROM enhanced_seed_host WHERE id=1) AS lastSeen FROM enhanced_seed_jobs j JOIN seed_admin_items i ON i.id=j.id WHERE j.state='pending' AND i.state<>'deleted'`).bind(time).first();
  const [row,scanner]=await Promise.all([db.prepare(`SELECT enabled,revision,changed_at,
    (SELECT count(*) FROM ordinary_seed_jobs WHERE state='pending') AS pending,
    (SELECT count(*) FROM ordinary_seed_jobs WHERE state='pending' AND lease IS NOT NULL AND retry_at>?) AS scanning
    FROM ordinary_publish_policy WHERE id=1`).bind(Math.floor(now.getTime()/1000)).first(),scannerState(env)]);
  if(!row)return fail('NOT_CONFIGURED',503);
  return json({enabled:!!row.enabled,revision:row.revision,changedAt:row.changed_at,pendingSeeds:await pendingSeeds(db),pending:row.pending,scanning:row.scanning,scanner,enhanced:{...enhanced,host:enhanced.lastSeen!=null&&time-enhanced.lastSeen<=300?'online':'waiting'}});
}
