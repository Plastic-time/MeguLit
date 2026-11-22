// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),Timing=require('../core/cardinal/timing.cjs'),{instrument}=require('./helpers/cardinal-timing.cjs');
const rules={sampleMs:90,maxLagMs:80},steps=[{t:1000}];
const output=(times=[0,90,180,270])=>instrument(steps,{samples:times.map(at=>({at,mark:'tick'})),sourceEpisodes:[]});
test('a measured monotonic sampling proof requires explicit counts, lag and a common DOM clock',()=>{
 const o=output(),p=Timing.check({steps,o,rules});assert.equal(p.reliable,true);assert.equal(p.sampleCount,4);assert.equal(p.sampleIntervals,3);assert.equal(Timing.validProof(p),true);
 for(const mutate of [o=>delete o.lag,o=>o.lag.stepP95='not-a-number',o=>o.lag.sampleP95=null,o=>o.lag.stepMax=Infinity,o=>o.lag.sampleMax=-1,o=>delete o.timing,o=>o.timing.clock='Date.now',o=>o.timing.truncated=true,o=>o.timing.steps=[],o=>o.timing.steps[0].step=3,o=>o.timing.steps[0].at=NaN,o=>o.timing.probes[0].ok=false,o=>o.timing.probes[1].at=o.timing.probes[0].at,o=>o.timing.probes[0].at=-1,o=>o.samples.pop(),o=>o.samples[0].at=1795253075191,o=>o.samples[0].error='probe failed',o=>o.sourceEpisodes=[{at:999999}]]){const bad=structuredClone(o);mutate(bad);assert.equal(Timing.check({steps,o:bad,rules}).reliable,false);}
 for(const count of [0,1,2,3]){const bad=output(Array.from({length:count},(_,i)=>i*90));assert.equal(Timing.check({steps,o:bad,rules}).reliable,false);}
});
test('slow steps, slow sampling, long isolated gaps and missing beginning/end coverage stay unreliable',()=>{
 const slowSteps=output(Array.from({length:61},(_,i)=>i*90));slowSteps.timing.steps[0].at=5000;slowSteps.lag=Timing.statistics(slowSteps.timing.steps,slowSteps.timing.probes,90).lag;assert.equal(slowSteps.lag.stepP95,5000);assert.equal(Timing.check({steps,o:slowSteps,rules}).reliable,false);
 const slow=output([0,5090,10180,15270]);assert.equal(slow.lag.sampleP95,5000);assert.equal(Timing.check({steps,o:slow,rules}).reliable,false);
 const times=Array.from({length:41},(_,i)=>i*90+(i>20?5000:0)),gap=output(times);assert.equal(gap.lag.sampleP95,0);assert.equal(gap.lag.sampleMax,5000);assert.equal(Timing.check({steps,o:gap,rules}).reliable,false);
 assert.equal(Timing.check({steps,o:output([500,590,680,770]),rules}).reliable,false);const tail=output();tail.timing.durationMs+=500;assert.equal(Timing.check({steps,o:tail,rules}).reliable,false);
});
test('pending timing proof validation does not accept legacy or incomplete boolean-only summaries',()=>{
 const p=Timing.check({steps,o:output(),rules});for(const change of [p=>delete p.sampleAttempts,p=>p.sampleCount=3,p=>p.sampleIntervals=1,p=>p.stepCount=0,p=>p.expectedStepCount=4,p=>p.stepP95=5000,p=>p.sampleP95='0',p=>p.sampleGapMax=1000,p=>p.durationMs=NaN]){const bad=structuredClone(p);change(bad);assert.equal(Timing.validProof(bad),false);}
 assert.equal(Timing.validProof({reliable:true}),false);
});
test('the actual driver sampler records successful and failed probe timings through the shared recorder',async()=>{
 const source=fs.readFileSync(require.resolve('../services/cardinal/driver.cjs'),'utf8'),start=source.indexOf('const sampler=(async()=>'),end=source.indexOf('/* scenario.attachSettleMs',start),sampler=source.slice(start,end);
 assert.ok(start>0&&end>start);const execute=new Function('Timing','probes',`return (async()=>{let clock=0,sampling=true,n=0;const out={samples:[],sourceEpisodes:[]},timing=Timing.recorder({sampleMs:90,now:()=>clock,wallNow:()=>100000+clock}),page={evaluate:async()=>structuredClone(probes[n])},hits=()=>[],scenario={sampleEvery:90},sleep=async ms=>{clock+=ms;if(++n>=probes.length)sampling=false;};timing.step(0,0);${sampler}await sampler;out.t0=timing.wallOrigin;out.timing=timing.finish();out.lag=Timing.statistics(out.timing.steps,out.timing.probes,90).lag;return out;})()`);
 const probes=Array.from({length:4},()=>({glyphs:[],hookSource:'合成の計測本文'})),o=await execute(Timing,probes);assert.equal(Timing.check({steps,o,rules}).reliable,true);assert.deepEqual(o.samples.map(s=>s.at),[0,90,180,270]);assert.equal(o.timing.probes.length,4);
 probes[1]=null;const failed=await execute(Timing,probes);assert.equal(failed.samples.length,3);assert.equal(failed.timing.probes.length,4);assert.equal(failed.timing.probes[1].ok,false);assert.equal(Timing.check({steps,o:failed,rules}).reliable,false);
});


test('wall-clock jumps cannot mix native log offsets with monotonic DOM or survive pending retry',()=>{
 const normal=output(),good=Timing.check({steps,o:normal,rules});assert.equal(good.reliable,true);
 for(const mutate of [o=>delete o.timing.wallChecks,o=>delete o.timing.wallOrigin,o=>o.t0++,o=>o.timing.wallChecks[1].wallAt+=5000,o=>o.timing.wallChecks[1].wallAt-=5000,o=>o.timing.wallChecks[1].wallAt='1',o=>o.timing.wallChecks.pop(),o=>o.timing.wallChecks=o.timing.wallChecks.filter(c=>c.at!==90)]){const bad=structuredClone(normal);mutate(bad);assert.equal(Timing.check({steps,o:bad,rules}).reliable,false);}
 const old=structuredClone(good);delete old.wallClock;assert.equal(Timing.validProof(old),false);old.wallClock={...good.wallClock,maxDriftMs:5000};assert.equal(Timing.validProof(old),false);
 let mono=0,wall=100000;const r=Timing.recorder({sampleMs:90,now:()=>mono,wallNow:()=>wall}),raw={samples:[],sourceEpisodes:[],t0:r.wallOrigin};r.step(0,0);
 for(let i=0;i<4;i++){mono=i*90;wall=100000+mono+(i===1?5000:0);const at=r.sample(true);raw.samples.push({at,mark:'tick'});}mono+=90;wall=100000+mono;raw.timing=r.finish();raw.lag=Timing.statistics(raw.timing.steps,raw.timing.probes,90).lag;
 assert.equal(raw.timing.wallChecks.at(-1).wallAt-raw.t0,raw.timing.durationMs,'clock recovered before finish');assert.match(Timing.check({steps,o:raw,rules}).why,/wall clock changed/);
});

test('actual driver bridge timestamps and event/choice normalization use the same monotonic origin',()=>{
 const source=fs.readFileSync(require.resolve('../services/cardinal/driver.cjs'),'utf8'),start=source.indexOf('function fakeProc(name)'),end=source.indexOf("const gwb=fakeProc",start),body=source.slice(start,end);
 const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');let clock=1200;const factory=new Function('EventEmitter','PassThrough','stamp',body+'return fakeProc;')(EventEmitter,PassThrough,()=>clock),p=factory('bridge');p.stdin.write(JSON.stringify({type:'disable'})+'\n');assert.equal(p.sent[0].at,1200);clock=1250;p.stdin.write(JSON.stringify({type:'enable'})+'\n');assert.equal(p.sent[1].at,1250);
 assert.doesNotMatch(body,/Date.now/);assert.match(source,/events.push\(\{at:stamp\(\)/);assert.match(source,/offers.push\(\{at:stamp\(\)/);assert.match(source,/offers.at\(-1\).until=stamp\(\)/);assert.match(source,/t0=timing.origin;out.t0=timing.wallOrigin/);assert.deepEqual(p.sent.map(x=>x.at-1200),[0,50]);
});
