// SPDX-License-Identifier: GPL-3.0-or-later
/* E377 MeguLit relay — one Cloudflare Worker (D1 + R2) for diagnostics upload, shared adaptation records and the
   opt-in leaderboard. Deploy steps: relay/README.md. Bindings: DB (D1), BUCKET (R2). Secrets: GITHUB_TOKEN,
   LINK_SECRET (HMAC key for download links), optional HASH_SALT and DIAG_TOKEN. Vars: GITHUB_REPO, LINK_DAYS,
   ALLOWED_ORIGINS. Nothing here trusts the client: every body is size-capped and validated (validate.js). */
import {LIMITS,validateLeaderboard,validateBoardQuery,validateAdaptationRecord,validateKeys,validateMeta,issueBody,INSTALL_ID,HEX64} from './validate.js';

/* requests per window; key prefix → [limit, seconds] */
export const RATE={ip:[120,60],'lb-post':[6,600],'lb-id':[20,3600],'lb-get':[60,60],'adapt-post':[30,3600],'adapt-get':[120,3600],diag:[5,3600],'diag-dl':[30,3600]};
const encoder=new TextEncoder();
const hex=buffer=>[...new Uint8Array(buffer)].map(b=>b.toString(16).padStart(2,'0')).join('');
export async function sha256(value){return hex(await crypto.subtle.digest('SHA-256',typeof value==='string'?encoder.encode(value):value));}
async function hmac(secret,value){const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',key,encoder.encode(value)));}
function sameText(a,b){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}

/* ---- responses / CORS ------------------------------------------------------------------------------------------ */
/* The desktop app calls from its Node service, which sends no Origin, so no CORS is needed for it. A browser origin is
   allowed only when listed in ALLOWED_ORIGINS (comma separated, e.g. a future web view). */
function corsHeaders(request,env){
 const origin=request.headers.get('origin');if(!origin)return {};
 const allowed=String(env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
 return allowed.includes(origin)?{'access-control-allow-origin':origin,'access-control-allow-methods':'GET,POST,DELETE','access-control-allow-headers':'content-type,authorization','access-control-max-age':'86400',vary:'origin'}:{};
}
function json(data,status=200,extra={}){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...extra}});}
const fail=(error,status=400,extra)=>json({ok:false,error},status,extra);

/* ---- rate limiting (fixed windows in D1) ----------------------------------------------------------------------- */
export async function hit(env,kind,subject,now=Date.now()){
 const [limit,seconds]=RATE[kind],windowStart=Math.floor(now/1000/seconds)*seconds,bucket=`${kind}:${subject}:${windowStart}`;
 const row=await env.DB.prepare('INSERT INTO rate_limits(bucket,count,reset_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(bucket,windowStart+seconds).first();
 if(Math.random()<.02)await env.DB.prepare('DELETE FROM rate_limits WHERE reset_at<?').bind(Math.floor(now/1000)).run();
 return (row?.count??1)<=limit;
}
async function clientKey(request,env){return (await sha256((env.HASH_SALT||'megulit-relay')+':'+(request.headers.get('cf-connecting-ip')||'unknown'))).slice(0,32);}
async function readJSON(request,max=LIMITS.body){
 const length=Number(request.headers.get('content-length')||0);if(length>max)return {error:'PAYLOAD_TOO_LARGE'};
 const text=await request.text();if(text.length>max)return {error:'PAYLOAD_TOO_LARGE'};
 try{return {value:JSON.parse(text)};}catch{return {error:'INVALID_JSON'};}
}

/* ---- leaderboard ----------------------------------------------------------------------------------------------- */
const COLUMN={characters:'characters',seconds:'seconds',words:'words',streak:'streak'};
export async function leaderboardPost(request,env,ip,now=new Date()){
 if(!await hit(env,'lb-post',ip,now.getTime()))return fail('RATE_LIMITED',429);
 const body=await readJSON(request);if(body.error)return fail(body.error,body.error==='PAYLOAD_TOO_LARGE'?413:400);
 const checked=validateLeaderboard(body.value,now);if(!checked.ok)return fail(checked.error);
 const {id,name,keys,stats,games}=checked.value,idHash=await sha256(id),t=Math.floor(now.getTime()/1000);
 if(!await hit(env,'lb-id',idHash,now.getTime()))return fail('RATE_LIMITED',429);
 const statements=[env.DB.prepare('INSERT INTO leaderboard_users(id_hash,name,share_games,created_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id_hash) DO UPDATE SET name=excluded.name,share_games=excluded.share_games,updated_at=excluded.updated_at').bind(idHash,name,games?1:0,t,t)];
 for(const period of ['week','month','all']){const s=stats[period];statements.push(env.DB.prepare('INSERT INTO leaderboard_stats(id_hash,period,period_key,characters,seconds,words,streak,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id_hash,period,period_key) DO UPDATE SET characters=excluded.characters,seconds=excluded.seconds,words=excluded.words,streak=excluded.streak,updated_at=excluded.updated_at').bind(idHash,period,keys[period],s.characters,s.seconds,s.words,s.streak,t));}
 statements.push(env.DB.prepare('DELETE FROM leaderboard_games WHERE id_hash=?').bind(idHash));
 for(const g of games||[])statements.push(env.DB.prepare('INSERT INTO leaderboard_games(id_hash,game_key,title,characters,seconds,updated_at) VALUES(?,?,?,?,?,?)').bind(idHash,g.key,g.title,g.characters,g.seconds,t));
 await env.DB.batch(statements);
 return json({ok:true});
}
export async function leaderboardGet(url,env,ip,now=new Date()){
 if(!await hit(env,'lb-get',ip,now.getTime()))return fail('RATE_LIMITED',429);
 const checked=validateBoardQuery(url.searchParams,now);if(!checked.ok)return fail(checked.error);const q=checked.value;
 if(q.metric==='games'&&q.game===null){
  const {results}=await env.DB.prepare(`SELECT g.game_key,MAX(g.title) title,COUNT(*) readers,
    (SELECT u.name FROM leaderboard_games t JOIN leaderboard_users u ON u.id_hash=t.id_hash WHERE t.game_key=g.game_key ORDER BY t.characters DESC LIMIT 1) top_name,
    MAX(g.characters) top_value FROM leaderboard_games g GROUP BY g.game_key ORDER BY readers DESC,top_value DESC LIMIT 100`).all();
  return json({games:results.map(r=>({title:r.title,readers:r.readers,top:r.top_name?{rank:1,name:r.top_name,value:r.top_value}:null}))});
 }
 let rows,total,mine=null;
 if(q.metric==='games'){
  ({results:rows}=await env.DB.prepare('SELECT g.id_hash,u.name,g.characters value FROM leaderboard_games g JOIN leaderboard_users u ON u.id_hash=g.id_hash WHERE g.game_key=? AND g.characters>0 ORDER BY g.characters DESC,g.updated_at ASC LIMIT 50').bind(q.game).all());
  total=(await env.DB.prepare('SELECT COUNT(*) n FROM leaderboard_games WHERE game_key=? AND characters>0').bind(q.game).first())?.n||0;
  if(q.me){const r=await env.DB.prepare('SELECT characters value FROM leaderboard_games WHERE game_key=? AND id_hash=?').bind(q.game,q.me).first();if(r&&r.value>0)mine={value:r.value,rank:1+((await env.DB.prepare('SELECT COUNT(*) n FROM leaderboard_games WHERE game_key=? AND characters>?').bind(q.game,r.value).first())?.n||0)};}
 }else{
  const col=COLUMN[q.metric];
  ({results:rows}=await env.DB.prepare(`SELECT s.id_hash,u.name,s.${col} value FROM leaderboard_stats s JOIN leaderboard_users u ON u.id_hash=s.id_hash WHERE s.period=? AND s.period_key=? AND s.${col}>0 ORDER BY s.${col} DESC,s.updated_at ASC LIMIT 50`).bind(q.period,q.key).all());
  total=(await env.DB.prepare(`SELECT COUNT(*) n FROM leaderboard_stats WHERE period=? AND period_key=? AND ${col}>0`).bind(q.period,q.key).first())?.n||0;
  if(q.me){const r=await env.DB.prepare(`SELECT ${col} value FROM leaderboard_stats WHERE period=? AND period_key=? AND id_hash=?`).bind(q.period,q.key,q.me).first();if(r&&r.value>0)mine={value:r.value,rank:1+((await env.DB.prepare(`SELECT COUNT(*) n FROM leaderboard_stats WHERE period=? AND period_key=? AND ${col}>?`).bind(q.period,q.key,r.value).first())?.n||0)};}
 }
 /* rank = 1 + number of strictly better values, so ties share a rank; id hashes never leave the server */
 let rank=0,prev=null;const entries=rows.map((r,i)=>{if(r.value!==prev){rank=i+1;prev=r.value;}return {rank,name:r.name,value:r.value,me:!!q.me&&r.id_hash===q.me};});
 return json({entries,total,me:mine});
}
export async function leaderboardDelete(url,env,ip,now=new Date()){
 if(!await hit(env,'lb-post',ip,now.getTime()))return fail('RATE_LIMITED',429);
 const id=url.searchParams.get('id')||'';if(!INSTALL_ID.test(id))return fail('INVALID_ID');
 const idHash=await sha256(id);
 await env.DB.batch(['leaderboard_stats','leaderboard_games','leaderboard_users'].map(table=>env.DB.prepare(`DELETE FROM ${table} WHERE id_hash=?`).bind(idHash)));
 return json({ok:true});
}

/* ---- shared adaptation ----------------------------------------------------------------------------------------- */
export async function adaptationPost(request,env,ip,now=new Date()){
 if(!await hit(env,'adapt-post',ip,now.getTime()))return fail('RATE_LIMITED',429);
 const body=await readJSON(request,LIMITS.adaptationRecords*LIMITS.adaptationRecord+1024);if(body.error)return fail(body.error,body.error==='PAYLOAD_TOO_LARGE'?413:400);
 const records=body.value?.records;if(!Array.isArray(records)||records.length>LIMITS.adaptationRecords)return fail('INVALID_RECORDS');
 const t=Math.floor(now.getTime()/1000),statements=[];let rejected=0;
 for(const record of records){const ok=validateAdaptationRecord(record);if(!ok){rejected++;continue;}
  statements.push(env.DB.prepare('INSERT INTO adaptation_records(key,record,submitter,reports,updated_at) VALUES(?,?,?,1,?) ON CONFLICT(key) DO UPDATE SET record=excluded.record,submitter=excluded.submitter,reports=reports+1,updated_at=excluded.updated_at').bind(ok.key,ok.json,ip,t));}
 if(statements.length)await env.DB.batch(statements);
 return json({ok:true,accepted:statements.length,rejected});
}
async function adaptationLookup(keys,env){
 if(!keys.length)return json({records:[]});
 const {results}=await env.DB.prepare(`SELECT record FROM adaptation_records WHERE key IN (${keys.map(()=>'?').join(',')})`).bind(...keys).all();
 return json({records:results.map(r=>{try{return JSON.parse(r.record);}catch{return null;}}).filter(Boolean)});
}
export async function adaptationGet(url,env,ip,now=new Date()){
 if(!await hit(env,'adapt-get',ip,now.getTime()))return fail('RATE_LIMITED',429);
 const keys=validateKeys(String(url.searchParams.get('fp')||'').split(',').filter(Boolean));if(!keys)return fail('INVALID_QUERY');
 return adaptationLookup(keys,env);
}
export async function adaptationQuery(request,env,ip,now=new Date()){
 if(!await hit(env,'adapt-get',ip,now.getTime()))return fail('RATE_LIMITED',429);
 const body=await readJSON(request,8*1024);if(body.error)return fail(body.error,body.error==='PAYLOAD_TOO_LARGE'?413:400);
 const keys=validateKeys(body.value?.keys);if(!keys)return fail('INVALID_QUERY');return adaptationLookup(keys,env);
}

/* ---- diagnostics ----------------------------------------------------------------------------------------------- */
export async function diagnosticsPost(request,env,ip,url,now=new Date()){
 if(env.DIAG_TOKEN&&!sameText(request.headers.get('authorization')||'','Bearer '+env.DIAG_TOKEN))return fail('UNAUTHORIZED',401);
 if(!await hit(env,'diag',ip,now.getTime()))return fail('RATE_LIMITED',429);
 if(Number(request.headers.get('content-length')||0)>LIMITS.zip+LIMITS.meta+64*1024)return fail('PAYLOAD_TOO_LARGE',413);
 if(!/^multipart\/form-data/i.test(request.headers.get('content-type')||''))return fail('INVALID_BODY');
 let form;try{form=await request.formData();}catch{return fail('INVALID_BODY');}
 const metaPart=form.get('meta'),file=form.get('package')||form.get('file');
 const metaText=typeof metaPart==='string'?metaPart:metaPart&&typeof metaPart.text==='function'?await metaPart.text():'';
 if(!metaText||metaText.length>LIMITS.meta)return fail('INVALID_META');
 let metaValue;try{metaValue=JSON.parse(metaText);}catch{return fail('INVALID_META');}
 const meta=validateMeta(metaValue);if(!meta.ok)return fail(meta.error);
 if(!file||typeof file.arrayBuffer!=='function')return fail('PACKAGE_REQUIRED');
 if(file.size>LIMITS.zip)return fail('PAYLOAD_TOO_LARGE',413);
 const bytes=new Uint8Array(await file.arrayBuffer());
 if(bytes.length<22||bytes[0]!==0x50||bytes[1]!==0x4b)return fail('NOT_A_ZIP');
 const digest=await sha256(bytes);if(meta.value.sha256&&meta.value.sha256!==digest)return fail('CHECKSUM_MISMATCH');
 const id=crypto.randomUUID(),stamp=now.toISOString().slice(0,7),objectKey=`diagnostics/${stamp}/${id}.zip`;
 await env.BUCKET.put(objectKey,bytes,{httpMetadata:{contentType:'application/zip'},customMetadata:{version:meta.value.version,sha256:digest}});
 const days=Math.max(1,Math.min(90,Number(env.LINK_DAYS)||30)),expires=Math.floor(now.getTime()/1000)+days*86400;
 const link=env.LINK_SECRET?`${url.origin}/api/diagnostics/download/${id}?exp=${expires}&sig=${await hmac(env.LINK_SECRET,id+':'+expires)}`:'(LINK_SECRET not set — ask the maintainer)';
 const summary={...meta.value,size:bytes.length,sha256:digest};
 let issueUrl='';
 if(env.GITHUB_TOKEN){
  const repo=/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPO||'')?env.GITHUB_REPO:'ilynthn/MeguLit';
  const title=`[诊断] ${summary.game.title||'未知游戏'} · v${summary.version||'?'}`.slice(0,200);
  const r=await (env.fetch||fetch)(`https://api.github.com/repos/${repo}/issues`,{method:'POST',headers:{authorization:'Bearer '+env.GITHUB_TOKEN,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28','user-agent':'megulit-relay','content-type':'application/json'},body:JSON.stringify({title,body:issueBody(summary,link,days),labels:['diagnostics']})});
  if(r.ok){const data=await r.json().catch(()=>({}));issueUrl=typeof data.html_url==='string'?data.html_url:'';}
 }
 await env.DB.prepare('INSERT INTO diagnostics(id,object_key,issue_url,ip_hash,size,sha256,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,objectKey,issueUrl,ip,bytes.length,digest,Math.floor(now.getTime()/1000),expires).run();
 return json({ok:true,id,issueUrl},201);
}
export async function diagnosticsDownload(url,env,ip,now=new Date()){
 if(!await hit(env,'diag-dl',ip,now.getTime()))return fail('RATE_LIMITED',429);
 const id=url.pathname.split('/').pop()||'',exp=Number(url.searchParams.get('exp')),sig=url.searchParams.get('sig')||'';
 if(!/^[0-9a-f-]{36}$/.test(id)||!Number.isSafeInteger(exp)||!HEX64.test(sig)||!env.LINK_SECRET)return fail('NOT_FOUND',404);
 if(!sameText(sig,await hmac(env.LINK_SECRET,id+':'+exp)))return fail('NOT_FOUND',404);
 if(exp<Math.floor(now.getTime()/1000))return fail('LINK_EXPIRED',410);
 const row=await env.DB.prepare('SELECT object_key FROM diagnostics WHERE id=?').bind(id).first();if(!row)return fail('NOT_FOUND',404);
 const object=await env.BUCKET.get(row.object_key);if(!object)return fail('NOT_FOUND',404);
 return new Response(object.body,{headers:{'content-type':'application/zip','content-disposition':`attachment; filename="megulit-diagnostics-${id}.zip"`,'cache-control':'private, no-store'}});
}

/* ---- router ---------------------------------------------------------------------------------------------------- */
export async function handle(request,env,now=new Date()){
 const url=new URL(request.url),cors=corsHeaders(request,env),path=url.pathname.replace(/\/+$/,'')||'/';
 if(request.method==='OPTIONS')return new Response(null,{status:Object.keys(cors).length?204:403,headers:cors});
 const ip=await clientKey(request,env);
 let response;
 try{
  if(!await hit(env,'ip',ip,now.getTime()))response=fail('RATE_LIMITED',429);
  else if(path==='/api/health'&&request.method==='GET')response=json({ok:true,service:'megulit-relay'});
  else if(path==='/api/leaderboard')response=request.method==='POST'?await leaderboardPost(request,env,ip,now):request.method==='GET'?await leaderboardGet(url,env,ip,now):request.method==='DELETE'?await leaderboardDelete(url,env,ip,now):fail('METHOD_NOT_ALLOWED',405);
  else if(path==='/api/adaptation')response=request.method==='POST'?await adaptationPost(request,env,ip,now):request.method==='GET'?await adaptationGet(url,env,ip,now):fail('METHOD_NOT_ALLOWED',405);
  else if(path==='/api/adaptation/query')response=request.method==='POST'?await adaptationQuery(request,env,ip,now):fail('METHOD_NOT_ALLOWED',405);
  else if(path==='/api/diagnostics')response=request.method==='POST'?await diagnosticsPost(request,env,ip,url,now):fail('METHOD_NOT_ALLOWED',405);
  else if(path.startsWith('/api/diagnostics/download/')&&request.method==='GET')response=await diagnosticsDownload(url,env,ip,now);
  else response=fail('NOT_FOUND',404);
 }catch(error){console.error('relay error',error?.message);response=fail('SERVER_ERROR',500);}
 for(const[k,v]of Object.entries(cors))response.headers.set(k,v);
 return response;
}
export default {fetch:(request,env)=>handle(request,env)};
