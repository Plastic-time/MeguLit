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
/* #104 AIR (2000) and its Chinese build: the ini (renamed after the exe) points at DAT\SEEN.TXT, and the build's text is GBK. */
test('AVG32: SEEN.TXT found through #DIRC.TXT in any ini; GBK text and ＊Ａ names read',()=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-avg32-'));
 const enc={'【':[0xa1,0xbe],'】':[0xa1,0xbf],'「':[0xa1,0xb8],'」':[0xa1,0xb9],'观':[0xb9,0xdb],'铃':[0xc1,0xe5],'你':[0xc4,0xe3],'好':[0xba,0xc3],'＊':[0xa3,0xaa],'Ａ':[0xa3,0xc1]};
 const g=s=>Buffer.from([...s].flatMap(c=>enc[c]));
 fs.writeFileSync(path.join(dir,'air_cn.ini'),Buffer.concat([Buffer.from('#DIRC.TXT="DAT" =P:"SEEN.TXT"\r\n#NAME.A="','latin1'),g('观铃'),Buffer.from('"\r\n','latin1')]));
 const scene=Buffer.concat([Buffer.from([1,2,3]),g('【＊Ａ】「你好」'),Buffer.from([0,5])]);
 const head=Buffer.alloc(64);head.write('PACL',0,'latin1');head.writeUInt32LE(1,16);head.write('SEEN002.TXT',32,'latin1');head.writeUInt32LE(64,48);head.writeUInt32LE(scene.length,52);head.writeUInt32LE(scene.length,56);
 fs.mkdirSync(path.join(dir,'DAT'));fs.writeFileSync(path.join(dir,'DAT','SEEN.TXT'),Buffer.concat([head,scene]));
 const sc=avg32.scenes(dir);assert.equal(sc.length,1);assert.deepEqual(avg32.parse(sc[0].read()).lines,['【观铃】「你好」']);fs.rmSync(dir,{recursive:true,force:true});});
