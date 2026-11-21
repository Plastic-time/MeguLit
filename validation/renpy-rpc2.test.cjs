// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Synthetic framing with real zlib streams, not compiler-produced RPYC or AST evidence.
const test=require('node:test'),assert=require('node:assert/strict'),zlib=require('node:zlib'),crypto=require('node:crypto');
const {readSlot,PROFILES,LIMITS}=require('../services/original-engines/renpy-rpc2.cjs');
const profile='renpy-6.99.12.4.2187',before=Buffer.from('synthetic pre-transform'),after=Buffer.from('synthetic post-transform');
function frame(parts=[before,after],{packed=false,trailer=16}={}){
 const header=Buffer.alloc(46);header.write('RENPY RPC2');const bodies=[];let offset=46;
 parts.forEach((part,index)=>{const b=packed?part:zlib.deflateSync(part);header.writeUInt32LE(index+1,10+12*index);header.writeUInt32LE(offset,14+12*index);header.writeUInt32LE(b.length,18+12*index);bodies.push(b);offset+=b.length;});
 return Buffer.concat([header,...bodies,Buffer.alloc(trailer,0x37)]);
}
const read=(buffer=frame(),options={})=>readSlot({buffer,profile,...options});
const rejects=(fn,code)=>assert.throws(fn,e=>e.code==='RENPY_RPC2_'+code&&e.message===e.code);

test('declared writer profiles preserve independent slots and exact provenance',()=>{
 for(const name of Object.keys(PROFILES)){
  const buffer=frame(),first=read(buffer,{profile:name,slot:1,source:'explicit-buffer'}),second=read(buffer,{profile:name});
  assert.deepEqual(first.buffer,before);assert.deepEqual(second.buffer,after);assert.equal(second.slot,2);assert.equal(second.profile,name);assert.equal(first.source,'explicit-buffer');
  assert.equal(second.writerCommit,PROFILES[name].commit);assert.equal(second.inputSha256,crypto.createHash('sha256').update(buffer).digest('hex'));
  assert.deepEqual(second.slots.map(s=>[s.slot,s.expandedBytes]),[[1,before.length],[2,after.length]]);assert.equal(second.accounting.totalExpandedBytes,before.length+after.length);
  assert.equal(second.sourceDigest.bytes,16);assert.equal(second.sourceDigest.hex,'37'.repeat(16));assert.equal(second.sourceDigest.verified,false);
 }
});
test('explicit slot 1 is permitted, while absent slot 2 is unsupported without fallback',()=>{
 const buffer=frame([before]);rejects(()=>read(buffer),'UNSUPPORTED_SLOT2');assert.deepEqual(read(buffer,{slot:1}).buffer,before);
});
test('8.4 is an explicit framing declaration, with no runtime-version inference',()=>{
 const name='renpy-8.4.0.25071206',buffer=frame();
 assert.equal(PROFILES[name].commit,'8881389241074a3095dfe7b91c8b6bb0df018f02');
 const out=read(buffer,{profile:name});
 assert.equal(out.profile,name);assert.deepEqual(out.buffer,after);
 assert.equal(out.sourceDigest.kind,'source-and-rpyc-magic-md5');
 assert.equal(out.sourceDigest.verified,false);
 for(const guessed of ['8.4.0.25071206','renpy-8.4','runtime-8.4.0.25071206'])rejects(()=>read(buffer,{profile:guessed}),'PROFILE');
 const missing=frame([before]);rejects(()=>read(missing,{profile:name}),'UNSUPPORTED_SLOT2');
});
test('digest bytes are external metadata, not a payload or source authenticity assertion',()=>{
 const a=frame(),b=Buffer.from(a);b.fill(0,b.length-16);assert.deepEqual(read(a).buffer,read(b).buffer);assert.notEqual(read(a).sourceDigest.hex,read(b).sourceDigest.hex);assert.equal(read(b).sourceDigest.verified,false);
 rejects(()=>read(frame([before,after],{trailer:15})),'TRUNCATED_SLOT');rejects(()=>read(frame([before,after],{trailer:17})),'TRAILER_SIZE');
});
test('no legacy zlib, pickle, archive or unknown-profile fallback',()=>{
 rejects(()=>read(zlib.deflateSync(before)),'MAGIC');rejects(()=>read(Buffer.from('not a container')),'MAGIC');
 rejects(()=>read(frame(),{profile:'automatic'}),'PROFILE');rejects(()=>read(frame(),{profile:'__proto__'}),'PROFILE');
 rejects(()=>read(frame(),{slot:0}),'SLOT');rejects(()=>readSlot({profile,buffer:'a path'}),'BUFFER_REQUIRED');rejects(()=>read(frame(),{source:'a\0b'}),'SOURCE');
 rejects(()=>readSlot(null),'ARGUMENT');rejects(()=>readSlot([]),'ARGUMENT');rejects(()=>readSlot('path'),'ARGUMENT');
});
test('complete fixed directory and an all-zero terminator are required',()=>{
 rejects(()=>read(frame().subarray(0,45)),'TRUNCATED_DIRECTORY');
 const bad=frame();bad.writeUInt32LE(1,38);rejects(()=>read(bad),'TERMINATOR');
 const late=frame([before]);late.writeUInt32LE(2,34);rejects(()=>read(late),'AFTER_TERMINATOR');
 const empty=Buffer.alloc(62);empty.write('RENPY RPC2');rejects(()=>read(empty),'EMPTY_DIRECTORY');
});
test('duplicate, unknown and misplaced slot declarations are rejected',()=>{
 const duplicate=frame();duplicate.writeUInt32LE(1,22);rejects(()=>read(duplicate),'DUPLICATE_SLOT');
 const unknown=frame();unknown.writeUInt32LE(9,22);rejects(()=>read(unknown),'UNKNOWN_SLOT');
 const misplaced=frame();misplaced.writeUInt32LE(2,10);rejects(()=>read(misplaced),'SLOT_POSITION');
 const zero=frame();zero.writeUInt32LE(0,18);rejects(()=>read(zero),'EMPTY_PACKED_SLOT');
});
test('ranges must start after the entire directory and remain inside payload bytes',()=>{
 const inDirectory=frame();inDirectory.writeUInt32LE(34,14);rejects(()=>read(inDirectory),'SLOT_IN_DIRECTORY');
 const truncated=frame();truncated.writeUInt32LE(truncated.length,18);rejects(()=>read(truncated),'TRUNCATED_SLOT');
 const extreme=frame();extreme.writeUInt32LE(0xffffffff,14);rejects(()=>read(extreme),'TRUNCATED_SLOT');
 const hugeLength=frame();hugeLength.writeUInt32LE(0xffffffff,18);rejects(()=>read(hugeLength),'BUDGET_SLOT_PACKED_BYTES');
});
test('overlap, internal gaps and unreferenced bytes outside the digest fail closed',()=>{
 const overlap=frame();overlap.writeUInt32LE(overlap.readUInt32LE(14)+1,26);rejects(()=>read(overlap),'SLOT_OVERLAP');
 const gap=frame();gap.writeUInt32LE(gap.readUInt32LE(26)+1,26);gap.writeUInt32LE(gap.readUInt32LE(30)-1,30);rejects(()=>read(gap),'PAYLOAD_GAP');
 const extra=Buffer.concat([frame(),Buffer.from('extra')]);rejects(()=>read(extra),'TRAILER_SIZE');
});
test('real zlib streams reject truncation, invalid bytes, trailing junk and concatenated streams',()=>{
 const packed=zlib.deflateSync(after),one=zlib.deflateSync(before);
 rejects(()=>read(frame([one,packed.subarray(0,packed.length-1)],{packed:true})),'ZLIB');
 rejects(()=>read(frame([one,Buffer.from('invalid')],{packed:true})),'ZLIB');
 rejects(()=>read(frame([one,Buffer.concat([packed,Buffer.from('junk')])],{packed:true})),'COMPRESSED_TRAILING_DATA');
 rejects(()=>read(frame([one,Buffer.concat([packed,zlib.deflateSync(Buffer.from('second stream'))])],{packed:true})),'COMPRESSED_TRAILING_DATA');
});
test('every slot is validated, including the unselected slot',()=>{
 const packed=zlib.deflateSync(after);rejects(()=>read(frame([Buffer.from('invalid'),packed],{packed:true})),'ZLIB');
 const badSecond=frame([zlib.deflateSync(before),Buffer.concat([packed,Buffer.from('x')])],{packed:true});rejects(()=>read(badSecond,{slot:1}),'COMPRESSED_TRAILING_DATA');
});
test('per-slot and aggregate expansion limits reject compressed growth before success',()=>{
 const buffer=frame([Buffer.alloc(32768,65),Buffer.alloc(32768,66)]);
 rejects(()=>read(buffer,{limits:{slotExpandedBytes:1024}}),'BUDGET_SLOT_EXPANDED_BYTES');
 rejects(()=>read(buffer,{limits:{totalExpandedBytes:49152}}),'BUDGET_TOTAL_EXPANDED_BYTES');
 assert.equal(read(buffer,{limits:{slotExpandedBytes:32768,totalExpandedBytes:65536}}).accounting.totalExpandedBytes,65536);
 rejects(()=>read(frame([before,after]),{limits:{totalExpandedBytes:before.length}}),'BUDGET_TOTAL_EXPANDED_BYTES');
});
test('empty zlib payloads remain separate buffers without implying AST support',()=>{
 const buffer=frame([Buffer.alloc(0),Buffer.alloc(0)]),out=read(buffer);assert.equal(out.buffer.length,0);assert.equal(out.accounting.totalExpandedBytes,0);
 assert.deepEqual(out.slots.map(s=>s.expandedBytes),[0,0]);
 rejects(()=>read(frame([before,Buffer.alloc(0)]),{limits:{totalExpandedBytes:before.length}}),'BUDGET_TOTAL_EXPANDED_BYTES');
});
test('input, directory and packed budgets are enforced and cannot be raised',()=>{
 const buffer=frame();rejects(()=>read(buffer,{limits:{inputBytes:buffer.length-1}}),'BUDGET_INPUT_BYTES');
 rejects(()=>read(buffer,{limits:{directoryBytes:35}}),'BUDGET_DIRECTORY_BYTES');rejects(()=>read(buffer,{limits:{slotPackedBytes:1}}),'BUDGET_SLOT_PACKED_BYTES');
 for(const [key,value]of Object.entries(LIMITS))rejects(()=>read(buffer,{limits:{[key]:value+1}}),'LIMITS');
 rejects(()=>read(buffer,{limits:{inputBytes:1.5}}),'LIMITS');rejects(()=>read(buffer,{limits:{other:1}}),'LIMITS');
});
