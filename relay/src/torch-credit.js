// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-21 传火署名. A player who shares an auto diff (POST /api/game-profile/report) may add credit:{name?} so the game's
   About page can say who passed the torch. Rules:
     name   optional, 1-30 characters after cleaning; control and zero-width characters are removed; a link, an @ or an email
            shape refuses the request (INVALID_CREDIT); a name on the block list is simply made anonymous (name null).
            Any other key inside credit is identity information: the request is refused.
     torchNo  global, only grows, one per exe key and reporter (the salted IP hash the reports already use); a re-upload keeps
            it, the name can change. In the report response: {torchNo,name,at}.
   credit in GET /api/game-profile: {torchNo,name|null,at} for an 'auto' diff = the first reporter whose calibration is the one the
   diff was built from; an official diff has none. It sits outside the signed document, display only.
   PUT /api/game-profile/credit {key,name|null}: change or withdraw the name (the number stays). */
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
const nameKey=n=>String(n||'').normalize('NFKC').toLowerCase().replace(/\s+/gu,'');
async function setNameKey(env,torchNo,name){if(name)await env.DB.prepare('INSERT INTO torch_names(torch_no,name_key) VALUES(?,?) ON CONFLICT(torch_no) DO UPDATE SET name_key=excluded.name_key').bind(torchNo,nameKey(name)).run();
 else await env.DB.prepare('DELETE FROM torch_names WHERE torch_no=?').bind(torchNo).run();}
export const creditOut=r=>r?{torchNo:r.torch_no,name:r.name??null,at:r.at|0,...(!r.name&&r.alias?{alias:r.alias}:{})}:null;

/* file the upload: first time → the next number; later → the same number, the name only when mentioned */
export async function noteUpload(env,key,reporter,credit,now,libraryAlias=null){const t=sec(now);let fresh=false;
 const old=await env.DB.prepare('SELECT torch_no,name,alias,at FROM torch_credits WHERE game_key=? AND reporter_hash=?').bind(key,reporter).first();
 if(old){if(credit.present&&credit.name!==undefined)await env.DB.prepare('UPDATE torch_credits SET name=? WHERE game_key=? AND reporter_hash=?').bind(credit.name,key,reporter).run();
  if(credit.present&&credit.name!==undefined)await setNameKey(env,old.torch_no,credit.name);
  return creditOut({...old,name:credit.present&&credit.name!==undefined?credit.name:old.name});}
 for(let i=0;i<5;i++){try{/* the number is taken inside the insert; the unique index catches two uploads racing for the same one */
  await env.DB.prepare('INSERT INTO torch_credits(game_key,reporter_hash,torch_no,name,at,alias) VALUES(?,?,(SELECT COALESCE(MAX(torch_no),0)+1 FROM torch_credits),?,?,?)').bind(key,reporter,credit.name??null,t,credit.name?null:libraryAlias).run();fresh=true;break;}
  catch(e){const again=await env.DB.prepare('SELECT 1 AS x FROM torch_credits WHERE game_key=? AND reporter_hash=?').bind(key,reporter).first();if(again)break;if(i===4)throw e;}}
 const row=await env.DB.prepare('SELECT torch_no,name,alias,at FROM torch_credits WHERE game_key=? AND reporter_hash=?').bind(key,reporter).first();
 if(fresh){/* the counters follow the insert: the total and the month the number belongs to */
  await env.DB.prepare('INSERT INTO torch_counter(id,total) VALUES(1,1) ON CONFLICT(id) DO UPDATE SET total=total+1').run();
  await env.DB.prepare('INSERT INTO torch_months(month,n) VALUES(?,1) ON CONFLICT(month) DO UPDATE SET n=n+1').bind(monthOf(row.at)).run();
  if(row.name)await setNameKey(env,row.torch_no,row.name);}
 return creditOut(row);}

/* credit of an auto diff: the first reporter (oldest report) whose calibration has the diff's settings; null for official or none */
export async function creditOfDiff(env,layer,key,diff,hashOf){
 if(!diff||diff.source!=='auto')return null;
 try{const h=await hashOf(diff);
  if(layer==='version'&&diff.prints?.script){
   const variant=await hashOf(diff,diff.prints.script);
   const r=await env.DB.prepare("SELECT c.torch_no,c.name,c.alias,c.at FROM seed_admin_items i JOIN seed_admin_uploads u ON u.item_id=i.id JOIN torch_credits c ON c.game_key=i.game_key AND c.reporter_hash=u.reporter_tag WHERE i.kind='report' AND i.game_key=? AND i.settings_hash=? ORDER BY u.at,u.upload_id LIMIT 1").bind(key,variant).first();
   if(r)return creditOut(r);
  }
  const r=await env.DB.prepare('SELECT c.torch_no,c.name,c.alias,c.at FROM auto_profile_reports r JOIN torch_credits c ON c.game_key=r.game_key AND c.reporter_hash=r.reporter WHERE r.'+(layer==='version'?'game_key':'gid')+'=? AND r.settings_hash=? ORDER BY r.updated_at ASC LIMIT 1').bind(key,h).first();
  return creditOut(r);}catch{return null;}}

/* PUT /api/game-profile/credit {key,name|null} */
export async function creditPut(request,env,reporter,now,{json,fail,readJSON},KEY){
 const body=await readJSON(request,2048);if(body.error)return fail(body.error,body.error==='PAYLOAD_TOO_LARGE'?413:400);const v=body.value;
 if(!plain(v)||!('name' in v))return fail('INVALID_CREDIT');for(const k of Object.keys(v))if(k!=='key'&&k!=='name')return fail('INVALID_CREDIT');
 const key=String(v.key||'');if(!KEY.test(key))return fail('INVALID_KEY');
 const c=cleanName(v.name,env);if(!c.ok||v.name===undefined)return fail('INVALID_CREDIT');
 const row=await env.DB.prepare('SELECT torch_no,alias,at FROM torch_credits WHERE game_key=? AND reporter_hash=?').bind(key,reporter).first();if(!row)return fail('NO_CREDIT',404);
 await env.DB.prepare('UPDATE torch_credits SET name=? WHERE game_key=? AND reporter_hash=?').bind(c.name,key,reporter).run();await setNameKey(env,row.torch_no,c.name);
 return json({ok:true,...creditOut({...row,name:c.name})});}

/* GET /api/torch/monument?cursor=&limit=  传火碑: every credit ever filed, oldest first, never shrinking.
   {ok,total,items:[{torchNo,name|null,at,game|null,display}],next}  cursor = the last torchNo of the previous page, next = the cursor
   for the following page (null at the end). A withdrawn name is null and uses the assigned alias. The game title is the
   one the relay already knows for it (a probe title found through the VNDB id of its calibrations), else null. No key, no reporter. */
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
const totalOf=async env=>(await env.DB.prepare('SELECT total FROM torch_counter WHERE id=1').first())?.total|0;
const shape=(r,titles)=>({...creditOut(r),game:null,...titles?.get(r.game_key),display:r.name||r.alias||null});

export async function monumentGet(env,url,{json,fail},ctx=null){
 if(!env.DB)return fail('NOT_CONFIGURED',503);
 const cur=url.searchParams.get('cursor'),lim=url.searchParams.get('limit'),month=url.searchParams.get('month');
 if(cur!==null&&cur!==''&&!/^\d{1,12}$/.test(cur))return fail('INVALID_CURSOR');if(lim!==null&&lim!==''&&!/^\d{1,6}$/.test(lim))return fail('INVALID_LIMIT');
 if(month&&!MONTH.test(month))return fail('INVALID_MONTH');
 const limit=Math.max(1,Math.min(500,lim?Number(lim):100)),after=cur?Number(cur):-1;
 return cached('https://megulit-relay.internal/torch/monument/v2/'+(month||'all')+'/'+after+'/'+limit,ctx,async()=>{
  const [lo,hi]=month?monthRange(month):[0,0];
  const rows=(await (month?env.DB.prepare('SELECT game_key,torch_no,name,alias,at FROM torch_credits WHERE at>=? AND at<? AND torch_no>? ORDER BY torch_no ASC LIMIT ?').bind(lo,hi,after,limit+1)
   :env.DB.prepare('SELECT game_key,torch_no,name,alias,at FROM torch_credits WHERE torch_no>? ORDER BY torch_no ASC LIMIT ?').bind(after,limit+1)).all()).results||[];
  const more=rows.length>limit,page=rows.slice(0,limit),titles=await titlesFor(env,[...new Set(page.map(r=>r.game_key))]);
  const total=month?(await env.DB.prepare('SELECT n FROM torch_months WHERE month=?').bind(month).first())?.n|0:await totalOf(env);
  return json({ok:true,total,month:month||null,items:page.map(r=>shape(r,titles)),next:more?String(page[page.length-1].torch_no):null},200,PUBLIC);});}

/* GET /api/torch/months -> {ok,total,months:[{month,n}]} oldest first, from the counter rows */
export async function monthsGet(env,url,{json,fail},ctx=null){
 if(!env.DB)return fail('NOT_CONFIGURED',503);
 return cached('https://megulit-relay.internal/torch/months',ctx,async()=>{
  const rows=(await env.DB.prepare('SELECT month,n FROM torch_months WHERE n>0 ORDER BY month ASC').all()).results||[];
  return json({ok:true,total:await totalOf(env),months:rows.map(r=>({month:r.month,n:r.n|0}))},200,PUBLIC);});}

/* GET /api/torch/find?name= prefix of the shown name (folded: NFKC, lower case, no spaces), at most 50, in name order (an index scan even for a one-letter prefix), the older number first among equal names -> {ok,items:[{torchNo,name,at,month}]} */
export async function findGet(env,url,{json,fail},ctx=null){
 if(!env.DB)return fail('NOT_CONFIGURED',503);
 const raw=String(url.searchParams.get('name')||'').replace(ZERO_WIDTH,'').replace(CONTROL,' ').slice(0,60),k=nameKey(raw);
 if(!k||[...k].length>MAX_NAME)return fail('INVALID_NAME');
 return cached('https://megulit-relay.internal/torch/find/v3/'+encodeURIComponent(k),ctx,async()=>{
  const end=k+'￿';
  const rows=(await env.DB.prepare(
   'SELECT c.torch_no,c.name,NULL AS alias,c.at,n.name_key FROM torch_names n JOIN torch_credits c ON c.torch_no=n.torch_no WHERE n.name_key>=? AND n.name_key<? AND c.name IS NOT NULL '+
   'UNION ALL SELECT torch_no,NULL,alias,at,lower(alias) FROM torch_credits WHERE name IS NULL AND lower(alias)>=? AND lower(alias)<? ORDER BY name_key,torch_no LIMIT 50'
  ).bind(k,end,k,end).all()).results||[];
  return json({ok:true,items:rows.filter(r=>nameKey(r.name||r.alias).startsWith(k)).map(r=>({...creditOut(r),month:monthOf(r.at)}))},200,PUBLIC);});}

/* GET /api/torch/me[?key=<exe hash>] the caller's own numbers (the same salted IP hash the uploads used), optionally for one game; never cached */
export async function meGet(env,url,reporter,{json,fail},KEY){
 if(!env.DB)return fail('NOT_CONFIGURED',503);const key=url.searchParams.get('key');
 if(key&&!KEY.test(key))return fail('INVALID_KEY');
 const rows=(await (key?env.DB.prepare('SELECT game_key,torch_no,name,alias,at FROM torch_credits WHERE reporter_hash=? AND game_key=? ORDER BY torch_no ASC LIMIT 500').bind(reporter,key)
  :env.DB.prepare('SELECT game_key,torch_no,name,alias,at FROM torch_credits WHERE reporter_hash=? ORDER BY torch_no ASC LIMIT 500').bind(reporter)).all()).results||[];
 const titles=await titlesFor(env,[...new Set(rows.map(r=>r.game_key))]);
 return json({ok:true,items:rows.map(r=>({...shape(r,titles),month:monthOf(r.at)}))},200,{'cache-control':'private, no-store'});}
