// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {inspect}=require('../tools/engine-sigs/mages-sample.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function pe(machine=0x14c,magic=0x10b){const b=Buffer.alloc(512);b.write('MZ');b.writeUInt32LE(64,0x3c);b.write('PE\0\0',64);b.writeUInt16LE(machine,68);b.writeUInt16LE(224,84);b.writeUInt16LE(magic,88);return b;}

test('exact SHA plus x86 PE is required for the existing draw signature evidence',()=>{
 const b=pe(),r=inspect(b,sha(b));assert.equal(r.status,'matched');assert.equal(r.architecture,'x86');assert.equal(r.bytes,b.length);
 const changed=Buffer.from(b);changed[511]=1;
 assert.equal(inspect(changed,sha(b)).status,'different-build','changed image is never reported as passing the old version');
});

test('MAGES64 is a separate unsupported draw target even when its SHA matches',()=>{
 const b=pe(0x8664,0x20b),r=inspect(b,sha(b));assert.equal(r.status,'unsupported-architecture');assert.equal(r.architecture,'x64');
 for(const [machine,magic] of [[0x14c,0x20b],[0x8664,0x10b],[0xaa64,0x20b]]){const b=pe(machine,magic);assert.equal(inspect(b,sha(b)).status,'unsupported-architecture');}
});

test('truncated and inconsistent headers cannot admit a sample',()=>{
 const valid=pe();
 for(const n of [0,1,63,64,89,200]){const b=valid.subarray(0,n);assert.equal(inspect(b,sha(b)).status,'invalid-pe','bytes='+n);}
 for(const off of [0,63,490,0xffffffff]){const b=pe();b.writeUInt32LE(off,0x3c);assert.equal(inspect(b,sha(b)).status,'invalid-pe','PE offset='+off);}
 for(const size of [0,1,0xffff]){const b=pe();b.writeUInt16LE(size,84);assert.equal(inspect(b,sha(b)).status,'invalid-pe');}
 for(const at of [0,64]){const b=pe();b[at]=0;assert.equal(inspect(b,sha(b)).status,'invalid-pe');}
});

test('a caller cannot omit the fixed expected identity',()=>{
 const b=pe();for(const expected of [undefined,'','0'.repeat(63),'G'.repeat(64)])assert.throws(()=>inspect(b,expected),/expected SHA-256/);
 assert.throws(()=>inspect({},'0'.repeat(64)),/Buffer/);
});
