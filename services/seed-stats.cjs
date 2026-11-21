// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* The Seed: live seed counts for the About page. GET /api/seed/stats on the relay returns {games, versions, confirmed, waiting, updatedAt}.
   api.megulit.com is asked first, then cn-api.megulit.com, 3 s each; an address set in Settings or MEGULIT_RELAY_BASE is the only one used.
   Nothing about the user is sent: a plain GET with no query and no headers of ours. Any failure returns null and the page falls back to the
   web/the-seed-stats.json made at build time. */
const relay=require('./relay-config.cjs');
const ROUTE='/api/seed/stats',BUILTIN=['https://api.megulit.com','https://cn-api.megulit.com'];
const count=v=>Number.isInteger(v)&&v>=0&&v<1e7?v:null;
function clean(v){
 if(!v||typeof v!=='object')return null;const games=count(v.games),versions=count(v.versions);if(games===null||versions===null)return null;
 const out={games,versions},confirmed=count(v.confirmed),waiting=count(v.waiting);
 if(confirmed!==null)out.confirmed=confirmed;if(waiting!==null)out.waiting=waiting;
 if(typeof v.updatedAt==='string'||Number.isFinite(v.updatedAt))out.updatedAt=v.updatedAt;
 return out;
}
function urls(root,env){
 const base=relay.relayBase(root,env);if(!base)return [];
 return BUILTIN.includes(base)?BUILTIN.map(b=>b+ROUTE):[base+ROUTE];
}
async function stats(root,{fetch:fetcher=fetch,env=process.env,timeout=3000,list}={}){
 for(const url of list||urls(root,env)){
  try{const r=await fetcher(url,{cache:'no-store',signal:AbortSignal.timeout(timeout)});if(!r.ok)continue;const v=clean(await r.json());if(v)return v;}catch{}
 }
 return null;
}
module.exports={stats,clean,urls};
