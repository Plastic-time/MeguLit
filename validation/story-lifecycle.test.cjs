// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
function load(name,overrides){const file=path.join(__dirname,'../services',name),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));const normal=m.require.bind(m);m.require=id=>Object.hasOwn(overrides,id)?overrides[id]:normal(id);m._compile(fs.readFileSync(file,'utf8'),file);return m.exports;}
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
test('each real story dispatch keeps its database open until the async handler settles',async()=>{
 for(const action of ['story_list','story_graph','story_image']){
  const wait=deferred();let closed=0,seen;const db={close(){closed++;}};
  const bridge=load('bridge.cjs',{'./store.cjs':{openStore:()=>db},'./relay-gate.cjs':{install(){}},'./story-progress.cjs':{async handle(actual,root,request){seen={actual,request};await wait.promise;assert.equal(closed,0);return {status:'ready'};}}});
  const request={action,gameId:'owned-fixture'},job=bridge.dispatch(request);assert.equal(seen.actual,db);assert.equal(seen.request,request);assert.equal(closed,0);wait.resolve();assert.deepEqual(await job,{status:'ready'});assert.equal(closed,1);
 }
});
test('a rejected story handler still closes its database exactly once',async()=>{
 let closed=0;const error=Error('owned fixture failure'),bridge=load('bridge.cjs',{'./store.cjs':{openStore:()=>({close(){closed++;}})},'./relay-gate.cjs':{install(){}},'./story-progress.cjs':{async handle(){await Promise.resolve();throw error;}}});
 await assert.rejects(bridge.dispatch({action:'story_image'}),e=>e===error);assert.equal(closed,1);
});
test('runtime shutdown waits for analysis exit and disposes remaining services after a reader failure',async()=>{
 const wait=deferred(),events=[],first=Error('reader stop failed');let calls=0;
 const {Runtime}=load('runtime.cjs',{'./store.cjs':{readJSON:()=>({})},'./story-analysis.cjs':{stop(){calls++;events.push('analysis:start');return wait.promise.then(()=>events.push('analysis:exit'));}}});
 const runtime=new Runtime('owned-root');runtime.reader={stop(){events.push('reader');throw first;}};runtime.ankiRunner={stop(){events.push('anki');}};runtime.localLearning={stop(){events.push('learning');}};runtime.serviceManager={stop(){events.push('services');}};runtime.localEngine={cancel(){events.push('cancel');},stop(){events.push('local');}};
 let settled=false;const job=runtime.stop().catch(e=>{assert.equal(e,first);settled=true;}),second=runtime.stop().catch(e=>assert.equal(e,first));await new Promise(r=>setImmediate(r));assert.equal(calls,1);assert.equal(settled,false);assert.equal(events.includes('services'),false);wait.resolve();await Promise.all([job,second]);assert.equal(settled,true);assert.deepEqual(events,['analysis:start','reader','anki','analysis:exit','learning','cancel','services','local']);
});
