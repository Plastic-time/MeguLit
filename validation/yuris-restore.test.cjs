'use strict';
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const jr=require('../core/japanese-restore.cjs');
function ypf(names){const idx=Buffer.concat(names.map(n=>Buffer.from(n,'latin1').map(x=>x^0xFF)));return Buffer.concat([Buffer.from('YPF\0','latin1'),Buffer.alloc(28),idx]);}
test('YU-RIS: a Chinese update*.ypf over ysbin is moved aside and put back',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yuris-'));fs.mkdirSync(path.join(dir,'pac'));
 fs.writeFileSync(path.join(dir,'pac','ysbin.ypf'),ypf(['ysbin\\yst00001.ybn']));
 const patch=ypf(['ysbin\\yst00001.ybn','cgsys\\name\\a.png']);fs.writeFileSync(path.join(dir,'update1.ypf'),patch);
 fs.writeFileSync(path.join(dir,'game.exe'),'');
 assert.equal(jr.detect(dir).state,'none','no Chinese patch marker: official update archives stay untouched');
 fs.writeFileSync(path.join(dir,'gamecn1.1.exe'),'');
 const d=jr.detect(dir);assert.equal(d.state,'restorable');assert.equal(d.adapter,'yuris-update');
 assert.equal(jr.apply(dir).applied,1);assert.ok(!fs.existsSync(path.join(dir,'update1.ypf')));assert.equal(jr.detect(dir).state,'applied');
 assert.equal(jr.restore(dir).restored,1);assert.ok(fs.readFileSync(path.join(dir,'update1.ypf')).equals(patch));assert.equal(jr.detect(dir).state,'restorable');
 fs.rmSync(dir,{recursive:true,force:true});
});
