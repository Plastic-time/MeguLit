'use strict';
/* v1.1.1: a local engine with a downloaded model but no llama.cpp runtime downloads the runtime by itself and says so. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {LocalLlm}=require('../core/local-llm.cjs');
test('missing runtime starts its download and reports progress instead of failing silently',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'llm-'));let fetched=0;
 const llm=new LocalLlm({root,models:{status:()=>({models:[]})},fetchImpl:async url=>{if(/health/.test(url))throw Error('down');fetched++;return {ok:false,status:503};}});
 await assert.rejects(llm.ensure({provider:'sakura',baseUrl:'http://127.0.0.1:8080/v1'}),/LOCAL_RUNTIME_DOWNLOADING:0/);
 assert.ok(llm.job,'download started');await new Promise(r=>setTimeout(r,50));assert.equal(fetched,1);
 fs.rmSync(root,{recursive:true,force:true});
});
test('runtime download moves on to the next source when one fails',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'llm-'));fs.mkdirSync(path.join(root,'setup'));fs.writeFileSync(path.join(root,'setup','runtime.json'),JSON.stringify({mirrors:['https://mirror.example/{url}']}));
 const tried=[];const llm=new LocalLlm({root,models:{status:()=>({models:[]})},fetchImpl:async url=>{tried.push(new URL(url).host);return {ok:false,status:502};}});
 llm.download();for(let i=0;i<50&&llm.job.state==='downloading';i++)await new Promise(r=>setTimeout(r,10));
 assert.equal(llm.job.state,'error');assert.deepEqual([...tried].sort(),['github.com','mirror.example']);
 fs.rmSync(root,{recursive:true,force:true});
});
test('the overlay gets live download progress, then the model start, then the translation',async()=>{
 const {Reader}=require('../services/reader.cjs');const events=[];let calls=0;
 const job={state:'downloading',received:0,total:100};
 const llm={job,ensure:async()=>{calls++;if(calls===1)throw Error('LOCAL_RUNTIME_DOWNLOADING:0');}};
 const fake={runtime:{local:()=>llm,emit:(t,m)=>events.push(m.args[3])}};
 const tick=setInterval(()=>{job.received=Math.min(100,job.received+40);if(job.received>=100)job.state='done';},300);
 await Reader.prototype.localReady.call(fake,{},7,()=>true);clearInterval(tick);
 assert.equal(events[0],'LOCAL_RUNTIME_DOWNLOADING:0');assert.ok(events.some(e=>/:(40|80)$/.test(e)));
 assert.deepEqual(events.slice(-2),['LOCAL_RUNTIME_DOWNLOADING:100','LOCAL_STARTING']);assert.equal(calls,2);
});
test('v1.1.6: MOJi is a lookup explanation source that needs no model profile',()=>{
 const {cleanLookup,lookupOptions}=require('../core/lookup-models.cjs');
 assert.equal(cleanLookup({lookupProvider:'moji'}).lookupProvider,'moji');
 assert.deepEqual(lookupOptions({lookupProvider:'moji'}),{provider:'moji'});
});
test('v1.1.6: MOJi is the default lookup explanation source; an explicit choice is kept',()=>{
 const {cleanLookup}=require('../core/lookup-models.cjs');
 assert.equal(cleanLookup({}).lookupProvider,'moji');assert.equal(cleanLookup({lookupProvider:'local'}).lookupProvider,'local');
});
