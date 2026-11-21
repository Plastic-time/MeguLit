// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-21 THE SEED counts for the dashboard (owner: 金色面板看 seed 总数、已确认多少、还有多少在等更多人传火).
   A seed = one game diff in the repository's "The Seed/<engine>/<slug>/game.json" (+ versions/<exeSha256>.json).
   Same count format as tools/gen-seed-stats.cjs ({games,versions}) plus status counts from each game.json.

   refreshSeedStats(env): 1 GitHub REST call (git tree of the branch, recursive) → paths; when the tree changed since the
   last run, 1 GraphQL call reads every game.json blob by oid (aliases, so one subrequest for all of them) → status.
   Stored per source in D1 seed_stats; seedSummary(env) sums all sources. putSeedStats(env,source,data) is the hook for
   seeds the relay keeps itself later (source 'community'): same data shape, summed into the panel automatically. */
import {cardinalVerifiedCount} from './cardinal.js';
export const SEED_STATUSES=['verified','owner-ok','read','skeleton'];
const repoOf=env=>/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPO||'')?env.GITHUB_REPO:'ilynthn/MeguLit';
const ghHeaders=env=>({...(env.GITHUB_TOKEN?{authorization:'Bearer '+env.GITHUB_TOKEN}:{}),accept:'application/vnd.github+json','x-github-api-version':'2022-11-28','user-agent':'megulit-relay'});
const clean=d=>{const status={};for(const k of SEED_STATUSES)status[k]=Math.max(0,Number(d?.status?.[k])||0);
 return {games:Math.max(0,Number(d?.games)||0),versions:Math.max(0,Number(d?.versions)||0),status,other:Math.max(0,Number(d?.other)||0),rev:String(d?.rev||'').slice(0,64)};};

export async function putSeedStats(env,source,data,now=new Date()){
 if(!env.DB||!/^[a-z0-9-]{1,32}$/.test(String(source||'')))return false;
 await env.DB.prepare('INSERT INTO seed_stats(source,data,at) VALUES(?,?,?) ON CONFLICT(source) DO UPDATE SET data=excluded.data, at=excluded.at')
  .bind(source,JSON.stringify(clean(data)),Math.floor(now.getTime()/1000)).run();return true;}

/* seeds in a list of tree paths; pure, so the tests can feed it a fake tree */
export function countTree(paths){const games=[],versions=new Set();
 for(const p of paths){const m=/^The Seed\/[^/]+\/[^/]+\/(?:game\.json|versions\/([^/]+)\.json)$/.exec(p.path||'');if(!m)continue;
  if(m[1])versions.add(m[1]);else games.push(p);}
 return {games,versions:versions.size};}

export async function refreshSeedStats(env,now=new Date(),{branch='main'}={}){
 if(!env.DB)return null;const f=env.fetch||fetch,repo=repoOf(env);
 const tr=await f(`https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,{headers:ghHeaders(env)});
 if(!tr.ok)throw new Error('tree HTTP '+tr.status);const tree=await tr.json();
 const {games,versions}=countTree(Array.isArray(tree?.tree)?tree.tree:[]);
 const prev=await env.DB.prepare("SELECT data FROM seed_stats WHERE source='github'").first().catch(()=>null);
 let old=null;try{old=prev?JSON.parse(prev.data):null;}catch{}
 const rev=String(tree?.sha||'');
 if(old&&old.rev&&old.rev===rev&&old.games===games.length){await putSeedStats(env,'github',old,now);return clean(old);}
 const status=Object.fromEntries(SEED_STATUSES.map(k=>[k,0]));let other=0,gqlError='';
 if(env.GITHUB_TOKEN&&games.length){const [owner,name]=repo.split('/');
  /* GraphQL: every game.json by blob oid in one query (≤100 per query keeps it small) */
  for(let i=0;i<games.length;i+=100){const part=games.slice(i,i+100);
   const q='query{repository(owner:'+JSON.stringify(owner)+',name:'+JSON.stringify(name)+'){'+part.map((g,k)=>'g'+k+':object(oid:'+JSON.stringify(g.sha)+'){...on Blob{text}}').join(' ')+'}}';
   const r=await f('https://api.github.com/graphql',{method:'POST',headers:{...ghHeaders(env),'content-type':'application/json'},body:JSON.stringify({query:q})});
   const j=await r.json().catch(()=>null);const repoData=j?.data?.repository;
   if(!repoData){gqlError='graphql '+String(j?.errors?.[0]?.message||'HTTP '+r.status).slice(0,100);other+=part.length;continue;}
   part.forEach((g,k)=>{let s='';try{s=String(JSON.parse(repoData['g'+k]?.text||'{}').status||'');}catch{}if(s in status)status[s]++;else other++;});}}
 else{other=games.length;if(games.length)gqlError='no GITHUB_TOKEN: statuses need the GraphQL API';}
 /* a GraphQL failure keeps the counts but not the rev, so the next run tries the statuses again */
 const data={games:games.length,versions,status,other,rev:gqlError?'':rev};await putSeedStats(env,'github',data,now);
 await noteError(env,'github',gqlError,now);return clean(data);}

/* the last refresh problem per source, shown on the panel (rows "x-<source>", never summed) */
async function noteError(env,source,error,now){try{
 if(!error){await env.DB.prepare('DELETE FROM seed_stats WHERE source=?').bind('x-'+source).run();return;}
 console.error('seed-stats',source,error);
 await env.DB.prepare('INSERT INTO seed_stats(source,data,at) VALUES(?,?,?) ON CONFLICT(source) DO UPDATE SET data=excluded.data, at=excluded.at')
  .bind('x-'+source,JSON.stringify({error:String(error).slice(0,160)}),Math.floor(now.getTime()/1000)).run();}catch{}}
/* cron / first-request entry: never throws, records why it failed */
export async function refreshSeedStatsSafe(env,now=new Date()){try{return await refreshSeedStats(env,now);}catch(e){await noteError(env,'github',String(e?.message||e),now);return null;}}

/* every source summed; {games,versions,status,other,confirmed,waiting,sources:[{source,games,at}],at} */
export async function seedSummary(env){
 const rows=((await env.DB.prepare('SELECT source,data,at FROM seed_stats ORDER BY source').all())?.results)||[];
 const out={games:0,versions:0,status:Object.fromEntries(SEED_STATUSES.map(k=>[k,0])),other:0,sources:[],at:0};
 for(const r of rows){if(String(r.source).startsWith('x-')){try{(out.errors??={})[String(r.source).slice(2)]=String(JSON.parse(r.data).error||'').slice(0,160);}catch{}continue;}
  let d;try{d=clean(JSON.parse(r.data));}catch{continue;}
  out.games+=d.games;out.versions+=d.versions;out.other+=d.other;for(const k of SEED_STATUSES)out.status[k]+=d.status[k];
  out.sources.push({source:String(r.source),games:d.games,versions:d.versions,at:r.at|0});out.at=Math.max(out.at,r.at|0);}
 /* 2026-11-21 auto diffs Cardinal verified count as confirmed too (relay/src/cardinal.js) */
 out.cardinal=await cardinalVerifiedCount(env);
 out.confirmed=out.status.verified+out.status['owner-ok']+out.cardinal;out.waiting=out.status.read+out.status.skeleton;
 return out;}

/* 2026-11-21 GET /api/seed/stats: the App's about page line (已种下 N 部游戏、M 个版本) live. Public, read-only, aggregate:
   {ok,games,versions,confirmed,waiting,updatedAt}. Open CORS (WebView origins vary), 5 min at the edge and in the
   Cache API, so many apps cost one D1 read per colo per 5 min. Empty table → background count, zeros + updatedAt 0. */
export async function seedStatsGet(env,{json,fail},ctx=null,now=new Date()){
 if(!env.DB)return fail('NOT_CONFIGURED',503);
 const c=globalThis.caches?.default,key='https://megulit-relay.internal/seed/public-v1';
 let body=null;if(c){try{const hit=await c.match(key);if(hit)body=await hit.json();}catch{}}
 if(!body){let s;try{s=await seedSummary(env);}catch{return fail('UNAVAILABLE',503);}
  body={ok:true,games:s.games,versions:s.versions,confirmed:s.confirmed,waiting:s.waiting,updatedAt:s.at};
  if(!s.sources.length){if(ctx?.waitUntil)ctx.waitUntil(refreshSeedStatsSafe(env,now));}
  else if(c){try{await c.put(key,new Response(JSON.stringify(body),{headers:{'content-type':'application/json','cache-control':'max-age=300'}}));}catch{}}}
 return json(body,200,{'access-control-allow-origin':'*','cache-control':body.updatedAt?'public, max-age=300':'no-store'});}
