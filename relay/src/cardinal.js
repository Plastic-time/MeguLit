// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-21 Cardinal: replay-and-score of the reading layer, run by the player's MeguLit on their own PC.
   POST /api/cardinal/score   {schema:'megulit.cardinal-score',version:1,key,seedRev,source,app,lines,scores:{row,stable,clean,clear,
                              choice,pair,leak},total,cardinalRev,at}   Field names are fixed by the client. Every field is checked
                              strictly; an unknown field, or one named like an identity, rejects the whole record.
   GET  /api/cardinal/verified  (ours, Authorization: Bearer ADAPTER_ADMIN_TOKEN) the verdicts: [{key,seedRev,status,voters,mean,lowest}]
   One vote per reporter (hashed + salted IP, the same reporter id as auto-profile reports) per key and seedRev; a repeat replaces it.
   Rules (relay vars, defaults in CARDINAL_DEFAULTS): among the votes for source 'auto' with enough lines, at least CARDINAL_VERIFY_VOTERS
   different reporters, mean total >= CARDINAL_VERIFY_MEAN and none below CARDINAL_VERIFY_FLOOR -> status 'verified'; mean < CARDINAL_REPAIR_MEAN
   with at least CARDINAL_REPAIR_VOTERS reporters -> 'repair' and a row in the repair queue (auto_profile_queue, kind 'cardinal', the one
   GET /api/game-profile/retest hands out). Only a status changes: the signature stays offline, the relay holds no private key. */
export const CARDINAL_DEFAULTS={verifyVoters:3,verifyMean:.9,verifyFloor:.6,repairMean:.6,repairVoters:3,minLines:30};
export const SCORE_KEYS=['row','stable','clean','clear','choice','pair','leak'];
const TOP_KEYS=['schema','version','key','seedRev','source','app','lines','scores','total','cardinalRev','at'];
/* names that say who someone is: seeing one anywhere in the record refuses all of it */
const IDENTITY=/user|name|nick|account|e-?mail|phone|(^|[^a-z])ip([^a-z]|$)|addr|host|machine|install|device|hwid|uid|steam|token|cookie|path|folder|player|reporter|identity|(^|[^a-z])id$/i;
const KEY=/^[0-9a-f]{64}$/,REV=/^[A-Za-z0-9._+-]{1,40}$/,SEMVER=/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
const unit=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1;
const sec=now=>Math.floor(now.getTime()/1000);
export function cardinalConfig(env={}){const n=(k,d,lo,hi)=>{const v=Number(env[k]);return env[k]!==undefined&&env[k]!==''&&Number.isFinite(v)&&v>=lo&&v<=hi?v:d;};const D=CARDINAL_DEFAULTS;
 return {verifyVoters:Math.floor(n('CARDINAL_VERIFY_VOTERS',D.verifyVoters,1,1000)),verifyMean:n('CARDINAL_VERIFY_MEAN',D.verifyMean,0,1),verifyFloor:n('CARDINAL_VERIFY_FLOOR',D.verifyFloor,0,1),
  repairMean:n('CARDINAL_REPAIR_MEAN',D.repairMean,0,1),repairVoters:Math.floor(n('CARDINAL_REPAIR_VOTERS',D.repairVoters,1,1000)),minLines:Math.floor(n('CARDINAL_MIN_LINES',D.minLines,1,100000))};}

/* strict check of one record; {ok:true,value} or {ok:false,error} */
export function validateScore(body,now=new Date()){
 if(!plain(body))return {ok:false,error:'INVALID_SCORE'};
 for(const k of Object.keys(body)){if(IDENTITY.test(k))return {ok:false,error:'IDENTITY_NOT_ACCEPTED'};if(!TOP_KEYS.includes(k))return {ok:false,error:'UNKNOWN_FIELD'};}
 if(body.schema!=='megulit.cardinal-score'||body.version!==1)return {ok:false,error:'INVALID_SCHEMA'};
 if(typeof body.key!=='string'||!KEY.test(body.key))return {ok:false,error:'INVALID_KEY'};
 const seedRev=body.seedRev;if(!(seedRev===null||typeof seedRev==='string'&&REV.test(seedRev)))return {ok:false,error:'INVALID_SEED_REV'};
 if(!['official','auto','none'].includes(body.source))return {ok:false,error:'INVALID_SOURCE'};
 if(typeof body.app!=='string'||!SEMVER.test(body.app))return {ok:false,error:'INVALID_APP'};
 if(!Number.isInteger(body.lines)||body.lines<0||body.lines>1e6)return {ok:false,error:'INVALID_LINES'};
 if(!plain(body.scores))return {ok:false,error:'INVALID_SCORES'};
 for(const k of Object.keys(body.scores)){if(IDENTITY.test(k))return {ok:false,error:'IDENTITY_NOT_ACCEPTED'};if(!SCORE_KEYS.includes(k))return {ok:false,error:'UNKNOWN_FIELD'};}
 for(const k of SCORE_KEYS)if(!unit(body.scores[k]))return {ok:false,error:'INVALID_SCORES'};
 if(!unit(body.total))return {ok:false,error:'INVALID_TOTAL'};
 if(typeof body.cardinalRev!=='string'||!REV.test(body.cardinalRev))return {ok:false,error:'INVALID_CARDINAL_REV'};
 if(typeof body.at!=='string'||!ISO.test(body.at))return {ok:false,error:'INVALID_AT'};
 const at=Date.parse(body.at);if(!Number.isFinite(at)||at>now.getTime()+86400e3||at<now.getTime()-400*86400e3)return {ok:false,error:'INVALID_AT'};
 return {ok:true,value:{key:body.key,seedRev:seedRev??'',source:body.source,app:body.app,lines:body.lines,scores:Object.fromEntries(SCORE_KEYS.map(k=>[k,body.scores[k]])),total:body.total,cardinalRev:body.cardinalRev,at:Math.floor(at/1000)}};}

/* the verdict from vote rows [{total,lines,source}]; pure */
export function verdict(rows,cfg=CARDINAL_DEFAULTS){
 const votes=rows.filter(r=>r.source==='auto'&&(r.lines|0)>=cfg.minLines),n=votes.length;
 if(!n)return {status:'open',voters:0,mean:0,lowest:0};
 const totals=votes.map(r=>Number(r.total)||0),mean=totals.reduce((a,b)=>a+b,0)/n,lowest=Math.min(...totals),r3=x=>Math.round(x*1000)/1000;
 let status='open';
 if(n>=cfg.verifyVoters&&mean>=cfg.verifyMean&&lowest>=cfg.verifyFloor)status='verified';
 else if(n>=cfg.repairVoters&&mean<cfg.repairMean)status='repair';
 return {status,voters:n,mean:r3(mean),lowest:r3(lowest)};}

async function settle(env,key,seedRev,now){const cfg=cardinalConfig(env),t=sec(now);
 const rows=(await env.DB.prepare('SELECT total,lines,source FROM cardinal_scores WHERE game_key=? AND seed_rev=?').bind(key,seedRev).all()).results||[];
 const v=verdict(rows,cfg),old=await env.DB.prepare('SELECT status FROM cardinal_status WHERE game_key=? AND seed_rev=?').bind(key,seedRev).first();
 const became=v.status!==(old?.status||'open');
 await env.DB.prepare('INSERT INTO cardinal_status(game_key,seed_rev,status,voters,mean,lowest,upgraded_at,repaired_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(game_key,seed_rev) DO UPDATE SET status=excluded.status,voters=excluded.voters,mean=excluded.mean,lowest=excluded.lowest,upgraded_at=COALESCE(excluded.upgraded_at,cardinal_status.upgraded_at),repaired_at=COALESCE(excluded.repaired_at,cardinal_status.repaired_at),updated_at=excluded.updated_at')
  .bind(key,seedRev,v.status,v.voters,v.mean,v.lowest,became&&v.status==='verified'?t:null,became&&v.status==='repair'?t:null,t).run();
 if(v.status==='repair'){/* the one repair queue (GET /api/game-profile/retest). A row another source already opened keeps its own kind and reasons */
  await env.DB.prepare("INSERT INTO auto_profile_queue(game_key,gid,prints,exe,engine,reasons,note,kind,reporters,app,first_at,last_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(game_key) DO UPDATE SET last_at=excluded.last_at,closed_at=NULL")
   .bind(key,'','{}','','','[]','cardinal mean '+v.mean,'cardinal',v.voters,'',t,t).run();}
 else if(v.status==='verified'&&became)await env.DB.prepare("UPDATE auto_profile_queue SET closed_at=? WHERE game_key=? AND kind='cardinal' AND closed_at IS NULL").bind(t,key).run();
 return {...v,changed:became};}

export async function cardinalScorePost(request,env,reporter,now,{json,fail,readJSON}){
 const body=await readJSON(request,4096);if(body.error)return fail(body.error,body.error==='PAYLOAD_TOO_LARGE'?413:400);
 const v=validateScore(body.value,now);if(!v.ok)return fail(v.error);const s=v.value,t=sec(now);
 await env.DB.prepare('INSERT INTO cardinal_scores(game_key,seed_rev,reporter,source,total,scores,lines,app,cardinal_rev,scored_at,received_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(game_key,seed_rev,reporter) DO UPDATE SET source=excluded.source,total=excluded.total,scores=excluded.scores,lines=excluded.lines,app=excluded.app,cardinal_rev=excluded.cardinal_rev,scored_at=excluded.scored_at,received_at=excluded.received_at')
  .bind(s.key,s.seedRev,reporter,s.source,s.total,JSON.stringify(s.scores),s.lines,s.app,s.cardinalRev,s.at,t).run();
 const r=await settle(env,s.key,s.seedRev,now);
 return json({ok:true,status:r.status,voters:r.voters},201);}

async function verifiedGet(env,{json}){const rows=(await env.DB.prepare("SELECT game_key,seed_rev,status,voters,mean,lowest,upgraded_at,repaired_at FROM cardinal_status WHERE status<>'open' ORDER BY updated_at DESC LIMIT 500").all()).results||[];
 return json({items:rows.map(r=>({key:r.game_key,seedRev:r.seed_rev||null,status:r.status,voters:r.voters,mean:r.mean,lowest:r.lowest,upgradedAt:r.upgraded_at||null,repairedAt:r.repaired_at||null}))});}

/* THE SEED's confirmed count includes these: distinct exe keys with a verified Cardinal verdict. Tolerates the migration not being applied yet */
export async function cardinalVerifiedCount(env){try{return (await env.DB.prepare("SELECT COUNT(DISTINCT game_key) AS n FROM cardinal_status WHERE status='verified'").first())?.n|0;}catch{return 0;}}

/* the dashboard's small panel: today (UTC+8 day) scores, upgrades, repair-queue entries; totals alongside */
export async function cardinalSummary(env,now=new Date()){
 const day=Math.floor((sec(now)+8*3600)/86400)*86400-8*3600,one=async(sql,...a)=>(await env.DB.prepare(sql).bind(...a).first())?.n|0;
 return {today:{scores:await one('SELECT COUNT(*) AS n FROM cardinal_scores WHERE received_at>=?',day),upgraded:await one('SELECT COUNT(*) AS n FROM cardinal_status WHERE upgraded_at>=?',day),repair:await one('SELECT COUNT(*) AS n FROM cardinal_status WHERE repaired_at>=?',day)},
  total:{scores:await one('SELECT COUNT(*) AS n FROM cardinal_scores'),verified:await one("SELECT COUNT(*) AS n FROM cardinal_status WHERE status='verified'"),repair:await one("SELECT COUNT(*) AS n FROM cardinal_status WHERE status='repair'")},at:sec(now)};}

const same=(a,b)=>{if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;};
/* router; null when the path is not one of these */
export async function cardinalRoute(request,env,ip,now,url,path,deps){const {fail,hit}=deps,m=request.method;
 if(path==='/api/cardinal/score')return m==='POST'?(await hit(env,'cardinal-score',ip,now.getTime())?cardinalScorePost(request,env,ip,now,deps):fail('RATE_LIMITED',429)):fail('METHOD_NOT_ALLOWED',405);
 if(path==='/api/cardinal/verified'){if(!env.ADAPTER_ADMIN_TOKEN||!same(request.headers.get('authorization')||'','Bearer '+env.ADAPTER_ADMIN_TOKEN))return fail('UNAUTHORIZED',401);return m==='GET'?verifiedGet(env,deps):fail('METHOD_NOT_ALLOWED',405);}
 return null;}
