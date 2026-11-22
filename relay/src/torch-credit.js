// SPDX-License-Identifier: GPL-3.0-or-later
/* Each accepted upload receives a stable receipt. Public inscriptions are a separate,
   account-and-work-scoped projection. Migration 0036 preserves the historical ledger. */
import {carvingFor,engrave,nameKey,rosterOwner} from './torch-roster.js';
export const MAX_NAME=30;
const ZERO_WIDTH=new RegExp('['+['\u200b-\u200f','\u2028-\u202e','\u2060-\u206f','\u180e','\ufeff','\u00ad','\ufff9-\ufffb'].join('')+']','g'),CONTROL=new RegExp('[\u0000-\u001f\u007f-\u009f]','g');
const LINKISH=/[@＠]|:\/\/|www\.|https?|[a-z0-9][.。．][a-z]{2,}|\.(com|net|org|cn|jp|io|me|cc|xyz|top|tv|gg)\b/i;
/* matched on the name with spaces, punctuation and case removed */
export const BLOCKED=['管理员','客服','官方','megulit','惠惠官','admin','official','moderator','傻逼','煞笔','操你','肏','妈的','nmsl','cnm','fuck','shit','bitch','nigger','nigga','faggot','nazi','hitler','porn','色情','约炮','强奸','习近平','毛泽东','台独','法轮'];
const fold=s=>s.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}_]+/gu,'');
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
const sec=now=>Math.floor(now.getTime()/1000);

/* → {ok:true,present:bool,name:string|null|undefined} (name undefined = not mentioned; null = anonymous / withdrawn) or {ok:false} */
export function cleanName(raw,env={}){
 if(raw===null)return {ok:true,name:null};
 if(typeof raw!=='string')return {ok:false};
 const s=raw.normalize('NFC').replace(ZERO_WIDTH,'').replace(CONTROL,' ').replace(/\s+/g,' ').trim();
 const n=[...s].length;if(n<1||n>MAX_NAME)return {ok:false};
 if(LINKISH.test(s)||LINKISH.test(s.normalize('NFKC')))return {ok:false};
 const f=fold(s),extra=String(env.CREDIT_BLOCKLIST||'').split(',').map(x=>fold(x.trim())).filter(Boolean);
 if(!f||[...BLOCKED.map(fold),...extra].some(w=>w&&f.includes(w)))return {ok:true,name:null,blocked:true};
 return {ok:true,name:s};}

export function parseCredit(credit,env){
 if(credit===undefined)return {ok:true,present:false};
 if(!plain(credit))return {ok:false};
 for(const k of Object.keys(credit))if(k!=='name')return {ok:false};
 if(!('name' in credit)||credit.name===undefined)return {ok:true,present:true};
 const c=cleanName(credit.name,env);return c.ok?{ok:true,present:true,name:c.name}:{ok:false};}

export const monthOf=at=>new Date((at|0)*1000).toISOString().slice(0,7);
export const creditOut=r=>r?{torchNo:r.torch_no,name:r.name??null,at:r.at|0,...(!r.name&&r.alias?{alias:r.alias}:{})}:null;

// Keep the receipt and both legacy counters in one transaction. Existing historical signatures are immutable here.
export async function noteUpload(env,key,reporter,credit,now){
 const db=env.DB,t=sec(now),fresh='NOT EXISTS(SELECT 1 FROM torch_credits WHERE game_key=? AND reporter_hash=?)';
 await db.batch([
  db.prepare('INSERT INTO torch_counter(id,total) SELECT 1,1 WHERE '+fresh+' ON CONFLICT(id) DO UPDATE SET total=total+1').bind(key,reporter),
  db.prepare('INSERT INTO torch_months(month,n) SELECT ?,1 WHERE '+fresh+' ON CONFLICT(month) DO UPDATE SET n=n+1').bind(monthOf(t),key,reporter),
  db.prepare('INSERT OR IGNORE INTO torch_credits(game_key,reporter_hash,torch_no,name,at) SELECT ?,?,coalesce(max(torch_no),0)+1,?,? FROM torch_credits').bind(key,reporter,credit.name??null,t),
  db.prepare('INSERT OR IGNORE INTO torch_names(torch_no,name_key) SELECT torch_no,? FROM torch_credits WHERE game_key=? AND reporter_hash=? AND name=?').bind(nameKey(credit.name),key,reporter,credit.name??null)
 ]);
 return creditOut(await db.prepare('SELECT torch_no,name,alias,at FROM torch_credits WHERE game_key=? AND reporter_hash=?').bind(key,reporter).first());
}

/* credit of an auto diff: the first reporter (oldest report) whose calibration has the diff's settings; null for official or none */
export async function creditOfDiff(env,layer,key,diff,hashOf){
 if(!diff||diff.source!=='auto')return null;
 try{const h=await hashOf(diff);
  {
   const variant=diff.prints?.script?await hashOf(diff,diff.prints.script):h;
   const r=await env.DB.prepare("SELECT c.torch_no,c.name,c.alias,c.at FROM seed_admin_items i JOIN seed_admin_uploads u ON u.item_id=i.id JOIN torch_credits c ON c.game_key=i.game_key AND c.reporter_hash=u.reporter_tag WHERE i.kind='report' AND "+(layer==='version'?'i.game_key=?':'EXISTS(SELECT 1 FROM auto_profile_reports p WHERE p.game_key=i.game_key AND p.gid=? AND p.settings_hash=i.settings_hash)')+" AND i.settings_hash=? ORDER BY u.at,c.torch_no LIMIT 1").bind(key,variant).first();
   if(r)return creditOut(await carvingFor(env.DB,r.torch_no));
  }
  const r=await env.DB.prepare('SELECT c.torch_no,c.name,c.alias,c.at FROM auto_profile_reports r JOIN torch_credits c ON c.game_key=r.game_key AND c.reporter_hash=r.reporter WHERE r.'+(layer==='version'?'game_key':'gid')+'=? AND r.settings_hash=? ORDER BY r.updated_at ASC LIMIT 1').bind(key,h).first();
  return r?creditOut(await carvingFor(env.DB,r.torch_no)):null;}catch{return null;}}

/* PUT /api/game-profile/credit {key,name|null} */
export async function creditPut(request,env,_reporter,now,{json,fail,readJSON},KEY){
 const body=await readJSON(request,2048);if(body.error)return fail(body.error,body.error==='PAYLOAD_TOO_LARGE'?413:400);const v=body.value;
 if(!plain(v)||!('name' in v))return fail('INVALID_CREDIT');for(const k of Object.keys(v))if(k!=='key'&&k!=='name')return fail('INVALID_CREDIT');
 const key=String(v.key||'');if(!KEY.test(key))return fail('INVALID_KEY');
 const c=cleanName(v.name,env);if(!c.ok||v.name===undefined)return fail('INVALID_CREDIT');
 const owner=await rosterOwner(request,env,now);
 if(!owner)return fail('UNAUTHORIZED',401);
 const row=await env.DB.prepare('SELECT r.torch_no,r.at FROM torch_credits r JOIN torch_roster_links l ON l.torch_no=r.torch_no WHERE r.game_key=? AND r.reporter_hash=?').bind(key,owner).first();if(!row)return fail('NO_CREDIT',404);
 await engrave(env.DB,{owner,key,no:row.torch_no,time:row.at,credit:c});
 const shown=creditOut(await carvingFor(env.DB,row.torch_no));
 if(c.name&&nameKey(shown?.name)!==nameKey(c.name))return fail('NAME_IN_USE',409);
 return json({ok:true,...(shown?{...shown,engraved:true}:{torchNo:row.torch_no,name:null,at:row.at,engraved:false})});}

/* Ascending public inscriptions. Cursors are exclusive receipt numbers and may have gaps.
   before selects the nearest previous page and also returns its rows in ascending order. */
const CHUNK=80;
const chunks=(a,n=CHUNK)=>{const o=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;};
async function titlesFor(env,keys){const out=new Map();if(!keys.length)return out;const vndbOf=new Map();
 try{for(const c of chunks(keys)){const rows=(await env.DB.prepare('SELECT game_key,prints,MAX(updated_at) AS u FROM auto_profile_reports WHERE game_key IN ('+c.map(()=>'?').join(',')+') GROUP BY game_key').bind(...c).all()).results||[];
   for(const r of rows){try{const v=JSON.parse(r.prints||'{}').vndb;if(typeof v==='string'&&/^v\d{1,7}$/.test(v))vndbOf.set(r.game_key,v);}catch{}}}
  const ids=[...new Set(vndbOf.values())],title=new Map();
  for(const c of chunks(ids)){const rows=(await env.DB.prepare("SELECT vndb,title FROM probe_full WHERE title<>'' AND vndb IN ("+c.map(()=>'?').join(',')+') ORDER BY updated_at ASC').bind(...c).all()).results||[];for(const r of rows)title.set(r.vndb,String(r.title).slice(0,120));}
  for(const [k,v] of vndbOf)if(title.has(v))out.set(k,{game:title.get(v),gameVndb:v});}catch{}
 return out;}
/* edge cache (Cache API, 60 s): one D1 read per page per data centre per minute */
async function cached(ck,ctx,make){const c=globalThis.caches?.default;
 if(c){try{const hit=await c.match(ck);if(hit)return new Response(hit.body,hit);}catch{}}
 const res=await make();if(c&&ctx?.waitUntil&&res.status===200){try{ctx.waitUntil(c.put(ck,res.clone()));}catch{}}return res;}
const PUBLIC={'access-control-allow-origin':'*','cache-control':'public, max-age=60'};
const MONTH=/^\d{4}-(0[1-9]|1[0-2])$/;
const monthRange=m=>{const [y,mo]=m.split('-').map(Number);return [Date.UTC(y,mo-1,1)/1000,Date.UTC(y,mo,1)/1000];};
const totalOf=async env=>(await env.DB.prepare('SELECT coalesce(sum(n),0) AS total FROM torch_roster_months').first())?.total|0;
const shape=(r,titles)=>({...creditOut(r),game:null,...titles?.get(r.game_key),display:r.name||r.alias||null});

export async function monumentGet(env,url,{json,fail},ctx=null){
 if(!env.DB)return fail('NOT_CONFIGURED',503);
 const cur=url.searchParams.get('cursor'),lim=url.searchParams.get('limit'),month=url.searchParams.get('month');
 if(cur!==null&&cur!==''&&!/^\d{1,12}$/.test(cur))return fail('INVALID_CURSOR');if(lim!==null&&lim!==''&&!/^\d{1,6}$/.test(lim))return fail('INVALID_LIMIT');
 if(month&&!MONTH.test(month))return fail('INVALID_MONTH');
 const before=url.searchParams.get('before');
 if(before!==null&&(cur!==null||!/^\d{1,12}$/.test(before)))return fail('INVALID_CURSOR');
 const limit=Math.max(1,Math.min(500,lim?Number(lim):100)),bound=before!==null?Number(before):cur?Number(cur):-1;
 return cached('https://megulit-relay.internal/torch/monument/v4/'+(month||'all')+'/'+(before!==null?'before':'after')+'/'+bound+'/'+limit,ctx,async()=>{
  const params=month?monthRange(month):[];
  const sql='SELECT game_key,torch_no,name,alias,at FROM torch_carvings WHERE name_key IS NOT NULL '
   +(month?'AND at>=? AND at<? ':'')+(before!==null?'AND torch_no<? ORDER BY torch_no DESC':'AND torch_no>? ORDER BY torch_no ASC')+' LIMIT ?';
  const rows=(await env.DB.prepare(sql).bind(...params,bound,limit+1).all()).results||[];
  const more=rows.length>limit,page=rows.slice(0,limit);
  if(before!==null)page.reverse();
  const titles=await titlesFor(env,[...new Set(page.map(r=>r.game_key))]);
  const total=month?(await env.DB.prepare('SELECT n FROM torch_roster_months WHERE month=?').bind(month).first())?.n|0:await totalOf(env);
  return json({ok:true,total,month:month||null,items:page.map(r=>shape(r,titles)),...(before!==null?{hasPrevious:more}:{}),next:before===null&&more?String(page[page.length-1].torch_no):null},200,PUBLIC);});}

/* GET /api/torch/months -> {ok,total,months:[{month,n}]} oldest first, from the counter rows */
export async function monthsGet(env,url,{json,fail},ctx=null){
 if(!env.DB)return fail('NOT_CONFIGURED',503);
 return cached('https://megulit-relay.internal/torch/months/v4',ctx,async()=>{
  const rows=(await env.DB.prepare('SELECT month,n FROM torch_roster_months WHERE n>0 ORDER BY month ASC').all()).results||[];
  return json({ok:true,total:await totalOf(env),months:rows.map(r=>({month:r.month,n:r.n|0}))},200,PUBLIC);});}

/* GET /api/torch/find?name= prefix of the shown name (folded: NFKC, lower case, no spaces), at most 50, in name order (an index scan even for a one-letter prefix), the older number first among equal names -> {ok,items:[{torchNo,name,at,month}]} */
export async function findGet(env,url,{json,fail},ctx=null){
 if(!env.DB)return fail('NOT_CONFIGURED',503);
 const raw=String(url.searchParams.get('name')||'').replace(ZERO_WIDTH,'').replace(CONTROL,' ').slice(0,60),k=nameKey(raw);
 if(!k||[...k].length>MAX_NAME)return fail('INVALID_NAME');
 return cached('https://megulit-relay.internal/torch/find/v4/'+encodeURIComponent(k),ctx,async()=>{
  const prefix=Array.from(k,ch=>ch.codePointAt(0));
  while(prefix.at(-1)===0x10ffff)prefix.pop();
  const last=prefix.pop(),end=last===undefined?null:String.fromCodePoint(...prefix,last===0xd7ff?0xe000:last+1);
  const sql='SELECT torch_no,name,alias,at FROM torch_carvings WHERE name_key>=?'+(end?' AND name_key<?':'')+' ORDER BY name_key,torch_no LIMIT 50';
  const rows=(await env.DB.prepare(sql).bind(...(end?[k,end]:[k])).all()).results||[];
  return json({ok:true,items:rows.filter(r=>nameKey(r.name||r.alias).startsWith(k)).map(r=>({...creditOut(r),month:monthOf(r.at)}))},200,PUBLIC);});}

/* GET /api/torch/me[?key=<exe hash>] the caller's own numbers (verified account session), optionally for one game; never cached */
export async function meGet(env,url,reporter,{json,fail},KEY){
 if(!env.DB)return fail('NOT_CONFIGURED',503);const key=url.searchParams.get('key');
 if(key&&!KEY.test(key))return fail('INVALID_KEY');
 const rows=reporter?(await (key?env.DB.prepare(`SELECT c.* FROM torch_carvings c JOIN torch_roster_links l ON l.carving_no=c.torch_no
   JOIN torch_credits r ON r.torch_no=l.torch_no WHERE c.name_key IS NOT NULL AND c.owner=? AND r.game_key=? LIMIT 500`).bind(reporter,key)
  :env.DB.prepare('SELECT * FROM torch_carvings WHERE name_key IS NOT NULL AND owner=? ORDER BY torch_no LIMIT 500').bind(reporter)).all()).results||[]:[];
 const titles=await titlesFor(env,[...new Set(rows.map(r=>r.game_key))]);
 return json({ok:true,rosterVersion:2,items:rows.map(r=>({...shape(r,titles),month:monthOf(r.at)}))},200,{'cache-control':'private, no-store'});}
