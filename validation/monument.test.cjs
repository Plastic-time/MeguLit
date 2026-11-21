// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 传火碑 service (services/monument.cjs): paged names from GET /api/torch/monument, an empty monument when the relay has no
   such route or does not answer, this PC's own torch numbers (the highlight). No network. */
process.env.MEGULIT_RELAY_BASE='https://relay.test';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const mon=require('../services/monument.cjs'),feed=require('../services/auto-profile-feed.cjs');
const tmp=()=>fs.mkdtempSync(path.join(process.env.MEGULIT_TMP||os.tmpdir(),'monument-'));
const ok=body=>async()=>({ok:true,status:200,text:async()=>JSON.stringify(body)});
test('a page: query string, cleaned items, next and total',async()=>{let url='';const f=async u=>{url=u;return ok({items:[{torchNo:3,name:'  小明\n',at:'2026-11-21T00:00:00Z',game:'サクラノ詩'},{torchNo:4,name:null,at:1700000000000,game:''},{torchNo:0,name:'bad'},{name:'x'},null],next:'c9',total:42})();};
 const r=await mon.page(tmp(),{cursor:'c8',limit:50,fetcher:f});assert.match(url,/\/api\/torch\/monument\?cursor=c8&limit=50$/);assert.deepEqual(r.items.map(x=>x.torchNo),[3,4]);assert.equal(r.items[0].name,'小明');assert.equal(r.items[1].name,null);assert.equal(r.next,'c9');assert.equal(r.total,42);});
test('names are capped at 30 characters and the limit at 200',async()=>{let url='';const f=async u=>{url=u;return ok({items:[{torchNo:1,name:'あ'.repeat(60),at:'t',game:'g'.repeat(200)}],next:null,total:1})();};
 const r=await mon.page(tmp(),{limit:9999,fetcher:f});assert.match(url,/limit=200$/);assert.equal([...r.items[0].name].length,30);assert.equal([...r.items[0].game].length,80);assert.equal(r.next,null);});
test('no route, no network or a bad answer = an empty monument, never an error',async()=>{const root=tmp();
 for(const f of [async()=>({ok:false,status:404,text:async()=>''}),async()=>{throw Error('offline');},async()=>({ok:true,status:200,text:async()=>'not json'}),ok({nope:1}),null]){const r=await mon.page(root,{fetcher:f});assert.deepEqual(r,{items:[],next:null,total:0,offline:true});}});
test('mine: the torch numbers of the diffs this PC uploaded',()=>{const root=tmp();const k1='a'.repeat(64),k2='b'.repeat(64),k3='c'.repeat(64);feed.markSent(root,k1,{torchNo:14,name:'x',at:'t'});feed.markSent(root,k2,{torchNo:14,name:null,at:'t'});feed.markSent(root,k3);
 assert.deepEqual(mon.mine(root).torchNos,[14]);assert.deepEqual(mon.mine(tmp()).torchNos,[]);});
