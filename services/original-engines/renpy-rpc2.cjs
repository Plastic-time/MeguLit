// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Framing only. A selected slot is not proof of a supported pickle or canonical AST.
const zlib=require('node:zlib'),crypto=require('node:crypto');
const PROFILES=Object.freeze({
 'renpy-6.99.12.4.2187':Object.freeze({commit:'e60f170f7f5c152b4f656b5fe94ccc7ed4b2c3d2',digestKind:'source-md5'}),
 'renpy-8.5.3.26051504':Object.freeze({commit:'39895c1e017f0b36ffea2447d97eccd69d76ee1c',digestKind:'source-and-rpyc-magic-md5'}),
});
const LIMITS=Object.freeze({inputBytes:4*1024*1024,directoryBytes:36,slotPackedBytes:2*1024*1024,slotExpandedBytes:4*1024*1024,totalExpandedBytes:8*1024*1024});
const HEADER=10,DIRECTORY=36,PAYLOAD=HEADER+DIRECTORY,DIGEST=16;
function fail(code,cause){const e=Error('RENPY_RPC2_'+code,cause?{cause}:undefined);e.code=e.message;throw e;}
function limitsOf(input={}){if(!input||typeof input!=='object'||Array.isArray(input))fail('LIMITS');const out={...LIMITS};for(const [key,value]of Object.entries(input)){if(!Object.hasOwn(LIMITS,key)||!Number.isSafeInteger(value)||value<1||value>LIMITS[key])fail('LIMITS');out[key]=value;}return out;}
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function readSlot(options={}){
 if(!options||typeof options!=='object'||Array.isArray(options))fail('ARGUMENT');
 const {buffer,profile,slot=2,source='<buffer>',limits:inputLimits}=options;
 if(typeof profile!=='string'||!Object.hasOwn(PROFILES,profile))fail('PROFILE');if(slot!==1&&slot!==2)fail('SLOT');
 if(typeof source!=='string'||!source||source.length>512||/[\0\r\n]/.test(source))fail('SOURCE');
 const limits=limitsOf(inputLimits);if(!Buffer.isBuffer(buffer))fail('BUFFER_REQUIRED');if(buffer.length>limits.inputBytes)fail('BUDGET_INPUT_BYTES');
 if(buffer.length<HEADER||buffer.toString('latin1',0,HEADER)!=='RENPY RPC2')fail('MAGIC');
 if(DIRECTORY>limits.directoryBytes)fail('BUDGET_DIRECTORY_BYTES');if(buffer.length<PAYLOAD)fail('TRUNCATED_DIRECTORY');
 const entries=[],ids=new Set();let terminated=false;
 for(let index=0;index<3;index++){
  const at=HEADER+12*index,id=buffer.readUInt32LE(at),start=buffer.readUInt32LE(at+4),length=buffer.readUInt32LE(at+8);
  if(terminated){if(id||start||length)fail('AFTER_TERMINATOR');continue;}
  if(!id){if(start||length)fail('TERMINATOR');terminated=true;continue;}
  if(id!==1&&id!==2)fail('UNKNOWN_SLOT');if(ids.has(id))fail('DUPLICATE_SLOT');ids.add(id);
  if(id!==index+1)fail('SLOT_POSITION');if(!length)fail('EMPTY_PACKED_SLOT');if(length>limits.slotPackedBytes)fail('BUDGET_SLOT_PACKED_BYTES');
  if(start<PAYLOAD)fail('SLOT_IN_DIRECTORY');const end=start+length;
  if(end>buffer.length-DIGEST)fail('TRUNCATED_SLOT');entries.push({slot:id,start,length,end});
 }
 if(!terminated)fail('MISSING_TERMINATOR');if(!entries.length)fail('EMPTY_DIRECTORY');
 let end=PAYLOAD;for(const entry of entries){if(entry.start<end)fail('SLOT_OVERLAP');if(entry.start>end)fail('PAYLOAD_GAP');end=entry.end;}
 if(buffer.length-end!==DIGEST)fail('TRAILER_SIZE');if(!ids.has(slot))fail(slot===2?'UNSUPPORTED_SLOT2':'UNSUPPORTED_SLOT1');
 let selected,total=0;const slots=[];
 for(const entry of entries){
  const remaining=limits.totalExpandedBytes-total;if(remaining<=0)fail('BUDGET_TOTAL_EXPANDED_BYTES');
  const cap=Math.min(limits.slotExpandedBytes,remaining),packed=buffer.subarray(entry.start,entry.end);let result;
  try{result=zlib.inflateSync(packed,{maxOutputLength:cap,info:true,chunkSize:16384});}
  catch(error){if(error.code==='ERR_BUFFER_TOO_LARGE')fail(remaining<limits.slotExpandedBytes?'BUDGET_TOTAL_EXPANDED_BYTES':'BUDGET_SLOT_EXPANDED_BYTES',error);fail('ZLIB',error);}
  if(result.engine.bytesWritten!==packed.length)fail('COMPRESSED_TRAILING_DATA');
  total+=result.buffer.length;if(total>limits.totalExpandedBytes)fail('BUDGET_TOTAL_EXPANDED_BYTES');
  slots.push({slot:entry.slot,offset:entry.start,packedBytes:entry.length,expandedBytes:result.buffer.length,packedSha256:sha(packed),expandedSha256:sha(result.buffer)});
  if(entry.slot===slot)selected=result.buffer;
 }
 return {buffer:selected,slot,profile,source,writerCommit:PROFILES[profile].commit,inputSha256:sha(buffer),slots,
  accounting:{inputBytes:buffer.length,directoryBytes:DIRECTORY,totalExpandedBytes:total},
  sourceDigest:{kind:PROFILES[profile].digestKind,offset:end,bytes:DIGEST,hex:buffer.subarray(end).toString('hex'),verified:false}};
}
module.exports={PROFILES,LIMITS,readSlot};
