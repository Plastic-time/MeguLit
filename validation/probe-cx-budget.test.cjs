// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const threads=require('node:worker_threads'),{once}=require('node:events');
const {EventEmitter}=require('node:events');
const scenes=require('../services/original-engines/scenes.cjs'),core=require('../services/adapter-probe-core.cjs');

test('a busy CX archive cannot spend the reader budget or publish an incomplete cache',{timeout:15000},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-cx-budget-')),file=path.join(dir,'scn.xp3'),fixture=path.join(dir,'busy.cjs');
 fs.writeFileSync(file,'tiny archive whose index must be inspected inside the worker');
 fs.writeFileSync(fixture,`const fs=require('node:fs'),path=require('node:path'),{workerData:d}=require('node:worker_threads');
  fs.mkdirSync(path.dirname(d.attempt),{recursive:true});fs.writeFileSync(d.attempt,'{"partial":');fs.writeFileSync(d.attempt+'.started',String(process.pid));for(;;){}`);
 const Native=threads.Worker,workers=[],exits=[],attempts=[];
 t.mock.method(threads,'Worker',function(_file,options){
  attempts.push(options.workerData.attempt);const w=new Native(fixture,options);workers.push(w);exits.push(once(w,'exit'));return w;
 });
 try{
  assert.equal(scenes.cxPrepareSync(dir,{deadline:Date.now()-1}),0);assert.equal(workers.length,0,'expired budget never starts a worker');
  const start=Date.now();scenes.withCxProbe(()=>{
   assert.equal(scenes.cxPrepareSync(dir,{deadline:Date.now()+1500}),0);
   assert.equal(workers.length,1,'even archive inspection runs in the owned worker');
   assert.ok(fs.existsSync(attempts[0]+'.started'),'the actual worker reached its busy loop');
   assert.ok(Date.now()-start<6000,'the synchronous caller returns without waiting for archive completion');
   const canonical=attempts[0].replace(/\.\d+\.[a-f0-9-]+\.tmp$/,'');
   assert.notEqual(canonical,attempts[0]);assert.equal(fs.existsSync(canonical),false,'partial worker bytes never become a usable cache');
   assert.ok(scenes.cxBuilds.size>0,'termination is tracked until its promise settles');
   for(let i=0;i<3;i++){scenes.ENGINES['kirikiri-cx'].scenes(dir);scenes.cxChineseOnly(dir);}
   assert.equal(workers.length,1,'probe readers cannot silently restart the timed-out build');
   const preparing=scenes.preparing(dir).kind;assert.equal(preparing,'budget');
   assert.equal(core.classify({engines:[{id:'kirikiri',error:'DECRYPT_FAILED',scenes:0}],inventory:{archives:[],scripts:0},unsupported:{engine:'kirikiri',code:'DECRYPT_FAILED'},preparing}).step,'preparing','budget is not evidence of bad decryption');
   assert.equal(core.classify({engines:[{id:'kirikiri-cx',lines:4,japaneseLines:4,dialogueLines:4,chineseLines:0}],inventory:{archives:[],scripts:0},unsupported:null,preparing}).step,'ok','complete readable text still wins');
  });
  await Promise.all(exits);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(scenes.cxBuilds.size,0);assert.equal(fs.existsSync(attempts[0]),false,'only an exited worker has its owned partial removed');
 }finally{await Promise.allSettled(workers.map(w=>w.terminate()));for(const attempt of attempts)for(const suffix of ['', '.started'])try{fs.rmSync(attempt+suffix,{force:true});}catch{}fs.rmSync(dir,{recursive:true,force:true});}
});

test('a rejected termination request retains ownership until an actual exit',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-cx-exit-'));fs.writeFileSync(path.join(dir,'scn.xp3'),'tiny');let attempt,held;
 t.mock.method(threads,'Worker',function(_file,{workerData:d}){
  attempt=d.attempt;fs.mkdirSync(path.dirname(attempt),{recursive:true});fs.writeFileSync(attempt,'partial');Atomics.store(new Int32Array(d.signal),0,2);
  held=new EventEmitter();held.unref=()=>{};held.terminate=()=>Promise.reject(new Error('termination not confirmed'));return held;
 });
 try{
  assert.equal(scenes.cxPrepareSync(dir,{deadline:Date.now()+10000}),0);await new Promise(resolve=>setImmediate(resolve));
  assert.ok([...scenes.cxBuilds.values()].includes(held));assert.equal(fs.existsSync(attempt),true,'a still-owned writer must not lose its file');
  held.emit('exit',1);assert.ok(![...scenes.cxBuilds.values()].includes(held));assert.equal(fs.existsSync(attempt),false);
 }finally{held?.emit('exit',1);fs.rmSync(dir,{recursive:true,force:true});}
});

test('a complete worker result is rejected when its input changed before publication',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-cx-identity-')),file=path.join(dir,'scn.xp3');fs.writeFileSync(file,'original');let attempt;
 t.mock.method(threads,'Worker',function(_file,{workerData:d}){
  attempt=d.attempt;fs.mkdirSync(path.dirname(attempt),{recursive:true});fs.writeFileSync(attempt,JSON.stringify({docs:[]}));fs.appendFileSync(file,' changed');Atomics.store(new Int32Array(d.signal),0,1);
  const w=new EventEmitter();w.unref=()=>{};w.terminate=()=>Promise.resolve(0);return w;
 });
 try{scenes.withCxProbe(()=>{assert.equal(scenes.cxPrepareSync(dir,{deadline:Date.now()+10000}),0);assert.equal(scenes.preparing(dir).kind,'budget');assert.equal(fs.existsSync(attempt.replace(/\.\d+\.[a-f0-9-]+\.tmp$/,'')),false);});await new Promise(resolve=>setImmediate(resolve));assert.equal(fs.existsSync(attempt),false);}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('probe cache-only scopes nest and restore the normal background policy after an exception',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-cx-scope-'));fs.writeFileSync(path.join(dir,'scn.xp3'),'tiny');let started=0;
 t.mock.method(require('../services/original-engines/xp3.cjs'),'list',()=>({files:[{name:'001.scn',encrypted:true}]}));
 t.mock.method(threads,'Worker',function(){started++;const w=new EventEmitter();w.unref=()=>{};queueMicrotask(()=>w.emit('exit',0));return w;});
 try{
  assert.throws(()=>scenes.withCxProbe(()=>{scenes.ENGINES['kirikiri-cx'].scenes(dir);scenes.withCxProbe(()=>scenes.ENGINES['kirikiri-cx'].scenes(dir));assert.equal(started,0);throw new Error('leave scope');}),/leave scope/);
  scenes.ENGINES['kirikiri-cx'].scenes(dir);assert.equal(started,1);await new Promise(resolve=>setImmediate(resolve));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('success cannot publish when the final input stat consumes the remaining budget',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-cx-late-')),file=path.join(dir,'scn.xp3');fs.writeFileSync(file,'original');let now=1000,stats=0,attempt;
 const stat=fs.statSync;t.mock.method(Date,'now',()=>now);t.mock.method(fs,'statSync',function(p,...args){const result=stat.call(this,p,...args);if(p===file&&++stats===2)now=11001;return result;});
 t.mock.method(threads,'Worker',function(_file,{workerData:d}){
  attempt=d.attempt;fs.mkdirSync(path.dirname(attempt),{recursive:true});fs.writeFileSync(attempt,JSON.stringify({docs:[]}));Atomics.store(new Int32Array(d.signal),0,1);
  const w=new EventEmitter();w.unref=()=>{};w.terminate=()=>Promise.resolve(0);return w;
 });
 try{scenes.withCxProbe(()=>{assert.equal(scenes.cxPrepareSync(dir,{deadline:11000}),0);assert.equal(stats,2);assert.equal(scenes.preparing(dir).kind,'budget');assert.equal(fs.existsSync(attempt.replace(/\.\d+\.[a-f0-9-]+\.tmp$/,'')),false);});await new Promise(resolve=>setImmediate(resolve));}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('an unbounded prepare failure removes only its own attempt file',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-cx-failure-'));fs.writeFileSync(path.join(dir,'scn.xp3'),'tiny');let attempt;
 const worker=require('../services/original-engines/cx-worker.cjs');t.mock.method(worker,'prepare',function(_file,out){attempt=out;fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,'partial');throw new Error('incomplete write');});
 try{assert.equal(scenes.cxPrepareSync(dir),0);assert.ok(attempt);assert.equal(fs.existsSync(attempt),false);assert.equal(fs.existsSync(attempt.replace(/\.\d+\.[a-f0-9-]+\.tmp$/,'')),false);}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});
