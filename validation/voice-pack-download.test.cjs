'use strict';
const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto');
const {VoicePack,VOICES}=require('../core/voice-pack.cjs');

const voice=VOICES[0],meta=`https://api.aivis-project.com/v1/aivm-models/${voice.uuid}`;
const grant=`${meta}/download?model_type=AIVMX`,source='https://models.example.test/model.aivmx?temporary=1';
const bytes=Buffer.alloc(5*1024*1024,0x7a),hash=createHash('sha256').update(bytes).digest('hex');
const manifest=()=>Response.json({model_files:[{model_type:'AIVMX',license_type:'ACML 1.0',file_size:bytes.length,checksum:hash}]});

function readModel({headers},url){
 const [,from,end]=/^bytes=(\d+)-(\d*)$/.exec(headers.Range);
 const start=Number(from),last=end?Number(end):bytes.length-1;
 const response=new Response(bytes.subarray(start,last+1),{status:206,headers:{'Content-Range':`bytes ${start}-${last}/${bytes.length}`}});
 if(url)Object.defineProperties(response,{url:{value:url},redirected:{value:true}});
 return response;
}

function setup(t,fetch){
 const dir=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-voice-download-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 return {dir,pack:new VoicePack({dir,fetch})};
}

test('voice download uses one AivisHub redirect and reads the checked model in ranges',async t=>{
 let grants=0;
 const ranges=[];
 const {dir,pack}=setup(t,async(url,opts)=>{
  if(url===meta)return manifest();
  ranges.push(opts.headers.Range);
  if(url===grant){
   if(++grants>1)return new Response(null,{status:429});
   assert.equal(opts.redirect,'follow');
   return readModel(opts,source);
  }
  assert.equal(url,source);
  return readModel(opts);
 });
 await pack.download(voice);
 assert.equal(grants,1);
 assert.ok(ranges.length>1,'model contents are fetched separately from the availability probe');
 assert.ok(ranges.some(range=>!range.startsWith('bytes=0-')),'the download makes a later range request');
 assert.deepEqual(fs.readFileSync(path.join(dir,voice.uuid+'.aivmx')),bytes);
});

test('voice download shares one renewed link across rejected ranges and verifies the result',async t=>{
 const renewed=source.replace('=1','=2');
 const rejected=[],retried=[];
 let grants=0,allowRenewal;
 const bothRejected=new Promise(resolve=>{allowRenewal=resolve;});
 const {dir,pack}=setup(t,async(url,opts)=>{
  if(url===meta)return manifest();
  if(url===grant){
   if(++grants===1)return readModel(opts,source);
   if(grants>2)return new Response(null,{status:429});
   assert.equal(opts.headers.Range,'bytes=0-0');
   await bothRejected;
   return readModel(opts,renewed);
  }
  if(url===source){
   rejected.push(opts.headers.Range);
   if(rejected.length===2)allowRenewal();
   return new Response('',{status:403});
  }
  assert.equal(url,renewed);
  retried.push(opts.headers.Range);
  return readModel(opts);
 });
 await pack.download(voice);
 assert.equal(grants,2);
 assert.ok(rejected.length>=2);
 for(const range of rejected)assert.ok(retried.includes(range),range+' retried on the renewed link');
 assert.deepEqual(fs.readFileSync(path.join(dir,voice.uuid+'.aivmx')),bytes);
});

test('a second storage rejection ends the job without requesting another new link',async t=>{
 let grants=0;
 const {dir,pack}=setup(t,async(url,opts)=>{
  if(url===meta)return manifest();
  if(url===grant){
   if(++grants>2)return new Response(null,{status:429});
   return readModel(opts,source+'-'+grants);
  }
  return new Response('',{status:403});
 });
 await assert.rejects(pack.download(voice),/HTTP 403/);
 assert.equal(grants,2);
 assert.deepEqual(fs.readdirSync(dir),[]);
});

test('voice download reports a grant rate limit without leaving a model or temporary file',async t=>{
 const {dir,pack}=setup(t,async url=>{
  if(url===meta)return manifest();
  assert.equal(url,grant);
  return new Response(null,{status:429});
 });
 await assert.rejects(pack.download(voice),/HTTP 429/);
 assert.deepEqual(fs.readdirSync(dir),[]);
});
