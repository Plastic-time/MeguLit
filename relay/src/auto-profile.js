// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-21 (owner: 游戏差分全自动生成, the server half) auto game diffs: every PC calibrates a game on its first play
   (core/auto-profile.cjs) and reports the result; the relay keeps one row per game and reporter and hands out the agreed best
   one, which the app uses as the profile's auto layer when this PC has no calibration of its own. Free tier: one D1 upsert per
   report (+ its rate-limit row), reads are a single indexed SELECT (the app keeps its copy per game). Format: docs/auto-profile.md.

   POST /api/auto-profile/report   {version:1,profile:{key,engine,exe,version,source,mode,settings,score:{cost,metrics}}}
   GET  /api/auto-profile/<key>    {schema:'megulit.auto-profile',version:1,key,mode,settings,agree,reporters,cost,at}
                                   404 NOT_FOUND while no result is shared by at least AGREE reporters

   The pick: rows of the last KEEP_DAYS days; the same settings (canonical JSON) from different reporters are one group.
   Read mode wins when more than half of all reporters ended in read mode (the gate saw this game break) and at least AGREE
   of them did. Otherwise the hide group with the lowest mean cost (best score) among the groups of at least AGREE reporters,
   more reporters breaking a tie. Settings are reduced to the tunable keys below before anything is stored. */
export const AUTO_LIMITS={body:16*1024,filters:20,filterChars:200,agree:2,keepDays:180};
const KEY=/^[a-z0-9][a-z0-9-]{1,62}$/,SEMVER=/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const METRICS=['hideVisible','dropRate','repeatRate','choiceMismatch','positionPx','pairRate'];
const encoder=new TextEncoder();
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
async function sha256(s){return hex(await crypto.subtle.digest('SHA-256',encoder.encode(s)));}
function canonical(v){if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';return JSON.stringify(v);}
const num=(v,lo,hi)=>{const n=Number(v);return Number.isFinite(n)?Math.max(lo,Math.min(hi,n)):null;};
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);

/* only the tunable keys of a game diff, each checked; anything else is dropped */
export function cleanSettings(s){const out={};if(!plain(s))return out;
 const c=s.calibrate;if(plain(c)){const o={};if(['engine','glyph','ocr',null].includes(c.positionSource))o.positionSource=c.positionSource;if(['hide','read','engine','glyph','gpu',null].includes(c.hideMethod))o.hideMethod=c.hideMethod;
  const b=c.textBox;if(b===null)o.textBox=null;else if(plain(b)&&['x','y','w','h'].every(k=>num(b[k],-1e5,1e5)!==null)){o.textBox={x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.w),h:Math.round(b.h)};if(Array.isArray(b.client)&&b.client.length===2&&b.client.every(v=>num(v,1,1e5)!==null))o.textBox.client=b.client.map(v=>Math.round(v));}
  if(Object.keys(o).length)out.calibrate=o;}
 if(plain(s.page)&&[null,true,false].includes(s.page.effectFrames))out.page={effectFrames:s.page.effectFrames};
 if(plain(s.hide)&&typeof s.hide.textEffectsRead==='boolean')out.hide={textEffectsRead:s.hide.textEffectsRead};
 if(plain(s.placement)&&[null,'glyph','box','page'].includes(s.placement.firstLineAnchor))out.placement={firstLineAnchor:s.placement.firstLineAnchor};
 if(plain(s.choice)&&Array.isArray(s.choice.filters)&&s.choice.filters.length<=AUTO_LIMITS.filters&&s.choice.filters.every(f=>typeof f==='string'&&f.length<=AUTO_LIMITS.filterChars)){
  const ok=s.choice.filters.filter(f=>{try{new RegExp(f,'u');return true;}catch{return false;}});out.choice={filters:ok};}
 return out;}
export function validateReport(body){const p=body?.profile;if(body?.version!==1||!plain(p))return {ok:false,error:'INVALID_REPORT'};
 const key=String(p.key||'');if(!KEY.test(key))return {ok:false,error:'INVALID_KEY'};
 const mode=p.mode;if(mode!=='hide'&&mode!=='read')return {ok:false,error:'INVALID_MODE'};
 const settings=cleanSettings(p.settings);if(mode==='read')settings.hide={textEffectsRead:true};
 const metrics={};const m=p.score?.metrics;if(plain(m))for(const k of METRICS){const v=m[k];metrics[k]=v===null||v===undefined?null:num(v,-1,1e6);}
 return {ok:true,value:{key,mode,settings,source:p.source==='gate'?'gate':'calibration',cost:num(p.score?.cost,0,1e6)??0,metrics,
  engine:String(p.engine||'').toLowerCase().replace(/[^a-z0-9-]/g,'').slice(0,32),exe:String(p.exe||'').toLowerCase().replace(/[\\/:*?"<>|]/g,'').slice(0,80),app:SEMVER.test(String(p.version||''))?String(p.version):''}};}

async function report(request,env,ip,now,{json,fail,readJSON}){
 const body=await readJSON(request,AUTO_LIMITS.body);if(body.error)return fail(body.error,body.error==='PAYLOAD_TOO_LARGE'?413:400);
 const v=validateReport(body.value);if(!v.ok)return fail(v.error);const r=v.value,text=canonical(r.settings),hash=(await sha256(r.mode+'|'+text)).slice(0,32);
 await env.DB.prepare('INSERT INTO auto_profile_reports(game_key,reporter,settings_hash,settings,mode,source,cost,metrics,engine,exe,app,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(game_key,reporter) DO UPDATE SET settings_hash=excluded.settings_hash,settings=excluded.settings,mode=excluded.mode,source=excluded.source,cost=excluded.cost,metrics=excluded.metrics,engine=excluded.engine,exe=excluded.exe,app=excluded.app,updated_at=excluded.updated_at')
  .bind(r.key,ip,hash,text,r.mode,r.source,r.cost,JSON.stringify(r.metrics),r.engine,r.exe,r.app,Math.floor(now.getTime()/1000)).run();
 return json({ok:true},201);}

/* the agreed best result of one game from its rows, or null */
export function pick(rows,{agree=AUTO_LIMITS.agree}={}){if(!rows.length)return null;const groups=new Map();
 for(const r of rows){let g=groups.get(r.settings_hash);if(!g){g={hash:r.settings_hash,mode:r.mode,settings:r.settings,n:0,cost:0,at:0};groups.set(r.settings_hash,g);}g.n++;g.cost+=Number(r.cost)||0;g.at=Math.max(g.at,Number(r.updated_at)||0);}
 const all=[...groups.values()].map(g=>({...g,cost:g.cost/g.n})),total=rows.length,readN=rows.filter(r=>r.mode==='read').length;
 const out=g=>{let settings={};try{settings=JSON.parse(g.settings);}catch{}return {mode:g.mode,settings,agree:g.n,reporters:total,cost:Math.round(g.cost*1000)/1000,at:g.at};};
 if(readN*2>total&&readN>=agree){const reads=all.filter(g=>g.mode==='read').sort((a,b)=>b.n-a.n||b.at-a.at);const g=reads[0];return {...out(g),agree:readN};}
 const hide=all.filter(g=>g.mode==='hide'&&g.n>=agree).sort((a,b)=>a.cost-b.cost||b.n-a.n||b.at-a.at);return hide[0]?out(hide[0]):null;}
async function get(env,key,now,{json,fail}){if(!KEY.test(key))return fail('NOT_FOUND',404);
 const since=Math.floor(now.getTime()/1000)-AUTO_LIMITS.keepDays*86400;
 const rows=(await env.DB.prepare('SELECT settings_hash,settings,mode,cost,updated_at FROM auto_profile_reports WHERE game_key=? AND updated_at>=? ORDER BY updated_at DESC LIMIT 500').bind(key,since).all()).results||[];
 const p=pick(rows);if(!p)return fail('NOT_FOUND',404,{'cache-control':'public, max-age=900'});
 return json({schema:'megulit.auto-profile',version:1,key,...p},200,{'cache-control':'public, max-age=3600'});}

/* router; null when the path is not one of these */
export async function autoProfileRoute(request,env,ip,now,url,path,deps){const {fail,hit}=deps,m=request.method;
 if(path==='/api/auto-profile/report')return m==='POST'?(await hit(env,'autoprof-report',ip,now.getTime())?report(request,env,ip,now,deps):fail('RATE_LIMITED',429)):fail('METHOD_NOT_ALLOWED',405);
 const g=/^\/api\/auto-profile\/([a-z0-9][a-z0-9-]{1,62})$/.exec(path);
 /* no rate-limit row on reads (D1 write budget): the global per-IP limiter covers them */
 if(g)return m==='GET'?get(env,g[1],now,deps):fail('METHOD_NOT_ALLOWED',405);
 return null;}
