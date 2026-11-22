// SPDX-License-Identifier: GPL-3.0-or-later
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
export async function enqueue(db, data, now) {
  const id = await protocol.hash(data), body = diff.canonical(data);
  await db.prepare(`INSERT INTO ordinary_seed_jobs(id,game_key,candidate,issued_at,revision)
    SELECT ?,?,?,?,1+max(coalesce((SELECT max(revision) FROM ordinary_seed_jobs WHERE game_key=?),0),
      coalesce((SELECT max(rev) FROM game_diffs WHERE layer='version' AND game_key=?),0),
      coalesce((SELECT rev FROM auto_profile_picks WHERE layer='version' AND game_key=?),0))
    WHERE true ON CONFLICT(id) DO NOTHING`).bind(id,data.key,body,now.toISOString(),data.key,data.key,data.key).run();
  return status(db,id);
}
export const status = (db,id) => db.prepare('SELECT id,state,revision,retry_reason AS retryReason FROM ordinary_seed_jobs WHERE id=?').bind(id).first();

async function scan(env, doc) {
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
    WHERE id=? AND state='pending' AND retry_at<=? RETURNING *`).bind(lease,time+120,id,time).first();
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
        WHEN EXISTS(SELECT 1 FROM torch_release_revocations WHERE profile_hash=?) OR
             EXISTS(SELECT 1 FROM seed_malware_current WHERE profile_hash=? AND state='infected') OR
             EXISTS(SELECT 1 FROM seed_admin_items WHERE ${block.sql}) THEN 'blocked'
        WHEN EXISTS(SELECT 1 FROM torch_release_winners WHERE game_key=?) OR
             EXISTS(SELECT 1 FROM game_diffs d WHERE d.layer='version' AND d.game_key=? AND
               (d.rev>=? OR (d.withdrawn_at IS NULL AND (d.source='official' OR NOT EXISTS
                 (SELECT 1 FROM ordinary_seed_jobs j WHERE j.game_key=d.game_key AND j.revision=d.rev AND j.state IN ('published','blocked')
                  AND json_extract(d.body,'$.signature.keyId') LIKE 'ordinary-%'))))) THEN 'superseded'
        ELSE 'published' END, scan=?,profile_hash=? WHERE id=? AND lease=? AND state='pending'`)
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
  const rows = await env.DB.prepare("SELECT id FROM ordinary_seed_jobs WHERE state='pending' AND retry_at<=? ORDER BY retry_at,id LIMIT 2").bind(Math.floor(now.getTime()/1000)).all();
  await Promise.all(rows.results.map(row=>processJob(env,row.id,now)));
}
