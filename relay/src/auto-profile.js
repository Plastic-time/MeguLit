// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-21 (owner: 每部游戏一份差分；「传火不能只靠 exe 哈希」；官方优先，用户校准兜底；只是数据；签名只在我们本机) game diffs.
   Two layers, matched by fingerprints (core/game-print.cjs), the most exact first:
     version layer  one exe build      exe (whole-file SHA-256) -> head (first+last 64 KB) -> pe (version + link time)
     game layer     every build        exe (a build already filed under it) -> pack (main archive) -> script -> steam -> vndb -> title
     engine                            the repository's engine diff (nothing shared here)
   The relay collects calibrations, picks the agreed best one per layer and key, and hands out documents WE signed offline
   (tools/sign-profile.cjs; the relay holds no private key, so a breach of it cannot make a diff the app accepts).
   Free tier: a report is a few D1 upserts (report, its prints, the picks when they change, a rate-limit row); a read is a
   handful of indexed SELECTs and no write. Format and rules: docs/auto-profile.md; the document: core/game-diff.cjs; values:
   core/profiles/domains.cjs (the same files the app runs).

   Public (the app):
     POST /api/game-profile/report   {version:1,profile:{key,engine,exe,version,source,mode,settings,score,gate?},prints?:{...}}
                                     key = the exe SHA-256; prints = the other fingerprints. Filed under the exe (version layer)
                                     and under the game identity its prints lead to (game layer). source 'gate' also opens /
                                     bumps the exe's row in the repair queue.
     GET  /api/game-profile?exe=&head=&pe=&pack=&script=&steam=&vndb=&title=[&have=<rev>&haveGame=<rev>]
                                     {schema:'megulit.game-diff-feed',version:2,key,match,
                                      versionLayer:{match,key,diff}|null, gameLayer:{match,key,diff}|null, diff:<the better of the two>}
                                     match = the fingerprint that found it ('exe','head','pe','pack','script','steam','vndb','title');
                                     each diff the official one when there is one, else the signed agreed one; 304 when both
                                     revs are the ones the app has; 404 when nothing matches (the app keeps engine + repo layers)
     GET  /api/game-profile/<exeHash> the same with exe only
     POST /api/game-profile/runtime  {version:1,key,identity?,prints?,sha256,data:<base64 gzip runtime bundle>}
     GET  /api/game-profile/retest   {schema:'megulit.cold-retest',version:1,items:[{key,game,at}]} the open repair queue, hashes only
                                     (the idle-time cold test takes these first); report source 'cold' = a cold-test result
   Ours (Authorization: Bearer ADAPTER_ADMIN_TOKEN), used by tools/sign-profile.cjs:
     GET  /api/game-profile/picks                  the agreed picks not signed yet (unsigned documents, both layers)
     POST /api/game-profile/signed      {diff}     a signed document; an auto one must be the current pick of its layer and key;
                                                   an official one registers its prints (it defines the game) and closes the queue
     POST /api/game-profile/withdraw    {key,layer?,source?}
     GET  /api/game-profile/queue[?all=1] | POST /api/game-profile/queue/close {key}
     GET  /api/game-profile/runtime/list | GET /api/game-profile/runtime/get?key=

   The pick ("按分数和一致性去重，只保留一份"): reports of the last KEEP_DAYS days (version layer: of that exe; game layer: of every
   exe filed under that game), the same mode+settings from different reporters are one group. Read mode wins when more than
   half of the reporters ended in read mode and at least AGREE did; otherwise the hide group with the lowest mean cost among the
   groups of at least AGREE reporters. A single report is never picked. Each new pick of a key gets the next rev. */
import gameDiff from '../../core/game-diff.cjs';
import {wakeClients} from './seed-notifications.js';
import ordinary from '../../core/ordinary-seed.cjs';
import {boundedJSON, enqueue, processJob, status as ordinaryStatus} from './ordinary-seed.js';
import protocol from '../../core/torch-release.cjs';
import domains from '../../core/profiles/domains.cjs';
import gamePrint from '../../core/game-print-schema.cjs';
import {parseCredit,noteUpload,creditOfDiff,creditPut,creditOut} from './torch-credit.js';
import torchAliases from '../../core/torch-alias.cjs';
import {carvingFor,engrave,rosterOwner} from './torch-roster.js';
import {cleanForProfile} from './seed-malware.js';
import {reportAllowed,noteSeedUpload,blockedProfile,profileBlock,retestOrder} from './seed-admin.js';
const {canonical,validate,build,unsigned,KEY}=gameDiff;
const {VERSION_KINDS,GAME_KINDS}=gamePrint;
export const PROFILE_LIMITS={body:16*1024,signed:32*1024,runtime:3*1024*1024,agree:2,keepDays:180,reportsPerKey:50,queue:200,picks:200};
const SEMVER=/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const METRICS=['hideVisible','dropRate','repeatRate','choiceMismatch','positionPx','pairRate'];
const encoder=new TextEncoder();
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
async function sha256(s){return hex(await crypto.subtle.digest('SHA-256',typeof s==='string'?encoder.encode(s):s));}
const num=(v,lo,hi)=>{const n=Number(v);return Number.isFinite(n)?Math.max(lo,Math.min(hi,n)):null;};
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
const sec=now=>Math.floor(now.getTime()/1000);
function same(a,b){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}
const ours=(request,env)=>!!env.ADAPTER_ADMIN_TOKEN&&same(request.headers.get('authorization')||'','Bearer '+env.ADAPTER_ADMIN_TOKEN);
const SIGNED=s=>s&&s.alg==='ed25519'&&/^[A-Za-z0-9_-]{1,20}$/.test(String(s.keyId||''))&&/^[A-Za-z0-9+/=]{40,200}$/.test(String(s.value||''));
const pick2=(o,keys)=>Object.fromEntries(keys.filter(k=>o[k]).map(k=>[k,o[k]]));

export const cleanSettings=s=>domains.clean(s).value;
export function validateReport(body){const p=body?.profile;if(body?.version!==1||!plain(p))return {ok:false,error:'INVALID_REPORT'};
 const key=String(p.key||'');if(!KEY.test(key))return {ok:false,error:'INVALID_KEY'};
 const mode=p.mode;if(mode!=='hide'&&mode!=='read')return {ok:false,error:'INVALID_MODE'};
 const settings=cleanSettings(p.settings);if(mode==='read')settings.hide={...(settings.hide||{}),textEffectsRead:true};
 const metrics={};const m=p.score?.metrics;if(plain(m))for(const k of METRICS){const v=m[k];metrics[k]=v===null||v===undefined?null:num(v,-1,1e6);}
 const over=Array.isArray(p.gate?.over)?p.gate.over.filter(x=>METRICS.includes(x)):[];
 const prints={...gamePrint.check(body.prints||p.prints),exe:key};
 return {ok:true,value:{key,mode,settings,prints,source:p.source==='gate'?'gate':p.source==='cold'?'cold':'calibration',reason:String(p.reason||'').replace(/[\u0000-\u001f]/g,' ').slice(0,200),cost:num(p.score?.cost,0,1e6)??0,metrics,over,
  engine:String(p.engine||'').toLowerCase().replace(/[^a-z0-9-]/g,'').slice(0,32),exe:String(p.exe||'').toLowerCase().replace(/[\\/:*?"<>|]/g,'').slice(0,80),app:SEMVER.test(String(p.version||''))?String(p.version):''}};}

/* the agreed best result from report rows, or null */
export function pick(rows,{agree=PROFILE_LIMITS.agree}={}){if(!rows.length)return null;const variants=new Set(rows.map(row=>{try{return JSON.parse(row.prints||'{}').script||'';}catch{return '';}}));
 if(variants.size>1)return null;
 const groups=new Map();
 for(const r of rows){let g=groups.get(r.settings_hash);if(!g){g={hash:r.settings_hash,mode:r.mode,settings:r.settings,n:0,cost:0,at:0,engine:r.engine||'',exe:r.exe||'',prints:r.prints||'{}'};groups.set(r.settings_hash,g);}g.n++;g.cost+=Number(r.cost)||0;if((Number(r.updated_at)||0)>=g.at){g.at=Number(r.updated_at)||0;g.prints=r.prints||g.prints;}}
 const all=[...groups.values()].map(g=>({...g,cost:g.cost/g.n})),total=rows.length,readN=rows.filter(r=>r.mode==='read').length;
 const out=g=>{let settings={},prints={};try{settings=JSON.parse(g.settings);}catch{}try{prints=JSON.parse(g.prints);}catch{}return {hash:g.hash,mode:g.mode,settings,prints,agree:g.n,reporters:total,cost:Math.round(g.cost*1000)/1000,at:g.at,engine:g.engine,exe:g.exe};};
 if(readN*2>total&&readN>=agree){const g=all.filter(x=>x.mode==='read').sort((a,b)=>b.n-a.n||b.at-a.at)[0];return {...out(g),agree:readN};}
 const hide=all.filter(g=>g.mode==='hide'&&g.n>=agree).sort((a,b)=>a.cost-b.cost||b.n-a.n||b.at-a.at);return hide[0]?out(hide[0]):null;}
/* what a signature vouches for, minus the bookkeeping that may change between pick and signing */
const essence=d=>canonical({key:d.key,layer:d.layer||'version',source:d.source,mode:d.mode,settings:d.settings,...(d.prints?.script?{script:d.prints.script}:{})});

/* ---- fingerprints -> keys ------------------------------------------------------------------------------------------- */
async function printKey(env,kind,value,layer){return value?(await env.DB.prepare('SELECT game_key FROM diff_prints WHERE kind=? AND value=? AND layer=?').bind(kind,value,layer).first())?.game_key||'':'';}
async function register(env,layer,key,prints,kinds,t){for(const k of kinds)if(prints[k])await env.DB.prepare('INSERT OR IGNORE INTO diff_prints(kind,value,layer,game_key,created_at) VALUES(?,?,?,?,?)').bind(k,prints[k],layer,key,t).run();}
/* the game identity of a set of prints: the game an earlier print already belongs to, else a new one from the strongest print */
async function gidFor(env,prints){for(const k of GAME_KINDS){const g=await printKey(env,k,prints[k],'game');if(g)return g;}const k=GAME_KINDS.find(x=>prints[x]);return k?sha256('game|'+k+':'+prints[k]):'';}
/* the best key of a layer for the client's prints, with the print that found it */
/* a build already filed under a game finds that game by its exe hash first */
async function find(env,layer,prints){const kinds=layer==='version'?VERSION_KINDS:['script','exe',...GAME_KINDS.filter(k=>k!=='script')];
 for(const k of kinds){
  if(!prints[k])continue;
  const key=layer==='version'&&k==='exe'?prints.exe:await printKey(env,k,prints[k],layer);
  if(!key)continue;
  const d=await best(env,layer,key);
  if(!d||d.source==='auto'&&d.prints?.script&&d.prints.script!==prints.script)continue;
  if(ordinary.signed(d)&&(layer!=='version'||k!=='exe'||key!==prints.exe||(d.prints?.script||'')!==(prints.script||'')))continue;
  return {match:k,key,diff:d};
 }
 return null;}
async function best(env,layer,key){const rows=(await env.DB.prepare('SELECT source,body FROM game_diffs WHERE layer=? AND game_key=? AND withdrawn_at IS NULL').bind(layer,key).all()).results||[];
 const row=rows.find(r=>r.source==='official')||rows.find(r=>r.source==='auto');if(!row)return null;let document;try{document=JSON.parse(row.body);}catch{return null;}
 if(ordinary.signed(document)&&await ordinaryBlocked(env.DB,await protocol.hash(document)))return null;
 return await blockedProfile(env.DB,document)?null:document;}
async function ordinaryBlocked(db,hash){return !!await db.prepare("SELECT 1 FROM torch_release_revocations WHERE profile_hash=? UNION ALL SELECT 1 FROM seed_malware_current WHERE profile_hash=? AND state='infected' LIMIT 1").bind(hash,hash).first();}

/* ---- picks ---------------------------------------------------------------------------------------------------------- */
async function settle(env,layer,key,now){const since=sec(now)-PROFILE_LIMITS.keepDays*86400;
 const rows=(await env.DB.prepare('SELECT settings_hash,settings,mode,cost,engine,exe,prints,updated_at FROM auto_profile_reports p WHERE '+(layer==='version'?'game_key':'gid')+"=? AND updated_at>=? AND NOT EXISTS(SELECT 1 FROM seed_admin_items a WHERE a.kind='report' AND a.game_key=p.game_key AND a.settings_hash=p.settings_hash AND a.state='deleted') ORDER BY updated_at DESC LIMIT 500").bind(key,since).all()).results||[];
 const p=pick(rows);
 if(!p){await env.DB.prepare('DELETE FROM auto_profile_picks WHERE layer=? AND game_key=?').bind(layer,key).run();return null;}
 const prints=pick2(p.prints,layer==='version'?[...VERSION_KINDS,'script']:GAME_KINDS);
 const draft=build({key,layer,prints,source:'auto',mode:p.mode,settings:p.settings,exe:layer==='version'?p.exe:'',engine:p.engine,issuedAt:now.toISOString(),agree:p.agree,reporters:p.reporters,cost:p.cost});
 const stamp=await sha256(essence(draft));const old=await env.DB.prepare('SELECT stamp,rev FROM auto_profile_picks WHERE layer=? AND game_key=?').bind(layer,key).first();
 if(old?.stamp===stamp)return p;
 /* one rev line per layer and key across both sources: the app asks with the rev it has (have / haveGame), so a new document,
    auto or official, always carries a higher number than anything handed out before */
 const signedRev=(await env.DB.prepare('SELECT MAX(rev) AS rev FROM game_diffs WHERE layer=? AND game_key=?').bind(layer,key).first())?.rev||0;
 const rev=Math.max(old?.rev||0,signedRev)+1;const doc={...draft,rev};
 await env.DB.prepare('INSERT INTO auto_profile_picks(layer,game_key,stamp,body,rev,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(layer,game_key) DO UPDATE SET stamp=excluded.stamp,body=excluded.body,rev=excluded.rev,updated_at=excluded.updated_at').bind(layer,key,stamp,JSON.stringify(doc),rev,sec(now)).run();
 return p;}

/* ---- public --------------------------------------------------------------------------------------------------------- */
async function report(request,env,ip,now,{json,fail,ctx}){
 const body=await boundedJSON(request,PROFILE_LIMITS.body);if(body.error)return fail(body.error,body.error==='PAYLOAD_TOO_LARGE'?413:400);
 let candidate=body.value?.ordinary===undefined?null:ordinary.normalize(body.value.ordinary);
 if(body.value?.ordinary!==undefined&&(!candidate||candidate.key!==body.value.profile?.key||candidate.mode!==body.value.profile?.mode))return fail('INVALID_ORDINARY_SEED',422);
 const script=(body.value?.prints||body.value?.profile?.prints)?.script;
 if(candidate&&(candidate.prints||script!=null&&script!==''&&(typeof script!=='string'||!KEY.test(script))))return fail('INVALID_ORDINARY_SEED',422);
 if(candidate){const original=ordinary.normalize({key:candidate.key,mode:candidate.mode,settings:body.value.profile.settings});if(!original||canonical(original)!==canonical(candidate))return fail('INVALID_ORDINARY_SEED',422);}
 const v=validateReport(body.value);if(!v.ok)return fail(v.error);const r=v.value,t=sec(now);
 /* 2026-11-21 传火署名: credit:{name?} next to profile (or inside it); refused whole when it is not a clean name (relay/src/torch-credit.js) */
 const cr=parseCredit(body.value.credit!==undefined?body.value.credit:body.value.profile?.credit,env);if(!cr.ok)return fail('INVALID_CREDIT');
 const alias=body.value.libraryAlias;
 if(alias!==undefined&&!Object.values(torchAliases.protagonists).includes(alias))return fail('INVALID_CREDIT');
 const variant=r.prints.script||'';
 if(candidate&&variant)candidate={...candidate,prints:{script:variant}};
 const hash=(await sha256(r.mode+'|'+canonical(r.settings)+(variant?'|'+variant:''))).slice(0,32);
 if(!await reportAllowed(env.DB,r.key,hash))return fail('SEED_DELETED',410);
 const owner=await rosterOwner(request,env,now);
 if(request.headers.has('authorization')&&!owner)return fail('UNAUTHORIZED',401);
 const gid=variant?await sha256('game|script:'+variant):await gidFor(env,r.prints);
 await env.DB.prepare('INSERT INTO auto_profile_reports(game_key,reporter,gid,prints,settings_hash,settings,mode,source,cost,metrics,engine,exe,app,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(game_key,reporter) DO UPDATE SET gid=excluded.gid,prints=excluded.prints,settings_hash=excluded.settings_hash,settings=excluded.settings,mode=excluded.mode,source=excluded.source,cost=excluded.cost,metrics=excluded.metrics,engine=excluded.engine,exe=excluded.exe,app=excluded.app,updated_at=excluded.updated_at')
  .bind(r.key,variant?await sha256(ip+'|'+variant):ip,gid,JSON.stringify(r.prints),hash,canonical(r.settings),r.mode,r.source,r.cost,JSON.stringify(r.metrics),r.engine,r.exe,r.app,t).run();
 await env.DB.prepare('DELETE FROM auto_profile_reports WHERE game_key=? AND reporter NOT IN (SELECT reporter FROM auto_profile_reports WHERE game_key=? ORDER BY updated_at DESC LIMIT ?)').bind(r.key,r.key,PROFILE_LIMITS.reportsPerKey).run();
 await register(env,'version',r.key,r.prints,['head','pe'],t);if(gid)await register(env,'game',gid,r.prints,['exe',...GAME_KINDS],t);
 const reporter=owner||ip;
 const raw=await noteUpload(env,r.key,reporter,cr,now);
 const uploadId=candidate?await protocol.hash({ordinary:candidate,reporter}):undefined;
 await noteSeedUpload(env.DB,r,hash,reporter,raw.torchNo,now,uploadId);
 /* 2026-11-21 kind: 'newVersion' = a shared diff found by head / pe / the game (not this exe) failed its first window here (the
    client's reason starts 「同游戏新版本」): this build needs its own version layer; 'broken' = the self-check stepped it down */
 if(r.source==='gate'){const kind=r.reason.startsWith('同游戏新版本')?'newVersion':'broken';await env.DB.prepare("INSERT INTO auto_profile_queue(game_key,gid,prints,exe,engine,reasons,note,kind,reporters,app,first_at,last_at) VALUES(?,?,?,?,?,?,?,?,1,?,?,?) ON CONFLICT(game_key) DO UPDATE SET gid=excluded.gid,prints=excluded.prints,exe=excluded.exe,engine=excluded.engine,reasons=excluded.reasons,note=excluded.note,kind=excluded.kind,reporters=auto_profile_queue.reporters+1,app=excluded.app,last_at=excluded.last_at,closed_at=NULL")
  .bind(r.key,gid,JSON.stringify(r.prints),r.exe,r.engine,JSON.stringify(r.over),r.reason,kind,r.app,t,t).run();}
 await settle(env,'version',r.key,now);if(gid)await settle(env,'game',gid,now);
 let job=null;
 if(candidate){job=await enqueue(env.DB,candidate,now);if(job.state==='pending'&&env.ORDINARY_SCAN_URL&&ctx?.waitUntil)ctx.waitUntil(processJob(env,job.id,now));}
 if(owner&&r.source!=='gate'&&(candidate||Object.keys(body.value.profile.settings||{}).length&&ordinary.normalize({key:r.key,mode:r.mode,settings:body.value.profile.settings}))){
  await engrave(env.DB,{owner,key:r.key,no:raw.torchNo,time:t,credit:cr,preferred:alias,declaredWork:r.prints.vndb});
 }
 const shown=owner&&creditOut(await carvingFor(env.DB,raw.torchNo));
 const credit=shown?{...shown,engraved:true}:{torchNo:raw.torchNo,name:cr.name??null,at:raw.at,engraved:false};
 return json({ok:true,...(job?{ordinary:job}:{}),queued:r.source==='gate',game:gid||null,torchNo:credit.torchNo,name:credit.name,at:credit.at,credit},201);}
async function lookup(env,url,exeFromPath,{json,fail}){const q=Object.fromEntries(['exe','head','pe','pack','script','steam','vndb','title'].map(k=>[k,url.searchParams.get(k)||'']));if(exeFromPath)q.exe=exeFromPath;
 const prints=gamePrint.check(q);if(!Object.keys(prints).length)return fail('NO_PRINTS',400);
 const previous=url.searchParams.get('ordinary');
 if(prints.exe&&KEY.test(previous||'')){
  const old=await env.DB.prepare("SELECT revision,state FROM ordinary_seed_jobs WHERE game_key=? AND profile_hash=?").bind(prints.exe,previous).first();
  if(old&&(old.state==='blocked'||await ordinaryBlocked(env.DB,previous)))
   return json({ok:false,error:'ORDINARY_REVOKED',hash:previous},410,{'cache-control':'no-store'});
 }
 const version=await find(env,'version',prints),game=await find(env,'game',prints);
 if(!version&&!game)return fail('NOT_FOUND',404,{'cache-control':'public, max-age=900'});
 const have=url.searchParams.get('have'),haveGame=url.searchParams.get('haveGame');
 if((have!==null||haveGame!==null)&&String(version?.diff?.rev??'')===String(have??'')&&String(game?.diff?.rev??'')===String(haveGame??''))return new Response(null,{status:304,headers:{'cache-control':'public, max-age=3600'}});
 const hashOf=async(d,script)=>(await sha256(d.mode+'|'+canonical(d.settings)+(script?'|'+script:''))).slice(0,32);
 if(version)version.credit=await creditOfDiff(env,'version',version.key,version.diff,hashOf);if(game)game.credit=await creditOfDiff(env,'game',game.key,game.diff,hashOf);
 const out=x=>x?{match:x.match,key:x.key,diff:x.diff,credit:x.credit}:null;const top=version||game;
 return json({schema:'megulit.game-diff-feed',version:2,key:prints.exe||'',match:top.match,versionLayer:out(version),gameLayer:out(game),diff:top.diff,credit:top.credit},200,{'cache-control':'public, max-age=3600'});}
async function runtimePost(request,env,ip,now,{json,fail,readJSON}){const body=await readJSON(request,Math.ceil(PROFILE_LIMITS.runtime*4/3)+4096);if(body.error)return fail(body.error,body.error==='PAYLOAD_TOO_LARGE'?413:400);const v=body.value||{};
 if(v.version!==1||!KEY.test(String(v.key||''))||!/^[0-9a-f]{64}$/.test(String(v.sha256||''))||typeof v.data!=='string'||v.identity!==undefined&&!/^[0-9a-f]{64}$/.test(String(v.identity)))return fail('INVALID_RUNTIME');
 let bytes;try{const bin=atob(v.data);bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);}catch{return fail('INVALID_RUNTIME');}
 if(bytes.length>PROFILE_LIMITS.runtime||bytes.length<20||bytes[0]!==0x1f||bytes[1]!==0x8b)return fail('INVALID_RUNTIME');if(await sha256(bytes)!==v.sha256)return fail('SHA256_MISMATCH');
 const prints={...gamePrint.check(v.prints),exe:v.key},gid=await gidFor(env,prints),t=sec(now);
 const old=await env.DB.prepare('SELECT sha256 FROM profile_runtime WHERE game_key=?').bind(v.key).first();
 if(old?.sha256===v.sha256){await env.DB.prepare('UPDATE profile_runtime SET reporters=reporters+1 WHERE game_key=?').bind(v.key).run();return json({ok:true,duplicate:true});}
 await env.BUCKET.put('profile-runtime/'+v.key+'.json.gz',bytes);
 await env.DB.prepare('INSERT INTO profile_runtime(game_key,identity,gid,prints,sha256,size,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(game_key) DO UPDATE SET identity=excluded.identity,gid=excluded.gid,prints=excluded.prints,sha256=excluded.sha256,size=excluded.size,reporters=profile_runtime.reporters+1,updated_at=excluded.updated_at').bind(v.key,v.identity||'',gid,JSON.stringify(prints),v.sha256,bytes.length,t).run();
 return json({ok:true},201);}

/* ---- ours ----------------------------------------------------------------------------------------------------------- */
async function picksGet(env,url,{json}){
 const rows=(await env.DB.prepare('SELECT body FROM auto_profile_picks WHERE stamp<>signed_stamp ORDER BY updated_at DESC LIMIT ?').bind(PROFILE_LIMITS.picks).all()).results||[];
 const picks=[];for(const r of rows){let d;try{d=JSON.parse(r.body);}catch{continue;}if(!await blockedProfile(env.DB,d))picks.push(d);}return json({picks});}
async function signedPost(request,env,now,{json,fail,readJSON}){const body=await readJSON(request,PROFILE_LIMITS.signed);if(body.error)return fail(body.error,400);const d=body.value?.diff;
 const v=validate(d);if(!v.ok)return fail('INVALID_DIFF_'+v.error);if(!SIGNED(d.signature))return fail('UNSIGNED');const t=sec(now),layer=d.layer||'version';
 if(await blockedProfile(env.DB,d))return fail('SEED_DELETED',410);
 const previous=await env.DB.prepare('SELECT body FROM game_diffs WHERE layer=? AND game_key=? AND source=? AND withdrawn_at IS NULL').bind(layer,d.key,d.source).first();let known=null;try{if(previous&&canonical(JSON.parse(previous.body))===canonical(d))known=previous.body;}catch{}let malware=null;if(!known){try{malware=await cleanForProfile(env.DB,d);}catch(e){return fail(e.code||'TORCH_MALWARE_UNAVAILABLE',e.status||503);}}
 if(d.source==='auto'){const p=await env.DB.prepare('SELECT stamp FROM auto_profile_picks WHERE layer=? AND game_key=?').bind(layer,d.key).first();
  if(!p||p.stamp!==await sha256(essence(d)))return fail('NOT_THE_CURRENT_PICK',409);
}
 else{/* 2026-11-21 rev only grows (docs/diff-layers.md: the app takes a relay diff over its built-in The Seed only with a higher
    rev): an official document needs a rev above the one stored, so an old signed copy can never roll a game back */
  const top=Math.max((await env.DB.prepare('SELECT MAX(rev) AS rev FROM game_diffs WHERE layer=? AND game_key=?').bind(layer,d.key).first())?.rev|0,(await env.DB.prepare('SELECT rev FROM auto_profile_picks WHERE layer=? AND game_key=?').bind(layer,d.key).first())?.rev|0);
  if(!Number.isSafeInteger(d.rev)||d.rev<1)return fail('REV_REQUIRED');if(d.rev<=top)return json({ok:false,error:'REV_NOT_NEWER',min:top+1},409);
  /* an official diff defines its game / build: its prints point here */const pr=gamePrint.check(d.prints||{});
  if(layer==='version')await register(env,'version',d.key,pr,['head','pe'],t);else await register(env,'game',d.key,pr,GAME_KINDS,t);}
 const tombstone=await profileBlock(d),guard=malware?{sql:'EXISTS(SELECT 1 FROM seed_malware_current m JOIN seed_admin_items i ON i.id=m.item_id WHERE m.artifact_key=? AND m.state=? AND m.revision=? AND m.identity_hash=? AND m.profile_hash=? AND m.item_id=? AND i.state<>? AND i.body=?)',args:[malware.artifactKey,'clean',malware.revision,malware.identityHash,malware.profileHash,malware.itemId,'deleted',malware.sourceBody]}:{sql:'EXISTS(SELECT 1 FROM game_diffs WHERE layer=? AND game_key=? AND source=? AND body=? AND withdrawn_at IS NULL)',args:[layer,d.key,d.source,known]};await env.DB.prepare('INSERT INTO game_diffs(layer,game_key,source,body,rev,updated_at) SELECT ?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM seed_admin_items WHERE '+tombstone.sql+') AND '+guard.sql+' ON CONFLICT(layer,game_key,source) DO UPDATE SET body=excluded.body,rev=excluded.rev,updated_at=excluded.updated_at,withdrawn_at=NULL').bind(layer,d.key,d.source,JSON.stringify(d),d.rev|0,t,...tombstone.args,...guard.args).run();if(await blockedProfile(env.DB,d))return fail('SEED_DELETED',410);const stored=await env.DB.prepare('SELECT body FROM game_diffs WHERE layer=? AND game_key=? AND source=? AND withdrawn_at IS NULL').bind(layer,d.key,d.source).first();if(!stored||canonical(JSON.parse(stored.body))!==canonical(d))return fail('TORCH_MALWARE_CHANGED',409);if(d.source==='auto')await env.DB.prepare('UPDATE auto_profile_picks SET signed_stamp=stamp WHERE layer=? AND game_key=?').bind(layer,d.key).run();
 if(d.source==='official'){if(layer==='version')await env.DB.prepare('UPDATE auto_profile_queue SET closed_at=? WHERE game_key=? AND closed_at IS NULL').bind(t,d.key).run();
  else await env.DB.prepare("UPDATE auto_profile_queue SET closed_at=? WHERE gid=? AND kind<>'newVersion' AND closed_at IS NULL").bind(t,d.key).run();/* a build that needs its own version layer stays open */}
 return json({ok:true,key:d.key,layer,source:d.source},201);}
async function withdraw(request,env,now,{json,fail,readJSON}){const body=await readJSON(request,4096);const v=body.value||{},key=String(v.key||''),source=v.source==='auto'?'auto':'official',layer=v.layer==='game'?'game':'version';if(!KEY.test(key))return fail('INVALID_KEY');
 const update=env.DB.prepare('UPDATE game_diffs SET withdrawn_at=? WHERE layer=? AND game_key=? AND source=?').bind(sec(now),layer,key,source);
 if(source==='auto'&&layer==='version'){
  const [job]=await env.DB.batch([env.DB.prepare("UPDATE ordinary_seed_jobs SET state='blocked' WHERE game_key=? AND state='published' AND revision=(SELECT rev FROM game_diffs WHERE layer='version' AND game_key=? AND source='auto')").bind(key,key),update]);
  if(job.meta.changes)await wakeClients(env);
 }else await update.run();return json({ok:true});}
async function queueGet(env,url,{json}){const all=url.searchParams.get('all')==='1';
 const rows=(await env.DB.prepare('SELECT game_key,gid,prints,exe,engine,reasons,note,kind,reporters,app,first_at,last_at,closed_at FROM auto_profile_queue'+(all?'':' WHERE closed_at IS NULL')+' ORDER BY last_at DESC LIMIT ?').bind(PROFILE_LIMITS.queue).all()).results||[];
 const j=(s,f)=>{try{return JSON.parse(s);}catch{return f;}};
 return json({queue:rows.map(r=>({key:r.game_key,game:r.gid||null,kind:r.kind,prints:j(r.prints,{}),exe:r.exe,engine:r.engine,reasons:j(r.reasons,[]),note:r.note,reporters:r.reporters,app:r.app,firstAt:r.first_at,lastAt:r.last_at,closedAt:r.closed_at||null}))});}
/* 2026-11-21 (owner: 闲时冷测试优先测修复队列里要求补测的) the open repair queue as the app needs it: hashes only (the exe key and
   the game identity), no names, no reasons. Public and cached; the app's idle-time cold test (services/cold-test.cjs) takes these
   games first. */
async function retestGet(env,url,{json}){const rows=(await env.DB.prepare('SELECT game_key,gid,last_at FROM auto_profile_queue WHERE closed_at IS NULL ORDER BY last_at DESC LIMIT ?').bind(PROFILE_LIMITS.queue).all()).results||[];
 const ordered=await retestOrder(env.DB,rows);return json({schema:'megulit.cold-retest',version:1,items:ordered.map(r=>({key:r.game_key,game:r.gid||null,at:r.last_at}))},200,{'cache-control':'no-store'});}
async function queueClose(request,env,now,{json,fail,readJSON}){const body=await readJSON(request,4096);const key=String(body.value?.key||'');if(!KEY.test(key))return fail('INVALID_KEY');
 await env.DB.prepare('UPDATE auto_profile_queue SET closed_at=? WHERE game_key=?').bind(sec(now),key).run();return json({ok:true});}
async function runtimeList(env,url,{json}){const rows=(await env.DB.prepare('SELECT game_key,identity,gid,prints,size,reporters,updated_at FROM profile_runtime ORDER BY updated_at DESC LIMIT 500').all()).results||[];
 return json({runtime:rows.map(r=>{let prints={};try{prints=JSON.parse(r.prints);}catch{}return {key:r.game_key,identity:r.identity,game:r.gid||null,prints,size:r.size,reporters:r.reporters,updatedAt:r.updated_at};})});}
async function runtimeGet(env,url,{fail}){const key=String(url.searchParams.get('key')||'');if(!KEY.test(key))return fail('INVALID_KEY');const o=await env.BUCKET.get('profile-runtime/'+key+'.json.gz');if(!o)return fail('NOT_FOUND',404);
 return new Response(o.body,{headers:{'content-type':'application/gzip','content-disposition':'attachment; filename="megulit-runtime-'+key.slice(0,16)+'.json.gz"','cache-control':'private, no-store'}});}

const OURS={'/api/game-profile/picks':['GET',picksGet,'q'],'/api/game-profile/queue':['GET',queueGet,'q'],'/api/game-profile/runtime/list':['GET',runtimeList,'q'],'/api/game-profile/runtime/get':['GET',runtimeGet,'q'],
 '/api/game-profile/signed':['POST',signedPost,'b'],'/api/game-profile/withdraw':['POST',withdraw,'b'],'/api/game-profile/queue/close':['POST',queueClose,'b']};
/* router; null when the path is not one of these */
export async function profileRoute(request,env,ip,now,url,path,deps){const {fail,hit}=deps,m=request.method;
 if(path==='/api/game-profile/ordinary-status'){const id=url.searchParams.get('id');if(m!=='GET'||!KEY.test(id||''))return fail('INVALID_REQUEST',400);const job=await ordinaryStatus(env.DB,id);return job?deps.json(job,200,{'cache-control':'no-store'}):fail('NOT_FOUND',404);}
 if(path==='/api/game-profile/report')return m==='POST'?(await hit(env,'autoprof-report',ip,now.getTime())?report(request,env,ip,now,deps):fail('RATE_LIMITED',429)):fail('METHOD_NOT_ALLOWED',405);
 if(path==='/api/game-profile/runtime')return m==='POST'?(await hit(env,'profile-runtime',ip,now.getTime())?runtimePost(request,env,ip,now,deps):fail('RATE_LIMITED',429)):fail('METHOD_NOT_ALLOWED',405);
 if(path==='/api/game-profile/credit')return m==='PUT'?(await hit(env,'autoprof-credit',ip,now.getTime())?creditPut(request,env,ip,now,deps,KEY):fail('RATE_LIMITED',429)):fail('METHOD_NOT_ALLOWED',405);
 const o=OURS[path];if(o){if(!ours(request,env))return fail('UNAUTHORIZED',401);if(m!==o[0])return fail('METHOD_NOT_ALLOWED',405);return o[2]==='q'?o[1](env,url,deps):o[1](request,env,now,deps);}
 /* no rate-limit row on reads (D1 write budget): the global per-IP limiter covers them */
 if(path==='/api/game-profile/retest')return m==='GET'?retestGet(env,url,deps):fail('METHOD_NOT_ALLOWED',405);
 if(path==='/api/game-profile'||path==='/api/game-profile/')return m==='GET'?lookup(env,url,'',deps):fail('METHOD_NOT_ALLOWED',405);
 const g=/^\/api\/game-profile\/([0-9a-f]{64})$/.exec(path);if(g)return m==='GET'?lookup(env,url,g[1],deps):fail('METHOD_NOT_ALLOWED',405);
 return null;}
export {unsigned};
