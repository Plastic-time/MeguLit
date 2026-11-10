// SPDX-License-Identifier: GPL-3.0-or-later
/* E377 pure request validation for the MeguLit relay. No I/O here, so validation/relay.test.cjs can run it in Node. */

/* Nickname rules — keep in step with services/leaderboard.cjs cleanName (validation/leaderboard.test.cjs checks both). */
export const BLOCKED=['fuck','shit','bitch','cunt','nigger','nigga','faggot','rape','porn','penis','vagina','asshole','dick','whore','slut','hitler','nazi','傻逼','煞笔','傻b','sb','操你','草你','肏','日你','你妈','尼玛','妈逼','屌','鸡巴','婊子','贱人','强奸','做爱','色情','黄片','习近平','共产党','法轮','台独','死ね','殺す','ちんこ','まんこ','うんこ','セックス','レイプ','きちがい','キチガイ','admin','管理员','官方','megulit'];
const hidden=ch=>{const c=ch.codePointAt(0);return c<32||c>=0x7f&&c<=0x9f||c>=0x200b&&c<=0x200f||c>=0x2028&&c<=0x202e||c>=0x2060&&c<=0x206f||c===0xfeff;};
export function cleanName(value){
 if(typeof value!=='string')return {ok:false,error:'NAME_REQUIRED'};
 const name=value.normalize('NFKC').replace(/\s+/g,' ').trim();
 if(!name)return {ok:false,error:'NAME_REQUIRED'};
 const chars=[...name];if(chars.length<2||chars.length>16)return {ok:false,error:'NAME_LENGTH'};
 if(chars.some(hidden)||/[<>"'`\\]/.test(name)||/https?:|www\.|\.(?:com|net|org|cn|jp|io)\b|@/i.test(name))return {ok:false,error:'NAME_INVALID'};
 const lower=name.toLowerCase(),flat=lower.replace(/[\s._\-*·・]/g,''),tokens=lower.split(/[^a-z]+/).filter(Boolean);
 if(BLOCKED.some(word=>/^[a-z]+$/.test(word)?flat===word||tokens.some(t=>t.startsWith(word)):flat.includes(word)))return {ok:false,error:'NAME_BLOCKED'};
 return {ok:true,name};
}

export const PERIODS=['week','month','all'],METRICS=['characters','seconds','words','streak'];
/* Upper bounds a real reader cannot pass; anything above is rejected as a whole. */
export const CAPS={
 week:{characters:3_000_000,seconds:7*86400,words:20_000,streak:7},
 month:{characters:12_000_000,seconds:31*86400,words:80_000,streak:31},
 all:{characters:2_000_000_000,seconds:200_000_000,words:2_000_000,streak:40_000}
};
export const LIMITS={body:64*1024,games:30,title:120,adaptationRecords:50,adaptationRecord:16*1024,keys:50,meta:16*1024,zip:20*1024*1024};
const isInt=v=>Number.isSafeInteger(v)&&v>=0;
export const INSTALL_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const HEX64=/^[a-f0-9]{64}$/;

/* ISO week / month keys of a UTC instant; the client sends its local keys, which are accepted within ±14 h. */
export function isoWeek(date){const d=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()));const day=d.getUTCDay()||7;d.setUTCDate(d.getUTCDate()+4-day);const year=d.getUTCFullYear(),first=new Date(Date.UTC(year,0,1));return `${year}-W${String(Math.ceil(((d-first)/86400000+1)/7)).padStart(2,'0')}`;}
export function periodKeysAt(date){return {week:isoWeek(date),month:`${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`,all:'all'};}
export function allowedKeys(now=new Date()){const out={week:new Set(),month:new Set()};for(const h of [-14,0,14]){const k=periodKeysAt(new Date(now.getTime()+h*3600000));out.week.add(k.week);out.month.add(k.month);}return out;}
export function gameKey(title){return String(title||'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();}

/* POST /api/leaderboard body → {ok,value} | {ok:false,error} */
export function validateLeaderboard(body,now=new Date()){
 if(!body||typeof body!=='object'||Array.isArray(body))return {ok:false,error:'INVALID_BODY'};
 if(body.version!==1)return {ok:false,error:'UNSUPPORTED_VERSION'};
 if(typeof body.id!=='string'||!INSTALL_ID.test(body.id))return {ok:false,error:'INVALID_ID'};
 const name=cleanName(body.name);if(!name.ok)return {ok:false,error:name.error};
 const allowed=allowedKeys(now),keys={week:String(body.keys?.week||''),month:String(body.keys?.month||''),all:'all'};
 if(!allowed.week.has(keys.week)||!allowed.month.has(keys.month))return {ok:false,error:'PERIOD_KEY_OUT_OF_RANGE'};
 const stats={};
 for(const period of PERIODS){const p=body.stats?.[period];if(!p||typeof p!=='object')return {ok:false,error:'INVALID_STATS'};stats[period]={};
  for(const metric of METRICS){const v=p[metric];if(!isInt(v))return {ok:false,error:'INVALID_STATS'};if(v>CAPS[period][metric])return {ok:false,error:'STATS_OUT_OF_RANGE'};stats[period][metric]=v;}}
 if(stats.all.characters<stats.month.characters||stats.all.seconds<stats.month.seconds)return {ok:false,error:'INVALID_STATS'};
 let games=null;
 if(body.games!==undefined){if(!Array.isArray(body.games)||body.games.length>LIMITS.games)return {ok:false,error:'INVALID_GAMES'};games=[];const seen=new Set();
  for(const g of body.games){const title=typeof g?.title==='string'?g.title.normalize('NFKC').replace(/\s+/g,' ').trim():'';
   if(!title||[...title].length>LIMITS.title||[...title].some(hidden)||/[<>]/.test(title))return {ok:false,error:'INVALID_GAMES'};
   if(!isInt(g.characters)||!isInt(g.seconds)||g.characters>CAPS.all.characters||g.seconds>CAPS.all.seconds)return {ok:false,error:'INVALID_GAMES'};
   const key=gameKey(title);if(seen.has(key))continue;seen.add(key);games.push({key,title,characters:g.characters,seconds:g.seconds});}}
 return {ok:true,value:{id:body.id,name:name.name,keys,stats,games}};
}
/* GET /api/leaderboard query → {ok,value} */
export function validateBoardQuery(params,now=new Date()){
 const metric=params.get('metric')||'characters',me=params.get('me')||'';
 if(me&&!HEX64.test(me))return {ok:false,error:'INVALID_QUERY'};
 if(metric==='games'){const game=params.get('game');if(game!==null&&(!game.trim()||[...game].length>LIMITS.title))return {ok:false,error:'INVALID_QUERY'};return {ok:true,value:{metric,game:game===null?null:gameKey(game),me}};}
 const period=params.get('period')||'week';if(!PERIODS.includes(period)||!METRICS.includes(metric))return {ok:false,error:'INVALID_QUERY'};
 let key=period==='all'?'all':params.get('key')||periodKeysAt(now)[period];
 if(period==='week'&&!/^\d{4}-W\d{2}$/.test(key)||period==='month'&&!/^\d{4}-\d{2}$/.test(key))return {ok:false,error:'INVALID_QUERY'};
 return {ok:true,value:{period,metric,key,me}};
}

/* Shared adaptation records (services/shared-adaptation.cjs in the shared-config branch): schema megulit.adaptation v1,
   keyed by a 64-hex fingerprint key. The relay only checks the envelope and size; the client cleans fields again on pull. */
export function validateAdaptationRecord(record){
 if(!record||typeof record!=='object'||Array.isArray(record))return null;
 const key=typeof record.key==='string'?record.key:'';if(!HEX64.test(key))return null;
 if(record.schema!==undefined&&record.schema!=='megulit.adaptation')return null;
 if(record.version!==undefined&&record.version!==1)return null;
 let json;try{json=JSON.stringify(record);}catch{return null;}
 if(json.length>LIMITS.adaptationRecord)return null;
 /* never store anything that looks like a Windows path or a user folder */
 if(/[a-z]:\\\\|\\\\users\\\\|\/users\//i.test(json))return null;
 return {key,json};
}
export function validateKeys(list){if(!Array.isArray(list))return null;const keys=[...new Set(list.map(k=>String(k||'').toLowerCase()).filter(k=>HEX64.test(k)))];return keys.length<=LIMITS.keys?keys:null;}

/* Diagnostics meta (services/diagnostics-upload.cjs in the diagnostics branch). */
export function validateMeta(meta){
 if(!meta||typeof meta!=='object'||Array.isArray(meta))return {ok:false,error:'INVALID_META'};
 const s=(v,max)=>typeof v==='string'?[...v].filter(ch=>{const c=ch.codePointAt(0);return c===9||c===10||c===13||c>=32&&c!==127;}).join('').slice(0,max):'';
 const value={schema:Number(meta.schema)||1,version:s(meta.version,32),game:{id:s(meta.game?.id,80),title:s(meta.game?.title,200),engine:s(meta.game?.engine,40)},os:s(meta.os,60),size:Number.isSafeInteger(meta.size)?meta.size:null,sha256:HEX64.test(String(meta.sha256||''))?meta.sha256:'',createdAt:s(meta.createdAt,40),note:s(meta.note,2000)};
 if(value.version&&!/^\d+\.\d+\.\d+[a-z]?$/.test(value.version))return {ok:false,error:'INVALID_META'};
 return {ok:true,value};
}
/* Markdown-safe text for the GitHub issue body */
export function mdText(value){return String(value||'').replace(/[\\`*_{}\[\]<>()#+!|@~]/g,c=>'\\'+c).replace(/\r?\n/g,'  \n');}
export function issueBody(meta,link,days){
 const lines=['MeguLit diagnostics package uploaded through the relay.','',
  `- Version: ${mdText(meta.version||'?')}`,`- Game: ${mdText(meta.game.title||'?')} (${mdText(meta.game.engine||'unknown engine')})`,`- OS: ${mdText(meta.os||'?')}`,
  `- Size: ${meta.size??'?'} bytes`,`- SHA-256: \`${meta.sha256||'-'}\``,`- Created: ${mdText(meta.createdAt||'?')}`,'',
  `Download (expires in ${days} days): ${link}`];
 if(meta.note)lines.push('','User note:','',meta.note.split(/\r?\n/).map(l=>'> '+mdText(l)).join('\n'));
 return lines.join('\n');
}
