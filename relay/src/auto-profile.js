// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-21 (owner: 每部游戏都有自己的差分，按 exe 哈希；官方差分优先，自动校准兜底；只是数据、签名下发) game diffs on the relay.
   Free tier: a report is one D1 upsert (+ its rate-limit row, + one more upsert when the agreed result changes); a read is one
   indexed SELECT, no write. Format and rules: docs/auto-profile.md; the document: core/game-diff.cjs; value domains:
   core/profiles/domains.cjs (the same files the app runs).

   Public (the app):
     POST /api/auto-profile/report   {version:1,profile:{key,engine,exe,version,source,mode,settings,score:{cost,metrics},gate?}}
                                     key = 'x-' + the exe SHA-256 (64 hex); settings reduced to the domain keys. A report from
                                     the self-check gate (source 'gate') also opens / bumps the exe's row in the repair queue.
     GET  /api/auto-profile/<key>    {schema:'megulit.game-diff-feed',version:1,key,diff:<signed megulit.game-diff>}
                                     the official diff when there is one, else the agreed auto diff; 404 NOT_FOUND otherwise
   Maintainer (Authorization: Bearer ADAPTER_ADMIN_TOKEN):
     POST /api/auto-profile/official           {diff}   a signed official diff (tools/game-diff.cjs); checked, stored, handed out
     POST /api/auto-profile/official/withdraw  {key}    back to the auto diff
     GET  /api/auto-profile/queue[?all=1]               the repair queue, newest first
     POST /api/auto-profile/queue/close        {key}

   The auto pick (one per exe, "按分数和一致性去重，只保留一份"): reports of the last KEEP_DAYS days, the same mode+settings from
   different reporters are one group. Read mode wins when more than half of the reporters ended in read mode and at least AGREE
   did; otherwise the hide group with the lowest mean cost among the groups of at least AGREE reporters. A single report is
   never handed out. The pick is signed with AUTO_PROFILE_SIGNING_KEY (Ed25519 PKCS#8, base64, a wrangler secret; key id
   AUTO_PROFILE_KEY_ID, default 'r1'); without that secret nothing automatic is handed out. */
import gameDiff from '../../core/game-diff.cjs';
import domains from '../../core/profiles/domains.cjs';
const {canonical,validate,build,KEY}=gameDiff;
export const AUTO_LIMITS={body:16*1024,official:32*1024,agree:2,keepDays:180,reportsPerKey:50,queue:200};
const SEMVER=/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const METRICS=['hideVisible','dropRate','repeatRate','choiceMismatch','positionPx','pairRate'];
const encoder=new TextEncoder();
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
async function sha256(s){return hex(await crypto.subtle.digest('SHA-256',encoder.encode(s)));}
const num=(v,lo,hi)=>{const n=Number(v);return Number.isFinite(n)?Math.max(lo,Math.min(hi,n)):null;};
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
function same(a,b){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}
const admin=(request,env)=>!!env.ADAPTER_ADMIN_TOKEN&&same(request.headers.get('authorization')||'','Bearer '+env.ADAPTER_ADMIN_TOKEN);
const b64=s=>{const bin=atob(s);const out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out;};
const tob64=u=>{let s='';for(const b of new Uint8Array(u))s+=String.fromCharCode(b);return btoa(s);};

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
export function pick(rows,{agree=AUTO_LIMITS.agree}={}){if(!rows.length)return null;const groups=new Map();
 for(const r of rows){let g=groups.get(r.settings_hash);if(!g){g={hash:r.settings_hash,mode:r.mode,settings:r.settings,n:0,cost:0,at:0,engine:r.engine||'',exe:r.exe||''};groups.set(r.settings_hash,g);}g.n++;g.cost+=Number(r.cost)||0;g.at=Math.max(g.at,Number(r.updated_at)||0);}
 const all=[...groups.values()].map(g=>({...g,cost:g.cost/g.n})),total=rows.length,readN=rows.filter(r=>r.mode==='read').length;
 const out=g=>{let settings={};try{settings=JSON.parse(g.settings);}catch{}return {hash:g.hash,mode:g.mode,settings,agree:g.n,reporters:total,cost:Math.round(g.cost*1000)/1000,at:g.at,engine:g.engine,exe:g.exe};};
 if(readN*2>total&&readN>=agree){const g=all.filter(x=>x.mode==='read').sort((a,b)=>b.n-a.n||b.at-a.at)[0];return {...out(g),agree:readN};}
 const hide=all.filter(g=>g.mode==='hide'&&g.n>=agree).sort((a,b)=>a.cost-b.cost||b.n-a.n||b.at-a.at);return hide[0]?out(hide[0]):null;}
/* Ed25519 over canonical(document) with the relay's key */
export async function signDoc(doc,env){const raw=String(env.AUTO_PROFILE_SIGNING_KEY||'').trim();if(!raw)return null;
 const key=await crypto.subtle.importKey('pkcs8',b64(raw),{name:'Ed25519'},false,['sign']);
 const sig=await crypto.subtle.sign({name:'Ed25519'},key,encoder.encode(canonical(doc)));return {...doc,signature:{alg:'ed25519',keyId:String(env.AUTO_PROFILE_KEY_ID||'r1'),value:tob64(sig)}};}

/* recompute the exe's auto diff; stored only when the pick changed and the relay can sign */
async function settle(env,key,now){const since=Math.floor(now.getTime()/1000)-AUTO_LIMITS.keepDays*86400;
 const rows=(await env.DB.prepare('SELECT settings_hash,settings,mode,cost,engine,exe,updated_at FROM auto_profile_reports WHERE game_key=? AND updated_at>=? ORDER BY updated_at DESC LIMIT 500').bind(key,since).all()).results||[];
 const p=pick(rows);const cur=await env.DB.prepare("SELECT settings_hash FROM game_diffs WHERE game_key=? AND source='auto'").bind(key).first();
 if(!p){if(cur)await env.DB.prepare("DELETE FROM game_diffs WHERE game_key=? AND source='auto'").bind(key).run();return null;}
 const stamp=p.hash+':'+p.agree+':'+p.reporters;if(cur?.settings_hash===stamp)return p;
 const doc=await signDoc(build({key,source:'auto',mode:p.mode,settings:p.settings,exe:p.exe,engine:p.engine,issuedAt:now.toISOString(),agree:p.agree,reporters:p.reporters,cost:p.cost}),env);if(!doc)return p;
 await env.DB.prepare("INSERT INTO game_diffs(game_key,source,body,settings_hash,updated_at) VALUES(?,'auto',?,?,?) ON CONFLICT(game_key,source) DO UPDATE SET body=excluded.body,settings_hash=excluded.settings_hash,updated_at=excluded.updated_at,withdrawn_at=NULL").bind(key,JSON.stringify(doc),stamp,Math.floor(now.getTime()/1000)).run();
 return p;}

async function report(request,env,ip,now,{json,fail,readJSON}){
 const body=await readJSON(request,AUTO_LIMITS.body);if(body.error)return fail(body.error,body.error==='PAYLOAD_TOO_LARGE'?413:400);
 const v=validateReport(body.value);if(!v.ok)return fail(v.error);const r=v.value,t=Math.floor(now.getTime()/1000),hash=(await sha256(r.mode+'|'+canonical(r.settings))).slice(0,32);
 await env.DB.prepare('INSERT INTO auto_profile_reports(game_key,reporter,settings_hash,settings,mode,source,cost,metrics,engine,exe,app,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(game_key,reporter) DO UPDATE SET settings_hash=excluded.settings_hash,settings=excluded.settings,mode=excluded.mode,source=excluded.source,cost=excluded.cost,metrics=excluded.metrics,engine=excluded.engine,exe=excluded.exe,app=excluded.app,updated_at=excluded.updated_at')
  .bind(r.key,ip,hash,canonical(r.settings),r.mode,r.source,r.cost,JSON.stringify(r.metrics),r.engine,r.exe,r.app,t).run();
 /* one exe keeps its newest reports only */
 await env.DB.prepare('DELETE FROM auto_profile_reports WHERE game_key=? AND reporter NOT IN (SELECT reporter FROM auto_profile_reports WHERE game_key=? ORDER BY updated_at DESC LIMIT ?)').bind(r.key,r.key,AUTO_LIMITS.reportsPerKey).run();
 if(r.source==='gate')await env.DB.prepare("INSERT INTO auto_profile_queue(game_key,exe,engine,reasons,reporters,app,first_at,last_at) VALUES(?,?,?,?,1,?,?,?) ON CONFLICT(game_key) DO UPDATE SET exe=excluded.exe,engine=excluded.engine,reasons=excluded.reasons,reporters=auto_profile_queue.reporters+1,app=excluded.app,last_at=excluded.last_at,closed_at=NULL")
  .bind(r.key,r.exe,r.engine,JSON.stringify(r.over),r.app,t,t).run();
 await settle(env,r.key,now);
 return json({ok:true,queued:r.source==='gate'},201);}
async function get(env,key,{json,fail}){if(!KEY.test(key))return fail('NOT_FOUND',404);
 const rows=(await env.DB.prepare('SELECT source,body FROM game_diffs WHERE game_key=? AND withdrawn_at IS NULL').bind(key).all()).results||[];
 const row=rows.find(r=>r.source==='official')||rows.find(r=>r.source==='auto');if(!row)return fail('NOT_FOUND',404,{'cache-control':'public, max-age=900'});
 let diff;try{diff=JSON.parse(row.body);}catch{return fail('NOT_FOUND',404);}
 return json({schema:'megulit.game-diff-feed',version:1,key,diff},200,{'cache-control':'public, max-age=3600'});}
async function official(request,env,now,{json,fail,readJSON}){const body=await readJSON(request,AUTO_LIMITS.official);if(body.error)return fail(body.error,400);const d=body.value?.diff;
 const v=validate(d);if(!v.ok)return fail('INVALID_DIFF_'+v.error);if(d.source!=='official')return fail('NOT_OFFICIAL');
 const s=d.signature;if(!s||s.alg!=='ed25519'||!/^[A-Za-z0-9_-]{1,20}$/.test(String(s.keyId||''))||!/^[A-Za-z0-9+/=]{40,200}$/.test(String(s.value||'')))return fail('UNSIGNED');
 await env.DB.prepare("INSERT INTO game_diffs(game_key,source,body,settings_hash,updated_at) VALUES(?,'official',?,'',?) ON CONFLICT(game_key,source) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at,withdrawn_at=NULL").bind(d.key,JSON.stringify(d),Math.floor(now.getTime()/1000)).run();
 await env.DB.prepare('UPDATE auto_profile_queue SET closed_at=? WHERE game_key=? AND closed_at IS NULL').bind(Math.floor(now.getTime()/1000),d.key).run();
 return json({ok:true,key:d.key},201);}
async function withdraw(request,env,now,{json,fail,readJSON}){const body=await readJSON(request,4096);const key=String(body.value?.key||'');if(!KEY.test(key))return fail('INVALID_KEY');
 await env.DB.prepare("UPDATE game_diffs SET withdrawn_at=? WHERE game_key=? AND source='official'").bind(Math.floor(now.getTime()/1000),key).run();return json({ok:true});}
async function queueGet(env,url,{json}){const all=url.searchParams.get('all')==='1';
 const rows=(await env.DB.prepare('SELECT game_key,exe,engine,reasons,reporters,app,first_at,last_at,closed_at FROM auto_profile_queue'+(all?'':' WHERE closed_at IS NULL')+' ORDER BY last_at DESC LIMIT ?').bind(AUTO_LIMITS.queue).all()).results||[];
 return json({queue:rows.map(r=>{let reasons=[];try{reasons=JSON.parse(r.reasons);}catch{}return {key:r.game_key,exe:r.exe,engine:r.engine,reasons,reporters:r.reporters,app:r.app,firstAt:r.first_at,lastAt:r.last_at,closedAt:r.closed_at||null};})});}
async function queueClose(request,env,now,{json,fail,readJSON}){const body=await readJSON(request,4096);const key=String(body.value?.key||'');if(!KEY.test(key))return fail('INVALID_KEY');
 await env.DB.prepare('UPDATE auto_profile_queue SET closed_at=? WHERE game_key=?').bind(Math.floor(now.getTime()/1000),key).run();return json({ok:true});}

/* router; null when the path is not one of these */
export async function autoProfileRoute(request,env,ip,now,url,path,deps){const {fail,hit}=deps,m=request.method;
 if(path==='/api/auto-profile/report')return m==='POST'?(await hit(env,'autoprof-report',ip,now.getTime())?report(request,env,ip,now,deps):fail('RATE_LIMITED',429)):fail('METHOD_NOT_ALLOWED',405);
 if(['/api/auto-profile/official','/api/auto-profile/official/withdraw','/api/auto-profile/queue','/api/auto-profile/queue/close'].includes(path)){
  if(!admin(request,env))return fail('UNAUTHORIZED',401);
  if(path==='/api/auto-profile/official'&&m==='POST')return official(request,env,now,deps);
  if(path==='/api/auto-profile/official/withdraw'&&m==='POST')return withdraw(request,env,now,deps);
  if(path==='/api/auto-profile/queue'&&m==='GET')return queueGet(env,url,deps);
  if(path==='/api/auto-profile/queue/close'&&m==='POST')return queueClose(request,env,now,deps);
  return fail('METHOD_NOT_ALLOWED',405);}
 const g=/^\/api\/auto-profile\/(x-[0-9a-f]{64})$/.exec(path);
 /* no rate-limit row on reads (D1 write budget): the global per-IP limiter covers them */
 if(g)return m==='GET'?get(env,g[1],deps):fail('METHOD_NOT_ALLOWED',405);
 return null;}
