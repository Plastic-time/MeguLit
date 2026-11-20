// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: 「差分只能是数据…签名下发，客户端验签，防止共享数据被投毒」) the signed game diff document the relay hands out.
   Pure (no Node or Worker API): the relay (relay/src/auto-profile.js), the app (services/auto-profile-feed.cjs) and the maintainer
   tool (tools/sign-profile.cjs) all use this file, so the bytes that are signed are the same everywhere.

   {schema:'megulit.game-diff', version:1, key:'<64 hex: the SHA-256 of the game exe>', source:'official'|'auto', mode:'hide'|'read',
    settings:{<only keys and values of core/profiles/domains.cjs>}, exe, engine, app, issuedAt, agree, reporters, cost,
    signature:{alg:'ed25519', keyId, value:<base64 over canonical(document without signature)>}}

   official: made by us from a probe (scripts + exe + runtime samples). It wins over everything automatic.
   auto:     the agreed best calibration of the players of that exe (picked by the relay, signed by us).
   Both are signed offline with our profile key (tools/sign-profile.cjs; the private key never leaves our PC, the relay holds none);
   the app trusts the public keys of services/profile-keys.json.
   A document whose settings needed any cleaning is refused whole: a signer never signs anything the kernel does not know.

   2026-11-21 (owner: 补丁/破解/汉化/不同发行版的 exe 都会变，只认哈希就全炸) scope, optional, docs/diff-layers.md:
     'exe' (absent)  every key, for this exe only (the documents before scopes)
     'version'       only version-tier keys (domains.cjs tierOf), for this exe; key = its SHA-256
     'game'          only game-tier keys, for every version of one game; game = its slug, key = SHA-256 of 'megulit.game|'+game
   The feed (GET /api/game-profile/<exe SHA-256>?<fingerprints>) answers version 2:
     {schema:'megulit.game-diff-feed', version:2, key, match:'exe'|'bin'|'game:<basis>', diffs:[<signed documents>]}
   match says how the relay found them: exe = this exe's hash; bin = the probe's size + first/last MiB hash or the PE time stamp;
   game:<files|steam|vndb|title> = the game identity. Version / exe documents are used only on exe or bin. */
const {clean,tierOf,split}=require('./profiles/domains.cjs');
const KEY=/^[0-9a-f]{64}$/,GAME=/^[a-z0-9][a-z0-9-]{1,62}$/,SCOPES=['exe','version','game'];
function canonical(v){if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';return JSON.stringify(v);}
const unsigned=d=>{const {signature,...rest}=d||{};return rest;};
const str=(v,n)=>String(v??'').slice(0,n);
const int=v=>Number.isSafeInteger(v)&&v>=0&&v<=1e9;
/* the document's shape and every value; {ok,error} */
function validate(d){if(!d||typeof d!=='object'||Array.isArray(d))return {ok:false,error:'NOT_A_DOCUMENT'};
 if(d.schema!=='megulit.game-diff'||d.version!==1)return {ok:false,error:'SCHEMA'};
 if(!KEY.test(String(d.key||'')))return {ok:false,error:'KEY'};
 if(!['official','auto'].includes(d.source))return {ok:false,error:'SOURCE'};
 if(!['hide','read'].includes(d.mode))return {ok:false,error:'MODE'};
 const c=clean(d.settings);if(c.rejected.length)return {ok:false,error:'SETTINGS',rejected:c.rejected};
 if(d.mode==='read'&&d.settings?.hide?.textEffectsRead!==true)return {ok:false,error:'READ_WITHOUT_READ_MODE'};
 if(d.scope!==undefined&&!SCOPES.includes(d.scope))return {ok:false,error:'SCOPE'};
 if(d.scope==='game'&&!GAME.test(String(d.game||'')))return {ok:false,error:'GAME'};if(d.game!==undefined&&d.scope!=='game')return {ok:false,error:'GAME'};
 if(d.scope==='game'||d.scope==='version'){const other=split(d.settings)[d.scope==='game'?'version':'game'];if(Object.keys(other).length)return {ok:false,error:'TIER',rejected:Object.keys(other)};}
 for(const k of ['exe','engine','app','issuedAt'])if(d[k]!==undefined&&(typeof d[k]!=='string'||d[k].length>120))return {ok:false,error:'FIELD_'+k};
 for(const k of ['agree','reporters'])if(d[k]!==undefined&&!int(d[k]))return {ok:false,error:'FIELD_'+k};
 if(d.cost!==undefined&&!(typeof d.cost==='number'&&Number.isFinite(d.cost)&&d.cost>=0&&d.cost<=1e6))return {ok:false,error:'FIELD_cost'};
 const allowed=new Set(['schema','version','key','source','mode','scope','game','settings','exe','engine','app','issuedAt','agree','reporters','cost','signature']);
 for(const k of Object.keys(d))if(!allowed.has(k))return {ok:false,error:'FIELD_'+k.slice(0,20)};
 return {ok:true};}
/* a document built from parts (relay / tool): unknown settings dropped first, so it always validates */
function build({key,source,mode,scope,game,settings,exe='',engine='',app='',issuedAt=new Date().toISOString(),agree,reporters,cost}){
 let s=clean(settings).value;if(mode==='read')s.hide={...(s.hide||{}),textEffectsRead:true};if(scope==='game'||scope==='version')s=split(s)[scope];
 const d={schema:'megulit.game-diff',version:1,key,source,mode,...(SCOPES.includes(scope)&&scope!=='exe'?{scope}:{}),...(scope==='game'?{game:str(game,62)}:{}),settings:s,exe:str(exe,80),engine:str(engine,32),app:str(app,32),issuedAt:str(issuedAt,40)};
 if(int(agree))d.agree=agree;if(int(reporters))d.reporters=reporters;if(typeof cost==='number'&&Number.isFinite(cost)&&cost>=0)d.cost=Math.round(cost*1000)/1000;return d;}
module.exports={KEY,GAME,SCOPES,canonical,unsigned,validate,build};
