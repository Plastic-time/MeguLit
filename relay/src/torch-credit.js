// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-21 传火署名. A player who shares an auto diff (POST /api/game-profile/report) may add credit:{name?} so the game's
   About page can say who passed the torch. Rules:
     name   optional, 1-20 characters after cleaning; control and zero-width characters are removed; a link, an @ or an email
            shape refuses the request (INVALID_CREDIT); a name on the block list is simply made anonymous (name null).
            Any other key inside credit is identity information: the request is refused.
     torchNo  global, only grows, one per exe key and reporter (the salted IP hash the reports already use); a re-upload keeps
            it, the name can change. In the report response: {torchNo,name,at}.
   credit in GET /api/game-profile: {torchNo,name|null,at} for an 'auto' diff = the first reporter whose calibration is the one the
   diff was built from; an official diff has none. It sits outside the signed document, display only.
   PUT /api/game-profile/credit {key,name|null}: change or withdraw the name (the number stays). */
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
 const n=[...s].length;if(n<1||n>20)return {ok:false};
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

export const creditOut=r=>r?{torchNo:r.torch_no|0,name:r.name??null,at:r.at|0}:null;

/* file the upload: first time → the next number; later → the same number, the name only when mentioned */
export async function noteUpload(env,key,reporter,credit,now){const t=sec(now);
 const old=await env.DB.prepare('SELECT torch_no,name,at FROM torch_credits WHERE game_key=? AND reporter_hash=?').bind(key,reporter).first();
 if(old){if(credit.present&&credit.name!==undefined)await env.DB.prepare('UPDATE torch_credits SET name=? WHERE game_key=? AND reporter_hash=?').bind(credit.name,key,reporter).run();
  return creditOut({...old,name:credit.present&&credit.name!==undefined?credit.name:old.name});}
 for(let i=0;i<5;i++){try{/* the number is taken inside the insert; the unique index catches two uploads racing for the same one */
  await env.DB.prepare('INSERT INTO torch_credits(game_key,reporter_hash,torch_no,name,at) VALUES(?,?,(SELECT COALESCE(MAX(torch_no),0)+1 FROM torch_credits),?,?)').bind(key,reporter,credit.name??null,t).run();break;}
  catch(e){const again=await env.DB.prepare('SELECT 1 AS x FROM torch_credits WHERE game_key=? AND reporter_hash=?').bind(key,reporter).first();if(again)break;if(i===4)throw e;}}
 return creditOut(await env.DB.prepare('SELECT torch_no,name,at FROM torch_credits WHERE game_key=? AND reporter_hash=?').bind(key,reporter).first());}

/* credit of an auto diff: the first reporter (oldest report) whose calibration has the diff's settings; null for official or none */
export async function creditOfDiff(env,layer,key,diff,hashOf){
 if(!diff||diff.source!=='auto')return null;
 try{const h=await hashOf(diff);
  const r=await env.DB.prepare('SELECT c.torch_no,c.name,c.at FROM auto_profile_reports r JOIN torch_credits c ON c.game_key=r.game_key AND c.reporter_hash=r.reporter WHERE r.'+(layer==='version'?'game_key':'gid')+'=? AND r.settings_hash=? ORDER BY r.updated_at ASC LIMIT 1').bind(key,h).first();
  return creditOut(r);}catch{return null;}}

/* PUT /api/game-profile/credit {key,name|null} */
export async function creditPut(request,env,reporter,now,{json,fail,readJSON},KEY){
 const body=await readJSON(request,2048);if(body.error)return fail(body.error,body.error==='PAYLOAD_TOO_LARGE'?413:400);const v=body.value;
 if(!plain(v)||!('name' in v))return fail('INVALID_CREDIT');for(const k of Object.keys(v))if(k!=='key'&&k!=='name')return fail('INVALID_CREDIT');
 const key=String(v.key||'');if(!KEY.test(key))return fail('INVALID_KEY');
 const c=cleanName(v.name,env);if(!c.ok||v.name===undefined)return fail('INVALID_CREDIT');
 const row=await env.DB.prepare('SELECT torch_no,at FROM torch_credits WHERE game_key=? AND reporter_hash=?').bind(key,reporter).first();if(!row)return fail('NO_CREDIT',404);
 await env.DB.prepare('UPDATE torch_credits SET name=? WHERE game_key=? AND reporter_hash=?').bind(c.name,key,reporter).run();
 return json({ok:true,...creditOut({...row,name:c.name})});}
