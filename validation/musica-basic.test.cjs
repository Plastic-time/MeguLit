// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const M=require('../tools/engine-sigs/musica-basic.cjs'),P=M.PIN;
function image(base=0x400000){const b=Buffer.alloc(P.imageBytes);b.set(Buffer.from(P.executeHex,'hex'),P.executeRva);b.set(Buffer.from(P.parseHex,'hex'),P.parseRva);
 b.set([0xc7,6],P.constructorStoreRva);b.writeUInt32LE(base+P.vtableRva,P.constructorStoreRva+2);b.writeUInt32LE(base+P.parseRva,P.vtableRva+4);b.writeUInt32LE(base+P.executeRva,P.vtableRva+8);b.write('.message\0',P.commandRva);return b;}
test('exact mapped execute/parse/constructor/vtable/command pins agree and relocate',()=>{
 for(const base of [0x400000,0x17000000])assert.equal(M.mappedMatches(image(base),base),true);
 assert.equal(M.mappedMatches(image(),0x500000),false);
 const b=image();for(const [rva,bytes] of [[P.executeRva,P.executeHex.length/2],[P.parseRva,P.parseHex.length/2],[P.constructorStoreRva,6],[P.vtableRva+4,8],[P.commandRva,9]]){
  for(let i=0;i<bytes;i++){b[rva+i]^=1;assert.equal(M.mappedMatches(b,0x400000),false,`${rva}+${i}`);b[rva+i]^=1;}
 }
});
test('wrong shapes, truncated image and integer wrap fail closed without changing bytes',()=>{
 const b=image(),before=Buffer.from(b);for(const base of [-1,0.5,NaN,Infinity,0xffffffff-P.imageBytes+1,'4194304'])assert.equal(M.mappedMatches(b,base),false);
 assert.equal(M.mappedMatches(b.subarray(0,b.length-1),0x400000),false);assert.equal(M.mappedMatches({},0x400000),false);assert.deepEqual(b,before);
});
test('complete exe + script hashes are mandatory; no raw mapped fixture can authorize another game',()=>{
 assert.deepEqual(M.inspect(null,null),{matched:false,reason:'MUSICA_INPUT'});
 assert.equal(M.inspect(Buffer.alloc(1),Buffer.alloc(1)).reason,'MUSICA_SIZE');
 assert.equal(M.inspect(Buffer.alloc(P.fileBytes),Buffer.alloc(P.scriptBytes)).reason,'MUSICA_EXE_HASH');
});
test('native pins and private registration agree with independent scanner',()=>{
 const root=path.resolve(__dirname,'..'),header=fs.readFileSync(path.join(root,'native/megulithook/MusicaBasicSig.h'),'utf8');
 for(const value of [P.exeSha256,P.scriptSha256,P.executeHex,P.parseHex])assert.ok(header.includes(value));
 const source=fs.readFileSync(path.join(root,'native/megulithook/MusicaBasic.h'),'utf8');
 for(const flag of ['MEGULIT_OWNER_TESTS','MEGULIT_SIDE_BY_SIDE','MEGULIT_MUSICA_BASIC','MEGULIT_MUSICA_EXE'])assert.ok(source.includes(flag));
 assert.match(source,/NewHook\(hp,"MusicaBasic"\)/);assert.doesNotMatch(source,/EMBED_ABLE|WriteProcessMemory|MH_CreateHook/);
 const registry=fs.readFileSync(path.join(root,'native/megulithook/enginecollection32.cpp'),'utf8');assert.match(registry,/new MusicaBasic/);
 for(const file of ['build-x86.cmd','build-x64.cmd'])assert.ok(fs.readFileSync(path.join(root,'native/megulithook',file),'utf8').includes('MusicaBasic.h MusicaBasicSig.h'));
});
