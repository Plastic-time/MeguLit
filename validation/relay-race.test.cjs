// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* api.megulit.com vs its EdgeOne copy cn-api.megulit.com: the faster healthy host wins, a broken one never does. */
const test=require('node:test'),assert=require('node:assert/strict');
const relay=require('../services/relay-config.cjs');
const health=(delays,bad=new Set())=>async url=>{const base=url.replace('/api/health','');await new Promise(r=>setTimeout(r,delays[base]??0));
 if(bad.has(base))return new Response('nope',{status:502});return new Response(JSON.stringify({ok:true,service:'megulit-relay'}),{status:200});};
test('the faster healthy relay host is chosen',async()=>{
 const r=await relay.raceDefault({fetch:health({[relay.DEFAULT_RELAY_BASE]:120,[relay.CN_RELAY_BASE]:10})});
 assert.equal(r.chosen,relay.CN_RELAY_BASE);
 assert.equal(relay.relayBase(null,{}),relay.CN_RELAY_BASE);
});
test('a failing EdgeOne host falls back to api.megulit.com',async()=>{
 const r=await relay.raceDefault({fetch:health({[relay.DEFAULT_RELAY_BASE]:80,[relay.CN_RELAY_BASE]:5},new Set([relay.CN_RELAY_BASE]))});
 assert.equal(r.chosen,relay.DEFAULT_RELAY_BASE);
});
test('a page that is not the relay (no ok:true) does not count',async()=>{
 const fetcher=async url=>url.startsWith(relay.CN_RELAY_BASE)?new Response('<html>',{status:200}):new Response('{"ok":true}',{status:200});
 const r=await relay.raceDefault({fetch:fetcher});
 assert.equal(r.chosen,relay.DEFAULT_RELAY_BASE);
});
test('an address saved by the user or the env always wins',()=>{
 assert.equal(relay.relayBase(null,{MEGULIT_RELAY_BASE:'https://relay.example.com'}),'https://relay.example.com');
 assert.equal(relay.relayBase(null,{MEGULIT_RELAY_BASE:'off'}),'');
});
