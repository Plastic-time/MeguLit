// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-16 closed-beta live stats (owner: 我想看实时有多少人在使用 / 能监测的数据全都加上). A public, read-only,
   aggregate-only snapshot the dashboard (relay/src/dashboard.js) polls. No identities, no IPs, no e-mails, no names of
   people — counts, sums, and galgame titles only.

   pulse(env,ipHash,now): every MeguLit client request (worker.handle, by user-agent) marks the caller active in a 10-min
   bucket, one write per client per bucket (INSERT OR IGNORE), so "online" is the distinct callers in the last bucket.
   GET /api/probe/stats → {ok,now,online,active1h,today,probedGames,reporters,full,probeStates,vndbMatched,issues,recent,
                           steps,top,ext:{hourly,accounts,sync,leaderboard,mostRead,forum,social,avatars,adapters,contrib,
                           diagnostics,bundles,lookups,at}}
   D1 free tier counts rows read: the live part is cached 10 s and the wide aggregates (ext) 5 min in the Cache API, so
   many open dashboards cost about the same as one. Cleanup (cleanupProbeStats, cron): pulse rows older than a day go. */
import {seedSummary,refreshSeedStats} from './seed-stats.js';
const BUCKET=600;/* seconds: a 10-minute activity bucket */
export const nowBucket=now=>Math.floor(now.getTime()/1000/BUCKET);

/* record a live MeguLit client; cheap and deduped per 10-min bucket. never throws into the request path */
export async function pulse(env,ipHash,now){try{if(!env.DB||!/^[a-f0-9]{8,}$/.test(String(ipHash||'')))return;
 await env.DB.prepare('INSERT OR IGNORE INTO probe_pulse(ip_hash,bucket,at) VALUES(?,?,?)').bind(ipHash,nowBucket(now),Math.floor(now.getTime()/1000)).run();}catch{}}

const one=async(env,sql,...args)=>{try{return (await env.DB.prepare(sql).bind(...args).first())||{};}catch{return {};}};
const all=async(env,sql,...args)=>{try{return (await env.DB.prepare(sql).bind(...args).all()).results||[];}catch{return [];}};
const mb=bytes=>Math.round((Number(bytes)||0)/104857.6)/10;
/* the Cache API is there on the custom domains; tests and workers.dev simply compute every time */
async function cached(key,ttl,fn){const c=globalThis.caches?.default,url='https://megulit-relay.internal/stats/'+key;
 if(c){try{const hit=await c.match(url);if(hit)return await hit.json();}catch{}}
 const v=await fn();if(c){try{await c.put(url,new Response(JSON.stringify(v),{headers:{'content-type':'application/json','cache-control':'max-age='+ttl}}));}catch{}}return v;}

async function live(env,now){
 /* "today" is the players' day (Beijing time, UTC+8), not the Worker's UTC day */
 const t=Math.floor(now.getTime()/1000),dayStart=Math.floor((t+8*3600)/86400)*86400-8*3600;
 const b=nowBucket(now),todayBucket=Math.floor(dayStart/BUCKET);
 const online=(await one(env,'SELECT COUNT(DISTINCT ip_hash) n FROM probe_pulse WHERE bucket>=?',b-1)).n|0;
 const active1h=(await one(env,'SELECT COUNT(DISTINCT ip_hash) n FROM probe_pulse WHERE bucket>=?',b-6)).n|0;
 const today=(await one(env,'SELECT COUNT(DISTINCT ip_hash) n FROM probe_pulse WHERE bucket>=?',todayBucket)).n|0;
 /* pulse detail: 10-min series for the last 6 h, rolling 24 h, the busiest 10 min, time online today */
 const series=new Map((await all(env,'SELECT bucket b, COUNT(DISTINCT ip_hash) n FROM probe_pulse WHERE bucket>? GROUP BY bucket',b-36)).map(r=>[r.b|0,r.n|0])),s6=[];
 for(let k=b-35;k<=b;k++)s6.push({at:k*BUCKET,n:series.get(k)||0});
 const d24=(await one(env,'SELECT COUNT(DISTINCT ip_hash) n FROM probe_pulse WHERE bucket>?',b-144)).n|0;
 const pk10=(await one(env,'SELECT MAX(n) m FROM (SELECT COUNT(DISTINCT ip_hash) n FROM probe_pulse WHERE bucket>? GROUP BY bucket)',b-144)).m|0;
 const ss=await one(env,'SELECT AVG(c) avg, COALESCE(SUM(CASE WHEN c>=6 THEN 1 ELSE 0 END),0) long FROM (SELECT COUNT(*) c FROM probe_pulse WHERE bucket>=? GROUP BY ip_hash)',todayBucket);
 const pg=await one(env,'SELECT COUNT(*) games, COALESCE(SUM(reporters),0) reporters FROM probe_games');
 const pf=await one(env,"SELECT COUNT(*) games, COALESCE(SUM(CASE WHEN state='ready' THEN 1 ELSE 0 END),0) ready, COALESCE(SUM(CASE WHEN state='uploading' THEN 1 ELSE 0 END),0) uploading, COALESCE(SUM(CASE WHEN state='done' THEN 1 ELSE 0 END),0) done, COALESCE(SUM(CASE WHEN state='ready' THEN size ELSE 0 END),0) bytes FROM probe_full");
 const top=(await all(env,"SELECT title, reporters, state, step, size FROM probe_full WHERE title<>'' ORDER BY reporters DESC, updated_at DESC LIMIT 24"))
  .map(r=>({title:String(r.title).slice(0,80),reporters:r.reporters|0,step:String(r.step||''),state:String(r.state||''),mb:mb(r.size),full:true}));
 /* the newest full dumps and why games fail */
 const recent=(await all(env,"SELECT title,state,step,size,updated_at FROM probe_full WHERE title<>'' ORDER BY updated_at DESC LIMIT 8"))
  .map(r=>({title:String(r.title).slice(0,80),state:String(r.state||''),step:String(r.step||''),mb:mb(r.size),at:r.updated_at|0}));
 const steps=(await all(env,"SELECT step, COUNT(*) n FROM probe_full GROUP BY step ORDER BY n DESC LIMIT 12")).map(r=>({step:String(r.step||'?')||'?',n:r.n|0}));
 /* probe quality and matching, from the desensitized probes (probe_games) */
 const pstates=(await all(env,"SELECT state, COUNT(*) n FROM probe_games GROUP BY state ORDER BY n DESC")).map(r=>({state:String(r.state||'?'),n:r.n|0}));
 const pv=await one(env,"SELECT COALESCE(SUM(CASE WHEN vndb<>'' THEN 1 ELSE 0 END),0) vndb, COALESCE(SUM(CASE WHEN issue_url<>'' THEN 1 ELSE 0 END),0) issues FROM probe_games");
 /* more about the full dumps: sizes, pace, expiry, in-flight uploads, client versions */
 const fx=await one(env,"SELECT MIN(size) mn, MAX(size) mx, COALESCE(SUM(reporters),0) rep, COALESCE(SUM(CASE WHEN created_at>? THEN 1 ELSE 0 END),0) d1, COALESCE(SUM(CASE WHEN created_at>? THEN 1 ELSE 0 END),0) d7, COALESCE(SUM(CASE WHEN state='ready' AND expires_at<? THEN 1 ELSE 0 END),0) expiring, MIN(CASE WHEN state='ready' THEN created_at END) oldest, COALESCE(SUM(CASE WHEN vndb<>'' THEN 1 ELSE 0 END),0) vndb FROM probe_full",t-86400,t-7*86400,t+7*86400);
 const inflight=(await all(env,"SELECT f.title title, f.size size, f.parts parts, COUNT(p.part) got, COALESCE(SUM(p.size),0) bytes, f.updated_at at FROM probe_full f LEFT JOIN probe_full_parts p ON p.identity=f.identity WHERE f.state='uploading' GROUP BY f.identity ORDER BY f.updated_at DESC LIMIT 5"))
  .map(r=>({title:String(r.title||'?').slice(0,60),mb:mb(r.size),parts:r.parts|0,got:r.got|0,pct:r.size?Math.min(100,Math.round((r.bytes||0)/r.size*100)):0,at:r.at|0}));
 const apps=(await all(env,"SELECT app, COUNT(*) n FROM probe_full GROUP BY app ORDER BY n DESC LIMIT 5")).map(r=>({app:String(r.app||'?').slice(0,24)||'?',n:r.n|0}));
 /* what players are reading lately (leaderboard game rows, opted-in players only) */
 const playing=(await all(env,'SELECT MAX(title) title, COUNT(*) readers, COALESCE(SUM(characters),0) characters, COALESCE(SUM(seconds),0) seconds, MAX(updated_at) at FROM leaderboard_games WHERE updated_at>? GROUP BY game_key ORDER BY at DESC LIMIT 10',t-7*86400))
  .map(r=>({title:String(r.title||'').slice(0,80),readers:r.readers|0,characters:Number(r.characters)||0,seconds:Number(r.seconds)||0,at:r.at|0}));
 return {ok:true,now:t,online,active1h,today,series:s6,active24h:d24,peak10:pk10,avgMinToday:Math.round((Number(ss.avg)||0)*10),longToday:ss.long|0,probedGames:pg.games|0,reporters:pg.reporters|0,
  full:{minMB:mb(fx.mn),maxMB:mb(fx.mx),reporters:fx.rep|0,d1:fx.d1|0,d7:fx.d7|0,expiring:fx.expiring|0,oldestAt:fx.oldest|0,vndb:fx.vndb|0,inflight,apps,lastAt:recent.length?recent[0].at:0,games:pf.games|0,ready:pf.ready|0,uploading:pf.uploading|0,done:pf.done|0,storedMB:Math.round((Number(pf.bytes)||0)/1048576*10)/10,limitMB:8192},
  probeStates:pstates,vndbMatched:pv.vndb|0,issues:pv.issues|0,playing,recent,steps,top:top.sort((a,c)=>c.reporters-a.reporters).slice(0,24)};}

/* everything else the relay can count, aggregate only */
async function wide(env,now){
 const t=Math.floor(now.getTime()/1000),d7=t-7*86400,b=nowBucket(now);
 /* online per hour over the last 24 h (pulse keeps a day) */
 const hrows=await all(env,'SELECT (bucket/6) h, COUNT(DISTINCT ip_hash) n FROM probe_pulse WHERE bucket>? GROUP BY bucket/6',b-144);
 const nowH=Math.floor(b/6),hmap=new Map(hrows.map(r=>[r.h|0,r.n|0])),hourly=[];
 for(let h=nowH-23;h<=nowH;h++)hourly.push({at:h*3600,n:hmap.get(h)||0});
 const ac=await one(env,'SELECT COUNT(*) total, COALESCE(SUM(CASE WHEN created_at>? THEN 1 ELSE 0 END),0) new7d, COALESCE(SUM(CASE WHEN last_login_at>? THEN 1 ELSE 0 END),0) active7d FROM accounts',d7,d7);
 const ses=await one(env,'SELECT COUNT(*) n FROM account_sessions WHERE expires_at>?',t);
 const sync=await one(env,'SELECT COUNT(*) n, COUNT(DISTINCT account_id) accounts FROM sync_records WHERE deleted=0');
 const syncKinds=(await all(env,'SELECT kind, COUNT(*) n FROM sync_records WHERE deleted=0 GROUP BY kind ORDER BY n DESC LIMIT 8')).map(r=>({kind:String(r.kind).slice(0,24),n:r.n|0}));
 const lu=await one(env,'SELECT COUNT(*) users, COALESCE(SUM(CASE WHEN share_games>0 THEN 1 ELSE 0 END),0) sharing, COALESCE(SUM(CASE WHEN updated_at>? THEN 1 ELSE 0 END),0) active7d FROM leaderboard_users',d7);
 const periods=(await all(env,'SELECT period, COUNT(DISTINCT period_key) keys, COALESCE(SUM(characters),0) characters, COALESCE(SUM(seconds),0) seconds, COALESCE(SUM(words),0) words FROM leaderboard_stats GROUP BY period LIMIT 6'))
  .map(r=>({period:String(r.period).slice(0,12),keys:r.keys|0,characters:Number(r.characters)||0,seconds:Number(r.seconds)||0,words:Number(r.words)||0}));
 const lg=await one(env,'SELECT COUNT(DISTINCT game_key) games, COALESCE(SUM(characters),0) characters, COALESCE(SUM(seconds),0) seconds FROM leaderboard_games');
 const mostRead=(await all(env,'SELECT MAX(title) title, COUNT(*) readers, SUM(characters) characters, SUM(seconds) seconds FROM leaderboard_games GROUP BY game_key ORDER BY characters DESC LIMIT 10'))
  .map(r=>({title:String(r.title||'').slice(0,80),readers:r.readers|0,characters:Number(r.characters)||0,seconds:Number(r.seconds)||0}));
 const fp=await one(env,'SELECT COUNT(*) posts, COALESCE(SUM(CASE WHEN created_at>? THEN 1 ELSE 0 END),0) posts7d, COUNT(DISTINCT author) authors FROM forum_posts WHERE deleted=0',d7);
 const fr=await one(env,'SELECT COUNT(*) replies, COALESCE(SUM(CASE WHEN created_at>? THEN 1 ELSE 0 END),0) replies7d FROM forum_replies WHERE deleted=0',d7);
 const tags=(await all(env,'SELECT tag, COUNT(*) n FROM forum_posts WHERE deleted=0 GROUP BY tag ORDER BY n DESC LIMIT 6')).map(r=>({tag:String(r.tag).slice(0,24),n:r.n|0}));
 const pr=await one(env,'SELECT COUNT(*) profiles, COALESCE(SUM(CASE WHEN public=1 THEN 1 ELSE 0 END),0) public FROM profiles');
 const fo=await one(env,'SELECT COUNT(*) n FROM follows');
 const avatars=(await all(env,'SELECT status, COUNT(*) n FROM avatars GROUP BY status ORDER BY n DESC')).map(r=>({status:String(r.status).slice(0,16),n:r.n|0}));
 const pk=await one(env,'SELECT COUNT(*) packs, COALESCE(SUM(CASE WHEN withdrawn_at IS NOT NULL THEN 1 ELSE 0 END),0) withdrawn, COUNT(DISTINCT id) ids FROM adapter_packs');
 const reports=(await all(env,'SELECT state, COUNT(*) n, COALESCE(SUM(reporters),0) reporters FROM adapter_reports GROUP BY state ORDER BY n DESC')).map(r=>({state:String(r.state).slice(0,16),n:r.n|0,reporters:r.reporters|0}));
 const rec=await one(env,'SELECT COUNT(*) n, COALESCE(SUM(reports),0) reports, COALESCE(SUM(CASE WHEN updated_at>? THEN 1 ELSE 0 END),0) n7d FROM adaptation_records',d7);
 const req=await one(env,'SELECT COUNT(*) n, COALESCE(SUM(CASE WHEN closed_at IS NULL THEN 1 ELSE 0 END),0) open FROM adapter_probe_requests');
 const contrib=(await all(env,'SELECT state, COUNT(*) n, COALESCE(SUM(size),0) bytes FROM contrib_uploads GROUP BY state ORDER BY n DESC')).map(r=>({state:String(r.state).slice(0,16),n:r.n|0,mb:mb(r.bytes)}));
 const dg=await one(env,'SELECT COUNT(*) n, COALESCE(SUM(CASE WHEN created_at>? THEN 1 ELSE 0 END),0) n7d, COALESCE(SUM(size),0) bytes, COALESCE(SUM(CASE WHEN issue_url<>? THEN 1 ELSE 0 END),0) issues FROM diagnostics',d7,'');
 const bd=await one(env,'SELECT COUNT(*) n, COALESCE(SUM(size),0) bytes, COALESCE(SUM(CASE WHEN created_at>? THEN 1 ELSE 0 END),0) n7d FROM probe_bundles',d7);
 const wk=await one(env,'SELECT week_key FROM hot_lookups ORDER BY week_key DESC LIMIT 1');
 const lk=wk.week_key?await one(env,'SELECT COUNT(DISTINCT id_hash) users, COUNT(DISTINCT term) terms, COALESCE(SUM(count),0) lookups FROM hot_lookups WHERE week_key=?',wk.week_key):{};
 return {at:t,hourly,
  accounts:{total:ac.total|0,new7d:ac.new7d|0,active7d:ac.active7d|0,sessions:ses.n|0},
  sync:{records:sync.n|0,accounts:sync.accounts|0,kinds:syncKinds},
  leaderboard:{users:lu.users|0,sharing:lu.sharing|0,active7d:lu.active7d|0,games:lg.games|0,characters:Number(lg.characters)||0,seconds:Number(lg.seconds)||0,periods},
  mostRead,
  forum:{posts:fp.posts|0,posts7d:fp.posts7d|0,authors:fp.authors|0,replies:fr.replies|0,replies7d:fr.replies7d|0,tags},
  social:{profiles:pr.profiles|0,public:pr.public|0,follows:fo.n|0},avatars,
  adapters:{packs:pk.packs|0,ids:pk.ids|0,withdrawn:pk.withdrawn|0,reports,records:rec.n|0,recordReports:rec.reports|0,records7d:rec.n7d|0,requests:req.n|0,openRequests:req.open|0},
  contrib,diagnostics:{total:dg.n|0,n7d:dg.n7d|0,mb:mb(dg.bytes),issues:dg.issues|0},bundles:{total:bd.n|0,n7d:bd.n7d|0,mb:mb(bd.bytes)},
  lookups:{week:String(wk.week_key||''),users:lk.users|0,terms:lk.terms|0,count:Number(lk.lookups)||0}};}

/* ---- service quota: usage against the free plans the relay runs on (refreshed every 10 min) -------------------------
   Without a token: D1 size (every D1 result carries meta.size_after) and GitHub's API budget (GITHUB_TOKEN, the
   rate_limit call itself is free). With CF_API_TOKEN (Account Analytics: Read) + CF_ACCOUNT_ID (wrangler secrets):
   Workers requests, D1 rows read / written, D1 and R2 storage, R2 class A / B operations, Workers AI neurons, from the
   GraphQL Analytics API. Each dataset is its own query, so one unknown field only blanks its own row. */
export const FREE={workersReq:100000,d1Read:5e6,d1Write:1e5,d1Bytes:5*1024**3,r2Bytes:10*1024**3,r2A:1e6,r2B:1e7,aiNeurons:1e4};
const R2_CLASS_A=new Set(['ListBuckets','PutBucket','ListObjects','ListObjectsV2','PutObject','CopyObject','CompleteMultipartUpload','CreateMultipartUpload','UploadPart','UploadPartCopy','ListMultipartUploads','ListParts','PutBucketEncryption','PutBucketCors','PutBucketLifecycleConfiguration','LifecycleStorageTierTransition']);
async function gql(env,query,variables){const r=await (env.fetch||fetch)('https://api.cloudflare.com/client/v4/graphql',{method:'POST',headers:{authorization:'Bearer '+env.CF_API_TOKEN,'content-type':'application/json'},body:JSON.stringify({query,variables})});
 const j=await r.json().catch(()=>null);if(!j||(j.errors&&j.errors.length)||!j.data)throw new Error(String(j?.errors?.[0]?.message||'HTTP '+r.status).slice(0,90));return j.data.viewer?.accounts?.[0]?.x||[];}
async function quota(env,now){
 const out={at:Math.floor(now.getTime()/1000),token:!!(env.CF_API_TOKEN&&env.CF_ACCOUNT_ID),limits:FREE,items:{},errors:{}};
 try{const r=await env.DB.prepare('SELECT 1').all();const z=Number(r?.meta?.size_after)||0;if(z)out.items.d1Bytes=z;}catch{}
 if(out.token){const a=env.CF_ACCOUNT_ID,d=now.toISOString().slice(0,10),m=d.slice(0,8)+'01';
  const q=(set,vars,decl)=>'query('+decl+'){viewer{accounts(filter:{accountTag:$a}){x:'+set+'}}}';
  const run=async(key,query,vars,pick)=>{try{Object.assign(out.items,pick(await gql(env,query,vars)));}catch(e){out.errors[key]=String(e?.message||e).slice(0,90);}};
  const sum=(rows,f)=>rows.reduce((n,r)=>n+(Number(f(r))||0),0);
  await Promise.all([
   run('workers',q('workersInvocationsAdaptive(limit:10000,filter:{date_geq:$d}){sum{requests errors subrequests}}',0,'$a:String!,$d:Date!'),{a,d},rows=>({workersReq:sum(rows,r=>r.sum.requests),workersErr:sum(rows,r=>r.sum.errors)})),
   run('d1',q('d1AnalyticsAdaptiveGroups(limit:10000,filter:{date_geq:$d}){sum{readQueries writeQueries rowsRead rowsWritten}}',0,'$a:String!,$d:Date!'),{a,d},rows=>({d1Read:sum(rows,r=>r.sum.rowsRead),d1Write:sum(rows,r=>r.sum.rowsWritten),d1Queries:sum(rows,r=>r.sum.readQueries)+sum(rows,r=>r.sum.writeQueries)})),
   run('d1size',q('d1StorageAdaptiveGroups(limit:100,filter:{date_geq:$d}){max{databaseSizeBytes}dimensions{databaseId}}',0,'$a:String!,$d:Date!'),{a,d},rows=>rows.length?{d1Bytes:sum(rows,r=>r.max.databaseSizeBytes)}:{}),
   run('r2size',q('r2StorageAdaptiveGroups(limit:100,filter:{date_geq:$d}){max{payloadSize metadataSize objectCount}dimensions{bucketName}}',0,'$a:String!,$d:Date!'),{a,d},rows=>rows.length?{r2Bytes:sum(rows,r=>r.max.payloadSize)+sum(rows,r=>r.max.metadataSize),r2Objects:sum(rows,r=>r.max.objectCount)}:{}),
   run('r2ops',q('r2OperationsAdaptiveGroups(limit:10000,filter:{date_geq:$m}){sum{requests}dimensions{actionType}}',0,'$a:String!,$m:Date!'),{a,m},rows=>({r2A:sum(rows.filter(r=>R2_CLASS_A.has(r.dimensions.actionType)),r=>r.sum.requests),r2B:sum(rows.filter(r=>!R2_CLASS_A.has(r.dimensions.actionType)),r=>r.sum.requests)})),
   run('ai',q('aiInferenceAdaptiveGroups(limit:10000,filter:{date_geq:$d}){sum{totalNeurons}}',0,'$a:String!,$d:Date!'),{a,d},rows=>({aiNeurons:sum(rows,r=>r.sum.totalNeurons)}))]);}
 if(env.GITHUB_TOKEN){try{const r=await (env.fetch||fetch)('https://api.github.com/rate_limit',{headers:{authorization:'Bearer '+env.GITHUB_TOKEN,accept:'application/vnd.github+json','user-agent':'megulit-relay'}});const c=(await r.json())?.resources?.core;
  if(c){out.items.ghUsed=c.used|0;out.items.ghLimit=c.limit|0;out.items.ghReset=c.reset|0;}}catch(e){out.errors.github=String(e?.message||e).slice(0,90);}}
 return out;}

/* 2026-11-21 each section stands alone: one failing (D1 hiccup, GitHub down) leaves the others and reports itself in
   errors{}, instead of failing the whole response. seed = THE SEED panel (seed-stats.js), cached 60 s; when no source
   has been counted yet the first stats call kicks a refresh in the background. */
export async function probeStats(env,now,{json,fail},ctx=null){
 if(!env.DB)return fail('NOT_CONFIGURED',503);
 const parts=[['live',10,()=>live(env,now)],['wide',300,()=>wide(env,now)],['quota-v2',600,()=>quota(env,now)],['seed',60,()=>seedSummary(env)]];
 const got=await Promise.allSettled(parts.map(([k,ttl,fn])=>cached(k,ttl,fn))),errors={};
 const val=i=>{if(got[i].status==='fulfilled')return got[i].value;errors[parts[i][0]]=String(got[i].reason?.message||got[i].reason).slice(0,120);return null;};
 const base=val(0)||{ok:true,now:Math.floor(now.getTime()/1000)},ext=val(1),q=val(2),seed=val(3);
 if(seed&&!seed.sources.length&&ctx?.waitUntil)ctx.waitUntil(refreshSeedStats(env,now).catch(()=>null));
 return json({...base,ext,quota:q,seed,errors},200,{'access-control-allow-origin':'*','cache-control':'public, max-age=10'});}

export async function cleanupProbeStats(env,now=new Date()){if(!env.DB)return {removed:0};
 try{const r=await env.DB.prepare('DELETE FROM probe_pulse WHERE bucket<?').bind(nowBucket(now)-144).run();return {removed:r?.meta?.changes|0};}catch{return {removed:0};}}
