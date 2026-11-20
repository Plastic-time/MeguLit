// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-21 (owner: 每部游戏按 exe 哈希一份差分；官方差分优先，用户校准兜底；只是数据；签名只在我们本机) game diffs on the relay.
   The relay collects calibrations, picks the agreed best one per exe and hands out documents WE signed offline
   (tools/sign-profile.cjs, private key only on our PC): it holds no private key, so a breach of the relay cannot make a diff
   the app accepts. Free tier: a report is one D1 upsert (+ its rate-limit row, + one upsert when the pick changes); a read is
   one indexed SELECT, no write. Format and rules: docs/auto-profile.md; the document: core/game-diff.cjs; value domains:
   core/profiles/domains.cjs (the same files the app runs).

   Public (the app):
     POST /api/game-profile/report        {version:1,profile:{key,engine,exe,version,source,mode,settings,score:{cost,metrics},gate?}}
                                     key = the 64 hex SHA-256 of the game exe; settings reduced to the domain keys. A report from
                                     the self-check gate (source 'gate') also opens / bumps the exe's row in the repair queue.
     POST /api/game-profile/runtime       {version:1,key,identity?,sha256,data:<base64 gzip runtime bundle, services/runtime-sample.cjs>}
                                     the runtime sample of an exe whose full probe is already here (scripts and exe not sent again)
     GET  /api/game-profile/<exeHash>     {schema:'megulit.game-diff-feed',version:1,key,diff:<signed megulit.game-diff>}
                                     the official diff when there is one, else the signed agreed one; 404 NOT_FOUND otherwise
   Ours (Authorization: Bearer ADAPTER_ADMIN_TOKEN), used by tools/sign-profile.cjs:
     GET  /api/game-profile/picks                    the agreed picks not signed yet (unsigned megulit.game-diff documents)
     POST /api/game-profile/signed      {diff}       a signed document, official or auto (an auto one must be the current pick)
     POST /api/game-profile/withdraw    {key,source} off the feed
     GET  /api/game-profile/queue[?all=1]            the repair queue, newest first
     GET  /api/game-profile/runtime/list             the runtime bundles held [{key,identity,size,reporters,updatedAt}]
     GET  /api/game-profile/runtime/get?key=         one runtime bundle (gzip)
     POST /api/game-profile/queue/close {key}

   The pick ("按分数和一致性去重，只保留一份"): reports of the last KEEP_DAYS days, the same mode+settings from different reporters
   are one group. Read mode wins when more than half of the reporters ended in read mode and at least AGREE did; otherwise the
   hide group with the lowest mean cost among the groups of at least AGREE reporters. A single report is never picked. */
import gameDiff from '../../core/game-diff.cjs';
import domains from '../../core/profiles/domains.cjs';
const {canonical,validate,build,unsigned,KEY}=gameDiff;
export const PROFILE_LIMITS={body:16*1024,signed:32*1024,runtime:3*1024*1024,agree:2,keepDays:180,reportsPerKey:50,queue:200,picks:200};
const SEMVER=/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const METRICS=['hideVisible','dropRate','repeatRate','choiceMismatch','positionPx','pairRate'];
const encoder=new TextEncoder();
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
async function sha256(s){return hex(await crypto.subtle.digest('SHA-256',encoder.encode(s)));}
const num=(v,lo,hi)=>{const n=Number(v);return Number.isFinite(n)?Math.max(lo,Math.min(hi,n)):null;};
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
function same(a,b){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}
const ours=(request,env)=>!!env.ADAPTER_ADMIN_TOKEN&&same(request.headers.get('authorization')||'','Bearer '+env.ADAPTER_ADMIN_TOKEN);
const SIGNED=s=>s&&s.alg==='ed25519'&&/^[A-Za-z0-9_-]{1,20}$/.test(String(s.keyId||''))&&/^[A-Za-z0-9+/=]{40,200}$/.test(String(s.value||''));

export const cleanSettings=s=>domains.clean(s).value;
export function validateReport(body){const p=body?.profile;if(body?.version!==1||!plain(p))return {ok:false,error:'INVALID_REPORT'};
 const key=String(p.key||'');if(!KEY.test(key))return {ok:false,error:'INVALID_KEY'};
 const mode=p.mode;if(mode!=='hide'&&mode!=='read')return {ok:false,error:'INVALID_MODE'};
 const settings=cleanSettings(p.settings);if(mode==='read')settings.hide={...(settings.hide||{}),textEffectsRead:true};
 const metrics={};const m=p.score?.metrics;if(plain(m))for(const k of METRICS){const v=m[k];metrics[k]=v===null||v===undefined?null:num(v,-1,1e6);}
 const over=Array.isArray(p.gate?.over)?p.gate.over.filter(x=>METRICS.includes(x)):[];
 return {ok:true,value:{key,mode,settings,source:p.source==='gate'?'gate':'calibration',cost:num(p.score?.cost,0,1e6)??0,metrics,over,
  engine:String(p.engine||'').toLowerCase().replace(/[^a-z0-9-]/g,'').slice(0,32),exe:String(p.exe||'').toLowerCase().replace(/[\\/:*?"<>|]/g,'').slice(0,80),app:SEMVER.test(String(p.version||''))?String(p.version):''}};}

/* the agreed best result of one exe from its report rows, or null */
export function pick(rows,{agree=PROFILE_LIMITS.agree}={}){if(!rows.length)return null;const groups=new Map();
 for(const r of rows){let g=groups.get(r.settings_hash);if(!g){g={hash:r.settings_hash,mode:r.mode,settings:r.settings,n:0,cost:0,at:0,engine:r.engine||'',exe:r.exe||''};groups.set(r.settings_hash,g);}g.n++;g.cost+=Number(r.cost)||0;g.at=Math.max(g.at,Number(r.updated_at)||0);}
 const all=[...groups.values()].map(g=>({...g,cost:g.cost/g.n})),total=rows.length,readN=rows.filter(r=>r.mode==='read').length;
 const out=g=>{let settings={};try{settings=JSON.parse(g.settings);}catch{}return {hash:g.hash,mode:g.mode,settings,agree:g.n,reporters:total,cost:Math.round(g.cost*1000)/1000,at:g.at,engine:g.engine,exe:g.exe};};
 if(readN*2>total&&readN>=agree){const g=all.filter(x=>x.mode==='read').sort((a,b)=>b.n-a.n||b.at-a.at)[0];return {...out(g),agree:readN};}
 const hide=all.filter(g=>g.mode==='hide'&&g.n>=agree).sort((a,b)=>a.cost-b.cost||b.n-a.n||b.at-a.at);return hide[0]?out(hide[0]):null;}
/* what of a document the signature vouches for, minus the bookkeeping that may change between pick and signing */
const essence=d=>canonical({key:d.key,source:d.source,mode:d.mode,settings:d.settings});

/* recompute the exe's pick; the unsigned document waits for our signing tool when it changed */
async function settle(env,key,now){const since=Math.floor(now.getTime()/1000)-PROFILE_LIMITS.keepDays*86400;
 const rows=(await env.DB.prepare('SELECT settings_hash,settings,mode,cost,engine,exe,updated_at FROM auto_profile_reports WHERE game_key=? AND updated_at>=? ORDER BY updated_at DESC LIMIT 500').bind(key,since).all()).results||[];
 const p=pick(rows);
 if(!p){await env.DB.prepare('DELETE FROM auto_profile_picks WHERE game_key=?').bind(key).run();return null;}
 const doc=build({key,source:'auto',mode:p.mode,settings:p.settings,exe:p.exe,engine:p.engine,issuedAt:now.toISOString(),agree:p.agree,reporters:p.reporters,cost:p.cost});
 const stamp=await sha256(essence(doc));
 await env.DB.prepare('INSERT INTO auto_profile_picks(game_key,stamp,body,updated_at) VALUES(?,?,?,?) ON CONFLICT(game_key) DO UPDATE SET stamp=excluded.stamp,body=excluded.body,updated_at=excluded.updated_at').bind(key,stamp,JSON.stringify(doc),Math.floor(now.getTime()/1000)).run();
 return p;}

async function report(request,env,ip,now,{json,fail,readJSON}){
 const body=await readJSON(request,PROFILE_LIMITS.body);if(body.error)return fail(body.error,body.error==='PAYLOAD_TOO_LARGE'?413:400);
 const v=validateReport(body.value);if(!v.ok)return fail(v.error);const r=v.value,t=Math.floor(now.getTime()/1000),hash=(await sha256(r.mode+'|'+canonical(r.settings))).slice(0,32);
 await env.DB.prepare('INSERT INTO auto_profile_reports(game_key,reporter,settings_hash,settings,mode,source,cost,metrics,engine,exe,app,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(game_key,reporter) DO UPDATE SET settings_hash=excluded.settings_hash,settings=excluded.settings,mode=excluded.mode,source=excluded.source,cost=excluded.cost,metrics=excluded.metrics,engine=excluded.engine,exe=excluded.exe,app=excluded.app,updated_at=excluded.updated_at')
  .bind(r.key,ip,hash,canonical(r.settings),r.mode,r.source,r.cost,JSON.stringify(r.metrics),r.engine,r.exe,r.app,t).run();
 /* one exe keeps its newest reports only */
 await env.DB.prepare('DELETE FROM auto_profile_reports WHERE game_key=? AND reporter NOT IN (SELECT reporter FROM auto_profile_reports WHERE game_key=? ORDER BY updated_at DESC LIMIT ?)').bind(r.key,r.key,PROFILE_LIMITS.reportsPerKey).run();
 if(r.source==='gate')await env.DB.prepare("INSERT INTO auto_profile_queue(game_key,exe,engine,reasons,reporters,app,first_at,last_at) VALUES(?,?,?,?,1,?,?,?) ON CONFLICT(game_key) DO UPDATE SET exe=excluded.exe,engine=excluded.engine,reasons=excluded.reasons,reporters=auto_profile_queue.reporters+1,app=excluded.app,last_at=excluded.last_at,closed_at=NULL")
  .bind(r.key,r.exe,r.engine,JSON.stringify(r.over),r.app,t,t).run();
 await settle(env,r.key,now);
 return json({ok:true,queued:r.source==='gate'},201);}
async function get(env,key,{json,fail}){
 const rows=(await env.DB.prepare('SELECT source,body FROM game_diffs WHERE game_key=? AND withdrawn_at IS NULL').bind(key).all()).results||[];
 const row=rows.find(r=>r.source==='official')||rows.find(r=>r.source==='auto');if(!row)return fail('NOT_FOUND',404,{'cache-control':'public, max-age=900'});
 let diff;try{diff=JSON.parse(row.body);}catch{return fail('NOT_FOUND',404);}
 return json({schema:'megulit.game-diff-feed',version:1,key,diff},200,{'cache-control':'public, max-age=3600'});}
async function picksGet(env,{json}){
 const rows=(await env.DB.prepare('SELECT body FROM auto_profile_picks WHERE stamp<>signed_stamp ORDER BY updated_at DESC LIMIT ?').bind(PROFILE_LIMITS.picks).all()).results||[];
 return json({picks:rows.map(r=>{try{return JSON.parse(r.body);}catch{return null;}}).filter(Boolean)});}
async function signedPost(request,env,now,{json,fail,readJSON}){const body=await readJSON(request,PROFILE_LIMITS.signed);if(body.error)return fail(body.error,400);const d=body.value?.diff;
 const v=validate(d);if(!v.ok)return fail('INVALID_DIFF_'+v.error);if(!SIGNED(d.signature))return fail('UNSIGNED');const t=Math.floor(now.getTime()/1000);
 if(d.source==='auto'){/* an auto document must be the pick as it stands (a newer pick waits for the next signing run) */
  const p=await env.DB.prepare('SELECT stamp FROM auto_profile_picks WHERE game_key=?').bind(d.key).first();const stamp=await sha256(essence(d));
  if(!p||p.stamp!==stamp)return fail('NOT_THE_CURRENT_PICK',409);
  await env.DB.prepare('UPDATE auto_profile_picks SET signed_stamp=stamp WHERE game_key=?').bind(d.key).run();}
 await env.DB.prepare("INSERT INTO game_diffs(game_key,source,body,settings_hash,updated_at) VALUES(?,?,?,'',?) ON CONFLICT(game_key,source) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at,withdrawn_at=NULL").bind(d.key,d.source,JSON.stringify(d),t).run();
 if(d.source==='official')await env.DB.prepare('UPDATE auto_profile_queue SET closed_at=? WHERE game_key=? AND closed_at IS NULL').bind(t,d.key).run();
 return json({ok:true,key:d.key,source:d.source},201);}
async function withdraw(request,env,now,{json,fail,readJSON}){const body=await readJSON(request,4096);const key=String(body.value?.key||''),source=body.value?.source==='auto'?'auto':'official';if(!KEY.test(key))return fail('INVALID_KEY');
 await env.DB.prepare('UPDATE game_diffs SET withdrawn_at=? WHERE game_key=? AND source=?').bind(Math.floor(now.getTime()/1000),key,source).run();return json({ok:true});}
async function queueGet(env,url,{json}){const all=url.searchParams.get('all')==='1';
 const rows=(await env.DB.prepare('SELECT game_key,exe,engine,reasons,reporters,app,first_at,last_at,closed_at FROM auto_profile_queue'+(all?'':' WHERE closed_at IS NULL')+' ORDER BY last_at DESC LIMIT ?').bind(PROFILE_LIMITS.queue).all()).results||[];
 return json({queue:rows.map(r=>{let reasons=[];try{reasons=JSON.parse(r.reasons);}catch{}return {key:r.game_key,exe:r.exe,engine:r.engine,reasons,reporters:r.reporters,app:r.app,firstAt:r.first_at,lastAt:r.last_at,closedAt:r.closed_at||null};})});}
async function queueClose(request,env,now,{json,fail,readJSON}){const body=await readJSON(request,4096);const key=String(body.value?.key||'');if(!KEY.test(key))return fail('INVALID_KEY');
 await env.DB.prepare('UPDATE auto_profile_queue SET closed_at=? WHERE game_key=?').bind(Math.floor(now.getTime()/1000),key).run();return json({ok:true});}

async function runtimePost(request,env,ip,now,{json,fail,readJSON}){const body=await readJSON(request,Math.ceil(PROFILE_LIMITS.runtime*4/3)+4096);if(body.error)return fail(body.error,body.error==='PAYLOAD_TOO_LARGE'?413:400);const v=body.value||{};
 if(v.version!==1||!KEY.test(String(v.key||''))||!/^[0-9a-f]{64}$/.test(String(v.sha256||''))||typeof v.data!=='string'||v.identity!==undefined&&!/^[0-9a-f]{64}$/.test(String(v.identity)))return fail('INVALID_RUNTIME');
 let bytes;try{const bin=atob(v.data);bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);}catch{return fail('INVALID_RUNTIME');}
 if(bytes.length>PROFILE_LIMITS.runtime||bytes.length<20||bytes[0]!==0x1f||bytes[1]!==0x8b)return fail('INVALID_RUNTIME');if(hex(await crypto.subtle.digest('SHA-256',bytes))!==v.sha256)return fail('SHA256_MISMATCH');
 const old=await env.DB.prepare('SELECT sha256 FROM profile_runtime WHERE game_key=?').bind(v.key).first();const t=Math.floor(now.getTime()/1000);
 if(old?.sha256===v.sha256){await env.DB.prepare('UPDATE profile_runtime SET reporters=reporters+1 WHERE game_key=?').bind(v.key).run();return json({ok:true,duplicate:true});}
 await env.BUCKET.put('profile-runtime/'+v.key+'.json.gz',bytes);
 await env.DB.prepare('INSERT INTO profile_runtime(game_key,identity,sha256,size,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(game_key) DO UPDATE SET identity=excluded.identity,sha256=excluded.sha256,size=excluded.size,reporters=profile_runtime.reporters+1,updated_at=excluded.updated_at').bind(v.key,v.identity||'',v.sha256,bytes.length,t).run();
 return json({ok:true},201);}
async function runtimeList(env,url,{json}){const rows=(await env.DB.prepare('SELECT game_key,identity,size,reporters,updated_at FROM profile_runtime ORDER BY updated_at DESC LIMIT 500').all()).results||[];return json({runtime:rows.map(r=>({key:r.game_key,identity:r.identity,size:r.size,reporters:r.reporters,updatedAt:r.updated_at}))});}
async function runtimeGet(env,url,{fail}){const key=String(url.searchParams.get('key')||'');if(!KEY.test(key))return fail('INVALID_KEY');const o=await env.BUCKET.get('profile-runtime/'+key+'.json.gz');if(!o)return fail('NOT_FOUND',404);
 return new Response(o.body,{headers:{'content-type':'application/gzip','content-disposition':'attachment; filename="megulit-runtime-'+key.slice(0,16)+'.json.gz"','cache-control':'private, no-store'}});}
const OURS={'/api/game-profile/runtime/list':['GET',runtimeList],'/api/game-profile/runtime/get':['GET',runtimeGet],'/api/game-profile/picks':['GET',picksGet],'/api/game-profile/signed':['POST',signedPost],'/api/game-profile/withdraw':['POST',withdraw],'/api/game-profile/queue':['GET',queueGet],'/api/game-profile/queue/close':['POST',queueClose]};
/* router; null when the path is not one of these */
export async function profileRoute(request,env,ip,now,url,path,deps){const {fail,hit}=deps,m=request.method;
 if(path==='/api/game-profile/report')return m==='POST'?(await hit(env,'autoprof-report',ip,now.getTime())?report(request,env,ip,now,deps):fail('RATE_LIMITED',429)):fail('METHOD_NOT_ALLOWED',405);
 const o=OURS[path];if(o){if(!ours(request,env))return fail('UNAUTHORIZED',401);if(m!==o[0])return fail('METHOD_NOT_ALLOWED',405);
  return o[1]===picksGet?picksGet(env,deps):[queueGet,runtimeList,runtimeGet].includes(o[1])?o[1](env,url,deps):o[1](request,env,now,deps);}
 if(path==='/api/game-profile/runtime')return m==='POST'?(await hit(env,'profile-runtime',ip,now.getTime())?runtimePost(request,env,ip,now,deps):fail('RATE_LIMITED',429)):fail('METHOD_NOT_ALLOWED',405);
 const g=/^\/api\/game-profile\/([0-9a-f]{64})$/.exec(path);
 /* no rate-limit row on reads (D1 write budget): the global per-IP limiter covers them */
 if(g)return m==='GET'?get(env,g[1],deps):fail('METHOD_NOT_ALLOWED',405);
 return null;}
export {unsigned};
