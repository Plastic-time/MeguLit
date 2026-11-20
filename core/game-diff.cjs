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
   A document whose settings needed any cleaning is refused whole: a signer never signs anything the kernel does not know. */
const {clean}=require('./profiles/domains.cjs');
const gamePrint=require('./game-print.cjs');
const KEY=/^[0-9a-f]{64}$/;
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
 for(const k of ['exe','engine','app','issuedAt'])if(d[k]!==undefined&&(typeof d[k]!=='string'||d[k].length>120))return {ok:false,error:'FIELD_'+k};
 for(const k of ['agree','reporters','rev'])if(d[k]!==undefined&&!int(d[k]))return {ok:false,error:'FIELD_'+k};
 /* 2026-11-21 two layers: 'version' (key = one exe's SHA-256) and 'game' (key = a game identity, every build; prints says which) */
 if(d.layer!==undefined&&!['version','game'].includes(d.layer))return {ok:false,error:'FIELD_layer'};
 if(d.prints!==undefined){const c=gamePrint.check(d.prints);if(!d.prints||typeof d.prints!=='object'||Object.keys(d.prints).length!==Object.keys(c).length||Object.entries(c).some(([k,v])=>d.prints[k]!==v))return {ok:false,error:'FIELD_prints'};}
 if(d.cost!==undefined&&!(typeof d.cost==='number'&&Number.isFinite(d.cost)&&d.cost>=0&&d.cost<=1e6))return {ok:false,error:'FIELD_cost'};
 const allowed=new Set(['schema','version','key','layer','prints','rev','source','mode','settings','exe','engine','app','issuedAt','agree','reporters','cost','signature']);
 for(const k of Object.keys(d))if(!allowed.has(k))return {ok:false,error:'FIELD_'+k.slice(0,20)};
 return {ok:true};}
/* a document built from parts (relay / tool): unknown settings dropped first, so it always validates */
function build({key,layer='version',prints,rev,source,mode,settings,exe='',engine='',app='',issuedAt=new Date().toISOString(),agree,reporters,cost}){
 const s=clean(settings).value;if(mode==='read')s.hide={...(s.hide||{}),textEffectsRead:true};
 const d={schema:'megulit.game-diff',version:1,key,layer:layer==='game'?'game':'version',source,mode,settings:s,exe:str(exe,80),engine:str(engine,32),app:str(app,32),issuedAt:str(issuedAt,40)};
 if(prints){const c=gamePrint.check(prints);if(Object.keys(c).length)d.prints=c;}if(int(rev))d.rev=rev;
 if(int(agree))d.agree=agree;if(int(reporters))d.reporters=reporters;if(typeof cost==='number'&&Number.isFinite(cost)&&cost>=0)d.cost=Math.round(cost*1000)/1000;return d;}
module.exports={KEY,canonical,unsigned,validate,build};
