// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 传火碑 reads (services/torch-monument.cjs): both relay hosts, routes not deployed yet, clean-up of what the relay says */
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const tm=require('../services/torch-monument.cjs');
const root=()=>fs.mkdtempSync(path.join(os.tmpdir(),'torch-'));
const res=(status,body)=>({status,ok:status>=200&&status<300,json:async()=>body,text:async()=>JSON.stringify(body)});
test('a page falls through to the second relay host and is cleaned',async()=>{const seen=[];
 const fetch=async url=>{seen.push(url);if(seen.length===1)throw Error('down');
  return res(200,{ok:true,total:2,items:[{torchNo:0,name:'  惠惠‮ ',at:1763700000,gameVndb:'v17',game:'サクラノ詩'},{torchNo:2,name:null,at:'2026-11-21T00:00:00Z',game:null,gameVndb:'https://invalid/'},{torchNo:null,name:'bad'},{torchNo:-1,name:'bad'}],next:'2'});};
 const r=await tm.page(root(),{month:'2026-11',cursor:'5',limit:9999},{fetch});
 assert.equal(seen.length,2);assert.match(seen[0],/month=2026-11/);assert.match(seen[0],/cursor=5/);assert.match(seen[0],/limit=500/);
 assert.equal(r.ok,true);assert.equal(r.items.length,2);assert.equal(r.items[0].torchNo,0);assert.equal(r.items[0].gameVndb,'v17');assert.ok(!('gameVndb' in r.items[1]));assert.equal(r.items[0].name,'惠惠');assert.equal(r.items[1].name,null);assert.equal(r.items[1].month,'2026-11');assert.equal(r.next,'2');});
test('a route the relay does not have yet answers available:false',async()=>{const fetch=async()=>res(404,{ok:false,error:'NOT_FOUND'});
 assert.equal((await tm.months(root(),{fetch})).available,false);assert.equal((await tm.find(root(),'惠',{fetch})).available,false);
 assert.equal((await tm.page(root(),{},{fetch})).error,'NOT_DEPLOYED');});
test('the find probe: 400 INVALID_NAME means the route exists',async()=>{const fetch=async()=>res(400,{ok:false,error:'INVALID_NAME'});
 assert.deepEqual(await tm.find(root(),'',{fetch}),{ok:true,available:true,items:[]});});
test('names are cut to 30 characters',()=>{assert.equal([...tm.cleanItem({torchNo:3,name:'あ'.repeat(40),at:1}).name].length,30);});
test('me merges the credits this PC keeps with what the relay knows',async()=>{const r0=root(),dir=path.join(r0,'data','The Seed');fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'0123456789abcdef.sent.json'),JSON.stringify({credit:{torchNo:7,name:'本机',at:1763700000}}));
 const fetch=async()=>res(200,{ok:true,items:[{torchNo:9,name:null,at:1763800000,game:'X'}]});
 const r=await tm.me(r0,{fetch});assert.deepEqual(r.items.map(i=>i.torchNo),[7,9]);assert.equal(r.items[0].name,'本机');});

test('owner launcher can only read the fixed public routes and keeps /me local',async()=>{
 const install=path.resolve('isolated-monument-fixture');
 const launcher=require('../tools/owner-tests-launch.cjs'),relay=require('../services/relay-config.cjs');
 const env=launcher.environment(install,{MEGULIT_RELAY_BASE:'https://ignored.invalid'});
 const requests=[];
 const fetch=async(url,request)=>{
  requests.push(url);
  assert.equal(request.method,'GET');
  assert.equal(request.redirect,'error');
  assert.equal(request.credentials,'omit');
  assert.equal(request.body,undefined);
  assert.deepEqual(request.headers,{'user-agent':'MeguLit',accept:'application/json'});
  return res(200,{ok:true,total:0,items:[],months:[]});
 };
 assert.deepEqual(relay.endpoints(install,'/api/diagnostics',env),[]);
 assert.deepEqual(await tm.page(install,{device:'ignored',limit:1.7},{env,fetch}),{ok:true,total:0,month:null,items:[],next:null});
 await tm.months(install,{env,fetch});
 await tm.find(install,'A&key=ignored',{env,fetch});
 await tm.me(install,{env,fetch});
 assert.deepEqual(requests,[
  relay.CN_RELAY_BASE+'/api/torch/monument?limit=1',
  relay.CN_RELAY_BASE+'/api/torch/months',
  relay.CN_RELAY_BASE+'/api/torch/find?name=A%26key%3Dignored'
 ]);
});

test('explicit offline and replay perform no public reads',async()=>{
 const install=path.resolve('isolated-monument-fixture');
 const launcher=require('../tools/owner-tests-launch.cjs');
 assert.equal(launcher.environment(install,{MEGULIT_OFFLINE:'1'}).MEGULIT_OFFLINE,'1');
 for(const env of [launcher.environment(install,{MEGULIT_OFFLINE:'1'}),
  {...launcher.environment(install,{}),MEGULIT_CARDINAL_REPLAY:'1'},{MEGULIT_OFFLINE:'1'}]){
  let calls=0;
  const opts={env,fetch:async()=>{calls++;throw Error('unexpected network');}};
  assert.equal((await tm.page(install,{},opts)).error,'OFFLINE');
  assert.equal((await tm.months(install,opts)).error,'OFFLINE');
  assert.equal((await tm.find(install,'',opts)).error,'OFFLINE');
  await tm.me(install,opts);
  assert.equal(calls,0);
 }
});
