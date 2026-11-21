// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {decode,LIMITS}=require('../services/original-engines/renpy-pickle-bounded.cjs');
const b=(...values)=>Buffer.from(values),u32=n=>{const out=Buffer.alloc(4);out.writeUInt32LE(n);return out;};
const string=text=>{const bytes=Buffer.from(text);return Buffer.concat([b(0x58),u32(bytes.length),bytes]);};
const stream=(...parts)=>Buffer.concat([b(0x80,2),...parts,b(0x2e)]);
const read=(...parts)=>decode(stream(...parts));
const reject=(buf,code,options)=>assert.throws(()=>decode(buf,options),error=>error.code==='RENPY_PICKLE_'+code&&Number.isSafeInteger(error.offset));
const global=()=>Buffer.from('crenpy.ast\nSay\n','ascii');
const instance=()=>Buffer.concat([global(),b(0x29,0x81)]);
test('ordinary CPython serializer fixtures retain slot-state graphs under protocols 2, 4 and 5',()=>{
 const fixture=require('./fixtures/renpy-bounded-cpython.json');
 for(const input of fixture.fixtures){
  const buffer=Buffer.from(input.base64,'base64'),parsed=decode(buffer);
  assert.equal(buffer.length,input.bytes);assert.equal(parsed.protocol,input.protocol);
  assert.equal(parsed.value.items[0].entries.get('version'),1);
  const translation=parsed.value.items[1].items[0],say=translation.state.get('block').items[0];
  assert.equal(translation.className,'renpy.ast.Translate');assert.equal(translation.state.get('identifier'),'intro_abcdef');assert.equal(translation.state.get('language'),null);
  assert.equal(say.className,'renpy.ast.Say');assert.equal(say.state.get('who'),null);assert.equal(say.state.get('what'),'Synthetic oracle text');
 }
});
test('bounded data subset preserves ordered tuples, lists, dictionaries and byte strings',()=>{
 const value=read(b(0x28,0x4e,0x88,0x89,0x4b,7,0x4d,0,1),string('試験'),b(0x55,2,0xff,0),b(0x74)).value;
 assert.equal(value.kind,'tuple');assert.deepEqual(value.items.slice(0,6),[null,true,false,7,256,'試験']);assert.deepEqual(value.items[6],b(0xff,0));
 const list=read(b(0x5d,0x28,0x4b,1,0x4b,2,0x65)).value;assert.deepEqual(list,{kind:'list',items:[1,2]});
 const dict=read(b(0x7d),string('key'),b(0x4b,3,0x73)).value;assert.equal(dict.entries.get('key'),3);
});
test('NEWOBJ and BUILD retain class identity apart from writable dictionary and slot state',()=>{
 const state=Buffer.concat([b(0x4e,0x7d),string('__class'),string('untrusted text'),b(0x73),string('what'),string('例'),b(0x73,0x86)]);
 const value=read(instance(),state,b(0x62)).value;
 assert.equal(value.className,'renpy.ast.Say');assert.equal(value.state.get('__class'),'untrusted text');assert.equal(value.state.get('what'),'例');
 assert.equal(Object.getPrototypeOf(value),Object.prototype);
 reject(stream(instance(),b(0x7d,0x62,0x7d,0x62)),'STATE');
});
test('global identities remain inert and only the explicit AST allowlist is accepted',()=>{
 assert.deepEqual(read(global()).value,{kind:'global',name:'renpy.ast.Say'});
 reject(stream(Buffer.from('cos\nsystem\n')),'GLOBAL');
 reject(stream(Buffer.from('crenpy\nast.Say\n')),'GLOBAL');
 const qualified=Buffer.concat([b(0x80,4),string('renpy'),string('ast.Say'),b(0x93,0x2e)]);reject(qualified,'GLOBAL');
 reject(stream(global(),b(0x29,0x52)),'UNSUPPORTED_OPCODE');
 reject(stream(global(),b(0x4e,0x81)),'NEWOBJ');
 reject(stream(Buffer.from('crenpy.ast\nLabel\n')),'GLOBAL');
 const value=decode(stream(Buffer.from('crenpy.ast\nLabel\n')),{classes:['renpy.ast.Label']}).value;assert.equal(value.name,'renpy.ast.Label');
});
test('protocol 4 frames and stack globals are parsed with exact boundaries',()=>{
 const payload=Buffer.concat([string('renpy.ast'),string('Say'),b(0x93,0x29,0x81,0x7d,0x62,0x2e)]),size=Buffer.alloc(8);size.writeBigUInt64LE(BigInt(payload.length));
 const framed=Buffer.concat([b(0x80,4,0x95),size,payload]);const result=decode(framed);assert.equal(result.protocol,4);assert.equal(result.value.className,'renpy.ast.Say');assert.equal(result.bytesRead,framed.length);
 const short=Buffer.from(framed);short.writeBigUInt64LE(4n,3);reject(short,'TRUNCATED');
 const long=Buffer.from(framed);long.writeBigUInt64LE(BigInt(payload.length+1),3);reject(long,'TRUNCATED');
 const wrong=Buffer.from(framed);wrong[1]=2;reject(wrong,'PROTOCOL_OPCODE');
});
test('memo aliases and cycles remain inert bounded graph data without recursive traversal',()=>{
 const result=read(b(0x5d,0x71,0,0x68,0,0x61));assert.equal(result.value.items[0],result.value);assert.equal(result.counts.edges,1);
 reject(stream(b(0x68,1)),'MEMO');reject(stream(b(0x4e,0x71,0,0x71,0)),'DUPLICATE_MEMO');
 reject(stream(b(0x4e,0x72),u32(50000)),'BUDGET_MEMO');
});
test('missing GLOBAL newline returns a fixed error synchronously',()=>{
 reject(b(0x80,2,0x63),'LINE');reject(b(0x80,2,0x63,0x61,10),'LINE');
 reject(stream(Buffer.from('crenpy.ast\nSay\x00\n')),'GLOBAL');
});
test('truncated operands, undefined stack and MARK operations reject before incidental JS errors',()=>{
 for(const code of [0x4b,0x4d,0x4a,0x47,0x58,0x8a,0x54,0x71,0x72,0x6a])reject(b(0x80,2,code),'TRUNCATED');
 for(const code of [0x30,0x32,0x85,0x61,0x81,0x62])reject(stream(b(code)),'STACK');
 reject(stream(b(0x74)),'MARK');reject(stream(b(0x28,0x32)),'STACK');reject(stream(b(0x28,0x4e)),'TRAILING');
 reject(b(0x80,2,0x4e),'NO_STOP');reject(b(0x80,2,0x4e,0x2e,0),'TRAILING');
});
test('dict and instance state never overwrite duplicate keys or writable class metadata',()=>{
 reject(stream(b(0x7d),string('a'),b(0x4e,0x73),string('a'),b(0x4e,0x73)),'DUPLICATE_KEY');
 reject(stream(b(0x7d,0x4e,0x4e,0x73)),'DICT');
 reject(stream(instance(),b(0x4b,3,0x62)),'STATE');
 reject(stream(instance(),b(0x7d,0x4b,1,0x4e,0x73,0x62)),'STATE_KEY');
});
test('string encodings and protocol-specific opcodes fail closed',()=>{
 assert.equal(read(string('\ufeffliteral')).value,'\ufeffliteral');
 reject(stream(b(0x58,1,0,0,0,0xff)),'UTF8');
 reject(stream(b(0x8c,0)),'PROTOCOL_OPCODE');reject(stream(b(0x43,0)),'PROTOCOL_OPCODE');
 reject(b(0x80,1,0x4e,0x2e),'PROTOCOL');reject(stream(b(0x82,1)),'UNSUPPORTED_OPCODE');
 const huge=Buffer.alloc(8,255);reject(Buffer.concat([b(0x80,4,0x8d),huge,b(0x2e)]),'LENGTH');
});
test('all work and allocation budgets can be lowered but never raised',()=>{
 for(const options of [null,3,'invalid',[]])reject(stream(b(0x4e)),'OPTIONS',options);
 reject(stream(b(0x4e,0x30,0x4e)),'BUDGET_OPERATIONS',{limits:{operations:2}});
 reject(stream(b(0x28,0x4e,0x4e,0x74)),'BUDGET_STACK',{limits:{stack:2}});
 reject(stream(b(0x4e,0x30,0x4e)),'BUDGET_NODES',{limits:{nodes:1}});
 reject(stream(b(0x28,0x4e,0x4e,0x74)),'BUDGET_EDGES',{limits:{edges:1}});
 reject(stream(string('abcd')),'BUDGET_ITEMBYTES',{limits:{itemBytes:3}});
 reject(stream(b(0x28),string('ab'),string('cd'),b(0x74)),'BUDGET_STRINGBYTES',{limits:{stringBytes:3}});
 reject(stream(b(0x4e,0x71,1)),'BUDGET_MEMO',{limits:{memo:1}});
 reject(stream(b(0x4e)),'INPUT',{limits:{inputBytes:3}});
 for(const limits of [{unknown:1},{operations:0},{stack:LIMITS.stack+1},{memo:1.5},null])reject(stream(b(0x4e)),'LIMITS',{limits});
});
