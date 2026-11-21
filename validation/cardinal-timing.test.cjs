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
 assert.ok(start>0&&end>start);const execute=new Function('Timing','probes',`return (async()=>{let clock=0,sampling=true,n=0;const out={samples:[],sourceEpisodes:[]},timing=Timing.recorder({sampleMs:90,now:()=>clock}),page={evaluate:async()=>structuredClone(probes[n])},hits=()=>[],scenario={sampleEvery:90},sleep=async ms=>{clock+=ms;if(++n>=probes.length)sampling=false;};timing.step(0,0);${sampler}await sampler;out.timing=timing.finish();out.lag=Timing.statistics(out.timing.steps,out.timing.probes,90).lag;return out;})()`);
 const probes=Array.from({length:4},()=>({glyphs:[],hookSource:'合成の計測本文'})),o=await execute(Timing,probes);assert.equal(Timing.check({steps,o,rules}).reliable,true);assert.deepEqual(o.samples.map(s=>s.at),[0,90,180,270]);assert.equal(o.timing.probes.length,4);
 probes[1]=null;const failed=await execute(Timing,probes);assert.equal(failed.samples.length,3);assert.equal(failed.timing.probes.length,4);assert.equal(failed.timing.probes[1].ok,false);assert.equal(Timing.check({steps,o:failed,rules}).reliable,false);
});
