// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert'),avg32=require('../services/original-engines/avg32.cjs');
test('AVG32 LZ: MSB-first flags, length (w&15)+2, distance (w>>4)+1',()=>{
 // literals "AB", then a reference copying 4 bytes from distance 2 -> "ABABAB"
 const w=((2-1)<<4)|(4-2),src=Buffer.from([0xc0,0x41,0x42,w&255,w>>8]);
 assert.equal(avg32._internal.lz(src,0,6).toString('latin1'),'ABABAB');});
test('Shift-JIS text runs become lines',()=>{
 const sj=Buffer.from([0x81,0x79,0x8a,0x9e,0x81,0x7a,0x81,0x75,0x82,0xa0,0x81,0x76]);
 assert.deepEqual(avg32.parse(Buffer.concat([Buffer.from([1,2,3]),sj,Buffer.from([0,5])])).lines,['【萱】「あ」']);});
