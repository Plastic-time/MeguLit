'use strict';
/* The Seed live counts: services/seed-stats.cjs against a stub relay (no real network) */
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {stats,clean,urls}=require('../services/seed-stats.cjs');
const serve=handler=>new Promise(r=>{const s=http.createServer(handler).listen(0,'127.0.0.1',()=>r(s));});
test('reads the stub relay and keeps only the known numbers',async()=>{
 let seen='';const s=await serve((q,r)=>{seen=q.url+'|'+Object.keys(q.headers).join(',');r.setHeader('content-type','application/json');r.end(JSON.stringify({games:60,versions:58,confirmed:12,waiting:48,updatedAt:'2026-11-21T10:00:00Z',secret:'x'}));});
 const v=await stats('',{env:{MEGULIT_RELAY_BASE:`http://127.0.0.1:${s.address().port}`}});s.close();
 assert.deepEqual(v,{games:60,versions:58,confirmed:12,waiting:48,updatedAt:'2026-11-21T10:00:00Z'});
 assert.ok(seen.startsWith('/api/seed/stats|'));assert.ok(!/cookie|authorization/i.test(seen));
});
test('built-in order is api first, then cn-api',()=>{
 assert.deepEqual(urls('',{}),['https://api.megulit.com/api/seed/stats','https://cn-api.megulit.com/api/seed/stats']);
});
test('falls through to the second host when the first fails or is slow',async()=>{
 const calls=[];const fetcher=async u=>{calls.push(u);if(u.includes('//api.'))throw new Error('down');return {ok:true,json:async()=>({games:5,versions:5})};};
 const v=await stats('',{env:{},fetch:fetcher,timeout:50});
 assert.equal(calls.length,2);assert.deepEqual(v,{games:5,versions:5});
});
test('3 s timeout is applied per host',async()=>{
 const s=await serve(()=>{});const base=`http://127.0.0.1:${s.address().port}`;const t=Date.now();
 const v=await stats('',{list:[base+'/a'],timeout:200});s.closeAllConnections();s.close();
 assert.equal(v,null);assert.ok(Date.now()-t<2000);
});
test('bad answers return null so the page keeps the bundled file',async()=>{
 const bad=[{ok:false,json:async()=>({})},{ok:true,json:async()=>({games:'a',versions:1})},{ok:true,json:async()=>null}];
 for(const b of bad)assert.equal(await stats('',{env:{},fetch:async()=>b,timeout:50}),null);
 assert.equal(clean({games:-1,versions:1}),null);
});
