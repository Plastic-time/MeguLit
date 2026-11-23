// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const d=require('../services/desensitize.cjs');
test('an archive whose window fails verify keeps the blocks that pass and the region its header points to',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'blk-')),file=path.join(dir,'big.arc'),size=20<<20,mid=12<<20;
 const fd=fs.openSync(file,'w');const head=Buffer.alloc(64*1024);head.write('ARCX');head.writeUInt32LE(mid,8);fs.writeSync(fd,head,0,head.length,0);
 const bad=Buffer.alloc(64*1024,0x42);bad.write('POISON',0);fs.writeSync(fd,bad,0,bad.length,64*1024);
 const idx=Buffer.alloc(4096);idx.write('scenario/s01.txt',0);fs.writeSync(fd,idx,0,idx.length,mid);fs.writeSync(fd,Buffer.alloc(1),0,1,size-1);fs.closeSync(fd);
 const real=d.sample;d.sample=(buf,o)=>Buffer.from(buf).includes('POISON')?null:real(buf,o);
 try{delete require.cache[require.resolve('../services/adapter-sample.cjs')];const s=require('../services/adapter-sample.cjs').archiveSample(file,dir,{raw:0,start:Date.now()});
  assert.ok(!s.dropped,'not dropped');assert.ok(s.droppedBlocks>=1);
  const at=s.sample.parts.map(p=>p.at);assert.ok(at.includes(0));assert.ok(!at.includes(64*1024));assert.ok(at.includes(mid),'pointer region sampled: '+at.slice(-4));
  const p=s.sample.parts.find(x=>x.at===mid);assert.strictEqual(d.partBytes(p).length,64*1024);}
 finally{d.sample=real;fs.rmSync(dir,{recursive:true,force:true});}});
