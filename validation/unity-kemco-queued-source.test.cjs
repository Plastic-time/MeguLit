// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const ROOT=require('node:path').resolve(__dirname,'..');
const {HookNative}=require(ROOT+'/core/hook-native.cjs'),{UnityTextPath}=require(ROOT+'/core/text-paths-unity.cjs'),{attach}=require(ROOT+'/core/text-paths-launch.cjs'),{PREFIX,SHA}=require(ROOT+'/core/unity-kemco-source.cjs');
const owner={pid:42,started:'638000000000000000'};
test('production final source boundary rejects an older burst and an origin-only forged receipt',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let clock=1000;const out=[];
 const h=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-fixture-log'},m=>out.push(m),()=>{},()=>clock);h.trace=()=>{};h.target={...owner};
 const p=new UnityTextPath();p.kemco.now=()=>clock;attach({path:'unity',session:p},h);p.drawConfig({kemcoSprites:true});
 try{
  h.source({text:'最初の本文を読みます。',sourceName:'EmbedTest',origin:'live'},'');clock+=20;t.mock.timers.tick(20);
  h.source({text:'古い途中の文字です。',sourceName:'EmbedTest',origin:'live'},'');assert.ok(h.skipBurst.held);
  clock+=20;t.mock.timers.tick(20);const full='完全な本文を受け取ります。';
  p.line(PREFIX+[p.kemco.scope,1,1,'full',SHA,owner.pid,owner.started,Buffer.from(full).toString('base64')].join('\t'));
  assert.equal(h.state.hookSource,full);assert.equal(h.state.hookSourceOrigin,'unity-kemco');assert.equal(p.blockSource({},owner),true);
  clock+=401;t.mock.timers.tick(401);
  const evidence={source:h.state.hookSource,origin:h.state.hookSourceOrigin,leaseStillBlocks:p.blockSource({},owner),events:out.filter(x=>x.hookSource).map(x=>({text:x.hookSource,origin:x.hookSourceOrigin}))};
  assert.equal(evidence.source,full);assert.equal(evidence.origin,'unity-kemco');assert.equal(evidence.leaseStillBlocks,true);const seq=h.state.hookSequence;h.emitSource('偽の完全文です。','unity-kemco');assert.equal(h.state.hookSequence,seq);assert.equal(h.state.hookSource,full);
 }finally{await p.stop();await h.stop();}
});
