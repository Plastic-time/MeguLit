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
