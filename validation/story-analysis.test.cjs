'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{Worker}=require('node:worker_threads');
const analysis=require('../services/story-analysis.cjs'),data=require('../services/story-data.cjs');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate){for(let i=0;i<250;i++){if(predicate())return;await wait(20);}throw Error('bounded worker wait expired');}
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-story-lifecycle-')),file=path.join(root,'worker.cjs'),workers=[],events=[];let live=0,maxLive=0;
 fs.writeFileSync(file,`const {parentPort,workerData}=require('node:worker_threads');if(workerData.mode==='busy')Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);else if(workerData.mode==='crash')throw Error('fixture crash');else{parentPort.postMessage(workerData.reply);setInterval(()=>{},1000);}`);
 const game=mode=>{const dir=path.join(root,mode);fs.mkdirSync(dir,{recursive:true});const exe=path.join(dir,'game.exe'),script=path.join(dir,'script.bin');fs.writeFileSync(exe,mode);fs.writeFileSync(script,'script');return {exe,doc:{builds:[data.digest(exe)],scripts:[{name:'script.bin',sha256:data.digest(script)}]}};};
 const factory=options=>{const mode=fs.readFileSync(options.workerData.exe,'utf8');if(mode==='constructor-fail')throw Error('fixture constructor failure');assert.deepEqual(options.resourceLimits,{maxOldGenerationSizeMb:192,maxYoungGenerationSizeMb:16,codeRangeSizeMb:16,stackSizeMb:4});const reply={verified:true,stamp:analysis.signature(options.workerData.exe,options.workerData.scripts),cg:{stamp:'',result:{supported:false,items:new Map()}}},worker=new Worker(file,{...options,workerData:{mode,reply}});workers.push(worker);live++;maxLive=Math.max(maxLive,live);events.push('start:'+mode);worker.once('exit',()=>{live--;events.push('exit:'+mode);});return worker;};
 t.after(async()=>{await Promise.allSettled(workers.map(w=>w.terminate()));fs.rmSync(root,{recursive:true,force:true});});
 return {game,factory,workers,events,get live(){return live;},get maxLive(){return maxLive;}};
}
test('timeout, successful result, crash and constructor error release the single slot only after exit',async t=>{
 const f=fixture(t),service=analysis.createService({timeoutMs:350,maxQueued:2,workerFactory:f.factory,memoryAvailable:()=>Infinity}),a=f.game('busy'),b=f.game('success'),c=f.game('crash'),d=f.game('constructor-fail'),e=f.game('last');
 t.after(()=>service.stop());assert.equal(service.identity(a.exe,a.doc).state,'preparing');await until(()=>f.workers.length===1);await new Promise(resolve=>f.workers[0].once('online',resolve));
 assert.equal(service.identity(b.exe,b.doc).state,'preparing');assert.equal(service.identity(c.exe,c.doc).state,'preparing');for(let i=0;i<30;i++)assert.equal(service.identity(b.exe,b.doc).state,'preparing');assert.equal(service.status().queued,2);assert.equal(service.identity(d.exe,d.doc).state,'busy');
 await until(()=>!service.status().running&&!service.status().queued);assert.equal(service.identity(a.exe,a.doc).state,'unavailable');assert.equal(service.identity(b.exe,b.doc).state,'ready');assert.equal(service.identity(c.exe,c.doc).state,'unavailable');
 service.identity(d.exe,d.doc);service.identity(e.exe,e.doc);await until(()=>!service.status().running&&!service.status().queued);assert.equal(service.identity(d.exe,d.doc).state,'unavailable');assert.equal(service.identity(e.exe,e.doc).state,'ready');assert.equal(f.maxLive,1);assert.equal(f.live,0);
 assert.ok(f.events.indexOf('exit:busy')<f.events.indexOf('start:success'));assert.ok(f.events.indexOf('exit:success')<f.events.indexOf('start:crash'));
});
test('stop discards waiting work, awaits the busy worker exit and prevents later launches',async t=>{
 const f=fixture(t),service=analysis.createService({timeoutMs:5000,workerFactory:f.factory,memoryAvailable:()=>Infinity}),a=f.game('busy'),b=f.game('success');service.identity(a.exe,a.doc);await until(()=>f.workers.length===1);await new Promise(resolve=>f.workers[0].once('online',resolve));service.identity(b.exe,b.doc);const stopped=service.stop();assert.equal(service.status().closed,true);assert.equal(service.status().queued,0);await stopped;assert.equal(f.live,0);assert.equal(service.status().running,false);assert.equal(f.workers.length,1);assert.equal(service.identity(b.exe,b.doc).state,'unavailable');await service.stop();
});
test('insufficient available memory creates no worker and does not leave queued proof tasks',async t=>{
 const f=fixture(t),service=analysis.createService({workerFactory:f.factory,memoryAvailable:()=>0}),a=f.game('success');assert.equal(service.identity(a.exe,a.doc).state,'resource-limited');assert.equal(service.refreshCg(a.exe,'save-stamp').state,'resource-limited');assert.equal(service.status().queued,0);assert.equal(service.status().running,false);assert.equal(f.workers.length,0);await service.stop();
});
