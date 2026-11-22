// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto');
const {Reader}=require('../services/reader.cjs'),{VoicePack,VOICES}=require('../core/voice-pack.cjs');

test('voice settings join the same transfer and resume persisted ranges after a disconnect and a Hub cooldown',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'voice-recovery-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const bytes=Buffer.from('complete checked voice model'),split=9,uuid=VOICES[0].uuid;
 const checksum=createHash('sha256').update(bytes).digest('hex');
 let interrupted=false,restarted=false,rateLimited=true,metadataRequests=0;
 const ranges=[];
 const fetch=async(url,opts)=>{
  if(!url.includes('/download?')){
   metadataRequests++;
   if(rateLimited){rateLimited=false;return new Response(null,{status:429,headers:{'retry-after':'0'}});}
   return Response.json({model_files:[{model_type:'AIVMX',file_size:bytes.length,license_type:'CC0',checksum}]});
  }
  const range=opts.headers.Range;ranges.push(range);
  if(interrupted&&!restarted)return new Response(null,{status:429,headers:{'retry-after':'120'}});
  const [,start,end]=/^bytes=(\d+)-(\d*)$/.exec(range);
  let body=bytes.subarray(+start,end?Number(end)+1:undefined);
  if(!restarted&&end){
   body=new ReadableStream({pull(c){
    if(interrupted)c.error(Error('connection reset'));
    else{interrupted=true;c.enqueue(bytes.subarray(0,split));}
   }});
  }
  return new Response(body,{status:206,headers:{'content-range':'bytes '+start+'-'+(bytes.length-1)+'/'+bytes.length}});
 };
 for(const v of VOICES.slice(1))fs.writeFileSync(path.join(dir,v.uuid+'.aivmx'),'other model');
 const reader=()=>Object.assign(Object.create(Reader.prototype),{
  active:()=>true,voicePack:new VoicePack({dir,fetch}),runtime:{config:()=>({}),services:()=>({stopSpeech:async()=>{},ensureSpeech:async()=>{},rememberSpeakers(){}}),speech:()=>({speakers:async()=>[]})}
 });
 const send=async(r,action,args={uuid})=>{
  const {replies}=await r.message({type:'v4',id:1,action,args});
  assert.equal(replies[0].args[2],'');return replies[0].args[1];
 };
 const first=reader();
 await send(first,'voicePackInstall',{});
 await send(first,'voicePackInstall');
 await first.voicePack.job;
 assert.equal(metadataRequests,2,'one metadata retry shared by both install buttons');
 assert.match((await send(first,'voicePackStatus')).error,/HTTP 429/);
 const target=path.join(dir,uuid+'.aivmx');
 assert.equal(fs.existsSync(target),false);
 assert.deepEqual(JSON.parse(fs.readFileSync(target+'.tome-download.part.json')).done,[[0,split]]);
 restarted=true;ranges.length=0;
 const second=reader();await send(second,'voicePackInstall');await second.voicePack.jobs.get(uuid).completion;
 const state=await send(second,'voicePackStatus');
 assert.equal(state.voices[0].installed,true);assert.equal(state.voices[0].error,'');
 assert.deepEqual(ranges,['bytes='+split+'-','bytes='+split+'-'+(bytes.length-1)]);
 assert.deepEqual(fs.readFileSync(target),bytes);
 assert.equal(fs.readdirSync(dir).some(f=>f.includes('.tome-download')),false);
});
