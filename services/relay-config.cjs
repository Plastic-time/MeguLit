// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E377 one place for the online relay's base URL (Cloudflare Worker on the maintainer's own domain, see relay/README.md).

   relayBase(root) → 'https://relay.example.com' (no trailing slash) or '' when not configured.
   Order: MEGULIT_RELAY_BASE env → Settings 联网服务 · 服务地址 (data/config/online.json "relayUrl") → DEFAULT_RELAY_BASE.
   DEFAULT_RELAY_BASE is the maintainer's relay (api.megulit.com); MEGULIT_RELAY_BASE=off drops that built-in default, so only an address saved in Settings is used (tests use it).
   Only https, or http for localhost (local wrangler dev). Credentials, query and fragment are rejected.

   Endpoints on that base (relay/src/worker.js):
     POST /api/diagnostics            multipart meta + package (or file)
     POST /api/adaptation             {version:1,records:[...]}     POST /api/adaptation/query {version:1,keys:[...]}
     GET  /api/adaptation?fp=a,b
     POST/GET/DELETE /api/leaderboard
   endpoint(root,'/api/diagnostics') joins them, '' when not configured. */
const fs=require('node:fs'),path=require('node:path');
const DEFAULT_RELAY_BASE='https://api.megulit.com';
const LOCAL=['127.0.0.1','localhost','[::1]'];
function readJSON(file){try{const v=JSON.parse(fs.readFileSync(file,'utf8'));return v&&typeof v==='object'?v:{};}catch{return {};}}
const onlineFile=root=>path.join(root,'data','config','online.json');
function normalizeBase(value){
 if(typeof value!=='string'||!value.trim()||value.length>300)return '';let url;try{url=new URL(value.trim());}catch{return '';}
 if(url.username||url.password||url.search||url.hash)return '';
 if(!(url.protocol==='https:'||url.protocol==='http:'&&LOCAL.includes(url.hostname)))return '';
 return url.href.replace(/\/+$/,'');
}
function relayBase(root,env=process.env){
 const off=String(env.MEGULIT_RELAY_BASE||'').trim().toLowerCase()==='off';
 const fromEnv=normalizeBase(env.MEGULIT_RELAY_BASE||'');if(fromEnv)return fromEnv;
 const saved=root?normalizeBase(readJSON(onlineFile(root)).relayUrl||''):'';if(saved)return saved;
 return off?'':normalizeBase(DEFAULT_RELAY_BASE);
}
function endpoint(root,route,env=process.env){const base=relayBase(root,env);return base?base+route:'';}
module.exports={DEFAULT_RELAY_BASE,relayBase,endpoint,normalizeBase,onlineFile,readJSON};
